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
import { ListNumberCell, ListNumberHeader } from "@/components/ui/list-table-number";
import { ArrowLeftRight, Calendar as CalendarIcon } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
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
  id: number | string;
  tId: number | null;
  voucherId?: string | null;
  voucherNo: string;
  timeStamp: string;
  description: string;
  debit: number | null;
  credit: number | null;
  balance: number;
}

interface PartyAccount {
  id: string;
  name: string;
  code?: string;
  supplierId?: string | null;
  customerId?: string | null;
  supplierName?: string;
  customerName?: string;
}

const formatNumber = (num: number | null | undefined) => {
  if (num === null || num === undefined) return "-";
  return num.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const closingBalance = (entries: LedgerEntry[]) => {
  if (!entries.length) return 0;
  return Number(entries[entries.length - 1]?.balance || 0);
};

export const SupplierCustomerComparisonTab = () => {
  const { toast } = useToast();
  const [supplierAccounts, setSupplierAccounts] = useState<PartyAccount[]>([]);
  const [customerAccounts, setCustomerAccounts] = useState<PartyAccount[]>([]);
  const [supplierAccountId, setSupplierAccountId] = useState("");
  const [customerAccountId, setCustomerAccountId] = useState("");
  const [fromDate, setFromDate] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [toDate, setToDate] = useState<Date | undefined>(new Date());
  const [supplierEntries, setSupplierEntries] = useState<LedgerEntry[]>([]);
  const [customerEntries, setCustomerEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewingVoucher, setViewingVoucher] = useState<{
    id?: string | null;
    number?: string | null;
  } | null>(null);

  useEffect(() => {
    const loadAccounts = async () => {
      try {
        const [supplierRes, customerRes] = await Promise.all([
          apiClient.getSupplierAccounts(),
          apiClient.getCustomerAccounts(),
        ]);
        setSupplierAccounts((supplierRes as any)?.data || []);
        setCustomerAccounts((customerRes as any)?.data || []);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error?.message || "Failed to load accounts",
          variant: "destructive",
        });
      }
    };
    void loadAccounts();
  }, [toast]);

  const supplierOptions: SearchableSelectOption[] = useMemo(
    () =>
      supplierAccounts.map((acc) => ({
        value: acc.id,
        label: acc.name,
        description: acc.supplierName || undefined,
      })),
    [supplierAccounts],
  );

  const customerOptions: SearchableSelectOption[] = useMemo(
    () =>
      customerAccounts.map((acc) => ({
        value: acc.id,
        label: acc.name,
        description: acc.customerName || undefined,
      })),
    [customerAccounts],
  );

  const supplierLabel =
    supplierAccounts.find((a) => a.id === supplierAccountId)?.name || "";
  const customerLabel =
    customerAccounts.find((a) => a.id === customerAccountId)?.name || "";

  const supplierBalance = closingBalance(supplierEntries);
  const customerBalance = closingBalance(customerEntries);
  const combinedBalance = customerBalance - supplierBalance;

  const fetchLedger = async (accountId: string) => {
    const response = await apiClient.getLedgers({
      account: accountId,
      from_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
      to_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
      page: 1,
      limit: 10000,
    });
    if ((response as any)?.error) {
      throw new Error((response as any).error);
    }
    return ((response as any)?.data || []) as LedgerEntry[];
  };

  const handleSearch = async () => {
    if (!supplierAccountId || !customerAccountId) {
      toast({
        title: "Accounts required",
        description: "Select both a supplier account and a customer account.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const [supplierData, customerData] = await Promise.all([
        fetchLedger(supplierAccountId),
        fetchLedger(customerAccountId),
      ]);
      setSupplierEntries(supplierData);
      setCustomerEntries(customerData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load ledgers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const renderLedgerTable = (
    title: string,
    accountLabel: string,
    entries: LedgerEntry[],
  ) => (
    <Card className="min-w-0">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground truncate">
          {accountLabel || "No account selected"}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-t max-h-[560px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="font-semibold underline">T_Id</TableHead>
                <TableHead className="font-semibold underline">Voucher No</TableHead>
                <TableHead className="font-semibold underline">Date</TableHead>
                <TableHead className="font-semibold underline">Description</TableHead>
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
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No ledger entries
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, index) => (
                  <TableRow key={String(entry.id)}>
                    <ListNumberCell index={index} total={entries.length} />
                    <TableCell>{entry.tId ?? "-"}</TableCell>
                    <TableCell>
                      {entry.voucherNo && entry.voucherNo !== "-" ? (
                        <button
                          type="button"
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={() =>
                            setViewingVoucher({
                              id: entry.voucherId,
                              number: entry.voucherNo,
                            })
                          }
                        >
                          {entry.voucherNo}
                        </button>
                      ) : (
                        entry.voucherNo || "-"
                      )}
                    </TableCell>
                    <TableCell>{entry.timeStamp}</TableCell>
                    <TableCell className="max-w-[180px] truncate" title={entry.description}>
                      {entry.description || "-"}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${drValueClass()}`}>
                      {formatNumber(entry.debit)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${crValueClass()}`}>
                      {formatNumber(entry.credit)}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums font-medium ${balanceValueClass()}`}>
                      {formatNumber(entry.balance)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2 text-lg">
          <ArrowLeftRight className="h-5 w-5 text-primary" />
          Supplier Customer Comparison
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Supplier Account</Label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierAccountId}
              onValueChange={setSupplierAccountId}
              placeholder="Select supplier account..."
            />
          </div>
          <div className="space-y-2">
            <Label>Customer Account</Label>
            <SearchableSelect
              options={customerOptions}
              value={customerAccountId}
              onValueChange={setCustomerAccountId}
              placeholder="Select customer account..."
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
                    !fromDate && "text-muted-foreground",
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={fromDate} onSelect={setFromDate} initialFocus />
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
                  {toDate ? format(toDate, "dd/MM/yyyy") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={toDate} onSelect={setToDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>
          <Button onClick={() => void handleSearch()} disabled={loading}>
            {loading ? "Loading..." : "Compare"}
          </Button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {renderLedgerTable("Supplier Ledger", supplierLabel, supplierEntries)}
          {renderLedgerTable("Customer Ledger", customerLabel, customerEntries)}
        </div>

        <div className="rounded-lg border bg-muted/30 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Supplier Balance</p>
              <p className={`text-lg font-semibold tabular-nums ${balanceValueClass()}`}>
                {formatNumber(supplierBalance)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Customer Balance</p>
              <p className={`text-lg font-semibold tabular-nums ${balanceValueClass()}`}>
                {formatNumber(customerBalance)}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Combined Balance (Customer − Supplier)</p>
              <p className={`text-lg font-semibold tabular-nums ${balanceValueClass()}`}>
                {formatNumber(combinedBalance)}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Positive = they owe you net · Negative = you owe them net
              </p>
            </div>
          </div>
        </div>
      </CardContent>

      <VoucherViewDialog
        open={!!viewingVoucher}
        onOpenChange={(open) => {
          if (!open) setViewingVoucher(null);
        }}
        voucherId={viewingVoucher?.id}
        voucherNumber={viewingVoucher?.number}
      />
    </Card>
  );
};
