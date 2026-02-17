import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, X, Save, MoreVertical, ArrowRightLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ContraEntry {
  id: string;
  account: string;
  description: string;
  drAmount: number;
  crAmount: number;
  type: "dr" | "cr";
}

interface ContraVoucherFormProps {
  accounts: { value: string; label: string }[];
  cashBankAccounts: { value: string; label: string }[];
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => void;
}

export const ContraVoucherForm = ({ accounts, cashBankAccounts, onAddSubgroup, onAddAccount, onSave }: ContraVoucherFormProps) => {
  const { toast } = useToast();
  const [name, setName] = useState("");
  // Initialize date in YYYY-MM-DD format for date input
  const getTodayDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [date, setDate] = useState(getTodayDate());
  const [drEntries, setDrEntries] = useState<ContraEntry[]>([
    { id: "dr-1", account: "", description: "", drAmount: 0, crAmount: 0, type: "dr" }
  ]);
  const [crEntries, setCrEntries] = useState<ContraEntry[]>([
    { id: "cr-1", account: "", description: "", drAmount: 0, crAmount: 0, type: "cr" }
  ]);

  const addDrEntry = () => {
    setDrEntries([...drEntries, { id: `dr-${Date.now()}`, account: "", description: "", drAmount: 0, crAmount: 0, type: "dr" }]);
  };

  const addCrEntry = () => {
    setCrEntries([...crEntries, { id: `cr-${Date.now()}`, account: "", description: "", drAmount: 0, crAmount: 0, type: "cr" }]);
  };

  const removeDrEntry = (id: string) => {
    if (drEntries.length > 1) {
      setDrEntries(drEntries.filter(e => e.id !== id));
    }
  };

  const removeCrEntry = (id: string) => {
    if (crEntries.length > 1) {
      setCrEntries(crEntries.filter(e => e.id !== id));
    }
  };

  const updateDrEntry = (id: string, field: keyof ContraEntry, value: string | number) => {
    setDrEntries(drEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const updateCrEntry = (id: string, field: keyof ContraEntry, value: string | number) => {
    setCrEntries(crEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  // Format amount helper
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const totalDr = drEntries.reduce((sum, e) => sum + (Number(e.drAmount) || 0), 0);
  const totalCr = crEntries.reduce((sum, e) => sum + (Number(e.crAmount) || 0), 0);

  const handleSave = () => {
    if (!name) {
      toast({ title: "Error", description: "Please enter Name field", variant: "destructive" });
      return;
    }
    if (drEntries.some(e => !e.account) || crEntries.some(e => !e.account)) {
      toast({ title: "Error", description: "Please select Account for all entries", variant: "destructive" });
      return;
    }
    if (totalDr === 0 && totalCr === 0) {
      toast({ title: "Error", description: "Please enter at least one amount", variant: "destructive" });
      return;
    }
    if (totalDr !== totalCr) {
      toast({
        title: "Error",
        description: `Total Dr (${formatAmount(totalDr)}) must equal Total Cr (${formatAmount(totalCr)})`,
        variant: "destructive"
      });
      return;
    }

    onSave({
      type: "contra",
      name,
      date,
      drEntries,
      crEntries,
      totalDr,
      totalCr
    });

    // Reset form
    setName("");
    setDrEntries([{ id: "dr-1", account: "", description: "", drAmount: 0, crAmount: 0, type: "dr" }]);
    setCrEntries([{ id: "cr-1", account: "", description: "", drAmount: 0, crAmount: 0, type: "cr" }]);
    toast({ title: "Success", description: "Contra Voucher saved successfully" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <ArrowRightLeft className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Contra Voucher</h2>
            <p className="text-sm text-muted-foreground">CV</p>
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

      {/* Name and Date */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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

      {/* Entries Table */}
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-3">
            <Label className="text-base font-medium">Account Dr/ Cr</Label>
          </div>
          <div className="col-span-4">
            <Label className="text-base font-medium">Description</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-base font-medium">Dr</Label>
          </div>
          <div className="col-span-2">
            <Label className="text-base font-medium">Cr</Label>
          </div>
          <div className="col-span-1"></div>
        </div>

        {/* Dr Entries */}
        {drEntries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-3">
              <SearchableSelect
                options={cashBankAccounts}
                value={entry.account}
                onValueChange={(v) => updateDrEntry(entry.id, "account", v)}
                placeholder="Select..."
              />
            </div>
            <div className="col-span-4">
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateDrEntry(entry.id, "description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                placeholder="amount"
                value={entry.drAmount || ""}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  updateDrEntry(entry.id, "drAmount", value);
                }}
                step="0.01"
                min="0"
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">amount</Label>
                <Input
                  value="0"
                  readOnly
                  className="h-10 bg-muted/30"
                />
              </div>
            </div>
            <div className="col-span-1 flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDrEntry(entry.id)}
                disabled={drEntries.length === 1}
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Cr Entries */}
        {crEntries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-3">
              <SearchableSelect
                options={cashBankAccounts}
                value={entry.account}
                onValueChange={(v) => updateCrEntry(entry.id, "account", v)}
                placeholder="Select..."
              />
            </div>
            <div className="col-span-4">
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateCrEntry(entry.id, "description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">amount</Label>
                <Input
                  value="0"
                  readOnly
                  className="h-10 bg-muted/30"
                />
              </div>
            </div>
            <div className="col-span-2">
              <Input
                type="number"
                placeholder="amount"
                value={entry.crAmount || ""}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  updateCrEntry(entry.id, "crAmount", value);
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
                onClick={() => removeCrEntry(entry.id)}
                disabled={crEntries.length === 1}
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Total Amount */}
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className="col-span-7 text-right">
            <Label className="text-base font-medium">Total Amount</Label>
          </div>
          <div className="col-span-2">
            <div className="relative">
              <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Total Dr</Label>
              <Input
                value={formatAmount(totalDr)}
                readOnly
                className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
              />
            </div>
          </div>
          <div className="col-span-2">
            <div className="relative">
              <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">Total Cr</Label>
              <Input
                value={formatAmount(totalCr)}
                readOnly
                className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
              />
            </div>
          </div>
          <div className="col-span-1"></div>
        </div>
        {totalDr !== totalCr && totalDr > 0 && totalCr > 0 && (
          <div className="text-sm text-destructive text-center pt-2">
            ⚠️ Total Dr ({formatAmount(totalDr)}) must equal Total Cr ({formatAmount(totalCr)})
            <br />
            <span className="text-xs">Difference: {formatAmount(Math.abs(totalDr - totalCr))}</span>
          </div>
        )}
        {totalDr === totalCr && totalDr > 0 && (
          <div className="text-sm text-green-600 text-center pt-2">
            ✓ Totals are balanced
          </div>
        )}

        {/* Add Buttons */}
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-7"></div>
          <div className="col-span-2">
            <Button
              onClick={addDrEntry}
              className="bg-primary hover:bg-primary/90 gap-2 w-full"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Add Dr
            </Button>
          </div>
          <div className="col-span-2">
            <Button
              onClick={addCrEntry}
              className="bg-primary hover:bg-primary/90 gap-2 w-full"
              size="sm"
            >
              <Plus className="w-4 h-4" />
              Add Cr
            </Button>
          </div>
          <div className="col-span-1"></div>
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
