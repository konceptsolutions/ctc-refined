import { useState, useEffect } from "react";
import { getCurrentDatePakistan, getStartOfCurrentMonthPakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  BookOpen,
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Download,
  Calendar,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft
} from "lucide-react";

interface LedgerTransaction {
  id: string;
  date: string;
  journalNo: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

interface LedgerAccount {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
  openingBalance: number;
  currentBalance: number;
  transactions: LedgerTransaction[];
}


const accountTypeColors = {
  asset: "bg-info/10 text-info border-info/20",
  liability: "bg-warning/10 text-warning border-warning/20",
  equity: "bg-chart-purple/10 text-chart-purple border-chart-purple/20",
  revenue: "bg-success/10 text-success border-success/20",
  expense: "bg-destructive/10 text-destructive border-destructive/20",
};

export const GeneralLedgerTab = () => {
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(""); // This will now be used for client-side filtering
  const [typeFilter, setTypeFilter] = useState("all"); // This will now be used for client-side filtering
  const [expandedAccounts, setExpandedAccounts] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState(getStartOfCurrentMonthPakistan());
  const [dateTo, setDateTo] = useState(getCurrentDatePakistan());
  const [filterAccount, setFilterAccount] = useState("all"); // For API filtering by account_id

  useEffect(() => {
    fetchLedger();
  }, [dateFrom, dateTo, filterAccount]); // API call dependencies

  const fetchLedger = async () => {
    try {
      setLoading(true);
      const params: { [key: string]: any } = {
        from_date: dateFrom,
        to_date: dateTo,
      };
      if (filterAccount !== "all") params.account_id = filterAccount;

      const result = await apiClient.get<LedgerAccount[]>('/accounting/general-ledger', { params });
      if (result.data) {
        setAccounts(result.data);
      }
    } catch (error) {
      console.error("Failed to fetch general ledger:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const csvContent = [
      ["Account Code", "Account Name", "Type", "Opening Balance", "Current Balance"].join(","),
      ...accounts.map(acc => [
        acc.code,
        acc.name,
        acc.type,
        acc.openingBalance,
        acc.currentBalance
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `general_ledger_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredAccounts = accounts.filter(account => {
    const matchesSearch = account.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      account.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === "all" || account.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const toggleAccount = (code: string) => {
    setExpandedAccounts(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : [...prev, code]
    );
  };

  const expandAll = () => {
    setExpandedAccounts(filteredAccounts.map(a => a.code));
  };

  const collapseAll = () => {
    setExpandedAccounts([]);
  };

  const getBalanceIndicator = (account: LedgerAccount) => {
    const change = account.currentBalance - account.openingBalance;
    if (change > 0) {
      return <TrendingUp className="h-4 w-4 text-success" />;
    } else if (change < 0) {
      return <TrendingDown className="h-4 w-4 text-destructive" />;
    }
    return <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />;
  };

  const totalsByType = {
    assets: accounts.filter(a => a.type === "asset").reduce((sum, a) => sum + a.currentBalance, 0),
    liabilities: accounts.filter(a => a.type === "liability").reduce((sum, a) => sum + a.currentBalance, 0),
    equity: accounts.filter(a => a.type === "equity").reduce((sum, a) => sum + a.currentBalance, 0),
    revenue: accounts.filter(a => a.type === "revenue").reduce((sum, a) => sum + a.currentBalance, 0),
    expenses: accounts.filter(a => a.type === "expense").reduce((sum, a) => sum + a.currentBalance, 0),
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-info/20 bg-info/5 transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Assets</p>
            <p className="text-lg font-bold text-info">Rs {totalsByType.assets.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-warning/20 bg-warning/5 transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Liabilities</p>
            <p className="text-lg font-bold text-warning">Rs {totalsByType.liabilities.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-chart-purple/20 bg-chart-purple/5 transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Equity</p>
            <p className="text-lg font-bold" style={{ color: "hsl(var(--chart-purple))" }}>Rs {totalsByType.equity.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-success/20 bg-success/5 transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Revenue</p>
            <p className="text-lg font-bold text-success">Rs {totalsByType.revenue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5 transition-all duration-200 hover:shadow-md">
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total Expenses</p>
            <p className="text-lg font-bold text-destructive">Rs {totalsByType.expenses.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              General Ledger
            </CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={expandAll}>
                Expand All
              </Button>
              <Button variant="outline" size="sm" onClick={collapseAll}>
                Collapse All
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account code or name..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="asset">Assets</SelectItem>
                <SelectItem value="liability">Liabilities</SelectItem>
                <SelectItem value="equity">Equity</SelectItem>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="expense">Expenses</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input
                type="date"
                placeholder="From"
                className="w-[140px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                type="date"
                placeholder="To"
                className="w-[140px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredAccounts.map((account) => (
              <Collapsible
                key={account.code}
                open={expandedAccounts.includes(account.code)}
                onOpenChange={() => toggleAccount(account.code)}
              >
                <Card className="border-border/50 overflow-hidden transition-all duration-200 hover:shadow-md">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {expandedAccounts.includes(account.code) ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform" />
                          )}
                          <span className="font-mono text-primary font-medium">{account.code}</span>
                        </div>
                        <div>
                          <p className="font-medium">{account.name}</p>
                          <Badge variant="outline" className={`text - xs ${accountTypeColors[account.type]} `}>
                            {account.type.charAt(0).toUpperCase() + account.type.slice(1)}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 text-right">
                        <div>
                          <p className="text-xs text-muted-foreground">Opening</p>
                          <p className="font-mono text-sm">Rs {account.openingBalance.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Current Balance</p>
                            <p className="font-mono font-semibold text-lg">Rs {account.currentBalance.toLocaleString()}</p>
                          </div>
                          {getBalanceIndicator(account)}
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t bg-muted/20 animate-accordion-down">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <ListNumberHeader />
                            <TableHead className="w-[100px]">Date</TableHead>
                            <TableHead className="w-[120px]">Journal No.</TableHead>
                            <TableHead className="w-[100px]">Reference</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="w-[100px] text-right">Debit</TableHead>
                            <TableHead className="w-[100px] text-right">Credit</TableHead>
                            <TableHead className="w-[120px] text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {account.transactions.map((txn, index) => (
                            <TableRow
                              key={txn.id}
                              className="transition-colors hover:bg-muted/30"
                              style={{ animationDelay: `${index * 50} ms` }}
                            >
                              <ListNumberCell index={index} />
                              <TableCell>{txn.date}</TableCell>
                              <TableCell className="text-primary">{txn.journalNo}</TableCell>
                              <TableCell>{txn.reference}</TableCell>
                              <TableCell>{txn.description}</TableCell>
                              <TableCell className="text-right font-mono">
                                {txn.debit > 0 ? `Rs ${txn.debit.toLocaleString()} ` : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {txn.credit > 0 ? `Rs ${txn.credit.toLocaleString()} ` : "-"}
                              </TableCell>
                              <TableCell className="text-right font-mono font-medium">
                                Rs {txn.balance.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>

          <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
            <span>Showing {filteredAccounts.length} of {accounts.length} accounts</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
