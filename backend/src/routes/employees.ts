import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import prisma from "../config/database";
import {
  createEmployeeLedgerAccount,
  findEmployeeSubgroup,
  adjustEmployeeOpeningBalance,
  calculateAccruedSalary,
  syncEmployeeAccountNames,
  getStaffSalaryExpenseAccount,
  getEmployeeAccountByRole,
  isCashBankAccount,
  postEmployeeVoucher,
  postOpeningBalanceJv,
  type EmployeeAccountRole,
} from "../utils/employeeAccounting";

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

const LOAN_ADVANCE_TX_TYPES = [
  "advance_issue",
  "loan_issue",
  "loan_recovery",
  "advance_recovery",
] as const;

type EmployeeTxType = (typeof EMPLOYEE_TX_TYPES)[number];

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

function mapEmployeeBalances(accounts: Array<{
  id: string;
  code: string;
  name: string;
  currentBalance: number;
  employeeAccountRole: string | null;
}>) {
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

async function getEmployeeAccounts(employeeId: string) {
  return prisma.account.findMany({
    where: { employeeId },
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
    created.push(account);
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
      .filter((account) => isCashBankAccount(account))
      .map((account) => ({
        id: account.id,
        code: account.code,
        name: account.name,
        label: `${account.code} - ${account.name}`,
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
          Voucher: { select: { id: true, voucherNumber: true, type: true } },
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

router.get("/payroll-transactions", async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || "").trim();
    const payrollMonth = parsePayrollMonth(req.query.payrollMonth);
    const paymentStatus = String(req.query.paymentStatus || "all").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.max(1, parseInt(String(req.query.limit || "25"), 10) || 25);

    const employeeFilter = search
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
    };

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

        const workingDays = Number(accrual.Employee?.workingDays || 26);
        const absentDays = Number(accrual.absentDays || 0);

        return {
          id: accrual.id,
          employeeId: accrual.employeeId,
          date: accrual.date,
          payrollMonth: bucket.month,
          grossAmount: Number(accrual.amount || 0),
          absentDays,
          workingDays,
          daysWorked: workingDays - absentDays,
          loanRecovery: Number(accrual.loanRecovery || 0),
          advanceRecovery: Number(accrual.advanceRecovery || 0),
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
    const loanRecovery = Number(req.body?.loanRecovery || 0);
    const advanceRecovery = Number(req.body?.advanceRecovery || 0);
    const payrollMonth = parsePayrollMonth(req.body?.payrollMonth);
    const cashBankAccountId = String(req.body?.cashBankAccountId || "").trim();
    const description = req.body?.description ? String(req.body.description).trim() : "";
    const date = parseDate(req.body?.date);

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

      const workingDays = Number(employee.workingDays || 26);
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

      const daysWorked = workingDays - absentDays;

      if (loanRecovery > Number(loanAccount.currentBalance || 0) + 0.01) {
        return res.status(400).json({ error: "Loan recovery exceeds outstanding loan balance." });
      }
      if (advanceRecovery > Number(advanceAccount.currentBalance || 0) + 0.01) {
        return res.status(400).json({ error: "Advance recovery exceeds outstanding advance balance." });
      }

      netPaid = grossAmount - loanRecovery - advanceRecovery;
      if (netPaid < 0) {
        return res.status(400).json({ error: "Recoveries cannot exceed gross salary." });
      }

      const expenseAccount = await getStaffSalaryExpenseAccount();
      if (!expenseAccount) {
        return res.status(400).json({
          error: "Staff Salary Expense account not found. Add it under the Salary Expense subgroup.",
        });
      }

      const accrualEntries: Array<{
        accountId: string;
        accountName: string;
        debit: number;
        credit: number;
        description?: string;
        employeeId: string;
      }> = [
        {
          accountId: expenseAccount.id,
          accountName: accountLabel(expenseAccount),
          debit: grossAmount,
          credit: 0,
          description,
          employeeId: employee.id,
        },
        {
          accountId: salaryAccount.id,
          accountName: accountLabel(salaryAccount),
          debit: 0,
          credit: netPaid,
          description: description || "Net salary payable",
          employeeId: employee.id,
        },
      ];

      if (loanRecovery > 0) {
        accrualEntries.push({
          accountId: loanAccount.id,
          accountName: accountLabel(loanAccount),
          debit: 0,
          credit: loanRecovery,
          description: "Loan recovery",
          employeeId: employee.id,
        });
      }

      if (advanceRecovery > 0) {
        accrualEntries.push({
          accountId: advanceAccount.id,
          accountName: accountLabel(advanceAccount),
          debit: 0,
          credit: advanceRecovery,
          description: "Advance recovery",
          employeeId: employee.id,
        });
      }

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
      const payAmount = amount > 0 ? amount : monthOutstanding;
      if (payAmount <= 0) {
        return res.status(400).json({ error: "Salary payment amount must be greater than zero." });
      }
      if (!cashBankAccountId) {
        return res.status(400).json({ error: "Cash/Bank account is required." });
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
        {
          accountId: cashBankAccountId,
          accountName: await resolveCashBankLabel(cashBankAccountId),
          debit: 0,
          credit: payAmount,
          description: "Net salary paid",
          employeeId: employee.id,
        },
      ];

      voucher = await postEmployeeVoucher({
        type: "payment",
        date,
        narration: `Salary payment (${payrollMonth}): ${employee.name}`,
        employeeId: employee.id,
        cashBankAccountId,
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

    const refreshedAccounts = await getEmployeeAccounts(employee.id);
    res.status(201).json({
      data: {
        transaction,
        balances: mapEmployeeBalances(refreshedAccounts),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
