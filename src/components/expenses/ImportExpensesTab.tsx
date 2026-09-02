import { useState } from "react";
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
import { ShoppingCart, Search, Plus, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatUiDate } from "@/utils/dateUtils";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface ImportExpense {
  id: string;
  date: string;
  voucherNo: string;
  expenseType: string;
  description: string;
  supplier: string;
  amount: number;
  status: "Posted" | "Pending" | "Approved";
}

const initialImportExpenses: ImportExpense[] = [
  { id: "1", date: "12 Dec 2025", voucherNo: "IE-2025-001", expenseType: "Customs & Duties", description: "Import shipment #45678", supplier: "Customs Authority", amount: 45000, status: "Posted" },
  { id: "2", date: "10 Dec 2025", voucherNo: "IE-2025-002", expenseType: "Freight & Shipping", description: "Container shipping charges", supplier: "Global Shipping Co.", amount: 35000, status: "Posted" },
  { id: "3", date: "08 Dec 2025", voucherNo: "IE-2025-003", expenseType: "Clearing Agent Fees", description: "Customs clearance LC #789", supplier: "Fast Clear Agents", amount: 25000, status: "Approved" },
  { id: "4", date: "05 Dec 2025", voucherNo: "IE-2025-004", expenseType: "Customs & Duties", description: "Import duty December batch", supplier: "Customs Authority", amount: 55000, status: "Pending" },
  { id: "5", date: "03 Dec 2025", voucherNo: "IE-2025-005", expenseType: "Freight & Shipping", description: "Air freight charges", supplier: "Air Cargo Express", amount: 28000, status: "Posted" },
];

const expenseTypes = ["Customs & Duties", "Freight & Shipping", "Clearing Agent Fees"];

export const ImportExpensesTab = () => {
  const [expenses, setExpenses] = useState<ImportExpense[]>(initialImportExpenses);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewingExpense, setViewingExpense] = useState<ImportExpense | null>(null);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    expenseType: "",
    supplier: "",
    amount: "",
    description: "",
  });

  const filteredExpenses = expenses.filter((expense) =>
    expense.voucherNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expense.expenseType.toLowerCase().includes(searchQuery.toLowerCase()) ||
    expense.supplier.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddNew = () => {
    setFormData({ date: new Date().toISOString().split("T")[0], expenseType: "", supplier: "", amount: "", description: "" });
    setIsDialogOpen(true);
  };

  const handleSave = () => {
    if (!formData.expenseType || !formData.supplier || !formData.amount) {
      toast.error("Please fill all required fields");
      return;
    }

    const newVoucherNo = `IE-2025-${String(expenses.length + 1).padStart(3, "0")}`;
    const newExpense: ImportExpense = {
      id: String(expenses.length + 1),
      date: formatUiDate(formData.date) || "",
      voucherNo: newVoucherNo,
      expenseType: formData.expenseType,
      description: formData.description,
      supplier: formData.supplier,
      amount: parseFloat(formData.amount),
      status: "Pending",
    };
    setExpenses((prev) => [newExpense, ...prev]);
    toast.success("Import expense added successfully");
    setIsDialogOpen(false);
  };

  const handleView = (expense: ImportExpense) => {
    setViewingExpense(expense);
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
            <div className="p-2 rounded-lg bg-violet-500/10">
              <ShoppingCart className="w-5 h-5 text-violet-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Import Expenses</h2>
              <p className="text-sm text-muted-foreground">Import-related expense transactions</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="w-4 h-4" />
            New Import Expense
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-sm mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search import expenses..."
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
                <TableHead>SUPPLIER</TableHead>
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
                  <TableCell>{expense.supplier}</TableCell>
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
            <DialogTitle>New Import Expense</DialogTitle>
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
                <Label htmlFor="supplier">Supplier *</Label>
                <Input
                  id="supplier"
                  value={formData.supplier}
                  onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                  placeholder="Supplier name"
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
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>Add Expense</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={!!viewingExpense} onOpenChange={() => setViewingExpense(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Import Expense Details</DialogTitle>
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
                  <p className="text-sm text-muted-foreground">Supplier</p>
                  <p className="font-medium">{viewingExpense.supplier}</p>
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
