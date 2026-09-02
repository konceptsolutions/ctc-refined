import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
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
  status: "paid" | "pending" | "approved";
}

const ExpensesReportTab = () => {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [category, setCategory] = useState("all");
  const [expenseData, setExpenseData] = useState<ExpenseRecord[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);

  const mockExpenseData: ExpenseRecord[] = [
    { id: "1", date: "2024-12-26", reference: "EXP-2024-0245", category: "Utilities", description: "Electricity bill December", amount: 45000, status: "paid" },
    { id: "2", date: "2024-12-25", reference: "EXP-2024-0244", category: "Rent", description: "Warehouse rent December", amount: 120000, status: "paid" },
    { id: "3", date: "2024-12-24", reference: "EXP-2024-0243", category: "Salaries", description: "Staff salaries December", amount: 350000, status: "pending" },
    { id: "4", date: "2024-12-23", reference: "EXP-2024-0242", category: "Transport", description: "Delivery vehicle fuel", amount: 28000, status: "paid" },
    { id: "5", date: "2024-12-22", reference: "EXP-2024-0241", category: "Maintenance", description: "Equipment repair", amount: 15000, status: "approved" },
  ];

  const handleGenerateReport = async () => {
    if (!fromDate || !toDate) {
      toast.error("Please select both from and to dates");
      return;
    }

    try {
      const response = await apiClient.getExpensesReport({
        from_date: fromDate,
        to_date: toDate,
        category: category !== "all" ? category : undefined,
      });

      if (response.data) {
        const formatted = response.data.map((e: any) => ({
          id: e.id,
          date: formatUiDate(e.date) || "",
          reference: e.id,
          category: e.expenseType?.name || "N/A",
          description: e.description || "",
          amount: e.amount,
          status: "paid" as const,
        }));
        setExpenseData(formatted);
        setIsGenerated(true);
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
  const thisMonth = expenseData.filter(r => r.date.startsWith("2024-12")).reduce((sum, r) => sum + r.amount, 0);
  const pendingExpenses = expenseData.filter(r => r.status === "pending").reduce((sum, r) => sum + r.amount, 0);
  const categories = [...new Set(expenseData.map(r => r.category))].length;

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
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="utilities">Utilities</SelectItem>
                  <SelectItem value="rent">Rent</SelectItem>
                  <SelectItem value="salaries">Salaries</SelectItem>
                  <SelectItem value="transport">Transport</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
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
                    <TableCell>{record.date}</TableCell>
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
