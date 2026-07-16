import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash, Save, MoreVertical, CreditCard } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoucherEntry {
  id: string;
  accountDr: string;
  description: string;
  drAmount: number | string; // FC amount; string preserves decimal typing
}

interface PaymentVoucherFormProps {
  accounts: { value: string; label: string }[];
  cashBankAccounts: { value: string; label: string }[];
  isInternationalSupplier?: boolean;
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => Promise<boolean>;
}

export const PaymentVoucherForm = ({
  accounts,
  cashBankAccounts,
  isInternationalSupplier = false,
  onAddSubgroup,
  onAddAccount,
  onSave,
}: PaymentVoucherFormProps) => {
  const { toast } = useToast();
  const cashBankValues = new Set(cashBankAccounts.map((a) => a.value));
  // PV: Account Dr must NOT include cash/bank accounts.
  const paymentDrOptions = accounts.filter((a) => !cashBankValues.has(a.value));
  const [paidTo, setPaidTo] = useState("");
  // Initialize date in YYYY-MM-DD format for date input
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayDate());
  const [exchangeRate, setExchangeRate] = useState("1");
  const [crAccount, setCrAccount] = useState("");
  const [entries, setEntries] = useState<VoucherEntry[]>([
    { id: "1", accountDr: "", description: "", drAmount: "" }
  ]);

  const addEntry = () => {
    setEntries([...entries, { id: Date.now().toString(), accountDr: "", description: "", drAmount: "" }]);
  };

  const removeEntry = (id: string) => {
    if (entries.length > 1) {
      setEntries(entries.filter(e => e.id !== id));
    }
  };

  const updateEntry = (id: string, field: keyof VoucherEntry, value: string | number) => {
    setEntries(entries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  // Format amount helper
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const totalAmount = entries.reduce((sum, e) => sum + (Number(e.drAmount) || 0), 0);
  const parsedExchangeRate = Number(exchangeRate);
  const exchangeRateValue =
    Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0 ? parsedExchangeRate : 0;
  const totalAmountLc = totalAmount * exchangeRateValue;

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    if (!paidTo) {
      toast({ title: "Error", description: "Please enter 'Paid To' field", variant: "destructive" });
      return;
    }
    if (!crAccount) {
      toast({ title: "Error", description: "Please select Cr Account", variant: "destructive" });
      return;
    }
    if (entries.some(e => !e.accountDr)) {
      toast({ title: "Error", description: "Please select Account Dr for all entries", variant: "destructive" });
      return;
    }
    if (totalAmount === 0) {
      toast({ title: "Error", description: "Please enter at least one amount", variant: "destructive" });
      return;
    }
    if (isInternationalSupplier && (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)) {
      toast({ title: "Error", description: "Please enter a valid exchange rate", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave({
        type: "payment",
        paidTo,
        date,
        crAccount,
        entries: entries.map((entry) => ({
          ...entry,
          drAmount: Number(entry.drAmount) || 0,
          ...(isInternationalSupplier
            ? {
                drAmountLc:
                  (Number(entry.drAmount) || 0) * parsedExchangeRate,
              }
            : {}),
        })),
        totalAmount,
        ...(isInternationalSupplier
          ? {
              totalAmountLc,
              conversionRate: parsedExchangeRate,
            }
          : {}),
      });

      if (!saved) return;

      setPaidTo("");
      setCrAccount("");
      setExchangeRate("1");
      setEntries([{ id: "1", accountDr: "", description: "", drAmount: "" }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
            <CreditCard className="w-5 h-5 text-destructive" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Payment Voucher</h2>
            <p className="text-sm text-muted-foreground">PV</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onAddSubgroup} className="text-muted-foreground hover:text-foreground">
            + Add New Subgroup
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddAccount} className="text-muted-foreground hover:text-foreground">
            + Add New Account
          </Button>
        </div>
      </div>

      {/* Paid To and Date */}
      <div className={isInternationalSupplier ? "grid grid-cols-1 lg:grid-cols-6 gap-4" : "grid grid-cols-1 lg:grid-cols-4 gap-4"}>
        <div className="lg:col-span-3">
          <Input
            placeholder="Paid To"
            value={paidTo}
            onChange={(e) => setPaidTo(e.target.value)}
            className="h-11"
          />
        </div>
        {isInternationalSupplier ? (
          <div className="lg:col-span-2">
            <div className="relative">
              <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Exchange Rate</Label>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                className="h-11 bg-muted/30"
              />
            </div>
          </div>
        ) : null}
        <div className="lg:col-span-1">
          <div className="relative">
            <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Date</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 bg-muted/30"
            />
          </div>
        </div>
      </div>

      {/* Cr Account */}
      <div className="space-y-1">
        <Label className="text-sm text-primary">Cr Account</Label>
        <SearchableSelect
          options={cashBankAccounts}
          value={crAccount}
          onValueChange={setCrAccount}
          placeholder="Select..."
        />
      </div>

      {/* Entries Table */}
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-3">
            <Label className="text-base font-medium">Account Dr</Label>
          </div>
          <div className="col-span-4">
            <Label className="text-base font-medium">Description</Label>
          </div>
          <div className={isInternationalSupplier ? "col-span-2" : "col-span-2"}>
            <Label className="text-base font-medium">{isInternationalSupplier ? "FC Dr" : "Dr"}</Label>
          </div>
          {isInternationalSupplier ? (
            <div className="col-span-2">
              <Label className="text-base font-medium">LC Dr</Label>
            </div>
          ) : null}
          <div className="col-span-1"></div>
        </div>

        {entries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-3">
              <SearchableSelect
                options={paymentDrOptions}
                value={entry.accountDr}
                onValueChange={(v) => updateEntry(entry.id, "accountDr", v)}
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className="col-span-4">
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                placeholder={isInternationalSupplier ? "fc amount" : "amount"}
                value={entry.drAmount}
                onChange={(e) =>
                  updateEntry(entry.id, "drAmount", e.target.value)
                }
                step="0.01"
                min="0"
                className="h-10"
              />
            </div>
            {isInternationalSupplier ? (
              <div className="col-span-2">
                <Input
                  value={formatAmount((Number(entry.drAmount) || 0) * exchangeRateValue)}
                  readOnly
                  className="h-10 bg-muted/30"
                />
              </div>
            ) : null}
            <div className="col-span-1 flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeEntry(entry.id)}
                disabled={entries.length === 1}
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        <Button
          onClick={addEntry}
          className="bg-primary hover:bg-primary/90 gap-2"
          size="sm"
        >
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </div>

      {/* Total Amounts */}
      {isInternationalSupplier ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-md border border-border p-3 space-y-2">
            <Label className="text-sm font-medium">FC Totals</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input value={formatAmount(totalAmount)} readOnly className="h-10 bg-muted/30 font-medium" />
              <Input value={formatAmount(totalAmount)} readOnly className="h-10 bg-muted/30 font-medium" />
            </div>
            <p className="text-xs text-muted-foreground">Dr / Cr (FC)</p>
          </div>
          <div className="rounded-md border border-border p-3 space-y-2">
            <Label className="text-sm font-medium">LC Totals</Label>
            <div className="grid grid-cols-2 gap-3">
              <Input value={formatAmount(totalAmountLc)} readOnly className="h-10 bg-muted/30 font-medium" />
              <Input value={formatAmount(totalAmountLc)} readOnly className="h-10 bg-muted/30 font-medium" />
            </div>
            <p className="text-xs text-muted-foreground">Dr / Cr (LC)</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-4">
          <Label className="text-base font-medium">Total Amount</Label>
          <div className="relative w-48">
            <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Total Amount</Label>
            <Input value={formatAmount(totalAmount)} readOnly className="h-11 bg-muted/30 font-medium" />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button onClick={handleSave} variant="ghost" className="gap-2" disabled={saving}>
          <Save className="w-4 h-4" />
          Save
        </Button>
        <Button variant="ghost" size="icon">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
