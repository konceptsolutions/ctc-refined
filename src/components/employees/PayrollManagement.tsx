import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Plus, Printer, Receipt, Search } from "lucide-react";
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
import { calculateAccruedSalary } from "@/lib/employeePayroll";
import { printPayslipPdf } from "@/utils/payslipPdf";

type PayrollRow = {
  id: string;
  employeeId: string;
  date: string;
  payrollMonth?: string | null;
  grossAmount: number;
  absentDays: number;
  workingDays: number;
  daysWorked: number;
  loanRecovery: number;
  advanceRecovery: number;
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

const getCurrentPayrollMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-GB");
};

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
  const [accrueEmployeeId, setAccrueEmployeeId] = useState("");
  const [accrueDate, setAccrueDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [accruePayrollMonth, setAccruePayrollMonth] = useState(() => getCurrentPayrollMonth());
  const [accrueAbsentDays, setAccrueAbsentDays] = useState("0");
  const [accrueLoanRecovery, setAccrueLoanRecovery] = useState("");
  const [accrueAdvanceRecovery, setAccrueAdvanceRecovery] = useState("");
  const [accrueDescription, setAccrueDescription] = useState("");
  const [accrueSaving, setAccrueSaving] = useState(false);

  const [payRow, setPayRow] = useState<PayrollRow | null>(null);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [payAmount, setPayAmount] = useState("");
  const [payCashBankAccountId, setPayCashBankAccountId] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [paySaving, setPaySaving] = useState(false);

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

  const grossSalaryPreview = useMemo(() => {
    if (!selectedAccrueEmployee) return 0;
    return calculateAccruedSalary(
      selectedAccrueEmployee.monthlySalary,
      selectedAccrueEmployee.workingDays,
      Number(accrueAbsentDays || 0),
    );
  }, [accrueAbsentDays, selectedAccrueEmployee]);

  const netSalaryPreview = useMemo(
    () =>
      grossSalaryPreview -
      Number(accrueLoanRecovery || 0) -
      Number(accrueAdvanceRecovery || 0),
    [accrueAdvanceRecovery, accrueLoanRecovery, grossSalaryPreview],
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
    setPayDate(new Date().toISOString().split("T")[0]);
    setPayAmount(String(row.outstanding || ""));
    setPayCashBankAccountId(cashBankAccounts[0]?.id || "");
    setPayDescription(`Salary payment for ${formatPayrollMonth(row.payrollMonth)}`);
  };

  const openAccrueDialog = () => {
    setAccrueEmployeeId("");
    setAccrueDate(new Date().toISOString().split("T")[0]);
    setAccruePayrollMonth(getCurrentPayrollMonth());
    setAccrueAbsentDays("0");
    setAccrueLoanRecovery("");
    setAccrueAdvanceRecovery("");
    setAccrueDescription("");
    setIsAccrueOpen(true);
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

    if (!selectedAccrueEmployee) return;

    const absentDays = Number(accrueAbsentDays || 0);
    if (absentDays < 0 || absentDays > selectedAccrueEmployee.workingDays) {
      toast({
        title: "Validation",
        description: "Absent days must be between 0 and working days.",
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

    setAccrueSaving(true);
    try {
      const response = await apiClient.createEmployeeTransaction(accrueEmployeeId, {
        type: "salary_accrual",
        date: accrueDate,
        payrollMonth: accruePayrollMonth,
        absentDays,
        loanRecovery: Number(accrueLoanRecovery || 0),
        advanceRecovery: Number(accrueAdvanceRecovery || 0),
        description: accrueDescription || undefined,
      });

      if ((response as any)?.error) {
        throw new Error((response as any).error);
      }

      toast({
        title: "Payroll accrued",
        description: `Salary accrued for ${selectedAccrueEmployee.name}.`,
      });
      setIsAccrueOpen(false);
      await fetchPayroll();
      await fetchEmployees();
    } catch (error: any) {
      toast({
        title: "Accrual failed",
        description: error.message || "Could not accrue salary.",
        variant: "destructive",
      });
    } finally {
      setAccrueSaving(false);
    }
  };

  const handlePay = async () => {
    if (!payRow) return;

    const amount = Number(payAmount || 0);
    if (amount <= 0) {
      toast({
        title: "Validation",
        description: "Payment amount must be greater than zero.",
        variant: "destructive",
      });
      return;
    }

    if (amount > payRow.outstanding + 0.01) {
      toast({
        title: "Validation",
        description: `Payment cannot exceed outstanding amount (${formatMoney(payRow.outstanding)}).`,
        variant: "destructive",
      });
      return;
    }

    if (!payCashBankAccountId) {
      toast({
        title: "Validation",
        description: "Please select a cash/bank account.",
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
        amount,
        cashBankAccountId: payCashBankAccountId,
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
            <Button onClick={openAccrueDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Accrue Salary
            </Button>
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
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      Loading payroll records...
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                      No payroll records found. Click Accrue Salary to generate payroll.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row, index) => (
                    <TableRow key={row.id}>
                      <ListNumberCell index={index} page={currentPage} pageSize={rowsPerPage} />
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
                          <Button size="sm" variant="outline" onClick={() => handlePrint(row)}>
                            <Printer className="h-3.5 w-3.5" />
                          </Button>
                          {row.hasAccrual !== false && row.outstanding > 0.01 ? (
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
        <DialogContent className="max-w-lg">
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
                <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Amount *</Label>
                <Input
                  type="number"
                  min={0}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cash / Bank Account *</Label>
                <Select value={payCashBankAccountId} onValueChange={setPayCashBankAccountId}>
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

      <Dialog open={isAccrueOpen} onOpenChange={setIsAccrueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Accrue Salary
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Employee *</Label>
              <Select value={accrueEmployeeId} onValueChange={setAccrueEmployeeId}>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Payroll Month *</Label>
                <Input
                  type="month"
                  value={accruePayrollMonth}
                  onChange={(e) => setAccruePayrollMonth(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Accrual Date *</Label>
                <Input type="date" value={accrueDate} onChange={(e) => setAccrueDate(e.target.value)} />
              </div>
            </div>
            {selectedAccrueEmployee ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Working Days</Label>
                    <Input value={selectedAccrueEmployee.workingDays} disabled className="bg-muted" />
                  </div>
                  <div className="space-y-2">
                    <Label>Absent Days</Label>
                    <Input
                      type="number"
                      min={0}
                      max={selectedAccrueEmployee.workingDays}
                      value={accrueAbsentDays}
                      onChange={(e) => setAccrueAbsentDays(e.target.value)}
                    />
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
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span>Gross Salary</span>
                    <span className="tabular-nums">{formatMoney(grossSalaryPreview)}</span>
                  </div>
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAccrueOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleAccrue()} disabled={accrueSaving}>
              {accrueSaving ? "Saving..." : "Accrue Salary"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
