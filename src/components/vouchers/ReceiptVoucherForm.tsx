import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, X, Save, MoreVertical, Receipt } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface VoucherEntry {
  id: string;
  accountCr: string;
  description: string;
  crAmount: number;
}

interface ReceiptVoucherFormProps {
  accounts: { value: string; label: string }[];
  cashBankAccounts: { value: string; label: string }[];
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => void;
  generateVoucherNo: () => string;
}

export const ReceiptVoucherForm = ({ accounts, cashBankAccounts, onAddSubgroup, onAddAccount, onSave, generateVoucherNo }: ReceiptVoucherFormProps) => {
  const { toast } = useToast();
  const cashBankValues = new Set(cashBankAccounts.map((a) => a.value));
  // RV: Account Cr must NOT include cash/bank accounts.
  const receiptCrOptions = accounts.filter((a) => !cashBankValues.has(a.value));
  const [receivedFrom, setReceivedFrom] = useState("");
  const [voucherNo, setVoucherNo] = useState(generateVoucherNo());
  // Initialize date in YYYY-MM-DD format for date input
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayDate());
  const [drAccount, setDrAccount] = useState("");
  const [entries, setEntries] = useState<VoucherEntry[]>([
    { id: "1", accountCr: "", description: "", crAmount: 0 }
  ]);

  const addEntry = () => {
    setEntries([...entries, { id: Date.now().toString(), accountCr: "", description: "", crAmount: 0 }]);
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

  const totalAmount = entries.reduce((sum, e) => sum + (Number(e.crAmount) || 0), 0);

  const handleSave = () => {
    if (!receivedFrom) {
      toast({ title: "Error", description: "Please enter 'Received From' field", variant: "destructive" });
      return;
    }
    if (!drAccount) {
      toast({ title: "Error", description: "Please select Dr Account", variant: "destructive" });
      return;
    }
    if (entries.some(e => !e.accountCr)) {
      toast({ title: "Error", description: "Please select Account Cr for all entries", variant: "destructive" });
      return;
    }
    if (totalAmount === 0) {
      toast({ title: "Error", description: "Please enter at least one amount", variant: "destructive" });
      return;
    }

    onSave({
      type: "receipt",
      receivedFrom,
      voucherNo,
      date,
      drAccount,
      entries,
      totalAmount
    });

    // Reset form
    setReceivedFrom("");
    setVoucherNo(generateVoucherNo());
    setDrAccount("");
    setEntries([{ id: "1", accountCr: "", description: "", crAmount: 0 }]);
    toast({ title: "Success", description: "Receipt Voucher saved successfully" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Receipt Voucher</h2>
            <p className="text-sm text-muted-foreground">RV</p>
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

      {/* Received From, Voucher No and Date */}
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

      {/* Dr Account */}
      <div className="space-y-1">
        <Label className="text-sm text-primary">Dr Account</Label>
        <div className="max-w-md">
          <SearchableSelect
            options={cashBankAccounts}
            value={drAccount}
            onValueChange={setDrAccount}
            placeholder="Select..."
          />
        </div>
      </div>

      {/* Entries Table */}
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-4">
            <Label className="text-base font-medium">Account Cr</Label>
          </div>
          <div className="col-span-5">
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
              />
            </div>
            <div className="col-span-5">
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
                <X className="w-4 h-4" />
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

      {/* Total Amount */}
      <div className="flex items-center justify-end gap-4">
        <Label className="text-base font-medium">Total Amount</Label>
        <div className="relative w-48">
          <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Total Amount</Label>
          <Input
            value={formatAmount(totalAmount)}
            readOnly
            className="h-11 bg-muted/30 font-medium"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button onClick={handleSave} variant="ghost" className="gap-2">
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
