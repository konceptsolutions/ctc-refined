import { useState, useEffect } from "react";
import { formatUiDate } from "@/utils/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";

interface SalesRecord {
  id: string;
  date: string;
  invoiceNo: string;
  customer: string;
  items: number;
  amount: number;
  profit?: number;
  status: "paid" | "pending" | "partial"; 
}

interface CustomerOption {
  id: string;
  name: string;
}

const SalesReportTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customer, setCustomer] = useState("all");
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalInvoices: 0,
    pendingPayment: 0,
    profit: 0,
  });
  const [isGenerated, setIsGenerated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    const loadCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const response = (await apiClient.getCustomers({
          status: "active",
          limit: 2000,
        })) as any;
        const rows = Array.isArray(response)
          ? response
          : response.data || [];
        const formatted: CustomerOption[] = (Array.isArray(rows) ? rows : [])
          .map((c: any) => ({
            id: String(c.id),
            name: String(c.name || "").trim(),
          }))
          .filter(
            (c: CustomerOption) =>
              c.id && c.name && !c.name.toLowerCase().includes("demo"),
          )
          .sort((a: CustomerOption, b: CustomerOption) =>
            a.name.localeCompare(b.name),
          );
        setCustomers(formatted);
      } catch {
        toast.error("Failed to load customers");
      } finally {
        setLoadingCustomers(false);
      }
    };
    loadCustomers();
  }, []);

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getSalesReport({
        from_date: fromDate,
        to_date: toDate,
        customer_id: customer !== "all" ? customer : undefined,
      });

      if (response.data) {
        setSalesData(response.data);
        const s = (response as any).summary;
        if (s) {
          setSummary({
            totalSales: Number(s.totalSales) || 0,
            totalInvoices: Number(s.totalInvoices) || 0,
            pendingPayment: Number(s.pendingPayment) || 0,
            profit: Number(s.profit) || 0,
          });
        } else {
          const totalSales = response.data.reduce(
            (sum: number, r: SalesRecord) => sum + (r.amount || 0),
            0,
          );
          setSummary({
            totalSales,
            totalInvoices: response.data.length,
            pendingPayment: response.data
              .filter((r: SalesRecord) => r.status !== "paid")
              .reduce((sum: number, r: SalesRecord) => sum + (r.amount || 0), 0),
            profit: response.data.reduce(
              (sum: number, r: SalesRecord) => sum + (r.profit || 0),
              0,
            ),
          });
        }
        setIsGenerated(true);
        toast.success("Report generated successfully");
      } else {
        toast.error(response.error || "Failed to generate report");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (salesData.length === 0) {
      toast.error("No data to export");
      return;
    }

    try {
      const headers = ["Date", "Invoice #", "Customer", "Items", "Amount", "Status"];
      const rows = salesData.map(record => [
        record.date,
        record.invoiceNo,
        record.customer,
        record.items.toString(),
        record.amount.toString(),
        record.status,
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `sales-report-${fromDate}-to-${toDate}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Report exported successfully");
    } catch (error) {
      toast.error("Failed to export report");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-success/10 text-success border-0">Paid</Badge>;
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-0">Pending</Badge>;
      case "partial":
        return <Badge className="bg-info/10 text-info border-0">Partial</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Sales Report</CardTitle>
              <p className="text-sm text-muted-foreground">View and analyze all sales transactions</p>
            </div>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input 
                type="date" 
                value={fromDate} 
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input 
                type="date" 
                value={toDate} 
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Customer</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingCustomers ? "Loading..." : "All Customers"} />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerateReport} className="w-full" disabled={loading}>
                {loading ? "Generating..." : "Generate Report"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary">Total Sales</p>
            <p className="text-2xl font-bold mt-1">
              Rs {isGenerated ? summary.totalSales.toLocaleString() : "0"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Total Invoices</p>
            <p className="text-2xl font-bold mt-1">
              {isGenerated ? summary.totalInvoices : 0}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive">Pending Payment</p>
            <p className="text-2xl font-bold mt-1">
              Rs {isGenerated ? summary.pendingPayment.toLocaleString() : "0"}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Profit</p>
            <p className="text-2xl font-bold mt-1">
              Rs {isGenerated ? summary.profit.toLocaleString() : "0"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>DATE</TableHead>
                <TableHead>INVOICE #</TableHead>
                <TableHead>CUSTOMER</TableHead>
                <TableHead className="text-center">ITEMS</TableHead>
                <TableHead className="text-right">AMOUNT</TableHead>
                <TableHead className="text-center">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="w-10 h-10 opacity-50" />
                      <p>No sales records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                salesData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} total={salesData.length} />
                    <TableCell>{formatUiDate(record.date) || record.date}</TableCell>
                    <TableCell className="font-medium">{record.invoiceNo}</TableCell>
                    <TableCell>{record.customer}</TableCell>
                    <TableCell className="text-center">{record.items}</TableCell>
                    <TableCell className="text-right font-medium">
                      Rs {record.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SalesReportTab;
