import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Download, Clock, AlertTriangle, Send } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";
import { useEffect } from "react";

interface AgingData {
  id: string;
  customer: string;
  type: "customer" | "distributor";
  current: number; 
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

const CustomerAgingTab = () => {
  const [customerType, setCustomerType] = useState("all");
  const [sortBy, setSortBy] = useState("total");

  const [agingData, setAgingData] = useState<AgingData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getCustomerAging({
        customer_type: customerType !== "all" ? customerType : undefined,
        sort_by: sortBy,
      });

      if (response.data) {
        setAgingData(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [customerType, sortBy]);

  const summaryData = {
    totalOutstanding: agingData.reduce((sum, d) => sum + d.total, 0),
    current: agingData.reduce((sum, d) => sum + d.current, 0),
    overdue30: agingData.reduce((sum, d) => sum + d.days30, 0),
    overdue60: agingData.reduce((sum, d) => sum + d.days60, 0),
    overdue90: agingData.reduce((sum, d) => sum + d.days90 + d.over90, 0),
  };

  const handleExport = () => {
    if (agingData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Customer", "Type", "Current", "30-60 Days", "60-90 Days", "90+ Days", "Total"];
    const success = exportToCSV(agingData, headers, `customer-aging-${customerType}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const handleSendReminder = (customer: string) => {
    toast.success(`Reminder sent to ${customer}`);
  };

  const getAgingBadge = (data: AgingData) => {
    if (data.over90 > 0) return <Badge className="bg-destructive/10 text-destructive border-0">Critical</Badge>;
    if (data.days90 > 0) return <Badge className="bg-warning/10 text-warning border-0">High Risk</Badge>;
    if (data.days60 > 0) return <Badge className="bg-info/10 text-info border-0">Monitor</Badge>;
    if (data.days30 > 0) return <Badge className="bg-muted text-muted-foreground border-0">Mild</Badge>;
    return <Badge className="bg-success/10 text-success border-0">Current</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Customer/Distributor Aging</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze receivables by aging period</p>
            </div>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={customerType} onValueChange={setCustomerType}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="customer">Customers</SelectItem>
                <SelectItem value="distributor">Distributors</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="total">Sort by Total</SelectItem>
                <SelectItem value="over90">Sort by 90+ Days</SelectItem>
                <SelectItem value="name">Sort by Name</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary">Total Outstanding</p>
            <p className="text-xl font-bold mt-1">Rs {summaryData.totalOutstanding.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Current (0-30)</p>
            <p className="text-xl font-bold mt-1">Rs {summaryData.current.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">30-60 Days</p>
            <p className="text-xl font-bold mt-1">Rs {summaryData.overdue30.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning">60-90 Days</p>
            <p className="text-xl font-bold mt-1">Rs {summaryData.overdue60.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive">90+ Days</p>
            <p className="text-xl font-bold mt-1">Rs {summaryData.overdue90.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CUSTOMER/DISTRIBUTOR</TableHead>
                <TableHead>TYPE</TableHead>
                <TableHead className="text-right">CURRENT</TableHead>
                <TableHead className="text-right">30-60 DAYS</TableHead>
                <TableHead className="text-right">60-90 DAYS</TableHead>
                <TableHead className="text-right">90+ DAYS</TableHead>
                <TableHead className="text-right">TOTAL</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="text-center">ACTION</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agingData.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.customer}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">{row.type}</Badge>
                  </TableCell>
                  <TableCell className="text-right">Rs {row.current.toLocaleString()}</TableCell>
                  <TableCell className={`text-right ${row.days30 > 0 ? "text-info" : ""}`}>
                    Rs {row.days30.toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right ${row.days60 > 0 ? "text-warning" : ""}`}>
                    Rs {row.days60.toLocaleString()}
                  </TableCell>
                  <TableCell className={`text-right ${(row.days90 + row.over90) > 0 ? "text-destructive font-medium" : ""}`}>
                    Rs {(row.days90 + row.over90).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-medium">Rs {row.total.toLocaleString()}</TableCell>
                  <TableCell>{getAgingBadge(row)}</TableCell>
                  <TableCell className="text-center">
                    {row.total > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleSendReminder(row.customer)}
                      >
                        <Send className="w-4 h-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomerAgingTab;
