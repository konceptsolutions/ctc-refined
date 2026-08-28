import { formatUiDate } from "@/utils/dateUtils";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fcHeaderClass,
  fcValueClass,
  lcHeaderClass,
  lcValueClass,
} from "@/utils/accountingColors";
import { VoucherViewDialog } from "@/components/vouchers/VoucherViewDialog";
import {
  PartyLedgerHeader,
  type LedgerPartyDetails,
} from "@/components/financial/PartyLedgerHeader";

type CurrencyMode = "local" | "foreign";

interface LedgerEntry {
  id: number | string;
  tId: number | null;
  voucherId?: string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
  debitFc: number | null;
  creditFc: number | null;
  balanceFc: number;
  conversionRate?: number | null;
  currencyName?: string;
}

interface SupplierAccountOption {
  id: string;
  name: string;
  supplierName?: string;
  currencyName?: string;
  accountCategory?: "supplier_payable" | "supplier_security";
}

export const InternationalSupplierLedgersTab = () => {
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState("");
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>("local");
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<(number | string)[]>([]);
  const [accounts, setAccounts] = useState<SupplierAccountOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [currencyName, setCurrencyName] = useState("USD");
  const [viewingVoucher, setViewingVoucher] = useState<{
    id?: string | null;
    number?: string | null;
  } | null>(null);
  const [partyDetails, setPartyDetails] = useState<LedgerPartyDetails | null>(null);
  const [currentBalanceLc, setCurrentBalanceLc] = useState<number | null>(null);
  const [currentBalanceFc, setCurrentBalanceFc] = useState<number | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const response = (await apiClient.getInternationalSupplierAccounts()) as any;
        if (response.data) {
          setAccounts(response.data);
        }
      } catch {
        // ignore bootstrap errors; search will surface issues
      }
    };
    loadAccounts();
  }, []);

  const accountOptions: SearchableSelectOption[] = useMemo(
    () =>
      accounts.map((acc) => ({
        value: acc.id,
        label:
          acc.accountCategory === "supplier_security"
            ? `${acc.name} (Supplier Security)`
            : acc.supplierName
              ? `${acc.name} (${acc.supplierName})`
              : acc.name,
      })),
    [accounts],
  );

  const formatLocalNumber = (num: number | null) => {
    if (num === null || num === undefined) return "-";
    return num.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatForeignNumber = (num: number | null) => {
    if (num === null || num === undefined) return "-";
    return `$ ${num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatAmount = (num: number | null) =>
    currencyMode === "foreign" ? formatForeignNumber(num) : formatLocalNumber(num);

  const formatExchangeRate = (rate?: number | null) => {
    const value = Number(rate);
    if (!Number.isFinite(value) || value <= 0) return "-";
    return value.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  };

  const getDebit = (entry: LedgerEntry) =>
    currencyMode === "foreign" ? entry.debitFc : entry.debit;

  const getCredit = (entry: LedgerEntry) =>
    currencyMode === "foreign" ? entry.creditFc : entry.credit;

  const getBalance = (entry: LedgerEntry) =>
    currencyMode === "foreign" ? entry.balanceFc : entry.balance;

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

  const toggleEntry = (id: number | string) => {
    setSelectedEntries((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const fetchLedgers = async () => {
    if (!selectedAccount) {
      toast({
        title: "Account Required",
        description: "Please select an international supplier account",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = (await apiClient.getInternationalSupplierLedgers({
        account: selectedAccount,
        from_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
        to_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
        page: 1,
        limit: 10000,
      })) as any;

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }

      setEntries(response.data || []);
      setCurrencyName(response.meta?.currencyName || "USD");
      setPartyDetails(response.meta?.party || null);
      const rows = response.data || [];
      setCurrentBalanceLc(
        rows.length > 0
          ? Number(rows[rows.length - 1]?.balance ?? response.meta?.currentBalance ?? 0)
          : Number(response.meta?.currentBalance ?? 0),
      );
      setCurrentBalanceFc(
        rows.length > 0
          ? Number(rows[rows.length - 1]?.balanceFc ?? response.meta?.currentBalanceFc ?? 0)
          : Number(response.meta?.currentBalanceFc ?? 0),
      );
      setSelectedEntries([]);
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

  const handleExportCSV = () => {
    const modeLabel = currencyMode === "foreign" ? "FC" : "LC";
    const headers = [
      "T_Id",
      "Voucher No",
      "Time Stamp",
      "Description",
      ...(currencyMode === "foreign" ? ["Exchange Rate"] : []),
      `Debit (${modeLabel})`,
      `Credit (${modeLabel})`,
      `Balance (${modeLabel})`,
    ];
    const csvContent = [
      headers.join(","),
      ...entries.map((entry) =>
        [
          entry.tId ?? "",
          entry.voucherNo,
          entry.timeStamp,
          `"${String(entry.description || "").replace(/"/g, '""')}"`,
          ...(currencyMode === "foreign"
            ? [entry.conversionRate ?? ""]
            : []),
          getDebit(entry) ?? "",
          getCredit(entry) ?? "",
          getBalance(entry),
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `international_supplier_ledgers_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "International supplier ledger exported to CSV successfully.",
    });
  };

  const handlePrint = () => {
    const modeLabel =
      currencyMode === "foreign"
        ? `Foreign Currency (${currencyName})`
        : "Local Currency";
    const selectedAccountLabel =
      accountOptions.find((a) => a.value === selectedAccount)?.label ||
      selectedAccount;
    const opened = printLedgers({
      title: "International Supplier Ledger",
      fromDate,
      toDate,
      accountLabel: selectedAccountLabel || undefined,
      subtitle: `Currency mode: ${modeLabel}`,
      showExchangeRate: currencyMode === "foreign",
      party: partyDetails,
      currentBalance:
        currencyMode === "foreign" ? currentBalanceFc : currentBalanceLc,
      balanceLabel:
        currencyMode === "foreign" ? `Balance (${currencyName})` : "Balance (LC)",
      entries: entries.map((entry) => ({
        tId: entry.tId,
        voucherNo: entry.voucherNo,
        timeStamp: entry.timeStamp,
        description: entry.description,
        debit: getDebit(entry),
        credit: getCredit(entry),
        balance: getBalance(entry),
        exchangeRate: entry.conversionRate,
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
            International Supplier Ledger
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Account (International Suppliers)</Label>
            <SearchableSelect
              options={accountOptions}
              value={selectedAccount}
              onValueChange={(val) => {
                setSelectedAccount(val);
                setPartyDetails(null);
                setCurrentBalanceLc(null);
                setCurrentBalanceFc(null);
                setEntries([]);
              }}
              placeholder="Select international supplier account..."
            />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select
              value={currencyMode}
              onValueChange={(value) => setCurrencyMode(value as CurrencyMode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local Currency (LC)</SelectItem>
                <SelectItem value="foreign">Foreign Currency (FC)</SelectItem>
              </SelectContent>
            </Select>
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
                    !fromDate && "text-muted-foreground",
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
          <div className="space-y-2">
            <Label>To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-44 justify-start text-left font-normal",
                    !toDate && "text-muted-foreground",
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
          <Button onClick={fetchLedgers} disabled={loading}>
            Search
          </Button>
        </div>

        <PartyLedgerHeader
          party={partyDetails}
          balance={currencyMode === "foreign" ? currentBalanceFc : currentBalanceLc}
          balanceLabel={
            currencyMode === "foreign" ? `Balance (${currencyName})` : "Balance (LC)"
          }
          formatBalance={formatAmount}
        />

        {currencyMode === "foreign" ? (
          <p className="text-xs text-muted-foreground">
            Foreign amounts are derived as LC ÷ voucher exchange rate. Displayed with $ sign.
          </p>
        ) : null}

        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="w-12">
                  <Checkbox
                    checked={
                      selectedEntries.length === entries.length && entries.length > 0
                    }
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold underline">T_Id</TableHead>
                <TableHead className="font-semibold underline">Voucher No</TableHead>
                <TableHead className="font-semibold underline">Time Stamp</TableHead>
                <TableHead className="font-semibold underline">Description</TableHead>
                {currencyMode === "foreign" ? (
                  <TableHead className="font-semibold underline text-right">
                    Exchange Rate
                  </TableHead>
                ) : null}
                <TableHead className={`font-semibold underline text-right ${currencyMode === "foreign" ? fcHeaderClass : lcHeaderClass}`}>Dr</TableHead>
                <TableHead className={`font-semibold underline text-right ${currencyMode === "foreign" ? fcHeaderClass : lcHeaderClass}`}>Cr</TableHead>
                <TableHead className={`font-semibold underline text-right ${currencyMode === "foreign" ? fcHeaderClass : lcHeaderClass}`}>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={currencyMode === "foreign" ? 10 : 9}
                    className="text-center py-8 text-muted-foreground"
                  >
                    Loading...
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={currencyMode === "foreign" ? 10 : 9}
                    className="text-center py-8"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Users className="h-12 w-12 text-muted-foreground/50" />
                      <p className="text-muted-foreground font-medium">
                        {selectedAccount
                          ? "No ledger entries found"
                          : "Please select an international supplier account"}
                      </p>
                      <p className="text-sm text-muted-foreground/70">
                        {selectedAccount
                          ? "Try adjusting your date range"
                          : "Choose a supplier account and click Search"}
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
                      <TableCell>{formatDisplayValue(entry.timeStamp)}</TableCell>
                      <TableCell>{entry.description}</TableCell>
                      {currencyMode === "foreign" ? (
                        <TableCell className="text-right">
                          {formatExchangeRate(entry.conversionRate)}
                        </TableCell>
                      ) : null}
                      <TableCell className={`text-right ${currencyMode === "foreign" ? fcValueClass(getDebit(entry)) : lcValueClass(getDebit(entry))}`}>
                        {formatAmount(getDebit(entry))}
                      </TableCell>
                      <TableCell className={`text-right ${currencyMode === "foreign" ? fcValueClass(getCredit(entry)) : lcValueClass(getCredit(entry))}`}>
                        {formatAmount(getCredit(entry))}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${currencyMode === "foreign" ? fcValueClass(getBalance(entry)) : lcValueClass(getBalance(entry))}`}>
                        {formatAmount(getBalance(entry))}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted font-bold">
                    <TableCell
                      colSpan={currencyMode === "foreign" ? 7 : 6}
                      className="text-right"
                    >
                      Total:
                    </TableCell>
                    <TableCell className={`text-right ${currencyMode === "foreign" ? fcValueClass(1, true) : lcValueClass(1, true)}`}>
                      {formatAmount(
                        entries.reduce((sum, e) => sum + (getDebit(e) || 0), 0),
                      )}
                    </TableCell>
                    <TableCell className={`text-right ${currencyMode === "foreign" ? fcValueClass(1, true) : lcValueClass(1, true)}`}>
                      {formatAmount(
                        entries.reduce((sum, e) => sum + (getCredit(e) || 0), 0),
                      )}
                    </TableCell>
                    <TableCell />
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
