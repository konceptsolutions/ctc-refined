import { Fragment, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Search,
  Download,
  CalendarIcon,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import apiClient from "@/lib/api";
import { usePageActions } from "@/permissions/pageActions";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printSaleProfitReport } from "@/utils/printSaleProfitReportPdf";
import {
  formatUiDate,
  getCurrentDatePakistan,
  getStartOfCurrentMonthPakistan,
} from "@/utils/dateUtils";

interface ProfitItemRow {
  part_no: string;
  description: string;
  brand: string;
  quantity: number;
  unit_price: number;
  avg_cost: number;
  line_total: number;
  line_cost: number;
  line_profit: number;
}

interface ProfitInvoiceRow {
  id: string;
  invoice_no: string;
  invoice_date: string;
  customer_name: string;
  status: string;
  payment_status: string;
  grand_total: number;
  sales_amount: number;
  cost_amount: number;
  profit_amount: number;
  margin_percent: number;
  items: ProfitItemRow[];
}

interface ProfitSummary {
  invoice_count: number;
  total_sales: number;
  total_cost: number;
  total_profit: number;
  margin_percent: number;
}

const formatMoney = (value: number) =>
  `Rs. ${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatPercent = (value: number) =>
  `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;

const parseIsoDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
};

export type SaleProfitReportProps = {
  /** Lock report to a single day (from = to). Hides date range filters. */
  fixedDate?: string;
};

export const SaleProfitReport = ({ fixedDate }: SaleProfitReportProps = {}) => {
  const { canExport, canPrint } = usePageActions("sales.sale-profit-report");
  const [fromDate, setFromDate] = useState<Date | undefined>(() =>
    parseIsoDate(fixedDate ?? getStartOfCurrentMonthPakistan()),
  );
  const [toDate, setToDate] = useState<Date | undefined>(() =>
    parseIsoDate(fixedDate ?? getCurrentDatePakistan()),
  );
  const [appliedFrom, setAppliedFrom] = useState<string>(
    fixedDate ?? getStartOfCurrentMonthPakistan(),
  );
  const [appliedTo, setAppliedTo] = useState<string>(
    fixedDate ?? getCurrentDatePakistan(),
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<ProfitInvoiceRow[]>([]);
  const [summary, setSummary] = useState<ProfitSummary | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchReport = async (
    from: string,
    to: string,
    search?: string,
  ) => {
    try {
      setLoading(true);
      const response = (await apiClient.getSalesProfitReport({
        from_date: from,
        to_date: to,
        search: search?.trim() || undefined,
      })) as {
        data?: ProfitInvoiceRow[];
        summary?: ProfitSummary;
        error?: string;
      };

      if (response?.error) {
        throw new Error(response.error);
      }

      setRows(response.data || []);
      setSummary(response.summary || null);
      setExpandedIds(new Set());
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load sale profit report",
        variant: "destructive",
      });
      setRows([]);
      setSummary(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!fixedDate) return;
    setFromDate(parseIsoDate(fixedDate));
    setToDate(parseIsoDate(fixedDate));
    setAppliedFrom(fixedDate);
    setAppliedTo(fixedDate);
  }, [fixedDate]);

  useEffect(() => {
    void fetchReport(appliedFrom, appliedTo, searchTerm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedFrom, appliedTo]);

  const filteredRows = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => {
      const haystack = `${row.customer_name} ${row.invoice_no}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [rows, searchTerm]);

  const handleApplyDates = () => {
    if (!fromDate || !toDate) {
      toast({
        title: "Select dates",
        description: "Please choose both from and to dates.",
        variant: "destructive",
      });
      return;
    }
    const nextFrom = format(fromDate, "yyyy-MM-dd");
    const nextTo = format(toDate, "yyyy-MM-dd");
    if (nextFrom > nextTo) {
      toast({
        title: "Invalid range",
        description: "From date cannot be after to date.",
        variant: "destructive",
      });
      return;
    }
    setAppliedFrom(nextFrom);
    setAppliedTo(nextTo);
    void fetchReport(nextFrom, nextTo, searchTerm);
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(filteredRows.map((row) => row.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  const handleExport = () => {
    const headers = [
      "Invoice No",
      "Invoice Date",
      "Customer",
      "Sales",
      "Cost",
      "Profit",
      "Margin %",
      "Part No",
      "Description",
      "Qty",
      "Unit Price",
      "Avg Cost",
      "Line Total",
      "Line Profit",
    ];

    const csvRows: string[][] = [];
    for (const invoice of filteredRows) {
      if (invoice.items.length === 0) {
        csvRows.push([
          invoice.invoice_no,
          invoice.invoice_date,
          invoice.customer_name,
          String(invoice.sales_amount),
          String(invoice.cost_amount),
          String(invoice.profit_amount),
          String(invoice.margin_percent),
          "",
          "",
          "",
          "",
          "",
          "",
          "",
        ]);
        continue;
      }
      invoice.items.forEach((item, index) => {
        csvRows.push([
          index === 0 ? invoice.invoice_no : "",
          index === 0 ? invoice.invoice_date : "",
          index === 0 ? invoice.customer_name : "",
          index === 0 ? String(invoice.sales_amount) : "",
          index === 0 ? String(invoice.cost_amount) : "",
          index === 0 ? String(invoice.profit_amount) : "",
          index === 0 ? String(invoice.margin_percent) : "",
          item.part_no,
          item.description,
          String(item.quantity),
          String(item.unit_price),
          String(item.avg_cost),
          String(item.line_total),
          String(item.line_profit),
        ]);
      });
    }

    const csvContent = [
      headers.join(","),
      ...csvRows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `sale_profit_report_${appliedFrom}_${appliedTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);

    toast({
      title: "Exported",
      description: "Sale profit report downloaded as CSV.",
    });
  };

  const handlePrint = () => {
    const totalSales = filteredRows.reduce((sum, row) => sum + row.sales_amount, 0);
    const totalCost = filteredRows.reduce((sum, row) => sum + row.cost_amount, 0);
    const totalProfit = filteredRows.reduce((sum, row) => sum + row.profit_amount, 0);
    const opened = printSaleProfitReport({
      fromDate: appliedFrom,
      toDate: appliedTo,
      invoices: filteredRows,
      summary: summary ?? {
        invoice_count: filteredRows.length,
        total_sales: totalSales,
        total_cost: totalCost,
        total_profit: totalProfit,
        margin_percent:
          totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
      },
    });

    if (!opened) {
      toast({
        title: "Print blocked",
        description: "Please allow pop-ups to print the PDF.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Print PDF",
      description: "Sale profit report PDF opened for printing.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <Card className="border-0 bg-[#1e3a5f]">
          <CardContent className="p-4 text-center">
            <p className="mb-1 text-xs text-white/70">Total Sales</p>
            <p className="text-xl font-bold text-white">
              {formatMoney(summary?.total_sales ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-slate-600">
          <CardContent className="p-4 text-center">
            <p className="mb-1 text-xs text-white/70">Total Cost</p>
            <p className="text-xl font-bold text-white">
              {formatMoney(summary?.total_cost ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-emerald-600">
          <CardContent className="p-4 text-center">
            <p className="mb-1 text-xs text-white/70">Total Profit</p>
            <p className="text-xl font-bold text-white">
              {formatMoney(summary?.total_profit ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 bg-primary">
          <CardContent className="p-4 text-center">
            <p className="mb-1 text-xs text-white/70">Margin / Invoices</p>
            <p className="text-xl font-bold text-white">
              {formatPercent(summary?.margin_percent ?? 0)} ·{" "}
              {summary?.invoice_count ?? 0}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {!fixedDate ? (
          <>
        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">From</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[150px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? formatUiDate(fromDate) : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={setFromDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-muted-foreground">To</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="w-[150px] justify-start text-left font-normal"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? formatUiDate(toDate) : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={setToDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <Button onClick={handleApplyDates} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            "Apply"
          )}
        </Button>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Date: <span className="font-medium text-foreground">{formatUiDate(fixedDate)}</span>
          </p>
        )}

        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search invoice or customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse all
        </Button>

        {canExport && (
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        )}
        {canPrint && (
          <PrintPdfButton
            onPrint={handlePrint}
            label="Print PDF"
            disabled={loading || filteredRows.length === 0}
          />
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Sales</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                  <TableHead className="text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center">
                      <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No invoices found for the selected period.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRows.map((invoice) => {
                    const expanded = expandedIds.has(invoice.id);
                    return (
                      <Fragment key={invoice.id}>
                        <TableRow
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => toggleExpanded(invoice.id)}
                        >
                          <TableCell>
                            {expanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )}
                          </TableCell>
                          <TableCell className="font-medium">
                            {invoice.invoice_no}
                          </TableCell>
                          <TableCell>
                            {formatUiDate(invoice.invoice_date)}
                          </TableCell>
                          <TableCell>{invoice.customer_name}</TableCell>
                          <TableCell className="text-right">
                            {formatMoney(invoice.sales_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatMoney(invoice.cost_amount)}
                          </TableCell>
                          <TableCell
                            className={cn(
                              "text-right font-semibold",
                              invoice.profit_amount >= 0
                                ? "text-emerald-600"
                                : "text-red-600",
                            )}
                          >
                            {formatMoney(invoice.profit_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatPercent(invoice.margin_percent)}
                          </TableCell>
                        </TableRow>
                        {expanded && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/20 p-0">
                              <div className="overflow-x-auto p-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Part No</TableHead>
                                      <TableHead>Description</TableHead>
                                      <TableHead>Brand</TableHead>
                                      <TableHead className="text-right">
                                        Qty
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Unit Price
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Avg Cost
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Sales
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Cost
                                      </TableHead>
                                      <TableHead className="text-right">
                                        Profit
                                      </TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {invoice.items.map((item, index) => (
                                      <TableRow
                                        key={`${invoice.id}-${item.part_no}-${index}`}
                                      >
                                        <TableCell>{item.part_no}</TableCell>
                                        <TableCell>{item.description}</TableCell>
                                        <TableCell>
                                          {item.brand || "-"}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {item.quantity}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatMoney(item.unit_price)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatMoney(item.avg_cost)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatMoney(item.line_total)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {formatMoney(item.line_cost)}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            "text-right font-medium",
                                            item.line_profit >= 0
                                              ? "text-emerald-600"
                                              : "text-red-600",
                                          )}
                                        >
                                          {formatMoney(item.line_profit)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {!loading && filteredRows.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <TrendingUp className="h-4 w-4" />
          Profit = line sales − (avg cost × qty). Based on approved invoices in
          the selected date range.
        </div>
      )}
    </div>
  );
};
