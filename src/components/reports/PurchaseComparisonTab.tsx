import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Download, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ComparisonData {
  supplier: string;
  currentPeriod: number;
  previousPeriod: number;
  change: number;
  items: number;
  avgDelivery: number;
}

const PurchaseComparisonTab = () => {
  const [period1Start, setPeriod1Start] = useState(""); 
  const [period1End, setPeriod1End] = useState("");
  const [period2Start, setPeriod2Start] = useState("");
  const [period2End, setPeriod2End] = useState("");
  const [comparisonData, setComparisonData] = useState<ComparisonData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!period1Start || !period1End || !period2Start || !period2End) {
      toast.error("Please select all period dates");
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getPurchaseComparison({
        period1_start: period1Start,
        period1_end: period1End,
        period2_start: period2Start,
        period2_end: period2End,
      });

      if (response.data && response.data.comparison) {
        setComparisonData(response.data.comparison);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const chartData = comparisonData.map(d => ({
    name: d.supplier.split(" ")[0],
    current: d.currentPeriod / 1000,
    previous: d.previousPeriod / 1000,
  }));

  const handleExport = () => {
    if (comparisonData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Supplier", "Current Period", "Previous Period", "Change", "Items", "Avg Delivery"];
    const success = exportToCSV(comparisonData, headers, `purchase-comparison.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const getTrendIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="w-4 h-4 text-success" />;
    if (change < 0) return <TrendingDown className="w-4 h-4 text-destructive" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Purchase Comparison</CardTitle>
              <p className="text-sm text-muted-foreground">Compare purchase data across different periods</p>
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
              <Label>Period 1 Start</Label>
              <Input type="date" value={period1Start} onChange={(e) => setPeriod1Start(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period 1 End</Label>
              <Input type="date" value={period1End} onChange={(e) => setPeriod1End(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period 2 Start</Label>
              <Input type="date" value={period2Start} onChange={(e) => setPeriod2Start(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Period 2 End</Label>
              <Input type="date" value={period2End} onChange={(e) => setPeriod2End(e.target.value)} />
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={fetchData} disabled={loading}>
              {loading ? "Loading..." : "Compare"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary">Current Period Total</p>
            <p className="text-2xl font-bold mt-1">Rs 0</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">Previous Period Total</p>
            <p className="text-2xl font-bold mt-1">Rs 0</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Change</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-1">
              <Minus className="w-5 h-5" />
              0%
            </p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning">Total Items</p>
            <p className="text-2xl font-bold mt-1">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Supplier Purchase Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={0}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}K`}
                />
                <Tooltip 
                  formatter={(value: number) => [`Rs ${(value * 1000).toLocaleString()}`, ""]}
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Legend />
                <Bar dataKey="current" name="Current Period" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="previous" name="Previous Period" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SUPPLIER</TableHead>
                <TableHead className="text-right">CURRENT PERIOD</TableHead>
                <TableHead className="text-right">PREVIOUS PERIOD</TableHead>
                <TableHead className="text-center">CHANGE</TableHead>
                <TableHead className="text-center">ITEMS</TableHead>
                <TableHead className="text-center">AVG DELIVERY (DAYS)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <p className="text-muted-foreground">Loading data...</p>
                  </TableCell>
                </TableRow>
              ) : comparisonData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <p className="text-muted-foreground">No data available. Select periods and click Compare.</p>
                  </TableCell>
                </TableRow>
              ) : (
                comparisonData.map((row) => (
                <TableRow key={row.supplier}>
                  <TableCell className="font-medium">{row.supplier}</TableCell>
                  <TableCell className="text-right">Rs {row.currentPeriod.toLocaleString()}</TableCell>
                  <TableCell className="text-right">Rs {row.previousPeriod.toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {getTrendIcon(row.change)}
                      <span className={row.change > 0 ? "text-success" : row.change < 0 ? "text-destructive" : ""}>
                        {row.change > 0 ? "+" : ""}{row.change}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">{row.items}</TableCell>
                  <TableCell className="text-center">{row.avgDelivery} days</TableCell>
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

export default PurchaseComparisonTab;
