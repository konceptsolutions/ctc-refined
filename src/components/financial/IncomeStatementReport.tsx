import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Users, Download } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printIncomeStatement } from "@/utils/printIncomeStatementPdf";

interface IncomeAccount {
  code: string;
  name: string;
  amount: number;
  isSubgroup?: boolean;
  isTotalRow?: boolean;
  level?: number;
}

export const IncomeStatementReport = () => {
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split("T")[0],
  );
  const [toDate, setToDate] = useState(new Date().toISOString().split("T")[0]);
  const [revenueAccounts, setRevenueAccounts] = useState<IncomeAccount[]>([]);
  const [costAccounts, setCostAccounts] = useState<IncomeAccount[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<IncomeAccount[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchIncomeStatement = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getIncomeStatement({
        from_date: fromDate,
        to_date: toDate,
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }

      if (response.data) {
        const data = response.data as any;
        setRevenueAccounts(data.revenue || []);
        setCostAccounts(data.cost || []);
        setExpenseAccounts(data.expenses || []);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch income statement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomeStatement();
  }, []);

  const handleSearch = () => {
    fetchIncomeStatement();
  };

  const formatNumber = (num: number) => {
    return num.toLocaleString("en-PK");
  };

  // Calculate totals
  const totalRevenue = revenueAccounts.reduce(
    (sum, acc) => sum + acc.amount,
    0,
  );
  const totalCost = costAccounts.reduce((sum, acc) => sum + acc.amount, 0);
  const grossProfit = totalRevenue - totalCost;
  const totalExpenses = expenseAccounts.reduce(
    (sum, acc) => sum + acc.amount,
    0,
  );
  const netIncome = grossProfit - totalExpenses;

  const getIndent = (level: number = 0) => {
    return { paddingLeft: `${(level + 1) * 16}px` };
  };

  const handleExportCSV = () => {
    const rows = [];
    rows.push({ category: "REVENUE", item: "", amount: "" });
    revenueAccounts.forEach((acc) => {
      rows.push({
        category: "",
        item: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      });
    });
    rows.push({ category: "Total Revenue", item: "", amount: totalRevenue });
    rows.push({ category: "", item: "", amount: "" });
    rows.push({ category: "COST OF GOODS SOLD", item: "", amount: "" });
    costAccounts.forEach((acc) => {
      rows.push({
        category: "",
        item: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      });
    });
    rows.push({ category: "Total Cost", item: "", amount: totalCost });
    rows.push({
      category: grossProfit >= 0 ? "Gross Profit" : "Gross Loss",
      item: "",
      amount: Math.abs(grossProfit),
    });
    rows.push({ category: "", item: "", amount: "" });
    rows.push({ category: "EXPENSES", item: "", amount: "" });
    expenseAccounts.forEach((acc) => {
      rows.push({
        category: "",
        item: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      });
    });
    rows.push({ category: "Total Expenses", item: "", amount: totalExpenses });
    rows.push({
      category: netIncome >= 0 ? "NET INCOME" : "NET LOSS",
      item: "",
      amount: Math.abs(netIncome),
    });

    const csvContent = [
      "Category,Item,Amount",
      ...rows.map((row) => `"${row.category}","${row.item}",${row.amount}`),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `income_statement_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "Income Statement exported to CSV successfully.",
    });
  };

  const handlePrint = () => {
    const opened = printIncomeStatement({
      fromDate,
      toDate,
      revenue: revenueAccounts.map((acc) => ({
        label: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      })),
      cost: costAccounts.map((acc) => ({
        label: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      })),
      expenses: expenseAccounts.map((acc) => ({
        label: `${acc.code}-${acc.name}`,
        amount: acc.amount,
      })),
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses,
      netIncome,
    });

    if (!opened) {
      toast({
        title: "Error",
        description: "Please allow popups to print the report",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5 text-destructive" />
            Income Statement
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <PrintPdfButton onPrint={handlePrint} label="Print PDF" disabled={loading} />
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

        {/* Income Statement Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableBody>
              {/* Header */}
              <TableRow className="bg-muted/50">
                <ListNumberHeader className="font-semibold underline" />
                <TableHead className="font-semibold underline w-3/4">
                  Account
                </TableHead>
                <TableHead className="font-semibold underline text-right">
                  Amount
                </TableHead>
              </TableRow>

              {/* Revenue Section */}
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {revenueAccounts.map((account, index) => (
                    <TableRow
                      key={`rev-${index}`}
                      className="hover:bg-muted/30"
                    >
                      <ListNumberCell index={index} total={revenueAccounts.length} />
                      <TableCell style={getIndent(account.level || 0)}>
                        {account.code}-{account.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(account.amount)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Revenue */}
                  <TableRow className="bg-muted/20">
                    <TableCell />
                    <TableCell className="text-right font-semibold">
                      Total Revenue
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNumber(totalRevenue)}
                    </TableCell>
                  </TableRow>

                  {/* Empty row for spacing */}
                  <TableRow>
                    <TableCell colSpan={3} className="py-2"></TableCell>
                  </TableRow>

                  {/* Cost of Goods Sold Section */}
                  {costAccounts.map((account, index) => (
                    <TableRow
                      key={`cost-${index}`}
                      className="hover:bg-muted/30"
                    >
                      <ListNumberCell index={index} total={costAccounts.length} />
                      <TableCell style={getIndent(account.level || 0)}>
                        {account.code}-{account.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(account.amount)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Cost */}
                  <TableRow className="bg-muted/20">
                    <TableCell />
                    <TableCell className="text-right font-semibold">
                      Total Cost
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNumber(totalCost)}
                    </TableCell>
                  </TableRow>

                  {/* Gross Profit/Loss */}
                  <TableRow className="bg-muted/30">
                    <TableCell />
                    <TableCell className="text-right font-bold">
                      {grossProfit >= 0 ? "Gross Profit" : "Gross Loss"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold ${grossProfit >= 0 ? "text-green-600" : "text-destructive"}`}
                    >
                      {grossProfit < 0 ? "-" : ""}
                      {formatNumber(Math.abs(grossProfit))}
                    </TableCell>
                  </TableRow>

                  {/* Empty row for spacing */}
                  <TableRow>
                    <TableCell colSpan={3} className="py-2"></TableCell>
                  </TableRow>

                  {/* Operating Expenses Section */}
                  {expenseAccounts.map((account, index) => (
                    <TableRow
                      key={`exp-${index}`}
                      className="hover:bg-muted/30"
                    >
                      <ListNumberCell index={index} total={expenseAccounts.length} />
                      <TableCell style={getIndent(account.level || 0)}>
                        {account.code}-{account.name}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumber(account.amount)}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Total Expenses */}
                  <TableRow className="bg-muted/20">
                    <TableCell />
                    <TableCell className="text-right font-semibold">
                      Total Expenses
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatNumber(totalExpenses)}
                    </TableCell>
                  </TableRow>

                  {/* Net Income/Loss */}
                  <TableRow className="bg-primary/10 border-t-2 border-primary">
                    <TableCell />
                    <TableCell className="text-right font-bold text-lg">
                      {netIncome >= 0 ? "Net Income" : "Net Loss"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-bold text-lg ${netIncome >= 0 ? "text-green-600" : "text-destructive"}`}
                    >
                      {netIncome < 0 ? "-" : ""}
                      {formatNumber(Math.abs(netIncome))}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-muted/30 border">
            <p className="text-sm text-muted-foreground">Total Revenue</p>
            <p className="text-xl font-bold">Rs {formatNumber(totalRevenue)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border">
            <p className="text-sm text-muted-foreground">Total Cost</p>
            <p className="text-xl font-bold">Rs {formatNumber(totalCost)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border">
            <p className="text-sm text-muted-foreground">
              Gross {grossProfit >= 0 ? "Profit" : "Loss"}
            </p>
            <p
              className={`text-xl font-bold ${grossProfit >= 0 ? "text-green-600" : "text-destructive"}`}
            >
              Rs {grossProfit < 0 ? "-" : ""}
              {formatNumber(Math.abs(grossProfit))}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-muted/30 border">
            <p className="text-sm text-muted-foreground">
              Net {netIncome >= 0 ? "Income" : "Loss"}
            </p>
            <p
              className={`text-xl font-bold ${netIncome >= 0 ? "text-green-600" : "text-destructive"}`}
            >
              Rs {netIncome < 0 ? "-" : ""}
              {formatNumber(Math.abs(netIncome))}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
