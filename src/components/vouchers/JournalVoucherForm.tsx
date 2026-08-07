import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Plus, Trash, Save, MoreVertical, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  amountHeaderClass,
  crHeaderClass,
  drHeaderClass,
  fcHeaderClass,
  fcValueClass,
  lcHeaderClass,
  lcValueClass,
} from "@/utils/accountingColors";
import {
  fcFromLc,
  isAmountTypingValue,
  isExchangeRateTypingValue,
  lcFromFc,
  normalizeDecimalTyping,
  parseExchangeRate,
} from "@/utils/fcLcAmount";

interface JournalEntry {
  id: string;
  account: string;
  description: string;
  drAmount: number | string; // FC amount; string preserves decimal typing
  crAmount: number | string; // FC amount; string preserves decimal typing
  drAmountLc?: number | string; // LC amount (intl only)
  crAmountLc?: number | string; // LC amount (intl only)
  type: "dr" | "cr";
}

interface JournalVoucherFormProps {
  accounts: { value: string; label: string }[];
  isInternationalSupplier?: boolean;
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSave: (data: any) => Promise<boolean>;
  balanceMap?: Record<string, number>;
}

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

export const JournalVoucherForm = ({
  accounts,
  isInternationalSupplier = false,
  onAddSubgroup,
  onAddAccount,
  onSave,
  balanceMap,
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
    { id: "dr-1", account: "", description: "", drAmount: "", crAmount: "", drAmountLc: "", crAmountLc: "", type: "dr" }
  ]);
  const [crEntries, setCrEntries] = useState<JournalEntry[]>([
    { id: "cr-1", account: "", description: "", drAmount: "", crAmount: "", drAmountLc: "", crAmountLc: "", type: "cr" }
  ]);

  const addDrEntry = () => {
    setDrEntries([...drEntries, { id: `dr-${Date.now()}`, account: "", description: "", drAmount: "", crAmount: "", drAmountLc: "", crAmountLc: "", type: "dr" }]);
  };

  const addCrEntry = () => {
    setCrEntries([...crEntries, { id: `cr-${Date.now()}`, account: "", description: "", drAmount: "", crAmount: "", drAmountLc: "", crAmountLc: "", type: "cr" }]);
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

  const exchangeRateValue = parseExchangeRate(exchangeRate);

  const handleExchangeRateChange = (raw: string) => {
    const normalized = normalizeDecimalTyping(raw);
    if (normalized !== "" && !isExchangeRateTypingValue(normalized)) return;
    setExchangeRate(normalized);
    const rate = parseExchangeRate(normalized);
    if (rate <= 0) return;
    setDrEntries((prev) =>
      prev.map((e) => ({
        ...e,
        drAmountLc: lcFromFc(e.drAmount, rate),
      })),
    );
    setCrEntries((prev) =>
      prev.map((e) => ({
        ...e,
        crAmountLc: lcFromFc(e.crAmount, rate),
      })),
    );
  };

  const handleDrFcChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    setDrEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              drAmount: raw,
              drAmountLc: isInternationalSupplier
                ? lcFromFc(raw, exchangeRateValue)
                : e.drAmountLc,
            }
          : e,
      ),
    );
  };

  const handleDrLcChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    setDrEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              drAmountLc: raw,
              drAmount: fcFromLc(raw, exchangeRateValue),
            }
          : e,
      ),
    );
  };

  const handleCrFcChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    setCrEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              crAmount: raw,
              crAmountLc: isInternationalSupplier
                ? lcFromFc(raw, exchangeRateValue)
                : e.crAmountLc,
            }
          : e,
      ),
    );
  };

  const handleCrLcChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    setCrEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              crAmountLc: raw,
              crAmount: fcFromLc(raw, exchangeRateValue),
            }
          : e,
      ),
    );
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
  const totalDrLc = drEntries.reduce(
    (sum, e) =>
      sum +
      (Number(e.drAmountLc) ||
        (Number(e.drAmount) || 0) * exchangeRateValue),
    0,
  );
  const totalCrLc = crEntries.reduce(
    (sum, e) =>
      sum +
      (Number(e.crAmountLc) ||
        (Number(e.crAmount) || 0) * exchangeRateValue),
    0,
  );

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
    if (Math.abs(totalDr - totalCr) > 0.0001) {
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
          drAmount: Number(entry.drAmount) || 0,
          crAmount: Number(entry.crAmount) || 0,
          ...(isInternationalSupplier
            ? {
                drAmountLc:
                  Number(entry.drAmountLc) ||
                  (Number(entry.drAmount) || 0) * parsedExchangeRate,
              }
            : {}),
        })),
        crEntries: crEntries.map((entry) => ({
          ...entry,
          drAmount: Number(entry.drAmount) || 0,
          crAmount: Number(entry.crAmount) || 0,
          ...(isInternationalSupplier
            ? {
                crAmountLc:
                  Number(entry.crAmountLc) ||
                  (Number(entry.crAmount) || 0) * parsedExchangeRate,
              }
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
          drAmount: "",
          crAmount: "",
          drAmountLc: "",
          crAmountLc: "",
          type: "dr",
        },
      ]);
      setCrEntries([
        {
          id: "cr-1",
          account: "",
          description: "",
          drAmount: "",
          crAmount: "",
          drAmountLc: "",
          crAmountLc: "",
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
                type="text"
                inputMode="decimal"
                value={exchangeRate}
                onChange={(e) => handleExchangeRateChange(e.target.value)}
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
          <div className="col-span-2">
            <Label className="text-base font-medium">Balance</Label>
          </div>
          <div className={isInternationalSupplier ? "col-span-1" : "col-span-2"}>
            <Label className="text-base font-medium">Description</Label>
          </div>
          <div className="col-span-2 text-center">
            <Label className={`text-base font-medium ${isInternationalSupplier ? fcHeaderClass : drHeaderClass}`}>{isInternationalSupplier ? "FC Dr" : "Dr"}</Label>
          </div>
          {isInternationalSupplier ? (
            <>
              <div className="col-span-1 text-center">
                <Label className={`text-base font-medium ${lcHeaderClass}`}>LC Dr</Label>
              </div>
              <div className="col-span-2 text-center">
                <Label className={`text-base font-medium ${fcHeaderClass}`}>FC Cr</Label>
              </div>
              <div className="col-span-1 text-center">
                <Label className={`text-base font-medium ${lcHeaderClass}`}>LC Cr</Label>
              </div>
            </>
          ) : (
            <div className="col-span-2 text-center">
              <Label className={`text-base font-medium ${crHeaderClass}`}>Cr</Label>
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
                onValueChange={(v) =>
                  updateDrEntry(entry.id, "account", v)
                }
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className="col-span-2">
              <AccountBalance accountId={entry.account} balanceMap={balanceMap} />
            </div>
            <div className={isInternationalSupplier ? "col-span-1" : "col-span-2"}>
              <Input
                placeholder="Description"
                value={entry.description}
                onChange={(e) => updateDrEntry(entry.id, "description", e.target.value)}
                className="h-10"
              />
            </div>
            <div className="col-span-2">
              <Input
                type="text"
                inputMode="decimal"
                placeholder={isInternationalSupplier ? "fc amount" : "amount"}
                value={entry.drAmount}
                onChange={(e) => handleDrFcChange(entry.id, e.target.value)}
                className={`h-10 ${isInternationalSupplier ? fcValueClass() : ""}`}
              />
            </div>
            {isInternationalSupplier ? (
              <>
                <div className="col-span-1">
                  <Input
                    type="text"
                    inputMode="decimal"
                    placeholder="lc amount"
                    value={entry.drAmountLc ?? ""}
                    onChange={(e) => handleDrLcChange(entry.id, e.target.value)}
                    className={`h-10 ${lcValueClass()}`}
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
                onValueChange={(v) =>
                  updateCrEntry(entry.id, "account", v)
                }
                placeholder="Select..."
                selectedDisplayLabelOnly
              />
            </div>
            <div className="col-span-2">
              <AccountBalance accountId={entry.account} balanceMap={balanceMap} />
            </div>
            <div className={isInternationalSupplier ? "col-span-1" : "col-span-2"}>
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
                type="text"
                inputMode="decimal"
                placeholder={isInternationalSupplier ? "fc amount" : "amount"}
                value={entry.crAmount}
                onChange={(e) => handleCrFcChange(entry.id, e.target.value)}
                className={`h-10 ${isInternationalSupplier ? fcValueClass() : ""}`}
              />
            </div>
            {isInternationalSupplier ? (
              <div className="col-span-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="lc amount"
                  value={entry.crAmountLc ?? ""}
                  onChange={(e) => handleCrLcChange(entry.id, e.target.value)}
                  className={`h-10 ${lcValueClass()}`}
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
                <Label className={`absolute -top-2 left-2 bg-background px-1 text-xs z-10 ${fcHeaderClass}`}>FC Dr</Label>
                <Input
                  value={formatAmount(totalDr)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${fcValueClass()} ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className={`absolute -top-2 left-2 bg-background px-1 text-xs z-10 ${lcHeaderClass}`}>LC Dr</Label>
                <Input
                  value={formatAmount(totalDrLc)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${lcValueClass()} ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-2">
              <div className="relative">
                <Label className={`absolute -top-2 left-2 bg-background px-1 text-xs z-10 ${fcHeaderClass}`}>FC Cr</Label>
                <Input
                  value={formatAmount(totalCr)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${fcValueClass()} ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-1">
              <div className="relative">
                <Label className={`absolute -top-2 left-2 bg-background px-1 text-xs z-10 ${lcHeaderClass}`}>LC Cr</Label>
                <Input
                  value={formatAmount(totalCrLc)}
                  readOnly
                  className={`h-10 bg-muted/30 font-medium ${lcValueClass()} ${totalDr !== totalCr ? 'border-destructive' : 'border-green-500'}`}
                />
              </div>
            </div>
            <div className="col-span-1"></div>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4 items-center">
            <div className="col-span-7 text-right">
              <Label className={`text-base font-medium ${amountHeaderClass}`}>Total Amount</Label>
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
