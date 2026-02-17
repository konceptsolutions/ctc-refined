import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import { useDashboardData } from "@/hooks/useDashboardData";

type TimeRange = "Week" | "Month" | "Year";

interface InventoryChartProps {
  timeRange: TimeRange;
  onTimeRangeChange: (range: TimeRange) => void;
}

export const InventoryChart = ({ timeRange, onTimeRangeChange }: InventoryChartProps) => {
  const { inventoryChartData, loading } = useDashboardData(timeRange);
  
  // Calculate max value for Y-axis domain
  const maxValue = inventoryChartData.length > 0 
    ? Math.max(...inventoryChartData.map(d => d.value), 120)
    : 120;
  const yAxisMax = maxValue > 0 ? Math.ceil(maxValue * 1.1) : 120;

  return (
    <div className="bg-card rounded-xl p-6 border border-border shadow-sm">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Inventory Overview</h3>
          <p className="text-muted-foreground text-sm">
            {timeRange === 'Week' ? 'Weekly' : timeRange === 'Year' ? 'Yearly' : 'Monthly'} inventory movement
          </p>
        </div>
        
        <div className="flex bg-muted rounded-lg p-1">
          {(["Week", "Month", "Year"] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={cn(
                "px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                timeRange === range
                  ? "bg-card text-primary shadow-sm border border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      <div className="h-64">
        {loading ? (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={inventoryChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(24, 95%, 53%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(214, 32%, 91%)" />
              <XAxis 
                dataKey="month" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: "hsl(215, 16%, 47%)", fontSize: 12 }}
                domain={[0, yAxisMax]}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(0, 0%, 100%)",
                  border: "1px solid hsl(214, 32%, 91%)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(24, 95%, 53%)"
                strokeWidth={2}
                fill="url(#colorValue)"
                dot={{ fill: "hsl(24, 95%, 53%)", strokeWidth: 0, r: 4 }}
                activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(0, 0%, 100%)" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-center justify-center gap-2 mt-4">
        <div className="w-3 h-3 rounded-full bg-chart-orange"></div>
        <span className="text-sm text-muted-foreground">Parts Added</span>
      </div>
    </div>
  );
};
