import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "../config/database";
import {
  createEmployeeLedgerAccount,
  findEmployeeSubgroup,
  adjustEmployeeOpeningBalance,
  calculateAccruedSalary,
  syncEmployeeAccountNames,
  getStaffSalaryExpenseAccount,
  getEmployeeAccountByRole,
  postEmployeeVoucher,
  reverseEmployeeVoucher,
  postOpeningBalanceJv,
  type EmployeeAccountRole,
} from "../utils/employeeAccounting";
import {
  getAccountCashBankMode,
  isCashBankAccount as isChartCashBankAccount,
} from "../utils/cashBankMode";

const EMPLOYEE_ID_PARAM = ":id([0-9a-fA-F-]{36})";

const router = express.Router();

const EMPLOYEE_TX_TYPES = [
  "advance_issue",
  "loan_issue",
  "loan_recovery",
  "advance_recovery",
  "salary_accrual",
  "salary_payment",
] as const;

type EmployeeTxType = (typeof EMPLOYEE_TX_TYPES)[number];

function parseNonNegativeAmount(value: unknown, fallback = 0): number {
  const num = Number(value ?? fallback);
  if (!Number.isFinite(num) || num < 0) return fallback;
  return Math.round(num * 100) / 100;
}

function parseOptionalDescription(value: unknown): string {
  return String(value ?? "").trim();
}

function validatePayrollExtraFieldDescriptions(params: {
  extraPayment: number;
  extraPaymentDescription: string | null;
  extraDeduction: number;
  extraDeductionDescription: string | null;
}): string | null {
  if (params.extraPayment > 0 && !String(params.extraPaymentDescription || "").trim()) {
    return "Extra payment description is required when an extra payment amount is entered.";
  }
  if (params.extraDeduction > 0 && !String(params.extraDeductionDescription || "").trim()) {
    return "Extra deduction description is required when an extra deduction amount is entered.";
  }
  return null;
}

function calculatePayrollNetPayable(params: {
  grossAmount: number;
  loanRecovery: number;
  advanceRecovery: number;
  extraPayment: number;
  extraDeduction: number;
}): number {
  const net =
    params.grossAmount +
    params.extraPayment -
    params.loanRecovery -
    params.advanceRecovery -
    params.extraDeduction;
  return Math.round(net * 100) / 100;
}

function calculatePayrollExpenseDebit(params: {
  grossAmount: number;
  extraPayment: number;
  extraDeduction: number;
}): number {
  return Math.round(
    (params.grossAmount + params.extraPayment - params.extraDeduction) * 100,
  ) / 100;
}

type PayrollVoucherAccount = { id: string; code: string; name: string };

function buildPayrollAccrualVoucherEntries(params: {
  employeeId: string;
  expenseAccount: PayrollVoucherAccount;
  salaryAccount: PayrollVoucherAccount;
  loanAccount: PayrollVoucherAccount;
  advanceAccount: PayrollVoucherAccount;
  accountLabel: (account: PayrollVoucherAccount) => string;
  grossAmount: number;
  extraPayment: number;
  extraPaymentDescription: string | null;
  extraDeduction: number;
  extraDeductionDescription: string | null;
  netPaid: number;
  loanRecovery: number;
  advanceRecovery: number;
  description?: string;
  daysWorked: number;
  workingDays: number;
}) {
  const entries: Array<{
    accountId: string;
    accountName: string;
    debit: number;
    credit: number;
    description?: string;
    employeeId: string;
  }> = [
    {
      accountId: params.expenseAccount.id,
      accountName: params.accountLabel(params.expenseAccount),
      debit: params.grossAmount,
      credit: 0,
      description: `Gross salary (${params.daysWorked}/${params.workingDays} days)`,
      employeeId: params.employeeId,
    },
  ];

  if (params.extraPayment > 0) {
    entries.push({
      accountId: params.expenseAccount.id,
      accountName: params.accountLabel(params.expenseAccount),
      debit: params.extraPayment,
      credit: 0,
      description: params.extraPaymentDescription || "Extra payment",
      employeeId: params.employeeId,
    });
  }

  if (params.extraDeduction > 0) {
    entries.push({
      accountId: params.expenseAccount.id,
      accountName: params.accountLabel(params.expenseAccount),
      debit: 0,
      credit: params.extraDeduction,
      description: params.extraDeductionDescription || "Extra deduction",
      employeeId: params.employeeId,
    });
  }

  entries.push({
    accountId: params.salaryAccount.id,
    accountName: params.accountLabel(params.salaryAccount),
    debit: 0,
    credit: params.netPaid,
    description: params.description || "Net salary payable",
    employeeId: params.employeeId,
  });

  if (params.loanRecovery > 0) {
    entries.push({
      accountId: params.loanAccount.id,
      accountName: params.accountLabel(params.loanAccount),
      debit: 0,
      credit: params.loanRecovery,
      description: "Loan recovery",
      employeeId: params.employeeId,
    });
  }

  if (params.advanceRecovery > 0) {
    entries.push({
      accountId: params.advanceAccount.id,
      accountName: params.accountLabel(params.advanceAccount),
      debit: 0,
      credit: params.advanceRecovery,
      description: "Advance recovery",
      employeeId: params.employeeId,
    });
  }

  return entries;
}

async function setEmployeePayrollSupplementaryFields(
  transactionId: string,
  data: {
    leaves: number;
    extraPayment: number;
    extraPaymentDescription: string | null;
    extraDeduction: number;
    extraDeductionDescription: string | null;
  },
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "EmployeeTransaction"
    SET
      "leaves" = ${data.leaves},
      "extraPayment" = ${data.extraPayment},
      "extraPaymentDescription" = ${data.extraPaymentDescription},
      "extraDeduction" = ${data.extraDeduction},
      "extraDeductionDescription" = ${data.extraDeductionDescription}
    WHERE "id" = ${transactionId}
  `;
}

async function getEmployeePayrollSupplementaryFieldsMap(ids: string[]) {
  if (!ids.length) {
    return new Map<
      string,
      {
        leaves: number;
        extraPayment: number;
        extraPaymentDescription: string | null;
        extraDeduction: number;
        extraDeductionDescription: string | null;
      }
    >();
  }

  const rows = await prisma.$queryRaw<
    Array<{
      id: string;
      leaves: number | null;
      extraPayment: number | null;
      extraPaymentDescription: string | null;
      extraDeduction: number | null;
      extraDeductionDescription: string | null;
    }>
  >(
    Prisma.sql`
      SELECT
        "id",
        "leaves",
        "extraPayment",
        "extraPaymentDescription",
        "extraDeduction",
        "extraDeductionDescription"
      FROM "EmployeeTransaction"
      WHERE "id" IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}`))})
    `,
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        leaves: Number(row.leaves || 0),
        extraPayment: Number(row.extraPayment || 0),
        extraPaymentDescription: row.extraPaymentDescription,
        extraDeduction: Number(row.extraDeduction || 0),
        extraDeductionDescription: row.extraDeductionDescription,
      },
    ]),
  );
}

const LOAN_ADVANCE_TX_TYPES = [
  "advance_issue",
  "loan_issue",
  "loan_recovery",
  "advance_recovery",
] as const;

type EmployeeAccountRecord = {
  id: string;
  code: string;
  name: string;
  currentBalance: number;
  employeeAccountRole: string | null;
};

async function generateEmployeeCode(): Promise<string> {
  const employees = await prisma.employee.findMany({
    where: { code: { startsWith: "EMP-" } },
    select: { code: true },
    orderBy: { code: "desc" },
  });

  let maxNum = 0;
  for (const employee of employees) {
    const match = employee.code.match(/^EMP-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `EMP-${String(maxNum + 1).padStart(3, "0")}`;
}

function parseDate(value: unknown): Date {
  if (!value) return new Date();
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [year, month, day] = raw.split("-").map(Number);
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function parsePayrollMonth(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}$/.test(raw)) return null;
  return raw;
}

function getEffectivePayrollMonth(tx: { payrollMonth?: string | null; date: Date }): string {
  if (tx.payrollMonth && /^\d{4}-\d{2}$/.test(tx.payrollMonth)) {
    return tx.payrollMonth;
  }
  const date = new Date(tx.date);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function validateOpeningBalanceFields(params: {
  openingLoanBalance: number;
  openingAdvanceBalance: number;
  openingSalaryPayable: number;
  openingBalanceDate: Date | null;
}): string | null {
  const hasAmount =
    params.openingLoanBalance !== 0 ||
    params.openingAdvanceBalance !== 0 ||
    params.openingSalaryPayable !== 0;
  const hasDate = Boolean(params.openingBalanceDate);

  if (hasAmount && !hasDate) {
    return "Opening balance date is required when opening loan, advance, or salary payable is entered.";
  }
  if (hasDate && !hasAmount) {
    return "Enter at least one opening balance amount when opening balance date is set.";
  }
  return null;
}

function validateEmployeeCoreFields(params: {
  name: string;
  joiningDate: Date | null;
  monthlySalary: number;
  workingDays: number;
}): string | null {
  if (!params.name.trim()) {
    return "Employee name is required.";
  }
  if (!params.joiningDate) {
    return "Joining date is required.";
  }
  if (!Number.isFinite(params.monthlySalary) || params.monthlySalary <= 0) {
    return "Monthly salary is required.";
  }
  if (!Number.isFinite(params.workingDays) || params.workingDays < 1) {
    return "Working days is required.";
  }
  return null;
}

function mapEmployeeBalances(accounts: EmployeeAccountRecord[]) {
  const salaryAccount = getEmployeeAccountByRole(accounts, "salary_payable");
  const loanAccount = getEmployeeAccountByRole(accounts, "loan");
  const advanceAccount = getEmployeeAccountByRole(accounts, "advance");

  return {
    salaryPayableAccountId: salaryAccount?.id || null,
    loanAccountId: loanAccount?.id || null,
    advanceAccountId: advanceAccount?.id || null,
    salaryPayableBalance: Number(salaryAccount?.currentBalance || 0),
    loanBalance: Number(loanAccount?.currentBalance || 0),
    advanceBalance: Number(advanceAccount?.currentBalance || 0),
  };
}

async function getEmployeeAccounts(employeeId: string): Promise<EmployeeAccountRecord[]> {
  return prisma.account.findMany({
    where: { employeeId },
    select: {
      id: true,
      code: true,
      name: true,
      currentBalance: true,
      employeeAccountRole: true,
    },
    orderBy: { code: "asc" },
  });
}

async function ensureEmployeeAccounts(employee: {
  id: string;
  name: string;
  code: string;
}) {
  const existing = await getEmployeeAccounts(employee.id);
  const roles: EmployeeAccountRole[] = ["salary_payable", "loan", "advance"];
  const created: typeof existing = [...existing];

  for (const role of roles) {
    if (existing.some((account) => account.employeeAccountRole === role)) continue;

    const subgroup = await findEmployeeSubgroup(role);
    if (!subgroup) {
      throw new Error(
        `Subgroup not found for ${role.replace("_", " ")}. Please create Staff Salaries, Staff Loan, and Staff Advance subgroups first.`,
      );
    }

    const account = await createEmployeeLedgerAccount({
      employeeId: employee.id,
      employeeName: employee.name,
      role,
      subgroupId: subgroup.id,
      subgroupCode: subgroup.code,
      description: `${employee.name} (${employee.code})`,
    });
    created.push({
      id: account.id,
      code: account.code,
      name: account.name,
      currentBalance: account.currentBalance,
      employeeAccountRole: account.employeeAccountRole,
    });
  }

  await syncEmployeeAccountNames(employee.id, employee.name);
  return getEmployeeAccounts(employee.id);
}

router.get("/cash-bank-accounts", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: { status: "Active" },
      include: { Subgroup: { include: { MainGroup: true } } },
      orderBy: { code: "asc" },
    });

    const cashBank = accounts
      .filter((account) => isChartCashBankAccount(account))
      .map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        label: `${account.code} - ${account.name}`,
        mode: getAccountCashBankMode(account),
      }));

    res.json({ data: cashBank });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/loan-advance-transactions", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const category = String(req.query.category || "all").trim();
    const type = String(req.query.type || "").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25);
    const skip = (page - 1) * limit;

    const where: any = {
      type: { in: [...LOAN_ADVANCE_TX_TYPES] },
    };

    if (type && LOAN_ADVANCE_TX_TYPES.includes(type as (typeof LOAN_ADVANCE_TX_TYPES)[number])) {
      where.type = type;
    } else if (category === "loan") {
      where.type = { in: ["loan_issue", "loan_recovery"] };
    } else if (category === "advance") {
      where.type = { in: ["advance_issue", "advance_recovery"] };
    }

    if (search) {
      where.Employee = {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { code: { contains: search, mode: "insensitive" } },
        ],
      };
    }

    const [transactions, total] = await Promise.all([
      prisma.employeeTransaction.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: {
          Employee: {
            select: { id: true, code: true, name: true, status: true },
          },
          Voucher: {
            select: {
              id: true,
              voucherNumber: true,
              type: true,
              cashBankAccount: true,
            },
          },
        },
      }),
      prisma.employeeTransaction.count({ where }),
    ]);

    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/loan-advance-transactions/:txId", async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId || "").trim();
    const existing = await prisma.employeeTransaction.findUnique({
      where: { id: txId },
      include: {
        Voucher: {
          select: { id: true, voucherNumber: true, cashBankAccount: true },
        },
      },
    });

    if (!existing) {
      return res.status(404).json({ error: "Transaction not found." });
    }

    if (
      !LOAN_ADVANCE_TX_TYPES.includes(
        existing.type as (typeof LOAN_ADVANCE_TX_TYPES)[number],
      )
    ) {
      return res.status(400).json({
        error: "Only loan and advance transactions can be edited here.",
      });
    }

    const type = String(req.body?.type || existing.type).trim() as EmployeeTxType;
    if (
      !LOAN_ADVANCE_TX_TYPES.includes(type as (typeof LOAN_ADVANCE_TX_TYPES)[number])
    ) {
      return res.status(400).json({
        error: `Invalid type. Allowed: ${LOAN_ADVANCE_TX_TYPES.join(", ")}`,
      });
    }

    const isIssue = type === "advance_issue" || type === "loan_issue";
    const wasIssue =
      existing.type === "advance_issue" || existing.type === "loan_issue";
    if (isIssue !== wasIssue) {
      return res.status(400).json({
        error: "Cannot change between issue and recovery transaction types.",
      });
    }

    const employeeId = String(req.body?.employeeId || existing.employeeId).trim();
    const amount = Number(req.body?.amount ?? existing.amount);
    const cashBankAccountId = String(
      req.body?.cashBankAccountId || existing.Voucher?.cashBankAccount || "",
    ).trim();
    const description = req.body?.description
      ? String(req.body.description).trim()
      : existing.description || "";
    const date = req.body?.date ? parseDate(req.body.date) : existing.date;

    if (!(amount > 0)) {
      return res.status(400).json({ error: "Amount must be greater than zero." });
    }
    if (!cashBankAccountId) {
      return res.status(400).json({ error: "Cash/Bank account is required." });
    }

    const cashAccount = await prisma.account.findUnique({
      where: { id: cashBankAccountId },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
    if (!cashAccount || !isChartCashBankAccount(cashAccount)) {
      return res.status(400).json({ error: "Selected account is not a cash/bank account." });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { Account: true },
    });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }

    const accounts = employee.Account.length
      ? employee.Account
      : await ensureEmployeeAccounts(employee);

    const loanAccount = getEmployeeAccountByRole(accounts, "loan");
    const advanceAccount = getEmployeeAccountByRole(accounts, "advance");
    if (!loanAccount || !advanceAccount) {
      return res.status(400).json({ error: "Employee ledger accounts are not configured." });
    }

    // Validate recoveries against balances as they will be after reversing this entry
    let loanBal = Number(loanAccount.currentBalance || 0);
    let advanceBal = Number(advanceAccount.currentBalance || 0);
    if (existing.employeeId === employee.id) {
      if (existing.type === "loan_issue") loanBal -= Number(existing.amount || 0);
      if (existing.type === "advance_issue") advanceBal -= Number(existing.amount || 0);
      if (existing.type === "loan_recovery") loanBal += Number(existing.amount || 0);
      if (existing.type === "advance_recovery") advanceBal += Number(existing.amount || 0);
    }

    if (type === "loan_recovery" && amount > loanBal + 0.01) {
      return res.status(400).json({
        error: `Loan recovery exceeds outstanding loan balance (${Math.max(0, loanBal).toFixed(2)}).`,
      });
    }
    if (type === "advance_recovery" && amount > advanceBal + 0.01) {
      return res.status(400).json({
        error: `Advance recovery exceeds outstanding advance balance (${Math.max(0, advanceBal).toFixed(2)}).`,
      });
    }

    // Reverse the old voucher, then post the updated one
    if (existing.voucherId) {
      await reverseEmployeeVoucher(existing.voucherId);
    }

    // Refresh accounts after reverse (balances changed)
    const refreshedBeforePost = await getEmployeeAccounts(employee.id);
    const loanAccountFresh =
      getEmployeeAccountByRole(refreshedBeforePost, "loan") || loanAccount;
    const advanceAccountFresh =
      getEmployeeAccountByRole(refreshedBeforePost, "advance") || advanceAccount;

    const accountLabel = (account: { code: string; name: string }) =>
      `${account.code}-${account.name}`;

    const cashLabel = accountLabel(cashAccount);

    const targetAccount =
      type === "advance_issue" || type === "advance_recovery"
        ? advanceAccountFresh
        : loanAccountFresh;

    let voucher: { id: string; voucherNumber: string; type: string } | null = null;

    if (isIssue) {
      voucher = await postEmployeeVoucher({
        type: "payment",
        date,
        narration: `${type === "advance_issue" ? "Salary advance" : "Staff loan"}: ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId,
        entries: [
          {
            accountId: targetAccount.id,
            accountName: accountLabel(targetAccount),
            debit: amount,
            credit: 0,
            description,
            employeeId: employee.id,
          },
          {
            accountId: cashBankAccountId,
            accountName: cashLabel,
            debit: 0,
            credit: amount,
            description,
            employeeId: employee.id,
          },
        ],
      });
    } else {
      voucher = await postEmployeeVoucher({
        type: "receipt",
        date,
        narration: `${type === "loan_recovery" ? "Loan recovery" : "Advance recovery"}: ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId,
        entries: [
          {
            accountId: cashBankAccountId,
            accountName: cashLabel,
            debit: amount,
            credit: 0,
            description,
            employeeId: employee.id,
          },
          {
            accountId: targetAccount.id,
            accountName: accountLabel(targetAccount),
            debit: 0,
            credit: amount,
            description,
            employeeId: employee.id,
          },
        ],
      });
    }

    const transaction = await prisma.employeeTransaction.update({
      where: { id: existing.id },
      data: {
        employeeId: employee.id,
        type,
        date,
        amount,
        netPaid: amount,
        description: description || null,
        voucherId: voucher?.id || null,
        referenceNo: voucher?.voucherNumber || null,
        updatedAt: new Date(),
      },
      include: {
        Employee: {
          select: { id: true, code: true, name: true, status: true },
        },
        Voucher: {
          select: {
            id: true,
            voucherNumber: true,
            type: true,
            cashBankAccount: true,
          },
        },
      },
    });

    const refreshedAccounts = await getEmployeeAccounts(employee.id);
    res.json({
      data: {
        transaction,
        balances: mapEmployeeBalances(refreshedAccounts),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/payroll-transactions", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const payrollMonth = parsePayrollMonth(req.query.payrollMonth);
    const paymentStatus = String(req.query.paymentStatus || "all").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25);

    const employeeFilter: Prisma.EmployeeTransactionWhereInput = search
      ? {
          Employee: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { code: { contains: search, mode: "insensitive" } },
            ],
          },
        }
      : {};

    const employeeInclude = {
      Employee: {
        select: {
          id: true,
          code: true,
          name: true,
          monthlySalary: true,
          workingDays: true,
          department: true,
          designation: true,
        },
      },
      Voucher: { select: { id: true, voucherNumber: true, type: true } },
    } satisfies Prisma.EmployeeTransactionInclude;

    const [accruals, payments] = await Promise.all([
      prisma.employeeTransaction.findMany({
        where: { type: "salary_accrual", ...employeeFilter },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: employeeInclude,
      }),
      prisma.employeeTransaction.findMany({
        where: { type: "salary_payment", ...employeeFilter },
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: employeeInclude,
      }),
    ]);

    const payrollSupplementaryFieldsMap = await getEmployeePayrollSupplementaryFieldsMap(
      accruals.map((accrual) => accrual.id),
    );

    type PayrollBucket = {
      accrual?: (typeof accruals)[number];
      payments: (typeof payments)[number][];
      month: string;
    };

    const buckets = new Map<string, PayrollBucket>();

    for (const accrual of accruals) {
      const month = getEffectivePayrollMonth(accrual);
      const key = `${accrual.employeeId}:${month}`;
      buckets.set(key, { accrual, payments: [], month });
    }

    for (const payment of payments) {
      const month = getEffectivePayrollMonth(payment);
      const key = `${payment.employeeId}:${month}`;
      const existing = buckets.get(key);
      if (existing) {
        existing.payments.push(payment);
      } else {
        buckets.set(key, { payments: [payment], month });
      }
    }

    let rows = Array.from(buckets.entries()).map(([key, bucket]) => {
      const paidAmount = bucket.payments.reduce((sum, payment) => sum + Number(payment.netPaid || 0), 0);
      const paymentDetails = bucket.payments.map((payment) => ({
        date: payment.date,
        amount: Number(payment.netPaid || 0),
        referenceNo: payment.referenceNo,
      }));

      if (bucket.accrual) {
        const accrual = bucket.accrual;
        const netPayable = Number(accrual.netPaid || 0);
        const outstanding = Math.max(0, Math.round((netPayable - paidAmount) * 100) / 100);
        let status = "pending";
        if (outstanding <= 0.01) status = "paid";
        else if (paidAmount > 0) status = "partial";

        const workingDays = Number(
          accrual.workingDays ?? accrual.Employee?.workingDays ?? 26,
        );
        const absentDays = Number(accrual.absentDays || 0);
        const supplementary = payrollSupplementaryFieldsMap.get(accrual.id);

        return {
          id: accrual.id,
          employeeId: accrual.employeeId,
          date: accrual.date,
          payrollMonth: bucket.month,
          grossAmount: Number(accrual.amount || 0),
          absentDays,
          leaves: Number(supplementary?.leaves || 0),
          workingDays,
          daysWorked: workingDays - absentDays,
          loanRecovery: Number(accrual.loanRecovery || 0),
          advanceRecovery: Number(accrual.advanceRecovery || 0),
          extraPayment: Number(supplementary?.extraPayment || 0),
          extraPaymentDescription: supplementary?.extraPaymentDescription || null,
          extraDeduction: Number(supplementary?.extraDeduction || 0),
          extraDeductionDescription: supplementary?.extraDeductionDescription || null,
          netPayable,
          paidAmount,
          outstanding,
          paymentStatus: status,
          hasAccrual: true,
          description: accrual.description,
          referenceNo: accrual.referenceNo,
          voucherNumber: accrual.Voucher?.voucherNumber || accrual.referenceNo,
          employee: accrual.Employee,
          payments: paymentDetails,
        };
      }

      const latestPayment = bucket.payments[0];
      const employee = latestPayment.Employee;
      const grossAmount = paidAmount;

      return {
        id: latestPayment.id,
        employeeId: latestPayment.employeeId,
        date: latestPayment.date,
        payrollMonth: bucket.month,
        grossAmount,
        absentDays: 0,
        leaves: 0,
        workingDays: Number(employee?.workingDays || 26),
        daysWorked: Number(employee?.workingDays || 26),
        loanRecovery: 0,
        advanceRecovery: 0,
        netPayable: grossAmount,
        paidAmount,
        outstanding: 0,
        paymentStatus: "paid",
        hasAccrual: false,
        description: latestPayment.description,
        referenceNo: latestPayment.referenceNo,
        voucherNumber: latestPayment.Voucher?.voucherNumber || latestPayment.referenceNo,
        employee,
        payments: paymentDetails,
      };
    });

    if (payrollMonth) {
      rows = rows.filter((row) => row.payrollMonth === payrollMonth);
    }

    if (paymentStatus && paymentStatus !== "all") {
      rows = rows.filter((row) => row.paymentStatus === paymentStatus);
    }

    rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = rows.length;
    const skip = (page - 1) * limit;
    const pagedRows = rows.slice(skip, skip + limit);

    res.json({
      data: pagedRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/payroll-transactions/:txId", async (req: Request, res: Response) => {
  try {
    const txId = String(req.params.txId || "").trim();
    const existing = await prisma.employeeTransaction.findUnique({
      where: { id: txId },
      include: {
        Employee: { include: { Account: true } },
        Voucher: { select: { id: true, voucherNumber: true } },
      },
    });

    if (!existing || existing.type !== "salary_accrual") {
      return res.status(404).json({ error: "Payroll accrual not found." });
    }

    const payrollMonthKey = getEffectivePayrollMonth(existing);
    const paidSummary = await prisma.employeeTransaction.aggregate({
      where: {
        employeeId: existing.employeeId,
        type: "salary_payment",
        payrollMonth: payrollMonthKey,
      },
      _sum: { netPaid: true },
    });
    const paidAmount = Number(paidSummary._sum.netPaid || 0);
    const currentOutstanding =
      Math.max(0, Math.round((Number(existing.netPaid || 0) - paidAmount) * 100) / 100);

    if (currentOutstanding <= 0.01 && paidAmount > 0.01) {
      return res.status(400).json({
        error: "Fully paid payroll cannot be edited.",
      });
    }

    const employee = existing.Employee;
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }

    const existingSupplementaryMap = await getEmployeePayrollSupplementaryFieldsMap([existing.id]);
    const existingSupplementary = existingSupplementaryMap.get(existing.id);

    const date = req.body?.date ? parseDate(req.body.date) : existing.date;
    const payrollMonth =
      parsePayrollMonth(req.body?.payrollMonth) || existing.payrollMonth || payrollMonthKey;
    const absentDays =
      req.body?.absentDays !== undefined
        ? Number(req.body.absentDays || 0)
        : Number(existing.absentDays || 0);
    const leaves =
      req.body?.leaves !== undefined
        ? parseNonNegativeAmount(req.body.leaves, 0)
        : Number(existingSupplementary?.leaves || 0);
    const loanRecovery =
      req.body?.loanRecovery !== undefined
        ? Number(req.body.loanRecovery || 0)
        : Number(existing.loanRecovery || 0);
    const advanceRecovery =
      req.body?.advanceRecovery !== undefined
        ? Number(req.body.advanceRecovery || 0)
        : Number(existing.advanceRecovery || 0);
    const extraPayment =
      req.body?.extraPayment !== undefined
        ? parseNonNegativeAmount(req.body.extraPayment, 0)
        : Number(existingSupplementary?.extraPayment || 0);
    const extraDeduction =
      req.body?.extraDeduction !== undefined
        ? parseNonNegativeAmount(req.body.extraDeduction, 0)
        : Number(existingSupplementary?.extraDeduction || 0);
    const extraPaymentDescription =
      req.body?.extraPaymentDescription !== undefined
        ? parseOptionalDescription(req.body.extraPaymentDescription) || null
        : existingSupplementary?.extraPaymentDescription || null;
    const extraDeductionDescription =
      req.body?.extraDeductionDescription !== undefined
        ? parseOptionalDescription(req.body.extraDeductionDescription) || null
        : existingSupplementary?.extraDeductionDescription || null;
    const description =
      req.body?.description !== undefined
        ? String(req.body.description || "").trim()
        : existing.description || "";
    const requestedWorkingDays =
      req.body?.workingDays !== undefined &&
      req.body?.workingDays !== null &&
      req.body?.workingDays !== ""
        ? Number(req.body.workingDays)
        : existing.workingDays != null
          ? Number(existing.workingDays)
          : Number(employee.workingDays || 26);

    if (!payrollMonth) {
      return res.status(400).json({ error: "Payroll month is required." });
    }

    if (payrollMonth !== payrollMonthKey) {
      if (paidAmount > 0.01) {
        return res.status(400).json({
          error: "Cannot change payroll month after payments have been posted.",
        });
      }
      const duplicate = await prisma.employeeTransaction.findFirst({
        where: {
          employeeId: existing.employeeId,
          type: "salary_accrual",
          payrollMonth,
          NOT: { id: existing.id },
        },
        select: { id: true },
      });
      if (duplicate) {
        return res.status(400).json({
          error: `Payroll already accrued for ${payrollMonth}.`,
        });
      }
    }

    const workingDays = requestedWorkingDays;
    if (!Number.isFinite(workingDays) || workingDays < 1) {
      return res.status(400).json({ error: "Working days must be at least 1." });
    }
    if (absentDays < 0 || absentDays > workingDays) {
      return res.status(400).json({
        error: "Absent days must be between 0 and working days.",
      });
    }
    if (leaves < 0) {
      return res.status(400).json({ error: "Leaves cannot be negative." });
    }

    let grossAmount: number;
    try {
      grossAmount = calculateAccruedSalary(
        Number(employee.monthlySalary || 0),
        workingDays,
        absentDays,
      );
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
    if (grossAmount <= 0) {
      return res.status(400).json({ error: "Accrued salary amount must be greater than zero." });
    }

    const extraFieldError = validatePayrollExtraFieldDescriptions({
      extraPayment,
      extraPaymentDescription,
      extraDeduction,
      extraDeductionDescription,
    });
    if (extraFieldError) {
      return res.status(400).json({ error: extraFieldError });
    }

    const netPaid = calculatePayrollNetPayable({
      grossAmount,
      loanRecovery,
      advanceRecovery,
      extraPayment,
      extraDeduction,
    });
    const expenseDebit = calculatePayrollExpenseDebit({
      grossAmount,
      extraPayment,
      extraDeduction,
    });
    if (expenseDebit < 0) {
      return res.status(400).json({
        error: "Extra deduction cannot exceed gross salary plus extra payment.",
      });
    }
    if (netPaid < 0) {
      return res.status(400).json({ error: "Recoveries cannot exceed gross salary." });
    }
    if (netPaid + 0.01 < paidAmount) {
      return res.status(400).json({
        error: `Net payable (${netPaid.toFixed(2)}) cannot be less than amount already paid (${paidAmount.toFixed(2)}).`,
      });
    }

    const accounts = employee.Account.length
      ? employee.Account
      : await ensureEmployeeAccounts(employee);
    const salaryAccount = getEmployeeAccountByRole(accounts, "salary_payable");
    const loanAccount = getEmployeeAccountByRole(accounts, "loan");
    const advanceAccount = getEmployeeAccountByRole(accounts, "advance");
    if (!salaryAccount || !loanAccount || !advanceAccount) {
      return res.status(400).json({ error: "Employee ledger accounts are not configured." });
    }

    // After reversing this accrual, recoveries return to outstanding balances
    let loanBal = Number(loanAccount.currentBalance || 0) + Number(existing.loanRecovery || 0);
    let advanceBal =
      Number(advanceAccount.currentBalance || 0) + Number(existing.advanceRecovery || 0);
    if (loanRecovery > loanBal + 0.01) {
      return res.status(400).json({
        error: `Loan recovery exceeds outstanding loan balance (${Math.max(0, loanBal).toFixed(2)}).`,
      });
    }
    if (advanceRecovery > advanceBal + 0.01) {
      return res.status(400).json({
        error: `Advance recovery exceeds outstanding advance balance (${Math.max(0, advanceBal).toFixed(2)}).`,
      });
    }

    if (existing.voucherId) {
      await reverseEmployeeVoucher(existing.voucherId);
    }

    const refreshedAccounts = await getEmployeeAccounts(employee.id);
    const salaryAccountFresh =
      getEmployeeAccountByRole(refreshedAccounts, "salary_payable") || salaryAccount;
    const loanAccountFresh =
      getEmployeeAccountByRole(refreshedAccounts, "loan") || loanAccount;
    const advanceAccountFresh =
      getEmployeeAccountByRole(refreshedAccounts, "advance") || advanceAccount;

    const expenseAccount = await getStaffSalaryExpenseAccount();
    if (!expenseAccount) {
      return res.status(400).json({
        error: "Staff Salary Expense account not found. Add it under the Salary Expense subgroup.",
      });
    }

    const accountLabel = (account: { code: string; name: string }) =>
      `${account.code}-${account.name}`;
    const daysWorked = workingDays - absentDays;

    const accrualEntries = buildPayrollAccrualVoucherEntries({
      employeeId: employee.id,
      expenseAccount,
      salaryAccount: salaryAccountFresh,
      loanAccount: loanAccountFresh,
      advanceAccount: advanceAccountFresh,
      accountLabel,
      grossAmount,
      extraPayment,
      extraPaymentDescription,
      extraDeduction,
      extraDeductionDescription,
      netPaid,
      loanRecovery,
      advanceRecovery,
      description,
      daysWorked,
      workingDays,
    });

    const voucher = await postEmployeeVoucher({
      type: "journal",
      date,
      narration: `Salary accrual (${payrollMonth}): ${employee.name} (${daysWorked}/${workingDays} days)`,
      employeeId: employee.id,
      entries: accrualEntries,
    });

    const transaction = await prisma.employeeTransaction.update({
      where: { id: existing.id },
      data: {
        date,
        payrollMonth,
        amount: grossAmount,
        absentDays,
        workingDays,
        loanRecovery,
        advanceRecovery,
        netPaid,
        description: description || null,
        voucherId: voucher.id,
        referenceNo: voucher.voucherNumber,
        updatedAt: new Date(),
      },
      include: {
        Employee: {
          select: {
            id: true,
            code: true,
            name: true,
            monthlySalary: true,
            workingDays: true,
            department: true,
            designation: true,
          },
        },
        Voucher: { select: { id: true, voucherNumber: true, type: true } },
      },
    });

    await setEmployeePayrollSupplementaryFields(transaction.id, {
      leaves,
      extraPayment,
      extraPaymentDescription,
      extraDeduction,
      extraDeductionDescription,
    });

    const balances = mapEmployeeBalances(await getEmployeeAccounts(employee.id));
    res.json({
      data: {
        transaction: {
          ...transaction,
          leaves,
          extraPayment,
          extraPaymentDescription,
          extraDeduction,
          extraDeductionDescription,
        },
        balances,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { department: { contains: search, mode: "insensitive" } },
        { designation: { contains: search, mode: "insensitive" } },
        { cnic: { contains: search, mode: "insensitive" } },
      ];
    }

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          Account: {
            select: {
              id: true,
              code: true,
              name: true,
              currentBalance: true,
              employeeAccountRole: true,
            },
          },
        },
      }),
      prisma.employee.count({ where }),
    ]);

    res.json({
      data: employees.map((employee) => ({
        ...employee,
        ...mapEmployeeBalances(employee.Account),
        accounts: employee.Account,
        Account: undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get(`/${EMPLOYEE_ID_PARAM}`, async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        Account: {
          orderBy: { code: "asc" },
        },
        EmployeeTransaction: {
          orderBy: { date: "desc" },
          take: 50,
          include: {
            Voucher: {
              select: { id: true, voucherNumber: true, type: true },
            },
          },
        },
      },
    });

    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }

    res.json({
      data: {
        ...employee,
        ...mapEmployeeBalances(employee.Account),
        accounts: employee.Account,
        transactions: employee.EmployeeTransaction,
        Account: undefined,
        EmployeeTransaction: undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const name = String(req.body?.name || "").trim();
    const openingLoanBalance = Number(req.body?.openingLoanBalance || 0);
    const openingAdvanceBalance = Number(req.body?.openingAdvanceBalance || 0);
    const openingSalaryPayable = Number(req.body?.openingSalaryPayable || 0);
    const monthlySalary = Number(req.body?.monthlySalary);
    const workingDays = parseInt(String(req.body?.workingDays ?? ""), 10);
    const joiningDate = req.body?.joiningDate ? parseDate(req.body.joiningDate) : null;
    const openingBalanceDate = req.body?.openingBalanceDate ? parseDate(req.body.openingBalanceDate) : null;

    const coreValidationError = validateEmployeeCoreFields({
      name,
      joiningDate,
      monthlySalary,
      workingDays,
    });
    if (coreValidationError) {
      return res.status(400).json({ error: coreValidationError });
    }

    const openingValidationError = validateOpeningBalanceFields({
      openingLoanBalance,
      openingAdvanceBalance,
      openingSalaryPayable,
      openingBalanceDate,
    });
    if (openingValidationError) {
      return res.status(400).json({ error: openingValidationError });
    }

    const code =
      String(req.body?.code || "").trim() || (await generateEmployeeCode());

    const employee = await prisma.employee.create({
      data: {
        id: randomUUID(),
        code,
        name,
        cnic: req.body?.cnic ? String(req.body.cnic).trim() : null,
        contactNo: req.body?.contactNo ? String(req.body.contactNo).trim() : null,
        email: req.body?.email ? String(req.body.email).trim() : null,
        address: req.body?.address ? String(req.body.address).trim() : null,
        designation: req.body?.designation ? String(req.body.designation).trim() : null,
        department: req.body?.department ? String(req.body.department).trim() : null,
        joiningDate,
        openingBalanceDate,
        monthlySalary,
        workingDays,
        status: String(req.body?.status || "active").trim().toLowerCase() || "active",
        remarks: req.body?.remarks ? String(req.body.remarks).trim() : null,
        openingLoanBalance,
        openingAdvanceBalance,
        openingSalaryPayable,
        updatedAt: new Date(),
      },
    });

    const accounts = await ensureEmployeeAccounts(employee);
    const openingDate = openingBalanceDate as Date;

    const loanAccount = getEmployeeAccountByRole(accounts, "loan");
    const advanceAccount = getEmployeeAccountByRole(accounts, "advance");
    const salaryAccount = getEmployeeAccountByRole(accounts, "salary_payable");

    if (loanAccount && openingLoanBalance !== 0) {
      await postOpeningBalanceJv({
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.code,
        date: openingDate,
        account: loanAccount,
        amount: openingLoanBalance,
        accountRole: "loan",
      });
    }

    if (advanceAccount && openingAdvanceBalance !== 0) {
      await postOpeningBalanceJv({
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.code,
        date: openingDate,
        account: advanceAccount,
        amount: openingAdvanceBalance,
        accountRole: "advance",
      });
    }

    if (salaryAccount && openingSalaryPayable !== 0) {
      await postOpeningBalanceJv({
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.code,
        date: openingDate,
        account: salaryAccount,
        amount: openingSalaryPayable,
        accountRole: "salary_payable",
      });
    }

    const refreshedAccounts = await getEmployeeAccounts(employee.id);
    res.status(201).json({
      data: {
        ...employee,
        ...mapEmployeeBalances(refreshedAccounts),
        accounts: refreshedAccounts,
      },
    });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({ error: "Employee code already exists." });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put(`/${EMPLOYEE_ID_PARAM}`, async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }

    const name = req.body?.name !== undefined ? String(req.body.name).trim() : employee.name;
    const openingLoanBalance =
      req.body?.openingLoanBalance !== undefined
        ? Number(req.body.openingLoanBalance || 0)
        : employee.openingLoanBalance;
    const openingAdvanceBalance =
      req.body?.openingAdvanceBalance !== undefined
        ? Number(req.body.openingAdvanceBalance || 0)
        : employee.openingAdvanceBalance;
    const openingSalaryPayable =
      req.body?.openingSalaryPayable !== undefined
        ? Number(req.body.openingSalaryPayable || 0)
        : employee.openingSalaryPayable;
    const monthlySalary =
      req.body?.monthlySalary !== undefined
        ? Number(req.body.monthlySalary || 0)
        : employee.monthlySalary;
    const workingDays =
      req.body?.workingDays !== undefined
        ? parseInt(String(req.body.workingDays ?? ""), 10)
        : employee.workingDays;
    const joiningDate =
      req.body?.joiningDate !== undefined
        ? req.body.joiningDate
          ? parseDate(req.body.joiningDate)
          : null
        : employee.joiningDate;
    const openingBalanceDate =
      req.body?.openingBalanceDate !== undefined
        ? req.body.openingBalanceDate
          ? parseDate(req.body.openingBalanceDate)
          : null
        : employee.openingBalanceDate;

    const coreValidationError = validateEmployeeCoreFields({
      name,
      joiningDate,
      monthlySalary,
      workingDays,
    });
    if (coreValidationError) {
      return res.status(400).json({ error: coreValidationError });
    }

    const openingValidationError = validateOpeningBalanceFields({
      openingLoanBalance,
      openingAdvanceBalance,
      openingSalaryPayable,
      openingBalanceDate,
    });
    if (openingValidationError) {
      return res.status(400).json({ error: openingValidationError });
    }

    const updated = await prisma.employee.update({
      where: { id: employee.id },
      data: {
        name,
        cnic: req.body?.cnic !== undefined ? String(req.body.cnic || "").trim() || null : employee.cnic,
        contactNo:
          req.body?.contactNo !== undefined
            ? String(req.body.contactNo || "").trim() || null
            : employee.contactNo,
        email: req.body?.email !== undefined ? String(req.body.email || "").trim() || null : employee.email,
        address:
          req.body?.address !== undefined ? String(req.body.address || "").trim() || null : employee.address,
        designation:
          req.body?.designation !== undefined
            ? String(req.body.designation || "").trim() || null
            : employee.designation,
        department:
          req.body?.department !== undefined
            ? String(req.body.department || "").trim() || null
            : employee.department,
        joiningDate,
        openingBalanceDate,
        monthlySalary,
        workingDays,
        status:
          req.body?.status !== undefined
            ? String(req.body.status || "active").trim().toLowerCase()
            : employee.status,
        remarks:
          req.body?.remarks !== undefined ? String(req.body.remarks || "").trim() || null : employee.remarks,
        openingLoanBalance,
        openingAdvanceBalance,
        openingSalaryPayable,
        updatedAt: new Date(),
      },
    });

    const accounts = await ensureEmployeeAccounts(updated);
    const adjustmentDate = updated.openingBalanceDate || new Date();

    const loanAccount = getEmployeeAccountByRole(accounts, "loan");
    const advanceAccount = getEmployeeAccountByRole(accounts, "advance");
    const salaryAccount = getEmployeeAccountByRole(accounts, "salary_payable");

    if (loanAccount) {
      await adjustEmployeeOpeningBalance({
        employeeId: updated.id,
        employeeName: updated.name,
        employeeCode: updated.code,
        date: adjustmentDate,
        account: loanAccount,
        previousOpening: employee.openingLoanBalance,
        newOpening: openingLoanBalance,
        accountRole: "loan",
      });
    }

    if (advanceAccount) {
      await adjustEmployeeOpeningBalance({
        employeeId: updated.id,
        employeeName: updated.name,
        employeeCode: updated.code,
        date: adjustmentDate,
        account: advanceAccount,
        previousOpening: employee.openingAdvanceBalance,
        newOpening: openingAdvanceBalance,
        accountRole: "advance",
      });
    }

    if (salaryAccount) {
      await adjustEmployeeOpeningBalance({
        employeeId: updated.id,
        employeeName: updated.name,
        employeeCode: updated.code,
        date: adjustmentDate,
        account: salaryAccount,
        previousOpening: employee.openingSalaryPayable,
        newOpening: openingSalaryPayable,
        accountRole: "salary_payable",
      });
    }

    await syncEmployeeAccountNames(updated.id, updated.name);

    const refreshedAccounts = await getEmployeeAccounts(updated.id);
    res.json({
      data: {
        ...updated,
        ...mapEmployeeBalances(refreshedAccounts),
        accounts: refreshedAccounts,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get(`/${EMPLOYEE_ID_PARAM}/transactions`, async (req: Request, res: Response) => {
  try {
    const transactions = await prisma.employeeTransaction.findMany({
      where: { employeeId: req.params.id },
      orderBy: { date: "desc" },
      include: {
        Voucher: { select: { id: true, voucherNumber: true, type: true } },
      },
    });
    res.json({ data: transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(`/${EMPLOYEE_ID_PARAM}/transactions`, async (req: Request, res: Response) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { Account: true },
    });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found." });
    }

    const type = String(req.body?.type || "").trim() as EmployeeTxType;
    if (!EMPLOYEE_TX_TYPES.includes(type)) {
      return res.status(400).json({
        error: `Invalid transaction type. Allowed: ${EMPLOYEE_TX_TYPES.join(", ")}`,
      });
    }

    const amount = Number(req.body?.amount || 0);
    const absentDays = Number(req.body?.absentDays || 0);
    const leaves = parseNonNegativeAmount(req.body?.leaves, 0);
    const loanRecovery = Number(req.body?.loanRecovery || 0);
    const advanceRecovery = Number(req.body?.advanceRecovery || 0);
    const extraPayment = parseNonNegativeAmount(req.body?.extraPayment, 0);
    const extraDeduction = parseNonNegativeAmount(req.body?.extraDeduction, 0);
    const extraPaymentDescription =
      parseOptionalDescription(req.body?.extraPaymentDescription) || null;
    const extraDeductionDescription =
      parseOptionalDescription(req.body?.extraDeductionDescription) || null;
    const payrollMonth = parsePayrollMonth(req.body?.payrollMonth);
    const cashBankAccountId = String(req.body?.cashBankAccountId || "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : "";
    const date = parseDate(req.body?.date);
    const requestedWorkingDays =
      req.body?.workingDays !== undefined && req.body?.workingDays !== null && req.body?.workingDays !== ""
        ? Number(req.body.workingDays)
        : null;

    const accounts = employee.Account.length
      ? employee.Account
      : await ensureEmployeeAccounts(employee);

    const salaryAccount = getEmployeeAccountByRole(accounts, "salary_payable");
    const loanAccount = getEmployeeAccountByRole(accounts, "loan");
    const advanceAccount = getEmployeeAccountByRole(accounts, "advance");

    if (!salaryAccount || !loanAccount || !advanceAccount) {
      return res.status(400).json({ error: "Employee ledger accounts are not configured." });
    }

    const accountLabel = (account: { code: string; name: string }) =>
      `${account.code}-${account.name}`;

    const resolveCashBankLabel = async (accountId: string) => {
      const account = await prisma.account.findUnique({
        where: { id: accountId },
        select: { code: true, name: true },
      });
      return account ? accountLabel(account) : accountId;
    };

    let voucher: { id: string; voucherNumber: string; type: string } | null = null;
    let netPaid = 0;
    let referenceAmount = amount;
    let accrualWorkingDays: number | null = null;

    if (type === "advance_issue" || type === "loan_issue") {
      if (amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });
      if (!cashBankAccountId) {
        return res.status(400).json({ error: "Cash/Bank account is required." });
      }

      const targetAccount = type === "advance_issue" ? advanceAccount : loanAccount;
      const cashLabel = await resolveCashBankLabel(cashBankAccountId);
      voucher = await postEmployeeVoucher({
        type: "payment",
        date,
        narration: `${type === "advance_issue" ? "Salary advance" : "Staff loan"}: ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId,
        entries: [
          {
            accountId: targetAccount.id,
            accountName: accountLabel(targetAccount),
            debit: amount,
            credit: 0,
            description,
            employeeId: employee.id,
          },
          {
            accountId: cashBankAccountId,
            accountName: cashLabel,
            debit: 0,
            credit: amount,
            description,
            employeeId: employee.id,
          },
        ],
      });
      netPaid = amount;
    } else if (type === "loan_recovery" || type === "advance_recovery") {
      if (amount <= 0) return res.status(400).json({ error: "Amount must be greater than zero." });
      if (!cashBankAccountId) {
        return res.status(400).json({ error: "Cash/Bank account is required." });
      }

      const targetAccount = type === "loan_recovery" ? loanAccount : advanceAccount;
      const cashLabel = await resolveCashBankLabel(cashBankAccountId);
      voucher = await postEmployeeVoucher({
        type: "receipt",
        date,
        narration: `${type === "loan_recovery" ? "Loan recovery" : "Advance recovery"}: ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId,
        entries: [
          {
            accountId: cashBankAccountId,
            accountName: cashLabel,
            debit: amount,
            credit: 0,
            description,
            employeeId: employee.id,
          },
          {
            accountId: targetAccount.id,
            accountName: accountLabel(targetAccount),
            debit: 0,
            credit: amount,
            description,
            employeeId: employee.id,
          },
        ],
      });
      netPaid = amount;
    } else if (type === "salary_accrual") {
      if (!payrollMonth) {
        return res.status(400).json({ error: "Payroll month is required for salary accrual." });
      }
      const existingAccrual = await prisma.employeeTransaction.findFirst({
        where: {
          employeeId: employee.id,
          type: "salary_accrual",
          payrollMonth,
        },
        select: { id: true, referenceNo: true },
      });
      if (existingAccrual) {
        return res.status(400).json({
          error: `Payroll already accrued for ${payrollMonth}.`,
        });
      }

      const workingDays =
        requestedWorkingDays != null && Number.isFinite(requestedWorkingDays)
          ? requestedWorkingDays
          : Number(employee.workingDays || 26);
      if (!Number.isFinite(workingDays) || workingDays < 1) {
        return res.status(400).json({ error: "Working days must be at least 1." });
      }
      accrualWorkingDays = workingDays;

      let grossAmount: number;
      try {
        grossAmount = calculateAccruedSalary(
          Number(employee.monthlySalary || 0),
          workingDays,
          absentDays,
        );
      } catch (error: any) {
        return res.status(400).json({ error: error.message });
      }

      if (grossAmount <= 0) {
        return res.status(400).json({ error: "Accrued salary amount must be greater than zero." });
      }

      if (leaves < 0) {
        return res.status(400).json({ error: "Leaves cannot be negative." });
      }

      const daysWorked = workingDays - absentDays;

      if (loanRecovery > Number(loanAccount.currentBalance || 0) + 0.01) {
        return res.status(400).json({ error: "Loan recovery exceeds outstanding loan balance." });
      }
      if (advanceRecovery > Number(advanceAccount.currentBalance || 0) + 0.01) {
        return res.status(400).json({ error: "Advance recovery exceeds outstanding advance balance." });
      }

      netPaid = calculatePayrollNetPayable({
        grossAmount,
        loanRecovery,
        advanceRecovery,
        extraPayment,
        extraDeduction,
      });
      const expenseDebit = calculatePayrollExpenseDebit({
        grossAmount,
        extraPayment,
        extraDeduction,
      });
      if (expenseDebit < 0) {
        return res.status(400).json({
          error: "Extra deduction cannot exceed gross salary plus extra payment.",
        });
      }
      if (netPaid < 0) {
        return res.status(400).json({ error: "Recoveries and deductions exceed gross salary." });
      }

      const extraFieldError = validatePayrollExtraFieldDescriptions({
        extraPayment,
        extraPaymentDescription,
        extraDeduction,
        extraDeductionDescription,
      });
      if (extraFieldError) {
        return res.status(400).json({ error: extraFieldError });
      }

      const expenseAccount = await getStaffSalaryExpenseAccount();
      if (!expenseAccount) {
        return res.status(400).json({
          error: "Staff Salary Expense account not found. Add it under the Salary Expense subgroup.",
        });
      }

      const accrualEntries = buildPayrollAccrualVoucherEntries({
        employeeId: employee.id,
        expenseAccount,
        salaryAccount,
        loanAccount,
        advanceAccount,
        accountLabel,
        grossAmount,
        extraPayment,
        extraPaymentDescription,
        extraDeduction,
        extraDeductionDescription,
        netPaid,
        loanRecovery,
        advanceRecovery,
        description,
        daysWorked,
        workingDays,
      });

      voucher = await postEmployeeVoucher({
        type: "journal",
        date,
        narration: `Salary accrual (${payrollMonth}): ${employee.name} (${daysWorked}/${workingDays} days)`,
        employeeId: employee.id,
        entries: accrualEntries,
      });
      referenceAmount = grossAmount;
    } else if (type === "salary_payment") {
      if (!payrollMonth) {
        return res.status(400).json({ error: "Payroll month is required for salary payment." });
      }
      const accrual = await prisma.employeeTransaction.findFirst({
        where: {
          employeeId: employee.id,
          type: "salary_accrual",
          payrollMonth,
        },
        select: { netPaid: true, referenceNo: true },
      });
      if (!accrual) {
        return res.status(400).json({
          error: `No salary accrual found for ${payrollMonth}. Accrue salary first.`,
        });
      }
      const paidSummary = await prisma.employeeTransaction.aggregate({
        where: {
          employeeId: employee.id,
          type: "salary_payment",
          payrollMonth,
        },
        _sum: { netPaid: true },
      });
      const paidForMonth = Number(paidSummary._sum.netPaid || 0);
      const monthOutstanding = Number(accrual.netPaid || 0) - paidForMonth;
      if (monthOutstanding <= 0.01) {
        return res.status(400).json({
          error: `Salary already paid for ${payrollMonth}.`,
        });
      }

      const salaryPayableBalance = Number(salaryAccount.currentBalance || 0);
      const cashAmount = parseNonNegativeAmount(req.body?.cashAmount, 0);
      const bankAmount = parseNonNegativeAmount(req.body?.bankAmount, 0);
      const cashAccountId = String(req.body?.cashAccountId || "").trim();
      const bankAccountId = String(req.body?.bankAccountId || "").trim();

      let payAmount = cashAmount + bankAmount;
      const paymentCredits: Array<{ accountId: string; amount: number }> = [];

      if (payAmount > 0) {
        if (cashAmount > 0) {
          if (!cashAccountId) {
            return res.status(400).json({
              error: "Cash account is required when cash amount is greater than zero.",
            });
          }
          paymentCredits.push({ accountId: cashAccountId, amount: cashAmount });
        }
        if (bankAmount > 0) {
          if (!bankAccountId) {
            return res.status(400).json({
              error: "Bank account is required when bank amount is greater than zero.",
            });
          }
          paymentCredits.push({ accountId: bankAccountId, amount: bankAmount });
        }
      } else if (amount > 0 && cashBankAccountId) {
        payAmount = amount;
        paymentCredits.push({ accountId: cashBankAccountId, amount: payAmount });
      } else {
        return res.status(400).json({ error: "Salary payment amount must be greater than zero." });
      }

      if (salaryPayableBalance + 0.01 < payAmount) {
        return res.status(400).json({
          error: `Insufficient salary payable balance (${salaryPayableBalance.toFixed(2)}). Accrue salary first.`,
        });
      }
      if (payAmount > monthOutstanding + 0.01) {
        return res.status(400).json({
          error: `Payment exceeds ${payrollMonth} outstanding salary (${monthOutstanding.toFixed(2)}).`,
        });
      }

      for (const credit of paymentCredits) {
        const account = await prisma.account.findUnique({
          where: { id: credit.accountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (!account || !isChartCashBankAccount(account)) {
          return res.status(400).json({ error: "Invalid cash/bank account selected." });
        }
      }

      if (cashAmount > 0 && cashAccountId) {
        const cashAccount = await prisma.account.findUnique({
          where: { id: cashAccountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (!cashAccount || getAccountCashBankMode(cashAccount) !== "cash") {
          return res.status(400).json({ error: "Selected cash account is not a cash ledger." });
        }
      }

      if (bankAmount > 0 && bankAccountId) {
        const bankAccount = await prisma.account.findUnique({
          where: { id: bankAccountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (!bankAccount || getAccountCashBankMode(bankAccount) !== "online") {
          return res.status(400).json({ error: "Selected bank account is not a bank ledger." });
        }
      }

      netPaid = payAmount;

      const entries: Array<{
        accountId: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
        employeeId: string;
      }> = [
        {
          accountId: salaryAccount.id,
          accountName: accountLabel(salaryAccount),
          debit: payAmount,
          credit: 0,
          description: description || "Salary payment",
          employeeId: employee.id,
        },
      ];

      for (const credit of paymentCredits) {
        entries.push({
          accountId: credit.accountId,
          accountName: await resolveCashBankLabel(credit.accountId),
          debit: 0,
          credit: credit.amount,
          description: "Net salary paid",
          employeeId: employee.id,
        });
      }

      const primaryCashBankAccountId =
        cashAccountId || bankAccountId || cashBankAccountId || undefined;

      voucher = await postEmployeeVoucher({
        type: "payment",
        date,
        narration: `Salary payment (${payrollMonth}): ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId: primaryCashBankAccountId,
        entries,
      });
      referenceAmount = payAmount;
    }

    const transaction = await prisma.employeeTransaction.create({
      data: {
        id: randomUUID(),
        employeeId: employee.id,
        type,
        date,
        payrollMonth: payrollMonth || null,
        amount: referenceAmount,
        absentDays: type === "salary_accrual" ? absentDays : 0,
        workingDays: type === "salary_accrual" ? accrualWorkingDays : null,
        loanRecovery,
        advanceRecovery,
        netPaid,
        description: description || null,
        voucherId: voucher?.id || null,
        referenceNo: voucher?.voucherNumber || null,
        updatedAt: new Date(),
      },
      include: {
        Voucher: { select: { id: true, voucherNumber: true, type: true } },
      },
    });

    if (type === "salary_accrual") {
      await setEmployeePayrollSupplementaryFields(transaction.id, {
        leaves,
        extraPayment,
        extraPaymentDescription,
        extraDeduction,
        extraDeductionDescription,
      });
    }

    const refreshedAccounts = await getEmployeeAccounts(employee.id);
    res.status(201).json({
      data: {
        transaction:
          type === "salary_accrual"
            ? {
                ...transaction,
                leaves,
                extraPayment,
                extraPaymentDescription,
                extraDeduction,
                extraDeductionDescription,
              }
            : transaction,
        balances: mapEmployeeBalances(refreshedAccounts),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
