import { formatUiDate } from "@/utils/dateUtils";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Download, Printer, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { openPrintHtml } from "@/utils/printUtils";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api";
import { usePageActions } from "@/permissions/pageActions";

interface OverdueInvoiceRow {
  id: string;
  customer: string;
  invoice_no: string;
  invoice_date: string;
  term: string;
  due_date: string;
  due_amount: number;
  payment_status: string;
}

const formatTermDisplay = (term: string) => {
  const raw = String(term || "").trim();
  if (!raw) return "-";
  return `${raw} days credit`;
};

export const DistributorAging = () => {
  const { canExport, canPrint } = usePageActions("sales.distributor-aging");
  const [agingData, setAgingData] = useState<OverdueInvoiceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"due_date" | "due_amount" | "invoice_date">("due_date");
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(new Date());

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getCustomerAgingOverdueInvoices({
        from_date: fromDate ? format(fromDate, "yyyy-MM-dd") : undefined,
        to_date: toDate ? format(toDate, "yyyy-MM-dd") : undefined,
        search: searchTerm.trim() || undefined,
        sort_by: sortBy,
      });
      setAgingData((response as any)?.data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load aging report",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromDate, toDate, sortBy]);

  const filteredData = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return agingData;
    return agingData.filter((row) => {
      const haystack = `${row.customer} ${row.invoice_no}`
        .trim()
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [agingData, searchTerm]);
  const totalDue = useMemo(
    () => filteredData.reduce((sum, row) => sum + Number(row.due_amount || 0), 0),
    [filteredData],
  );

  const handleExport = () => {
    const headers = ["Customer", "Invoice Number", "Invoice Date", "Term", "Due Date", "Due Amount", "Payment Status"];
    const rows = filteredData.map((item) => [
      item.customer,
      item.invoice_no,
      formatUiDate(new Date(item.invoice_date)),
      formatTermDisplay(item.term),
      formatUiDate(new Date(item.due_date)),
      item.due_amount,
      item.payment_status,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `aging_report_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report Exported",
      description: "Overdue term report exported to CSV.",
    });
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Aging Report - ${formatUiDate(new Date())}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            .summary { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .summary-card { padding: 10px 15px; border-radius: 8px; color: white; text-align: center; min-width: 120px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            td:first-child, th:first-child { text-align: left; }
            .text-green { color: #22c55e; }
            .text-yellow { color: #eab308; }
            .text-orange { color: #1664da; }
            .text-red { color: #ef4444; }
            .footer-row { background-color: #f5f5f5; font-weight: bold; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>Overdue Invoices by Term</h1>
          <p style="text-align: center; color: #666;">Generated on ${formatUiDate(new Date())} ${format(new Date(), 'HH:mm')}</p>

          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Invoice No</th>
                <th>Invoice Date</th>
                <th>Term</th>
                <th>Due Date</th>
                <th>Due Amount</th>
                <th>Payment Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => `
                <tr>
                  <td>${item.customer}</td>
                  <td>${item.invoice_no}</td>
                  <td>${formatUiDate(new Date(item.invoice_date))}</td>
                  <td>${formatTermDisplay(item.term)}</td>
                  <td>${formatUiDate(new Date(item.due_date))}</td>
                  <td><strong>Rs. ${Number(item.due_amount || 0).toLocaleString()}</strong></td>
                  <td>${item.payment_status}</td>
                </tr>
              `).join("")}
              <tr class="footer-row">
                <td colspan="6" style="text-align: right;"><strong>TOTAL DUE:</strong></td>
                <td><strong>Rs. ${totalDue.toLocaleString()}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    openPrintHtml(printContent);

    toast({
      title: "Print Initiated",
      description: "Print dialog opened.",
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="bg-[#1e3a5f] border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Total Overdue Amount</p>
            <p className="text-xl font-bold text-white">Rs. {totalDue.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-primary border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Overdue Invoices</p>
            <p className="text-xl font-bold text-white">{filteredData.length}</p>
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

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">From:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-32 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? formatUiDate(fromDate) : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={setFromDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">To:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-32 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? formatUiDate(toDate) : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={setToDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button onClick={fetchData} variant="outline" className="gap-2">
            <Search className="w-4 h-4" />
            Apply
          </Button>
          {canExport && (
            <Button onClick={handleExport} variant="outline" className="gap-2 border-green-500 text-green-600 hover:bg-green-50">
              <Download className="w-4 h-4" />
              Export Excel
            </Button>
          )}
          {canPrint && <PrintPdfButton onPrint={handlePrint} label="Print" />}
        </div>
      </div>

      {/* Aging Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Overdue Invoices (Term Date Reached & Not Paid) ({filteredData.length})
          </CardTitle>
          <div className="text-sm text-muted-foreground">
            Sorted by: {sortBy.replace("_", " ")}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <ListNumberHeader />
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Invoice Number</TableHead>
                  <TableHead className="font-semibold">Invoice Date</TableHead>
                  <TableHead className="font-semibold">Term</TableHead>
                  <TableHead className="font-semibold">Due Date</TableHead>
                  <TableHead className="text-right font-semibold">Due Amount</TableHead>
                  <TableHead className="font-semibold">Payment Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No overdue unpaid invoices found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, index) => (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <ListNumberCell index={index} total={filteredData.length} />
                      <TableCell className="font-medium text-foreground">{item.customer}</TableCell>
                      <TableCell>{item.invoice_no}</TableCell>
                      <TableCell>{formatUiDate(new Date(item.invoice_date))}</TableCell>
                      <TableCell>{formatTermDisplay(item.term)}</TableCell>
                      <TableCell>{formatUiDate(new Date(item.due_date))}</TableCell>
                      <TableCell className="text-right font-semibold">
                        Rs. {Number(item.due_amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="capitalize">{item.payment_status}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
