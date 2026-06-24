import { useState, useEffect } from "react";
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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import apiClient from "@/lib/api";

type PeriodType = "daily" | "monthly" | "yearly";

interface PeriodData {
  period: string;
  grossSales: number;
  orders: number;
  returns: number;
  netSales: number;
  profit: number;
  margin: number; 
  avgOrder: number;
}

const PeriodicSalesTab = () => {
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [monthlyData, setMonthlyData] = useState<PeriodData[]>([]);
  const [summaryData, setSummaryData] = useState({
    totalSales: "0",
    totalOrders: "0",
    returns: "0",
    totalProfit: "0",
    avgMargin: "0%",
    avgOrder: "0",
  });
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getPeriodicSales({
        period_type: periodType,
        year: year,
      });

      if (response.data) {
        setMonthlyData(response.data);
        
        // Calculate summary
        const total = response.data.reduce((acc: any, period: PeriodData) => ({
          grossSales: acc.grossSales + period.grossSales,
          orders: acc.orders + period.orders,
          returns: acc.returns + period.returns,
          profit: acc.profit + period.profit,
        }), { grossSales: 0, orders: 0, returns: 0, profit: 0 });

        setSummaryData({
          totalSales: `Rs ${total.grossSales.toLocaleString()}`,
          totalOrders: total.orders.toString(),
          returns: `Rs ${total.returns.toLocaleString()}`,
          totalProfit: `Rs ${total.profit.toLocaleString()}`,
          avgMargin: response.data.length > 0 
            ? `${(response.data.reduce((sum: number, p: PeriodData) => sum + p.margin, 0) / response.data.length).toFixed(1)}%`
            : "0%",
          avgOrder: response.data.length > 0 && total.orders > 0
            ? `Rs ${Math.round(total.grossSales / total.orders).toLocaleString()}`
            : "0",
        });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [periodType, year]);

  const handleExport = () => {
    if (monthlyData.length === 0) {
      toast.error("No data to export");
      return;
    }

    try {
      const headers = ["Period", "Gross Sales", "Orders", "Returns", "Net Sales", "Profit", "Margin", "Avg Order"];
      const rows = monthlyData.map(period => [
        period.period,
        period.grossSales.toString(),
        period.orders.toString(),
        period.returns.toString(),
        period.netSales.toString(),
        period.profit.toString(),
        `${period.margin}%`,
        period.avgOrder.toString(),
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `periodic-sales-${periodType}-${year}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast.success("Report exported successfully");
    } catch (error) {
      toast.error("Failed to export report");
    }
  };

  const chartData = monthlyData.map(d => ({
    name: d.period,
    sales: d.grossSales / 1000000,
  }));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Periodic Sales Report</CardTitle>
              <p className="text-sm text-muted-foreground">View sales performance by day, month, or year</p>
            </div>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Period Toggle */}
            <div className="flex gap-1 bg-muted rounded-lg p-1">
              {(["daily", "monthly", "yearly"] as PeriodType[]).map((type) => (
                <Button
                  key={type}
                  variant={periodType === type ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setPeriodType(type)}
                  className={periodType === type ? "bg-primary" : ""}
                >
                  {type.charAt(0).toUpperCase() + type.slice(1)}
                </Button>
              ))}
            </div>

            <div className="flex gap-2">
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={fetchData} disabled={loading}>
                {loading ? "Loading..." : "Generate"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary uppercase">Total Sales</p>
            <p className="text-2xl font-bold mt-1">{summaryData.totalSales}</p>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +12.5% vs prev
            </p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info uppercase">Total Orders</p>
            <p className="text-2xl font-bold mt-1">{summaryData.totalOrders}</p>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +8.2% vs prev
            </p>
          </CardContent>
        </Card>
        <Card className="bg-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-destructive uppercase">Returns</p>
            <p className="text-2xl font-bold mt-1">{summaryData.returns}</p>
            <p className="text-xs text-destructive flex items-center gap-1 mt-1">
              <TrendingDown className="w-3 h-3" /> -3.1% vs prev
            </p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success uppercase">Total Profit</p>
            <p className="text-2xl font-bold mt-1">{summaryData.totalProfit}</p>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +15.3% vs prev
            </p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning uppercase">Avg Margin</p>
            <p className="text-2xl font-bold mt-1">{summaryData.avgMargin}</p>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +0.5% vs prev
            </p>
          </CardContent>
        </Card>
        <Card className="bg-chart-purple/5 border-chart-purple/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-chart-purple uppercase">Avg Order</p>
            <p className="text-2xl font-bold mt-1">{summaryData.avgOrder}</p>
            <p className="text-xs text-success flex items-center gap-1 mt-1">
              <TrendingUp className="w-3 h-3" /> +4.2% vs prev
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Sales Trend Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sales Trend - Monthly View</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `${value}M`}
                />
                <Tooltip 
                  formatter={(value: number) => [`Rs ${(value * 1000000).toLocaleString()}`, "Sales"]}
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--card))", 
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Monthly Breakdown Table */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Monthly Breakdown</CardTitle>
            <Button variant="ghost" size="sm">
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>PERIOD</TableHead>
                <TableHead className="text-right">GROSS SALES</TableHead>
                <TableHead className="text-right">ORDERS</TableHead>
                <TableHead className="text-right">RETURNS</TableHead>
                <TableHead className="text-right">NET SALES</TableHead>
                <TableHead className="text-right">PROFIT</TableHead>
                <TableHead className="text-center">MARGIN</TableHead>
                <TableHead className="text-right">AVG ORDER</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <p className="text-muted-foreground">Loading data...</p>
                  </TableCell>
                </TableRow>
              ) : monthlyData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <p className="text-muted-foreground">No data available</p>
                  </TableCell>
                </TableRow>
              ) : (
                monthlyData.map((row, index) => (
                <TableRow key={row.period}>
                  <ListNumberCell index={index} />
                  <TableCell className="font-medium">{row.period}</TableCell>
                  <TableCell className="text-right">Rs {row.grossSales.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{row.orders}</TableCell>
                  <TableCell className="text-right text-destructive">-Rs {row.returns.toLocaleString()}</TableCell>
                  <TableCell className="text-right">Rs {row.netSales.toLocaleString()}</TableCell>
                  <TableCell className="text-right text-success">Rs {row.profit.toLocaleString()}</TableCell>
                  <TableCell className="text-center">
                    <Badge className="bg-success/10 text-success border-0">{row.margin}%</Badge>
                  </TableCell>
                  <TableCell className="text-right">Rs {row.avgOrder.toLocaleString()}</TableCell>
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

export default PeriodicSalesTab;
