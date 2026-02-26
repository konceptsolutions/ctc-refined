import { useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Download, FileText, Calendar } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";

interface SalesRecord {
  id: string;
  date: string;
  invoiceNo: string;
  customer: string;
  items: number;
  amount: number;
  status: "paid" | "pending" | "partial"; 
}

const SalesReportTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customer, setCustomer] = useState("all");
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [loading, setLoading] = useState(false);

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

  const totalSales = salesData.reduce((sum, record) => sum + record.amount, 0);
  const totalInvoices = salesData.length;
  const pendingPayment = salesData.filter(r => r.status !== "paid").reduce((sum, r) => sum + r.amount, 0);
  const profit = totalSales * 0.22;

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
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="auto-parts">Auto Parts Karachi</SelectItem>
                  <SelectItem value="honda-plaza">Honda Plaza Lahore</SelectItem>
                  <SelectItem value="toyota-center">Toyota Center</SelectItem>
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
            <p className="text-2xl font-bold mt-1">PKR {totalSales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Total Invoices</p>
            <p className="text-2xl font-bold mt-1">{totalInvoices}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive">Pending Payment</p>
            <p className="text-2xl font-bold mt-1">PKR {pendingPayment.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Profit</p>
            <p className="text-2xl font-bold mt-1">PKR {profit.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <FileText className="w-10 h-10 opacity-50" />
                      <p>No sales records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                salesData.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{record.date}</TableCell>
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
