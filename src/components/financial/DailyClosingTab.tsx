import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getCurrentDatePakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { FileText, ChevronsUpDown, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type DailyClosingColumn = {
  id: string;
  code: string;
  name: string;
  accountType: "cash" | "bank";
};

type DailyClosingMatrixRow = {
  serialNo: number;
  voucherNumber: string;
  description: string;
  amounts: Record<string, number>;
};

type DailyClosingAccountOption = {
  id: string;
  code: string;
  name: string;
  label: string;
  subgroupName: string;
};

type DailyClosingData = {
  date: string;
  columns: DailyClosingColumn[];
  openingBalances: Record<string, number>;
  receipts: DailyClosingMatrixRow[];
  payments: DailyClosingMatrixRow[];
  totalReceipts: Record<string, number>;
  totalPayments: Record<string, number>;
  closingBalances: Record<string, number>;
  totals: {
    openingBalance: number;
    receipts: number;
    payments: number;
    closingBalance: number;
  };
};

const formatMoney = (value: number) => {
  const num = Number(value || 0);
  if (num === 0) return "0";
  return num.toLocaleString("en-PK", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
};

const amountCell = (columns: DailyClosingColumn[], amounts: Record<string, number>) =>
  columns.map((column) => {
    const value = Number(amounts[column.id] || 0);
    return (
      <TableCell
        key={column.id}
        className={cn(
          "text-right tabular-nums whitespace-nowrap min-w-[100px]",
          value === 0 && "text-muted-foreground/50",
        )}
      >
        {value === 0 ? "0" : formatMoney(value)}
      </TableCell>
    );
  });

const balanceRow = (
  columns: DailyClosingColumn[],
  label: string,
  values: Record<string, number>,
  bold = false,
) => (
  <TableRow className={cn(bold && "bg-muted/30 font-semibold")}>
    <TableCell />
    <TableCell />
    <TableCell />
    <TableCell className={cn("whitespace-nowrap", bold && "font-semibold")}>{label}</TableCell>
    {columns.map((column) => {
      const value = Number(values[column.id] || 0);
      return (
        <TableCell
          key={column.id}
          className={cn(
            "text-right tabular-nums whitespace-nowrap min-w-[100px]",
            bold && "font-semibold",
          )}
        >
          {formatMoney(value)}
        </TableCell>
      );
    })}
  </TableRow>
);

const sectionHeaderRow = (columns: DailyClosingColumn[], title: string) => (
  <TableRow className="bg-slate-100 dark:bg-slate-800">
    <TableCell colSpan={4 + columns.length} className="font-bold text-center">
      {title}
    </TableCell>
  </TableRow>
);

const buildPrintHtml = (data: DailyClosingData) => {
  const headerCells = data.columns
    .map(
      (col) =>
        `<th style="min-width:90px;text-align:right;font-size:10px;white-space:nowrap;">${col.name}</th>`,
    )
    .join("");

  const valueCells = (
    values: Record<string, number>,
    bold = false,
  ) =>
    data.columns
      .map((col) => {
        const value = Number(values[col.id] || 0);
        return `<td style="text-align:right;${bold ? "font-weight:700;" : ""}">${formatMoney(value)}</td>`;
      })
      .join("");

  const txnRows = (rows: DailyClosingMatrixRow[]) =>
    rows.length === 0
      ? `<tr><td colspan="${3 + data.columns.length}" style="text-align:center;color:#666;">—</td></tr>`
      : rows
          .map(
            (row) => `
      <tr>
        <td style="text-align:center;">${row.serialNo}</td>
        <td>${row.voucherNumber}</td>
        <td>${row.description}</td>
        ${data.columns
          .map((col) => {
            const value = Number(row.amounts[col.id] || 0);
            return `<td style="text-align:right;">${value === 0 ? "0" : formatMoney(value)}</td>`;
          })
          .join("")}
      </tr>`,
          )
          .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <title>Daily Closing - ${data.date}</title>
  <style>
    @page { size: landscape; margin: 10mm; }
    body { font-family: Arial, sans-serif; padding: 12px; color: #111; font-size: 11px; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    .subtitle { color: #666; font-size: 11px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e3a8a; color: #fff; padding: 6px 4px; border: 1px solid #cbd5e1; }
    td { border: 1px solid #cbd5e1; padding: 4px 6px; vertical-align: top; }
    .section td { background: #e2e8f0; font-weight: 700; text-align: center; }
    .summary td { background: #f8fafc; font-weight: 700; }
  </style>
</head>
<body>
  <h1>Daily Closing — Cash &amp; Bank</h1>
  <p class="subtitle">Date: ${data.date} · Printed ${new Date().toLocaleString()}</p>
  <table>
    <thead>
      <tr>
        <th style="width:40px;">S no</th>
        <th style="width:70px;">V no</th>
        <th style="min-width:200px;text-align:left;">Desc</th>
        ${headerCells}
      </tr>
    </thead>
    <tbody>
      <tr class="summary">
        <td></td><td></td>
        <td style="text-align:right;">Opening Balances:</td>
        ${valueCells(data.openingBalances, true)}
      </tr>
      <tr class="section"><td colspan="${3 + data.columns.length}">Receipts</td></tr>
      ${txnRows(data.receipts)}
      <tr class="summary">
        <td></td><td></td>
        <td style="text-align:right;">Total Receipts:</td>
        ${valueCells(data.totalReceipts, true)}
      </tr>
      <tr class="section"><td colspan="${3 + data.columns.length}">Payments</td></tr>
      ${txnRows(data.payments)}
      <tr class="summary">
        <td></td><td></td>
        <td style="text-align:right;">Total Payments:</td>
        ${valueCells(data.totalPayments, true)}
      </tr>
      <tr class="summary">
        <td></td><td></td>
        <td style="text-align:right;">Closing Balances:</td>
        ${valueCells(data.closingBalances, true)}
      </tr>
    </tbody>
  </table>
</body>
</html>`;
};

export const DailyClosingTab = ({
  date: controlledDate,
  hideDatePicker = false,
}: {
  date?: string;
  hideDatePicker?: boolean;
} = {}) => {
  const [internalDate, setInternalDate] = useState(getCurrentDatePakistan());
  const closingDate = controlledDate ?? internalDate;
  const setClosingDate = (value: string) => {
    if (controlledDate === undefined) {
      setInternalDate(value);
    }
  };
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accountOptions, setAccountOptions] = useState<DailyClosingAccountOption[]>([]);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const [data, setData] = useState<DailyClosingData | null>(null);
  const [loading, setLoading] = useState(false);

  const accountFilterLabel = (() => {
    if (selectedAccountIds.length === 0) return "All accounts";
    if (selectedAccountIds.length === 1) {
      const match = accountOptions.find((account) => account.id === selectedAccountIds[0]);
      return match?.label || "1 account selected";
    }
    return `${selectedAccountIds.length} accounts selected`;
  })();

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId)
        ? prev.filter((id) => id !== accountId)
        : [...prev, accountId],
    );
  };

  const selectAllAccounts = () => {
    setSelectedAccountIds(accountOptions.map((account) => account.id));
  };

  const clearAccountSelection = () => {
    setSelectedAccountIds([]);
  };

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const result = await apiClient.getDailyClosingAccounts();
        const rows = Array.isArray((result as any)?.data) ? (result as any).data : [];
        setAccountOptions(rows as DailyClosingAccountOption[]);
      } catch {
        setAccountOptions([]);
      }
    };
    void loadAccounts();
  }, []);

  const fetchDailyClosing = useCallback(async () => {
    if (!closingDate) {
      toast.error("Please select a closing date");
      return;
    }

    try {
      setLoading(true);
      const result = await apiClient.getDailyClosing({
        date: closingDate,
        account_ids: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
      });
      if (result.error) {
        toast.error(result.error || "Failed to load daily closing");
        setData(null);
        return;
      }
      setData((result.data || null) as DailyClosingData | null);
    } catch {
      toast.error("Failed to load daily closing");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [closingDate, selectedAccountIds]);

  useEffect(() => {
    void fetchDailyClosing();
  }, [fetchDailyClosing]);

  const handlePrint = () => {
    if (!data) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Allow pop-ups to print the report");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(data));
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const columns = data?.columns || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {!hideDatePicker ? (
              <div className="space-y-2">
                <Label htmlFor="daily-closing-date">Closing Date</Label>
                <Input
                  id="daily-closing-date"
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-44"
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label>Accounts</Label>
              <Popover open={accountsOpen} onOpenChange={setAccountsOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={accountsOpen}
                    className="w-[320px] justify-between font-normal"
                  >
                    <span className="truncate">{accountFilterLabel}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[320px] p-0" align="start">
                  <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={selectAllAccounts}
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={clearAccountSelection}
                    >
                      Clear (show all)
                    </Button>
                  </div>
                  <div className="max-h-64 overflow-y-auto p-2 space-y-1">
                    {accountOptions.length === 0 ? (
                      <p className="px-2 py-3 text-sm text-muted-foreground">
                        No cash or bank accounts found.
                      </p>
                    ) : (
                      accountOptions.map((account) => {
                        const checked = selectedAccountIds.includes(account.id);
                        return (
                          <label
                            key={account.id}
                            className="flex items-start gap-2 rounded-md px-2 py-2 hover:bg-accent cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleAccountSelection(account.id)}
                              className="mt-0.5"
                            />
                            <span className="text-sm leading-snug">{account.label}</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <Button variant="outline" onClick={() => void fetchDailyClosing()} disabled={loading}>
              {loading ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Refresh
            </Button>
            <Button variant="outline" onClick={handlePrint} disabled={!data || loading}>
              <FileText className="w-4 h-4 mr-1" />
              Print PDF
            </Button>
          </div>

          {data && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Opening</p>
                  <p className="text-base font-bold tabular-nums">
                    Rs {formatMoney(data.totals.openingBalance)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Receipts</p>
                  <p className="text-base font-bold tabular-nums text-green-700">
                    Rs {formatMoney(data.totals.receipts)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-red-500/20 bg-red-500/5">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Payments</p>
                  <p className="text-base font-bold tabular-nums text-red-700">
                    Rs {formatMoney(data.totals.payments)}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-blue-500/20 bg-blue-500/5">
                <CardContent className="p-3">
                  <p className="text-xs text-muted-foreground">Closing</p>
                  <p className="text-base font-bold tabular-nums text-blue-700">
                    Rs {formatMoney(data.totals.closingBalance)}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
          Loading daily closing...
        </div>
      ) : data && columns.length > 0 ? (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#1e3a8a] hover:bg-[#1e3a8a]">
                <ListNumberHeader className="text-white" />
                <TableHead className="text-white w-20">V no</TableHead>
                <TableHead className="text-white min-w-[220px]">Desc</TableHead>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className="text-white text-right min-w-[100px] whitespace-nowrap text-xs"
                  >
                    {column.name}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceRow(columns, "Opening Balances:", data.openingBalances, true)}

              {sectionHeaderRow(columns, "Receipts")}
              {data.receipts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + columns.length} className="text-center text-muted-foreground">
                    No receipts for this date
                  </TableCell>
                </TableRow>
              ) : (
                data.receipts.map((row, index) => (
                  <TableRow key={`r-${row.serialNo}-${row.voucherNumber}`}>
                    <ListNumberCell index={index} />
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.voucherNumber}
                    </TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    {amountCell(columns, row.amounts)}
                  </TableRow>
                ))
              )}
              {balanceRow(columns, "Total Receipts:", data.totalReceipts, true)}

              {sectionHeaderRow(columns, "Payments")}
              {data.payments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4 + columns.length} className="text-center text-muted-foreground">
                    No payments for this date
                  </TableCell>
                </TableRow>
              ) : (
                data.payments.map((row, index) => (
                  <TableRow key={`p-${row.serialNo}-${row.voucherNumber}`}>
                    <ListNumberCell index={index} />
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {row.voucherNumber}
                    </TableCell>
                    <TableCell className="text-sm">{row.description}</TableCell>
                    {amountCell(columns, row.amounts)}
                  </TableRow>
                ))
              )}
              {balanceRow(columns, "Total Payments:", data.totalPayments, true)}
              {balanceRow(columns, "Closing Balances:", data.closingBalances, true)}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No cash or bank accounts found for the selected date.
        </div>
      )}
    </div>
  );
};
