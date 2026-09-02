import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Pencil,
  History,
  Receipt,
} from "lucide-react";
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
import { calculateAccruedSalary, validateEmployeeSalaryPaymentSplit, validatePayrollExtraFieldDescriptions } from "@/lib/employeePayroll";
import { getCurrentDatePakistan, formatUiDate } from "@/utils/dateUtils";
import { normalizeCashBankModeFromApi } from "@/utils/cashBankMode";

type EmployeeRow = {
  id: string;
  code: string;
  name: string;
  cnic?: string | null;
  contactNo?: string | null;
  email?: string | null;
  address?: string | null;
  designation?: string | null;
  department?: string | null;
  joiningDate?: string | null;
  openingBalanceDate?: string | null;
  monthlySalary: number;
  workingDays: number;
  status: string;
  remarks?: string | null;
  openingLoanBalance?: number;
  openingAdvanceBalance?: number;
  openingSalaryPayable?: number;
  salaryPayableBalance: number;
  loanBalance: number;
  advanceBalance: number;
};

type CashBankOption = {
  id: string;
  label: string;
  mode?: "cash" | "online";
};

type EmployeeTransaction = {
  id: string;
  type: string;
  date: string;
  payrollMonth?: string | null;
  amount: number;
  absentDays?: number;
  loanRecovery: number;
  advanceRecovery: number;
  netPaid: number;
  description?: string | null;
  referenceNo?: string | null;
  Voucher?: { voucherNumber?: string; type?: string } | null;
};

const TX_TYPE_LABELS: Record<string, string> = {
  advance_issue: "Advance Issued",
  loan_issue: "Loan Issued",
  loan_recovery: "Loan Recovery",
  advance_recovery: "Advance Recovery",
  salary_accrual: "Accrue Salary",
  salary_payment: "Pay Salary",
};

const EMPLOYEE_TX_TYPE_OPTIONS = [
  "advance_issue",
  "loan_issue",
  "salary_accrual",
  "salary_payment",
] as const;

const emptyEmployee = {
  code: "",
  name: "",
  cnic: "",
  contactNo: "",
  email: "",
  address: "",
  designation: "",
  department: "",
  joiningDate: "",
  openingBalanceDate: "",
  monthlySalary: 0,
  workingDays: 26,
  status: "active",
  remarks: "",
  openingLoanBalance: 0,
  openingAdvanceBalance: 0,
  openingSalaryPayable: 0,
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value?: string | null) => formatUiDate(value) || "—";

const todayDateMax = () => getCurrentDatePakistan();
const currentMonthMax = () => getCurrentDatePakistan().slice(0, 7);

const isFutureDate = (value?: string | null) => {
  const v = String(value || "").trim();
  if (!v) return false;
  return v > todayDateMax();
};

const isFutureMonth = (value?: string | null) => {
  const v = String(value || "").trim();
  if (!v) return false;
  return v > currentMonthMax();
};

const getCurrentPayrollMonth = () => currentMonthMax();

export const EmployeeManagement = () => {
  const { toast } = useToast();
  const { canCreate, canEdit } = usePageActions("employees.staff");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [cashBankAccounts, setCashBankAccounts] = useState<CashBankOption[]>([]);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyEmployee);
  const [saving, setSaving] = useState(false);

  const [txEmployee, setTxEmployee] = useState<EmployeeRow | null>(null);
  const [txType, setTxType] = useState<string>("salary_payment");
  const [txDate, setTxDate] = useState(() => getCurrentDatePakistan());
  const [txPayrollMonth, setTxPayrollMonth] = useState(() => getCurrentPayrollMonth());
  const [txAmount, setTxAmount] = useState("");
  const [txWorkingDays, setTxWorkingDays] = useState("26");
  const [txAbsentDays, setTxAbsentDays] = useState("");
  const [txLeaves, setTxLeaves] = useState("0");
  const [txLoanRecovery, setTxLoanRecovery] = useState("");
  const [txAdvanceRecovery, setTxAdvanceRecovery] = useState("");
  const [txExtraPayment, setTxExtraPayment] = useState("");
  const [txExtraPaymentDescription, setTxExtraPaymentDescription] = useState("");
  const [txExtraDeduction, setTxExtraDeduction] = useState("");
  const [txExtraDeductionDescription, setTxExtraDeductionDescription] = useState("");
  const [txCashBankAccountId, setTxCashBankAccountId] = useState("");
  const [txCashAmount, setTxCashAmount] = useState("");
  const [txBankAmount, setTxBankAmount] = useState("");
  const [txCashAccountId, setTxCashAccountId] = useState("");
  const [txBankAccountId, setTxBankAccountId] = useState("");
  const [txDescription, setTxDescription] = useState("");
  const [txSaving, setTxSaving] = useState(false);

  const cashAccounts = useMemo(
    () => cashBankAccounts.filter((account) => account.mode === "cash"),
    [cashBankAccounts],
  );
  const bankAccounts = useMemo(
    () => cashBankAccounts.filter((account) => account.mode === "online"),
    [cashBankAccounts],
  );
  const txSalaryPaymentTotal = useMemo(
    () => Math.max(0, Number(txCashAmount || 0)) + Math.max(0, Number(txBankAmount || 0)),
    [txCashAmount, txBankAmount],
  );

  const [historyEmployee, setHistoryEmployee] = useState<EmployeeRow | null>(null);
  const [historyRows, setHistoryRows] = useState<EmployeeTransaction[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTypeFilter, setHistoryTypeFilter] = useState("all");

  const fetchCashBankAccounts = useCallback(async () => {
    try {
      const response = await apiClient.getEmployeeCashBankAccounts();
      const rows = Array.isArray((response as any)?.data) ? (response as any).data : [];
      setCashBankAccounts(
        rows.map((row: any) => ({
          id: row.id,
          label: row.label || `${row.code} - ${row.name}`,
          mode: normalizeCashBankModeFromApi({
            mode: row.mode,
            code: row.code,
          }),
        })),
      );
    } catch {
      setCashBankAccounts([]);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getEmployees({
        search: searchTerm || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
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
      setEmployees((response as any)?.data || []);
      setTotalRecords((response as any)?.pagination?.total || 0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load employees",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, searchTerm, statusFilter, toast]);

  useEffect(() => {
    void fetchEmployees();
    void fetchCashBankAccounts();
  }, [fetchEmployees, fetchCashBankAccounts]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

  const txNeedsCashBank = ["advance_issue", "loan_issue", "salary_payment"].includes(txType);
  const txUsesSplitSalaryPayment = txType === "salary_payment";
  const txSupportsRecoveries = txType === "salary_accrual";

  const grossSalaryPreview = useMemo(() => {
    const amount = Number(txAmount || 0);
    if (txType === "salary_accrual" && txEmployee) {
      return calculateAccruedSalary(
        Number(txEmployee.monthlySalary || 0),
        Number(txWorkingDays || txEmployee.workingDays || 26),
        Number(txAbsentDays || 0),
      );
    }
    if (txType === "salary_payment") {
      return amount > 0 ? amount : Number(txEmployee?.monthlySalary || 0);
    }
    return amount;
  }, [txAbsentDays, txAmount, txEmployee, txType, txWorkingDays]);

  const daysWorkedPreview = useMemo(() => {
    if (txType !== "salary_accrual" || !txEmployee) return 0;
    const workingDays = Math.max(1, Number(txWorkingDays || txEmployee.workingDays || 26));
    const absentDays = Math.min(Math.max(Number(txAbsentDays || 0), 0), workingDays);
    return workingDays - absentDays;
  }, [txAbsentDays, txEmployee, txType, txWorkingDays]);

  const netSalaryPreview = useMemo(() => {
    if (!txSupportsRecoveries) return grossSalaryPreview;
    return (
      grossSalaryPreview -
      Number(txLoanRecovery || 0) -
      Number(txAdvanceRecovery || 0) +
      Number(txExtraPayment || 0) -
      Number(txExtraDeduction || 0)
    );
  }, [
    grossSalaryPreview,
    txAdvanceRecovery,
    txExtraDeduction,
    txExtraPayment,
    txLoanRecovery,
    txSupportsRecoveries,
  ]);

  const filteredHistoryRows = useMemo(() => {
    if (historyTypeFilter === "all") return historyRows;
    if (historyTypeFilter === "payroll") {
      return historyRows.filter((row) => row.type === "salary_accrual" || row.type === "salary_payment");
    }
    if (historyTypeFilter === "loan") {
      return historyRows.filter((row) => row.type === "loan_issue" || row.type === "loan_recovery");
    }
    if (historyTypeFilter === "advance") {
      return historyRows.filter((row) => row.type === "advance_issue" || row.type === "advance_recovery");
    }
    return historyRows;
  }, [historyRows, historyTypeFilter]);

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(emptyEmployee);
    setIsFormOpen(true);
  };

  const openEditDialog = (employee: EmployeeRow) => {
    setEditingId(employee.id);
    setFormData({
      code: employee.code,
      name: employee.name,
      cnic: employee.cnic || "",
      contactNo: employee.contactNo || "",
      email: employee.email || "",
      address: employee.address || "",
      designation: employee.designation || "",
      department: employee.department || "",
      joiningDate: employee.joiningDate ? employee.joiningDate.split("T")[0] : "",
      openingBalanceDate: employee.openingBalanceDate ? employee.openingBalanceDate.split("T")[0] : "",
      monthlySalary: Number(employee.monthlySalary || 0),
      workingDays: Number(employee.workingDays || 26),
      status: employee.status || "active",
      remarks: employee.remarks || "",
      openingLoanBalance: Number(employee.openingLoanBalance || 0),
      openingAdvanceBalance: Number(employee.openingAdvanceBalance || 0),
      openingSalaryPayable: Number(employee.openingSalaryPayable || 0),
    });
    setIsFormOpen(true);
  };

  const openTransactionDialog = (employee: EmployeeRow, type: string) => {
    setTxEmployee(employee);
    setTxType(type);
    setTxDate(getCurrentDatePakistan());
    setTxPayrollMonth(getCurrentPayrollMonth());
    setTxAmount("");
    setTxWorkingDays(String(Number(employee.workingDays || 26)));
    setTxAbsentDays("0");
    setTxLeaves("0");
    setTxLoanRecovery("");
    setTxAdvanceRecovery("");
    setTxExtraPayment("");
    setTxExtraPaymentDescription("");
    setTxExtraDeduction("");
    setTxExtraDeductionDescription("");
    setTxCashBankAccountId(cashBankAccounts[0]?.id || "");
    setTxCashAmount(type === "salary_payment" ? String(employee.salaryPayableBalance || "") : "");
    setTxBankAmount("");
    setTxCashAccountId(cashAccounts[0]?.id || "");
    setTxBankAccountId(bankAccounts[0]?.id || "");
    setTxDescription("");
  };

  const openHistoryDialog = async (employee: EmployeeRow) => {
    setHistoryEmployee(employee);
    setHistoryTypeFilter("all");
    setHistoryLoading(true);
    try {
      const response = await apiClient.getEmployeeTransactions(employee.id);
      setHistoryRows(Array.isArray((response as any)?.data) ? (response as any).data : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load employee transactions",
        variant: "destructive",
      });
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSaveEmployee = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation",
        description: "Employee name is required.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.joiningDate?.trim()) {
      toast({
        title: "Validation",
        description: "Joining date is required.",
        variant: "destructive",
      });
      return;
    }

    if (isFutureDate(formData.joiningDate)) {
      toast({
        title: "Validation",
        description: "Joining date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (isFutureDate(formData.openingBalanceDate)) {
      toast({
        title: "Validation",
        description: "Opening balance date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    const monthlySalary = Number(formData.monthlySalary);
    if (!Number.isFinite(monthlySalary) || monthlySalary <= 0) {
      toast({
        title: "Validation",
        description: "Monthly salary is required.",
        variant: "destructive",
      });
      return;
    }

    const workingDays = Number(formData.workingDays);
    if (!Number.isFinite(workingDays) || workingDays < 1) {
      toast({
        title: "Validation",
        description: "Working days is required.",
        variant: "destructive",
      });
      return;
    }

    const openingLoanBalance = Number(formData.openingLoanBalance || 0);
    const openingAdvanceBalance = Number(formData.openingAdvanceBalance || 0);
    const openingSalaryPayable = Number(formData.openingSalaryPayable || 0);
    const hasOpeningAmount =
      openingLoanBalance !== 0 || openingAdvanceBalance !== 0 || openingSalaryPayable !== 0;
    const hasOpeningDate = Boolean(formData.openingBalanceDate?.trim());

    if (hasOpeningAmount && !hasOpeningDate) {
      toast({
        title: "Validation",
        description: "Opening balance date is required when opening loan, advance, or salary payable is entered.",
        variant: "destructive",
      });
      return;
    }

    if (hasOpeningDate && !hasOpeningAmount) {
      toast({
        title: "Validation",
        description: "Enter at least one opening balance amount when opening balance date is set.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const { code: _code, ...employeeFields } = formData;
      const payload = {
        ...employeeFields,
        name: formData.name.trim(),
        monthlySalary,
        workingDays,
        openingLoanBalance,
        openingAdvanceBalance,
        openingSalaryPayable,
        joiningDate: formData.joiningDate || undefined,
        openingBalanceDate: formData.openingBalanceDate || undefined,
      };

      const response = editingId
        ? await apiClient.updateEmployee(editingId, payload)
        : await apiClient.createEmployee(payload);

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: editingId ? "Employee updated" : "Employee created",
        description: `${formData.name} has been saved.`,
      });
      setIsFormOpen(false);
      await fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Save failed",
        description: error.message || "Could not save employee.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTransaction = async () => {
    if (!txEmployee) return;

    if (isFutureDate(txDate)) {
      toast({
        title: "Validation",
        description: "Date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (
      (txType === "salary_accrual" || txType === "salary_payment") &&
      isFutureMonth(txPayrollMonth)
    ) {
      toast({
        title: "Validation",
        description: "Payroll month cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if ((txType === "salary_accrual" || txType === "salary_payment") && !txPayrollMonth) {
      toast({
        title: "Validation",
        description: "Payroll month is required.",
        variant: "destructive",
      });
      return;
    }

    if (txType === "salary_accrual") {
      const workingDays = Number(txWorkingDays || 0);
      const absentDays = Number(txAbsentDays || 0);
      if (!Number.isFinite(workingDays) || workingDays < 1) {
        toast({
          title: "Validation",
          description: "Working days must be at least 1.",
          variant: "destructive",
        });
        return;
      }
      if (absentDays < 0) {
        toast({
          title: "Validation",
          description: "Absent days cannot be negative.",
          variant: "destructive",
        });
        return;
      }
      if (absentDays > workingDays) {
        toast({
          title: "Validation",
          description: "Absent days cannot exceed working days.",
          variant: "destructive",
        });
        return;
      }
      const leaves = Number(txLeaves || 0);
      if (leaves < 0) {
        toast({
          title: "Validation",
          description: "Leaves cannot be negative.",
          variant: "destructive",
        });
        return;
      }
      if (grossSalaryPreview <= 0) {
        toast({
          title: "Validation",
          description: "Accrued salary must be greater than zero.",
          variant: "destructive",
        });
        return;
      }

      const extraFieldError = validatePayrollExtraFieldDescriptions({
        extraPayment: Number(txExtraPayment || 0),
        extraPaymentDescription: txExtraPaymentDescription,
        extraDeduction: Number(txExtraDeduction || 0),
        extraDeductionDescription: txExtraDeductionDescription,
      });
      if (extraFieldError) {
        toast({
          title: "Validation",
          description: extraFieldError,
          variant: "destructive",
        });
        return;
      }
    }

    if (txUsesSplitSalaryPayment) {
      const paymentError = validateEmployeeSalaryPaymentSplit({
        cashAmount: Number(txCashAmount || 0),
        bankAmount: Number(txBankAmount || 0),
        outstanding: Number(txEmployee.salaryPayableBalance || 0),
        cashAccountId: txCashAccountId,
        bankAccountId: txBankAccountId,
      });
      if (paymentError) {
        toast({
          title: "Validation",
          description: paymentError,
          variant: "destructive",
        });
        return;
      }
    } else if (txNeedsCashBank && !txCashBankAccountId) {
      toast({
        title: "Validation",
        description: "Please select a cash/bank account.",
        variant: "destructive",
      });
      return;
    }

    setTxSaving(true);
    try {
      const response = await apiClient.createEmployeeTransaction(txEmployee.id, {
        type: txType as any,
        date: txDate,
        payrollMonth: txType === "salary_accrual" || txType === "salary_payment" ? txPayrollMonth : undefined,
        amount:
          txType === "salary_accrual"
            ? undefined
            : txUsesSplitSalaryPayment
              ? undefined
              : Number(txAmount || 0),
        absentDays: txType === "salary_accrual" ? Number(txAbsentDays || 0) : undefined,
        leaves: txType === "salary_accrual" ? Number(txLeaves || 0) : undefined,
        workingDays: txType === "salary_accrual" ? Number(txWorkingDays || 0) : undefined,
        loanRecovery: Number(txLoanRecovery || 0),
        advanceRecovery: Number(txAdvanceRecovery || 0),
        extraPayment: Number(txExtraPayment || 0),
        extraPaymentDescription: txExtraPaymentDescription || undefined,
        extraDeduction: Number(txExtraDeduction || 0),
        extraDeductionDescription: txExtraDeductionDescription || undefined,
        cashBankAccountId: txUsesSplitSalaryPayment ? undefined : txCashBankAccountId || undefined,
        cashAmount: txUsesSplitSalaryPayment ? Math.max(0, Number(txCashAmount || 0)) : undefined,
        bankAmount: txUsesSplitSalaryPayment ? Math.max(0, Number(txBankAmount || 0)) : undefined,
        cashAccountId:
          txUsesSplitSalaryPayment && Number(txCashAmount || 0) > 0
            ? txCashAccountId
            : undefined,
        bankAccountId:
          txUsesSplitSalaryPayment && Number(txBankAmount || 0) > 0
            ? txBankAccountId
            : undefined,
        description: txDescription || undefined,
      });

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: "Transaction posted",
        description: `${TX_TYPE_LABELS[txType] || txType} recorded for ${txEmployee.name}.`,
      });
      setTxEmployee(null);
      await fetchEmployees();
      if (historyEmployee?.id === txEmployee.id) {
        await openHistoryDialog(txEmployee);
      }
    } catch (error: any) {
      toast({
        title: "Transaction failed",
        description: error.message || "Could not post transaction.",
        variant: "destructive",
      });
    } finally {
      setTxSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="Name, code, department..."
                    className="pl-9 w-64"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                    setStatusFilter(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canCreate && (
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Add Employee
              </Button>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead className="text-right">Monthly Salary</TableHead>
                  <TableHead className="text-right">Salary Payable</TableHead>
                  <TableHead className="text-right">Loan</TableHead>
                  <TableHead className="text-right">Advance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      Loading employees...
                    </TableCell>
                  </TableRow>
                ) : employees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                      No employees found.
                    </TableCell>
                  </TableRow>
                ) : (
                  employees.map((employee, index) => (
                    <TableRow key={employee.id}>
                      <ListNumberCell index={index} page={currentPage} pageSize={rowsPerPage} total={totalRecords} />
                      <TableCell className="font-mono text-xs">{employee.code}</TableCell>
                      <TableCell className="font-medium">{employee.name}</TableCell>
                      <TableCell>{employee.department || "—"}</TableCell>
                      <TableCell>{employee.designation || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(employee.monthlySalary)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(employee.salaryPayableBalance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(employee.loanBalance)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(employee.advanceBalance)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={employee.status === "active" ? "default" : "secondary"}>
                          {employee.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => openEditDialog(employee)}
                              title="Edit"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canCreate && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openTransactionDialog(employee, "salary_accrual")}
                            >
                              <Receipt className="h-3.5 w-3.5 mr-1" />
                              Accrue
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void openHistoryDialog(employee)}
                          >
                            <History className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {employees.length} of {totalRecords} employees
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((page) => page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            {editingId && (
              <div className="space-y-2">
                <Label>Employee Code</Label>
                <p className="rounded-md border bg-muted px-3 py-2 text-sm font-mono">{formData.code}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>CNIC</Label>
              <Input
                value={formData.cnic}
                onChange={(e) => setFormData({ ...formData, cnic: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Contact No</Label>
              <Input
                value={formData.contactNo}
                onChange={(e) => setFormData({ ...formData, contactNo: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Joining Date *</Label>
              <Input
                type="date"
                required
                max={todayDateMax()}
                value={formData.joiningDate}
                onChange={(e) => setFormData({ ...formData, joiningDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Department</Label>
              <Input
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Designation</Label>
              <Input
                value={formData.designation}
                onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Monthly Salary *</Label>
              <Input
                type="number"
                min={1}
                required
                value={formData.monthlySalary}
                onChange={(e) =>
                  setFormData({ ...formData, monthlySalary: Number(e.target.value || 0) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Working Days / Month *</Label>
              <Input
                type="number"
                min={1}
                required
                value={formData.workingDays}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    workingDays: Math.max(1, Number(e.target.value || 26)),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Opening Balance Date</Label>
              <Input
                type="date"
                max={todayDateMax()}
                value={formData.openingBalanceDate}
                onChange={(e) => setFormData({ ...formData, openingBalanceDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Opening Loan Balance</Label>
              <Input
                type="number"
                value={formData.openingLoanBalance}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    openingLoanBalance: Number(e.target.value || 0),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Opening Advance Balance</Label>
              <Input
                type="number"
                value={formData.openingAdvanceBalance}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    openingAdvanceBalance: Number(e.target.value || 0),
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Opening Salary Payable</Label>
              <Input
                type="number"
                value={formData.openingSalaryPayable}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    openingSalaryPayable: Number(e.target.value || 0),
                  })
                }
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Address</Label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Remarks</Label>
              <Textarea
                value={formData.remarks}
                onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEmployee()} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(txEmployee)} onOpenChange={(open) => !open && setTxEmployee(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-4 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {TX_TYPE_LABELS[txType] || "Employee Transaction"}
              {txEmployee ? ` — ${txEmployee.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-2">
              <Label>Transaction Type</Label>
              <Select value={txType} onValueChange={setTxType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_TX_TYPE_OPTIONS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TX_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input
                type="date"
                max={todayDateMax()}
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
              />
            </div>
            {(txType === "salary_accrual" || txType === "salary_payment") && (
              <div className="space-y-2">
                <Label>Payroll Month</Label>
                <Input
                  type="month"
                  max={currentMonthMax()}
                  value={txPayrollMonth}
                  onChange={(e) => setTxPayrollMonth(e.target.value)}
                />
              </div>
            )}
            {txType === "salary_accrual" && txEmployee ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Working Days</Label>
                    <Input
                      type="number"
                      min={1}
                      value={txWorkingDays}
                      onChange={(e) => {
                        const next = e.target.value;
                        setTxWorkingDays(next);
                        const maxDays = Math.max(1, Number(next || 0));
                        if (Number(txAbsentDays || 0) > maxDays) {
                          setTxAbsentDays(String(maxDays));
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default from employee profile ({Number(txEmployee.workingDays || 26)}). Change only for this payroll.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Absent Days</Label>
                    <Input
                      type="number"
                      min={0}
                      max={Math.max(1, Number(txWorkingDays || 26))}
                      value={txAbsentDays}
                      onChange={(e) => setTxAbsentDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Leaves</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txLeaves}
                      onChange={(e) => setTxLeaves(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Monthly salary: {formatMoney(txEmployee.monthlySalary)} · Days worked:{" "}
                  {daysWorkedPreview} / {Math.max(1, Number(txWorkingDays || 26))}
                </p>
              </>
            ) : txUsesSplitSalaryPayment ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Salary payable balance: {formatMoney(txEmployee?.salaryPayableBalance || 0)}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Cash Amount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txCashAmount}
                      onChange={(e) => setTxCashAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Cash Account</Label>
                    <Select value={txCashAccountId} onValueChange={setTxCashAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select cash account" />
                      </SelectTrigger>
                      <SelectContent>
                        {cashAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Amount</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txBankAmount}
                      onChange={(e) => setTxBankAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bank Account</Label>
                    <Select value={txBankAccountId} onValueChange={setTxBankAccountId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select bank account" />
                      </SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm flex justify-between">
                  <span>Total Payment</span>
                  <span className="font-semibold tabular-nums">{formatMoney(txSalaryPaymentTotal)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  type="number"
                  min={0}
                  value={txAmount}
                  onChange={(e) => setTxAmount(e.target.value)}
                />
              </div>
            )}
            {txSupportsRecoveries ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Loan Recovery</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txLoanRecovery}
                      onChange={(e) => setTxLoanRecovery(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Outstanding: {formatMoney(txEmployee?.loanBalance || 0)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Advance Recovery</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txAdvanceRecovery}
                      onChange={(e) => setTxAdvanceRecovery(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Outstanding: {formatMoney(txEmployee?.advanceBalance || 0)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Extra Payment</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txExtraPayment}
                      onChange={(e) => setTxExtraPayment(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Extra Payment Description
                      {Number(txExtraPayment || 0) > 0 ? " *" : ""}
                    </Label>
                    <Input
                      value={txExtraPaymentDescription}
                      onChange={(e) => setTxExtraPaymentDescription(e.target.value)}
                      required={Number(txExtraPayment || 0) > 0}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Extra Deduction</Label>
                    <Input
                      type="number"
                      min={0}
                      value={txExtraDeduction}
                      onChange={(e) => setTxExtraDeduction(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Extra Deduction Description
                      {Number(txExtraDeduction || 0) > 0 ? " *" : ""}
                    </Label>
                    <Input
                      value={txExtraDeductionDescription}
                      onChange={(e) => setTxExtraDeductionDescription(e.target.value)}
                      required={Number(txExtraDeduction || 0) > 0}
                    />
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Accrued Gross Salary</span>
                    <span className="tabular-nums">{formatMoney(grossSalaryPreview)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net Salary Payable</span>
                    <span className="font-semibold tabular-nums">{formatMoney(netSalaryPreview)}</span>
                  </div>
                </div>
              </>
            ) : null}
            {txNeedsCashBank && !txUsesSplitSalaryPayment ? (
              <div className="space-y-2">
                <Label>Cash / Bank Account</Label>
                <Select value={txCashBankAccountId} onValueChange={setTxCashBankAccountId}>
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
            ) : null}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setTxEmployee(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveTransaction()} disabled={txSaving}>
              {txSaving ? "Posting..." : "Post Transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(historyEmployee)} onOpenChange={(open) => !open && setHistoryEmployee(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Transaction History{historyEmployee ? ` — ${historyEmployee.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="flex justify-end">
            <Select value={historyTypeFilter} onValueChange={setHistoryTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions</SelectItem>
                <SelectItem value="payroll">Payroll</SelectItem>
                <SelectItem value="loan">Loan</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {historyLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading transactions...</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Payroll Month</TableHead>
                    <TableHead className="text-right">Absent</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Loan Rec.</TableHead>
                    <TableHead className="text-right">Advance Rec.</TableHead>
                    <TableHead className="text-right">Net Paid</TableHead>
                    <TableHead>Voucher</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredHistoryRows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                        No transactions yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredHistoryRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{formatDate(row.date)}</TableCell>
                        <TableCell>{TX_TYPE_LABELS[row.type] || row.type}</TableCell>
                        <TableCell className="font-mono text-xs">{row.payrollMonth || "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {row.type === "salary_accrual" ? Number(row.absentDays || 0) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.amount)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.loanRecovery)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.advanceRecovery)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(row.netPaid)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {row.Voucher?.voucherNumber || row.referenceNo || "—"}
                        </TableCell>
                        <TableCell>{row.description || "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
