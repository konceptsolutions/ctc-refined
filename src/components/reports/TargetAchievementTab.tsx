import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
import { Download, Target, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";
import { useEffect } from "react";
import { Input } from "@/components/ui/input";

interface TargetData {
  category: string; 
  target: number;
  achieved: number;
  percentage: number;
  status: "exceeded" | "on-track" | "behind";
}

const TargetAchievementTab = () => {
  const [period, setPeriod] = useState("monthly");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getTargetAchievement({
        period,
        month,
      });

      if (response.data) {
        setTargetData(response.data);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [period, month]);

  const overallProgress = {
    target: targetData.reduce((sum, t) => sum + t.target, 0),
    achieved: targetData.reduce((sum, t) => sum + t.achieved, 0),
    percentage: targetData.reduce((sum, t) => sum + t.target, 0) > 0
      ? (targetData.reduce((sum, t) => sum + t.achieved, 0) / targetData.reduce((sum, t) => sum + t.target, 0) * 100)
      : 0,
    remaining: Math.max(0, targetData.reduce((sum, t) => sum + t.target, 0) - targetData.reduce((sum, t) => sum + t.achieved, 0)),
    daysLeft: 0,
  };

  const handleExport = () => {
    if (targetData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Category", "Target", "Achieved", "Percentage", "Status"];
    const success = exportToCSV(targetData, headers, `target-achievement-${period}-${month}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "exceeded": return "text-success bg-success/10";
      case "on-track": return "text-info bg-info/10";
      case "behind": return "text-destructive bg-destructive/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const getProgressColor = (percentage: number) => {
    if (percentage >= 100) return "bg-success";
    if (percentage >= 80) return "bg-info";
    if (percentage >= 60) return "bg-warning";
    return "bg-destructive";
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Target vs Achievement</CardTitle>
              <p className="text-sm text-muted-foreground">Track performance against set targets</p>
            </div>
            <Button onClick={handleExport} className="bg-primary hover:bg-primary/90">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="quarterly">Quarterly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Input 
              type="month" 
              value={month} 
              onChange={(e) => setMonth(e.target.value)}
              className="w-32"
            />
            <Button onClick={fetchData} disabled={loading}>
              {loading ? "Loading..." : "Apply"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Overall Progress */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Overall Monthly Target Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{overallProgress.percentage}%</p>
                <p className="text-sm text-muted-foreground">
                  Rs {overallProgress.achieved.toLocaleString()} of Rs {overallProgress.target.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-primary">
                  Rs {overallProgress.remaining.toLocaleString()} remaining
                </p>
                <p className="text-xs text-muted-foreground">{overallProgress.daysLeft} days left</p>
              </div>
            </div>
            <Progress value={overallProgress.percentage} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Target Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {targetData.map((item) => (
          <Card key={item.category}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium">{item.category}</p>
                <Badge className={`${getStatusColor(item.status)} border-0`}>
                  {item.status === "exceeded" && <TrendingUp className="w-3 h-3 mr-1" />}
                  {item.status === "behind" && <TrendingDown className="w-3 h-3 mr-1" />}
                  {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace("-", " ")}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Target</span>
                  <span className="font-medium">
                    {item.category.includes("Margin") || item.category.includes("Customers") || item.category.includes("Orders")
                      ? item.target
                      : `Rs ${item.target.toLocaleString()}`}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Achieved</span>
                  <span className="font-medium text-primary">
                    {item.category.includes("Margin") || item.category.includes("Customers") || item.category.includes("Orders")
                      ? item.achieved
                      : `Rs ${item.achieved.toLocaleString()}`}
                  </span>
                </div>
                <Progress value={Math.min(item.percentage, 100)} className="h-2" />
                <p className="text-xs text-center font-medium">{item.percentage}% achieved</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Detailed Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>CATEGORY</TableHead>
                <TableHead className="text-right">TARGET</TableHead>
                <TableHead className="text-right">ACHIEVED</TableHead>
                <TableHead className="text-center">PROGRESS</TableHead>
                <TableHead className="text-center">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {targetData.map((row) => (
                <TableRow key={row.category}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell className="text-right">
                    {row.category.includes("Margin") 
                      ? `${row.target}%`
                      : row.category.includes("Customers") || row.category.includes("Orders")
                        ? row.target
                        : `Rs ${row.target.toLocaleString()}`}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.category.includes("Margin") 
                      ? `${row.achieved}%`
                      : row.category.includes("Customers") || row.category.includes("Orders")
                        ? row.achieved
                        : `Rs ${row.achieved.toLocaleString()}`}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Progress value={Math.min(row.percentage, 100)} className="h-2 flex-1" />
                      <span className="text-xs font-medium w-10">{row.percentage}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge className={`${getStatusColor(row.status)} border-0`}>
                      {row.status.charAt(0).toUpperCase() + row.status.slice(1).replace("-", " ")}
                    </Badge>
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

export default TargetAchievementTab;
