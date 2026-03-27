import { useEffect, useState } from "react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Bell, Calendar as CalendarIcon, CreditCard, Download, X } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api";

interface Receivable {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  term: string;
  customerName: string;
  customerCode: string;
  balance: number;
  paidAmount: number;
  dueDate: string;
  originalDueDate: string;
  daysOverdue: number;
  remindersSent: number;
  promisedPayments: number;
  status: "pending" | "overdue" | "reminded" | "rescheduled" | "disputed";
}

const mockReceivables: Receivable[] = [];

export const ReceivableReminders = () => {
  const [receivables, setReceivables] = useState<Receivable[]>(mockReceivables);
  const [loadingReceivables, setLoadingReceivables] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  
  // Dialog states
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<Receivable | null>(null);
  
  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState<Date | undefined>(new Date());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  
  // Reschedule form state
  const [newDueDate, setNewDueDate] = useState<Date | undefined>();
  const [rescheduleReason, setRescheduleReason] = useState("");
  
  // Reminder form state
  const [reminderType, setReminderType] = useState<"sms" | "email" | "whatsapp">("sms");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [customMessage, setCustomMessage] = useState("");
  const [promisedDate, setPromisedDate] = useState<Date | undefined>();
  const [promisedAmount, setPromisedAmount] = useState("");

  const filteredReceivables = receivables.filter((item) => {
    const matchesSearch =
      item.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

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

  useEffect(() => {
    const fetchReceivables = async () => {
      try {
        setLoadingReceivables(true);
        const response = await apiClient.getSalesInvoices();
        const invoices = Array.isArray(response) ? response : ((response as any)?.data || []);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const mapped: Receivable[] = invoices.map((inv: any) => {
          const invoiceDateObj = new Date(inv.invoiceDate);
          const rawTerm = String(inv.term || "").trim();
          const termDays = parseInt(rawTerm, 10);

          const dueDateObj = new Date(invoiceDateObj);
          if (Number.isFinite(termDays) && termDays > 0) {
            dueDateObj.setDate(dueDateObj.getDate() + termDays);
          }

          const remaining = Math.max(
            0,
            Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0),
          );

          const dueAt = new Date(dueDateObj);
          dueAt.setHours(0, 0, 0, 0);
          const daysOverdue =
            remaining > 0 && dueAt < today
              ? Math.floor((today.getTime() - dueAt.getTime()) / (1000 * 60 * 60 * 24))
              : 0;

          const status: Receivable["status"] =
            remaining <= 0 ? "pending" : daysOverdue > 0 ? "overdue" : "pending";

          return {
            id: inv.id,
            invoiceNo: inv.invoiceNo || "-",
            invoiceDate: format(invoiceDateObj, "dd/MM/yyyy"),
            term: rawTerm || "-",
            customerName: inv.customerName || "Walk-in Customer",
            customerCode: inv.customerId || "-",
            balance: remaining,
            paidAmount: Number(inv.paidAmount || 0),
            dueDate: format(dueDateObj, "dd/MM/yyyy"),
            originalDueDate: format(dueDateObj, "dd/MM/yyyy"),
            daysOverdue,
            remindersSent: 0,
            promisedPayments: 0,
            status,
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
    };

    fetchReceivables();
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
    setPaymentMethod("cash");
    setReferenceNo("");
    setIsPaymentOpen(true);
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

  const handleRecordPayment = () => {
    if (selectedReceivable && paymentAmount) {
      const amount = parseFloat(paymentAmount);
      setReceivables(
        receivables.map((r) =>
          r.id === selectedReceivable.id
            ? {
                ...r,
                paidAmount: r.paidAmount + amount,
                balance: r.balance - amount,
                status: r.balance - amount <= 0 ? "pending" : r.status,
              }
            : r
        )
      );
      setIsPaymentOpen(false);
      toast({
        title: "Payment Recorded",
        description: `Rs. ${amount.toLocaleString()} payment recorded for ${selectedReceivable.invoiceNo}.`,
      });
    }
  };

  const handleReschedule = () => {
    if (selectedReceivable && newDueDate && rescheduleReason) {
      setReceivables(
        receivables.map((r) =>
          r.id === selectedReceivable.id
            ? {
                ...r,
                dueDate: format(newDueDate, "dd/MM/yyyy"),
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

  const handleExport = () => {
    const headers = ["Invoice", "Customer", "Code", "Term", "Due Date", "Balance", "Paid", "Days Overdue", "Reminders", "Status"];
    const rows = filteredReceivables.map((item) => [
      item.invoiceNo,
      item.customerName,
      item.customerCode,
      item.term,
      item.dueDate,
      item.balance,
      item.paidAmount,
      item.daysOverdue,
      item.remindersSent,
      item.status,
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `receivables_${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast({
      title: "Report Exported",
      description: "Receivables report has been exported.",
    });
  };

  const getStatusBadge = (status: Receivable["status"]) => {
    const styles: Record<string, string> = {
      pending: "bg-muted text-muted-foreground",
      overdue: "bg-red-500 text-white",
      reminded: "bg-yellow-500 text-white",
      rescheduled: "bg-blue-500 text-white",
      disputed: "bg-orange-500 text-white",
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
      <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3">
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
        <Card className="bg-orange-400 border-0">
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
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="reminded">Reminded</SelectItem>
            <SelectItem value="rescheduled">Rescheduled</SelectItem>
            <SelectItem value="disputed">Disputed</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button onClick={handleExport} variant="outline" className="gap-2 border-green-500 text-green-600 hover:bg-green-50">
            <Download className="w-4 h-4" />
            Export
          </Button>
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={selectedItems.length === filteredReceivables.length && filteredReceivables.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="font-semibold">Invoice</TableHead>
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Term</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Balance</TableHead>
                  <TableHead className="text-center font-semibold text-orange-600">Days Overdue</TableHead>
                  <TableHead className="text-center font-semibold">Reminders</TableHead>
                  <TableHead className="text-center font-semibold">Status</TableHead>
                  <TableHead className="text-center font-semibold">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceivables.map((item) => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
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
                        <span className="text-orange-600 font-medium">{item.daysOverdue} days</span>
                      ) : (
                        <span className="text-green-600">Current</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium",
                          item.remindersSent > 0 ? "bg-orange-100 text-orange-600" : "bg-muted text-muted-foreground"
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-orange-500 hover:text-orange-600 hover:bg-orange-50"
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
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loadingReceivables && filteredReceivables.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
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
              </div>

              <div className="space-y-2">
                <Label>Payment Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {paymentDate ? format(paymentDate, "dd/MM/yyyy") : "Pick date"}
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
                <Label>Payment Method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="online">Online Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reference No</Label>
                <Input
                  value={referenceNo}
                  onChange={(e) => setReferenceNo(e.target.value)}
                  placeholder="Cheque no. / Transaction ID"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <Button onClick={handleRecordPayment} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
                  Record Payment
                </Button>
                <Button variant="outline" onClick={() => setIsPaymentOpen(false)}>
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
                      {newDueDate ? format(newDueDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
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
                <Button onClick={handleReschedule} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
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
                    reminderType === "sms" ? "bg-orange-500 hover:bg-orange-600" : "border-orange-500 text-orange-500"
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
                    reminderType === "email" ? "bg-orange-500 hover:bg-orange-600" : "border-orange-500 text-orange-500"
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
                    reminderType === "whatsapp" ? "bg-orange-500 hover:bg-orange-600" : ""
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
                        ? "border-orange-500 bg-orange-50"
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
                      {promisedDate ? format(promisedDate, "dd/MM/yyyy") : "dd/mm/yyyy"}
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
