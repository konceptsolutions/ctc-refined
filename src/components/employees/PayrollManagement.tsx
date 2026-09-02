import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Pencil, Plus, Printer, Receipt, Search } from "lucide-react";
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
import { printPayslipPdf } from "@/utils/payslipPdf";
import { getCurrentDatePakistan, formatUiDate } from "@/utils/dateUtils";
import { normalizeCashBankModeFromApi } from "@/utils/cashBankMode";

type PayrollRow = {
  id: string;
  employeeId: string;
  date: string;
  payrollMonth?: string | null;
  grossAmount: number;
  absentDays: number;
  leaves: number;
  workingDays: number;
  daysWorked: number;
  loanRecovery: number;
  advanceRecovery: number;
  extraPayment?: number;
  extraPaymentDescription?: string | null;
  extraDeduction?: number;
  extraDeductionDescription?: string | null;
  netPayable: number;
  paidAmount: number;
  outstanding: number;
  paymentStatus: "pending" | "partial" | "paid";
  hasAccrual?: boolean;
  description?: string | null;
  referenceNo?: string | null;
  voucherNumber?: string | null;
  employee?: {
    id: string;
    code: string;
    name: string;
    monthlySalary: number;
    workingDays: number;
    department?: string | null;
    designation?: string | null;
  } | null;
  payments?: Array<{ date: string; amount: number; referenceNo?: string | null }>;
};

type CashBankOption = {
  id: string;
  label: string;
  mode?: "cash" | "online";
};

type EmployeeOption = {
  id: string;
  code: string;
  name: string;
  monthlySalary: number;
  workingDays: number;
  loanBalance: number;
  advanceBalance: number;
};

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

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value?: string | null) => formatUiDate(value) || "—";

const formatPayrollMonth = (value?: string | null) => {
  if (!value) return "—";
  const [year, month] = value.split("-");
  if (!year || !month) return value;
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-PK", { month: "long", year: "numeric" });
};

const getStatusBadge = (status: PayrollRow["paymentStatus"]) => {
  if (status === "paid") return <Badge>Paid</Badge>;
  if (status === "partial") return <Badge variant="secondary">Partial</Badge>;
  return <Badge variant="outline">Pending</Badge>;
};

export const PayrollManagement = () => {
  const { toast } = useToast();
  const { canCreate, canEdit, canPrint } = usePageActions("employees.payroll");
  const [rows, setRows] = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [payrollMonthFilter, setPayrollMonthFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [totalRecords, setTotalRecords] = useState(0);
  const [cashBankAccounts, setCashBankAccounts] = useState<CashBankOption[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);

  const [isAccrueOpen, setIsAccrueOpen] = useState(false);
  const [editingPayrollId, setEditingPayrollId] = useState<string | null>(null);
  const [editingPaidAmount, setEditingPaidAmount] = useState(0);
  const [accrueEmployeeId, setAccrueEmployeeId] = useState("");
  const [accrueDate, setAccrueDate] = useState(() => getCurrentDatePakistan());
  const [accruePayrollMonth, setAccruePayrollMonth] = useState(() => getCurrentPayrollMonth());
  const [accrueWorkingDays, setAccrueWorkingDays] = useState("26");
  const [accrueAbsentDays, setAccrueAbsentDays] = useState("0");
  const [accrueLeaves, setAccrueLeaves] = useState("0");
  const [accrueLoanRecovery, setAccrueLoanRecovery] = useState("");
  const [accrueAdvanceRecovery, setAccrueAdvanceRecovery] = useState("");
  const [accrueExtraPayment, setAccrueExtraPayment] = useState("");
  const [accrueExtraPaymentDescription, setAccrueExtraPaymentDescription] = useState("");
  const [accrueExtraDeduction, setAccrueExtraDeduction] = useState("");
  const [accrueExtraDeductionDescription, setAccrueExtraDeductionDescription] = useState("");
  const [accrueDescription, setAccrueDescription] = useState("");
  const [accrueSaving, setAccrueSaving] = useState(false);

  const [payRow, setPayRow] = useState<PayrollRow | null>(null);
  const [payDate, setPayDate] = useState(() => getCurrentDatePakistan());
  const [payCashAmount, setPayCashAmount] = useState("");
  const [payBankAmount, setPayBankAmount] = useState("");
  const [payCashAccountId, setPayCashAccountId] = useState("");
  const [payBankAccountId, setPayBankAccountId] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [paySaving, setPaySaving] = useState(false);

  const cashAccounts = useMemo(
    () => cashBankAccounts.filter((account) => account.mode === "cash"),
    [cashBankAccounts],
  );
  const bankAccounts = useMemo(
    () => cashBankAccounts.filter((account) => account.mode === "online"),
    [cashBankAccounts],
  );
  const payTotalAmount = useMemo(
    () => Math.max(0, Number(payCashAmount || 0)) + Math.max(0, Number(payBankAmount || 0)),
    [payCashAmount, payBankAmount],
  );

  const fetchPayroll = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.getEmployeePayrollTransactions({
        search: searchTerm || undefined,
        payrollMonth: payrollMonthFilter || undefined,
        paymentStatus: statusFilter as "all" | "pending" | "partial" | "paid",
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
      setRows((response as any)?.data || []);
      setTotalRecords((response as any)?.pagination?.total || 0);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load payroll records",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, payrollMonthFilter, rowsPerPage, searchTerm, statusFilter, toast]);

  const fetchCashBankAccounts = useCallback(async () => {
    try {
      const response = await apiClient.getEmployeeCashBankAccounts();
      const accounts = Array.isArray((response as any)?.data) ? (response as any).data : [];
      setCashBankAccounts(
        accounts.map((row: any) => ({
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
    try {
      const response = await apiClient.getEmployees({ status: "active", limit: 500, page: 1 });
      const rows = Array.isArray((response as any)?.data) ? (response as any).data : [];
      setEmployees(
        rows.map((row: any) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          monthlySalary: Number(row.monthlySalary || 0),
          workingDays: Number(row.workingDays || 26),
          loanBalance: Number(row.loanBalance || 0),
          advanceBalance: Number(row.advanceBalance || 0),
        })),
      );
    } catch {
      setEmployees([]);
    }
  }, []);

  useEffect(() => {
    void fetchPayroll();
  }, [fetchPayroll]);

  useEffect(() => {
    void fetchCashBankAccounts();
    void fetchEmployees();
  }, [fetchCashBankAccounts, fetchEmployees]);

  const selectedAccrueEmployee = useMemo(
    () => employees.find((employee) => employee.id === accrueEmployeeId) || null,
    [accrueEmployeeId, employees],
  );

  useEffect(() => {
    if (!selectedAccrueEmployee) return;
    if (editingPayrollId) return;
    setAccrueWorkingDays(String(Number(selectedAccrueEmployee.workingDays || 26)));
    setAccrueAbsentDays("0");
    setAccrueLeaves("0");
  }, [selectedAccrueEmployee?.id, editingPayrollId]);

  const grossSalaryPreview = useMemo(() => {
    if (!selectedAccrueEmployee) return 0;
    return calculateAccruedSalary(
      selectedAccrueEmployee.monthlySalary,
      Number(accrueWorkingDays || selectedAccrueEmployee.workingDays || 26),
      Number(accrueAbsentDays || 0),
    );
  }, [accrueAbsentDays, accrueWorkingDays, selectedAccrueEmployee]);

  const netSalaryPreview = useMemo(
    () =>
      grossSalaryPreview -
      Number(accrueLoanRecovery || 0) -
      Number(accrueAdvanceRecovery || 0) +
      Number(accrueExtraPayment || 0) -
      Number(accrueExtraDeduction || 0),
    [
      accrueAdvanceRecovery,
      accrueExtraDeduction,
      accrueExtraPayment,
      accrueLoanRecovery,
      grossSalaryPreview,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

  const handlePrint = (row: PayrollRow) => {
    const started = printPayslipPdf(row);
    if (!started) {
      toast({
        title: "Print blocked",
        description: "Payslip downloaded as PDF instead. Open it and print from there.",
      });
    }
  };

  const openPayDialog = (row: PayrollRow) => {
    setPayRow(row);
    setPayDate(getCurrentDatePakistan());
    setPayCashAmount(String(row.outstanding || ""));
    setPayBankAmount("");
    setPayCashAccountId(cashAccounts[0]?.id || "");
    setPayBankAccountId(bankAccounts[0]?.id || "");
    setPayDescription(`Salary payment for ${formatPayrollMonth(row.payrollMonth)}`);
  };

  const resetAccrueForm = () => {
    setEditingPayrollId(null);
    setEditingPaidAmount(0);
    setAccrueEmployeeId("");
    setAccrueDate(getCurrentDatePakistan());
    setAccruePayrollMonth(getCurrentPayrollMonth());
    setAccrueWorkingDays("26");
    setAccrueAbsentDays("0");
    setAccrueLeaves("0");
    setAccrueLoanRecovery("");
    setAccrueAdvanceRecovery("");
    setAccrueExtraPayment("");
    setAccrueExtraPaymentDescription("");
    setAccrueExtraDeduction("");
    setAccrueExtraDeductionDescription("");
    setAccrueDescription("");
  };

  const openAccrueDialog = () => {
    resetAccrueForm();
    setIsAccrueOpen(true);
  };

  const openEditPayrollDialog = (row: PayrollRow) => {
    if (row.hasAccrual === false) {
      toast({
        title: "Cannot edit",
        description: "Payment-only rows have no accrual to edit.",
        variant: "destructive",
      });
      return;
    }
    if (row.paymentStatus === "paid") {
      toast({
        title: "Cannot edit",
        description: "Fully paid payroll cannot be edited.",
        variant: "destructive",
      });
      return;
    }

    setEditingPayrollId(row.id);
    setEditingPaidAmount(Number(row.paidAmount || 0));
    setAccrueEmployeeId(row.employeeId);
    setAccrueDate(String(row.date || "").split("T")[0] || getCurrentDatePakistan());
    setAccruePayrollMonth(row.payrollMonth || getCurrentPayrollMonth());
    setAccrueWorkingDays(String(Number(row.workingDays || row.employee?.workingDays || 26)));
    setAccrueAbsentDays(String(Number(row.absentDays || 0)));
    setAccrueLeaves(String(Number(row.leaves || 0)));
    setAccrueLoanRecovery(
      Number(row.loanRecovery || 0) > 0 ? String(row.loanRecovery) : "",
    );
    setAccrueAdvanceRecovery(
      Number(row.advanceRecovery || 0) > 0 ? String(row.advanceRecovery) : "",
    );
    setAccrueExtraPayment(
      Number(row.extraPayment || 0) > 0 ? String(row.extraPayment) : "",
    );
    setAccrueExtraPaymentDescription(row.extraPaymentDescription || "");
    setAccrueExtraDeduction(
      Number(row.extraDeduction || 0) > 0 ? String(row.extraDeduction) : "",
    );
    setAccrueExtraDeductionDescription(row.extraDeductionDescription || "");
    setAccrueDescription(row.description || "");
    setIsAccrueOpen(true);
  };

  const handleAccrueDialogOpenChange = (open: boolean) => {
    setIsAccrueOpen(open);
    if (!open) resetAccrueForm();
  };

  const handleAccrue = async () => {
    if (!accrueEmployeeId) {
      toast({
        title: "Validation",
        description: "Please select an employee.",
        variant: "destructive",
      });
      return;
    }

    if (!accruePayrollMonth) {
      toast({
        title: "Validation",
        description: "Payroll month is required.",
        variant: "destructive",
      });
      return;
    }

    if (isFutureMonth(accruePayrollMonth)) {
      toast({
        title: "Validation",
        description: "Payroll month cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (isFutureDate(accrueDate)) {
      toast({
        title: "Validation",
        description: "Accrual date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedAccrueEmployee) return;

    const workingDays = Number(accrueWorkingDays || 0);
    const absentDays = Number(accrueAbsentDays || 0);
    const leaves = Number(accrueLeaves || 0);
    if (!Number.isFinite(workingDays) || workingDays < 1) {
      toast({
        title: "Validation",
        description: "Working days must be at least 1.",
        variant: "destructive",
      });
      return;
    }
    if (absentDays < 0 || absentDays > workingDays) {
      toast({
        title: "Validation",
        description: "Absent days must be between 0 and working days.",
        variant: "destructive",
      });
      return;
    }
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

    if (netSalaryPreview + 0.01 < editingPaidAmount) {
      toast({
        title: "Validation",
        description: `Net payable cannot be less than amount already paid (${formatMoney(editingPaidAmount)}).`,
        variant: "destructive",
      });
      return;
    }

    const extraFieldError = validatePayrollExtraFieldDescriptions({
      extraPayment: Number(accrueExtraPayment || 0),
      extraPaymentDescription: accrueExtraPaymentDescription,
      extraDeduction: Number(accrueExtraDeduction || 0),
      extraDeductionDescription: accrueExtraDeductionDescription,
    });
    if (extraFieldError) {
      toast({
        title: "Validation",
        description: extraFieldError,
        variant: "destructive",
      });
      return;
    }

    setAccrueSaving(true);
    try {
      const response = editingPayrollId
        ? await apiClient.updateEmployeePayrollTransaction(editingPayrollId, {
            date: accrueDate,
            payrollMonth: accruePayrollMonth,
            workingDays,
            absentDays,
            leaves,
            loanRecovery: Number(accrueLoanRecovery || 0),
            advanceRecovery: Number(accrueAdvanceRecovery || 0),
            extraPayment: Number(accrueExtraPayment || 0),
            extraPaymentDescription: accrueExtraPaymentDescription || undefined,
            extraDeduction: Number(accrueExtraDeduction || 0),
            extraDeductionDescription: accrueExtraDeductionDescription || undefined,
            description: accrueDescription || undefined,
          })
        : await apiClient.createEmployeeTransaction(accrueEmployeeId, {
            type: "salary_accrual",
            date: accrueDate,
            payrollMonth: accruePayrollMonth,
            workingDays,
            absentDays,
            leaves,
            loanRecovery: Number(accrueLoanRecovery || 0),
            advanceRecovery: Number(accrueAdvanceRecovery || 0),
            extraPayment: Number(accrueExtraPayment || 0),
            extraPaymentDescription: accrueExtraPaymentDescription || undefined,
            extraDeduction: Number(accrueExtraDeduction || 0),
            extraDeductionDescription: accrueExtraDeductionDescription || undefined,
            description: accrueDescription || undefined,
          });

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: editingPayrollId ? "Payroll updated" : "Payroll accrued",
        description: editingPayrollId
          ? `Salary accrual updated for ${selectedAccrueEmployee.name}.`
          : `Salary accrued for ${selectedAccrueEmployee.name}.`,
      });
      handleAccrueDialogOpenChange(false);
      await fetchPayroll();
      await fetchEmployees();
    } catch (error: any) {
      toast({
        title: editingPayrollId ? "Update failed" : "Accrual failed",
        description: error.message || "Could not save payroll.",
        variant: "destructive",
      });
    } finally {
      setAccrueSaving(false);
    }
  };

  const handlePay = async () => {
    if (!payRow) return;

    if (isFutureDate(payDate)) {
      toast({
        title: "Validation",
        description: "Payment date cannot be in the future.",
        variant: "destructive",
      });
      return;
    }

    const cashAmount = Math.max(0, Number(payCashAmount || 0));
    const bankAmount = Math.max(0, Number(payBankAmount || 0));
    const paymentError = validateEmployeeSalaryPaymentSplit({
      cashAmount,
      bankAmount,
      outstanding: payRow.outstanding,
      cashAccountId: payCashAccountId,
      bankAccountId: payBankAccountId,
    });
    if (paymentError) {
      toast({
        title: "Validation",
        description: paymentError,
        variant: "destructive",
      });
      return;
    }

    setPaySaving(true);
    try {
      const response = await apiClient.createEmployeeTransaction(payRow.employeeId, {
        type: "salary_payment",
        date: payDate,
        payrollMonth: payRow.payrollMonth || undefined,
        cashAmount,
        bankAmount,
        cashAccountId: cashAmount > 0 ? payCashAccountId : undefined,
        bankAccountId: bankAmount > 0 ? payBankAccountId : undefined,
        description: payDescription || undefined,
      });

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: "Payment posted",
        description: `Salary payment recorded for ${payRow.employee?.name || "employee"}.`,
      });
      setPayRow(null);
      await fetchPayroll();
    } catch (error: any) {
      toast({
        title: "Payment failed",
        description: error.message || "Could not post salary payment.",
        variant: "destructive",
      });
    } finally {
      setPaySaving(false);
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
                <Label>Payroll Month</Label>
                <Input
                  type="month"
                  value={payrollMonthFilter}
                  onChange={(e) => {
                    setPayrollMonthFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-44"
                />
              </div>
              <div className="space-y-2">
                <Label>Payment Status</Label>
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
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {canCreate && (
              <Button onClick={openAccrueDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Accrue Salary
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Use <strong>Accrue Salary</strong> to generate payroll first, then pay from this list. Paying alone does not create a full payroll record.
          </p>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Month</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Accrual Date</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Absent</TableHead>
                  <TableHead className="text-right">Leaves</TableHead>
                  <TableHead className="text-right">Loan Rec.</TableHead>
                  <TableHead className="text-right">Advance Rec.</TableHead>
                  <TableHead className="text-right">Net Payable</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Outstanding</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      Loading payroll records...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No payroll records found. Click Accrue Salary to generate payroll.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => (
                    <TableRow key={row.id}>
                      <ListNumberCell index={index} page={currentPage} pageSize={rowsPerPage} total={totalRecords} />
                      <TableCell>{formatPayrollMonth(row.payrollMonth)}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.employee?.name || "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {row.employee?.code || "—"}
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(row.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.grossAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.absentDays}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.leaves ?? 0}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.loanRecovery)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.advanceRecovery)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.netPayable)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.paidAmount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatMoney(row.outstanding)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          {getStatusBadge(row.paymentStatus)}
                          {row.hasAccrual === false ? (
                            <Badge variant="outline" className="w-fit text-[10px]">
                              Payment only
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {canPrint && (
                            <Button size="sm" variant="outline" onClick={() => handlePrint(row)}>
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canEdit && row.hasAccrual !== false && row.paymentStatus !== "paid" ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              title="Edit payroll"
                              onClick={() => openEditPayrollDialog(row)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          ) : null}
                          {canCreate && row.hasAccrual !== false && row.outstanding > 0.01 ? (
                            <Button size="sm" variant="outline" onClick={() => openPayDialog(row)}>
                              <Banknote className="h-3.5 w-3.5 mr-1" />
                              Pay
                            </Button>
                          ) : null}
                        </div>
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

      <Dialog open={Boolean(payRow)} onOpenChange={(open) => !open && setPayRow(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Pay Salary
              {payRow ? ` — ${payRow.employee?.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {payRow ? (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span>Payroll Month</span>
                  <span>{formatPayrollMonth(payRow.payrollMonth)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Net Payable</span>
                  <span className="tabular-nums">{formatMoney(payRow.netPayable)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Already Paid</span>
                  <span className="tabular-nums">{formatMoney(payRow.paidAmount)}</span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Outstanding</span>
                  <span className="tabular-nums">{formatMoney(payRow.outstanding)}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Payment Date *</Label>
                <Input
                  type="date"
                  max={todayDateMax()}
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Cash Amount</Label>
                  <Input
                    type="number"
                    min={0}
                    value={payCashAmount}
                    onChange={(e) => setPayCashAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cash Account</Label>
                  <Select value={payCashAccountId} onValueChange={setPayCashAccountId}>
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
                    value={payBankAmount}
                    onChange={(e) => setPayBankAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank Account</Label>
                  <Select value={payBankAccountId} onValueChange={setPayBankAccountId}>
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
                <span className="font-semibold tabular-nums">{formatMoney(payTotalAmount)}</span>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={payDescription}
                  onChange={(e) => setPayDescription(e.target.value)}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayRow(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handlePay()} disabled={paySaving}>
              {paySaving ? "Posting..." : "Post Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAccrueOpen} onOpenChange={handleAccrueDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-4 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              {editingPayrollId ? "Edit Payroll Accrual" : "Accrue Salary"}
            </DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select
                value={accrueEmployeeId}
                onValueChange={setAccrueEmployeeId}
                disabled={Boolean(editingPayrollId)}
              >
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
              {editingPayrollId ? (
                <p className="text-xs text-muted-foreground">
                  Employee cannot be changed while editing.
                  {editingPaidAmount > 0.01
                    ? ` Already paid: ${formatMoney(editingPaidAmount)}.`
                    : ""}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Payroll Month *</Label>
                <Input
                  type="month"
                  max={currentMonthMax()}
                  value={accruePayrollMonth}
                  disabled={editingPaidAmount > 0.01}
                  onChange={(e) => setAccruePayrollMonth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Accrual Date *</Label>
                <Input
                  type="date"
                  max={todayDateMax()}
                  value={accrueDate}
                  onChange={(e) => setAccrueDate(e.target.value)}
                />
              </div>
            </div>
            {selectedAccrueEmployee ? (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Working Days</Label>
                    <Input
                      type="number"
                      min={1}
                      value={accrueWorkingDays}
                      onChange={(e) => {
                        const next = e.target.value;
                        setAccrueWorkingDays(next);
                        const maxDays = Math.max(1, Number(next || 0));
                        if (Number(accrueAbsentDays || 0) > maxDays) {
                          setAccrueAbsentDays(String(maxDays));
                        }
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Default from employee ({Number(selectedAccrueEmployee.workingDays || 26)}). Change only for this payroll.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Absent Days</Label>
                    <Input
                      type="number"
                      min={0}
                      max={Math.max(1, Number(accrueWorkingDays || 26))}
                      value={accrueAbsentDays}
                      onChange={(e) => setAccrueAbsentDays(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Deducts from salary.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Leaves</Label>
                    <Input
                      type="number"
                      min={0}
                      value={accrueLeaves}
                      onChange={(e) => setAccrueLeaves(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">Recorded only; no salary deduction.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Loan Recovery</Label>
                    <Input
                      type="number"
                      min={0}
                      value={accrueLoanRecovery}
                      onChange={(e) => setAccrueLoanRecovery(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Outstanding: {formatMoney(selectedAccrueEmployee.loanBalance)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Advance Recovery</Label>
                    <Input
                      type="number"
                      min={0}
                      value={accrueAdvanceRecovery}
                      onChange={(e) => setAccrueAdvanceRecovery(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Outstanding: {formatMoney(selectedAccrueEmployee.advanceBalance)}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Extra Payment</Label>
                    <Input
                      type="number"
                      min={0}
                      value={accrueExtraPayment}
                      onChange={(e) => setAccrueExtraPayment(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Extra Payment Description
                      {Number(accrueExtraPayment || 0) > 0 ? " *" : ""}
                    </Label>
                    <Input
                      value={accrueExtraPaymentDescription}
                      onChange={(e) => setAccrueExtraPaymentDescription(e.target.value)}
                      placeholder="e.g. overtime, bonus"
                      required={Number(accrueExtraPayment || 0) > 0}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Extra Deduction</Label>
                    <Input
                      type="number"
                      min={0}
                      value={accrueExtraDeduction}
                      onChange={(e) => setAccrueExtraDeduction(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      Extra Deduction Description
                      {Number(accrueExtraDeduction || 0) > 0 ? " *" : ""}
                    </Label>
                    <Input
                      value={accrueExtraDeductionDescription}
                      onChange={(e) => setAccrueExtraDeductionDescription(e.target.value)}
                      placeholder="e.g. penalty, adjustment"
                      required={Number(accrueExtraDeduction || 0) > 0}
                    />
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Gross Salary</span>
                    <span className="tabular-nums">{formatMoney(grossSalaryPreview)}</span>
                  </div>
                  {Number(accrueExtraPayment || 0) > 0 ? (
                    <div className="flex justify-between text-emerald-700">
                      <span>Extra Payment</span>
                      <span className="tabular-nums">+{formatMoney(Number(accrueExtraPayment || 0))}</span>
                    </div>
                  ) : null}
                  {Number(accrueExtraDeduction || 0) > 0 ? (
                    <div className="flex justify-between text-destructive">
                      <span>Extra Deduction</span>
                      <span className="tabular-nums">-{formatMoney(Number(accrueExtraDeduction || 0))}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between font-semibold">
                    <span>Net Payable</span>
                    <span className="tabular-nums">{formatMoney(netSalaryPreview)}</span>
                  </div>
                </div>
              </>
            ) : null}
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={accrueDescription}
                onChange={(e) => setAccrueDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => handleAccrueDialogOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAccrue()} disabled={accrueSaving}>
              {accrueSaving
                ? "Saving..."
                : editingPayrollId
                  ? "Update Payroll"
                  : "Accrue Salary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
