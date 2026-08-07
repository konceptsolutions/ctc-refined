import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { getCurrentDatePakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printTrialBalance } from "@/utils/printTrialBalancePdf";
import { useToast } from "@/hooks/use-toast";
import {
  crHeaderClass,
  crValueClass,
  drHeaderClass,
  drValueClass,
} from "@/utils/accountingColors";

interface TrialBalanceAccount {
  accountId: string;
  label: string;
  debit: number;
  credit: number;
}

interface TrialBalanceSubGroup {
  subGroupCode: string;
  subGroupName: string;
  subGroupLabel: string;
  accounts: TrialBalanceAccount[];
  subTotalDebit: number;
  subTotalCredit: number;
}

interface TrialBalanceData {
  date: string;
  rows: TrialBalanceSubGroup[];
  totalDebit: number;
  totalCredit: number;
}

export const TrialBalanceTab = () => {
  const { toast } = useToast();
  const [fromDateObj, setFromDateObj] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [toDateObj, setToDateObj] = useState<Date | undefined>(new Date());

  const fromDate = fromDateObj ? format(fromDateObj, "yyyy-MM-dd") : "";
  const toDate = toDateObj ? format(toDateObj, "yyyy-MM-dd") : getCurrentDatePakistan();
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrialBalance();
  }, [fromDate, toDate]);

  const fetchTrialBalance = async () => {
    try {
      setLoading(true);
      console.log("Fetching trial balance from:", fromDate, "to:", toDate);

      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate);
      if (toDate) params.set("to_date", toDate);
      const result = await apiClient.get<any[]>(`/accounting/trial-balance?${params.toString()}`);

      console.log("API Response:", result);

      if (result.data) {
        const flatData = result.data;
        console.log("Trial Balance Raw Data Count:", flatData.length);
        console.log("Trial Balance Raw Data Sample:", flatData.slice(0, 3));

        // Transform flat data to grouped structure
        // The data comes in order: mainGroup, subgroup, accounts, subgroup, accounts, etc.
        const subgroupMap = new Map<string, TrialBalanceSubGroup>();
        let currentSubgroup: TrialBalanceSubGroup | null = null;
        let totalDebit = 0;
        let totalCredit = 0;

        flatData.forEach((item: any) => {
          if (item.type === 'subgroup') {
            // Create or get subgroup
            if (!subgroupMap.has(item.name)) {
              const parts = item.name.split('-');
              const code = parts[0];
              const name = parts.slice(1).join('-');
              currentSubgroup = {
                subGroupCode: code,
                subGroupName: name,
                subGroupLabel: item.name,
                accounts: [],
                subTotalDebit: 0,
                subTotalCredit: 0,
              };
              subgroupMap.set(item.name, currentSubgroup);
            } else {
              currentSubgroup = subgroupMap.get(item.name)!;
            }
          } else if (item.type === 'account') {
            // Find the appropriate subgroup for this account
            // Look for any subgroup that matches the account's main group pattern
            const subgroupKeys = Array.from(subgroupMap.keys());
            let targetSubgroup: TrialBalanceSubGroup | null = null;

            // Try to find subgroup by matching patterns or use first available
            for (const subgroupKey of subgroupKeys) {
              const subgroup = subgroupMap.get(subgroupKey);
              if (subgroup) {
                targetSubgroup = subgroup;
                break;
              }
            }

            if (targetSubgroup) {
              // Add account to current subgroup
              targetSubgroup.accounts.push({
                accountId: item.accountCode || '',
                label: item.accountName,
                debit: item.debit || 0,
                credit: item.credit || 0,
              });
              targetSubgroup.subTotalDebit += item.debit || 0;
              targetSubgroup.subTotalCredit += item.credit || 0;
              totalDebit += item.debit || 0;
              totalCredit += item.credit || 0;
            } else {
              // Create a default subgroup for orphaned accounts
              const defaultSubgroup: TrialBalanceSubGroup = {
                subGroupCode: "MISC",
                subGroupName: "Miscellaneous",
                subGroupLabel: "101-Miscellaneous",
                accounts: [],
                subTotalDebit: 0,
                subTotalCredit: 0,
              };
              subgroupMap.set("101-Miscellaneous", defaultSubgroup);

              // Add account to default subgroup
              defaultSubgroup.accounts.push({
                accountId: item.accountCode || '',
                label: item.accountName,
                debit: item.debit || 0,
                credit: item.credit || 0,
              });
              defaultSubgroup.subTotalDebit += item.debit || 0;
              defaultSubgroup.subTotalCredit += item.credit || 0;
              totalDebit += item.debit || 0;
              totalCredit += item.credit || 0;
            }
          }
        });

        console.log("Final subgroup map size:", subgroupMap.size);

        // Convert map to array and sort by subgroup code
        const rows = Array.from(subgroupMap.values()).sort((a, b) => {
          return a.subGroupCode.localeCompare(b.subGroupCode);
        });

        console.log("Transformed rows:", rows);
        console.log("Total Debit:", totalDebit, "Total Credit:", totalCredit);
        console.log("About to setData with totals:", { totalDebit, totalCredit, rowsCount: rows.length });

        // Verify totals from raw data
        const rawAccounts = flatData.filter((item: any) => item.type === 'account');
        const rawTotalDebit = rawAccounts.reduce((sum: number, item: any) => sum + (item.debit || 0), 0);
        const rawTotalCredit = rawAccounts.reduce((sum: number, item: any) => sum + (item.credit || 0), 0);

        // Fallback: if no subgroups were created, show raw data as accounts
        if (rows.length === 0 && flatData.length > 0) {
          console.log("No subgroups created, showing raw accounts as fallback");
          const fallbackRows: TrialBalanceSubGroup[] = [];
          const fallbackSubgroup: TrialBalanceSubGroup = {
            subGroupCode: "ALL",
            subGroupName: "All Accounts",
            subGroupLabel: "All Accounts",
            accounts: flatData.filter((item: any) => item.type === 'account').map((item: any) => ({
              accountId: item.accountCode || '',
              label: item.accountName,
              debit: item.debit || 0,
              credit: item.credit || 0,
            })),
            subTotalDebit: totalDebit,
            subTotalCredit: totalCredit,
          };
          fallbackRows.push(fallbackSubgroup);

          setData({
            date: `${fromDate} to ${toDate}`,
            rows: fallbackRows,
            totalDebit,
            totalCredit,
          });
        } else {

          // Sort accounts within each subgroup by account code
          rows.forEach(row => {
            row.accounts.sort((a, b) => {
              const codeA = a.label.split('-')[0];
              const codeB = b.label.split('-')[0];
              return codeA.localeCompare(codeB);
            });
          });

          setData({
            date: `${fromDate} to ${toDate}`,
            rows,
            totalDebit,
            totalCredit,
          });
        }
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
    if (num === 0) return "0";
    return num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const handlePrint = () => {
    if (!data) {
      toast({
        title: "No data",
        description: "Load trial balance data before printing.",
        variant: "destructive",
      });
      return;
    }

    const rows = data.rows.flatMap((subgroup) => [
      {
        label: subgroup.subGroupLabel,
        debit: subgroup.subTotalDebit,
        credit: subgroup.subTotalCredit,
        isSubgroup: true,
      },
      ...subgroup.accounts.map((account) => ({
        label: account.label,
        debit: account.debit,
        credit: account.credit,
        isSubgroup: false,
      })),
    ]);

    const opened = printTrialBalance({
      fromDate,
      toDate,
      rows,
      totalDebit: data.totalDebit,
      totalCredit: data.totalCredit,
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
    <div className="space-y-6">
      {/* Filter Section */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Filter</Label>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">From:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-48 justify-start text-left font-normal",
                    !fromDateObj && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDateObj ? (
                    format(fromDateObj, "dd/MM/yyyy")
                  ) : (
                    <span>Pick date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDateObj}
                  onSelect={setFromDateObj}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground whitespace-nowrap">To:</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-48 justify-start text-left font-normal",
                    !toDateObj && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDateObj ? (
                    format(toDateObj, "dd/MM/yyyy")
                  ) : (
                    <span>Pick date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDateObj}
                  onSelect={setToDateObj}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <PrintPdfButton
            onPrint={handlePrint}
            disabled={loading || !data}
            label="Print PDF"
          />
        </div>
      </div>

      {/* Trial Balance Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          {data?.date && (
            <p className="text-sm text-muted-foreground px-4 pt-3">
              Period: {fromDateObj ? format(fromDateObj, "dd/MM/yyyy") : ""}
              {fromDateObj && toDateObj ? " to " : ""}
              {toDateObj ? format(toDateObj, "dd/MM/yyyy") : ""}
            </p>
          )}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <ListNumberHeader />
                  <TableHead className="font-semibold underline">Account</TableHead>
                  <TableHead className={`font-semibold underline text-right ${drHeaderClass}`}>Dr</TableHead>
                  <TableHead className={`font-semibold underline text-right ${crHeaderClass}`}>Cr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading trial balance data...
                    </TableCell>
                  </TableRow>
                ) : !data || data.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No data available
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {data.rows.map((subgroup, sgIdx) => (
                      <React.Fragment key={subgroup.subGroupLabel}>
                        {/* Subgroup Header Row */}
                        <TableRow className="bg-muted/20 font-medium">
                          <TableCell />
                          <TableCell className="font-semibold">
                            {subgroup.subGroupLabel}
                          </TableCell>
                          <TableCell className="text-right"></TableCell>
                          <TableCell className="text-right"></TableCell>
                        </TableRow>

                        {/* Account Rows under Subgroup */}
                        {subgroup.accounts.map((account, accIdx) => (
                          <TableRow key={`${account.accountId}-${accIdx}`} className="hover:bg-muted/30">
                            <ListNumberCell index={accIdx} total={subgroup.accounts.length} />
                            <TableCell className="pl-8 text-sm">
                              {account.label}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-mono ${drValueClass(account.debit)}`}>
                              {formatNumber(account.debit)}
                            </TableCell>
                            <TableCell className={`text-right text-sm font-mono ${crValueClass(account.credit)}`}>
                              {formatNumber(account.credit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}

                    {/* Total Row */}
                    <TableRow className="bg-muted/40 font-bold border-t-2 border-border">
                      <TableCell />
                      <TableCell className="font-bold">Total</TableCell>
                      <TableCell className={`text-right font-bold font-mono ${drValueClass(1, true)}`}>
                        {formatNumber(data.totalDebit)}
                      </TableCell>
                      <TableCell className={`text-right font-bold font-mono ${crValueClass(1, true)}`}>
                        {formatNumber(data.totalCredit)}
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
