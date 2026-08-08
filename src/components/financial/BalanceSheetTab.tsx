import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { Loader2, Calendar as CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printBalanceSheet } from "@/utils/printBalanceSheetPdf";
import { useToast } from "@/hooks/use-toast";
import type { BalanceSheetPrintMainGroup } from "@/utils/printBalanceSheetPdf";
import { amountValueClass } from "@/utils/accountingColors";
import { usePageActions } from "@/permissions/pageActions";

interface BalanceSheetAccount {
  id: string;
  code: string;
  name: string;
  balance: number;
  entries?: any[]; // Add entries property
}

interface BalanceSheetSubgroup {
  id: string;
  code: string;
  name: string;
  coa_accounts: BalanceSheetAccount[];
}

interface BalanceSheetMainGroup {
  id: string;
  code: string;
  name: string;
  non_depreciation_sub_groups?: BalanceSheetSubgroup[];
  coa_sub_groups?: BalanceSheetSubgroup[];
}

interface BalanceSheetData {
  assets: BalanceSheetMainGroup[];
  liabilities: BalanceSheetMainGroup[];
  capital: BalanceSheetMainGroup[];
  revExp: number;
  revenue: number;
  expense: number;
  cost: number;
  supplierAccounts?: SupplierAccount[];
}

interface SupplierAccount {
  id: string;
  code: string;
  name: string;
  supplierName: string;
  subgroupName: string;
  balance: { balance: number };
}

export const BalanceSheetTab = () => {
  const { canPrint } = usePageActions("financial.balance-sheet");
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [loading, setLoading] = useState(true);
  const [balanceSheetData, setBalanceSheetData] =
    useState<BalanceSheetData | null>(null);

  useEffect(() => {
    if (selectedDate) {
      fetchBalanceSheet();
    }
  }, [selectedDate]);

  const fetchBalanceSheet = async () => {
    try {
      setLoading(true);
      const dateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
      const response = await apiClient.getBalanceSheet({ date: dateStr });
      if (response.data) {
        setBalanceSheetData(response.data as BalanceSheetData);
      }
    } catch (error: any) {
      console.error("Error fetching balance sheet:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (value: number | null | undefined): string => {
    if (value === null || value === undefined) return "0";
    const num = typeof value === "number" ? value : parseFloat(value);
    if (isNaN(num)) return "0";
    return num.toLocaleString(undefined, {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
    });
  };

  const formatBalance = (
    balance: number | null | undefined,
    _isLiability: boolean = false,
  ): string => {
    if (balance === null || balance === undefined) return "0.00";
    const num = typeof balance === "number" ? balance : parseFloat(balance);
    if (isNaN(num)) return "0.00";

    // Since the backend now uses calculateAccountBalance,
    // a positive value ALWAYS represents a normal balance for that account type.
    // A negative value represents an unusual balance (e.g., overdrawn asset or debit-balance liability).
    return num >= 0 ? formatNumber(num) : `(${formatNumber(Math.abs(num))})`;
  };

  // Helper to get balance value from account (matching autohub structure)
  const getAccountBalance = (account: any): number | null => {
    if (typeof account.balance === "number") return account.balance;
    return account.balance?.balance ?? null;
  };

  const ZERO_BALANCE_EPSILON = 0.01;

  const isEffectivelyZero = (balance: number | null | undefined): boolean => {
    if (balance === null || balance === undefined) return true;
    const num = typeof balance === "number" ? balance : parseFloat(String(balance));
    if (isNaN(num)) return true;
    return Math.abs(num) < ZERO_BALANCE_EPSILON;
  };

  const getVisibleAccounts = (
    accounts: BalanceSheetAccount[] | undefined,
  ): BalanceSheetAccount[] =>
    (accounts ?? []).filter(
      (account) => !isEffectivelyZero(getAccountBalance(account)),
    );

  const getVisibleSubgroups = (
    subgroups: BalanceSheetSubgroup[] | undefined,
  ): BalanceSheetSubgroup[] =>
    (subgroups ?? []).filter(
      (subgroup) => getVisibleAccounts(subgroup.coa_accounts).length > 0,
    );

  const calculateSubgroupTotal = (subgroup: BalanceSheetSubgroup): number => {
    return (
      subgroup.coa_accounts?.reduce((sum, acc) => {
        const balance = getAccountBalance(acc) || 0;
        return sum + balance;
      }, 0) || 0
    );
  };

  const calculateMainGroupTotal = (
    mainGroup: BalanceSheetMainGroup,
  ): number => {
    const subgroups =
      mainGroup.non_depreciation_sub_groups || mainGroup.coa_sub_groups || [];
    return subgroups.reduce((sum, sg) => sum + calculateSubgroupTotal(sg), 0);
  };

  const calculateTotalAssets = (): number => {
    if (!balanceSheetData?.assets) return 0;
    return balanceSheetData.assets.reduce(
      (sum, mg) => sum + calculateMainGroupTotal(mg),
      0,
    );
  };

  const calculateTotalLiabilities = (): number => {
    if (!balanceSheetData?.liabilities) return 0;
    return balanceSheetData.liabilities.reduce(
      (sum, mg) => sum + calculateMainGroupTotal(mg),
      0,
    );
  };

  const calculateTotalCapital = (): number => {
    if (!balanceSheetData?.capital) return 0;
    const capitalTotal = balanceSheetData.capital.reduce(
      (sum, mg) => sum + calculateMainGroupTotal(mg),
      0,
    );
    // Calculate accurate net income: Revenue - Cost - Expenses
    const revenue = balanceSheetData.revenue || 0;
    const cost = balanceSheetData.cost || 0;
    const expense = balanceSheetData.expense || 0;
    const netIncome = revenue - cost - expense;
    return capitalTotal + netIncome;
  };

  const mapPrintGroups = (
    groups: BalanceSheetMainGroup[] | undefined,
  ): BalanceSheetPrintMainGroup[] =>
    (groups || [])
      .map((mainGroup) => {
        const visibleSubgroups = getVisibleSubgroups(
          mainGroup.non_depreciation_sub_groups || mainGroup.coa_sub_groups,
        );
        return {
          label: `${mainGroup.code}-${mainGroup.name}`,
          total: calculateMainGroupTotal(mainGroup),
          subgroups: visibleSubgroups.map((subgroup) => ({
            label: `${subgroup.code}-${subgroup.name}`,
            total: calculateSubgroupTotal(subgroup),
            accounts: getVisibleAccounts(subgroup.coa_accounts).map(
              (account) => ({
                label: `${account.code}-${account.name}`,
                balance: getAccountBalance(account) || 0,
              }),
            ),
          })),
        };
      })
      .filter((group) => group.subgroups.length > 0);

  const handlePrint = () => {
    if (!balanceSheetData) {
      toast({
        title: "No data",
        description: "Load balance sheet data before printing.",
        variant: "destructive",
      });
      return;
    }

    const revenue = balanceSheetData.revenue || 0;
    const cost = balanceSheetData.cost || 0;
    const expense = balanceSheetData.expense || 0;
    const netIncome = revenue - cost - expense;

    const opened = printBalanceSheet({
      date: selectedDate,
      assets: mapPrintGroups(balanceSheetData.assets),
      liabilities: mapPrintGroups(balanceSheetData.liabilities),
      capital: mapPrintGroups(balanceSheetData.capital),
      totalAssets: calculateTotalAssets(),
      totalLiabilities: calculateTotalLiabilities(),
      totalCapital: calculateTotalCapital(),
      netIncomeLabel: netIncome >= 0 ? "Net Income" : "Net Loss",
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!balanceSheetData) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">
            No balance sheet data available
          </p>
        </CardContent>
      </Card>
    );
  }

  const totalAssets = calculateTotalAssets();
  const totalLiabilities = calculateTotalLiabilities();
  const totalCapital = calculateTotalCapital();
  const totalLiabilitiesAndCapital = totalLiabilities + totalCapital;

  return (
    <div className="space-y-4">
      {/* Filter Section */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="balance-sheet-date" className="font-semibold">
              Filter
            </Label>
            <div className="flex items-center gap-2">
              <Label htmlFor="balance-sheet-date">Date:</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-48 justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? (
                      format(selectedDate, "dd/MM/yyyy")
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {canPrint && (
              <PrintPdfButton
                onPrint={handlePrint}
                disabled={loading || !balanceSheetData}
                label="Print PDF"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Balance Sheet Content */}
      <div className="grid grid-cols-2 gap-4">
        {/* Assets Column */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {balanceSheetData.assets?.map((mainGroup) => {
              const visibleSubgroups = getVisibleSubgroups(
                mainGroup.non_depreciation_sub_groups,
              );
              if (visibleSubgroups.length === 0) return null;

              const mainGroupTotal = calculateMainGroupTotal(mainGroup);
              return (
                <div key={mainGroup.id} className="ml-4">
                  <h3 className="text-base font-semibold mb-2">
                    {mainGroup.code}-{mainGroup.name}
                  </h3>

                  {visibleSubgroups.map((subgroup) => {
                      const subgroupTotal = calculateSubgroupTotal(subgroup);
                      const visibleAccounts = getVisibleAccounts(
                        subgroup.coa_accounts,
                      );
                      return (
                        <div key={subgroup.id} className="mb-4 ml-4">
                          <h4 className="text-sm font-medium mb-1 text-gray-700">
                            {subgroup.code}-{subgroup.name}
                          </h4>

                          {visibleAccounts.map((account) => {
                            const accountBalance = getAccountBalance(account);
                            return (
                              <div
                                key={account.id}
                                className="flex justify-between items-center py-0.5 ml-4"
                              >
                                <span className="text-xs text-gray-600">
                                  {account.code}-{account.name}
                                </span>
                                <span className={`text-xs text-right ${amountValueClass()}`}>
                                  {formatBalance(accountBalance || 0)}
                                </span>
                              </div>
                            );
                          })}

                          <div className="border-t border-gray-300 pt-1 mt-1 ml-4 flex justify-between items-center">
                            <span className="text-sm font-medium">
                              Total {subgroup.code}-{subgroup.name}
                            </span>
                            <span className={`text-sm font-medium text-right ${amountValueClass()}`}>
                              {formatBalance(subgroupTotal)}
                            </span>
                          </div>
                        </div>
                      );
                  })}

                  <div className="border-t-2 border-gray-400 pt-1 flex justify-between items-center mt-2 mb-4">
                    <span className="text-base font-semibold">
                      Total {mainGroup.code}-{mainGroup.name}
                    </span>
                    <span className={`text-base font-semibold text-right ${amountValueClass()}`}>
                      {formatBalance(mainGroupTotal)}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="border-t-4 border-double border-gray-800 pt-2 mt-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Total Assets</h2>
                <h2 className={`text-lg font-bold text-right ${amountValueClass()}`}>
                  {formatBalance(totalAssets)}
                </h2>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities and Capital Column */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">Liabilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {balanceSheetData.liabilities?.map((mainGroup) => {
              const visibleSubgroups = getVisibleSubgroups(
                mainGroup.coa_sub_groups,
              );
              if (visibleSubgroups.length === 0) return null;

              const mainGroupTotal = calculateMainGroupTotal(mainGroup);
              return (
                <div key={mainGroup.id} className="ml-4">
                  <h3 className="text-base font-semibold mb-2">
                    {mainGroup.code}-{mainGroup.name}
                  </h3>

                  {visibleSubgroups.map((subgroup) => {
                    const subgroupTotal = calculateSubgroupTotal(subgroup);
                    const visibleAccounts = getVisibleAccounts(
                      subgroup.coa_accounts,
                    );
                    return (
                      <div key={subgroup.id} className="mb-4 ml-4">
                        <h4 className="text-sm font-medium mb-1 text-gray-700">
                          {subgroup.code}-{subgroup.name}
                        </h4>

                        {visibleAccounts.map((account) => {
                          const accountBalance = getAccountBalance(account);
                          return (
                            <div
                              key={account.id}
                              className="flex justify-between items-center py-0.5 ml-4"
                            >
                              <span className="text-xs text-gray-600">
                                {account.code}-{account.name}
                              </span>
                              <span className={`text-xs text-right ${amountValueClass()}`}>
                                {formatBalance(accountBalance ?? 0, true)}
                              </span>
                            </div>
                          );
                        })}

                        <div className="border-t border-gray-300 pt-1 mt-1 ml-4 flex justify-between items-center">
                          <span className="text-sm font-medium">
                            Total {subgroup.code}-{subgroup.name}
                          </span>
                          <span className={`text-sm font-medium text-right ${amountValueClass()}`}>
                            {formatBalance(subgroupTotal, true)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  <div className="border-t-2 border-gray-400 pt-1 flex justify-between items-center mt-2 mb-4">
                    <span className="text-base font-semibold">
                      Total {mainGroup.code}-{mainGroup.name}
                    </span>
                    <span className={`text-base font-semibold text-right ${amountValueClass()}`}>
                      {formatBalance(mainGroupTotal, true)}
                    </span>
                  </div>
                </div>
              );
            })}

            <div className="border-t-2 border-gray-400 pt-2 mt-2">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold">Total Liabilities</h2>
                <h2 className={`text-lg font-bold text-right ${amountValueClass()}`}>
                  {formatBalance(totalLiabilities, true)}
                </h2>
              </div>
            </div>

            {/* Supplier Accounts Section */}
            {(() => {
              const visibleSupplierAccounts =
                balanceSheetData.supplierAccounts?.filter((account) => {
                  const bal =
                    typeof account.balance === "number"
                      ? account.balance
                      : account.balance?.balance ?? 0;
                  return !isEffectivelyZero(bal);
                }) ?? [];
              if (visibleSupplierAccounts.length === 0) return null;

              return (
              <div className="mt-6">
                <h2 className="text-lg font-bold mb-3">Supplier Accounts (Payables)</h2>
                <div className="ml-4">
                  {visibleSupplierAccounts.map((account) => {
                    const bal = typeof account.balance === "number" ? account.balance : account.balance?.balance ?? 0;
                    return (
                      <div
                        key={account.id}
                        className="flex justify-between items-center py-0.5"
                      >
                        <span className="text-xs text-gray-600">
                          {account.code} - {account.name}
                          {account.supplierName && account.supplierName !== account.name && (
                            <span className="text-gray-400 ml-1">({account.supplierName})</span>
                          )}
                        </span>
                        <span className={`text-xs text-right ${amountValueClass()}`}>
                          {formatBalance(bal, true)}
                        </span>
                      </div>
                    );
                  })}
                  <div className="border-t border-gray-300 pt-1 mt-1 flex justify-between items-center">
                    <span className="text-sm font-medium">Total Supplier Payables</span>
                    <span className={`text-sm font-medium text-right ${amountValueClass()}`}>
                      {formatBalance(
                        visibleSupplierAccounts.reduce((sum, a) => {
                          const b = typeof a.balance === "number" ? a.balance : a.balance?.balance ?? 0;
                          return sum + b;
                        }, 0),
                        true,
                      )}
                    </span>
                  </div>
                </div>
              </div>
              );
            })()}

            <div className="mt-8">
              <h2 className="text-lg font-bold mb-4">Capital</h2>

              {balanceSheetData.capital?.map((mainGroup) => {
                const visibleSubgroups = getVisibleSubgroups(
                  mainGroup.coa_sub_groups,
                );
                if (visibleSubgroups.length === 0) return null;

                const mainGroupTotal = calculateMainGroupTotal(mainGroup);
                return (
                  <div key={mainGroup.id} className="ml-4">
                    <h3 className="text-base font-semibold mb-2">
                      {mainGroup.code}-{mainGroup.name}
                    </h3>

                    {visibleSubgroups.map((subgroup) => {
                      const subgroupTotal = calculateSubgroupTotal(subgroup);
                      const visibleAccounts = getVisibleAccounts(
                        subgroup.coa_accounts,
                      );
                      return (
                        <div key={subgroup.id} className="mb-4 ml-4">
                          <h4 className="text-sm font-medium mb-1 text-gray-700">
                            {subgroup.code}-{subgroup.name}
                          </h4>

                          {visibleAccounts.map((account) => {
                            const accountBalance = getAccountBalance(account);
                            return (
                              <div
                                key={account.id}
                                className="flex justify-between items-center py-0.5 ml-4"
                              >
                                <span className="text-xs text-gray-600">
                                  {account.code}-{account.name}
                                </span>
                                <span className={`text-xs text-right ${amountValueClass()}`}>
                                  {formatBalance(accountBalance, true)}
                                </span>
                              </div>
                            );
                          })}

                          <div className="border-t border-gray-300 pt-1 mt-1 ml-4 flex justify-between items-center">
                            <span className="text-sm font-medium">
                              Total {subgroup.code}-{subgroup.name}
                            </span>
                            <span className={`text-sm font-medium text-right ${amountValueClass()}`}>
                              {formatBalance(subgroupTotal, true)}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    <div className="border-t-2 border-gray-400 pt-1 flex justify-between items-center mt-2 mb-4">
                      <span className="text-base font-semibold">
                        Total {mainGroup.code}-{mainGroup.name}
                      </span>
                      <span className={`text-base font-semibold text-right ${amountValueClass()}`}>
                        {formatBalance(mainGroupTotal, true)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Net Income */}
              <div className="border-b pb-1 ml-4 flex justify-between items-center mt-2">
                <span className="text-sm">Net Income</span>
                <span className={`text-sm text-right ${amountValueClass()}`}>
                  {(() => {
                    const revenue = balanceSheetData?.revenue || 0;
                    const cost = balanceSheetData?.cost || 0;
                    const expense = balanceSheetData?.expense || 0;
                    const netIncome = revenue - cost - expense;
                    return formatBalance(netIncome, true);
                  })()}
                </span>
              </div>

              <div className="border-t-2 pt-2 mt-2">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold">Total Capital</h2>
                  <h2 className={`text-lg font-bold text-right ${amountValueClass()}`}>
                    {formatBalance(totalCapital, true)}
                  </h2>
                </div>
              </div>

              <div className="border-t-2 pt-2 mt-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-bold">
                    Total Liabilities and Capital
                  </h2>
                  <h2 className={`text-lg font-bold text-right ${amountValueClass()}`}>
                    {formatBalance(totalLiabilitiesAndCapital, true)}
                  </h2>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
