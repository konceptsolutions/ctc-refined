import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CreditCard, Receipt, FileText, ArrowRightLeft, List, Plus } from "lucide-react";
import { PaymentVoucherForm } from "./PaymentVoucherForm";
import { ReceiptVoucherForm } from "./ReceiptVoucherForm";
import { JournalVoucherForm } from "./JournalVoucherForm";
import { ContraVoucherForm } from "./ContraVoucherForm";
import { ViewVouchersTab } from "./ViewVouchersTab";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { isCashBankAccount } from "@/utils/cashBankMode";
import { buildVoucherAccountOptions } from "@/utils/voucherAccounts";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

export interface Voucher {
  id: string;
  voucherNumber: string;
  type: "receipt" | "payment" | "journal" | "contra";
  mode?: "cash" | "online";
  date: string;
  narration: string;
  cashBankAccount: string;
  chequeNumber?: string;
  chequeDate?: string;
  checkClearDate?: string;
  isCleared?: number;
  VoucherEntry?: VoucherEntry[];
  entries?: VoucherEntry[];
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "posted" | "cancelled";
  createdAt: string;
}

export interface VoucherEntry {
  id: string;
  accountId?: string;
  account: string; // Used as accountId for the selector
  accountName?: string;
  description: string;
  debit: number;
  credit: number;
  sortOrder?: number;
  Account?: {
    id: string;
    code: string;
    name: string;
  };
}

type MainTab = "new" | "view";
type VoucherTab = "payment" | "receipt" | "journal" | "contra";

const VOUCHER_TYPE_PREFIX: Record<VoucherTab, string> = {
  payment: "PV",
  receipt: "RV",
  journal: "JV",
  contra: "CV",
};

const VOUCHER_SEQUENCE_FLOORS: Record<VoucherTab, number> = {
  payment: 2000,
  receipt: 1000,
  journal: 3000,
  contra: 100,
};

function parseVoucherSequence(
  voucherNumber: string,
  prefix: string,
): number | null {
  const match = String(voucherNumber)
    .trim()
    .match(new RegExp(`^${prefix}(\\d+)$`, "i"));
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

function maxVoucherSequence(
  voucherList: Voucher[],
  type: VoucherTab,
): number {
  const prefix = VOUCHER_TYPE_PREFIX[type];
  const floor = VOUCHER_SEQUENCE_FLOORS[type];
  let maxSeq = floor;
  for (const voucher of voucherList) {
    if (voucher.type !== type) continue;
    const seq = parseVoucherSequence(voucher.voucherNumber, prefix);
    if (seq !== null && seq > maxSeq) {
      maxSeq = seq;
    }
  }
  return maxSeq;
}

const mainTabs: { id: MainTab; label: string; icon: React.ElementType }[] = [
  { id: "new", label: "New Voucher", icon: Plus },
  { id: "view", label: "View Vouchers", icon: List },
];

const voucherTabs: { id: VoucherTab; label: string; icon: React.ElementType }[] = [
  { id: "payment", label: "Payment Voucher", icon: CreditCard },
  { id: "receipt", label: "Receipt Voucher", icon: Receipt },
  { id: "journal", label: "Journal Voucher", icon: FileText },
  { id: "contra", label: "Contra Voucher", icon: ArrowRightLeft },
];

// Sample accounts
const initialAccounts = [
  { value: "cash-in-hand", label: "Cash in Hand" },
  { value: "cash-at-bank-hbl", label: "Cash at Bank - HBL" },
  { value: "cash-at-bank-mcb", label: "Cash at Bank - MCB" },
  { value: "cash-at-bank-ubl", label: "Cash at Bank - UBL" },
  { value: "petty-cash", label: "Petty Cash" },
  { value: "sales-revenue", label: "Sales Revenue" },
  { value: "purchase-account", label: "Purchase Account" },
  { value: "accounts-receivable", label: "Accounts Receivable" },
  { value: "accounts-payable", label: "Accounts Payable" },
  { value: "salary-expense", label: "Salary Expense" },
  { value: "rent-expense", label: "Rent Expense" },
  { value: "utility-expense", label: "Utility Expense" },
  { value: "office-supplies", label: "Office Supplies" },
  { value: "furniture-fixtures", label: "Furniture & Fixtures" },
  { value: "equipment", label: "Equipment" },
  { value: "capital-account", label: "Capital Account" },
  { value: "drawings", label: "Drawings" },
  { value: "interest-income", label: "Interest Income" },
  { value: "interest-expense", label: "Interest Expense" },
];

export const VoucherManagement = () => {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>("view");
  const [activeTab, setActiveTab] = useState<VoucherTab>("payment");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic data states
  const [mainGroups, setMainGroups] = useState<{ id: string, name: string, code: string }[]>([]);
  const [subgroups, setSubgroups] = useState<{ id: string, name: string, code: string, mainGroupId: string }[]>([]);
  const [accountsList, setAccountsList] = useState<SearchableSelectOption[]>([]);
  const [rawAccounts, setRawAccounts] = useState<any[]>([]);

  // Dialog states
  const [showSubgroupDialog, setShowSubgroupDialog] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [newSubgroupCode, setNewSubgroupCode] = useState("");
  const [selectedMainGroup, setSelectedMainGroup] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountCode, setNewAccountCode] = useState("");
  const [selectedSubgroup, setSelectedSubgroup] = useState("");

  const [voucherCounters, setVoucherCounters] = useState({
    receipt: VOUCHER_SEQUENCE_FLOORS.receipt,
    payment: VOUCHER_SEQUENCE_FLOORS.payment,
    journal: VOUCHER_SEQUENCE_FLOORS.journal,
    contra: VOUCHER_SEQUENCE_FLOORS.contra,
  });

  const cashBankAccounts = useMemo(() => {
    return rawAccounts
      .filter((acc: any) => isCashBankAccount(acc))
      .map((acc: any) => ({
        value: acc.id,
        label: `${acc.code} - ${acc.name}`
      }));
  }, [rawAccounts]);

  const applyAccountsData = (accountsData: any[]) => {
    setRawAccounts(accountsData);
    setAccountsList(buildVoucherAccountOptions(accountsData));
  };

  const refreshAccounts = useCallback(async () => {
    const accountsRes = await apiClient.getAccounts({ status: "Active" });
    const raw = accountsRes as any;
    const accountsData = Array.isArray(raw) ? raw : (raw.data || []);
    if (accountsData.length > 0) {
      applyAccountsData(accountsData);
    }
  }, []);

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        const [vouchersRes, accountsRes, subgroupsRes, mainGroupsRes] = await Promise.all([
          apiClient.getVouchers({ limit: 1000 }),
          apiClient.getAccounts({ status: "Active" }),
          apiClient.getSubgroups(),
          apiClient.getMainGroups()
        ]);

        if (vouchersRes.data) {
          setVouchers(vouchersRes.data as any);
          // Update counters logic...
        }

        const rawMainGroups = mainGroupsRes as any;
        const mainGroupsData = Array.isArray(rawMainGroups) ? rawMainGroups : (rawMainGroups.data || []);
        if (mainGroupsData.length > 0) {
          setMainGroups(mainGroupsData);
        }

        const rawSubgroups = subgroupsRes as any;
        const subgroupsData = Array.isArray(rawSubgroups) ? rawSubgroups : (rawSubgroups.data || []);
        if (subgroupsData.length > 0) {
          setSubgroups(subgroupsData);
        }

        const rawAccountsPayload = accountsRes as any;
        const accountsData = Array.isArray(rawAccountsPayload)
          ? rawAccountsPayload
          : (rawAccountsPayload.data || []);
        if (accountsData.length > 0) {
          applyAccountsData(accountsData);
        }

        // Update counters locally based on existing vouchers
        if (vouchersRes.data) {
          const list = vouchersRes.data as any[];
          const counters = { ...VOUCHER_SEQUENCE_FLOORS };

          list.forEach((v) => {
            const type = v.type as VoucherTab;
            if (!VOUCHER_TYPE_PREFIX[type]) return;
            const seq = parseVoucherSequence(
              v.voucherNumber,
              VOUCHER_TYPE_PREFIX[type],
            );
            if (seq !== null && seq > counters[type]) {
              counters[type] = seq;
            }
          });
          setVoucherCounters(counters);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
        toast({
          title: "Error",
          description: "Failed to fetch data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
  }, [toast]);

  useEffect(() => {
    if (mainTab === "new") {
      void refreshAccounts();
    }
  }, [mainTab, refreshAccounts]);

  const handleAddSubgroup = () => {
    setShowSubgroupDialog(true);
  };

  const handleAddAccount = () => {
    setShowAccountDialog(true);
  };

  const handleSaveSubgroup = async () => {
    if (!selectedMainGroup) {
      toast({ title: "Error", description: "Please select a Main Group", variant: "destructive" });
      return;
    }
    if (!newSubgroupName.trim()) {
      toast({ title: "Error", description: "Please enter Subgroup Name", variant: "destructive" });
      return;
    }

    try {
      // Find main group code to help generate/validate code?
      // For now just create
      const res = await apiClient.createSubgroup({
        mainGroupId: selectedMainGroup,
        name: newSubgroupName,
        code: newSubgroupCode || String(Math.floor(Math.random() * 1000)), // Temp code generation if empty
        isActive: true
      });

      if (res.data) {
        setSubgroups([...subgroups, res.data as any]);
        toast({ title: "Success", description: "Subgroup created successfully" });
        setNewSubgroupName("");
        setNewSubgroupCode("");
        setSelectedMainGroup("");
        setShowSubgroupDialog(false);
      }
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to create subgroup", variant: "destructive" });
    }
  };

  const handleSaveAccount = async () => {
    if (!selectedSubgroup) {
      toast({ title: "Error", description: "Please select a Subgroup", variant: "destructive" });
      return;
    }
    if (!newAccountName.trim()) {
      toast({ title: "Error", description: "Please enter Account Name", variant: "destructive" });
      return;
    }

    try {
      const res = await apiClient.createAccount({
        subgroupId: selectedSubgroup,
        name: newAccountName,
        code: newAccountCode || String(Math.floor(Math.random() * 100000)),
        openingBalance: 0,
        status: "active"
      });

      if (res.data) {
        const newAcc = res.data as any;
        setRawAccounts((prev) => [...prev, newAcc]);
        setAccountsList((prev) => {
          if (prev.some((p) => p.value === newAcc.id)) return prev;
          return [...prev, ...buildVoucherAccountOptions([newAcc])];
        });
        toast({ title: "Success", description: "Account created successfully" });
        setNewAccountName("");
        setNewAccountCode("");
        setSelectedSubgroup("");
        setShowAccountDialog(false);
      }
    } catch (error: any) {
      toast({ title: "Error", description: "Failed to create account", variant: "destructive" });
    }
  };

  const handleSearch = async (filters: any) => {
    try {
      setLoading(true);
      const res = await apiClient.getVouchers({
        ...filters,
        limit: 1000 // Keep limit high for now or implement proper pagination
      });
      if (res.data) {
        setVouchers(res.data as any);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to search vouchers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Helper function to convert date string to ISO format
  const convertDateToISO = (dateString: string): string => {
    if (!dateString) return new Date().toISOString().split('T')[0];

    // If already in ISO format (YYYY-MM-DD), return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      return dateString;
    }

    // If in DD/MM/YYYY format, convert it
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
      const [day, month, year] = dateString.split('/');
      return `${year}-${month}-${day}`;
    }

    // Try to parse as date
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch {
      // If parsing fails, return current date
    }

    return new Date().toISOString().split('T')[0];
  };

  const handleSaveVoucher = async (data: any) => {
    const voucherType = data.type as VoucherTab;
    if (!VOUCHER_TYPE_PREFIX[voucherType]) {
      toast({
        title: "Error",
        description: "Invalid voucher type",
        variant: "destructive",
      });
      return;
    }

    let voucherNumber: string;
    let nextNum: number;
    try {
      const nextRes = (await apiClient.getNextVoucherNumber(
        voucherType,
      )) as any;
      if (nextRes.error || !nextRes.data?.voucherNumber) {
        toast({
          title: "Error",
          description: nextRes.error || "Could not generate voucher number",
          variant: "destructive",
        });
        return;
      }
      voucherNumber = nextRes.data.voucherNumber;
      nextNum =
        nextRes.data.sequence ??
        parseVoucherSequence(
          voucherNumber,
          VOUCHER_TYPE_PREFIX[voucherType],
        ) ??
        maxVoucherSequence(vouchers, voucherType) + 1;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || error.message || "Could not generate voucher number",
        variant: "destructive",
      });
      return;
    }

    let newVoucher: Voucher;
    const voucherDate = convertDateToISO(data.date);

    // Payment/Receipt forms send `entries`.
    // Older/other flows may send `VoucherEntry`.
    const paymentReceiptEntries =
      (data.VoucherEntry ?? data.entries ?? []) as any[];

    if (data.type === "payment") {
      // Convert Payment Voucher data
      const entries: VoucherEntry[] = paymentReceiptEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.accountDr ?? entry.account,
        description: entry.description || "",
        debit: entry.drAmount ?? entry.debit ?? 0,
        credit: 0,
      }));
      // Add the Cr account entry
      entries.push({
        id: `cr-${Date.now()}`,
        account: data.crAccount,
        description: `Payment to ${data.paidTo}`,
        debit: 0,
        credit: data.totalAmount || 0,
      });

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "payment",
        date: voucherDate,
        narration: data.paidTo || "",
        cashBankAccount: data.crAccount,
        entries,
        totalDebit: data.totalAmount || 0,
        totalCredit: data.totalAmount || 0,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else if (data.type === "receipt") {
      // Convert Receipt Voucher data
      const entries: VoucherEntry[] = paymentReceiptEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.accountCr ?? entry.account,
        description: entry.description || "",
        debit: 0,
        credit: entry.crAmount ?? entry.credit ?? 0,
      }));
      // Add the Dr account entry
      entries.unshift({
        id: `dr-${Date.now()}`,
        account: data.drAccount,
        description: `Receipt from ${data.receivedFrom}`,
        debit: data.totalAmount || 0,
        credit: 0,
      });

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "receipt",
        date: voucherDate,
        narration: data.receivedFrom || "",
        cashBankAccount: data.drAccount,
        entries,
        totalDebit: data.totalAmount || 0,
        totalCredit: data.totalAmount || 0,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else if (data.type === "journal") {
      // Convert Journal Voucher data
      const drEntries: VoucherEntry[] = data.drEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: entry.drAmount || 0,
        credit: 0,
      }));
      const crEntries: VoucherEntry[] = data.crEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: 0,
        credit: entry.crAmount || 0,
      }));

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "journal",
        date: voucherDate,
        narration: data.name || "",
        cashBankAccount: "",
        entries: [...drEntries, ...crEntries],
        totalDebit: data.totalDr || 0,
        totalCredit: data.totalCr || 0,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else if (data.type === "contra") {
      // Convert Contra Voucher data
      const drEntries: VoucherEntry[] = data.drEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: entry.drAmount || 0,
        credit: 0,
      }));
      const crEntries: VoucherEntry[] = data.crEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: 0,
        credit: entry.crAmount || 0,
      }));

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "contra",
        date: voucherDate,
        narration: data.name || "",
        cashBankAccount: "",
        entries: [...drEntries, ...crEntries],
        totalDebit: data.totalDr || 0,
        totalCredit: data.totalCr || 0,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else {
      // Fallback for any other type
      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: data.type,
        date: voucherDate,
        narration: data.narration || data.name || data.paidTo || data.receivedFrom || "",
        cashBankAccount: data.cashBankAccount || data.crAccount || data.drAccount || "",
        entries: data.entries || [],
        totalDebit: data.totalDebit || data.totalAmount || data.totalDr || 0,
        totalCredit: data.totalCredit || data.totalAmount || data.totalCr || 0,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    }

    // Prepare entries for API - ensure we send both accountId and accountName
    const apiEntries = newVoucher.entries.map((entry, index) => {
      const accountInfo = accountsList.find(acc => acc.value === entry.account);
      return {
        accountId: entry.account, // The ID of the account
        accountName: accountInfo ? accountInfo.label : entry.account, // The display name
        description: entry.description,
        debit: entry.debit,
        credit: entry.credit,
        sortOrder: index,
      };
    });

    try {
      let activeVoucherNumber = voucherNumber;
      let activeNextNum = nextNum;
      let response: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const retryRes = (await apiClient.getNextVoucherNumber(
            voucherType,
          )) as any;
          if (retryRes.error || !retryRes.data?.voucherNumber) {
            break;
          }
          activeVoucherNumber = retryRes.data.voucherNumber;
          activeNextNum =
            retryRes.data.sequence ??
            parseVoucherSequence(
              activeVoucherNumber,
              VOUCHER_TYPE_PREFIX[voucherType],
            ) ??
            activeNextNum + 1;
          newVoucher = { ...newVoucher, voucherNumber: activeVoucherNumber };
        }

        response = await apiClient.createVoucher({
          voucherNumber: activeVoucherNumber,
          type: newVoucher.type,
          date: newVoucher.date,
          narration: newVoucher.narration,
          cashBankAccount: newVoucher.cashBankAccount,
          chequeNumber: data.chequeNumber,
          chequeDate: data.chequeDate ? convertDateToISO(data.chequeDate) : undefined,
          entries: apiEntries,
          status: newVoucher.status,
          createdBy: "User",
        });

        if (response.data) {
          nextNum = activeNextNum;
          break;
        }

        const errText = String(response.error ?? "").toLowerCase();
        if (!errText.includes("already exists")) {
          break;
        }
      }

      if (response?.data) {
        setVouchers((prev) => [response.data, ...prev]);
        setVoucherCounters((prev) => ({
          ...prev,
          [voucherType]: Math.max(prev[voucherType] ?? 0, nextNum),
        }));

        toast({
          title: "Success",
          description: `Voucher ${activeVoucherNumber} created successfully`,
        });
      } else if (response?.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || "Failed to create voucher",
        variant: "destructive",
      });
    }
  };

  const handleUpdateVoucher = async (updatedVoucher: Voucher) => {
    try {
      const apiEntries = (updatedVoucher.entries || []).map((entry, index) => {
        // Fallback for account identifier
        const accId = entry.account || entry.accountId;
        const accountInfo = accountsList.find(acc => acc.value === accId);

        return {
          accountId: accId,
          accountName: accountInfo ? accountInfo.label : (entry.accountName || accId || 'Account'),
          description: entry.description || "",
          debit: Number(entry.debit || 0),
          credit: Number(entry.credit || 0),
          sortOrder: index,
        };
      });

      const updateData: any = {
        type: updatedVoucher.type,
        date: updatedVoucher.date,
        narration: updatedVoucher.narration,
        cashBankAccount: updatedVoucher.cashBankAccount,
        status: updatedVoucher.status,
        chequeNumber: updatedVoucher.chequeNumber || null,
        chequeDate: updatedVoucher.chequeDate ? convertDateToISO(updatedVoucher.chequeDate) : null,
        checkClearDate: updatedVoucher.checkClearDate ? convertDateToISO(updatedVoucher.checkClearDate) : null,
        isCleared: (updatedVoucher.isCleared !== undefined && updatedVoucher.isCleared !== null) ? parseInt(String(updatedVoucher.isCleared)) : null,
      };

      // ONLY include entries if they exist and are not empty
      // This prevents "simple" status updates from accidentally wiping entries if they weren't loaded
      if (apiEntries.length > 0) {
        updateData.VoucherEntry = apiEntries;
      }

      const response = await apiClient.updateVoucher(updatedVoucher.id, updateData) as any;

      // Check if the response contains an error
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        throw new Error(response.error);
      }

      if (response.data) {
        setVouchers(vouchers.map(v => v.id === updatedVoucher.id ? response.data : v));
        toast({ title: "Success", description: "Voucher updated successfully" });
      }
    } catch (error: any) {
      // Only show toast if it wasn't already shown above
      if (!error.message || error.message === "Failed to update voucher") {
        toast({
          title: "Error",
          description: error.error || error.message || "Failed to update voucher",
          variant: "destructive",
        });
      }
      throw error; // Re-throw so calling functions know it failed
    }
  };

  const handleDeleteVoucher = async (id: string) => {
    try {
      await apiClient.deleteVoucher(id);
      setVouchers(vouchers.filter(v => v.id !== id));
      toast({ title: "Success", description: "Voucher deleted successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || "Failed to delete voucher",
        variant: "destructive",
      });
    }
  };

  const generateVoucherNo = () => {
    const next = voucherCounters.receipt + 1;
    return `RV${String(next).padStart(4, "0")}`;
  };

  return (
    <div className="space-y-6">
      {/* Main Tab Navigation */}
      <div className="bg-card border-b border-border">
        <div className="flex items-center gap-1 overflow-x-auto">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setMainTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 rounded-t-lg",
                  mainTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {mainTab === "new" && (
        <>
          {/* Voucher Type Tab Navigation */}
          <div className="bg-card border-b border-border">
            <div className="flex items-center gap-1 overflow-x-auto">
              {voucherTabs.map((tab) => {
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200 rounded-t-lg",
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <span className="text-xs">^</span>
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Content */}
          <div className="bg-card border border-border rounded-lg p-6">
            {activeTab === "payment" && (
              <PaymentVoucherForm
                accounts={accountsList}
                cashBankAccounts={cashBankAccounts}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
              />
            )}
            {activeTab === "receipt" && (
              <ReceiptVoucherForm
                accounts={accountsList}
                cashBankAccounts={cashBankAccounts}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
                generateVoucherNo={generateVoucherNo}
              />
            )}
            {activeTab === "journal" && (
              <JournalVoucherForm
                accounts={accountsList}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
              />
            )}
            {activeTab === "contra" && (
              <ContraVoucherForm
                accounts={accountsList}
                cashBankAccounts={cashBankAccounts}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
              />
            )}
          </div>
        </>
      )}

      {mainTab === "view" && (
        <ViewVouchersTab
          vouchers={vouchers}
          onUpdateVoucher={handleUpdateVoucher}
          onDeleteVoucher={handleDeleteVoucher}
          accounts={accountsList}
          rawAccounts={rawAccounts}
          onAddSubgroup={handleAddSubgroup}
          onAddAccount={handleAddAccount}
          onSearch={handleSearch}
        />
      )}

      {/* Add Subgroup Dialog */}
      <Dialog open={showSubgroupDialog} onOpenChange={setShowSubgroupDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Subgroup</DialogTitle>
            <DialogDescription>
              Create a new subgroup for organizing your accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main Group</Label>
              <Select value={selectedMainGroup} onValueChange={setSelectedMainGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Main Group" />
                </SelectTrigger>
                <SelectContent>
                  {mainGroups.map((mg) => (
                    <SelectItem key={mg.id} value={mg.id}>
                      {mg.code} - {mg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                <Label htmlFor="subgroupCode">Code</Label>
                <Input
                  id="subgroupCode"
                  placeholder="Code"
                  value={newSubgroupCode}
                  onChange={(e) => setNewSubgroupCode(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="subgroupName">Subgroup Name</Label>
                <Input
                  id="subgroupName"
                  placeholder="Enter subgroup name"
                  value={newSubgroupName}
                  onChange={(e) => setNewSubgroupName(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubgroupDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSubgroup}>Save Subgroup</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Account Dialog */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
            <DialogDescription>
              Create a new account for your chart of accounts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subgroup</Label>
              <Select value={selectedSubgroup} onValueChange={setSelectedSubgroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Subgroup" />
                </SelectTrigger>
                <SelectContent>
                  {subgroups.map((sg) => {
                    const mg = mainGroups.find((m) => m.id === sg.mainGroupId);
                    return (
                      <SelectItem key={sg.id} value={sg.id}>
                        {sg.code} - {sg.name}
                        {mg ? ` (${mg.name})` : ""}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-1 space-y-2">
                <Label htmlFor="accountCode">Code</Label>
                <Input
                  id="accountCode"
                  placeholder="Code"
                  value={newAccountCode}
                  onChange={(e) => setNewAccountCode(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="accountName">Account Name</Label>
                <Input
                  id="accountName"
                  placeholder="Enter account name"
                  value={newAccountName}
                  onChange={(e) => setNewAccountName(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccountDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAccount}>Save Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
