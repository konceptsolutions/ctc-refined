import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Download, Printer, RefreshCw, Scale, CheckCircle2, AlertCircle } from "lucide-react";
import { getCurrentDatePakistan, getStartOfCurrentMonthPakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { openPrintHtml } from "@/utils/printUtils";
import {
  crHeaderClass,
  crValueClass,
  drHeaderClass,
  drValueClass,
  ACCOUNTING_COLORS,
} from "@/utils/accountingColors";

interface TrialBalanceRow {
  type?: 'mainGroup' | 'subgroup' | 'account';
  code?: string;
  accountCode?: string;
  accountName: string;
  name?: string; // For mainGroup and subgroup display
  accountType?: string;
  debit: number;
  credit: number;
}

// Local API URL detection is replaced by apiClient from @/lib/api


export const TrialBalanceTab = () => {
  // Get current date in Pakistan timezone - set From to start of month, To to current date
  const [fromDate, setFromDate] = useState(() => getStartOfCurrentMonthPakistan());
  const [toDate, setToDate] = useState(() => getCurrentDatePakistan());
  const [filterType, setFilterType] = useState("all");
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrialBalance();
  }, [fromDate, toDate, filterType]);

  const fetchTrialBalance = async () => {
    try {
      setLoading(true);
      const params: { [key: string]: any } = {
        from_date: fromDate,
        to_date: toDate,
      };
      if (filterType !== "all") {
        params.type = filterType;
      }

      const result = await apiClient.get<TrialBalanceRow[]>('/accounting/trial-balance', { params });
      if (result.data) {
        setTrialBalanceData(result.data);
      }
    } catch (error) {
      // Error handling is typically done by an interceptor in apiClient or handled here specifically
      console.error("Failed to fetch trial balance:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    const period = `${fromDate} to ${toDate}`;
    const printHTML = `
      <html>
        <head>
          <title>Trial Balance</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .text-right { text-align: right; }
            .col-dr { text-align: right; color: ${ACCOUNTING_COLORS.dr.css}; }
            .col-cr { text-align: right; color: ${ACCOUNTING_COLORS.cr.css}; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>Trial Balance - ${period}</h1>
          <table>
            <thead>
              <tr>
                <th>Account Code</th>
                <th>Account Name</th>
                <th>Type</th>
                <th class="col-dr">Debit (Rs)</th>
                <th class="col-cr">Credit (Rs)</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(row => `
                <tr>
                  <td>${row.accountCode}</td>
                  <td>${row.accountName}</td>
                  <td>${row.accountType}</td>
                  <td class="col-dr">${row.debit > 0 ? row.debit.toLocaleString() : '-'}</td>
                  <td class="col-cr">${row.credit > 0 ? row.credit.toLocaleString() : '-'}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold; background-color: #f4f4f4;">
                <td colspan="3" class="text-right">Total</td>
                <td class="col-dr">${totalDebit.toLocaleString()}</td>
                <td class="col-cr">${totalCredit.toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
          <button onclick="window.print()">Print</button>
        </body>
      </html>
    `;
    openPrintHtml(printHTML);
  };

  const handleExport = () => {
    const csvContent = [
      ["Account Code", "Account Name", "Type", "Debit", "Credit"].join(","),
      ...filteredData.map(row => [
        row.accountCode,
        row.accountName,
        row.accountType,
        row.debit,
        row.credit
      ].join(",")),
      ["", "", "TOTAL", totalDebit, totalCredit].join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trial_balance_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Filter data (already filtered on backend, but keep for safety)
  const filteredData = trialBalanceData;

  // Calculate totals from account rows only (exclude group headers)
  const accountRows = filteredData.filter(row => row.type === 'account' || !row.type);
  const totalDebit = accountRows.reduce((sum, row) => sum + (row.debit || 0), 0);
  const totalCredit = accountRows.reduce((sum, row) => sum + (row.credit || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const difference = Math.abs(totalDebit - totalCredit);

  const getTypeColor = (type: string) => {
    switch (type.toLowerCase()) {
      case "asset": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "liability": return "bg-red-500/10 text-red-600 border-red-500/20";
      case "equity": return "bg-purple-500/10 text-purple-600 border-purple-500/20";
      case "revenue": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "expense": return "bg-primary/10 text-primary border-primary/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-teal-500/10 to-teal-600/5 border-teal-500/20 transition-all duration-300 hover:shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Debits</p>
                <p className={`text-2xl font-bold ${drValueClass(1, true)}`}>Rs {totalDebit.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-teal-500/20 flex items-center justify-center">
                <Scale className={`h-6 w-6 ${drValueClass(1, true)}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20 transition-all duration-300 hover:shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Credits</p>
                <p className={`text-2xl font-bold ${crValueClass(1, true)}`}>Rs {totalCredit.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <Scale className={`h-6 w-6 ${crValueClass(1, true)}`} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${isBalanced ? 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20' : 'from-red-500/10 to-red-600/5 border-red-500/20'} transition-all duration-300 hover:shadow-lg`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className={`text-2xl font-bold ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
                  {isBalanced ? 'Balanced' : 'Unbalanced'}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${isBalanced ? 'bg-emerald-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
                {isBalanced ? (
                  <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                ) : (
                  <AlertCircle className="h-6 w-6 text-red-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20 transition-all duration-300 hover:shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Difference</p>
                <p className="text-2xl font-bold text-purple-600">Rs {difference.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-500/20 flex items-center justify-center">
                <RefreshCw className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              Trial Balance
            </CardTitle>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">From:</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">To:</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-[150px]"
                />
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={fetchTrialBalance}
                className="transition-all duration-200 hover:scale-105"
              >
                Search
              </Button>
              <PrintPdfButton onPrint={handlePrint} label="Print" />
              <Button variant="outline" size="sm" className="transition-all duration-200 hover:scale-105" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-border/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <ListNumberHeader />
                  <TableHead className="font-semibold cursor-pointer hover:text-primary">Account</TableHead>
                  <TableHead className={`text-right font-semibold cursor-pointer hover:text-primary ${drHeaderClass}`}>Dr</TableHead>
                  <TableHead className={`text-right font-semibold cursor-pointer hover:text-primary ${crHeaderClass}`}>Cr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No data found
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {filteredData.map((row, index) => {
                      if (row.type === 'mainGroup') {
                        return (
                          <TableRow key={`main-${row.code}-${index}`} className="bg-muted/30 font-semibold">
                            <TableCell />
                            <TableCell className="font-bold">{row.name}</TableCell>
                            <TableCell className={`text-right font-mono ${drValueClass(0)}`}>0</TableCell>
                            <TableCell className={`text-right font-mono ${crValueClass(0)}`}>0</TableCell>
                          </TableRow>
                        );
                      } else if (row.type === 'subgroup') {
                        return (
                          <TableRow key={`sub-${row.code}-${index}`} className="bg-muted/20 font-medium">
                            <TableCell />
                            <TableCell className="pl-4">{row.name}</TableCell>
                            <TableCell className={`text-right font-mono ${drValueClass(0)}`}>0</TableCell>
                            <TableCell className={`text-right font-mono ${crValueClass(0)}`}>0</TableCell>
                          </TableRow>
                        );
                      } else {
                        return (
                          <TableRow
                            key={`acc-${row.accountCode}-${index}`}
                            className="transition-all duration-200 hover:bg-muted/50"
                          >
                            <ListNumberCell index={index} total={filteredData.length} />
                            <TableCell className="pl-8 font-medium">{row.accountName}</TableCell>
                            <TableCell className={`text-right font-mono ${drValueClass(row.debit)}`}>
                              {row.debit > 0 ? row.debit.toLocaleString() : '0'}
                            </TableCell>
                            <TableCell className={`text-right font-mono ${crValueClass(row.credit)}`}>
                              {row.credit > 0 ? row.credit.toLocaleString() : '0'}
                            </TableCell>
                          </TableRow>
                        );
                      }
                    })}
                    {/* Total Row */}
                    <TableRow className="bg-primary/5 font-bold border-t-2 border-primary/20">
                      <TableCell />
                      <TableCell className="text-right">Total</TableCell>
                      <TableCell className={`text-right font-mono ${drValueClass(1, true)}`}>{totalDebit.toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-mono ${crValueClass(1, true)}`}>{totalCredit.toLocaleString()}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Balance Status */}
      {!loading && filteredData.length > 0 && (
        <Card className={`border-2 ${isBalanced ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              {isBalanced ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="font-medium text-emerald-600">
                    Trial Balance is balanced - Debits equal Credits
                  </span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-600">
                    Trial Balance is not balanced. Difference: Rs {difference.toLocaleString()}
                  </span>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
