import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Package,
  AlertTriangle,
  DollarSign,
  FileText,
  CreditCard,
  Eye
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import apiClient from "@/lib/api";

interface MetricCard {
  title: string;
  value: string;
  change: string;
  changeType: "up" | "down";
  color: string;
}

interface TopSellingItem {
  rank: number;
  name: string;
  units: number;
  value: number; 
}

interface ActivityItem {
  id: string;
  type: "invoice" | "payment" | "order" | "stock";
  title: string;
  subtitle: string;
  amount: number;
  time: string;
}

const RealTimeDashboard = () => {
  const [isLive, setIsLive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [hourlyData, setHourlyData] = useState<{ time: string; sales: number }[]>([]);
  const [topSelling, setTopSelling] = useState<TopSellingItem[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [metricsRes, hourlyRes, topSellingRes, activityRes] = await Promise.all([
        apiClient.getDashboardMetrics() as any,
        apiClient.getHourlySales() as any,
        apiClient.getTopSelling(10) as any,
        apiClient.getRecentActivity(10) as any,
      ]);

      if (metricsRes.data) {
        const m = metricsRes.data;
        setMetrics([
          {
            title: "Today's Sales",
            value: `Rs ${(m.todaysSales || 0).toLocaleString()}`,
            change: `${m.salesChange || 0}% vs yesterday`,
            changeType: parseFloat(m.salesChange || '0') >= 0 ? "up" : "down",
            color: "text-primary"
          },
          {
            title: "Today's Orders",
            value: (m.todaysOrders || 0).toString(),
            change: `${m.ordersChange || 0}% vs yesterday`,
            changeType: parseFloat(m.ordersChange || '0') >= 0 ? "up" : "down",
            color: "text-foreground"
          },
          {
            title: "Today's Purchases",
            value: `Rs ${(m.todaysPurchases || 0).toLocaleString()}`,
            change: `${m.salesChange || 0}% vs yesterday`,
            changeType: parseFloat(m.salesChange || '0') >= 0 ? "up" : "down",
            color: "text-primary"
          },
          {
            title: "Pending Orders",
            value: (m.pendingOrders || 0).toString(),
            change: "0% vs yesterday",
            changeType: "down",
            color: "text-foreground"
          },
          {
            title: "Low Stock Items",
            value: (m.lowStockItems || 0).toString(),
            change: "0% vs yesterday",
            changeType: "down",
            color: "text-foreground"
          },
          {
            title: "Today's Profit",
            value: `Rs ${(m.todaysProfit || 0).toLocaleString()}`,
            change: `${m.profitChange || 0}% vs yesterday`,
            changeType: parseFloat(m.profitChange || '0') >= 0 ? "up" : "down",
            color: "text-success"
          },
        ]);
      }

      if (hourlyRes.data) {
        setHourlyData(hourlyRes.data);
      }

      if (topSellingRes.data) {
        setTopSelling(topSellingRes.data);
      }

      if (activityRes.data) {
        setRecentActivity(activityRes.data);
      }

      setLastUpdated(new Date());
    } catch (error) {
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (isLive) {
      const interval = setInterval(() => {
        fetchData();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [isLive]);

  const handleRefresh = () => {
    fetchData();
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case "invoice": return <FileText className="w-4 h-4" />;
      case "payment": return <CreditCard className="w-4 h-4" />;
      case "order": return <ShoppingCart className="w-4 h-4" />;
      case "stock": return <AlertTriangle className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return "bg-primary text-primary-foreground";
      case 2: return "bg-muted text-foreground";
      case 3: return "bg-warning/20 text-warning";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Real-Time Header */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Real-Time Dashboard</CardTitle>
              <p className="text-sm text-muted-foreground">Live business metrics and activity feed</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch checked={isLive} onCheckedChange={setIsLive} />
                <span className="flex items-center gap-1 text-sm">
                  <span className={`w-2 h-2 rounded-full ${isLive ? "bg-success animate-pulse" : "bg-muted"}`} />
                  Live
                </span>
              </div>
              <span className="text-sm text-muted-foreground">
                Last updated: {lastUpdated.toLocaleTimeString()}
              </span>
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {metrics.map((metric, index) => (
          <Card key={index}>
            <CardContent className="p-4">
              <p className="text-xs font-medium text-primary">{metric.title}</p>
              <p className={`text-xl font-bold mt-1 ${metric.color}`}>{metric.value}</p>
              <div className="flex items-center gap-1 mt-2">
                {metric.changeType === "up" ? (
                  <TrendingUp className="w-3 h-3 text-success" />
                ) : (
                  <TrendingDown className="w-3 h-3 text-destructive" />
                )}
                <span className={`text-xs ${metric.changeType === "up" ? "text-success" : "text-destructive"}`}>
                  {metric.change}
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hourly Sales Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Today's Hourly Sales</CardTitle>
              <span className="text-sm text-muted-foreground">Total: Rs 485,000</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Loading chart data...</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value: number) => [`Rs ${value.toLocaleString()}`, "Sales"]}
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                    <Bar dataKey="sales" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top Selling Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <p className="text-muted-foreground text-center py-4">Loading top selling items...</p>
              ) : topSelling.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No sales data available</p>
              ) : (
                topSelling.map((item) => (
                  <div key={item.rank} className="flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${getRankColor(item.rank)}`}>
                      #{item.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.units} units sold</p>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      Rs {item.value.toLocaleString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Activity</CardTitle>
            <Button variant="link" size="sm" className="text-primary">
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground text-center py-4">Loading recent activity...</p>
            ) : recentActivity.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No recent activity</p>
            ) : (
              recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${activity.type === "stock" ? "bg-warning/10 text-warning" : "bg-muted"
                    }`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{activity.title}</p>
                    {activity.subtitle && (
                      <p className="text-xs text-muted-foreground">{activity.subtitle}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {activity.amount > 0 && (
                      <p className="text-sm font-semibold text-success">+Rs {activity.amount.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{activity.time}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RealTimeDashboard;
