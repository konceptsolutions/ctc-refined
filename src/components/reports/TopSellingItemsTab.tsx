import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import {
  buildItemReportSpec,
  ITEM_REPORT_TYPE_OPTIONS,
  printItemAnalyticsPdf,
  REPORT_DATE_PERIOD_PRESETS,
  type SalesItemAnalyticsRow,
} from "@/lib/ai/reportQueryUtils";
import { getCurrentPakistanFinancialYearRange } from "@/utils/dateUtils";

const TopSellingItemsTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [reportType, setReportType] = useState("demand-desc");
  const [periodPreset, setPeriodPreset] = useState("current-fy");
  const [items, setItems] = useState<SalesItemAnalyticsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const selectedType = useMemo(
    () => ITEM_REPORT_TYPE_OPTIONS.find((o) => o.value === reportType) ?? ITEM_REPORT_TYPE_OPTIONS[0],
    [reportType],
  );

  const reportSpec = useMemo(
    () => buildItemReportSpec(selectedType.sort_by, selectedType.order),
    [selectedType],
  );

  useEffect(() => {
    if (periodPreset === "custom") return;
    const preset = REPORT_DATE_PERIOD_PRESETS.find((p) => p.value === periodPreset);
    const range = preset?.getRange() ?? getCurrentPakistanFinancialYearRange();
    if (range.from) setFromDate(range.from);
    if (range.to) setToDate(range.to);
  }, [periodPreset]);

  const handleGenerate = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.getTopSellingItemsReport({
        from_date: fromDate,
        to_date: toDate,
        limit: 100,
        sort_by: selectedType.sort_by,
        order: selectedType.order,
      });

      if (response.data) {
        setItems(response.data as SalesItemAnalyticsRow[]);
        setGenerated(true);
        toast.success(`${reportSpec.title} generated`);
      } else {
        toast.error(response.error || "Failed to generate report");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const rangeLabel = fromDate && toDate ? `${fromDate} to ${toDate}` : "";

  const handleExportCsv = () => {
    if (items.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = [
      "Rank", "Part No", "Description", "Brand", "Qty Sold",
      "Revenue", "Cost", "Profit", "Margin %", "Invoices",
    ];
    const rows = items.map((item) => [
      item.rank, item.partNo, item.description || "", item.brand || "",
      item.quantity, item.totalAmount, item.totalCost, item.totalProfit,
      item.marginPercent.toFixed(2), item.invoiceCount,
    ]);
    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `item-analytics-${reportType}-${fromDate}-to-${toDate}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success("CSV exported");
  };

  const handlePrintPdf = () => {
    if (items.length === 0) {
      toast.error("Generate the report first");
      return;
    }
    printItemAnalyticsPdf(items, reportSpec, rangeLabel, fromDate, toDate);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Item Sales Analytics
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Analyze parts from approved sales invoices: demand, revenue, and profitability.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
            <div className="space-y-2">
              <Label>Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ITEM_REPORT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period</Label>
              <Select value={periodPreset} onValueChange={setPeriodPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_DATE_PERIOD_PRESETS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setPeriodPreset("custom");
                  setFromDate(e.target.value);
                }}
                disabled={periodPreset !== "custom"}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setPeriodPreset("custom");
                  setToDate(e.target.value);
                }}
                disabled={periodPreset !== "custom"}
              />
            </div>
            <Button onClick={handleGenerate} disabled={loading}>
              {loading ? "Generating..." : "Generate Report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {generated && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">{reportSpec.title} ({items.length} items)</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={items.length === 0}>
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrintPdf} disabled={items.length === 0}>
                <FileText className="h-4 w-4 mr-1" />
                Print PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No sales items found for this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ListNumberHeader />
                      <TableHead>Part No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin %</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={item.partId}>
                        <ListNumberCell index={index} />
                        <TableCell className="font-medium">{item.partNo}</TableCell>
                        <TableCell>{item.description || "-"}</TableCell>
                        <TableCell>{item.brand || "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.totalAmount.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.totalCost.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.totalProfit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {item.marginPercent.toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right">{item.invoiceCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TopSellingItemsTab;
