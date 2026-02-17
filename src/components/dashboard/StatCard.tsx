import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  value: number;
  label: string;
  change: string;
  progressColor: "orange" | "blue" | "green" | "yellow";
  iconBgColor: string;
}

const progressColors = {
  orange: "bg-chart-orange",
  blue: "bg-chart-blue",
  green: "bg-chart-green",
  yellow: "bg-chart-yellow",
};

const progressBgColors = {
  orange: "bg-chart-orange/20",
  blue: "bg-chart-blue/20",
  green: "bg-chart-green/20",
  yellow: "bg-chart-yellow/20",
};

export const StatCard = ({ icon, value, label, change, progressColor, iconBgColor }: StatCardProps) => {
  return (
    <div className="bg-card rounded-xl p-5 border border-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", iconBgColor)}>
          {icon}
        </div>
        <span className="px-2 py-1 bg-success/10 text-success text-xs font-medium rounded-full">
          {change}
        </span>
      </div>
      
      <div className="mb-3">
        <p className="text-3xl font-bold text-foreground">{value}</p>
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>

      {/* Progress Bar */}
      <div className={cn("h-1.5 rounded-full", progressBgColors[progressColor])}>
        <div 
          className={cn("h-full rounded-full transition-all duration-500", progressColors[progressColor])}
          style={{ width: `${Math.min(value * 2.5, 100)}%` }}
        />
      </div>
    </div>
  );
};
