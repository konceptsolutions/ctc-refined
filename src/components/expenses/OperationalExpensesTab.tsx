import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue, 
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Building2, Search, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface OperationalExpense {
  id: string;
  date: string;
  voucherNo: string;
  expenseType: string;
  description: string;
  paidTo: string;
  amount: number;
  status: "Posted" | "Pending" | "Approved";
}

const expenseTypes = ["Employee Salaries", "Office Rent", "Utilities", "Vehicle Maintenance", "Office Supplies", "Communication", "Marketing & Advertising", "Bank Charges", "Interest Expense"];

interface OperationalExpensesTabProps {
  onUpdate?: () => void;
}

export const OperationalExpensesTab = ({ onUpdate }: OperationalExpensesTabProps) => {
  const [expenses, setExpenses] = useState<OperationalExpense[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingExpense, setViewingExpense] = useState<OperationalExpense | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    expenseType: "",
    paidTo: "",
    amount: "",
    description: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchExpenses();
  }, [searchQuery]);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getOperationalExpenses({
        search: searchQuery || undefined,
        limit: 1000,
      });
      if (response.data) {
        const data = Array.isArray(response.data) ? response.data : [];
        setExpenses(data.map((exp: any) => ({
          id: exp.id,
          date: new Date(exp.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          voucherNo: exp.voucherNo,
          expenseType: exp.expenseType,
          description: exp.description || "",
          paidTo: exp.paidTo,
          amount: exp.amount,
          status: exp.status as "Posted" | "Pending" | "Approved",
        })));
      }
    } catch (error) {
      toast.error("Failed to fetch operational expenses");
    } finally {
      setLoading(false);
    }
  };

  const filteredExpenses = expenses.filter((expense) =>
    expense.voucherNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expense.expenseType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expense.paidTo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddNew = () => {
    setFormData({ date: new Date().toISOString().split("T")[0], expenseType: "", paidTo: "", amount: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.expenseType || !formData.paidTo || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);
      await apiClient.createOperationalExpense({
        date: formData.date,
        expenseType: formData.expenseType,
        paidTo: formData.paidTo,
        amount: parseFloat(formData.amount),
        description: formData.description,
      });
      toast.success("Operational expense added successfully");
      setIsDialogOpen(false);
      await fetchExpenses();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.error || "Failed to create operational expense");
    } finally {
      setLoading(false);
    }
  };

  const handleView = async (expense: OperationalExpense) => {
    try {
      const response = await apiClient.getOperationalExpense(expense.id);
      if (response.data) {
        const exp = response.data;
        setViewingExpense({
          id: exp.id,
          date: new Date(exp.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          voucherNo: exp.voucherNo,
          expenseType: exp.expenseType,
          description: exp.description || "",
          paidTo: exp.paidTo,
          amount: exp.amount,
          status: exp.status as "Posted" | "Pending" | "Approved",
        });
      }
    } catch (error) {
      toast.error("Failed to fetch expense details");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Posted": return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
      case "Pending": return "bg-amber-100 text-amber-700 hover:bg-amber-100";
      case "Approved": return "bg-blue-100 text-blue-700 hover:bg-blue-100";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
      <Card className="p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10">
              <Building2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Operational Expenses</h2>
              <p className="text-sm text-muted-foreground">Day-to-day business expenses</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="w-4 h-4" />
            New Operational Expense
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search operational expenses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead>DATE</TableHead>
                <TableHead>VOUCHER NO.</TableHead>
                <TableHead>EXPENSE TYPE</TableHead>
                <TableHead>PAID TO</TableHead>
                <TableHead className="text-right">AMOUNT</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="w-[80px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.map((expense, index) => (
                <TableRow key={expense.id} className="hover:bg-muted/30 transition-colors">
                  <ListNumberCell index={index} total={filteredExpenses.length} />
                  <TableCell className="font-medium">{expense.date}</TableCell>
                  <TableCell className="text-primary font-medium">{expense.voucherNo}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{expense.expenseType}</p>
                      <p className="text-xs text-muted-foreground">{expense.description}</p>
                    </div>
                  </TableCell>
                  <TableCell>{expense.paidTo}</TableCell>
                  <TableCell className="text-right font-semibold">Rs {expense.amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={getStatusBadge(expense.status)}>{expense.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <ActionButtonTooltip label="View" variant="view">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-foreground"
                        onClick={() => handleView(expense)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </ActionButtonTooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Operational Expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expenseType">Expense Type *</Label>
                <Select value={formData.expenseType} onValueChange={(v) => setFormData({ ...formData, expenseType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {expenseTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paidTo">Paid To *</Label>
                <Input
                  id="paidTo"
                  value={formData.paidTo}
                  onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
                  placeholder="Payee name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount *</Label>
                <Input
                  id="amount"
                  type="number"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter details..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={loading}>Cancel</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? "Adding..." : "Add Expense"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewingExpense} onOpenChange={() => setViewingExpense(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Operational Expense Details</DialogTitle>
          </DialogHeader>
          {viewingExpense && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Voucher No.</p>
                  <p className="font-semibold text-primary">{viewingExpense.voucherNo}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">{viewingExpense.date}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Expense Type</p>
                  <p className="font-medium">{viewingExpense.expenseType}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Paid To</p>
                  <p className="font-medium">{viewingExpense.paidTo}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-semibold text-lg">Rs {viewingExpense.amount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getStatusBadge(viewingExpense.status)}>{viewingExpense.status}</Badge>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="font-medium">{viewingExpense.description}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingExpense(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
