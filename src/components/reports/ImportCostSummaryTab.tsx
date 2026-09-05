import { useState, useEffect } from "react";
import { formatUiDate } from "@/utils/dateUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/components/ui/searchable-select";
import { Download, Truck, DollarSign, Percent, Package } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";

interface ImportRecord {
  id: string;
  date: string;
  lcNumber: string;
  supplier: string;
  country: string;
  fobValue: number;
  freight: number;
  insurance: number;
  duties: number;
  totalCost: number;
  items: number;
}

const unwrapList = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const ImportCostSummaryTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [country, setCountry] = useState("");
  const [countryOptions, setCountryOptions] = useState<SearchableSelectOption[]>([]);
  const [importData, setImportData] = useState<ImportRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.getSuppliers({ status: "active", limit: 5000 });
        const countries = [
          ...new Set(
            unwrapList(res)
              .map((s: any) => String(s.country || "").trim())
              .filter((c: string) => c.length > 0),
          ),
        ].sort((a, b) => a.localeCompare(b));
        setCountryOptions(
          countries.map((c) => ({
            value: c,
            label: c,
          })),
        );
      } catch {
        toast.error("Failed to load countries");
      }
    };
    load();
  }, []);

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getImportCostSummary({
        from_date: fromDate,
        to_date: toDate,
        country: country || undefined,
      });

      if (response.data && response.data.records) {
        setImportData(response.data.records);
        toast.success("Import cost report generated");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (importData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Date", "LC Number", "Supplier", "Country", "FOB Value", "Freight", "Insurance", "Duties", "Total Cost", "Items"];
    const success = exportToCSV(importData, headers, `import-cost-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const totalFOB = importData.reduce((sum, r) => sum + r.fobValue, 0);
  const totalFreight = importData.reduce((sum, r) => sum + r.freight, 0);
  const totalDuties = importData.reduce((sum, r) => sum + r.duties, 0);
  const totalLandedCost = importData.reduce((sum, r) => sum + r.totalCost, 0);
  const avgLandingCost = totalLandedCost > 0 ? ((totalLandedCost - totalFOB) / totalFOB * 100).toFixed(1) : 0;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Import Cost Summary</CardTitle>
              <p className="text-sm text-muted-foreground">Analyze landed costs and import expenses</p>
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
              <Label>From Date</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>To Date</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <SearchableSelect
                options={countryOptions}
                value={country}
                onValueChange={setCountry}
                placeholder="All Countries"
                maxDisplayedOptions={80}
                requireSearchAbove={5000}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleGenerateReport} className="w-full">
                Generate Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-primary">Total FOB Value</p>
            </div>
            <p className="text-xl font-bold">Rs {totalFOB.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Truck className="w-4 h-4 text-info" />
              <p className="text-xs font-medium text-info">Total Freight</p>
            </div>
            <p className="text-xl font-bold">Rs {totalFreight.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-warning" />
              <p className="text-xs font-medium text-warning">Total Duties</p>
            </div>
            <p className="text-xl font-bold">Rs {totalDuties.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-success" />
              <p className="text-xs font-medium text-success">Total Landed Cost</p>
            </div>
            <p className="text-xl font-bold">Rs {totalLandedCost.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-chart-purple/5 border-chart-purple/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="w-4 h-4 text-chart-purple" />
              <p className="text-xs font-medium text-chart-purple">Avg Landing %</p>
            </div>
            <p className="text-xl font-bold">{avgLandingCost}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>DATE</TableHead>
                <TableHead>LC NUMBER</TableHead>
                <TableHead>SUPPLIER</TableHead>
                <TableHead>COUNTRY</TableHead>
                <TableHead className="text-right">FOB VALUE</TableHead>
                <TableHead className="text-right">FREIGHT</TableHead>
                <TableHead className="text-right">DUTIES</TableHead>
                <TableHead className="text-right">TOTAL COST</TableHead>
                <TableHead className="text-center">ITEMS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {importData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Truck className="w-10 h-10 opacity-50" />
                      <p>No import records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                importData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} total={importData.length} />
                    <TableCell>{formatUiDate(record.date) || record.date}</TableCell>
                    <TableCell className="font-medium text-primary">{record.lcNumber}</TableCell>
                    <TableCell>{record.supplier}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.country}</Badge>
                    </TableCell>
                    <TableCell className="text-right">Rs {record.fobValue.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs {record.freight.toLocaleString()}</TableCell>
                    <TableCell className="text-right">Rs {record.duties.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-medium">Rs {record.totalCost.toLocaleString()}</TableCell>
                    <TableCell className="text-center">{record.items}</TableCell>
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

export default ImportCostSummaryTab;
