import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Package,
  DollarSign,
  Hash,
  FolderOpen,
  AlertTriangle,
  Ban,
  RefreshCw,
  ClipboardEdit,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  LineChart,
  Line,
} from "recharts";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  onClick?: () => void;
  clickable?: boolean;
}

interface InventoryDashboardResponse {
  totalParts: number;
  activeParts: number;
  totalValue: number;
  totalQty: number;
  categoriesCount: number;
  lowStock: number;
  outOfStock: number;
  charts?: {
    categoryValueData: { name: string; value: number }[];
    categoryDistribution: { name: string; value: number; color: string }[];
    topBrandsByValue: { name: string; value: number }[];
    stockMovementData: { month: string; balance: number; stockIn: number; stockOut: number }[];
  };
}

const StatCard = ({ title, value, subtitle, icon: Icon, colorClass, bgClass, onClick, clickable }: StatCardProps) => (
  <Card
    className={`${bgClass} border-l-4 ${colorClass.replace('text-', 'border-l-')} ${clickable ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
    onClick={onClick}
  >
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide ${colorClass}`}>{title}</p>
          <p className={`text-2xl font-bold mt-1 ${colorClass}`}>{value}</p>
          <p className={`text-xs mt-1 ${colorClass} opacity-80`}>{subtitle}</p>
        </div>
        <div className={`p-3 rounded-full ${bgClass}`}>
          <Icon className={`w-6 h-6 ${colorClass}`} />
        </div>
      </div>
    </CardContent>
  </Card>
);

export const InventoryDashboard = () => {
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleString());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLowStockDialog, setShowLowStockDialog] = useState(false);
  const [showOutOfStockDialog, setShowOutOfStockDialog] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dashboard data state
  const [statsData, setStatsData] = useState({
    totalParts: 0,
    activeParts: 0,
    totalValue: 0,
    totalQty: 0,
    categories: 0,
    lowStock: 0,
    outOfStock: 0,
  });

  const [lowStockItems, setLowStockItems] = useState<{ id: string; partNo: string; name: string; category: string; qty: number; minQty: number; brand: string }[]>([]);
  const [outOfStockItems, setOutOfStockItems] = useState<{ id: string; partNo: string; name: string; category: string; qty: number; brand: string }[]>([]);
  const [topItemsByValue, setTopItemsByValue] = useState<{ id: string; partNo: string; name: string; brand: string; qty: number; value: number }[]>([]);
  const [topItemsByQty, setTopItemsByQty] = useState<{ id: string; partNo: string; name: string; brand: string; qty: number; value: number }[]>([]);

  // Chart data state
  const [categoryDistribution, setCategoryDistribution] = useState<{ name: string; value: number; color: string }[]>([]);
  const [categoryValueData, setCategoryValueData] = useState<{ name: string; value: number }[]>([]);
  const [stockMovementData, setStockMovementData] = useState<{ month: string; balance: number; stockIn: number; stockOut: number }[]>([]);
  const [topBrandsByValue, setTopBrandsByValue] = useState<{ name: string; value: number }[]>([]);
  const [storeDistribution, setStoreDistribution] = useState<{ store: string; items: number; qty: number; value: number; percentage: number }[]>([]);
  const [recentAdjustments, setRecentAdjustments] = useState<{ id: string; date: string; items: number; change: number }[]>([]);

  const fetchDashboardData = async () => {
    try {
      // Fetch dashboard stats
      const dashboardRes = await apiClient.getInventoryDashboard();
      // API returns data directly, not wrapped in data property
      const dashboardData = (dashboardRes.data || dashboardRes) as unknown as InventoryDashboardResponse;
      if (dashboardData) {
        setStatsData({
          totalParts: dashboardData.totalParts || 0,
          activeParts: dashboardData.activeParts || 0,
          totalValue: dashboardData.totalValue || 0,
          totalQty: dashboardData.totalQty || 0,
          categories: dashboardData.categoriesCount || 0,
          lowStock: dashboardData.lowStock || 0,
          outOfStock: dashboardData.outOfStock || 0,
        });

        // Set chart data if available
        if (dashboardData.charts) {
          setCategoryValueData(dashboardData.charts.categoryValueData || []);
          setCategoryDistribution(dashboardData.charts.categoryDistribution || []);
          setTopBrandsByValue(dashboardData.charts.topBrandsByValue || []);
          setStockMovementData(dashboardData.charts.stockMovementData || []);
        }
      }

      // Fetch stock balances for low stock and out of stock
      const [lowStockRes, outOfStockRes, balancesRes] = await Promise.all([
        apiClient.getStockBalances({ low_stock: true, limit: 100 }),
        apiClient.getStockBalances({ out_of_stock: true, limit: 100 }),
        apiClient.getStockBalances({ limit: 100 }),
      ]);

      // API returns data in data property
      const lowStockData = lowStockRes.data || [];
      const outOfStockData = outOfStockRes.data || [];
      const balancesData = balancesRes.data || [];

      if (lowStockData && Array.isArray(lowStockData)) {
        setLowStockItems(
          lowStockData.map((item: any) => ({
            id: item.part_id,
            partNo: item.part_no,
            name: item.description || item.part_no,
            category: item.category || '-',
            qty: item.current_stock,
            minQty: item.reorder_level || 0,
            brand: item.brand || '-',
          }))
        );
      }

      if (outOfStockData && Array.isArray(outOfStockData)) {
        setOutOfStockItems(
          outOfStockData.map((item: any) => ({
            id: item.part_id,
            partNo: item.part_no,
            name: item.description || item.part_no,
            category: item.category || '-',
            qty: item.current_stock,
            brand: item.brand || '-',
          }))
        );
      }

      if (balancesData && Array.isArray(balancesData)) {
        // Sort by value for top items by value
        const sortedByValue = [...balancesData]
          .filter((item: any) => item.value > 0)
          .sort((a: any, b: any) => b.value - a.value)
          .slice(0, 10)
          .map((item: any) => ({
            id: item.part_id,
            partNo: item.part_no,
            name: item.description || item.part_no,
            brand: item.brand || '-',
            qty: item.current_stock,
            value: item.value,
          }));
        setTopItemsByValue(sortedByValue);

        // Sort by quantity for top items by qty
        const sortedByQty = [...balancesData]
          .filter((item: any) => item.current_stock > 0)
          .sort((a: any, b: any) => b.current_stock - a.current_stock)
          .slice(0, 10)
          .map((item: any) => ({
            id: item.part_id,
            partNo: item.part_no,
            name: item.description || item.part_no,
            brand: item.brand || '-',
            qty: item.current_stock,
            value: item.value,
          }));
        setTopItemsByQty(sortedByQty);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || "Failed to fetch dashboard data",
        variant: "destructive",
      });
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey(prev => prev + 1);
    await fetchDashboardData();
    setIsRefreshing(false);
    setLastUpdated(new Date().toLocaleString());
    toast({
      title: "Data Refreshed",
      description: "Dashboard data has been updated successfully.",
    });
  };

  // Fetch data on mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const interval = setInterval(() => {
      fetchDashboardData();
    }, 5 * 60 * 1000); // 5 minutes

    return () => clearInterval(interval);
  }, []);

  return (
    <div key={refreshKey} className={`space-y-6 ${isRefreshing ? '' : 'animate-fade-in'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Inventory Dashboard</h1>
          <p className="text-muted-foreground text-sm">Real-time overview of your inventory operations</p>
          <p className="text-xs text-muted-foreground mt-1">Last updated: {lastUpdated}</p>
        </div>
        <Button
          onClick={handleRefresh}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          Refresh Data
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="TOTAL PARTS"
          value={statsData.totalParts}
          subtitle={`${statsData.activeParts} active`}
          icon={Package}
          colorClass="text-primary"
          bgClass="bg-primary/10 dark:bg-primary/20"
        />
        <StatCard
          title="TOTAL VALUE"
          value={`Rs ${statsData.totalValue.toLocaleString()}`}
          subtitle="inventory worth"
          icon={DollarSign}
          colorClass="text-green-600"
          bgClass="bg-green-50 dark:bg-green-950/30"
        />
        <StatCard
          title="TOTAL QTY"
          value={statsData.totalQty}
          subtitle="units in stock"
          icon={Hash}
          colorClass="text-blue-600"
          bgClass="bg-blue-50 dark:bg-blue-950/30"
        />
        <StatCard
          title="CATEGORIES"
          value={statsData.categories}
          subtitle="product types"
          icon={FolderOpen}
          colorClass="text-purple-600"
          bgClass="bg-purple-50 dark:bg-purple-950/30"
        />
        <StatCard
          title="LOW STOCK"
          value={statsData.lowStock}
          subtitle="need reorder"
          icon={AlertTriangle}
          colorClass="text-yellow-600"
          bgClass="bg-yellow-50 dark:bg-yellow-950/30"
          clickable
          onClick={() => setShowLowStockDialog(true)}
        />
        <StatCard
          title="OUT OF STOCK"
          value={statsData.outOfStock}
          subtitle="zero quantity"
          icon={Ban}
          colorClass="text-red-600"
          bgClass="bg-red-50 dark:bg-red-950/30"
          clickable
          onClick={() => setShowOutOfStockDialog(true)}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inventory Value by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Inventory Value by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {categoryValueData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryValueData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`Rs ${value.toLocaleString()}`, "Value"]}
                    />
                    <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No category value data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Parts Distribution by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Parts Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] flex items-center">
              <div className="w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      dataKey="value"
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {categoryDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-1/2 space-y-2">
                {categoryDistribution.map((item, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-muted-foreground truncate">{item.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Movement Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Stock Movement Trends (Last 6 Months)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {stockMovementData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stockMovementData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="balance" stroke="hsl(199, 89%, 48%)" strokeWidth={2} name="Balance" dot={{ fill: "hsl(199, 89%, 48%)" }} />
                    <Line type="monotone" dataKey="stockIn" stroke="hsl(142, 71%, 45%)" strokeWidth={2} name="Stock In" dot={{ fill: "hsl(142, 71%, 45%)" }} />
                    <Line type="monotone" dataKey="stockOut" stroke="hsl(0, 84%, 60%)" strokeWidth={2} name="Stock Out" dot={{ fill: "hsl(0, 84%, 60%)" }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No stock movement data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Brands by Value */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top Brands by Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {topBrandsByValue.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topBrandsByValue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                      }}
                      formatter={(value: number) => [`Rs ${value.toLocaleString()}`, "Value"]}
                    />
                    <Bar dataKey="value" fill="hsl(var(--chart-blue))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No brand data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 10 Items by Value */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top 10 Items by Inventory Value</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <ListNumberHeader />
                    <TableHead className="text-xs">Part No</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItemsByValue.map((item, index) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <ListNumberCell index={index} />
                      <TableCell className="text-xs font-medium">{item.partNo}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.brand}</TableCell>
                      <TableCell className="text-xs text-right">{item.qty}</TableCell>
                      <TableCell className="text-xs text-right text-green-600 font-medium">
                        Rs {item.value.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Top 10 Items by Quantity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Top 10 Items by Quantity</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[400px]">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                    <ListNumberHeader />
                    <TableHead className="text-xs">Part No</TableHead>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs text-right">Qty</TableHead>
                    <TableHead className="text-xs text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topItemsByQty.map((item, index) => (
                    <TableRow key={item.id} className="hover:bg-muted/50">
                      <ListNumberCell index={index} />
                      <TableCell className="text-xs font-medium">{item.partNo}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{item.name}</TableCell>
                      <TableCell className="text-xs">{item.brand}</TableCell>
                      <TableCell className="text-xs text-right font-medium text-blue-600">{item.qty}</TableCell>
                      <TableCell className="text-xs text-right">
                        Rs {item.value.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Store Distribution & Recent Adjustments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Stock Distribution by Store */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Stock Distribution by Store/Location</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead className="text-xs uppercase">Store/Location</TableHead>
                  <TableHead className="text-xs uppercase text-center">Items</TableHead>
                  <TableHead className="text-xs uppercase text-center">Total Quantity</TableHead>
                  <TableHead className="text-xs uppercase text-right">Value</TableHead>
                  <TableHead className="text-xs uppercase text-right">% of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeDistribution.map((store, index) => (
                  <TableRow key={index}>
                    <ListNumberCell index={index} />
                    <TableCell className="font-medium">{store.store}</TableCell>
                    <TableCell className="text-center">{store.items}</TableCell>
                    <TableCell className="text-center font-medium">{store.qty}</TableCell>
                    <TableCell className="text-right text-primary font-medium">
                      Rs {store.value.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Progress value={store.percentage} className="w-20 h-2" />
                        <span className="text-xs">{store.percentage.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Recent Inventory Adjustments */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Recent Inventory Adjustments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAdjustments.map((adjustment) => (
              <div
                key={adjustment.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/15 dark:bg-primary/20">
                    <ClipboardEdit className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">Adjustment #{adjustment.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {adjustment.date} • {adjustment.items} items
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-bold ${adjustment.change > 0 ? "text-green-600" : "text-red-600"}`}>
                    {adjustment.change > 0 ? "+" : ""}{adjustment.change}
                  </p>
                  <p className="text-xs text-muted-foreground">qty change</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Dialog */}
      <Dialog open={showLowStockDialog} onOpenChange={setShowLowStockDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-5 h-5" />
              Low Stock Items ({lowStockItems.length})
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-center">Current Qty</TableHead>
                <TableHead className="text-center">Min Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lowStockItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.partNo}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.brand}</TableCell>
                  <TableCell className="text-center text-yellow-600 font-medium">{item.qty}</TableCell>
                  <TableCell className="text-center">{item.minQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      {/* Out of Stock Dialog */}
      <Dialog open={showOutOfStockDialog} onOpenChange={setShowOutOfStockDialog}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Ban className="w-5 h-5" />
              Out of Stock Items ({outOfStockItems.length})
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Part No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Brand</TableHead>
                <TableHead className="text-center">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {outOfStockItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.partNo}</TableCell>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>{item.category}</TableCell>
                  <TableCell>{item.brand}</TableCell>
                  <TableCell className="text-center text-red-600 font-medium">{item.qty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};
