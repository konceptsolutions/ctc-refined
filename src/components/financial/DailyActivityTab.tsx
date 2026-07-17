import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getCurrentDatePakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import {
  printDailyActivity,
  type DailyActivityPrintInput,
} from "@/utils/printDailyActivityPdf";
import {
  ChevronDown,
  FileText,
  Loader2,
  RefreshCw,
  ShoppingCart,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getCustomerTypeLabel } from "@/types/invoice";

type ActivityLineItem = {
  partNo: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  brand?: string;
};

type SalesInvoiceRow = {
  id: string;
  number: string;
  date: string;
  customerName: string;
  customerType: string;
  term?: string | null;
  bankAmount?: number;
  cashAmount?: number;
  status: string;
  paymentStatus: string;
  subtotal: number;
  tax: number;
  grandTotal: number;
  paidAmount: number;
  itemsCount: number;
  items: ActivityLineItem[];
};

type SalesReturnRow = {
  id: string;
  number: string;
  date: string;
  invoiceNo: string | null;
  customerName: string;
  status: string;
  subtotal: number;
  tax: number;
  deduction: number;
  totalAmount: number;
  paidAmount: number;
  itemsCount: number;
  items: ActivityLineItem[];
};

type DailyActivityData = {
  date: string;
  summary: {
    salesInvoices: { count: number; totalAmount: number };
    salesReturns: { count: number; totalAmount: number };
  };
  salesInvoices: SalesInvoiceRow[];
  salesReturns: SalesReturnRow[];
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB");
};

const statusBadgeClass = (status: string) => {
  const s = String(status || "").toLowerCase();
  if (s.includes("complete") || s === "posted" || s === "approved" || s === "paid") {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
  }
  if (s.includes("pending") || s === "draft") {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  }
  if (s.includes("cancel") || s === "rejected") {
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  }
  return "bg-muted text-muted-foreground";
};

const getInvoicePaymentMode = (inv: SalesInvoiceRow) => {
  const bankAmt = Number(inv.bankAmount || 0);
  const cashAmt = Number(inv.cashAmount || 0);
  if (bankAmt > 0 && cashAmt > 0) return "Both";
  if (bankAmt > 0) return "Bank";
  if (cashAmt > 0) return "Cash";
  if (inv.customerType !== "registered") {
    const term = String(inv.term || "").toLowerCase();
    if (term === "cash+online") return "Both";
    if (term === "online") return "Bank";
    if (term === "cash") return "Cash";
  }
  const term = String(inv.term || "").trim();
  if (!term) return "-";
  if (inv.customerType === "registered") return `${term} days credit`;
  return term;
};

const LineItemsTable = ({ items }: { items: ActivityLineItem[] }) => (
  <div className="rounded-md border bg-muted/20 overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <ListNumberHeader className="w-10" />
          <TableHead>Part No</TableHead>
          <TableHead>Description</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-4">
              No line items
            </TableCell>
          </TableRow>
        ) : (
          items.map((item, index) => (
            <TableRow key={`${item.partNo}-${index}`}>
              <ListNumberCell index={index} />
              <TableCell className="font-medium whitespace-nowrap">{item.partNo || "—"}</TableCell>
              <TableCell className="max-w-[240px] truncate" title={item.description}>
                {item.description || "—"}
                {item.brand ? (
                  <span className="block text-xs text-muted-foreground">{item.brand}</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(item.unitPrice)}</TableCell>
              <TableCell className="text-right tabular-nums font-medium">
                {formatMoney(item.lineTotal)}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  </div>
);

type SectionProps = {
  title: string;
  icon: React.ReactNode;
  count: number;
  totalAmount: number;
  emptyMessage: string;
  children: React.ReactNode;
};

const ActivitySection = ({
  title,
  icon,
  count,
  totalAmount,
  emptyMessage,
  children,
}: SectionProps) => {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">{icon}</div>
              <div className="min-w-0">
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">
                  {count} document{count === 1 ? "" : "s"} · Rs {formatMoney(totalAmount)}
                </p>
              </div>
            </div>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-6">
            {count === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6 border rounded-lg bg-muted/20">
                {emptyMessage}
              </p>
            ) : (
              children
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

const DocumentBlock = ({
  header,
  meta,
  amountLabel,
  amount,
  items,
}: {
  header: React.ReactNode;
  meta: React.ReactNode;
  amountLabel: string;
  amount: number;
  items: ActivityLineItem[];
}) => {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border rounded-lg overflow-hidden">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
        >
          <div className="min-w-0 flex-1">{header}</div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right">
              <div className="text-xs text-muted-foreground">{amountLabel}</div>
              <div className="font-semibold tabular-nums">Rs {formatMoney(amount)}</div>
            </div>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </div>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-4 pb-4 space-y-3 border-t bg-muted/10">
          <div className="pt-3 text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            {meta}
          </div>
          <LineItemsTable items={items} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

const buildPrintInput = (data: DailyActivityData): DailyActivityPrintInput => ({
  dateLabel: formatDate(data.date),
  summary: data.summary,
  salesInvoices: data.salesInvoices.map((inv) => ({
    number: inv.number,
    headerText: [
      inv.customerName || "—",
      getCustomerTypeLabel(inv.customerType),
      getInvoicePaymentMode(inv),
      `${inv.itemsCount} item${inv.itemsCount === 1 ? "" : "s"}`,
    ].join("  ·  "),
    metaText: [
      `Date: ${formatDate(inv.date)}`,
      `Subtotal: Rs ${formatMoney(inv.subtotal)}`,
      inv.tax > 0 ? `Tax: Rs ${formatMoney(inv.tax)}` : "",
      `Paid: Rs ${formatMoney(inv.paidAmount)}`,
      `Status: ${inv.status}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    amountLabel: "Grand Total",
    amount: inv.grandTotal,
    items: inv.items,
  })),
  salesReturns: data.salesReturns.map((sr) => ({
    number: sr.number,
    headerText: [
      sr.status,
      sr.invoiceNo ? `Invoice: ${sr.invoiceNo}` : "",
      `${sr.itemsCount} item${sr.itemsCount === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    metaText: [
      `Customer: ${sr.customerName}`,
      `Date: ${formatDate(sr.date)}`,
      `Subtotal: Rs ${formatMoney(sr.subtotal)}`,
      sr.tax > 0 ? `Tax: Rs ${formatMoney(sr.tax)}` : "",
      sr.deduction > 0 ? `Deduction: Rs ${formatMoney(sr.deduction)}` : "",
      `Refunded: Rs ${formatMoney(sr.paidAmount)}`,
    ]
      .filter(Boolean)
      .join("  ·  "),
    amountLabel: "Return Total",
    amount: sr.totalAmount,
    items: sr.items,
  })),
});

export const DailyActivityTab = ({
  date: controlledDate,
  hideDatePicker = false,
}: {
  date?: string;
  hideDatePicker?: boolean;
} = {}) => {
  const [internalDate, setInternalDate] = useState(getCurrentDatePakistan());
  const activityDate = controlledDate ?? internalDate;
  const [data, setData] = useState<DailyActivityData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchDailyActivity = useCallback(async () => {
    if (!activityDate) return;
    setLoading(true);
    try {
      const result = await apiClient.getDailyActivity({ date: activityDate });
      if ((result as any)?.error) {
        toast.error((result as any).error || "Failed to load daily activity");
        setData(null);
        return;
      }
      setData(((result as any)?.data || null) as DailyActivityData | null);
    } catch {
      toast.error("Failed to load daily activity");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [activityDate]);

  useEffect(() => {
    void fetchDailyActivity();
  }, [fetchDailyActivity]);

  const handlePrint = () => {
    if (!data) return;
    const started = printDailyActivity(buildPrintInput(data));
    if (!started) {
      toast.error("Allow pop-ups to print the report");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-3">
            {!hideDatePicker ? (
              <div className="space-y-2">
                <Label htmlFor="daily-activity-date">Activity Date</Label>
                <Input
                  id="daily-activity-date"
                  type="date"
                  value={activityDate}
                  onChange={(e) => setInternalDate(e.target.value)}
                  className="w-44"
                />
              </div>
            ) : null}
            <Button
              variant="outline"
              onClick={() => void fetchDailyActivity()}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Refresh
            </Button>
            <PrintPdfButton onPrint={handlePrint} disabled={!data || loading} />
          </div>
        </CardContent>
      </Card>

      {loading && !data ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading daily activity...
        </div>
      ) : data ? (
        <>
          <ActivitySection
            title="Sales Invoices"
            icon={<ShoppingCart className="h-5 w-5" />}
            count={data.salesInvoices.length}
            totalAmount={data.summary.salesInvoices.totalAmount}
            emptyMessage="No sales invoices on this date."
          >
            <div className="space-y-3">
              {data.salesInvoices.map((inv) => (
                <DocumentBlock
                  key={inv.id}
                  amountLabel="Grand Total"
                  amount={inv.grandTotal}
                  items={inv.items}
                  header={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{inv.number}</span>
                      <span className="text-sm">{inv.customerName || "—"}</span>
                      <span className="text-sm text-muted-foreground">
                        {getCustomerTypeLabel(inv.customerType)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {getInvoicePaymentMode(inv)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {inv.itemsCount} item{inv.itemsCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  }
                  meta={
                    <>
                      <span>
                        <strong>Date:</strong> {formatDate(inv.date)}
                      </span>
                      <span>
                        <strong>Subtotal:</strong> Rs {formatMoney(inv.subtotal)}
                      </span>
                      {inv.tax > 0 ? (
                        <span>
                          <strong>Tax:</strong> Rs {formatMoney(inv.tax)}
                        </span>
                      ) : null}
                      <span>
                        <strong>Paid:</strong> Rs {formatMoney(inv.paidAmount)}
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          </ActivitySection>

          <ActivitySection
            title="Sales Returns"
            icon={<Undo2 className="h-5 w-5" />}
            count={data.salesReturns.length}
            totalAmount={data.summary.salesReturns.totalAmount}
            emptyMessage="No sales returns on this date."
          >
            <div className="space-y-3">
              {data.salesReturns.map((sr) => (
                <DocumentBlock
                  key={sr.id}
                  amountLabel="Return Total"
                  amount={sr.totalAmount}
                  items={sr.items}
                  header={
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{sr.number}</span>
                      <Badge variant="outline" className={statusBadgeClass(sr.status)}>
                        {sr.status}
                      </Badge>
                      {sr.invoiceNo ? (
                        <span className="text-sm text-muted-foreground">
                          Invoice: {sr.invoiceNo}
                        </span>
                      ) : null}
                      <span className="text-sm text-muted-foreground">
                        {sr.itemsCount} item{sr.itemsCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  }
                  meta={
                    <>
                      <span>
                        <strong>Customer:</strong> {sr.customerName}
                      </span>
                      <span>
                        <strong>Date:</strong> {formatDate(sr.date)}
                      </span>
                      <span>
                        <strong>Subtotal:</strong> Rs {formatMoney(sr.subtotal)}
                      </span>
                      {sr.tax > 0 ? (
                        <span>
                          <strong>Tax:</strong> Rs {formatMoney(sr.tax)}
                        </span>
                      ) : null}
                      {sr.deduction > 0 ? (
                        <span>
                          <strong>Deduction:</strong> Rs {formatMoney(sr.deduction)}
                        </span>
                      ) : null}
                      <span>
                        <strong>Refunded:</strong> Rs {formatMoney(sr.paidAmount)}
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          </ActivitySection>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>Select a date and refresh to view daily activity.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
