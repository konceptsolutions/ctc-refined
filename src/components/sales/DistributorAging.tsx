import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Search, Download, Printer, CalendarIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DistributorAgingData {
  id: string;
  customerName: string;
  customerCode: string;
  type: "distributor" | "wholesale" | "market";
  totalOutstanding: number;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  creditLimit: number;
}

const mockAgingData: DistributorAgingData[] = [];

export const DistributorAging = () => {
  const [agingData] = useState<DistributorAgingData[]>(mockAgingData);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("totalOutstanding");
  const [fromDate, setFromDate] = useState<Date | undefined>(new Date(2024, 11, 25));
  const [toDate, setToDate] = useState<Date | undefined>(new Date(2025, 11, 25));

  const filteredData = agingData
    .filter((item) => {
      const matchesSearch =
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerCode.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFilter = filterType === "all" || item.type === filterType;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === "totalOutstanding") return b.totalOutstanding - a.totalOutstanding;
      if (sortBy === "current") return b.current - a.current;
      if (sortBy === "days120Plus") return b.days120Plus - a.days120Plus;
      return 0;
    });

  const handleExport = () => {
    // Create CSV content
    const headers = ["Customer", "Code", "Type", "Total Outstanding", "Current (0-30)", "30-60 Days", "60-90 Days", "90-120 Days", "120+ Days", "Credit Utilization %"];
    const rows = filteredData.map((item) => [
      item.customerName,
      item.customerCode,
      item.type,
      item.totalOutstanding,
      item.current,
      item.days30,
      item.days60,
      item.days90,
      item.days120Plus,
      getCreditUtilization(item),
    ]);
    
    // Add totals row
    rows.push([
      "TOTAL",
      "",
      "",
      totals.totalOutstanding,
      totals.current,
      totals.days30,
      totals.days60,
      totals.days90,
      totals.days120Plus,
      "",
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `aging_report_${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Report Exported",
      description: "Aging report has been exported to Excel (CSV).",
    });
  };

  const handlePrint = () => {
    const printContent = `
      <html>
        <head>
          <title>Aging Report - ${format(new Date(), "dd/MM/yyyy")}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; margin-bottom: 20px; }
            .summary { display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
            .summary-card { padding: 10px 15px; border-radius: 8px; color: white; text-align: center; min-width: 120px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; }
            th { background-color: #f5f5f5; font-weight: bold; }
            td:first-child, th:first-child { text-align: left; }
            .text-green { color: #22c55e; }
            .text-yellow { color: #eab308; }
            .text-orange { color: #f97316; }
            .text-red { color: #ef4444; }
            .footer-row { background-color: #f5f5f5; font-weight: bold; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          </style>
        </head>
        <body>
          <h1>Distributor/Customer Aging Report</h1>
          <p style="text-align: center; color: #666;">Generated on ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          
          <div class="summary">
            <div class="summary-card" style="background: #1e3a5f;">Total: Rs. ${totals.totalOutstanding.toLocaleString()}</div>
            <div class="summary-card" style="background: #22c55e;">Current: Rs. ${totals.current.toLocaleString()}</div>
            <div class="summary-card" style="background: #3b82f6;">30-60: Rs. ${totals.days30.toLocaleString()}</div>
            <div class="summary-card" style="background: #eab308;">60-90: Rs. ${totals.days60.toLocaleString()}</div>
            <div class="summary-card" style="background: #f97316;">90-120: Rs. ${totals.days90.toLocaleString()}</div>
            <div class="summary-card" style="background: #ef4444;">120+: Rs. ${totals.days120Plus.toLocaleString()}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Type</th>
                <th>Total Outstanding</th>
                <th>Current (0-30)</th>
                <th>30-60 Days</th>
                <th>60-90 Days</th>
                <th>90-120 Days</th>
                <th>120+ Days</th>
                <th>Credit %</th>
              </tr>
            </thead>
            <tbody>
              ${filteredData.map(item => `
                <tr>
                  <td>${item.customerName}<br><small style="color:#666">${item.customerCode}</small></td>
                  <td>${item.type}</td>
                  <td><strong>Rs. ${item.totalOutstanding.toLocaleString()}</strong></td>
                  <td class="text-green">Rs. ${item.current.toLocaleString()}</td>
                  <td>Rs. ${item.days30.toLocaleString()}</td>
                  <td class="text-yellow">Rs. ${item.days60.toLocaleString()}</td>
                  <td class="text-orange">Rs. ${item.days90.toLocaleString()}</td>
                  <td class="text-red">Rs. ${item.days120Plus.toLocaleString()}</td>
                  <td>${getCreditUtilization(item)}%</td>
                </tr>
              `).join("")}
              <tr class="footer-row">
                <td colspan="2" style="text-align: right;"><strong>TOTAL:</strong></td>
                <td><strong>Rs. ${totals.totalOutstanding.toLocaleString()}</strong></td>
                <td class="text-green"><strong>Rs. ${totals.current.toLocaleString()}</strong></td>
                <td><strong>Rs. ${totals.days30.toLocaleString()}</strong></td>
                <td class="text-yellow"><strong>Rs. ${totals.days60.toLocaleString()}</strong></td>
                <td class="text-orange"><strong>Rs. ${totals.days90.toLocaleString()}</strong></td>
                <td class="text-red"><strong>Rs. ${totals.days120Plus.toLocaleString()}</strong></td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }

    toast({
      title: "Print Initiated",
      description: "Print dialog opened.",
    });
  };

  const getTypeColor = (type: DistributorAgingData["type"]) => {
    switch (type) {
      case "distributor":
        return "bg-orange-500 text-white hover:bg-orange-600";
      case "wholesale":
        return "bg-blue-500 text-white hover:bg-blue-600";
      case "market":
        return "bg-green-500 text-white hover:bg-green-600";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  // Calculate totals
  const totals = agingData.reduce(
    (acc, item) => ({
      totalOutstanding: acc.totalOutstanding + item.totalOutstanding,
      current: acc.current + item.current,
      days30: acc.days30 + item.days30,
      days60: acc.days60 + item.days60,
      days90: acc.days90 + item.days90,
      days120Plus: acc.days120Plus + item.days120Plus,
    }),
    { totalOutstanding: 0, current: 0, days30: 0, days60: 0, days90: 0, days120Plus: 0 }
  );

  // Calculate percentages for distribution bar
  const totalForPercentage = totals.current + totals.days30 + totals.days60 + totals.days90 + totals.days120Plus;
  const percentages = {
    current: totalForPercentage > 0 ? Math.round((totals.current / totalForPercentage) * 100) : 0,
    days30: totalForPercentage > 0 ? Math.round((totals.days30 / totalForPercentage) * 100) : 0,
    days60: totalForPercentage > 0 ? Math.round((totals.days60 / totalForPercentage) * 100) : 0,
    days90: totalForPercentage > 0 ? Math.round((totals.days90 / totalForPercentage) * 100) : 0,
    days120Plus: totalForPercentage > 0 ? Math.round((totals.days120Plus / totalForPercentage) * 100) : 0,
  };

  const getCreditUtilization = (item: DistributorAgingData) => {
    return Math.round((item.totalOutstanding / item.creditLimit) * 100);
  };

  const getUtilizationColor = (percentage: number) => {
    if (percentage >= 90) return "bg-red-500";
    if (percentage >= 75) return "bg-orange-500";
    return "bg-green-500";
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `Rs. ${(amount / 1000000).toFixed(0)}M`;
    }
    if (amount >= 1000) {
      return `Rs. ${(amount / 1000).toFixed(0)}K`;
    }
    return `Rs. ${amount.toLocaleString()}`;
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card className="bg-[#1e3a5f] border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Total Outstanding</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.totalOutstanding)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-green-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Current (0-30)</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.current)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">30-60 Days</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.days30)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-yellow-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">60-90 Days</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.days60)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-orange-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">90-120 Days</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.days90)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-500 border-0">
          <CardContent className="p-4 text-center">
            <p className="text-xs text-white/70 mb-1">Over 120 Days</p>
            <p className="text-xl font-bold text-white">
              {formatCurrency(totals.days120Plus)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Aging Distribution Bar */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Aging Distribution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex h-8 rounded-lg overflow-hidden">
            <div 
              className="bg-green-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${percentages.current}%` }}
            >
              {percentages.current}%
            </div>
            <div 
              className="bg-blue-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${percentages.days30}%` }}
            >
              {percentages.days30}%
            </div>
            <div 
              className="bg-yellow-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${percentages.days60}%` }}
            >
              {percentages.days60}%
            </div>
            <div 
              className="bg-orange-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${percentages.days90}%` }}
            >
              {percentages.days90}%
            </div>
            <div 
              className="bg-red-500 flex items-center justify-center text-xs font-medium text-white"
              style={{ width: `${percentages.days120Plus}%` }}
            >
              {percentages.days120Plus > 0 && `${percentages.days120Plus}%`}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              Current
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              30-60 Days
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              60-90 Days
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-orange-500"></span>
              90-120 Days
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              120+ Days
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search customer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-32 bg-background">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="distributor">Distributor</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="market">Market</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">From:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-32 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {fromDate ? format(fromDate, "dd/MM/yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
              <Calendar
                mode="single"
                selected={fromDate}
                onSelect={setFromDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">To:</span>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-32 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {toDate ? format(toDate, "dd/MM/yyyy") : "Pick date"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
              <Calendar
                mode="single"
                selected={toDate}
                onSelect={setToDate}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button onClick={handleExport} variant="outline" className="gap-2 border-green-500 text-green-600 hover:bg-green-50">
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
          <Button onClick={handlePrint} variant="outline" className="gap-2">
            <Printer className="w-4 h-4" />
            Print
          </Button>
        </div>
      </div>

      {/* Aging Table */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Distributor/Customer Aging Report ({filteredData.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-40 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value="totalOutstanding">Total Outstanding</SelectItem>
                <SelectItem value="current">Current Amount</SelectItem>
                <SelectItem value="days120Plus">120+ Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="font-semibold">Customer</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="text-right font-semibold">Total Outstanding</TableHead>
                  <TableHead className="text-right font-semibold text-green-600">Current (0-30)</TableHead>
                  <TableHead className="text-right font-semibold">30-60 Days</TableHead>
                  <TableHead className="text-right font-semibold text-yellow-600">60-90 Days</TableHead>
                  <TableHead className="text-right font-semibold text-orange-600">90-120 Days</TableHead>
                  <TableHead className="text-right font-semibold text-red-600">120+ Days</TableHead>
                  <TableHead className="text-center font-semibold">Credit Utilization</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item) => {
                  const utilization = getCreditUtilization(item);
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{item.customerName}</p>
                          <p className="text-xs text-muted-foreground">{item.customerCode}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={cn("text-xs", getTypeColor(item.type))}>
                          {item.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        Rs. {item.totalOutstanding.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-green-600">
                        Rs. {item.current.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        Rs. {item.days30.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-yellow-600">
                        Rs. {item.days60.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-orange-600">
                        Rs. {item.days90.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        Rs. {item.days120Plus.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn("h-full rounded-full", getUtilizationColor(utilization))}
                              style={{ width: `${Math.min(utilization, 100)}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-10 text-right">{utilization}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={2} className="text-right">TOTAL:</TableCell>
                  <TableCell className="text-right">
                    Rs. {totals.totalOutstanding.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    Rs. {totals.current.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    Rs. {totals.days30.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-yellow-600">
                    Rs. {totals.days60.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    Rs. {totals.days90.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-red-600">
                    Rs. {totals.days120Plus.toLocaleString()}
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
