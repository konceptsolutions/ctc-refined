import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Separator } from "@/components/ui/separator";
import { getCurrentDatePakistan, getStartOfCurrentMonthPakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printIncomeStatement } from "@/utils/printIncomeStatementPdf";
import { useToast } from "@/hooks/use-toast";
import {
  amountHeaderClass,
  amountValueClass,
} from "@/utils/accountingColors";
import { usePageActions } from "@/permissions/pageActions";

interface IncomeAccount {
  accountId: string;
  label: string;
  amount: number;
}

interface IncomeStatementApiItem {
  code: string;
  name: string;
  amount: number;
  level: number;
}

interface IncomeStatementApiResponse {
  revenue: IncomeStatementApiItem[];
  cost: IncomeStatementApiItem[];
  expenses: IncomeStatementApiItem[];
  summary: {
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
  };
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
  const { canPrint } = usePageActions("financial.income-statement");
  const { toast } = useToast();
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
      
      console.log("Fetching income statement...", fromDate, toDate);
      
      // Use public endpoint for testing without authentication
      const result = await apiClient.get<IncomeStatementApiResponse>('/public-income-statement', {
        params: {
          from_date: fromDate,
          to_date: toDate,
        }
      });
      
      console.log("API Result:", result);
      
      // API returns data wrapped in result.data
      const resultData = result.data;
      console.log("Processing data:", resultData);
      
      if (resultData && resultData.revenue !== undefined) {
        console.log("Revenue array:", resultData.revenue);
        console.log("Cost array:", resultData.cost);
        console.log("Expenses array:", resultData.expenses);
      
        // Transform the data structure to match expected format
        const revenueAccounts: IncomeAccount[] = [];
        if (resultData.revenue && Array.isArray(resultData.revenue)) {
          resultData.revenue.forEach((account: any) => {
            if (account.name && account.amount !== undefined) {
              revenueAccounts.push({
                accountId: account.code || account.name.split('-')[0] || '',
                label: account.code ? `${account.code}-${account.name}` : account.name,
                amount: Number(account.amount) || 0,
              });
            }
          });
        }
      
        const costAccounts: IncomeAccount[] = [];
        if (resultData.cost && Array.isArray(resultData.cost)) {
          resultData.cost.forEach((account: any) => {
            if (account.name && account.amount !== undefined) {
              costAccounts.push({
                accountId: account.code || account.name.split('-')[0] || '',
                label: account.code ? `${account.code}-${account.name}` : account.name,
                amount: Number(account.amount) || 0,
              });
            }
          });
        }
      
        const expenseAccounts: IncomeAccount[] = [];
        if (resultData.expenses && Array.isArray(resultData.expenses)) {
          resultData.expenses.forEach((account: any) => {
            if (account.name && account.amount !== undefined) {
              expenseAccounts.push({
                accountId: account.code || account.name.split('-')[0] || '',
                label: account.code ? `${account.code}-${account.name}` : account.name,
                amount: Number(account.amount) || 0,
              });
            }
          });
        }
      
        const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.amount, 0);
        const totalCost = costAccounts.reduce((sum, acc) => sum + acc.amount, 0);
        const gross = totalRevenue - totalCost;
        const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.amount, 0);
        const net = gross - totalExpenses;
      
        console.log("Setting data with:", {
          revenue: revenueAccounts.length,
          cost: costAccounts.length,
          expenses: expenseAccounts.length
        });
      
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
        console.error("API returned invalid data structure:", resultData);
        setData(null);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      setData(null);
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

  const handlePrint = () => {
    if (!data) {
      toast({
        title: "No data",
        description: "Load income statement data before printing.",
        variant: "destructive",
      });
      return;
    }

    const opened = printIncomeStatement({
      fromDate: data.from,
      toDate: data.to,
      revenue: data.revenue.accounts.map((acc) => ({
        label: acc.label,
        amount: acc.amount,
      })),
      cost: data.cost.accounts.map((acc) => ({
        label: acc.label,
        amount: acc.amount,
      })),
      expenses: data.expenses.accounts.map((acc) => ({
        label: acc.label,
        amount: acc.amount,
      })),
      totalRevenue: data.revenue.total,
      totalCost: data.cost.total,
      grossProfit: data.gross.amount,
      totalExpenses: data.expenses.total,
      netIncome: data.net.amount,
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
          {canPrint && (
            <PrintPdfButton
              onPrint={handlePrint}
              disabled={loading || !data}
              label="Print PDF"
            />
          )}
        </div>
      </div>

      {/* Income Statement Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <ListNumberHeader />
                  <TableHead className="font-semibold underline">Account</TableHead>
                  <TableHead className={`font-semibold underline text-right ${amountHeaderClass}`}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      Loading income statement data...
                    </TableCell>
                  </TableRow>
                ) : !data ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {/* Revenue Accounts */}
                    {data.revenue.accounts.length > 0 ? (
                      data.revenue.accounts.map((account, index) => (
                        <TableRow key={`rev-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <ListNumberCell index={index} total={data.revenue.accounts.length} />
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-mono ${amountValueClass()}`}>
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-2">
                          No revenue accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Revenue */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell />
                      <TableCell className="font-semibold">
                        Total Revenue
                      </TableCell>
                      <TableCell className={`text-right font-semibold font-mono ${amountValueClass()}`}>
                        {formatNumber(data.revenue.total)}
                      </TableCell>
                    </TableRow>

                    {/* Separator */}
                    <TableRow>
                      <TableCell colSpan={3} className="p-0">
                        <Separator />
                      </TableCell>
                    </TableRow>

                    {/* Cost Accounts */}
                    {data.cost.accounts.length > 0 ? (
                      data.cost.accounts.map((account, index) => (
                        <TableRow key={`cost-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <ListNumberCell index={index} total={data.cost.accounts.length} />
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-mono ${amountValueClass()}`}>
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-2">
                          No cost accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Cost */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell />
                      <TableCell className="font-semibold">
                        Total Cost
                      </TableCell>
                      <TableCell className={`text-right font-semibold font-mono ${amountValueClass()}`}>
                        {formatNumber(data.cost.total)}
                      </TableCell>
                    </TableRow>

                    {/* Gross Profit/Loss */}
                    <TableRow className="bg-muted/30 border-t border-border/50">
                      <TableCell />
                      <TableCell className="font-bold">
                        {data.gross.label}
                      </TableCell>
                      <TableCell className={`text-right font-bold font-mono ${amountValueClass()}`}>
                        {formatNumber(Math.abs(data.gross.amount))}
                      </TableCell>
                    </TableRow>

                    {/* Separator */}
                    <TableRow>
                      <TableCell colSpan={3} className="p-0">
                        <Separator />
                      </TableCell>
                    </TableRow>

                    {/* Expense Accounts */}
                    {data.expenses.accounts.length > 0 ? (
                      data.expenses.accounts.map((account, index) => (
                        <TableRow key={`exp-${account.accountId}-${index}`} className="hover:bg-muted/30">
                          <ListNumberCell index={index} total={data.expenses.accounts.length} />
                          <TableCell className="pl-4 text-sm">
                            {account.label}
                          </TableCell>
                          <TableCell className={`text-right text-sm font-mono ${amountValueClass()}`}>
                            {formatNumber(account.amount)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-2">
                          No expense accounts found
                        </TableCell>
                      </TableRow>
                    )}
                    
                    {/* Total Expenses */}
                    <TableRow className="bg-muted/20 border-t border-border/50">
                      <TableCell />
                      <TableCell className="font-semibold">
                        Total Expenses
                      </TableCell>
                      <TableCell className={`text-right font-semibold font-mono ${amountValueClass()}`}>
                        {formatNumber(data.expenses.total)}
                      </TableCell>
                    </TableRow>

                    {/* Net Profit/Loss */}
                    <TableRow className="bg-muted/30 border-t-2 border-border font-bold">
                      <TableCell />
                      <TableCell className="font-bold">
                        {data.net.label}
                      </TableCell>
                      <TableCell className={`text-right font-bold font-mono ${amountValueClass()}`}>
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
