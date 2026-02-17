import { useState } from "react";
import { BarChart3, PieChart, TrendingUp, Download, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface ReportData {
  label: string;
  value: number;
  percentage: number;
  trend: "up" | "down" | "stable";
}

const byCategory: ReportData[] = [
  { label: "Engine Parts", value: 45000, percentage: 32, trend: "up" },
  { label: "Brake Parts", value: 28000, percentage: 20, trend: "stable" },
  { label: "Suspension", value: 22000, percentage: 16, trend: "up" },
  { label: "Electrical", value: 18000, percentage: 13, trend: "down" },
  { label: "Filters", value: 15000, percentage: 11, trend: "up" },
  { label: "Others", value: 12000, percentage: 8, trend: "stable" },
];

const byLocation: ReportData[] = [
  { label: "Main Warehouse", value: 85000, percentage: 60, trend: "up" },
  { label: "Branch A", value: 32000, percentage: 23, trend: "stable" },
  { label: "Branch B", value: 23000, percentage: 17, trend: "up" },
];

const byBrand: ReportData[] = [
  { label: "Bosch", value: 38000, percentage: 27, trend: "up" },
  { label: "Mann", value: 25000, percentage: 18, trend: "stable" },
  { label: "Denso", value: 22000, percentage: 16, trend: "up" },
  { label: "NGK", value: 18000, percentage: 13, trend: "down" },
  { label: "KYB", value: 15000, percentage: 11, trend: "up" },
  { label: "Others", value: 22000, percentage: 15, trend: "stable" },
];

const colors = [
  "bg-chart-blue",
  "bg-chart-orange",
  "bg-chart-green",
  "bg-primary",
  "bg-violet-500",
  "bg-pink-500",
];

export const MultiDimensionalReporting = () => {
  const [dimension, setDimension] = useState<"category" | "location" | "brand">("category");
  const [period, setPeriod] = useState("this-month");

  const getData = () => {
    switch (dimension) {
      case "category":
        return byCategory;
      case "location":
        return byLocation;
      case "brand":
        return byBrand;
      default:
        return byCategory;
    }
  };

  const data = getData();
  const totalValue = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Multi-Dimensional Reporting</h2>
          <p className="text-sm text-muted-foreground">Advanced inventory analysis and insights</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <Select value={dimension} onValueChange={(v) => setDimension(v as typeof dimension)}>
          <SelectTrigger className="w-40 h-9">
            <BarChart3 className="w-4 h-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="category">By Category</SelectItem>
            <SelectItem value="location">By Location</SelectItem>
            <SelectItem value="brand">By Brand</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="this-quarter">This Quarter</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-4">
        {/* Chart Area */}
        <div className="col-span-2 bg-card border border-border rounded-lg p-6">
          <h3 className="text-sm font-medium text-foreground mb-6">
            Stock Value by {dimension.charAt(0).toUpperCase() + dimension.slice(1)}
          </h3>
          
          {/* Bar Chart */}
          <div className="space-y-4">
            {data.map((item, index) => (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-foreground font-medium">{item.label}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">Rs {item.value.toLocaleString()}</span>
                    <span className={cn(
                      "text-xs flex items-center gap-0.5",
                      item.trend === "up" ? "text-chart-green" : item.trend === "down" ? "text-destructive" : "text-muted-foreground"
                    )}>
                      <TrendingUp className={cn(
                        "w-3 h-3",
                        item.trend === "down" && "rotate-180"
                      )} />
                      {item.percentage}%
                    </span>
                  </div>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", colors[index % colors.length])}
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          {/* Total Value */}
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Total Stock Value</p>
            <p className="text-2xl font-semibold text-foreground">Rs {totalValue.toLocaleString()}</p>
            <p className="text-xs text-chart-green mt-1 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12% from last month
            </p>
          </div>

          {/* Distribution */}
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground mb-4">Distribution</p>
            <div className="space-y-3">
              {data.slice(0, 5).map((item, index) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", colors[index % colors.length])} />
                    <span className="text-sm text-muted-foreground">{item.label}</span>
                  </div>
                  <span className="text-sm font-medium text-foreground">{item.percentage}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-card border border-border rounded-lg p-4">
            <p className="text-sm font-medium text-foreground mb-4">Quick Stats</p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Highest Value</span>
                <span className="text-sm font-medium text-foreground">{data[0]?.label}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Categories</span>
                <span className="text-sm font-medium text-foreground">{data.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Avg. per {dimension}</span>
                <span className="text-sm font-medium text-foreground">
                  Rs {Math.round(totalValue / data.length).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
