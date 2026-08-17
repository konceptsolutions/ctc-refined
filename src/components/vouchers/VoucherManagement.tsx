import { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
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
import { isCashBankAccount, isCashLedgerAccount, isBankLedgerAccount } from "@/utils/cashBankMode";
import { buildVoucherAccountOptions, buildBalanceMap, findCashDiscountAccount } from "@/utils/voucherAccounts";
import { resolvePostedAmount } from "@/utils/fcLcAmount";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

export interface Voucher {
  id: string;
  voucherNumber: string;
  type: "receipt" | "payment" | "journal" | "contra";
  mode?: "cash" | "online";
  conversionRate?: number;
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
type ReceiptVoucherKind = "cash" | "bank" | "cheque";
type VoucherTab =
  | "receipt-cash"
  | "receipt-bank"
  | "receipt-cheque"
  | "payment"
  | "journal"
  | "contra";
type VoucherCategory = "general" | "international_supplier";

const VOUCHER_DB_TYPE: Record<VoucherTab, Voucher["type"]> = {
  "receipt-cash": "receipt",
  "receipt-bank": "receipt",
  "receipt-cheque": "receipt",
  payment: "payment",
  journal: "journal",
  contra: "contra",
};

const VOUCHER_TYPE_PREFIX: Record<VoucherTab, string> = {
  "receipt-cash": "RVC",
  "receipt-bank": "RVB",
  "receipt-cheque": "RVCH",
  payment: "PV",
  journal: "JV",
  contra: "CV",
};

const VOUCHER_SEQUENCE_FLOORS: Record<VoucherTab, number> = {
  "receipt-cash": 1000,
  "receipt-bank": 1000,
  "receipt-cheque": 1000,
  payment: 2000,
  journal: 3000,
  contra: 100,
};

function getReceiptKind(tab: VoucherTab): ReceiptVoucherKind | null {
  if (tab === "receipt-cash") return "cash";
  if (tab === "receipt-bank") return "bank";
  if (tab === "receipt-cheque") return "cheque";
  return null;
}

function isReceiptTab(tab: VoucherTab): boolean {
  return getReceiptKind(tab) !== null;
}

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
  tab: VoucherTab,
): number {
  const prefix = VOUCHER_TYPE_PREFIX[tab];
  const dbType = VOUCHER_DB_TYPE[tab];
  const floor = VOUCHER_SEQUENCE_FLOORS[tab];
  let maxSeq = floor;
  for (const voucher of voucherList) {
    if (voucher.type !== dbType) continue;
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
  { id: "receipt-cash", label: "Receipt Voucher Cash", icon: Receipt },
  { id: "receipt-bank", label: "Receipt Voucher Bank", icon: Receipt },
  { id: "receipt-cheque", label: "Receipt Voucher Cheque", icon: Receipt },
  { id: "payment", label: "Payment Voucher", icon: CreditCard },
  { id: "journal", label: "Journal Voucher", icon: FileText },
  { id: "contra", label: "Contra Voucher", icon: ArrowRightLeft },
];

const internationalVoucherTabs: VoucherTab[] = ["payment", "journal"];

const VOUCHER_TAB_ALIASES: Record<string, VoucherTab> = {
  "receipt-cash": "receipt-cash",
  rvc: "receipt-cash",
  receipt: "receipt-cash",
  rv: "receipt-cash",
  "receipt-bank": "receipt-bank",
  rvb: "receipt-bank",
  "receipt-cheque": "receipt-cheque",
  rvch: "receipt-cheque",
  payment: "payment",
  pv: "payment",
  journal: "journal",
  jv: "journal",
  contra: "contra",
  cv: "contra",
};

function resolveMainTab(mode: string | null): MainTab {
  if (mode === "new" || mode === "view") return mode;
  return "view";
}

function resolveVoucherTab(tab: string | null): VoucherTab {
  if (!tab) return "receipt-cash";
  return VOUCHER_TAB_ALIASES[tab.toLowerCase()] ?? "receipt-cash";
}

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
  const [searchParams, setSearchParams] = useSearchParams();
  const mainTab = resolveMainTab(searchParams.get("mode"));
  const activeTab = resolveVoucherTab(searchParams.get("tab"));

  const setMainTab = useCallback(
    (tab: MainTab) => {
      const next = new URLSearchParams(searchParams);
      next.set("mode", tab);
      if (tab === "new" && !next.get("tab")) {
        next.set("tab", "receipt-cash");
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const setActiveTab = useCallback(
    (tab: VoucherTab) => {
      const next = new URLSearchParams(searchParams);
      next.set("mode", "new");
      next.set("tab", tab);
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const [voucherCategory, setVoucherCategory] = useState<VoucherCategory>("general");
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);

  // Dynamic data states
  const [mainGroups, setMainGroups] = useState<{ id: string, name: string, code: string }[]>([]);
  const [subgroups, setSubgroups] = useState<{ id: string, name: string, code: string, mainGroupId: string }[]>([]);
  const [accountsList, setAccountsList] = useState<SearchableSelectOption[]>([]);
  const [rawAccounts, setRawAccounts] = useState<any[]>([]);
  const [balanceMap, setBalanceMap] = useState<Record<string, number>>({});

  // Dialog states
  const [showSubgroupDialog, setShowSubgroupDialog] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [newSubgroupName, setNewSubgroupName] = useState("");
  const [newSubgroupCode, setNewSubgroupCode] = useState("");
  const [selectedMainGroup, setSelectedMainGroup] = useState("");
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountCode, setNewAccountCode] = useState("");
  const [selectedSubgroup, setSelectedSubgroup] = useState("");

  const [voucherCounters, setVoucherCounters] = useState<
    Record<VoucherTab, number>
  >({
    "receipt-cash": VOUCHER_SEQUENCE_FLOORS["receipt-cash"],
    "receipt-bank": VOUCHER_SEQUENCE_FLOORS["receipt-bank"],
    "receipt-cheque": VOUCHER_SEQUENCE_FLOORS["receipt-cheque"],
    payment: VOUCHER_SEQUENCE_FLOORS.payment,
    journal: VOUCHER_SEQUENCE_FLOORS.journal,
    contra: VOUCHER_SEQUENCE_FLOORS.contra,
  });

  const receiptKind = getReceiptKind(activeTab);

  const receiptDrAccounts = useMemo(() => {
    if (!receiptKind) return [];
    return rawAccounts
      .filter((acc: any) => {
        if (receiptKind === "cash") return isCashLedgerAccount(acc);
        return isBankLedgerAccount(acc);
      })
      .map((acc: any) => ({
        value: acc.id,
        label: `${acc.code} - ${acc.name}`,
      }));
  }, [rawAccounts, receiptKind]);

  const cashBankAccounts = useMemo(() => {
    return rawAccounts
      .filter((acc: any) => isCashBankAccount(acc))
      .map((acc: any) => ({
        value: acc.id,
        label: `${acc.code} - ${acc.name}`
      }));
  }, [rawAccounts]);

  const cashDiscountAccountId = useMemo(
    () => findCashDiscountAccount(rawAccounts)?.id,
    [rawAccounts],
  );

  const applyAccountsData = (
    accountsData: any[],
    ledgerBalances?: Record<string, number>,
  ) => {
    setRawAccounts(accountsData);
    setAccountsList(buildVoucherAccountOptions(accountsData));
    if (ledgerBalances && Object.keys(ledgerBalances).length > 0) {
      setBalanceMap(ledgerBalances);
    } else {
      setBalanceMap(buildBalanceMap(accountsData));
    }
  };

  const refreshAccounts = useCallback(async () => {
    const [accountsRes, balancesRes] = await Promise.all([
      apiClient.getAccounts({ status: "Active" }),
      apiClient.getAccountBalances(),
    ]);
    const raw = accountsRes as any;
    const accountsData = Array.isArray(raw) ? raw : (raw.data || []);
    const balancesRaw = balancesRes as any;
    const ledgerBalances =
      balancesRaw?.data && typeof balancesRaw.data === "object"
        ? balancesRaw.data
        : undefined;
    if (accountsData.length > 0) {
      applyAccountsData(accountsData, ledgerBalances);
    }
  }, []);

  // Fetch all data
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        setLoading(true);
        const [vouchersRes, accountsRes, balancesRes, subgroupsRes, mainGroupsRes] = await Promise.all([
          apiClient.getVouchers({ limit: 1000 }),
          apiClient.getAccounts({ status: "Active" }),
          apiClient.getAccountBalances(),
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
        const balancesRaw = balancesRes as any;
        const ledgerBalances =
          balancesRaw?.data && typeof balancesRaw.data === "object"
            ? balancesRaw.data
            : undefined;
        if (accountsData.length > 0) {
          applyAccountsData(accountsData, ledgerBalances);
        }

        // Update counters locally based on existing vouchers
        if (vouchersRes.data) {
          const list = vouchersRes.data as any[];
          const counters: Record<VoucherTab, number> = {
            "receipt-cash": VOUCHER_SEQUENCE_FLOORS["receipt-cash"],
            "receipt-bank": VOUCHER_SEQUENCE_FLOORS["receipt-bank"],
            "receipt-cheque": VOUCHER_SEQUENCE_FLOORS["receipt-cheque"],
            payment: VOUCHER_SEQUENCE_FLOORS.payment,
            journal: VOUCHER_SEQUENCE_FLOORS.journal,
            contra: VOUCHER_SEQUENCE_FLOORS.contra,
          };

          (Object.keys(VOUCHER_TYPE_PREFIX) as VoucherTab[]).forEach((tab) => {
            counters[tab] = maxVoucherSequence(list, tab);
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

  useEffect(() => {
    if (
      voucherCategory === "international_supplier" &&
      !internationalVoucherTabs.includes(activeTab)
    ) {
      setActiveTab("payment");
    }
  }, [voucherCategory, activeTab, setActiveTab]);

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

  const handleSaveVoucher = async (data: any): Promise<boolean> => {
    const voucherTab = (data.voucherTab ?? activeTab) as VoucherTab;
    if (!VOUCHER_TYPE_PREFIX[voucherTab]) {
      toast({
        title: "Error",
        description: "Invalid voucher type",
        variant: "destructive",
      });
      return false;
    }

    const voucherDbType = VOUCHER_DB_TYPE[voucherTab];
    const receiptKindForSave =
      (data.receiptKind as ReceiptVoucherKind | undefined) ??
      getReceiptKind(voucherTab) ??
      undefined;

    let voucherNumber: string;
    let nextNum: number;
    try {
      const nextRes = (await apiClient.getNextVoucherNumber(
        voucherDbType,
        receiptKindForSave,
      )) as any;
      if (nextRes.error || !nextRes.data?.voucherNumber) {
        toast({
          title: "Error",
          description: nextRes.error || "Could not generate voucher number",
          variant: "destructive",
        });
        return false;
      }
      voucherNumber = nextRes.data.voucherNumber;
      nextNum =
        nextRes.data.sequence ??
        parseVoucherSequence(
          voucherNumber,
          VOUCHER_TYPE_PREFIX[voucherTab],
        ) ??
        maxVoucherSequence(vouchers, voucherTab) + 1;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || error.message || "Could not generate voucher number",
        variant: "destructive",
      });
      return false;
    }

    let newVoucher: Voucher;
    const voucherDate = convertDateToISO(data.date);

    // Payment/Receipt forms send `entries`.
    // Older/other flows may send `VoucherEntry`.
    const paymentReceiptEntries =
      (data.VoucherEntry ?? data.entries ?? []) as any[];

    if (data.type === "payment") {
      // Convert Payment Voucher data
      // Prefer LC when set; empty-string LC must not override FC (?? treats "" as valid).
      const entries: VoucherEntry[] = paymentReceiptEntries.map((entry: any) => ({
        id: entry.id,
        account: entry.accountDr ?? entry.account,
        description: entry.description || "",
        debit: resolvePostedAmount(entry.drAmountLc, entry.drAmount ?? entry.debit),
        credit: 0,
      }));
      const paymentTotal = entries.reduce(
        (sum, entry) => sum + (Number(entry.debit) || 0),
        0,
      );
      // Add the Cr account entry (must match sum of Dr lines)
      entries.push({
        id: `cr-${Date.now()}`,
        account: data.crAccount,
        description: `Payment to ${data.paidTo}`,
        debit: 0,
        credit: paymentTotal,
      });

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "payment",
        date: voucherDate,
        narration: data.paidTo || "",
        cashBankAccount: data.crAccount,
        ...(voucherCategory === "international_supplier"
          ? { conversionRate: Number(data.conversionRate || 1) }
          : {}),
        entries,
        totalDebit: paymentTotal,
        totalCredit: paymentTotal,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else if (data.type === "receipt") {
      const cashReceived =
        Number(data.totalReceived ?? data.totalAmount ?? 0) || 0;

      // Cash discount is per-line on the receipt form (cash receipt vouchers only).
      const discountLines = paymentReceiptEntries
        .map((entry: any) => ({
          accountCr: entry.accountCr ?? entry.account,
          discount: Number(entry.cashDiscount ?? 0) || 0,
        }))
        .filter((l: any) => l.discount > 0 && !!l.accountCr);

      const cashDiscount = discountLines.reduce(
        (sum: number, l: any) => sum + (Number(l.discount) || 0),
        0,
      );
      const voucherTotal = cashReceived + cashDiscount;

      // Convert Receipt Voucher data — Cr lines are cash received per account
      const entries: VoucherEntry[] = paymentReceiptEntries.map(
        (entry: any) => ({
          id: entry.id,
          account: entry.accountCr ?? entry.account,
          description: entry.description || "",
          debit: 0,
          credit: entry.crAmount ?? entry.credit ?? 0,
        }),
      );

      // Dr cash/bank for amount actually received
      entries.unshift({
        id: `dr-${Date.now()}`,
        account: data.drAccount,
        description: `Receipt from ${data.receivedFrom}`,
        debit: cashReceived,
        credit: 0,
      });

      // Cash discount: Dr Cash (Discount), Cr selected Account Cr line
      if (cashDiscount > 0 && data.cashDiscountAccount) {
        // Create a cash discount journal pair per account line
        // so the Cr side matches the same account that received the amount.
        for (const line of discountLines) {
          entries.push({
            id: `dr-disc-${Date.now()}-${String(line.accountCr)}`,
            account: data.cashDiscountAccount,
            description: "Cash discount",
            debit: line.discount,
            credit: 0,
          });

          entries.push({
            id: `cr-disc-${Date.now()}-${String(line.accountCr)}`,
            account: line.accountCr,
            description: "Cash discount",
            debit: 0,
            credit: line.discount,
          });
        }
      }

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "receipt",
        date: voucherDate,
        narration: data.receivedFrom || "",
        cashBankAccount: data.drAccount,
        entries,
        totalDebit: voucherTotal,
        totalCredit: voucherTotal,
        status: "posted",
        createdAt: new Date().toISOString(),
      };
    } else if (data.type === "journal") {
      // Convert Journal Voucher data.
      // Local JV: post the Dr/Cr amounts the user typed (ignore empty LC).
      // International: prefer LC, but never let a 0 LC wipe a real FC line.
      const useLc = voucherCategory === "international_supplier";
      const drEntries: VoucherEntry[] = (data.drEntries || []).map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: useLc
          ? resolvePostedAmount(entry.drAmountLc, entry.drAmount)
          : resolvePostedAmount(entry.drAmount, 0),
        credit: 0,
      }));
      const crEntries: VoucherEntry[] = (data.crEntries || []).map((entry: any) => ({
        id: entry.id,
        account: entry.account,
        description: entry.description || "",
        debit: 0,
        credit: useLc
          ? resolvePostedAmount(entry.crAmountLc, entry.crAmount)
          : resolvePostedAmount(entry.crAmount, 0),
      }));
      const journalEntries = [...drEntries, ...crEntries];
      let journalDebit = journalEntries.reduce(
        (sum, entry) => sum + (Number(entry.debit) || 0),
        0,
      );
      let journalCredit = journalEntries.reduce(
        (sum, entry) => sum + (Number(entry.credit) || 0),
        0,
      );
      // Multiple Dr lines vs one Cr can drift by rounding; if the form was
      // balanced, plug the difference into the last credit (or debit) line.
      if (Math.abs(journalDebit - journalCredit) > 0.01) {
        const formDr = Number(data.totalDr) || 0;
        const formCr = Number(data.totalCr) || 0;
        if (Math.abs(formDr - formCr) <= 0.01 && (formDr > 0 || formCr > 0)) {
          const diff = Number((journalDebit - journalCredit).toFixed(4));
          if (crEntries.length > 0 && journalDebit > 0) {
            const last = crEntries[crEntries.length - 1];
            last.credit = Number(((Number(last.credit) || 0) + diff).toFixed(4));
            journalCredit = journalDebit;
          } else if (drEntries.length > 0 && journalCredit > 0) {
            const last = drEntries[drEntries.length - 1];
            last.debit = Number(((Number(last.debit) || 0) - diff).toFixed(4));
            journalDebit = journalCredit;
          }
        }
      }

      newVoucher = {
        id: Date.now().toString(),
        voucherNumber,
        type: "journal",
        date: voucherDate,
        narration: data.name || "",
        cashBankAccount: "",
        ...(voucherCategory === "international_supplier"
          ? { conversionRate: Number(data.conversionRate || 1) }
          : {}),
        entries: journalEntries,
        totalDebit: journalDebit,
        totalCredit: journalCredit,
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
        debit: Number(entry.debit) || 0,
        credit: Number(entry.credit) || 0,
        sortOrder: index,
      };
    });

    const missingAccount = apiEntries.find(
      (entry) => !entry.accountId || String(entry.accountId).trim() === "",
    );
    if (missingAccount) {
      toast({
        title: "Error",
        description: "Please select a valid account for every voucher line",
        variant: "destructive",
      });
      return false;
    }

    try {
      let activeVoucherNumber = voucherNumber;
      let activeNextNum = nextNum;
      let response: any = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          const retryRes = (await apiClient.getNextVoucherNumber(
            voucherDbType,
            receiptKindForSave,
          )) as any;
          if (retryRes.error || !retryRes.data?.voucherNumber) {
            break;
          }
          activeVoucherNumber = retryRes.data.voucherNumber;
          activeNextNum =
            retryRes.data.sequence ??
            parseVoucherSequence(
              activeVoucherNumber,
              VOUCHER_TYPE_PREFIX[voucherTab],
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
          ...(voucherCategory === "international_supplier"
            ? { conversionRate: Number(newVoucher.conversionRate || 1) }
            : {}),
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
        const savedVoucher = {
          ...(response.data as Voucher),
          entries:
            (response.data as Voucher).entries ??
            (response.data as Voucher).VoucherEntry ??
            [],
        };
        setVouchers((prev) => [savedVoucher, ...prev]);
        setVoucherCounters((prev) => ({
          ...prev,
          [voucherTab]: Math.max(prev[voucherTab] ?? 0, nextNum),
        }));
        setMainTab("view");

        toast({
          title: "Success",
          description: `Voucher ${activeVoucherNumber} created successfully`,
        });
        return true;
      }

      if (response?.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create voucher. Please try again.",
          variant: "destructive",
        });
      }
      return false;
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.error || error.message || "Failed to create voucher",
        variant: "destructive",
      });
      return false;
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
        ...(updatedVoucher.conversionRate !== undefined && updatedVoucher.conversionRate !== null
          ? { conversionRate: Number(updatedVoucher.conversionRate) }
          : {}),
      };

      // ONLY include entries if they exist and are not empty
      // This prevents "simple" status updates from accidentally wiping entries if they weren't loaded
      // Backend PUT /vouchers/:id expects `entries` (not VoucherEntry)
      if (apiEntries.length > 0) {
        updateData.entries = apiEntries;
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

  const generateVoucherNo = (tab: VoucherTab = activeTab) => {
    const next = voucherCounters[tab] + 1;
    return `${VOUCHER_TYPE_PREFIX[tab]}${String(next).padStart(4, "0")}`;
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
            <div className="flex flex-col gap-3 p-3">
              <div className="max-w-xs">
                <Label>Voucher Category</Label>
                <Select
                  value={voucherCategory}
                  onValueChange={(value) => setVoucherCategory(value as VoucherCategory)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Vouchers</SelectItem>
                    <SelectItem value="international_supplier">
                      International Supplier Vouchers
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1 overflow-x-auto">
                {voucherTabs
                  .filter((tab) =>
                    voucherCategory === "international_supplier"
                      ? internationalVoucherTabs.includes(tab.id)
                      : true,
                  )
                  .map((tab) => {
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
          </div>

          {/* Form Content */}
          <div className="bg-card border border-border rounded-lg p-6">
            {activeTab === "payment" && (
              <PaymentVoucherForm
                accounts={accountsList}
                cashBankAccounts={cashBankAccounts}
                isInternationalSupplier={voucherCategory === "international_supplier"}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
                balanceMap={balanceMap}
              />
            )}
            {isReceiptTab(activeTab) && receiptKind && (
              <ReceiptVoucherForm
                key={activeTab}
                receiptKind={receiptKind}
                accounts={accountsList}
                drAccountOptions={receiptDrAccounts}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
                generateVoucherNo={() => generateVoucherNo(activeTab)}
                balanceMap={balanceMap}
                voucherTab={activeTab}
                cashDiscountAccountId={cashDiscountAccountId}
              />
            )}
            {activeTab === "journal" && (
              <JournalVoucherForm
                accounts={accountsList}
                isInternationalSupplier={voucherCategory === "international_supplier"}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
                balanceMap={balanceMap}
              />
            )}
            {activeTab === "contra" && (
              <ContraVoucherForm
                accounts={accountsList}
                cashBankAccounts={cashBankAccounts}
                onAddSubgroup={handleAddSubgroup}
                onAddAccount={handleAddAccount}
                onSave={handleSaveVoucher}
                balanceMap={balanceMap}
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
