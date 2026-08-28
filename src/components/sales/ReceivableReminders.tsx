import { formatUiDate, UI_DATE_PLACEHOLDER } from "@/utils/dateUtils";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Bell, Calendar as CalendarIcon, CreditCard, Download, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format, isValid } from "date-fns";
import { cn } from "@/lib/utils";
import { unlockBrowserPrintLayout } from "@/utils/printUtils";
import apiClient from "@/lib/api";
import { usePageActions } from "@/permissions/pageActions";
import { isAdminRole } from "@/utils/auth";
import { exportRowsToExcel } from "@/utils/exportUtils";

interface Receivable {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  term: string;
  customerName: string;
  customerCode: string;
  customerContact: string;
  balance: number;
  paidAmount: number;
  dueDate: string;
  originalDueDate: string;
  daysOverdue: number;
  remindersSent: number;
  promisedPayments: number;
  status: "pending" | "overdue" | "paid" | "reminded" | "rescheduled" | "disputed";
  paymentStatus: "unpaid" | "partial" | "paid";
}

const mockReceivables: Receivable[] = [];

const normalizeInvoicesResponse = (response: unknown): any[] => {
  if (Array.isArray(response)) return response;
  if (response && typeof response === "object") {
    const payload = response as Record<string, unknown>;
    if (Array.isArray(payload.data)) return payload.data;
  }
  return [];
};

const receivableSearchText = (item: Receivable) =>
  [
    item.invoiceNo,
    item.customerName,
    item.customerCode,
    item.customerContact,
  ]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");

interface PaymentAccount {
  id: string;
  name: string;
  code: string;
}

export const ReceivableReminders = () => {
  const { canExport, canEdit } = usePageActions("sales.receivable-reminders");
  const isAdmin = isAdminRole();
  const [receivables, setReceivables] = useState<Receivable[]>(mockReceivables);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Dialog states
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isMarkPaidOpen, setIsMarkPaidOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  
  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<PaymentAccount[]>([]);
  const [cashAccounts, setCashAccounts] = useState<PaymentAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  
  // Reschedule form state
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [rescheduleReason, setRescheduleReason] = useState("");
  
  // Reminder form state
  const [reminderType, setReminderType] = useState<"sms" | "email" | "whatsapp">("sms");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [promisedDate, setPromisedDate] = useState<Date | undefined>();
  const [promisedAmount, setPromisedAmount] = useState("");

  const filteredReceivables = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return receivables.filter((item) => {
      const matchesFilter =
        filterStatus === "all" || item.status === filterStatus;
      if (!query) return matchesFilter;
      return matchesFilter && receivableSearchText(item).includes(query);
    });
  }, [receivables, searchTerm, filterStatus]);

  // Calculate summary stats
  // Total invoice amount = received + remaining for all invoices
  const totalInvoiceAmount = receivables.reduce(
    (sum, r) => sum + Number(r.paidAmount || 0) + Number(r.balance || 0),
    0,
  );
  const totalReceivedAmount = receivables.reduce(
    (sum, r) => sum + Number(r.paidAmount || 0),
    0,
  );
  const overdueCount = receivables.filter(
    (r) => r.status === "overdue" || r.daysOverdue > 0,
  ).length;
  // Remaining overdue amount only
  const overdueAmount = receivables
    .filter((r) => r.status === "overdue" || r.daysOverdue > 0)
    .reduce((sum, r) => sum + Number(r.balance || 0), 0);

  const loadReceivables = useCallback(async () => {
    try {
      setLoadingReceivables(true);
      const [invoicesResponse, customersResponse] = await Promise.all([
        apiClient.getSalesInvoices(),
        apiClient.getCustomers({ status: "active", limit: 1000 }),
      ]);
      const invoices = normalizeInvoicesResponse(invoicesResponse);
      const customersData = Array.isArray(customersResponse)
        ? customersResponse
        : (customersResponse as any)?.data || [];
      const customerContactById = new Map<string, string>();
      const customerContactByName = new Map<string, string>();
      for (const customer of customersData) {
        const contact =
          String(customer?.contactNo || customer?.cellNumber || "").trim() ||
          "-";
        if (customer?.id) {
          customerContactById.set(String(customer.id), contact);
        }
        const nameKey = String(customer?.name || "")
          .trim()
          .toLowerCase();
        if (nameKey) {
          customerContactByName.set(nameKey, contact);
        }
      }
      const approvedInvoices = invoices.filter((inv: any) =>
        ["approved", "partially_delivered", "fully_delivered"].includes(
          String(inv?.status || "").toLowerCase(),
        ),
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const mapped: Receivable[] = approvedInvoices.map((inv: any) => {
        const rawInvoiceDate = inv.invoiceDate ?? inv.invoice_date;
        const invoiceDateObj = rawInvoiceDate ? new Date(rawInvoiceDate) : new Date();
        const invoiceDateForCalc = isValid(invoiceDateObj)
          ? invoiceDateObj
          : new Date();
        const rawTerm = String(inv.term || "").trim();
        const termDays = parseInt(rawTerm, 10);

        const dueDateObj = new Date(invoiceDateForCalc);
        if (Number.isFinite(termDays) && termDays > 0) {
          dueDateObj.setDate(dueDateObj.getDate() + termDays);
        }

        const remaining = Math.max(
          0,
          Number(inv.grandTotal ?? inv.grand_total ?? 0) -
            Number(inv.paidAmount ?? inv.paid_amount ?? 0),
        );

        const dueAt = new Date(dueDateObj);
        dueAt.setHours(0, 0, 0, 0);
        const daysOverdue =
          remaining > 0 && dueAt < today
            ? Math.floor((today.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24))
            : 0;

        const status: Receivable["status"] =
          remaining <= 0
            ? "paid"
            : daysOverdue > 0
              ? "overdue"
              : "pending";

        const customerId = String(inv.customerId ?? inv.customer_id ?? "").trim();
        const customerName =
          String(
            inv.customerName ??
              inv.customer_name ??
              inv.Customer?.name ??
              inv.Customer?.shortTitle ??
              "",
          ).trim() || "Walk-in Customer";
        const customerCode =
          String(inv.Customer?.code ?? customerId ?? "").trim() || "-";
        const invoiceNo =
          String(inv.invoiceNo ?? inv.invoice_no ?? "").trim() || "-";
        const customerContact =
          (customerId && customerContactById.get(customerId)) ||
          customerContactByName.get(customerName.trim().toLowerCase()) ||
          "-";

        const rawPaymentStatus = String(
          inv.paymentStatus ?? inv.payment_status ?? "unpaid",
        )
          .trim()
          .toLowerCase();
        const paymentStatus: Receivable["paymentStatus"] =
          rawPaymentStatus === "paid"
            ? "paid"
            : rawPaymentStatus === "partial"
              ? "partial"
              : "unpaid";

        return {
          id: inv.id,
          invoiceNo,
          invoiceDate: formatUiDate(invoiceDateForCalc),
          term: rawTerm || "-",
          customerName,
          customerCode,
          customerContact,
          balance: remaining,
          paidAmount: Number(inv.paidAmount ?? inv.paid_amount ?? 0),
          dueDate: formatUiDate(dueDateObj),
          originalDueDate: formatUiDate(dueDateObj),
          daysOverdue,
          remindersSent: 0,
          promisedPayments: 0,
          status,
          paymentStatus,
        };
      });

      setReceivables(mapped);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load receivables",
        variant: "destructive",
      });
    } finally {
      setLoadingReceivables(false);
    }
  }, []);

  useEffect(() => {
    void loadReceivables();
  }, [loadReceivables]);

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoadingAccounts(true);
        const response = (await apiClient.getAccounts({
          status: "Active",
        })) as any;
        const accountsData = Array.isArray(response)
          ? response
          : response.data || [];

        if (!Array.isArray(accountsData) || accountsData.length === 0) {
          setBankAccounts([]);
          setCashAccounts([]);
          return;
        }

        const currentAssetsAccounts = accountsData.filter((acc: any) => {
          if (!acc?.id || !acc?.name) return false;
          const mainGroupName = (
            acc.Subgroup?.MainGroup?.name || ""
          ).toLowerCase();
          const mainGroupType = (
            acc.Subgroup?.MainGroup?.type || ""
          ).toLowerCase();
          return (
            mainGroupName.includes("current asset") || mainGroupType === "asset"
          );
        });

        const bankAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = acc.Subgroup?.code || "";
            const accountCode = acc.code || "";
            const accountName = (acc.name || "").toLowerCase();
            if (accountName.includes("abdullah")) return false;
            if (subgroupCode === "104" || subgroupCode === "101") return false;
            if (subgroupCode === "103") return true;
            if (subgroupCode === "102") return false;
            if (/^103\d{3}$/.test(accountCode)) {
              if (
                accountName.includes("cash") ||
                accountName.includes("petty")
              ) {
                return false;
              }
              return true;
            }
            return (
              accountName.includes("bank") &&
              !accountName.includes("cash") &&
              !accountName.includes("petty") &&
              !accountName.includes("inventory")
            );
          })
          .map((acc: any) => ({
            id: acc.id,
            name: acc.name || "",
            code: acc.code || "",
          }));

        const cashAccountsList = currentAssetsAccounts
          .filter((acc: any) => {
            const subgroupCode = (acc.Subgroup?.code || "").trim();
            const subgroupName = (acc.Subgroup?.name || "").toLowerCase();
            if (subgroupCode === "102") return true;
            return subgroupName.includes("cash") && !subgroupName.includes("bank");
          })
          .map((acc: any) => ({
            id: acc.id,
            name: acc.name || "",
            code: acc.code || "",
          }));

        setBankAccounts(bankAccountsList);
        setCashAccounts(cashAccountsList);
      } catch {
        setBankAccounts([]);
        setCashAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    void fetchAccounts();
  }, []);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(filteredReceivables.map((r) => r.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter((i) => i !== id));
    }
  };

  const openPaymentDialog = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setPaymentAmount("");
    setPaymentDate(new Date());
    setPaymentAccountId(
      cashAccounts[0]?.id || bankAccounts[0]?.id || "",
    );
    setIsPaymentOpen(true);
  };

  const openMarkPaidDialog = (receivable: Receivable) => {
    if (!["unpaid", "partial"].includes(receivable.paymentStatus)) return;
    setSelectedReceivable(receivable);
    setIsMarkPaidOpen(true);
  };

  const handleMarkAsPaid = async () => {
    if (!selectedReceivable) return;

    setMarkingPaid(true);
    try {
      const response = await apiClient.markInvoiceAsPaid(selectedReceivable.id);

      if ((response as any)?.error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to mark invoice as paid",
          variant: "destructive",
        });
        return;
      }

      setIsMarkPaidOpen(false);
      toast({
        title: "Invoice Marked as Paid",
        description: `${selectedReceivable.invoiceNo} payment status updated to paid.`,
      });
      await loadReceivables();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to mark invoice as paid",
        variant: "destructive",
      });
    } finally {
      setMarkingPaid(false);
    }
  };

  const openRescheduleDialog = (receivable: Receivable) => {
    setSelectedReceivable(receivable);
    setNewDueDate(undefined);
    setRescheduleReason("");
    setIsRescheduleOpen(true);
  };

  const openReminderDialog = (receivable?: Receivable) => {
    if (receivable) {
      setSelectedReceivable(receivable);
      setSelectedItems([receivable.id]);
    }
    setReminderType("sms");
    setSelectedTemplate("");
    setCustomMessage("");
    setPromisedDate(undefined);
    setPromisedAmount("");
    setIsReminderOpen(true);
  };

  const handleRecordPayment = async () => {
    if (!selectedReceivable) return;

    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid payment amount.",
        variant: "destructive",
      });
      return;
    }
    if (amount > selectedReceivable.balance + 0.01) {
      toast({
        title: "Invalid Amount",
        description: `Payment cannot exceed the balance of Rs. ${selectedReceivable.balance.toLocaleString()}.`,
        variant: "destructive",
      });
      return;
    }
    if (!paymentAccountId) {
      toast({
        title: "Select Account",
        description: "Please select a bank or cash account for the payment.",
        variant: "destructive",
      });
      return;
    }

    setRecordingPayment(true);
    try {
      const response = await apiClient.recordPayment(selectedReceivable.id, {
        amount,
        accountId: paymentAccountId,
        paymentDate: paymentDate
          ? format(paymentDate, "yyyy-MM-dd")
          : format(new Date(), "yyyy-MM-dd"),
      });

      if ((response as any)?.error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to record payment",
          variant: "destructive",
        });
        return;
      }

      setIsPaymentOpen(false);
      toast({
        title: "Payment Recorded",
        description: `Rs. ${amount.toLocaleString()} payment recorded for ${selectedReceivable.invoiceNo}.`,
      });
      await loadReceivables();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to record payment",
        variant: "destructive",
      });
    } finally {
      setRecordingPayment(false);
    }
  };

  const handleReschedule = () => {
    if (selectedReceivable && newDueDate && rescheduleReason) {
      setReceivables(
        receivables.map((r) =>
          r.id === selectedReceivable.id
            ? {
                ...r,
                dueDate: formatUiDate(newDueDate),
                daysOverdue: 0,
                status: "rescheduled" as const,
              }
            : r
        )
      );
      setIsRescheduleOpen(false);
      toast({
        title: "Due Date Rescheduled",
        description: `New due date set for ${selectedReceivable.invoiceNo}.`,
      });
    }
  };

  const handleSendReminder = () => {
    const itemsToRemind = selectedItems.length > 0 ? selectedItems : [selectedReceivable?.id].filter(Boolean);
    
    setReceivables(
      receivables.map((r) =>
        itemsToRemind.includes(r.id)
          ? {
              ...r,
              remindersSent: r.remindersSent + 1,
              status: r.status === "pending" || r.status === "overdue" ? "reminded" : r.status,
              promisedPayments: promisedAmount ? r.promisedPayments + 1 : r.promisedPayments,
            }
          : r
      )
    );
    setIsReminderOpen(false);
    setSelectedItems([]);
    toast({
      title: "Reminder Sent",
      description: `Payment reminder sent to ${itemsToRemind.length} customer(s).`,
    });
  };

  const getExportData = () => {
    const headers = [
      "Invoice",
      "Invoice Date",
      "Customer",
      "Contact Number",
      "Term",
      "Due Date",
      "Balance",
      "Paid",
      "Days Overdue",
      "Reminders",
      "Status",
    ];
    const rows = filteredReceivables.map((item) => [
      item.invoiceNo,
      item.invoiceDate,
      item.customerName,
      item.customerContact,
      item.term,
      item.dueDate,
      item.balance,
      item.paidAmount,
      item.daysOverdue,
      item.remindersSent,
      item.status,
    ]);
    return { headers, rows };
  };

  const handleExportExcel = async () => {
    if (filteredReceivables.length === 0) {
      toast({
        title: "No data to export",
        description: "There are no receivable invoices to export.",
        variant: "destructive",
      });
      return;
    }

    const { headers, rows } = getExportData();
    try {
      await exportRowsToExcel(
        headers,
        rows,
        `receivables_${format(new Date(), "yyyy-MM-dd")}.xlsx`,
      );
      toast({
        title: "Report Exported",
        description: `${filteredReceivables.length} receivable(s) exported to Excel.`,
      });
    } catch {
      toast({
        title: "Export failed",
        description: "Could not generate the Excel file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleExportPdf = () => {
    const { headers, rows } = getExportData();
    const esc = (value: unknown) =>
      String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    const printHTML = `
      <!DOCTYPE html>
      <html>
        <head>
          <title></title>
          <style>
            @page { size: A4; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 10px; color: #000; margin: 0; }
            h1 { font-size: 16px; margin: 0 0 6px; }
            .meta { color: #555; margin-bottom: 14px; font-size: 9px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #ccc; padding: 5px 6px; text-align: left; }
            th { background: #f4f4f4; font-weight: 700; }
            td.num { text-align: right; }
            tr:nth-child(even) td { background: #fafafa; }
          </style>
        </head>
        <body>
          <h1>Receivables Report</h1>
          <div class="meta">Generated: ${esc(new Date().toLocaleString())} | Total Invoices: ${rows.length}</div>
          <table>
            <thead>
              <tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${rows
                .map(
                  (row) => `
                <tr>
                  ${row
                    .map((cell, index) =>
                      (index >= 6 && index <= 8) || typeof cell === "number"
                        ? `<td class="num">${esc(cell)}</td>`
                        : `<td>${esc(cell)}</td>`,
                    )
                    .join("")}
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printFrame = document.createElement("iframe");
    printFrame.style.position = "fixed";
    printFrame.style.right = "0";
    printFrame.style.bottom = "0";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.setAttribute("aria-hidden", "true");
    document.body.appendChild(printFrame);

    const cleanup = () => {
      setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame);
        }
        window.focus();
      }, 200);
    };

    printFrame.onload = () => {
      const frameWindow = printFrame.contentWindow;
      if (!frameWindow) {
        cleanup();
        return;
      }
      frameWindow.onafterprint = cleanup;
      setTimeout(() => {
        frameWindow.focus();
        frameWindow.print();
      }, 150);
      setTimeout(cleanup, 3000);
    };

    printFrame.srcdoc = unlockBrowserPrintLayout(printHTML);

    toast({
      title: "PDF Export Ready",
      description: "Use Save as PDF in the print dialog.",
    });
  };

  const getStatusBadge = (status: Receivable["status"]) => {
    const styles: Record<string, string> = {
      pending: "bg-muted text-muted-foreground",
      paid: "bg-green-500 text-white",
      overdue: "bg-red-500 text-white",
      reminded: "bg-yellow-500 text-white",
      rescheduled: "bg-blue-500 text-white",
      disputed: "bg-primary text-white",
    };
    return styles[status] || "bg-muted text-muted-foreground";
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) return `Rs. ${(amount / 1000000).toFixed(0)}M`;
    if (amount >= 1000) return `Rs. ${(amount / 1000).toFixed(0)}K`;
    return `Rs. ${amount.toLocaleString()}`;
  };

  const templates = [
    {
      id: "friendly",
      title: "Friendly Reminder",
      message:
        "Dear {customer}, this is a friendly reminder that your payment of Rs. {amount} for invoice {invoice} is due on {dueDate}. Please arrange the payment. Thank you!",
    },
    {
      id: "overdue",
      title: "Overdue Notice",
      message:
        "Dear {customer}, your payment of Rs. {amount} for invoice {invoice} is now {days} days overdue. Please clear the outstanding balance at your earliest convenience.",
    },
    {
      id: "final",
      title: "Final Notice",
      message:
        "Dear {customer}, this is a final reminder for the overdue payment of Rs. {amount} for invoice {invoice}. Please make the payment immediately to avoid any service...",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="hidden grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="bg-[#1e3a5f] border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Total Amount</p>
            <p className="text-xl font-bold text-white">{formatCurrency(totalInvoiceAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Total Received</p>
            <p className="text-xl font-bold text-white">{formatCurrency(totalReceivedAmount)}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Overdue Invoices</p>
            <p className="text-xl font-bold text-white">{overdueCount}</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Remaining Amount</p>
            <p className="text-xl font-bold text-white">{formatCurrency(overdueAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search invoice or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 bg-background">
            <SelectValue placeholder="All Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="reminded">Reminded</SelectItem>
            <SelectItem value="rescheduled">Rescheduled</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          {canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  className="gap-2 border-green-500 text-green-600 hover:bg-green-50"
                >
                  <Download className="w-4 h-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={handleExportExcel}>
                  Export as Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExportPdf}>
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Receivables Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Receivable Invoices ({filteredReceivables.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <ListNumberHeader />
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedItems.length === filteredReceivables.length && filteredReceivables.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Invoice</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Contact</TableHead>
                  <TableHead className="font-semibold">Term</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Balance</TableHead>
                  <TableHead className="text-center font-semibold text-primary">Days Overdue</TableHead>
                  <TableHead className="text-center font-semibold">Reminders</TableHead>
                  <TableHead className="text-center font-semibold">Status</TableHead>
                  <TableHead className="text-center font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceivables.map((item, index) => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <ListNumberCell index={index} total={filteredReceivables.length} />
                    <TableCell>
                      <Checkbox
                        checked={selectedItems.includes(item.id)}
                        onCheckedChange={(checked) => handleSelectItem(item.id, !!checked)}
                      />
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{item.invoiceNo}</p>
                        <p className="text-xs text-muted-foreground">{item.invoiceDate}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{item.customerName}</p>
                        <p className="text-xs text-muted-foreground">{item.customerCode}</p>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.customerContact || "-"}
                    </TableCell>
                    <TableCell>{item.term}</TableCell>
                    <TableCell>
                      <div>
                        <p className={cn("font-medium", item.daysOverdue > 0 ? "text-red-600" : "text-foreground")}>
                          {item.dueDate}
                        </p>
                        {item.dueDate !== item.originalDueDate && (
                          <p className="text-xs text-muted-foreground">{item.originalDueDate}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>
                        <p className="font-semibold">Rs. {item.balance.toLocaleString()}</p>
                        {item.paidAmount > 0 && (
                          <p className="text-xs text-green-600">Paid: Rs. {item.paidAmount.toLocaleString()}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {item.daysOverdue > 0 ? (
                        <span className="text-primary font-medium">{item.daysOverdue} days</span>
                      ) : (
                        <span className="text-green-600">Current</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                          item.remindersSent > 0 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {item.remindersSent}
                        </span>
                        {item.promisedPayments > 0 && (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium bg-green-100 text-green-600">
                            P
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn("text-xs", getStatusBadge(item.status))}>{item.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        {isAdmin &&
                          (item.paymentStatus === "unpaid" ||
                            item.paymentStatus === "partial") && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              onClick={() => openMarkPaidDialog(item)}
                              title="Mark as Paid"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          )}
                        {canEdit && item.balance > 0 && item.status !== "paid" && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                              onClick={() => openReminderDialog(item)}
                              title="Send Reminder"
                            >
                              <Bell className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => openRescheduleDialog(item)}
                              title="Reschedule"
                            >
                              <CalendarIcon className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-green-500 hover:text-green-600 hover:bg-green-50"
                              onClick={() => openPaymentDialog(item)}
                              title="Record Payment"
                            >
                              <CreditCard className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loadingReceivables && filteredReceivables.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No receivable invoices found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Record Payment Dialog */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Record Payment</DialogTitle>
          </DialogHeader>
          {selectedReceivable && (
            <div className="space-y-4">
              <div className="bg-muted/30 p-3 rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> {selectedReceivable.invoiceNo}</p>
                <p><span className="text-muted-foreground">Customer:</span> {selectedReceivable.customerName}</p>
                <p><span className="text-muted-foreground">Balance Due:</span> <span className="text-red-600 font-semibold">Rs. {selectedReceivable.balance.toLocaleString()}</span></p>
              </div>

              <div className="space-y-2">
                <Label>Payment Amount *</Label>
                <Input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0"
                  max={selectedReceivable.balance}
                />
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    setPaymentAmount(String(selectedReceivable.balance))
                  }
                >
                  Pay full balance (Rs. {selectedReceivable.balance.toLocaleString()})
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? formatUiDate(paymentDate) : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={paymentDate}
                      onSelect={setPaymentDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Bank / Cash Account *</Label>
                <Select
                  value={paymentAccountId}
                  onValueChange={setPaymentAccountId}
                  disabled={loadingAccounts}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue
                      placeholder={
                        loadingAccounts ? "Loading accounts..." : "Select account"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    {cashAccounts.length > 0 ? (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Cash Accounts
                        </div>
                        {cashAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name} ({acc.code || "Cash"})
                          </SelectItem>
                        ))}
                      </>
                    ) : null}
                    {bankAccounts.length > 0 ? (
                      <>
                        <div className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Bank Accounts
                        </div>
                        {bankAccounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            {acc.name} ({acc.code || "Bank"})
                          </SelectItem>
                        ))}
                      </>
                    ) : null}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => void handleRecordPayment()}
                  disabled={recordingPayment}
                  className="flex-1 bg-primary hover:bg-primary/90 text-white"
                >
                  {recordingPayment ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Record Payment"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsPaymentOpen(false)}
                  disabled={recordingPayment}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Mark as Paid Dialog (admin only — status sync, no voucher) */}
      <Dialog open={isMarkPaidOpen} onOpenChange={setIsMarkPaidOpen}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Mark Invoice as Paid</DialogTitle>
          </DialogHeader>
          {selectedReceivable && (
            <div className="space-y-4">
              <div className="bg-muted/30 p-3 rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> {selectedReceivable.invoiceNo}</p>
                <p><span className="text-muted-foreground">Customer:</span> {selectedReceivable.customerName}</p>
                <p>
                  <span className="text-muted-foreground">Current Status:</span>{" "}
                  <span className="font-medium capitalize">{selectedReceivable.paymentStatus}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Use this when payment was already received through an RV voucher but the
                invoice still shows as unpaid or partially paid. This only updates the
                invoice payment status — no voucher will be created.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => void handleMarkAsPaid()}
                  disabled={markingPaid}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {markingPaid ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    "Mark as Paid"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setIsMarkPaidOpen(false)}
                  disabled={markingPaid}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="max-w-md bg-background">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Reschedule Due Date</DialogTitle>
          </DialogHeader>
          {selectedReceivable && (
            <div className="space-y-4">
              <div className="bg-muted/30 p-3 rounded-lg text-sm space-y-1">
                <p><span className="text-muted-foreground">Invoice:</span> {selectedReceivable.invoiceNo}</p>
                <p><span className="text-muted-foreground">Customer:</span> {selectedReceivable.customerName}</p>
                <p><span className="text-muted-foreground">Balance:</span> <span className="text-red-600 font-semibold">Rs. {selectedReceivable.balance.toLocaleString()}</span></p>
                <p><span className="text-muted-foreground">Current Due:</span> {selectedReceivable.dueDate}</p>
              </div>

              <div className="space-y-2">
                <Label>New Due Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {newDueDate ? formatUiDate(newDueDate) : UI_DATE_PLACEHOLDER}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={newDueDate}
                      onSelect={setNewDueDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Reason *</Label>
                <Select value={rescheduleReason} onValueChange={setRescheduleReason}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="customer_request">Customer Request</SelectItem>
                    <SelectItem value="payment_issues">Payment Issues</SelectItem>
                    <SelectItem value="dispute">Dispute Resolution</SelectItem>
                    <SelectItem value="partial_payment">Partial Payment Made</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleReschedule} className="flex-1 bg-primary hover:bg-primary/90 text-white">
                  Reschedule
                </Button>
                <Button variant="outline" onClick={() => setIsRescheduleOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Reminder Dialog */}
      <Dialog open={isReminderOpen} onOpenChange={setIsReminderOpen}>
        <DialogContent className="max-w-md bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">Send Payment Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-sm">
              {selectedItems.length || 1} customer(s) will receive this reminder
            </div>

            <div className="space-y-2">
              <Label>Reminder Type</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={reminderType === "sms" ? "default" : "outline"}
                  onClick={() => setReminderType("sms")}
                  className={cn(
                    "flex-1",
                    reminderType === "sms" ? "bg-primary hover:bg-primary/90" : "border-primary text-primary"
                  )}
                >
                  SMS
                </Button>
                <Button
                  type="button"
                  variant={reminderType === "email" ? "default" : "outline"}
                  onClick={() => setReminderType("email")}
                  className={cn(
                    "flex-1",
                    reminderType === "email" ? "bg-primary hover:bg-primary/90" : "border-primary text-primary"
                  )}
                >
                  EMAIL
                </Button>
                <Button
                  type="button"
                  variant={reminderType === "whatsapp" ? "default" : "outline"}
                  onClick={() => setReminderType("whatsapp")}
                  className={cn(
                    "flex-1",
                    reminderType === "whatsapp" ? "bg-primary hover:bg-primary/90" : ""
                  )}
                >
                  WHATSAPP
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Template</Label>
              <div className="space-y-2">
                {templates.map((template) => (
                  <div
                    key={template.id}
                    onClick={() => {
                      setSelectedTemplate(template.id);
                      setCustomMessage(template.message);
                    }}
                    className={cn(
                      "p-3 border rounded-lg cursor-pointer transition-all",
                      selectedTemplate === template.id
                        ? "border-primary bg-primary/10"
                        : "border-border hover:border-muted-foreground"
                    )}
                  >
                    <p className="font-medium text-sm">{template.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.message}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Custom Message</Label>
              <Textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Enter custom message or select a template above..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Promised Date (Optional)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {promisedDate ? formatUiDate(promisedDate) : UI_DATE_PLACEHOLDER}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
                    <Calendar
                      mode="single"
                      selected={promisedDate}
                      onSelect={setPromisedDate}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>Promised Amount</Label>
                <Input
                  type="number"
                  value={promisedAmount}
                  onChange={(e) => setPromisedAmount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button onClick={handleSendReminder} className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white">
                Send Reminder
              </Button>
              <Button variant="outline" onClick={() => setIsReminderOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
