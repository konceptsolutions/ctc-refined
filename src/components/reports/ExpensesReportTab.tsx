import { useState, useEffect } from "react";
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
import { Download, DollarSign } from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { exportToCSV } from "@/utils/exportUtils";
import { formatUiDate } from "@/utils/dateUtils";

interface ExpenseRecord {
  id: string;
  date: string;
  reference: string;
  category: string;
  description: string;
  amount: number;
  status: "paid" | "pending" | "approved" | string;
}

const unwrapList = (res: any): any[] => {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  return [];
};

const isCurrentCalendarMonth = (dateStr: string) => {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const ExpensesReportTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState("");
  const [categoryOptions, setCategoryOptions] = useState<SearchableSelectOption[]>([]);
  const [expenseData, setExpenseData] = useState<ExpenseRecord[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        let res = await apiClient.getExpenseTypes({ status: "Active", limit: 1000 });
        let rows = unwrapList(res);
        if (rows.length === 0) {
          res = await apiClient.getExpenseTypes({ limit: 1000 });
          rows = unwrapList(res);
        }
        if (rows.length > 0) {
          setCategoryOptions(
            rows
              .map((t: any) => ({
                value: String(t.id),
                label: String(t.name || "").trim(),
              }))
              .filter((t: SearchableSelectOption) => t.value && t.label)
              .sort((a: SearchableSelectOption, b: SearchableSelectOption) =>
                a.label.localeCompare(b.label),
              ),
          );
          return;
        }

        // Fallback: expense subgroups from chart of accounts
        const subgroupsRes = await apiClient.getSubgroups({ isActive: true });
        const subgroups = unwrapList(subgroupsRes);
        const expenseSubs = subgroups
          .filter((s: any) => {
            const type = String(s.MainGroup?.type || s.mainGroup?.type || "").toLowerCase();
            const name = String(s.MainGroup?.name || s.mainGroup?.name || "");
            return type === "expense" && !/cost of sales|^cost$/i.test(name);
          })
          .map((s: any) => ({
            value: String(s.name || "").trim(),
            label: String(s.name || "").trim(),
          }))
          .filter((s: SearchableSelectOption) => s.value && s.label);
        const unique = Array.from(
          new Map(expenseSubs.map((s: SearchableSelectOption) => [s.value, s])).values(),
        ).sort((a, b) => a.label.localeCompare(b.label));
        setCategoryOptions(unique);
      } catch {
        toast.error("Failed to load expense categories");
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
      const response = await apiClient.getExpensesReport({
        from_date: fromDate,
        to_date: toDate,
        category: category || undefined,
      });

      if (response.data) {
        const rows = Array.isArray(response.data) ? response.data : [];
        const alreadyShaped =
          rows.length === 0 ||
          (rows[0] &&
            "reference" in rows[0] &&
            "category" in rows[0] &&
            typeof rows[0].category === "string");

        if (alreadyShaped) {
          setExpenseData(rows as ExpenseRecord[]);
        } else {
          setExpenseData(
            rows.map((e: any) => ({
              id: e.id,
              date: e.date,
              reference: e.reference || e.id,
              category: e.expenseType?.name || e.category || "N/A",
              description: e.description || "",
              amount: e.amount,
              status: e.status || "paid",
            })),
          );
        }
        toast.success("Expense report generated successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to generate report");
    }
  };

  const handleExport = () => {
    if (expenseData.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Date", "Reference", "Category", "Description", "Amount", "Status"];
    const success = exportToCSV(expenseData, headers, `expenses-report-${fromDate}-to-${toDate}.csv`);
    if (success) {
      toast.success("Report exported successfully");
    } else {
      toast.error("Failed to export report");
    }
  };

  const totalExpenses = expenseData.reduce((sum, record) => sum + record.amount, 0);
  const thisMonth = expenseData
    .filter((r) => isCurrentCalendarMonth(r.date))
    .reduce((sum, r) => sum + r.amount, 0);
  const pendingExpenses = expenseData
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + r.amount, 0);
  const categories = [...new Set(expenseData.map((r) => r.category))].length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge className="bg-success/10 text-success border-0">Paid</Badge>;
      case "pending":
        return <Badge className="bg-warning/10 text-warning border-0">Pending</Badge>;
      case "approved":
        return <Badge className="bg-info/10 text-info border-0">Approved</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Expenses Report</CardTitle>
              <p className="text-sm text-muted-foreground">Track and analyze all business expenses</p>
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
              <Label>Category</Label>
              <SearchableSelect
                options={categoryOptions}
                value={category}
                onValueChange={setCategory}
                placeholder="All Categories"
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-primary">Total Expenses</p>
            <p className="text-2xl font-bold mt-1">PKR {totalExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-info/5 border-info/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-info">This Month</p>
            <p className="text-2xl font-bold mt-1">PKR {thisMonth.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-warning/5 border-warning/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-warning">Pending</p>
            <p className="text-2xl font-bold mt-1">PKR {pendingExpenses.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="bg-success/5 border-success/20">
          <CardContent className="p-4">
            <p className="text-xs font-medium text-success">Categories</p>
            <p className="text-2xl font-bold mt-1">{categories}</p>
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
                <TableHead>REFERENCE</TableHead>
                <TableHead>CATEGORY</TableHead>
                <TableHead>DESCRIPTION</TableHead>
                <TableHead className="text-right">AMOUNT</TableHead>
                <TableHead className="text-center">STATUS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenseData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <DollarSign className="w-10 h-10 opacity-50" />
                      <p>No expense records found</p>
                      <p className="text-sm">Select date range and generate report</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                expenseData.map((record, index) => (
                  <TableRow key={record.id}>
                    <ListNumberCell index={index} total={expenseData.length} />
                    <TableCell>{formatUiDate(record.date) || record.date}</TableCell>
                    <TableCell className="font-medium">{record.reference}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{record.category}</Badge>
                    </TableCell>
                    <TableCell>{record.description}</TableCell>
                    <TableCell className="text-right font-medium">
                      Rs {record.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-center">{getStatusBadge(record.status)}</TableCell>
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

export default ExpensesReportTab;
