import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Users, Download, Eye } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printLedgers } from "@/utils/printLedgersPdf";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  SearchableSelect,
  SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { VoucherViewDialog } from "@/components/vouchers/VoucherViewDialog";
import {
  balanceHeaderClass,
  balanceValueClass,
  crHeaderClass,
  crValueClass,
  drHeaderClass,
  drValueClass,
} from "@/utils/accountingColors";

interface LedgerEntry {
  id: number;
  tId: number | null;
  voucherId?: string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
}

interface AccountGroup {
  id: string;
  name: string;
  mainGroup?: string;
  subGroup?: string;
}

// Helper function to get current date in YYYY-MM-DD format
const getCurrentDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const LedgersTab = () => {
  const { toast } = useToast();
  const [selectedMainGroup, setSelectedMainGroup] = useState("");
  const [selectedSubGroup, setSelectedSubGroup] = useState("");
  const [selectedAccount, setSelectedAccount] = useState("");
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1); // Default to first of month
    return d;
  });
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<number[]>([]);
  const [mainGroups, setMainGroups] = useState<AccountGroup[]>([]);
  const [subGroups, setSubGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AccountGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<{
    id?: string | null;
    number?: string | null;
  } | null>(null);

  useEffect(() => {
    const fetchAccountGroups = async () => {
      try {
        const response = await apiClient.getAccountGroups();
        if (response.data) {
          setMainGroups(response.data.mainGroups || []);
          setSubGroups(response.data.subGroups || []);
          setAccounts(response.data.accounts || []);
        }
      } catch (error) { }
    };
    fetchAccountGroups();
  }, []);

  const filteredSubGroups = selectedMainGroup
    ? subGroups.filter((sg) => sg.mainGroup === selectedMainGroup)
    : subGroups;

  const filteredAccounts = selectedSubGroup
    ? accounts.filter((acc) => acc.subGroup === selectedSubGroup)
    : accounts;

  // Transform accounts to SearchableSelect options
  const accountOptions: SearchableSelectOption[] = filteredAccounts.map(
    (acc) => ({
      value: acc.id,
      label: acc.name,
    }),
  );

  const formatNumber = (num: number | null) => {
    if (num === null) return "-";
    return num.toLocaleString("en-PK");
  };

  const formatDisplayValue = (value: string | number | null) => {
    if (value === null || value === undefined) return "-";
    if (value === "-") return "-";
    return String(value);
  };

  const toggleSelectAll = () => {
    if (selectedEntries.length === entries.length) {
      setSelectedEntries([]);
    } else {
      setSelectedEntries(entries.map((e) => e.id));
    }
  };

  const toggleEntry = (id: number) => {
    setSelectedEntries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const fetchLedgers = async () => {
    // Don't fetch if no account is selected
    if (!selectedAccount) {
      toast({
        title: "Account Required",
        description: "Please select an account to view its ledger",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiClient.getLedgers({
        main_group: selectedMainGroup || undefined,
        sub_group: selectedSubGroup || undefined,
        account: selectedAccount || undefined,
        from_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
        to_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
        page: 1,
        limit: 10000, // Fetch all entries at once
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
        setEntries(response.data);
      } else {
        setEntries([]);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch ledger entries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Don't auto-fetch on mount - only fetch when user clicks Search
  // useEffect(() => {
  //   fetchLedgers();
  // }, []);

  const handleSearch = () => {
    fetchLedgers();
  };

  const handleExportCSV = () => {
    const headers = [
      "T_Id",
      "Voucher No",
      "Time Stamp",
      "Description",
      "Debit",
      "Credit",
      "Balance",
    ];
    const csvContent = [
      headers.join(","),
      ...entries.map((entry) =>
        [
          entry.tId ?? "",
          entry.voucherNo,
          entry.timeStamp,
          `"${entry.description.replace(/"/g, '""')}"`,
          entry.debit ?? "",
          entry.credit ?? "",
          entry.balance,
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ledgers_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "Ledgers exported to CSV successfully.",
    });
  };

  const handlePrint = () => {
    const selectedAccountLabel =
      accounts.find((a) => a.id === selectedAccount)?.name || selectedAccount;
    const opened = printLedgers({
      title: "Ledgers",
      fromDate,
      toDate,
      accountLabel: selectedAccountLabel || undefined,
      entries: entries.map((entry) => ({
        tId: entry.tId,
        voucherNo: entry.voucherNo,
        timeStamp: entry.timeStamp,
        description: entry.description,
        debit: entry.debit,
        credit: entry.credit,
        balance: entry.balance,
      })),
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
            Ledgers
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
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label>Main Group</Label>
            <SearchableSelect
              options={mainGroups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
              value={selectedMainGroup}
              onValueChange={(val) => {
                setSelectedMainGroup(val);
                setSelectedSubGroup("");
                setSelectedAccount("");
              }}
              placeholder="Search main group..."
            />
          </div>
          <div className="space-y-2">
            <Label>Sub Group</Label>
            <SearchableSelect
              options={filteredSubGroups.map((group) => ({
                value: group.id,
                label: group.name,
              }))}
              value={selectedSubGroup}
              onValueChange={(val) => {
                setSelectedSubGroup(val);
                setSelectedAccount("");
              }}
              placeholder="Search sub group..."
            />
          </div>
          <div className="space-y-2">
            <Label>Account</Label>
            <SearchableSelect
              options={accountOptions}
              value={selectedAccount}
              onValueChange={setSelectedAccount}
              placeholder="Select..."
            />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label>From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-44 justify-start text-left font-normal",
                    !fromDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : <span>Pick a date</span>}
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
          <div className="space-y-2">
            <Label>To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-44 justify-start text-left font-normal",
                    !toDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, "dd/MM/yyyy") : <span>Pick a date</span>}
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
          <Button onClick={handleSearch} disabled={loading}>
            Search
          </Button>
        </div>

        {/* Ledger Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedEntries.length === entries.length &&
                      entries.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold underline">T_Id</TableHead>
                <TableHead className="font-semibold underline">
                  Voucher No
                </TableHead>
                <TableHead className="font-semibold underline">
                  Time Stamp
                </TableHead>
                <TableHead className="font-semibold underline">
                  Description
                </TableHead>
                <TableHead className={`font-semibold underline text-right ${drHeaderClass}`}>
                  Dr
                </TableHead>
                <TableHead className={`font-semibold underline text-right ${crHeaderClass}`}>
                  Cr
                </TableHead>
                <TableHead className={`font-semibold underline text-right ${balanceHeaderClass}`}>
                  Balance
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-12 w-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground font-medium">
                        {selectedAccount
                          ? "No ledger entries found"
                          : "Please select an account to view ledger"}
                      </p>
                      <p className="text-sm text-muted-foreground/70">
                        {selectedAccount
                          ? "Try adjusting your date range or filters"
                          : "Choose an account from the dropdown above and click Search"}
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {entries.map((entry, index) => (
                    <TableRow key={entry.id} className="hover:bg-muted/30">
                      <ListNumberCell index={index} total={entries.length} />
                      <TableCell>
                        <Checkbox
                          checked={selectedEntries.includes(entry.id)}
                          onCheckedChange={() => toggleEntry(entry.id)}
                        />
                      </TableCell>
                      <TableCell>{formatDisplayValue(entry.tId)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span>{formatDisplayValue(entry.voucherNo)}</span>
                          {entry.voucherNo && entry.voucherNo !== "-" ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              title="View voucher"
                              onClick={() =>
                                setViewingVoucher({
                                  id: entry.voucherId,
                                  number: entry.voucherNo,
                                })
                              }
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        {formatDisplayValue(entry.timeStamp)}
                      </TableCell>
                      <TableCell>{entry.description}</TableCell>
                      <TableCell className={`text-right ${drValueClass(entry.debit)}`}>
                        {formatNumber(entry.debit)}
                      </TableCell>
                      <TableCell className={`text-right ${crValueClass(entry.credit)}`}>
                        {formatNumber(entry.credit)}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${balanceValueClass(entry.balance)}`}>
                        {formatNumber(entry.balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total Row */}
                  <TableRow className="bg-muted font-bold">
                    <TableCell colSpan={6} className="text-right">
                      Total:
                    </TableCell>
                    <TableCell className={`text-right ${drValueClass(1, true)}`}>
                      {formatNumber(
                        entries.reduce((sum, e) => sum + (e.debit || 0), 0),
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${crValueClass(1, true)}`}>
                      {formatNumber(
                        entries.reduce((sum, e) => sum + (e.credit || 0), 0),
                      )}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <VoucherViewDialog
        open={Boolean(viewingVoucher)}
        onOpenChange={(open) => {
          if (!open) setViewingVoucher(null);
        }}
        voucherId={viewingVoucher?.id}
        voucherNumber={viewingVoucher?.number}
      />
    </Card>
  );
};
