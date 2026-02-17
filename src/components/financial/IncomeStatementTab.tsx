import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { getCurrentDatePakistan, getStartOfCurrentMonthPakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";

interface IncomeAccount {
  accountId: string;
  label: string;
  amount: number;
}

interface IncomeStatementData {
  from: string;
  to: string;
  revenue: {
    accounts: IncomeAccount[];
    total: number;
  };
  cost: {
    accounts: IncomeAccount[];
    total: number;
  };
  gross: {
    label: string;
    amount: number;
  };
  expenses: {
    accounts: IncomeAccount[];
    total: number;
  };
  net: {
    label: string;
    amount: number;
  };
}

export const IncomeStatementTab = () => {
  const [fromDate, setFromDate] = useState(() => getStartOfCurrentMonthPakistan());
  const [toDate, setToDate] = useState(() => getCurrentDatePakistan());
  const [data, setData] = useState<IncomeStatementData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchIncomeStatement();
  }, [fromDate, toDate]);

  const fetchIncomeStatement = async () => {
    try {
      setLoading(true);
      
      // Use apiClient which includes authentication headers
      const result = await apiClient.get<any>(`/accounting/income-statement?from_date=${fromDate}&to_date=${toDate}`);
      
      if (result.data) {
        const resultData = result.data;
      
        // Transform accounting endpoint data to match expected format
        const revenueAccounts: IncomeAccount[] = [];
        if (resultData.revenue && Array.isArray(resultData.revenue)) {
          resultData.revenue.forEach((category: any) => {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item: any) => {
              if (item.name) {
                revenueAccounts.push({
                  accountId: item.name.split('-')[0] || '',
                  label: item.name || '',
                  amount: Number(item.amount) || 0,
                });
              }
            });
          }
        });
      }
      
      const costAccounts: IncomeAccount[] = [];
      if (resultData.cost && Array.isArray(resultData.cost)) {
        resultData.cost.forEach((category: any) => {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item: any) => {
              if (item.name) {
                costAccounts.push({
                  accountId: item.name.split('-')[0] || '',
                  label: item.name || '',
                  amount: Number(item.amount) || 0,
                });
              }
            });
          }
        });
      }
      
      const expenseAccounts: IncomeAccount[] = [];
      if (resultData.expenses && Array.isArray(resultData.expenses)) {
        resultData.expenses.forEach((category: any) => {
          if (category.items && Array.isArray(category.items)) {
            category.items.forEach((item: any) => {
              if (item.name) {
                expenseAccounts.push({
                  accountId: item.name.split('-')[0] || '',
                  label: item.name || '',
                  amount: Number(item.amount) || 0,
                });
              }
            });
          }
        });
      }
      
      // If no accounts found, set empty arrays to ensure UI still renders
      if (revenueAccounts.length === 0 && costAccounts.length === 0 && expenseAccounts.length === 0) {
      }
      
      const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.amount, 0);
      const totalCost = costAccounts.reduce((sum, acc) => sum + acc.amount, 0);
      const gross = totalRevenue - totalCost;
      const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.amount, 0);
      const net = gross - totalExpenses;
      
      setData({
        from: fromDate,
        to: toDate,
        revenue: {
          accounts: revenueAccounts,
          total: totalRevenue,
        },
        cost: {
          accounts: costAccounts,
          total: totalCost,
        },
        gross: {
          label: gross >= 0 ? 'Gross Profit' : 'Gross Loss',
          amount: gross,
        },
        expenses: {
          accounts: expenseAccounts,
          total: totalExpenses,
        },
        net: {
          label: net >= 0 ? 'Net Profit' : 'Net Loss',
          amount: net,
        },
      });
      } else {
        console.error("API Error:", result.error);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatDateDisplay = (dateString: string): string => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-4">
      {/* Filter Section */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Filter</Label>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">From</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-sm text-muted-foreground">{formatDateDisplay(fromDate)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">To</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[150px]"
            />
            <span className="text-sm text-muted-foreground">{formatDateDisplay(toDate)}</span>
          </div>
        </div>
      </div>

      {/* Income Statement Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold underline">Account</TableHead>
                  <TableHead className="font-semibold underline text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                      Loading income statement data...
                    </TableCell>
                  </TableRow>
                ) : !data ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {/* Revenue Accounts */}
                    {data.revenue.accounts.length > 0 ? (
                      data.revenue.accounts.map((account, index) => (
                        <TableRow key={`rev-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-2">
                          No revenue accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Revenue */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell className="font-semibold">
                        Total Revenue
                      </TableCell>
                      <TableCell className="text-right font-semibold font-mono">
                        {formatNumber(data.revenue.total)}
                      </TableCell>
                    </TableRow>

                    {/* Separator */}
                    <TableRow>
                      <TableCell colSpan={2} className="p-0">
                        <Separator />
                      </TableCell>
                    </TableRow>

                    {/* Cost Accounts */}
                    {data.cost.accounts.length > 0 ? (
                      data.cost.accounts.map((account, index) => (
                        <TableRow key={`cost-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-2">
                          No cost accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Cost */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell className="font-semibold">
                        Total Cost
                      </TableCell>
                      <TableCell className="text-right font-semibold font-mono">
                        {formatNumber(data.cost.total)}
                      </TableCell>
                    </TableRow>

                    {/* Gross Profit/Loss */}
                    <TableRow className="bg-muted/30 border-t border-border/50">
                      <TableCell className="font-bold">
                        {data.gross.label}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatNumber(Math.abs(data.gross.amount))}
                      </TableCell>
                    </TableRow>

                    {/* Separator */}
                    <TableRow>
                      <TableCell colSpan={2} className="p-0">
                        <Separator />
                      </TableCell>
                    </TableRow>

                    {/* Expense Accounts */}
                    {data.expenses.accounts.length > 0 ? (
                      data.expenses.accounts.map((account, index) => (
                        <TableRow key={`exp-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className="text-right text-sm font-mono">
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={2} className="text-center text-sm text-muted-foreground py-2">
                          No expense accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Expenses */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell className="font-semibold">
                        Total Expenses
                      </TableCell>
                      <TableCell className="text-right font-semibold font-mono">
                        {formatNumber(data.expenses.total)}
                      </TableCell>
                    </TableRow>

                    {/* Net Profit/Loss */}
                    <TableRow className="bg-muted/30 border-t-2 border-border font-bold">
                      <TableCell className="font-bold">
                        {data.net.label}
                      </TableCell>
                      <TableCell className="text-right font-bold font-mono">
                        {formatNumber(Math.abs(data.net.amount))}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
