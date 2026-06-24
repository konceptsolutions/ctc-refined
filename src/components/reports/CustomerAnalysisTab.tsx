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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Download, Users } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface CustomerData {
  id: string;
  customer: string;
  contact: string;
  totalOrders: number;
  totalSales: number;
  balanceDue: number; 
  lastOrder: string;
}

const CustomerAnalysisTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [customer, setCustomer] = useState("all");
  const [customerData, setCustomerData] = useState<CustomerData[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const mockCustomerData: CustomerData[] = [];

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getCustomerAnalysis({
        from_date: fromDate,
        to_date: toDate,
        customer_id: customer !== "all" ? customer : undefined,
      });

      if (response.data) {
        setCustomerData(response.data);
        setIsGenerated(true);
        toast.success("Customer analysis report generated");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (customerData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Customer", "Contact", "Total Orders", "Total Sales", "Balance Due", "Last Order"];
    const success = exportToCSV(customerData, headers, `customer-analysis-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const totalCustomers = customerData.length;
  const totalSales = customerData.reduce((sum, c) => sum + c.totalSales, 0);
  const totalReceivables = customerData.reduce((sum, c) => sum + c.balanceDue, 0);
  const topCustomer = customerData.length > 0 
    ? customerData.reduce((max, c) => c.totalSales > max.totalSales ? c : max).customer 
    : "-";

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Customer Wise Report</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze sales and transactions by customer</p>
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
              <Button onClick={handleGenerateReport} className="w-full">
                Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary">Total Customers</p>
            <p className="text-2xl font-bold mt-1">{totalCustomers}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Total Sales</p>
            <p className="text-2xl font-bold mt-1">PKR {totalSales.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive">Receivables</p>
            <p className="text-2xl font-bold mt-1">PKR {totalReceivables.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Top Customer</p>
            <p className="text-lg font-bold mt-1 truncate">{topCustomer}</p>
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
                <TableHead>CUSTOMER</TableHead>
                <TableHead>CONTACT</TableHead>
                <TableHead className="text-center">TOTAL ORDERS</TableHead>
                <TableHead className="text-right">TOTAL SALES</TableHead>
                <TableHead className="text-right">BALANCE DUE</TableHead>
                <TableHead>LAST ORDER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customerData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="w-10 h-10 opacity-50" />
                      <p>No customer data found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customerData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} />
                    <TableCell className="font-medium">{record.customer}</TableCell>
                    <TableCell>{record.contact}</TableCell>
                    <TableCell className="text-center">{record.totalOrders}</TableCell>
                    <TableCell className="text-right">Rs {record.totalSales.toLocaleString()}</TableCell>
                    <TableCell className={`text-right ${record.balanceDue > 0 ? "text-destructive" : "text-success"}`}>
                      Rs {record.balanceDue.toLocaleString()}
                    </TableCell>
                    <TableCell>{record.lastOrder}</TableCell>
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

export default CustomerAnalysisTab;
