import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { usePageActions } from "@/permissions/pageActions";
import { getCurrentDatePakistan, formatUiDate } from "@/utils/dateUtils";

type EmployeeOption = {
  id: string;
  code: string;
  name: string;
  loanBalance: number;
  advanceBalance: number;
};

type CashBankOption = {
  id: string;
  label: string;
};

type LoanAdvanceTxType =
  | "advance_issue"
  | "loan_issue"
  | "loan_recovery"
  | "advance_recovery";

type LoanAdvanceTransaction = {
  id: string;
  type: string;
  date: string;
  amount: number;
  description?: string | null;
  referenceNo?: string | null;
  Employee?: {
    id: string;
    code: string;
    name: string;
    status?: string;
  } | null;
  Voucher?: {
    voucherNumber?: string;
    type?: string;
    cashBankAccount?: string | null;
  } | null;
};

const TX_TYPE_LABELS: Record<string, string> = {
  advance_issue: "Advance Issued",
  loan_issue: "Loan Issued",
  loan_recovery: "Loan Recovery",
  advance_recovery: "Advance Recovery",
};

const ISSUE_TX_TYPE_OPTIONS = [
  { value: "advance_issue", label: "Advance Issue" },
  { value: "loan_issue", label: "Loan Issue" },
] as const;

const RECOVERY_TX_TYPE_OPTIONS = [
  { value: "advance_recovery", label: "Advance Recovery" },
  { value: "loan_recovery", label: "Loan Recovery" },
] as const;

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value?: string | null) => formatUiDate(value) || "—";

const todayDateMax = () => getCurrentDatePakistan();

const isFutureDate = (value?: string | null) => {
  const v = String(value || "").trim();
  if (!v) return false;
  return v > todayDateMax();
};

const getTypeBadgeVariant = (type: string) => {
  if (type.endsWith("_issue")) return "default";
  return "secondary";
};

const isIssueType = (type: string) =>
  type === "advance_issue" || type === "loan_issue";

const toDateInputValue = (value?: string | null) => {
  if (!value) return getCurrentDatePakistan();
  return String(value).split("T")[0];
};

export const LoanAdvanceManagement = () => {
  const { toast } = useToast();
  const { canCreate, canEdit } = usePageActions("employees.loans-advances");
  const [transactions, setTransactions] = useState<LoanAdvanceTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [cashBankAccounts, setCashBankAccounts] = useState<CashBankOption[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formType, setFormType] = useState<LoanAdvanceTxType>("advance_issue");
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formDate, setFormDate] = useState(() => getCurrentDatePakistan());
  const [formAmount, setFormAmount] = useState("");
  const [formCashBankAccountId, setFormCashBankAccountId] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === formEmployeeId) || null,
    [employees, formEmployeeId],
  );

  const formTypeOptions = useMemo(
    () => (isIssueType(formType) ? ISSUE_TX_TYPE_OPTIONS : RECOVERY_TX_TYPE_OPTIONS),
    [formType],
  );

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getEmployeeLoanAdvanceTransactions({
        search: searchTerm || undefined,
        category: categoryFilter as "all" | "loan" | "advance",
        page: currentPage,
        limit: rowsPerPage,
      });
      if ((response as any)?.error) {
        toast({
          title: "Error",
          description: (response as any).error,
          variant: "destructive",
        });
        return;
      }
      setTransactions((response as any)?.data || []);
      setTotalRecords((response as any)?.pagination?.total || 0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load loan/advance transactions",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, currentPage, rowsPerPage, searchTerm, toast]);

  const fetchEmployees = useCallback(async () => {
    try {
      const response = await apiClient.getEmployees({ status: "active", limit: 500, page: 1 });
      const rows = Array.isArray((response as any)?.data) ? (response as any).data : [];
      setEmployees(
        rows.map((row: any) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          loanBalance: Number(row.loanBalance || 0),
          advanceBalance: Number(row.advanceBalance || 0),
        })),
      );
    } catch {
      setEmployees([]);
    }
  }, []);

  const fetchCashBankAccounts = useCallback(async () => {
    try {
      const response = await apiClient.getEmployeeCashBankAccounts();
      const rows = Array.isArray((response as any)?.data) ? (response as any).data : [];
      setCashBankAccounts(
        rows.map((row: any) => ({
          id: row.id,
          label: row.label || `${row.code} - ${row.name}`,
        })),
      );
    } catch {
      setCashBankAccounts([]);
    }
  }, []);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    void fetchEmployees();
    void fetchCashBankAccounts();
  }, [fetchEmployees, fetchCashBankAccounts]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

  const resetForm = () => {
    setEditingId(null);
    setFormType("advance_issue");
    setFormEmployeeId("");
    setFormDate(getCurrentDatePakistan());
    setFormAmount("");
    setFormCashBankAccountId("");
    setFormDescription("");
  };

  const openCreateDialog = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const openEditDialog = (row: LoanAdvanceTransaction) => {
    const type = (row.type || "advance_issue") as LoanAdvanceTxType;
    setEditingId(row.id);
    setFormType(type);
    setFormEmployeeId(row.Employee?.id || "");
    setFormDate(toDateInputValue(row.date));
    setFormAmount(String(Number(row.amount || 0)));
    setFormCashBankAccountId(row.Voucher?.cashBankAccount || "");
    setFormDescription(row.description || "");
    setIsFormOpen(true);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsFormOpen(open);
    if (!open) resetForm();
  };

  const handleSave = async () => {
    if (!formEmployeeId) {
      toast({
        title: "Validation",
        description: "Please select an employee.",
        variant: "destructive",
      });
      return;
    }

    const amount = Number(formAmount || 0);
    if (amount <= 0) {
      toast({
        title: "Validation",
        description: "Amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (!formCashBankAccountId) {
      toast({
        title: "Validation",
        description: "Please select a cash/bank account.",
        variant: "destructive",
      });
      return;
    }

    if (isFutureDate(formDate)) {
      toast({
        title: "Validation",
        description: "Date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const response = editingId
        ? await apiClient.updateEmployeeLoanAdvanceTransaction(editingId, {
            employeeId: formEmployeeId,
            type: formType,
            date: formDate,
            amount,
            cashBankAccountId: formCashBankAccountId,
            description: formDescription || undefined,
          })
        : await apiClient.createEmployeeTransaction(formEmployeeId, {
            type: formType,
            date: formDate,
            amount,
            cashBankAccountId: formCashBankAccountId,
            description: formDescription || undefined,
          });

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: editingId ? "Transaction updated" : "Transaction posted",
        description: `${TX_TYPE_LABELS[formType]} ${editingId ? "updated" : "recorded"} successfully.`,
      });
      handleDialogOpenChange(false);
      await fetchTransactions();
      await fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Could not save transaction.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Search Employee</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Name or code..."
                    className="pl-9 w-64"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select
                  value={categoryFilter}
                  onValueChange={(value) => {
                    setCategoryFilter(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                    <SelectItem value="advance">Advance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canCreate && (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Loan / Advance
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Loan and advance recoveries are deducted during salary accrual (payroll), not posted separately here.
          </p>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Voucher</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[70px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading transactions...
                    </TableCell>
                  </TableRow>
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No loan or advance transactions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((row, index) => (
                    <TableRow key={row.id}>
                      <ListNumberCell index={index} page={currentPage} pageSize={rowsPerPage} total={totalRecords} />
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.Employee?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {row.Employee?.code || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(row.type)}>
                          {TX_TYPE_LABELS[row.type] || row.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.amount)}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.Voucher?.voucherNumber || row.referenceNo || "—"}
                      </TableCell>
                      <TableCell className="max-w-[240px] truncate">
                        {row.description || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit entry"
                            onClick={() => openEditDialog(row)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="text-muted-foreground">
              {totalRecords} record{totalRecords === 1 ? "" : "s"}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-muted-foreground">Rows</Label>
              <Select
                value={String(rowsPerPage)}
                onValueChange={(value) => {
                  setRowsPerPage(Number(value));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <span className="text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Loan / Advance" : "Issue Loan / Advance"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Transaction Type *</Label>
              <Select
                value={formType}
                onValueChange={(value) => setFormType(value as LoanAdvanceTxType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {formTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editingId && !isIssueType(formType) ? (
                <p className="text-xs text-muted-foreground">
                  Recovery entries can be edited, but cannot be switched to issue types.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={formEmployeeId} onValueChange={setFormEmployeeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.id} value={employee.id}>
                      {employee.code} — {employee.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEmployee ? (
                <p className="text-xs text-muted-foreground">
                  Outstanding loan: {formatMoney(selectedEmployee.loanBalance)} · Advance:{" "}
                  {formatMoney(selectedEmployee.advanceBalance)}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>Date *</Label>
              <Input
                type="date"
                max={todayDateMax()}
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Amount *</Label>
              <Input
                type="number"
                min={0}
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Cash / Bank Account *</Label>
              <Select value={formCashBankAccountId} onValueChange={setFormCashBankAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select account" />
                </SelectTrigger>
                <SelectContent>
                  {cashBankAccounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Post Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
