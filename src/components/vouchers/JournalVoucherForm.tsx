import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash, Save, MoreVertical, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JournalEntry {
  id: string;
  account: string;
  description: string;
  drAmount: number; // FC amount
  crAmount: number; // FC amount
  type: "dr" | "cr";
}

interface JournalVoucherFormProps {
  accounts: { value: string; label: string }[];
  isInternationalSupplier?: boolean;
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => Promise<boolean>;
}

export const JournalVoucherForm = ({
  accounts,
  isInternationalSupplier = false,
  onAddSubgroup,
  onAddAccount,
  onSave,
}: JournalVoucherFormProps) => {
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
  const [exchangeRate, setExchangeRate] = useState("1");
  const [drEntries, setDrEntries] = useState<JournalEntry[]>([
    { id: "dr-1", account: "", description: "", drAmount: 0, crAmount: 0, type: "dr" }
  ]);
  const [crEntries, setCrEntries] = useState<JournalEntry[]>([
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

  const updateDrEntry = (id: string, field: keyof JournalEntry, value: string | number) => {
    setDrEntries(drEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
  };

  const updateCrEntry = (id: string, field: keyof JournalEntry, value: string | number) => {
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
  const parsedExchangeRate = Number(exchangeRate);
  const exchangeRateValue =
    Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0 ? parsedExchangeRate : 0;
  const totalDrLc = totalDr * exchangeRateValue;
  const totalCrLc = totalCr * exchangeRateValue;

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
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
    if (isInternationalSupplier && (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)) {
      toast({ title: "Error", description: "Please enter a valid exchange rate", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave({
        type: "journal",
        name,
        date,
        drEntries: drEntries.map((entry) => ({
          ...entry,
          ...(isInternationalSupplier
            ? { drAmountLc: (Number(entry.drAmount) || 0) * parsedExchangeRate }
            : {}),
        })),
        crEntries: crEntries.map((entry) => ({
          ...entry,
          ...(isInternationalSupplier
            ? { crAmountLc: (Number(entry.crAmount) || 0) * parsedExchangeRate }
            : {}),
        })),
        totalDr,
        totalCr,
        ...(isInternationalSupplier
          ? {
              totalDrLc,
              totalCrLc,
              conversionRate: parsedExchangeRate,
            }
          : {}),
      });

      if (!saved) return;

      setName("");
      setExchangeRate("1");
      setDrEntries([
        {
          id: "dr-1",
          account: "",
          description: "",
          drAmount: 0,
          crAmount: 0,
          type: "dr",
        },
      ]);
      setCrEntries([
        {
          id: "cr-1",
          account: "",
          description: "",
          drAmount: 0,
          crAmount: 0,
          type: "cr",
        },
      ]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <FileText className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Journal Voucher</h2>
            <p className="text-sm text-muted-foreground">JV</p>
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
      <div className={isInternationalSupplier ? "grid grid-cols-1 lg:grid-cols-6 gap-4" : "grid grid-cols-1 lg:grid-cols-4 gap-4"}>
        <div className="lg:col-span-3">
          <Input
            placeholder="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
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

      {/* Entries Table */}
      <div className="space-y-4">
        <div className="grid grid-cols-12 gap-4 items-center">
          <div className={isInternationalSupplier ? "col-span-2" : "col-span-3"}>
            <Label className="text-base font-medium">Account Dr/ Cr</Label>
          </div>
          <div className={isInternationalSupplier ? "col-span-2" : "col-span-4"}>
            <Label className="text-base font-medium">Description</Label>
          </div>
          <div className="col-span-2 text-center">
            <Label className="text-base font-medium">{isInternationalSupplier ? "FC Dr" : "Dr"}</Label>
          </div>
          {isInternationalSupplier ? (
            <>
              <div className="col-span-2 text-center">
                <Label className="text-base font-medium">LC Dr</Label>
              </div>
              <div className="col-span-2 text-center">
                <Label className="text-base font-medium">FC Cr</Label>
              </div>
              <div className="col-span-1 text-center">
                <Label className="text-base font-medium">LC Cr</Label>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-center">
              <Label className="text-base font-medium">Cr</Label>
            </div>
          )}
          <div className="col-span-1"></div>
        </div>

        {/* Dr Entries */}
        {drEntries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className={isInternationalSupplier ? "col-span-2" : "col-span-3"}>
              <SearchableSelect
                options={accounts}
                value={entry.account}
                onValueChange={(v) => updateDrEntry(entry.id, "account", v)}
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className={isInternationalSupplier ? "col-span-2" : "col-span-4"}>
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
                placeholder={isInternationalSupplier ? "fc amount" : "amount"}
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
            {isInternationalSupplier ? (
              <>
                <div className="col-span-2">
                  <Input
                    value={formatAmount((Number(entry.drAmount) || 0) * exchangeRateValue)}
                    readOnly
                    className="h-10 bg-muted/30"
                  />
                </div>
                <div className="col-span-1">
                  <Input value="0.00" readOnly className="h-10 bg-muted/30" />
                </div>
                <div className="col-span-2">
                  <Input value="0.00" readOnly className="h-10 bg-muted/30" />
                </div>
              </>
            ) : (
              <div className="col-span-2">
                <Input value="0.00" readOnly className="h-10 bg-muted/30" />
              </div>
            )}
            <div className="col-span-1 flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeDrEntry(entry.id)}
                disabled={drEntries.length === 1}
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Cr Entries */}
        {crEntries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-4 items-center">
            <div className={isInternationalSupplier ? "col-span-2" : "col-span-3"}>
              <SearchableSelect
                options={accounts}
                value={entry.account}
                onValueChange={(v) => updateCrEntry(entry.id, "account", v)}
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className={isInternationalSupplier ? "col-span-2" : "col-span-4"}>
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateCrEntry(entry.id, "description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Input value="0.00" readOnly className="h-10 bg-muted/30" />
            </div>
            {isInternationalSupplier ? (
              <div className="col-span-1">
                <Input value="0.00" readOnly className="h-10 bg-muted/30" />
              </div>
            ) : null}
            <div className="col-span-2">
              <Input
                type="number"
                placeholder={isInternationalSupplier ? "fc amount" : "amount"}
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
            {isInternationalSupplier ? (
              <div className="col-span-1">
                <Input
                  value={formatAmount((Number(entry.crAmount) || 0) * exchangeRateValue)}
                  readOnly
                  className="h-10 bg-muted/30"
                />
              </div>
            ) : null}
            <div className="col-span-1 flex justify-center">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeCrEntry(entry.id)}
                disabled={crEntries.length === 1}
                className="h-8 w-8 text-destructive hover:bg-destructive/10"
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ))}

        {/* Total Amount */}
        {isInternationalSupplier ? (
          <div className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-4 text-right">
              <Label className="text-base font-medium">Totals</Label>
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">FC Dr</Label>
                <Input
                  value={formatAmount(totalDr)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">LC Dr</Label>
                <Input
                  value={formatAmount(totalDrLc)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">FC Cr</Label>
                <Input
                  value={formatAmount(totalCr)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-1">
              <div className="relative">
                <Label className="absolute -top-2 left-2 bg-background px-1 text-xs text-muted-foreground z-10">LC Cr</Label>
                <Input
                  value={formatAmount(totalCrLc)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-1"></div>
          </div>
        ) : (
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
        )}
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
          <div className={isInternationalSupplier ? "col-span-8" : "col-span-7"}></div>
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
