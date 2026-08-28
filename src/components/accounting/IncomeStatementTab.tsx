import { formatUiDate } from "@/utils/dateUtils";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Calendar as CalendarIcon, Download, TrendingUp, TrendingDown, DollarSign } from "lucide-react";
import { apiClient } from "@/lib/api";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printIncomeStatement } from "@/utils/printIncomeStatementPdf";
import { useToast } from "@/hooks/use-toast";

interface IncomeCategory {
  name: string;
  items: { name: string; amount: number }[];
}

export const IncomeStatementTab = () => {
  const { toast } = useToast();
  const [revenueData, setRevenueData] = useState<IncomeCategory[]>([]);
  const [costData, setCostData] = useState<IncomeCategory[]>([]);
  const [expenseData, setExpenseData] = useState<IncomeCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1); // First day of current month
    return d;
  });
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const fetchIncomeStatement = async () => {
    try {
      setLoading(true);
      
      // Temporarily hardcode sample data to test UI rendering
      const sampleData = {
        revenue: [
          { code: "4000", name: "Sales Revenue", amount: 100000 },
          { code: "4010", name: "Service Revenue", amount: 25000 }
        ],
        cost: [
          { code: "5000", name: "Cost of Goods Sold", amount: 60000 }
        ],
        expenses: [
          { code: "6000", name: "Operating Expenses", amount: 20000 },
          { code: "6010", name: "Administrative Expenses", amount: 10000 }
        ]
      };
      
      // Transform sample data
      const transformedRevenue: IncomeCategory[] = [{
        name: "Revenue",
        items: sampleData.revenue.map(account => ({
          name: `${account.code}-${account.name}`,
          amount: account.amount,
        })),
      }];
      
      const transformedCost: IncomeCategory[] = [{
        name: "Cost of Goods Sold",
        items: sampleData.cost.map(account => ({
          name: `${account.code}-${account.name}`,
          amount: account.amount,
        })),
      }];
      
      const transformedExpenses: IncomeCategory[] = [{
        name: "Operating Expenses",
        items: sampleData.expenses.map(account => ({
          name: `${account.code}-${account.name}`,
          amount: account.amount,
        })),
      }];
      
      setRevenueData(transformedRevenue);
      setCostData(transformedCost);
      setExpenseData(transformedExpenses);
      
    } catch (error: any) {
      console.error("Error:", error);
      setRevenueData([]);
      setCostData([]);
      setExpenseData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIncomeStatement();
  }, [fromDate, toDate]);

  const totalRevenue = revenueData.reduce((sum, cat) =>
    sum + cat.items.reduce((s, item) => s + item.amount, 0), 0
  );

  const totalCost = costData.reduce((sum, cat) =>
    sum + cat.items.reduce((s, item) => s + item.amount, 0), 0
  );

  const grossProfit = totalRevenue - totalCost;

  const totalExpenses = expenseData.reduce((sum, cat) =>
    sum + cat.items.reduce((s, item) => s + item.amount, 0), 0
  );

  const netIncome = grossProfit - totalExpenses;
  
  console.log("Rendering - Revenue:", revenueData.length, "categories, Total:", totalRevenue);
  console.log("Rendering - Cost:", costData.length, "categories, Total:", totalCost);
  console.log("Rendering - Expenses:", expenseData.length, "categories, Total:", totalExpenses);

  const handlePrint = () => {
    const revenueAccounts = revenueData.flatMap((cat) =>
      cat.items.map((item) => ({ label: item.name, amount: item.amount })),
    );
    const costAccounts = costData.flatMap((cat) =>
      cat.items.map((item) => ({ label: item.name, amount: item.amount })),
    );
    const expenseAccounts = expenseData.flatMap((cat) =>
      cat.items.map((item) => ({ label: item.name, amount: item.amount })),
    );

    const opened = printIncomeStatement({
      fromDate: fromDate ? format(fromDate, "yyyy-MM-dd") : "",
      toDate: toDate ? format(toDate, "yyyy-MM-dd") : "",
      revenue: revenueAccounts,
      cost: costAccounts,
      expenses: expenseAccounts,
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

  const handleExport = () => {
    const rows = [];
    rows.push(["Category", "Item", "Amount"]);
    revenueData.forEach(cat => {
      rows.push([cat.name, "", ""]);
      cat.items.forEach(item => {
        rows.push(["", item.name, item.amount]);
      });
    });
    rows.push(["Total Revenue", "", totalRevenue]);
    costData.forEach(cat => {
      rows.push([cat.name, "", ""]);
      cat.items.forEach(item => {
        rows.push(["", item.name, item.amount]);
      });
    });
    rows.push(["Total Cost", "", totalCost]);
    rows.push(["Gross Profit", "", grossProfit]);
    expenseData.forEach(cat => {
      rows.push([cat.name, "", ""]);
      cat.items.forEach(item => {
        rows.push(["", item.name, item.amount]);
      });
    });
    rows.push(["Total Expenses", "", totalExpenses]);
    rows.push(["Net Income", "", netIncome]);

    const csvContent = rows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `income_statement_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold text-green-600">Rs {totalRevenue.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Cost</p>
                <p className="text-2xl font-bold text-primary">Rs {totalCost.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                <TrendingDown className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20 transition-all duration-300 hover:shadow-lg hover:scale-[1.02]">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Gross Profit</p>
                <p className="text-2xl font-bold text-blue-600">Rs {grossProfit.toLocaleString()}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={`bg-gradient-to-br ${netIncome >= 0 ? 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20' : 'from-red-500/10 to-red-600/5 border-red-500/20'} transition-all duration-300 hover:shadow-lg hover:scale-[1.02]`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Net Income</p>
                <p className={`text-2xl font-bold ${netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  Rs {netIncome.toLocaleString()}
                </p>
              </div>
              <div className={`h-12 w-12 rounded-full ${netIncome >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'} flex items-center justify-center`}>
                <DollarSign className={`h-6 w-6 ${netIncome >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Income Statement */}
      <Card className="border-border/50">
        <CardHeader className="pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Income Statement
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">Profit & Loss Statement</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">From:</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-[150px] justify-start text-left font-normal",
                        !fromDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {fromDate ? formatUiDate(fromDate) : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={fromDate}
                      onSelect={setFromDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-muted-foreground">To:</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "w-[150px] justify-start text-left font-normal",
                        !toDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {toDate ? formatUiDate(toDate) : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={toDate}
                      onSelect={setToDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={fetchIncomeStatement}
                className="transition-all duration-200 hover:scale-105"
              >
                Search
              </Button>
              <PrintPdfButton onPrint={handlePrint} label="Print PDF" disabled={loading} />
              <Button variant="outline" size="sm" className="transition-all duration-200 hover:scale-105" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <ListNumberHeader />
                      <TableHead className="font-semibold">Account</TableHead>
                      <TableHead className="text-right font-semibold">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* Revenue Section */}
                    {revenueData.length > 0 ? (
                      revenueData.map((category) => (
                        category.items.map((item, index) => (
                          <TableRow key={`rev-${item.name}`}>
                            <ListNumberCell index={index} total={category.items.length} />
                            <TableCell className="pl-8">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No revenue accounts</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell />
                      <TableCell>Total Revenue</TableCell>
                      <TableCell className="text-right font-mono">{totalRevenue.toLocaleString()}</TableCell>
                    </TableRow>

                    {/* Cost Section */}
                    {costData.length > 0 ? (
                      costData.map((category) => (
                        category.items.map((item, index) => (
                          <TableRow key={`cost-${item.name}`}>
                            <ListNumberCell index={index} total={category.items.length} />
                            <TableCell className="pl-8">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No cost accounts</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell />
                      <TableCell>Total Cost</TableCell>
                      <TableCell className="text-right font-mono">{totalCost.toLocaleString()}</TableCell>
                    </TableRow>

                    {/* Gross Profit */}
                    <TableRow className="bg-green-500/10 font-semibold">
                      <TableCell />
                      <TableCell className="text-green-600">Gross Profit</TableCell>
                      <TableCell className="text-right font-mono text-green-600">{grossProfit.toLocaleString()}</TableCell>
                    </TableRow>

                    {/* Expenses Section */}
                    {expenseData.length > 0 ? (
                      expenseData.map((category) => (
                        category.items.map((item, index) => (
                          <TableRow key={`exp-${item.name}`}>
                            <ListNumberCell index={index} total={category.items.length} />
                            <TableCell className="pl-8">{item.name}</TableCell>
                            <TableCell className="text-right font-mono">{item.amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-4">No expense accounts</TableCell>
                      </TableRow>
                    )}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell />
                      <TableCell>Total Expenses</TableCell>
                      <TableCell className="text-right font-mono">{totalExpenses.toLocaleString()}</TableCell>
                    </TableRow>

                    {/* Net Income */}
                    <TableRow className={`font-bold ${netIncome >= 0 ? 'bg-primary/20 text-green-600' : 'bg-red-500/20 text-red-600'}`}>
                      <TableCell />
                      <TableCell>Net Income</TableCell>
                      <TableCell className="text-right font-mono">{netIncome.toLocaleString()}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
