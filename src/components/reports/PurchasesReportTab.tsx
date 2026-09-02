import { useState } from "react";
import { formatUiDate } from "@/utils/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Download, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface PurchaseRecord {
  id: string;
  date: string;
  poNumber: string;
  supplier: string;
  items: number;
  amount: number;
  status: "completed" | "pending" | "partial"; 
}

const PurchasesReportTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplier, setSupplier] = useState("all");
  const [purchaseData, setPurchaseData] = useState<PurchaseRecord[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const mockPurchaseData: PurchaseRecord[] = [];

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getPurchasesReport({
        from_date: fromDate,
        to_date: toDate,
        supplier_id: supplier !== "all" ? supplier : undefined,
      });

      if (response.data) {
        setPurchaseData(response.data);
        setIsGenerated(true);
        toast.success("Purchase report generated successfully");
      } else {
        toast.error(response.error || "Failed to generate report");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (purchaseData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Date", "PO Number", "Supplier", "Items", "Amount", "Status"];
    const success = exportToCSV(purchaseData, headers, `purchases-report-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const totalPurchases = purchaseData.reduce((sum, record) => sum + record.amount, 0);
  const totalOrders = purchaseData.length;
  const pendingOrders = purchaseData.filter(r => r.status === "pending").length;
  const completedOrders = purchaseData.filter(r => r.status === "completed").length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-success/10 text-success border-0">Completed</Badge>;
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
              <CardTitle className="text-lg">Purchases Report</CardTitle>
              <p className="text-sm text-muted-foreground">View and analyze all purchase transactions</p>
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
              <Label>Supplier</Label>
              <Select value={supplier} onValueChange={setSupplier}>
                <SelectTrigger>
                  <SelectValue placeholder="All Suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  <SelectItem value="toyota">Toyota Parts Supplier</SelectItem>
                  <SelectItem value="honda">Honda Genuine Parts</SelectItem>
                  <SelectItem value="suzuki">Suzuki Motors Ltd</SelectItem>
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
            <p className="text-xs font-medium text-primary">Total Purchases</p>
            <p className="text-2xl font-bold mt-1">PKR {totalPurchases.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Total Orders</p>
            <p className="text-2xl font-bold mt-1">{totalOrders}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning">Pending</p>
            <p className="text-2xl font-bold mt-1">{pendingOrders}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Completed</p>
            <p className="text-2xl font-bold mt-1">{completedOrders}</p>
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
                <TableHead>PO NUMBER</TableHead>
                <TableHead>SUPPLIER</TableHead>
                <TableHead className="text-center">ITEMS</TableHead>
                <TableHead className="text-right">AMOUNT</TableHead>
                <TableHead className="text-center">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchaseData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <BarChart3 className="w-10 h-10 opacity-50" />
                      <p>No purchase records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                purchaseData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} total={purchaseData.length} />
                    <TableCell>{formatUiDate(record.date) || record.date}</TableCell>
                    <TableCell className="font-medium">{record.poNumber}</TableCell>
                    <TableCell>{record.supplier}</TableCell>
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

export default PurchasesReportTab;
