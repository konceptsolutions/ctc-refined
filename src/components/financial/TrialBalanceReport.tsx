import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Download, Printer } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { getCurrentDatePakistan, getStartOfCurrentMonthPakistan } from "@/utils/dateUtils";

interface TrialBalanceAccount {
  code: string;
  name: string;
  debit: number;
  credit: number;
  isSubgroup?: boolean;
  level?: number;
}

export const TrialBalanceReport = () => {
  const { toast } = useToast();
  // Get current date in Pakistan timezone - set From to start of month, To to current date
  const [fromDate, setFromDate] = useState(() => getStartOfCurrentMonthPakistan());
  const [toDate, setToDate] = useState(() => getCurrentDatePakistan());
  const [trialBalanceData, setTrialBalanceData] = useState<TrialBalanceAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTrialBalance = async () => { 
    setLoading(true);
    try {
      const response = await apiClient.getTrialBalance({
        from_date: fromDate,
        to_date: toDate
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive"
        });
        return;
      }

      if (response.data) {
        setTrialBalanceData(response.data);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch trial balance",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrialBalance();
  }, []);

  const handleSearch = () => {
    fetchTrialBalance();
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-PK');
  };

  // Calculate totals - only include account entries (not subgroup/main group headers)
  const totalDebit = trialBalanceData
    .filter(acc => !acc.isSubgroup)
    .reduce((sum, acc) => sum + acc.debit, 0);
  const totalCredit = trialBalanceData
    .filter(acc => !acc.isSubgroup)
    .reduce((sum, acc) => sum + acc.credit, 0);

  const getIndent = (level: number = 0) => {
    return { paddingLeft: `${(level + 1) * 16}px` };
  };

  const handleExportCSV = () => {
    const headers = ["Account Code", "Account Name", "Debit", "Credit"];
    const csvContent = [
      headers.join(","),
      ...trialBalanceData.map(acc => [
        acc.code,
        acc.name,
        acc.debit,
        acc.credit
      ].join(",")),
      `TOTAL,,${totalDebit},${totalCredit}`
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `trial_balance_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "Trial Balance exported to CSV successfully."
    });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Please allow popups to print the report",
        variant: "destructive"
      });
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Trial Balance</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h1>Trial Balance</h1>
          <p>Period: ${fromDate} to ${toDate}</p>
          <table>
            <thead>
              <tr>
                <th>Account</th>
                <th class="text-right">Dr</th>
                <th class="text-right">Cr</th>
              </tr>
            </thead>
            <tbody>
              ${trialBalanceData.map(acc => `
                <tr>
                  <td>${acc.code}-${acc.name}</td>
                  <td class="text-right">${formatNumber(acc.debit)}</td>
                  <td class="text-right">${formatNumber(acc.credit)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td>Total</td>
                <td class="text-right">${formatNumber(totalDebit)}</td>
                <td class="text-right">${formatNumber(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-destructive" />
            Trial Balance
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter */}
        <div>
          <p className="text-sm font-medium mb-2">Filter</p>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label>To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
              />
            </div>
            <Button onClick={handleSearch} disabled={loading}>
              Search
            </Button>
          </div>
        </div>

        {/* Trial Balance Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold underline w-1/2">Account</TableHead>
                <TableHead className="font-semibold underline text-right">Dr</TableHead>
                <TableHead className="font-semibold underline text-right">Cr</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : trialBalanceData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    No data found
                  </TableCell>
                </TableRow>
              ) : (
                trialBalanceData.map((account, index) => (
                <TableRow 
                  key={index} 
                  className={`${account.isSubgroup ? 'bg-muted/20' : 'hover:bg-muted/30'}`}
                >
                  <TableCell 
                    className={account.isSubgroup ? 'font-medium' : ''}
                    style={getIndent(account.level || 0)}
                  >
                    {account.code}-{account.name}
                  </TableCell>
                  <TableCell className="text-right text-primary">
                    {formatNumber(account.debit)}
                  </TableCell>
                  <TableCell className="text-right text-primary">
                    {formatNumber(account.credit)}
                  </TableCell>
                </TableRow>
              )))}
              {/* Total Row */}
              <TableRow className="bg-muted/40 font-bold">
                <TableCell className="text-right">Total</TableCell>
                <TableCell className="text-right">{formatNumber(totalDebit)}</TableCell>
                <TableCell className="text-right">{formatNumber(totalCredit)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
