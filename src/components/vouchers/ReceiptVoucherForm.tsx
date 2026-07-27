import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash, Save, MoreVertical, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoucherEntry {
  id: string;
  accountCr: string;
  description: string;
  crAmount: number;
}

type ReceiptVoucherKind = "cash" | "bank" | "cheque";

interface ReceiptVoucherFormProps {
  receiptKind: ReceiptVoucherKind;
  accounts: { value: string; label: string }[];
  drAccountOptions: { value: string; label: string }[];
  cashDiscountAccountId?: string;
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => Promise<boolean>;
  generateVoucherNo: () => string;
  balanceMap?: Record<string, number>;
  voucherTab: string;
}

const RECEIPT_KIND_META: Record<
  ReceiptVoucherKind,
  { title: string; prefix: string; drLabel: string }
> = {
  cash: {
    title: "Receipt Voucher Cash",
    prefix: "RVC",
    drLabel: "Dr Account (Cash)",
  },
  bank: {
    title: "Receipt Voucher Bank",
    prefix: "RVB",
    drLabel: "Dr Account (Bank)",
  },
  cheque: {
    title: "Receipt Voucher Cheque",
    prefix: "RVCH",
    drLabel: "Dr Account (Bank)",
  },
};

function AccountBalance({
  accountId,
  balanceMap,
}: {
  accountId: string;
  balanceMap?: Record<string, number>;
}) {
  if (!accountId || !balanceMap || !(accountId in balanceMap)) return null;
  const bal = balanceMap[accountId];
  const isNeg = bal < 0;
  const formatted = Math.abs(bal).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <Input
      readOnly
      value={`${formatted} ${isNeg ? "Cr" : "Dr"}`}
      className={`h-10 bg-muted/30 font-medium ${isNeg ? "text-destructive" : "text-green-600"}`}
    />
  );
}

export const ReceiptVoucherForm = ({
  receiptKind,
  accounts,
  drAccountOptions,
  onAddSubgroup,
  onAddAccount,
  onSave,
  generateVoucherNo,
  balanceMap,
  voucherTab,
  cashDiscountAccountId,
}: ReceiptVoucherFormProps) => {
  const { toast } = useToast();
  const kindMeta = RECEIPT_KIND_META[receiptKind];

  const drAccountValues = useMemo(
    () => new Set(drAccountOptions.map((a) => a.value)),
    [drAccountOptions],
  );

  const receiptCrOptions = useMemo(
    () => accounts.filter((a) => !drAccountValues.has(a.value)),
    [accounts, drAccountValues],
  );

  const [receivedFrom, setReceivedFrom] = useState("");
  const [voucherNo, setVoucherNo] = useState(generateVoucherNo);
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayDate());
  const [drAccount, setDrAccount] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [cashDiscount, setCashDiscount] = useState(0);
  const [entries, setEntries] = useState<VoucherEntry[]>([
    { id: "1", accountCr: "", description: "", crAmount: 0 },
  ]);

  useEffect(() => {
    setVoucherNo(generateVoucherNo());
    setDrAccount("");
    setChequeNumber("");
    setChequeDate("");
    setCashDiscount(0);
    // Reset form fields when switching cash / bank / cheque receipt type
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptKind]);

  useEffect(() => {
    if (drAccount && !drAccountValues.has(drAccount)) {
      setDrAccount("");
    }
  }, [drAccount, drAccountValues]);

  const addEntry = () => {
    setEntries([
      ...entries,
      { id: Date.now().toString(), accountCr: "", description: "", crAmount: 0 },
    ]);
  };

  const removeEntry = (id: string) => {
    if (entries.length > 1) {
      setEntries(entries.filter((e) => e.id !== id));
    }
  };

  const updateEntry = (
    id: string,
    field: keyof VoucherEntry,
    value: string | number,
  ) => {
    setEntries(entries.map((e) => (e.id === id ? { ...e, [field]: value } : e)));
  };

  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const totalReceived = entries.reduce(
    (sum, e) => sum + (Number(e.crAmount) || 0),
    0,
  );
  const discountAmount = receiptKind === "cash" ? Number(cashDiscount) || 0 : 0;
  const totalAmount = totalReceived + discountAmount;

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    if (!receivedFrom) {
      toast({
        title: "Error",
        description: "Please enter 'Received From' field",
        variant: "destructive",
      });
      return;
    }
    if (!drAccount) {
      toast({
        title: "Error",
        description: `Please select ${kindMeta.drLabel}`,
        variant: "destructive",
      });
      return;
    }
    if (entries.some((e) => !e.accountCr)) {
      toast({
        title: "Error",
        description: "Please select Account Cr for all entries",
        variant: "destructive",
      });
      return;
    }
    if (totalReceived === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one amount",
        variant: "destructive",
      });
      return;
    }
    if (discountAmount > 0) {
      if (!cashDiscountAccountId) {
        toast({
          title: "Error",
          description:
            "Cash discount account (701003 – Cash (Discount)) is not configured",
          variant: "destructive",
        });
        return;
      }
      const crAccountForDiscount = entries.find((e) => e.accountCr)?.accountCr;
      if (!crAccountForDiscount) {
        toast({
          title: "Error",
          description: "Select Account Cr before applying cash discount",
          variant: "destructive",
        });
        return;
      }
    }
    if (receiptKind === "cheque") {
      if (!chequeNumber.trim()) {
        toast({
          title: "Error",
          description: "Please enter Cheque Number",
          variant: "destructive",
        });
        return;
      }
      if (!chequeDate) {
        toast({
          title: "Error",
          description: "Please enter Cheque Date",
          variant: "destructive",
        });
        return;
      }
    }

    setSaving(true);
    try {
      const saved = await onSave({
        type: "receipt",
        receiptKind,
        voucherTab,
        receivedFrom,
        voucherNo,
        date,
        drAccount,
        entries,
        totalReceived,
        cashDiscount: discountAmount,
        cashDiscountAccount: cashDiscountAccountId,
        totalAmount,
        chequeNumber: receiptKind === "cheque" ? chequeNumber : "",
        chequeDate: receiptKind === "cheque" ? chequeDate : "",
      });

      if (!saved) return;

      setReceivedFrom("");
      setVoucherNo(generateVoucherNo());
      setDrAccount("");
      setChequeNumber("");
      setChequeDate("");
      setCashDiscount(0);
      setEntries([{ id: "1", accountCr: "", description: "", crAmount: 0 }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {kindMeta.title}
            </h2>
            <p className="text-sm text-muted-foreground">{kindMeta.prefix}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddSubgroup}
            className="text-muted-foreground hover:text-foreground"
          >
            + Add New Subgroup
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onAddAccount}
            className="text-muted-foreground hover:text-foreground"
          >
            + Add New Account
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-6 gap-4">
        <div className="lg:col-span-3">
          <Input
            placeholder="Received from"
            value={receivedFrom}
            onChange={(e) => setReceivedFrom(e.target.value)}
            className="h-11"
          />
        </div>
        <div className="lg:col-span-2">
          <Input
            placeholder="voucher_no"
            value={voucherNo}
            onChange={(e) => setVoucherNo(e.target.value)}
            className="h-11"
          />
        </div>
        <div>
          <div className="relative">
            <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">
              Date
            </Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 bg-muted/30"
            />
          </div>
        </div>
      </div>

      {receiptKind === "cheque" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="relative">
            <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">
              Cheque Number
            </Label>
            <Input
              placeholder="Cheque Number"
              value={chequeNumber}
              onChange={(e) => setChequeNumber(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="relative">
            <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">
              Cheque Date
            </Label>
            <Input
              type="date"
              value={chequeDate}
              onChange={(e) => setChequeDate(e.target.value)}
              className="h-11"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4 items-end">
        <div className="col-span-4 space-y-1">
          <Label className="text-sm text-primary">{kindMeta.drLabel}</Label>
          <SearchableSelect
            options={drAccountOptions}
            value={drAccount}
            onValueChange={setDrAccount}
            placeholder="Select..."
          />
        </div>
        <div className="col-span-2 space-y-1">
          <Label className="text-sm text-muted-foreground">Balance</Label>
          <AccountBalance accountId={drAccount} balanceMap={balanceMap} />
        </div>
        {receiptKind === "cash" && (
          <div className="col-span-3 space-y-1">
            <Label className="text-sm text-muted-foreground">Cash Discount</Label>
            <Input
              type="number"
              placeholder="0.00"
              value={cashDiscount || ""}
              onChange={(e) =>
                setCashDiscount(parseFloat(e.target.value) || 0)
              }
              step="0.01"
              min="0"
              className="h-10"
            />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-4">
            <Label className="text-base font-medium">Account Cr</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-base font-medium">Balance</Label>
          </div>
          <div className="col-span-3">
            <Label className="text-base font-medium">Description</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-base font-medium">Cr</Label>
          </div>
          <div className="col-span-1"></div>
        </div>

        {entries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4">
              <SearchableSelect
                options={receiptCrOptions}
                value={entry.accountCr}
                onValueChange={(v) => updateEntry(entry.id, "accountCr", v)}
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className="col-span-2">
              <AccountBalance
                accountId={entry.accountCr}
                balanceMap={balanceMap}
              />
            </div>
            <div className="col-span-3">
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) =>
                  updateEntry(entry.id, "description", e.target.value)
                }
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                placeholder="amount"
                value={entry.crAmount || ""}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  updateEntry(entry.id, "crAmount", value);
                }}
                step="0.01"
                min="0"
                className="h-10"
              />
            </div>
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

      <div className="flex items-center justify-end gap-4">
        <Label className="text-base font-medium">Total Amount</Label>
        <div className="relative w-48">
          <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">
            Total Amount
          </Label>
          <Input
            value={formatAmount(totalAmount)}
            readOnly
            className="h-11 bg-muted/30 font-medium"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          onClick={handleSave}
          variant="ghost"
          className="gap-2"
          disabled={saving}
        >
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
