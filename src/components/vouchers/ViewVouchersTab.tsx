import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { Search, Edit, MoreVertical, Printer, CheckCircle, Clock, Trash, Plus, CalendarIcon, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  ACCOUNTING_COLORS,
  amountHeaderClass,
  amountValueClass,
  crHeaderClass,
  crValueClass,
  drHeaderClass,
  drValueClass,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/hooks/use-toast";
import { Voucher } from "./VoucherManagement";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { apiClient } from "@/lib/api";
import { getAccountCashBankMode } from "@/utils/cashBankMode";
import { usePageActions } from "@/permissions/pageActions";

interface ViewVouchersTabProps {
  vouchers: Voucher[];
  onUpdateVoucher: (voucher: Voucher) => void;
  onDeleteVoucher: (id: string) => Promise<void>;
  accounts: { value: string; label: string }[];
  rawAccounts?: any[];
  onAddSubgroup: () => void;
  onAddAccount: () => void;
  onSearch: (filters: any) => void;
}

interface FilterAccountGroup {
  id: string;
  name: string;
  mainGroup?: string;
  subGroup?: string;
}

// Hardcoded values removed - now passed via props

const VOUCHER_PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];

export const ViewVouchersTab = ({
  vouchers,
  onUpdateVoucher,
  onDeleteVoucher,
  accounts,
  rawAccounts = [],
  onAddSubgroup,
  onAddAccount,
  onSearch,
}: ViewVouchersTabProps) => {
  const { toast } = useToast();
  const {
    canEdit,
    canDelete,
    canStatus,
    canApprove,
    canMenuMore,
  } = usePageActions("vouchers.manage");

  const [filterMainGroups, setFilterMainGroups] = useState<FilterAccountGroup[]>([]);
  const [filterSubGroups, setFilterSubGroups] = useState<FilterAccountGroup[]>([]);
  const [filterAccounts, setFilterAccounts] = useState<FilterAccountGroup[]>([]);

  // Filter states
  const [typeFilter, setTypeFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("default");
  const [postDatedFilter, setPostDatedFilter] = useState("default");
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [mainGroupFilter, setMainGroupFilter] = useState("_all");
  const [subGroupFilter, setSubGroupFilter] = useState("_all");
  const [accountFilter, setAccountFilter] = useState("_all");
  const [searchBy, setSearchBy] = useState("voucher-no");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchFilterGroups = async () => {
      try {
        const response = await apiClient.getAccountGroups();
        const data = response.data as {
          mainGroups?: FilterAccountGroup[];
          subGroups?: FilterAccountGroup[];
          accounts?: FilterAccountGroup[];
        } | null;
        if (data) {
          setFilterMainGroups(data.mainGroups || []);
          setFilterSubGroups(data.subGroups || []);
          setFilterAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error("Failed to fetch account groups for voucher filters:", error);
      }
    };
    fetchFilterGroups();
  }, []);

  const visibleSubGroups = useMemo(() => {
    if (mainGroupFilter === "_all") return filterSubGroups;
    return filterSubGroups.filter((sg) => sg.mainGroup === mainGroupFilter);
  }, [filterSubGroups, mainGroupFilter]);

  const visibleAccounts = useMemo(() => {
    if (subGroupFilter !== "_all") {
      return filterAccounts.filter((acc) => acc.subGroup === subGroupFilter);
    }
    if (mainGroupFilter !== "_all") {
      const subgroupIds = new Set(visibleSubGroups.map((sg) => sg.id));
      return filterAccounts.filter((acc) => subgroupIds.has(acc.subGroup || ""));
    }
    return filterAccounts;
  }, [filterAccounts, subGroupFilter, mainGroupFilter, visibleSubGroups]);

  const handleMainGroupFilterChange = (value: string) => {
    setMainGroupFilter(value);
    setSubGroupFilter("_all");
    setAccountFilter("_all");
  };

  const handleSubGroupFilterChange = (value: string) => {
    setSubGroupFilter(value);
    setAccountFilter("_all");
    if (value !== "_all") {
      const subgroup = filterSubGroups.find((sg) => sg.id === value);
      if (subgroup?.mainGroup) {
        setMainGroupFilter(subgroup.mainGroup);
      }
    }
  };

  const handleAccountFilterChange = (value: string) => {
    setAccountFilter(value);
    if (value !== "_all") {
      const account = filterAccounts.find((acc) => acc.id === value);
      if (account?.subGroup) {
        setSubGroupFilter(account.subGroup);
        const subgroup = filterSubGroups.find((sg) => sg.id === account.subGroup);
        if (subgroup?.mainGroup) {
          setMainGroupFilter(subgroup.mainGroup);
        }
      }
    }
  };

  const isModeFilterEnabled =
    typeFilter === "payment" || typeFilter === "receipt";

  useEffect(() => {
    if (!isModeFilterEnabled && modeFilter !== "all") {
      setModeFilter("all");
    }
  }, [isModeFilterEnabled, modeFilter]);

  // Simple pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  // Selection
  const [selectedVouchers, setSelectedVouchers] = useState<string[]>([]);

  // Edit dialog
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);
  const [editEntries, setEditEntries] = useState<Voucher["entries"]>([]);
  const [editNarration, setEditNarration] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editCheckClearDate, setEditCheckClearDate] = useState("");
  const [editChequeNumber, setEditChequeNumber] = useState("");
  const [editChequeDate, setEditChequeDate] = useState("");
  const [editIsCleared, setEditIsCleared] = useState<number | null>(null);
  const [editExchangeRate, setEditExchangeRate] = useState("1");
  const [editIsInternational, setEditIsInternational] = useState(false);
  const [internationalAccountIds, setInternationalAccountIds] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const loadInternationalAccounts = async () => {
      try {
        const response = (await apiClient.getInternationalSupplierAccounts()) as any;
        const rows = Array.isArray(response?.data) ? response.data : [];
        setInternationalAccountIds(
          new Set(
            rows
              .map((row: any) => String(row.id || ""))
              .filter((id: string) => id.length > 0),
          ),
        );
      } catch (error) {
        console.error("Failed to load international supplier accounts:", error);
      }
    };
    loadInternationalAccounts();
  }, []);

  // View dialog (read-only)
  const [viewingVoucher, setViewingVoucher] = useState<Voucher | null>(null);

  // New state for clearance dialog
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const [voucherToClear, setVoucherToClear] = useState<Voucher | null>(null);
  const [clearanceDate, setClearanceDate] = useState(new Date().toISOString().split('T')[0]);

  // Debug the viewingVoucher state
  useEffect(() => {
    if (viewingVoucher) {
      console.log("Viewing voucher state:", viewingVoucher);
      console.log("Entries:", viewingVoucher.entries);
      console.log("VoucherEntry:", viewingVoucher.VoucherEntry);
    }
  }, [viewingVoucher]);

  // Helper to get account label by ID
  const getAccountLabel = (accountValue: string, accountData?: any) => {
    // If full account data is provided (from voucher entry), use it
    if (accountData && accountData.code && accountData.name) {
      return `${accountData.code} - ${accountData.name}`;
    }
    
    // Otherwise, look up in the accounts list
    const account = accounts.find(acc => acc.value === accountValue);
    return account ? account.label : accountValue;
  };

  // Function to fetch complete voucher details with entries
  const fetchVoucherDetails = async (voucherId: string) => {
    try {
      const response = await apiClient.getVoucher(voucherId);
      console.log("Fetched voucher details:", response.data);
      if (response.data) {
        setViewingVoucher(response.data as Voucher);
      }
    } catch (error) {
      console.error("Failed to fetch voucher details:", error);
      toast({
        title: "Error",
        description: "Failed to fetch voucher details",
        variant: "destructive",
      });
    }
  };

  // Print function - opens print dialog directly
  const handlePrint = (voucher: Voucher) => {
    const getVoucherTypeName = (type: Voucher["type"]) => {
      const names = {
        receipt: "Receipt Voucher",
        payment: "Payment Voucher",
        journal: "Journal Voucher",
        contra: "Contra Voucher",
      };
      return names[type];
    };

    const numberToWords = (num: number): string => {
      const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
        "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
      const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

      if (num === 0) return "Zero";

      const convertLessThanThousand = (n: number): string => {
        if (n === 0) return "";
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + ones[n % 10] : "");
        return ones[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convertLessThanThousand(n % 100) : "");
      };

      const wholePart = Math.floor(num);

      if (wholePart >= 10000000) {
        const crore = Math.floor(wholePart / 10000000);
        const remainder = wholePart % 10000000;
        return convertLessThanThousand(crore) + " Crore" + (remainder > 0 ? " " + numberToWords(remainder) : "");
      }
      if (wholePart >= 100000) {
        const lakh = Math.floor(wholePart / 100000);
        const remainder = wholePart % 100000;
        return convertLessThanThousand(lakh) + " Lakh" + (remainder > 0 ? " " + numberToWords(remainder) : "");
      }
      if (wholePart >= 1000) {
        const thousand = Math.floor(wholePart / 1000);
        const remainder = wholePart % 1000;
        return convertLessThanThousand(thousand) + " Thousand" + (remainder > 0 ? " " + convertLessThanThousand(remainder) : "");
      }

      return convertLessThanThousand(wholePart);
    };

    const formatDate = (dateString: string) => {
      try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        return date.toLocaleDateString("en-GB");
      } catch {
        return dateString;
      }
    };

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const printContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Print Voucher - ${voucher.voucherNumber}</title>
  <style>
    @media print {
      @page {
        size: A4;
        margin: 1cm;
      }
      body {
        margin: 0;
        padding: 0;
      }
    }
    body {
      font-family: Arial, sans-serif;
      padding: 32px;
      background: white;
      color: black;
      min-height: 297mm;
    }
    .header {
      border-bottom: 2px solid black;
      padding-bottom: 16px;
      margin-bottom: 24px;
      text-align: center;
    }
    .header h1 {
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 8px 0;
    }
    .header p {
      font-size: 14px;
      margin: 4px 0;
    }
    .voucher-title {
      text-align: center;
      margin-bottom: 24px;
    }
    .voucher-title h2 {
      font-size: 20px;
      font-weight: bold;
      border: 2px solid black;
      display: inline-block;
      padding: 8px 32px;
      margin: 0;
    }
    .voucher-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }
    .voucher-info p {
      margin: 8px 0;
    }
    .voucher-info .right {
      text-align: right;
    }
    .narration {
      margin-bottom: 24px;
      padding: 12px;
      background: #f5f5f5;
      border: 1px solid #e0e0e0;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      border: 1px solid black;
      margin-bottom: 24px;
    }
    th, td {
      border: 1px solid black;
      padding: 8px;
      text-align: left;
    }
    th {
      background: #f0f0f0;
    }
    .text-right {
      text-align: right;
    }
    .col-dr {
      text-align: right;
      color: ${ACCOUNTING_COLORS.dr.css};
    }
    .col-cr {
      text-align: right;
      color: ${ACCOUNTING_COLORS.cr.css};
    }
    .col-amount {
      color: ${ACCOUNTING_COLORS.amount.css};
    }
    tfoot tr {
      background: #f0f0f0;
      font-weight: bold;
    }
    .amount-words {
      margin-bottom: 32px;
      padding: 12px;
      border: 1px solid black;
    }
    .amount-words p {
      margin: 4px 0;
    }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 32px;
      margin-top: 64px;
      padding-top: 16px;
    }
    .signature {
      text-align: center;
      border-top: 1px solid black;
      padding-top: 8px;
    }
    .signature p {
      font-weight: bold;
      margin: 0;
    }
    .footer {
      margin-top: 48px;
      text-align: center;
      font-size: 12px;
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Your Company Name</h1>
    <p>123 Business Street, City, Country</p>
    <p>Phone: +92-XXX-XXXXXXX | Email: info@company.com</p>
  </div>

  <div class="voucher-title">
    <h2>${getVoucherTypeName(voucher.type).toUpperCase()}</h2>
  </div>

  <div class="voucher-info">
    <div>
      <p><strong>Voucher No:</strong> ${voucher.voucherNumber}</p>
      <p><strong>Account:</strong> ${getAccountLabel(voucher.cashBankAccount) || voucher.cashBankAccount}</p>
      ${voucher.chequeNumber ? `<p><strong>Cheque No:</strong> ${voucher.chequeNumber}</p>` : ''}
    </div>
    <div class="right">
      <p><strong>Date:</strong> ${formatDate(voucher.date)}</p>
      <p><strong>Status:</strong> ${voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}</p>
      ${voucher.chequeDate ? `<p><strong>Cheque Date:</strong> ${formatDate(voucher.chequeDate)}</p>` : ''}
    </div>
  </div>

  ${voucher.narration ? `
  <div class="narration">
    <p><strong>Narration:</strong> ${voucher.narration}</p>
  </div>
  ` : ''}

  <table>
    <thead>
      <tr>
        <th>S.No</th>
        <th>Account</th>
        <th>Description</th>
        <th class="col-dr">Debit (Rs)</th>
        <th class="col-cr">Credit (Rs)</th>
      </tr>
    </thead>
    <tbody>
      ${voucher.entries.map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${getAccountLabel(entry.account, entry.Account) || entry.account}</td>
        <td>${entry.description || "-"}</td>
        <td class="col-dr">${entry.debit > 0 ? entry.debit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "-"}</td>
        <td class="col-cr">${entry.credit > 0 ? entry.credit.toLocaleString("en-PK", { minimumFractionDigits: 2 }) : "-"}</td>
      </tr>
      `).join('')}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="text-right"><strong>Total:</strong></td>
        <td class="col-dr"><strong>${voucher.totalDebit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</strong></td>
        <td class="col-cr"><strong>${voucher.totalCredit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}</strong></td>
      </tr>
    </tfoot>
  </table>

  <div class="amount-words">
    <p><strong class="col-amount">Amount in Words:</strong></p>
    <p style="font-style: italic;">${numberToWords(voucher.totalDebit)} Rupees Only</p>
  </div>

  <div class="signatures">
    <div class="signature">
      <p>Prepared By</p>
    </div>
    <div class="signature">
      <p>Checked By</p>
    </div>
    <div class="signature">
      <p>Approved By</p>
    </div>
  </div>

  <div class="footer">
    <p>This is a computer generated document. Printed on ${new Date().toLocaleString()}</p>
  </div>

  <script>
    window.onload = function() {
      window.print();
      window.onafterprint = function() {
        window.close();
      };
    };
  </script>
</body>
</html>
    `;

    printWindow.document.write(printContent);
    printWindow.document.close();

    void apiClient.logActivity({
      action: "Printed Voucher",
      actionType: "print",
      module: "Vouchers",
      description: `Printed voucher ${voucher.voucherNumber || voucher.id}`,
      entityType: "voucher",
      entityId: voucher.id,
      entityLabel: voucher.voucherNumber || voucher.id,
      details: { type: voucher.type },
    });
  };

  // Handle Search button
  const handleSearch = () => {
    const trimmedQuery = searchQuery.trim();
    onSearch({
      type: typeFilter !== "all" ? typeFilter : undefined,
      mode:
        isModeFilterEnabled && modeFilter !== "all" ? modeFilter : undefined,
      category: categoryFilter !== "default" ? categoryFilter : undefined,
      is_post_dated: postDatedFilter !== "default" ? postDatedFilter : undefined,
      from_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
      to_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
      maingroup_id: mainGroupFilter !== "_all" ? mainGroupFilter : undefined,
      subgroup_id: subGroupFilter !== "_all" ? subGroupFilter : undefined,
      account_id: accountFilter !== "_all" ? accountFilter : undefined,
      search_by: trimmedQuery ? searchBy : undefined,
      search: trimmedQuery || undefined,
    });
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setTypeFilter("all");
    setModeFilter("all");
    setCategoryFilter("default");
    setPostDatedFilter("default");
    setFromDate(undefined);
    setToDate(undefined);
    setMainGroupFilter("_all");
    setSubGroupFilter("_all");
    setAccountFilter("_all");
    setSearchBy("voucher-no");
    setSearchQuery("");

    onSearch({});
    setCurrentPage(1);
    setItemsPerPage(50);
  };

  // Skip local filtering, use vouchers directly as they will come filtered from server
  const filteredVouchers = vouchers;
  const getVoucherMode = (voucher: Voucher): "cash" | "online" | "-" => {
    if (voucher.type !== "payment" && voucher.type !== "receipt") return "-";
    if (voucher.mode === "cash" || voucher.mode === "online") return voucher.mode;
    if (!voucher.cashBankAccount) return "-";
    const account = rawAccounts.find((acc) => acc.id === voucher.cashBankAccount);
    if (account) return getAccountCashBankMode(account);
    return "cash";
  };
  const totalPages = Math.ceil(filteredVouchers.length / itemsPerPage) || 1;
  const paginatedVouchers = filteredVouchers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVouchers(paginatedVouchers.map((v) => v.id));
    } else {
      setSelectedVouchers([]);
    }
  };

  const handleSelectVoucher = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedVouchers([...selectedVouchers, id]);
    } else {
      setSelectedVouchers(selectedVouchers.filter((v) => v !== id));
    }
  };

  const isInternationalVoucher = (
    voucher: Voucher,
    accountIds: Set<string> = internationalAccountIds,
  ) => {
    if (voucher.type !== "payment" && voucher.type !== "journal") return false;
    const rate = Number(voucher.conversionRate);
    if (Number.isFinite(rate) && rate > 0) return true;
    const lines = voucher.entries || voucher.VoucherEntry || [];
    return lines.some((entry) => {
      const accountId = String(entry.account || entry.accountId || "");
      return accountId.length > 0 && accountIds.has(accountId);
    });
  };

  const handleEdit = async (voucher: Voucher) => {
    if (voucher.status === "posted") {
      toast({
        title: "Cannot Edit",
        description: "Approved vouchers cannot be edited.",
        variant: "destructive",
      });
      return;
    }

    let intlIds = internationalAccountIds;
    if (intlIds.size === 0) {
      try {
        const response = (await apiClient.getInternationalSupplierAccounts()) as any;
        const rows = Array.isArray(response?.data) ? response.data : [];
        intlIds = new Set(
          rows
            .map((row: any) => String(row.id || ""))
            .filter((id: string) => id.length > 0),
        );
        setInternationalAccountIds(intlIds);
      } catch {
        // keep empty set; rate-based detection still works
      }
    }

    setEditingVoucher(voucher);
    setEditNarration(voucher.narration);
    // Convert date to YYYY-MM-DD format for date input
    let editDateValue = voucher.date;
    if (voucher.date) {
      try {
        // Handle DD/MM/YYYY format
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(voucher.date)) {
          const [day, month, year] = voucher.date.split('/');
          editDateValue = `${year}-${month}-${day}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(voucher.date)) {
          editDateValue = voucher.date;
        } else {
          const date = new Date(voucher.date);
          if (!isNaN(date.getTime())) {
            editDateValue = date.toISOString().split('T')[0];
          }
        }
      } catch {
        // Keep original if conversion fails
      }
    }

    setEditNarration(voucher.narration || "");
    setEditDate(editDateValue);
    
    // Set new fields
    let checkClearDateValue = "";
    if (voucher.checkClearDate) {
      try {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(voucher.checkClearDate)) {
          const [day, month, year] = voucher.checkClearDate.split('/');
          checkClearDateValue = `${year}-${month}-${day}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(voucher.checkClearDate)) {
          checkClearDateValue = voucher.checkClearDate;
        } else {
          const date = new Date(voucher.checkClearDate);
          if (!isNaN(date.getTime())) {
            checkClearDateValue = date.toISOString().split('T')[0];
          }
        }
      } catch { }
    }
    setEditCheckClearDate(checkClearDateValue);
    setEditChequeNumber(voucher.chequeNumber || "");
    
    let editChequeDateValue = "";
    if (voucher.chequeDate) {
      try {
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(voucher.chequeDate)) {
          const [day, month, year] = voucher.chequeDate.split('/');
          editChequeDateValue = `${year}-${month}-${day}`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(voucher.chequeDate)) {
          editChequeDateValue = voucher.chequeDate;
        } else {
          const date = new Date(voucher.chequeDate);
          if (!isNaN(date.getTime())) {
            editChequeDateValue = date.toISOString().split('T')[0];
          }
        }
      } catch { }
    }
    setEditChequeDate(editChequeDateValue);
    setEditIsCleared(voucher.isCleared !== undefined && voucher.isCleared !== null ? Number(voucher.isCleared) : null);

    const isIntl = isInternationalVoucher(voucher, intlIds);
    const parsedRate = Number(voucher.conversionRate);
    const rate =
      Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1;
    setEditIsInternational(isIntl);
    setEditExchangeRate(String(rate));

    // Ensure all entries have the expected fields for the edit form.
    // International edit form works in FC + LC; stored amounts are LC.
    const mappedEntries = (voucher.entries || voucher.VoucherEntry || []).map(entry => {
      const lcDebit = Number(entry.debit || 0);
      const lcCredit = Number(entry.credit || 0);
      const fcDebit = isIntl ? Number((lcDebit / rate).toFixed(6)) : lcDebit;
      const fcCredit = isIntl ? Number((lcCredit / rate).toFixed(6)) : lcCredit;
      return {
        id: entry.id || `${Date.now()}-${Math.random()}`,
        account: entry.account || entry.accountId || "", // Consistent mapping for SearchableSelect
        accountName: entry.accountName || "",
        description: entry.description || "",
        debit: fcDebit,
        credit: fcCredit,
        debitLc: isIntl ? lcDebit : undefined,
        creditLc: isIntl ? lcCredit : undefined,
        sortOrder: entry.sortOrder || 0
      };
    });

    // Fallback: if voucher has no entries, add an empty row to prevent empty UI
    const finalEntriesToEdit = mappedEntries.length > 0
      ? mappedEntries
      : [{ id: Date.now().toString(), account: "", description: "", debit: 0, credit: 0, debitLc: "", creditLc: "" }];

    setEditEntries(finalEntriesToEdit as any);
  };

  const handleSaveEdit = () => {
    if (!editingVoucher) return;

    // Validate entries
    if (editEntries.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one entry",
        variant: "destructive",
      });
      return;
    }

    if (editEntries.some(e => !e.account)) {
      toast({
        title: "Validation Error",
        description: "Please select account for all entries",
        variant: "destructive",
      });
      return;
    }

    const parsedExchangeRate = Number(editExchangeRate);
    if (
      editIsInternational &&
      (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0)
    ) {
      toast({
        title: "Validation Error",
        description: "Please enter a valid exchange rate",
        variant: "destructive",
      });
      return;
    }
    const exchangeRateValue =
      editIsInternational && Number.isFinite(parsedExchangeRate) && parsedExchangeRate > 0
        ? parsedExchangeRate
        : 1;

    const totalDebitFc = editEntries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
    const totalCreditFc = editEntries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
    const totalDebit = editIsInternational
      ? editEntries.reduce(
          (sum, e) =>
            sum +
            (Number((e as any).debitLc) ||
              (Number(e.debit) || 0) * exchangeRateValue),
          0,
        )
      : totalDebitFc;
    const totalCredit = editIsInternational
      ? editEntries.reduce(
          (sum, e) =>
            sum +
            (Number((e as any).creditLc) ||
              (Number(e.credit) || 0) * exchangeRateValue),
          0,
        )
      : totalCreditFc;

    if (totalDebitFc === 0 && totalCreditFc === 0) {
      toast({
        title: "Validation Error",
        description: "Please enter at least one amount",
        variant: "destructive",
      });
      return;
    }

    if (Math.abs(totalDebitFc - totalCreditFc) > 0.0001) {
      toast({
        title: "Validation Error",
        description: `Total Debit (${formatAmount(totalDebitFc)}) must equal Total Credit (${formatAmount(totalCreditFc)})`,
        variant: "destructive",
      });
      return;
    }

    // Ensure date is in ISO format
    let finalDate = editDate;
    if (editDate && /^\d{4}-\d{2}-\d{2}$/.test(editDate)) {
      finalDate = editDate;
    } else if (editDate) {
      try {
        const date = new Date(editDate);
        if (!isNaN(date.getTime())) {
          finalDate = date.toISOString().split('T')[0];
        }
      } catch {
        // Keep original if conversion fails
      }
    }

    const savedEntries = editEntries.map((entry) => {
      const debitFc = Number(entry.debit) || 0;
      const creditFc = Number(entry.credit) || 0;
      const debitLcRaw = (entry as any).debitLc;
      const creditLcRaw = (entry as any).creditLc;
      const debitLc = Number(debitLcRaw);
      const creditLc = Number(creditLcRaw);
      return {
        ...entry,
        debit: editIsInternational
          ? debitLcRaw !== undefined && debitLcRaw !== ""
            ? Number.isFinite(debitLc)
              ? debitLc
              : 0
            : debitFc * exchangeRateValue
          : debitFc,
        credit: editIsInternational
          ? creditLcRaw !== undefined && creditLcRaw !== ""
            ? Number.isFinite(creditLc)
              ? creditLc
              : 0
            : creditFc * exchangeRateValue
          : creditFc,
      };
    });

    onUpdateVoucher({
      ...editingVoucher,
      narration: editNarration,
      date: finalDate,
      checkClearDate: editCheckClearDate || undefined,
      chequeNumber: editChequeNumber || undefined,
      chequeDate: editChequeDate || undefined,
      isCleared: editIsCleared !== null ? editIsCleared : undefined,
      conversionRate: editIsInternational ? exchangeRateValue : editingVoucher.conversionRate,
      entries: savedEntries,
      totalDebit,
      totalCredit,
    });

    setEditingVoucher(null);
    toast({ title: "Success", description: "Voucher updated successfully" });
  };

  const handleOpenClearDialog = (voucher: Voucher) => {
    setVoucherToClear(voucher);
    setClearanceDate(new Date().toISOString().split('T')[0]);
    setIsClearDialogOpen(true);
  };

  const handleConfirmClearance = async () => {
    if (!voucherToClear) return;

    try {
      // Use the existing handleUpdateVoucher logic via the onUpdateVoucher callback
      onUpdateVoucher({
        ...voucherToClear,
        isCleared: 1, // 1 = Cleared (Recieve)
        checkClearDate: clearanceDate,
      });

      setIsClearDialogOpen(false);
      setVoucherToClear(null);
      toast({ title: "Success", description: "Voucher marked as cleared (Recieve)" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to clear voucher", variant: "destructive" });
    }
  };

  const handleDelete = async (voucher: Voucher) => {
    // Allow deletion of posted vouchers - backend will reverse account balances
    if (window.confirm(`Are you sure you want to delete voucher ${voucher.voucherNumber}? This will reverse all account balance changes.`)) {
      try {
        await onDeleteVoucher(voucher.id);
        toast({
          title: "Success",
          description: `Voucher ${voucher.voucherNumber} deleted successfully. Account balances have been reversed.`
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to delete voucher",
          variant: "destructive",
        });
      }
    }
  };

  const handleApprove = async (voucher: Voucher) => {
    try {
      await onUpdateVoucher({ ...voucher, status: "posted" });
      // Success toast is already shown in handleUpdateVoucher
    } catch (error: any) {
      // Error toast is already shown in handleUpdateVoucher
    }
  };

  const handleChangeToPending = async (voucher: Voucher) => {
    try {
      await onUpdateVoucher({ ...voucher, status: "draft" });
      // Success toast is already shown in handleUpdateVoucher
    } catch (error: any) {
      // Error toast is already shown in handleUpdateVoucher
    }
  };

  const addDebitEntry = () => {
    setEditEntries([
      ...editEntries,
      { id: Date.now().toString(), account: "", description: "", debit: 0, credit: 0, debitLc: "", creditLc: "" } as any,
    ]);
  };

  const addCreditEntry = () => {
    setEditEntries([
      ...editEntries,
      { id: Date.now().toString(), account: "", description: "", debit: 0, credit: 0, debitLc: "", creditLc: "" } as any,
    ]);
  };

  const updateEntry = (id: string, field: string, value: string | number) => {
    setEditEntries(
      editEntries.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const handleEditExchangeRateChange = (raw: string) => {
    const normalized = normalizeDecimalTyping(raw);
    if (normalized !== "" && !isExchangeRateTypingValue(normalized)) return;
    setEditExchangeRate(normalized);
    const rate = parseExchangeRate(normalized);
    if (!editIsInternational || rate <= 0) return;
    setEditEntries((prev) =>
      prev.map((e) => ({
        ...e,
        debitLc: lcFromFc(e.debit, rate),
        creditLc: lcFromFc(e.credit, rate),
      })) as any,
    );
  };

  const handleEditFcDebitChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    const rate = editExchangeRateValue;
    setEditEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              debit: raw === "" ? 0 : raw,
              debitLc: editIsInternational ? lcFromFc(raw, rate) : (e as any).debitLc,
            }
          : e,
      ) as any,
    );
  };

  const handleEditLcDebitChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    const rate = editExchangeRateValue;
    setEditEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              debitLc: raw,
              debit: raw === "" ? 0 : Number(fcFromLc(raw, rate)) || 0,
            }
          : e,
      ) as any,
    );
  };

  const handleEditFcCreditChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    const rate = editExchangeRateValue;
    setEditEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              credit: raw === "" ? 0 : raw,
              creditLc: editIsInternational ? lcFromFc(raw, rate) : (e as any).creditLc,
            }
          : e,
      ) as any,
    );
  };

  const handleEditLcCreditChange = (id: string, raw: string) => {
    if (raw !== "" && !isAmountTypingValue(raw)) return;
    const rate = editExchangeRateValue;
    setEditEntries((prev) =>
      prev.map((e) =>
        e.id === id
          ? {
              ...e,
              creditLc: raw,
              credit: raw === "" ? 0 : Number(fcFromLc(raw, rate)) || 0,
            }
          : e,
      ) as any,
    );
  };

  const removeEntry = (id: string) => {
    setEditEntries(editEntries.filter((e) => e.id !== id));
  };

  const getVoucherTypeLabel = (type: string, voucherNumber?: string) => {
    if (type === "receipt" && voucherNumber) {
      const upper = voucherNumber.toUpperCase();
      if (upper.startsWith("RVC")) return "RVC";
      if (upper.startsWith("RVCH")) return "RVCH";
      if (upper.startsWith("RVB")) return "RVB";
      if (upper.startsWith("RV")) return "RV";
    }
    switch (type) {
      case "payment": return "PV";
      case "receipt": return "RV";
      case "journal": return "JV";
      case "contra": return "CV";
      default: return type;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "posted":
        return (
          <span className="inline-flex items-center gap-1 text-green-600">
            <CheckCircle className="h-4 w-4" />
            Approved
          </span>
        );
      case "draft":
        return (
          <span className="inline-flex items-center gap-1 text-amber-600">
            <Clock className="h-4 w-4" />
            Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {status}
          </span>
        );
    }
  };

  const totalDebit = editEntries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = editEntries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const parsedEditExchangeRate = Number(editExchangeRate);
  const editExchangeRateValue =
    Number.isFinite(parsedEditExchangeRate) && parsedEditExchangeRate > 0
      ? parsedEditExchangeRate
      : 0;
  const totalDebitLc = editEntries.reduce(
    (sum, e) =>
      sum +
      (Number((e as any).debitLc) ||
        (Number(e.debit) || 0) * editExchangeRateValue),
    0,
  );
  const totalCreditLc = editEntries.reduce(
    (sum, e) =>
      sum +
      (Number((e as any).creditLc) ||
        (Number(e.credit) || 0) * editExchangeRateValue),
    0,
  );

  // Helper function to format date safely
  const formatDisplayDate = (dateString: string): string => {
    if (!dateString) return "-";
    try {
      // Handle ISO format (YYYY-MM-DD)
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
      }
      // Handle DD/MM/YYYY format
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) {
        return dateString;
      }
      // Try parsing as date
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString("en-GB");
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  // Helper function to format amount with proper decimals
  const formatAmount = (amount: number): string => {
    return amount.toLocaleString("en-PK", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-4">
        {/* First row of filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="payment">Payment</SelectItem>
                <SelectItem value="receipt">Receipt</SelectItem>
                <SelectItem value="journal">Journal</SelectItem>
                <SelectItem value="contra">Contra</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Mode</Label>
            <Select
              value={modeFilter}
              onValueChange={setModeFilter}
              disabled={!isModeFilterEnabled}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    isModeFilterEnabled
                      ? "All"
                      : "Select Payment/Receipt type first"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Category</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
                <SelectItem value="income">Income</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Post Dated</Label>
            <Select value={postDatedFilter} onValueChange={setPostDatedFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="yes">Yes</SelectItem>
                <SelectItem value="no">No</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !fromDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {fromDate ? format(fromDate, "dd/MM/yyyy") : <span>DD/MM/YYYY</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={fromDate}
                  onSelect={setFromDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal h-9",
                    !toDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {toDate ? format(toDate, "dd/MM/yyyy") : <span>DD/MM/YYYY</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={toDate}
                  onSelect={setToDate}
                  initialFocus
                  className="p-3 pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Second row of filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Main Group</Label>
            <SearchableSelect
              options={[
                { value: "_all", label: "All" },
                ...filterMainGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
                })),
              ]}
              value={mainGroupFilter}
              onValueChange={handleMainGroupFilterChange}
              placeholder="Search main group..."
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Sub Group</Label>
            <SearchableSelect
              options={[
                { value: "_all", label: "All" },
                ...visibleSubGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
                })),
              ]}
              value={subGroupFilter}
              onValueChange={handleSubGroupFilterChange}
              placeholder="Search sub group..."
              className="h-9"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Account</Label>
            <SearchableSelect
              options={[
                { value: "_all", label: "All" },
                ...visibleAccounts.map((acc) => ({
                  value: acc.id,
                  label: acc.name,
                })),
              ]}
              value={accountFilter}
              onValueChange={handleAccountFilterChange}
              placeholder="Search account..."
              className="h-9"
            />
          </div>
        </div>

        {/* Search row */}
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Search By</Label>
            <Select value={searchBy} onValueChange={setSearchBy}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="voucher-no">Voucher No</SelectItem>
                <SelectItem value="voucher-name">Voucher Name</SelectItem>
                <SelectItem value="amount">Amount</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <Button
            className="gap-2"
            onClick={handleSearch}
          >
            <Search className="h-4 w-4" />
            Search
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground hover:text-primary"
            onClick={clearFilters}
          >
            Clear Filters
          </Button>
        </div>
      </div>

      {/* Vouchers Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-primary/10">
                <ListNumberHeader />
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      paginatedVouchers.length > 0 &&
                      paginatedVouchers.every((v) => selectedVouchers.includes(v.id))
                    }
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead className="font-semibold text-primary">Voucher no</TableHead>
                <TableHead className="font-semibold text-primary">Voucher Name</TableHead>
                <TableHead className="font-semibold text-primary">Mode</TableHead>
                <TableHead className="font-semibold text-primary">Date</TableHead>
                <TableHead className="font-semibold text-primary">Clear Date</TableHead>
                <TableHead className="font-semibold text-primary">Is Cleared</TableHead>
                <TableHead className={`font-semibold ${amountHeaderClass}`}>Amount</TableHead>
                <TableHead className="font-semibold text-primary">Status</TableHead>
                <TableHead className="font-semibold text-primary">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedVouchers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    No vouchers found
                  </TableCell>
                </TableRow>
              ) : (
                paginatedVouchers.map((voucher, index) => (
                  <TableRow key={voucher.id} className="hover:bg-muted/50">
                    <ListNumberCell
                      index={index}
                      page={currentPage}
                      pageSize={itemsPerPage}
                      total={filteredVouchers.length}
                    />
                    <TableCell>
                      <Checkbox
                        checked={selectedVouchers.includes(voucher.id)}
                        onCheckedChange={(checked) =>
                          handleSelectVoucher(voucher.id, checked as boolean)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-primary font-medium">
                      <div>
                        {voucher.voucherNumber}
                        {voucher.isCleared === 0 && (
                          <div 
                            className="text-[10px] text-blue-600 hover:underline cursor-pointer mt-1 font-normal"
                            onClick={() => handleOpenClearDialog(voucher)}
                          >
                            Update
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-primary">{voucher.narration || "-"}</TableCell>
                    <TableCell className="uppercase">{getVoucherMode(voucher)}</TableCell>
                    <TableCell>{formatDisplayDate(voucher.date)}</TableCell>
                    <TableCell>{formatDisplayDate(voucher.checkClearDate || "")}</TableCell>
                    <TableCell>
                      {voucher.isCleared === 1 ? "Cleared" : voucher.isCleared === 2 ? "Returned" : voucher.isCleared === 0 ? "Pending" : "-"}
                    </TableCell>
                    <TableCell className={`font-medium ${amountValueClass()}`}>{formatAmount(voucher.totalDebit)}</TableCell>
                    <TableCell>{getStatusBadge(voucher.status)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ActionButtonTooltip label="View" variant="view">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-primary"
                            onClick={() => fetchVoucherDetails(voucher.id)}
                          >
                            <Eye className="h-4 w-4" />
                            View
                          </Button>
                        </ActionButtonTooltip>
                        {canEdit && (
                          <ActionButtonTooltip label="Edit" variant="edit">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-primary"
                              onClick={() => handleEdit(voucher)}
                              disabled={voucher.status !== "draft"}
                            >
                              <Edit className="h-4 w-4" />
                              Edit
                            </Button>
                          </ActionButtonTooltip>
                        )}
                        {canDelete && (
                          <ActionButtonTooltip label="Delete Voucher" variant="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                              onClick={() => handleDelete(voucher)}
                              disabled={voucher.status !== "draft"}
                            >
                              <Trash className="h-4 w-4" />
                            </Button>
                          </ActionButtonTooltip>
                        )}
                        {canMenuMore && (
                          <DropdownMenu>
                            <ActionButtonTooltip label="More Actions" variant="more">
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </ActionButtonTooltip>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => fetchVoucherDetails(voucher.id)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePrint(voucher)}>
                                <Printer className="h-4 w-4 mr-2" />
                                Print
                              </DropdownMenuItem>
                              {canApprove && voucher.status === "draft" && (
                                <DropdownMenuItem onClick={() => handleApprove(voucher)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {canStatus && voucher.status === "posted" && (
                                <DropdownMenuItem onClick={() => handleChangeToPending(voucher)}>
                                  <Clock className="h-4 w-4 mr-2" />
                                  Change to Pending
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Simple Pagination */}
        <div className="flex flex-col gap-3 px-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-2">
            <p className="text-sm text-muted-foreground">
              Showing {filteredVouchers.length === 0 ? 0 : ((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredVouchers.length)} of {filteredVouchers.length} entries
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={String(itemsPerPage)}
              onValueChange={(value) => {
                setItemsPerPage(Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOUCHER_PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="text-sm">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || filteredVouchers.length === 0}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingVoucher} onOpenChange={() => setEditingVoucher(null)}>
        <DialogContent className={`${editIsInternational ? "max-w-6xl" : "max-w-4xl"} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-primary" />
              Editing Voucher {editingVoucher?.voucherNumber}
              <span className="text-sm text-muted-foreground ml-2">
                Voucher Id: {editingVoucher?.voucherNumber}
              </span>
              {editIsInternational ? (
                <span className="text-xs font-normal text-primary ml-2">
                  (International Supplier)
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Voucher Type Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded">
                  <span className="text-primary font-bold">
                    {editingVoucher &&
                      getVoucherTypeLabel(
                        editingVoucher.type,
                        editingVoucher.voucherNumber,
                      )}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-primary">
                    {editingVoucher?.type.charAt(0).toUpperCase() + (editingVoucher?.type.slice(1) || "")} Voucher
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {editingVoucher &&
                      getVoucherTypeLabel(
                        editingVoucher.type,
                        editingVoucher.voucherNumber,
                      )}
                    {editIsInternational ? " · International Supplier" : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" size="sm" onClick={onAddSubgroup}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add New Subgroup
                </Button>
                <Button variant="outline" size="sm" onClick={onAddAccount}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add New Account
                </Button>
              </div>
            </div>

            {/* Name and Date */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <Input
                  value={editNarration}
                  onChange={(e) => setEditNarration(e.target.value)}
                  placeholder="Enter name"
                />
              </div>
              {editIsInternational ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Exchange Rate</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={editExchangeRate}
                    onChange={(e) => handleEditExchangeRateChange(e.target.value)}
                    placeholder="Exchange rate"
                  />
                </div>
              ) : null}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Check Clear Date</Label>
                <Input
                  type="date"
                  value={editCheckClearDate}
                  onChange={(e) => setEditCheckClearDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cheque Number</Label>
                <Input
                  placeholder="Cheque Number"
                  value={editChequeNumber}
                  onChange={(e) => setEditChequeNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Cheque Date</Label>
                <Input
                  type="date"
                  value={editChequeDate}
                  onChange={(e) => setEditChequeDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Is Cleared Status</Label>
                <Select 
                  value={editIsCleared === null ? "none" : String(editIsCleared)} 
                  onValueChange={(val) => setEditIsCleared(val === "none" ? null : parseInt(val))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (-)</SelectItem>
                    <SelectItem value="0">Pending (0)</SelectItem>
                    <SelectItem value="1">Cleared (1)</SelectItem>
                    <SelectItem value="2">Returned (2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entries Table */}
            <div className="space-y-4">
              <div className="grid grid-cols-12 gap-2 text-sm font-medium">
                <div className={editIsInternational ? "col-span-2" : "col-span-3"}>Account Dr/ Cr</div>
                <div className={editIsInternational ? "col-span-2" : "col-span-4"}>Description</div>
                <div className={`col-span-2 ${editIsInternational ? fcHeaderClass : drHeaderClass}`}>{editIsInternational ? "FC Dr" : "Dr"}</div>
                {editIsInternational ? <div className={`col-span-2 ${lcHeaderClass}`}>LC Dr</div> : null}
                <div className={`col-span-2 ${editIsInternational ? fcHeaderClass : crHeaderClass}`}>{editIsInternational ? "FC Cr" : "Cr"}</div>
                {editIsInternational ? <div className={`col-span-1 ${lcHeaderClass}`}>LC Cr</div> : null}
                <div className="col-span-1"></div>
              </div>

              {editEntries.map((entry) => (
                <div key={entry.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className={editIsInternational ? "col-span-2" : "col-span-3"}>
                    <SearchableSelect
                      options={accounts}
                      value={entry.account}
                      onValueChange={(value) => updateEntry(entry.id, "account", value)}
                      placeholder="Select account"
                    />
                  </div>
                  <div className={editIsInternational ? "col-span-2" : "col-span-4"}>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Description</Label>
                      <Input
                        value={entry.description}
                        onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                        placeholder="Description"
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <Label className={`text-xs ${editIsInternational ? fcHeaderClass : "text-muted-foreground"}`}>
                        {editIsInternational ? "fc amount" : "amount"}
                      </Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={entry.debit || ""}
                        onChange={(e) =>
                          editIsInternational
                            ? handleEditFcDebitChange(entry.id, e.target.value)
                            : updateEntry(entry.id, "debit", Number(e.target.value))
                        }
                        placeholder="0"
                        className={editIsInternational ? fcValueClass() : undefined}
                      />
                    </div>
                  </div>
                  {editIsInternational ? (
                    <div className="col-span-2">
                      <div className="space-y-1">
                        <Label className={`text-xs ${lcHeaderClass}`}>lc amount</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={(entry as any).debitLc ?? ""}
                          onChange={(e) => handleEditLcDebitChange(entry.id, e.target.value)}
                          placeholder="0"
                          className={lcValueClass()}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <Label className={`text-xs ${editIsInternational ? fcHeaderClass : "text-muted-foreground"}`}>
                        {editIsInternational ? "fc amount" : "amount"}
                      </Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={entry.credit || ""}
                        onChange={(e) =>
                          editIsInternational
                            ? handleEditFcCreditChange(entry.id, e.target.value)
                            : updateEntry(entry.id, "credit", Number(e.target.value))
                        }
                        placeholder="0"
                        className={editIsInternational ? fcValueClass() : undefined}
                      />
                    </div>
                  </div>
                  {editIsInternational ? (
                    <div className="col-span-1">
                      <div className="space-y-1">
                        <Label className={`text-xs ${lcHeaderClass}`}>lc</Label>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={(entry as any).creditLc ?? ""}
                          onChange={(e) => handleEditLcCreditChange(entry.id, e.target.value)}
                          placeholder="0"
                          className={lcValueClass()}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="col-span-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => removeEntry(entry.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Totals */}
              {editIsInternational ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <Label className={`text-sm font-medium ${fcHeaderClass}`}>FC Totals</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className={`text-xs ${fcHeaderClass}`}>FC Dr</Label>
                        <Input value={formatAmount(totalDebit)} readOnly className={`bg-muted font-medium ${fcValueClass()}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className={`text-xs ${fcHeaderClass}`}>FC Cr</Label>
                        <Input value={formatAmount(totalCredit)} readOnly className={`bg-muted font-medium ${fcValueClass()}`} />
                      </div>
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3 space-y-2">
                    <Label className={`text-sm font-medium ${lcHeaderClass}`}>LC Totals</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className={`text-xs ${lcHeaderClass}`}>LC Dr</Label>
                        <Input value={formatAmount(totalDebitLc)} readOnly className={`bg-muted font-medium ${lcValueClass()}`} />
                      </div>
                      <div className="space-y-1">
                        <Label className={`text-xs ${lcHeaderClass}`}>LC Cr</Label>
                        <Input value={formatAmount(totalCreditLc)} readOnly className={`bg-muted font-medium ${lcValueClass()}`} />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-12 gap-2 items-center pt-4">
                  <div className={`col-span-7 text-right font-semibold ${amountHeaderClass}`}>Total Amount</div>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <Label className={`text-xs ${drHeaderClass}`}>Total Debit</Label>
                      <Input
                        value={formatAmount(totalDebit)}
                        readOnly
                        className={`bg-muted font-medium ${drValueClass(1, true)}`}
                      />
                    </div>
                  </div>
                  <div className="col-span-2">
                    <div className="space-y-1">
                      <Label className={`text-xs ${crHeaderClass}`}>Total Credit</Label>
                      <Input
                        value={formatAmount(totalCredit)}
                        readOnly
                        className={`bg-muted font-medium ${crValueClass(1, true)}`}
                      />
                    </div>
                  </div>
                  <div className="col-span-1"></div>
                </div>
              )}
              {totalDebit !== totalCredit && (
                <div className="text-sm text-destructive text-center pt-2">
                  ⚠️ Total Debit ({formatAmount(totalDebit)}) must equal Total Credit ({formatAmount(totalCredit)})
                </div>
              )}

              {/* Add Buttons */}
              <div className="flex justify-center gap-4 pt-4">
                <Button onClick={addDebitEntry} className="bg-primary hover:bg-primary/90">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Dr
                </Button>
                <Button onClick={addCreditEntry} className="bg-destructive hover:bg-destructive/90">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Cr
                </Button>
              </div>

              {/* Save Button */}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleSaveEdit}>
                  💾 Save
                </Button>
                {canMenuMore && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>Save & Print</DropdownMenuItem>
                      <DropdownMenuItem>Save & New</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Cancel */}
            <Button
              variant="ghost"
              className="text-primary"
              onClick={() => setEditingVoucher(null)}
            >
              <Trash className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Voucher Dialog (read-only) */}
      <Dialog open={!!viewingVoucher} onOpenChange={() => setViewingVoucher(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-primary" />
              View Voucher {viewingVoucher?.voucherNumber}
            </DialogTitle>
          </DialogHeader>
          {viewingVoucher && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-1">
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {viewingVoucher.type.charAt(0).toUpperCase() + viewingVoucher.type.slice(1)} Voucher
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDisplayDate(viewingVoucher.date)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{getStatusBadge(viewingVoucher.status)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-muted-foreground">Cash/Bank Account</p>
                  <p className="font-medium">{getAccountLabel(viewingVoucher.cashBankAccount)}</p>
                </div>
                {viewingVoucher.chequeNumber && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Cheque No</p>
                    <p className="font-medium">{viewingVoucher.chequeNumber}</p>
                  </div>
                )}
                {viewingVoucher.chequeDate && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Cheque Date</p>
                    <p className="font-medium">{formatDisplayDate(viewingVoucher.chequeDate)}</p>
                  </div>
                )}
                {viewingVoucher.checkClearDate && (
                  <div className="space-y-1">
                    <p className="text-muted-foreground">Clear Date</p>
                    <p className="font-medium">{formatDisplayDate(viewingVoucher.checkClearDate)}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-muted-foreground">Is Cleared Status</p>
                  <p className="font-medium">
                    {viewingVoucher.isCleared === 1 ? "Cleared" : viewingVoucher.isCleared === 2 ? "Returned" : viewingVoucher.isCleared === 0 ? "Pending" : "-"} 
                    {viewingVoucher.isCleared !== null && viewingVoucher.isCleared !== undefined ? ` (${viewingVoucher.isCleared})` : ""}
                  </p>
                </div>
              </div>
              {viewingVoucher.narration && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-sm">Narration</p>
                  <p className="text-sm bg-muted/50 p-3 rounded-md">{viewingVoucher.narration}</p>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-muted-foreground text-sm font-medium">Entries</p>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <ListNumberHeader />
                      <TableHead>Account</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className={`text-right ${drHeaderClass}`}>Debit (Rs)</TableHead>
                      <TableHead className={`text-right ${crHeaderClass}`}>Credit (Rs)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(viewingVoucher.entries || viewingVoucher.VoucherEntry || [])?.map((entry, idx) => (
                      <TableRow key={entry.id}>
                        <ListNumberCell index={idx} total={(viewingVoucher.entries || viewingVoucher.VoucherEntry || []).length} />
                        <TableCell>{getAccountLabel(entry.account, entry.Account)}</TableCell>
                        <TableCell>{entry.description || "-"}</TableCell>
                        <TableCell className={`text-right ${drValueClass(entry.debit)}`}>
                          {entry.debit > 0 ? formatAmount(entry.debit) : "-"}
                        </TableCell>
                        <TableCell className={`text-right ${crValueClass(entry.credit)}`}>
                          {entry.credit > 0 ? formatAmount(entry.credit) : "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-semibold">
                      <TableCell colSpan={3} className="text-right">Total</TableCell>
                      <TableCell className={`text-right ${drValueClass(1, true)}`}>{formatAmount(viewingVoucher.totalDebit)}</TableCell>
                      <TableCell className={`text-right ${crValueClass(1, true)}`}>{formatAmount(viewingVoucher.totalCredit)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => viewingVoucher && handlePrint(viewingVoucher)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" onClick={() => setViewingVoucher(null)}>
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isClearDialogOpen} onOpenChange={setIsClearDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Cheque Clearance</DialogTitle>
            <DialogDescription>
              Set the date when the cheque for voucher {voucherToClear?.voucherNumber} was cleared.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="clear-date">Cheque Cleared Date</Label>
              <Input
                id="clear-date"
                type="date"
                value={clearanceDate}
                onChange={(e) => setClearanceDate(e.target.value)}
              />
            </div>
            <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-700">
              This will change the status from <strong>Pending</strong> to <strong>Recieve</strong> (Cleared) 
               and update account balances in the ledger and balance sheet.
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsClearDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleConfirmClearance}>Confirm Receive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
