import { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Printer, Search, Download, Phone, CreditCard, BookOpen, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface CustomerRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  customerId: string;
  customerName: string;
  customerCode: string | null;
  phone: string | null;
  creditLimit: number;
  balance: number;
}

interface LedgerEntry {
  id: number;
  voucherNo: string;
  /** Already formatted as DD/MM/YYYY by backend */
  timeStamp: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
}

interface LedgerDialog {
  open: boolean;
  customer: CustomerRow | null;
  entries: LedgerEntry[];
  loading: boolean;
}

/** Backend returns dates as "DD/MM/YYYY" — parse safely */
function parseBackendDate(str: string): Date | null {
  if (!str || str === "-") return null;
  const parts = str.split("/");
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    if (!isNaN(dt.getTime())) return dt;
  }
  // fallback for ISO strings
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

function displayDate(str: string): string {
  const d = parseBackendDate(str);
  return d ? d.toLocaleDateString() : str || "—";
}

const CustomerReceivableTab = () => {
  const today = new Date().toISOString().split("T")[0];
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const [fromDate, setFromDate] = useState(yearStart);
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const [ledger, setLedger] = useState<LedgerDialog>({
    open: false,
    customer: null,
    entries: [],
    loading: false,
  });

  const fetchData = async () => {
    if (!toDate) {
      toast.error("Please select an As-of date.");
      return;
    }
    setLoading(true);
    try {
      const res: any = await apiClient.getCustomerReceivableReport({ to_date: toDate });
      setRows(res.data || []);
      setTotalBalance(res.totalBalance || 0);
      setAsOf(res.asOf || null);
    } catch {
      toast.error("Failed to fetch Customer Receivable report.");
    } finally {
      setLoading(false);
    }
  };

  const openLedger = async (row: CustomerRow) => {
    setLedger({ open: true, customer: row, entries: [], loading: true });
    try {
      const res: any = await apiClient.getLedgers({
        account: row.accountId,
        from_date: fromDate || yearStart,
        to_date: toDate || today,
        limit: 10000,
      });
      setLedger((prev) => ({
        ...prev,
        entries: res.data || [],
        loading: false,
      }));
    } catch {
      toast.error("Failed to load ledger.");
      setLedger((prev) => ({ ...prev, loading: false }));
    }
  };

  const closeLedger = () =>
    setLedger({ open: false, customer: null, entries: [], loading: false });

  const handlePrintLedger = () => {
    if (!ledger.customer) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const rowsHtml = ledger.entries
      .map(
        (e, i) => `<tr>
        <td>${i + 1}</td>
        <td>${e.voucherNo}</td>
        <td>${displayDate(e.timeStamp)}</td>
        <td>${e.description}</td>
        <td class="num">${e.debit != null ? fmt(e.debit) : "—"}</td>
        <td class="num">${e.credit != null ? fmt(e.credit) : "—"}</td>
        <td class="num">${fmt(e.balance)}</td>
      </tr>`
      )
      .join("");
    const html = `<!DOCTYPE html><html><head><title>Ledger – ${ledger.customer.customerName}</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;font-size:12px;}
  h2{margin:0 0 2px 0;}p{margin:0 0 14px 0;color:#555;font-size:11px;}
  table{width:100%;border-collapse:collapse;}
  th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
  th{background:#f0f0f0;font-weight:600;}td.num{text-align:right;}
  tfoot td{font-weight:700;background:#f9f9f9;}
</style></head><body>
<h2>Customer Ledger – ${ledger.customer.customerName}</h2>
<p>Account: ${ledger.customer.accountCode} – ${ledger.customer.accountName}
&nbsp;|&nbsp; From: ${fromDate} &nbsp;To: ${toDate}</p>
<table><thead><tr><th>#</th><th>Voucher No</th><th>Date</th><th>Description</th>
<th style="text-align:right">Debit</th><th style="text-align:right">Credit</th>
<th style="text-align:right">Balance</th></tr></thead>
<tbody>${rowsHtml}</tbody></table></body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `<!DOCTYPE html>
<html><head><title>Customer Receivable Report</title>
<style>
  body{font-family:Arial,sans-serif;padding:24px;font-size:13px;}
  h2{margin:0 0 4px 0;}p{margin:0 0 16px 0;color:#555;font-size:12px;}
  table{width:100%;border-collapse:collapse;}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;}
  th{background:#f0f0f0;font-weight:600;}td.num{text-align:right;}
  tfoot td{font-weight:700;background:#f9f9f9;}
</style></head>
<body>${printRef.current.innerHTML}</body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleExport = () => {
    if (!rows.length) return;
    const headers = ["#", "Customer Code", "Customer", "Account Code", "Account Name", "Phone/Mobile", "Credit Limit", "Balance (PKR)"];
    exportToCSV(
      rows.map((r, i) => [
        i + 1,
        r.customerCode || "",
        r.customerName,
        r.accountCode,
        r.accountName,
        r.phone || "",
        r.creditLimit.toFixed(2),
        r.balance.toFixed(2),
      ]),
      headers,
      `customer-receivable-${toDate}`
    );
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const fmtEntry = (n: number | null) =>
    n == null ? "—" : n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Receivable Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="cr-fromdate">From Date</Label>
              <Input
                id="cr-fromdate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cr-todate">To Date</Label>
              <Input
                id="cr-todate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={fetchData} disabled={loading}>
              <Search className="w-4 h-4 mr-2" />
              {loading ? "Loading…" : "Generate"}
            </Button>
            {rows.length > 0 && (
              <>
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2" /> Print
                </Button>
                <Button variant="outline" onClick={handleExport}>
                  <Download className="w-4 h-4 mr-2" /> Export CSV
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Balances shown are as of the <strong>To Date</strong>. The date range is used for the ledger drill-down.
          </p>
        </CardContent>
      </Card>

      {/* Table */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            {/* Hidden print content */}
            <div ref={printRef} className="hidden">
              <h2>Customer Receivable Report</h2>
              <p>As of: {asOf ? new Date(asOf).toLocaleDateString() : toDate}</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Customer Code</th>
                    <th>Customer</th>
                    <th>Account</th>
                    <th>Phone/Mobile</th>
                    <th style={{ textAlign: "right" }}>Credit Limit</th>
                    <th style={{ textAlign: "right" }}>Balance (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.accountId}>
                      <td>{i + 1}</td>
                      <td>{r.customerCode}</td>
                      <td>{r.customerName}</td>
                      <td>{r.accountCode} – {r.accountName}</td>
                      <td>{r.phone || "—"}</td>
                      <td className="num">{fmt(r.creditLimit)}</td>
                      <td className="num">{fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6}>Total</td>
                    <td className="num">{fmt(totalBalance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Screen table */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <ListNumberHeader />
                    <TableHead>Customer Code</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone/Mobile
                      </span>
                    </TableHead>
                    <TableHead className="text-right">
                      <span className="flex items-center justify-end gap-1">
                        <CreditCard className="w-3 h-3" /> Credit Limit
                      </span>
                    </TableHead>
                    <TableHead className="text-right">Balance (PKR)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.accountId}>
                      <ListNumberCell index={i} />
                      <TableCell>{r.customerCode}</TableCell>
                      <TableCell className="font-medium">{r.customerName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.accountCode} – {r.accountName}
                      </TableCell>
                      <TableCell>{r.phone || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.creditLimit)}</TableCell>
                      <TableCell className="text-right font-mono">{fmt(r.balance)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs"
                          onClick={() => openLedger(r)}
                        >
                          <BookOpen className="w-3.5 h-3.5" />
                          Ledger
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Summary */}
            <div className="mt-4 flex justify-end">
              <div className="border rounded-lg px-6 py-3 bg-muted/40 text-sm space-y-1 min-w-48">
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">Total Receivable</span>
                  <span className="font-semibold font-mono">{fmt(totalBalance)}</span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  As of {asOf ? new Date(asOf).toLocaleDateString() : toDate}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && !loading && asOf && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No receivable balances found for the selected date.
          </CardContent>
        </Card>
      )}

      {/* Ledger Dialog */}
      <Dialog open={ledger.open} onOpenChange={(o) => !o && closeLedger()}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <DialogTitle className="text-base">
                  Ledger — {ledger.customer?.customerName}
                </DialogTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {ledger.customer?.accountCode} – {ledger.customer?.accountName}
                  &nbsp;·&nbsp; {fromDate} to {toDate}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {ledger.customer && (
                  <>
                    {ledger.customer.phone && (
                      <Badge variant="secondary" className="gap-1">
                        <Phone className="w-3 h-3" />
                        {ledger.customer.phone}
                      </Badge>
                    )}
                    <Badge variant="outline" className="gap-1">
                      <CreditCard className="w-3 h-3" />
                      Limit: {fmt(ledger.customer.creditLimit)}
                    </Badge>
                    <Badge className="gap-1">
                      Balance: {fmt(ledger.customer.balance)}
                    </Badge>
                  </>
                )}
                <Button size="sm" variant="outline" onClick={handlePrintLedger} disabled={ledger.loading}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Print
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto mt-2">
            {ledger.loading ? (
              <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                <Loader2 className="w-5 h-5 animate-spin" /> Loading ledger…
              </div>
            ) : ledger.entries.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-sm">
                No ledger entries found for this period.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <ListNumberHeader />
                    <TableHead>Voucher No</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right text-green-700 dark:text-green-400">Debit</TableHead>
                    <TableHead className="text-right text-red-600 dark:text-red-400">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledger.entries.map((e, i) => (
                    <TableRow key={e.id ?? i}>
                      <ListNumberCell index={i} />
                      <TableCell className="font-mono text-xs">{e.voucherNo}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {displayDate(e.timeStamp)}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">{e.description}</TableCell>
                      <TableCell className="text-right font-mono text-xs text-green-700 dark:text-green-400">
                        {fmtEntry(e.debit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-red-600 dark:text-red-400">
                        {fmtEntry(e.credit)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-medium">
                        {fmt(e.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CustomerReceivableTab;
