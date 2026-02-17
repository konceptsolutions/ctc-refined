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
import { Download, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";
import { useEffect } from "react";

interface SalesTypeData {
  type: string;
  transactions: number;
  totalAmount: number;
  avgTransaction: number; 
  profit: number;
  percentage: number;
}

const SalesByTypeTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [salesType, setSalesType] = useState("all");
  const [salesData, setSalesData] = useState<SalesTypeData[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const mockData: SalesTypeData[] = [
    { type: "Cash Sales", transactions: 245, totalAmount: 1850000, avgTransaction: 7551, profit: 407000, percentage: 35 },
    { type: "Credit Sales", transactions: 180, totalAmount: 2450000, avgTransaction: 13611, profit: 539000, percentage: 45 },
    { type: "Online Sales", transactions: 85, totalAmount: 680000, avgTransaction: 8000, profit: 149600, percentage: 12 },
    { type: "Wholesale", transactions: 45, totalAmount: 320000, avgTransaction: 7111, profit: 70400, percentage: 6 },
    { type: "Retail", transactions: 12, totalAmount: 95000, avgTransaction: 7917, profit: 20900, percentage: 2 },
  ];

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getSalesByType({
        from_date: fromDate,
        to_date: toDate,
      });

      if (response.data) {
        setSalesData(response.data);
        setIsGenerated(true);
        toast.success("Sales by type report generated");
      } else {
        toast.error(response.error || "Failed to generate report");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (salesData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Type", "Transactions", "Total Amount", "Avg Transaction", "Profit", "Percentage"];
    const success = exportToCSV(salesData, headers, `sales-by-type-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const summaryCards = [
    { label: "Cash Sales", value: "PKR 0.00", color: "bg-primary/5 border-primary/20", textColor: "text-primary" },
    { label: "Credit Sales", value: "PKR 0.00", color: "bg-info/5 border-info/20", textColor: "text-info" },
    { label: "Online Sales", value: "PKR 0.00", color: "bg-destructive/5 border-destructive/20", textColor: "text-destructive" },
    { label: "Wholesale", value: "PKR 0.00", color: "bg-warning/5 border-warning/20", textColor: "text-warning" },
    { label: "Retail", value: "PKR 0.00", color: "bg-success/5 border-success/20", textColor: "text-success" },
  ];

  const getUpdatedSummary = () => {
    if (!isGenerated) return summaryCards;
    return [
      { label: "Cash Sales", value: `PKR ${mockData[0].totalAmount.toLocaleString()}`, color: "bg-primary/5 border-primary/20", textColor: "text-primary" },
      { label: "Credit Sales", value: `PKR ${mockData[1].totalAmount.toLocaleString()}`, color: "bg-info/5 border-info/20", textColor: "text-info" },
      { label: "Online Sales", value: `PKR ${mockData[2].totalAmount.toLocaleString()}`, color: "bg-destructive/5 border-destructive/20", textColor: "text-destructive" },
      { label: "Wholesale", value: `PKR ${mockData[3].totalAmount.toLocaleString()}`, color: "bg-warning/5 border-warning/20", textColor: "text-warning" },
      { label: "Retail", value: `PKR ${mockData[4].totalAmount.toLocaleString()}`, color: "bg-success/5 border-success/20", textColor: "text-success" },
    ];
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Sales Type Report</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze sales by different transaction types</p>
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
              <Label>Sales Type</Label>
              <Select value={salesType} onValueChange={setSalesType}>
                <SelectTrigger>
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="cash">Cash Sales</SelectItem>
                  <SelectItem value="credit">Credit Sales</SelectItem>
                  <SelectItem value="online">Online Sales</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                  <SelectItem value="retail">Retail</SelectItem>
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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {getUpdatedSummary().map((card, index) => (
          <Card key={index} className={card.color}>
            <CardContent className="p-4">
              <p className={`text-xs font-medium ${card.textColor}`}>{card.label}</p>
              <p className="text-xl font-bold mt-1">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SALES TYPE</TableHead>
                <TableHead className="text-center">TRANSACTIONS</TableHead>
                <TableHead className="text-right">TOTAL AMOUNT</TableHead>
                <TableHead className="text-right">AVG TRANSACTION</TableHead>
                <TableHead className="text-right">PROFIT</TableHead>
                <TableHead className="text-center">% OF TOTAL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {salesData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <BarChart3 className="w-10 h-10 opacity-50" />
                      <p>No sales type data found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                salesData.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="font-medium">{row.type}</TableCell>
                    <TableCell className="text-center">{row.transactions}</TableCell>
                    <TableCell className="text-right">Rs {row.totalAmount.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs {row.avgTransaction.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-success">Rs {row.profit.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{row.percentage}%</TableCell>
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

export default SalesByTypeTab;
