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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Printer, Search, Download } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { formatUiDate } from "@/utils/dateUtils";
import { exportToCSV } from "@/utils/exportUtils";

interface SupplierRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  supplierId: string;
  supplierName: string;
  supplierCode: string | null;
  supplierType: string | null;
  balance: number;
}

const SupplierPayableTab = () => {
  const today = new Date().toISOString().split("T")[0];
  const [toDate, setToDate] = useState(today);
  const [rows, setRows] = useState<SupplierRow[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const fetchData = async () => {
    if (!toDate) {
      toast.error("Please select an As-of date.");
      return;
    }
    setLoading(true);
    try {
      const res: any = await apiClient.getSupplierPayableReport({ to_date: toDate });
      setRows(res.data || []);
      setTotalBalance(res.totalBalance || 0);
      setAsOf(res.asOf || null);
    } catch {
      toast.error("Failed to fetch Supplier Payable report.");
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const html = `<!DOCTYPE html>
<html>
<head>
<title>Supplier Payable Report</title>
<style>
  body { font-family: Arial, sans-serif; padding: 24px; font-size: 13px; }
  h2 { margin: 0 0 4px 0; }
  p { margin: 0 0 16px 0; color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  td.num { text-align: right; }
  tfoot td { font-weight: 700; background: #f9f9f9; }
</style>
</head>
<body>
${printRef.current.innerHTML}
</body>
</html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    win.close();
  };

  const handleExport = () => {
    if (!rows.length) return;
    const headers = ["#", "Supplier Code", "Supplier", "Account Code", "Account Name", "Type", "Balance (PKR)"];
    exportToCSV(
      rows.map((r, i) => [
        i + 1,
        r.supplierCode || "",
        r.supplierName,
        r.accountCode,
        r.accountName,
        r.supplierType || "",
        r.balance.toFixed(2),
      ]),
      headers,
      `supplier-payable-${toDate}`
    );
  };

  const fmt = (n: number) =>
    n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Supplier Payable Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="sp-todate">As of Date</Label>
              <Input
                id="sp-todate"
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
        </CardContent>
      </Card>

      {/* Table */}
      {rows.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            {/* Hidden print content */}
            <div ref={printRef} className="hidden">
              <h2>Supplier Payable Report</h2>
              <p>As of: {asOf ? formatUiDate(asOf) || toDate : toDate}</p>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Supplier Code</th>
                    <th>Supplier</th>
                    <th>Account</th>
                    <th>Type</th>
                    <th style={{ textAlign: "right" }}>Balance (PKR)</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.accountId}>
                      <td>{i + 1}</td>
                      <td>{r.supplierCode}</td>
                      <td>{r.supplierName}</td>
                      <td>{r.accountCode} – {r.accountName}</td>
                      <td>{r.supplierType}</td>
                      <td className="num">{fmt(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>Total</td>
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
                    <TableHead>Supplier Code</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Balance (PKR)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={r.accountId}>
                      <ListNumberCell index={i} />
                      <TableCell>{r.supplierCode}</TableCell>
                      <TableCell className="font-medium">{r.supplierName}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {r.accountCode} – {r.accountName}
                      </TableCell>
                      <TableCell>{r.supplierType}</TableCell>
                      <TableCell className="text-right font-mono">
                        {fmt(r.balance)}
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
                  <span className="text-muted-foreground">Total Payable</span>
                  <span className="font-semibold font-mono">{fmt(totalBalance)}</span>
                </div>
                <div className="text-xs text-muted-foreground text-right">
                  As of {asOf ? formatUiDate(asOf) || toDate : toDate}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {rows.length === 0 && !loading && asOf && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No payable balances found for the selected date.
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SupplierPayableTab;
