import { randomUUID } from "crypto";
import prisma from "../config/database";

export type EmployeeAccountRole = "salary_payable" | "loan" | "advance";

export function getEmployeeAccountRoleLabel(role: EmployeeAccountRole): string {
  if (role === "salary_payable") return "Salary Payable";
  if (role === "loan") return "Loan";
  return "Advance";
}

export function formatEmployeeAccountName(
  employeeName: string,
  role: EmployeeAccountRole,
): string {
  const name = employeeName.trim();
  if (role === "loan") return `${name} - Loan`;
  if (role === "advance") return `${name} - Advance`;
  return name;
}

export function calculateAccruedSalary(
  monthlySalary: number,
  workingDays: number,
  absentDays: number,
): number {
  if (workingDays <= 0) {
    throw new Error("Working days must be greater than zero.");
  }
  if (absentDays < 0) {
    throw new Error("Absent days cannot be negative.");
  }
  if (absentDays > workingDays) {
    throw new Error("Absent days cannot exceed working days.");
  }

  const daysWorked = workingDays - absentDays;
  return Math.round((monthlySalary / workingDays) * daysWorked * 100) / 100;
}

export async function syncEmployeeAccountNames(employeeId: string, employeeName: string) {
  const accounts = await prisma.account.findMany({
    where: {
      employeeId,
      employeeAccountRole: { in: ["salary_payable", "loan", "advance"] },
    },
    select: { id: true, employeeAccountRole: true, name: true },
  });

  for (const account of accounts) {
    const role = account.employeeAccountRole as EmployeeAccountRole | null;
    if (!role) continue;

    const expectedName = formatEmployeeAccountName(employeeName, role);
    if (account.name === expectedName) continue;

    await prisma.account.update({
      where: { id: account.id },
      data: { name: expectedName, updatedAt: new Date() },
    });
  }
}

const ROLE_SUBGROUP_CONFIG: Record<
  EmployeeAccountRole,
  { mainTypes: string[]; keywords: string[]; preferredCode?: string }
> = {
  salary_payable: {
    mainTypes: ["Liability", "liability"],
    keywords: ["staff salaries", "staff salary", "salaries payable", "salaries"],
    preferredCode: "307",
  },
  loan: {
    mainTypes: ["Asset", "asset"],
    keywords: ["staff loan", "employee loan", "loan"],
  },
  advance: {
    mainTypes: ["Asset", "asset"],
    keywords: ["staff advance", "salary advance", "advance"],
  },
};

export async function findEmployeeSubgroup(role: EmployeeAccountRole) {
  const { mainTypes, keywords, preferredCode } = ROLE_SUBGROUP_CONFIG[role];

  if (preferredCode) {
    const preferredSubgroup = await prisma.subgroup.findFirst({
      where: {
        code: preferredCode,
        MainGroup: { type: { in: mainTypes } },
      },
      include: { MainGroup: true },
    });
    if (preferredSubgroup) return preferredSubgroup;
  }

  for (const keyword of keywords) {
    const subgroup = await prisma.subgroup.findFirst({
      where: {
        name: { contains: keyword, mode: "insensitive" },
        MainGroup: { type: { in: mainTypes } },
      },
      include: { MainGroup: true },
    });
    if (subgroup) return subgroup;
  }

  return null;
}

export async function findSalaryExpenseSubgroup() {
  const keywords = ["salary expense", "salaries expense", "salaries"];
  for (const keyword of keywords) {
    const subgroup = await prisma.subgroup.findFirst({
      where: {
        name: { contains: keyword, mode: "insensitive" },
        MainGroup: { type: { in: ["Expense", "expense", "Cost", "cost"] } },
      },
      include: { MainGroup: true },
    });
    if (subgroup) return subgroup;
  }

  return prisma.subgroup.findFirst({
    where: { code: "808" },
    include: { MainGroup: true },
  });
}

const STAFF_SALARY_EXPENSE_ACCOUNT_NAME = "Staff Salary Expense";

export async function getStaffSalaryExpenseAccount() {
  const expenseSubgroup = await findSalaryExpenseSubgroup();
  if (!expenseSubgroup) return null;

  const accountByCode = await prisma.account.findFirst({
    where: {
      subgroupId: expenseSubgroup.id,
      code: "808001",
      status: "Active",
    },
  });
  if (accountByCode) return accountByCode;

  const preferredAccount = await prisma.account.findFirst({
    where: {
      subgroupId: expenseSubgroup.id,
      name: { equals: STAFF_SALARY_EXPENSE_ACCOUNT_NAME, mode: "insensitive" },
      status: "Active",
    },
  });
  if (preferredAccount) return preferredAccount;

  const fallbackAccount = await prisma.account.findFirst({
    where: {
      subgroupId: expenseSubgroup.id,
      name: { contains: "salary", mode: "insensitive" },
      status: "Active",
    },
    orderBy: { code: "asc" },
  });
  if (fallbackAccount) return fallbackAccount;

  const expenseCode = await generateAccountCode(expenseSubgroup.code);
  return prisma.account.create({
    data: {
      id: randomUUID(),
      subgroupId: expenseSubgroup.id,
      code: expenseCode,
      name: STAFF_SALARY_EXPENSE_ACCOUNT_NAME,
      description: "Staff salaries expense",
      accountType: "regular",
      openingBalance: 0,
      currentBalance: 0,
      status: "Active",
      canDelete: true,
      updatedAt: new Date(),
    },
  });
}

export async function generateAccountCode(subgroupCode: string): Promise<string> {
  const prefix = String(subgroupCode).trim();
  const existingAccounts = await prisma.account.findMany({
    where: { code: { startsWith: prefix } },
    orderBy: { code: "desc" },
  });

  let nextSeq = 1;
  if (existingAccounts.length > 0) {
    const lastCode = existingAccounts[0].code;
    const seqPart = lastCode.substring(prefix.length);
    const num = parseInt(seqPart, 10);
    if (!isNaN(num) && num > 0) nextSeq = num + 1;
  }

  return `${prefix}${String(nextSeq).padStart(3, "0")}`;
}

export async function getOwnerCapitalAccount() {
  let account = await prisma.account.findFirst({ where: { code: "501003" } });
  if (account) return account;

  const capitalSubgroup = await prisma.subgroup.findFirst({ where: { code: "501" } });
  if (!capitalSubgroup) {
    throw new Error("Capital subgroup (501) not found. Please set up the chart of accounts first.");
  }

  account = await prisma.account.create({
    data: {
      id: randomUUID(),
      subgroupId: capitalSubgroup.id,
      code: "501003",
      name: "OWNER CAPITAL",
      description: "Owner Capital account",
      openingBalance: 0,
      currentBalance: 0,
      status: "Active",
      canDelete: false,
      updatedAt: new Date(),
    },
  });

  return account;
}

async function allocateVoucherNumber(prefix: string, floor: number): Promise<string> {
  const vouchers = await prisma.voucher.findMany({
    where: { voucherNumber: { startsWith: `${prefix}-` } },
    select: { voucherNumber: true },
  });

  let maxSeq = 0;
  for (const voucher of vouchers) {
    const match = voucher.voucherNumber.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (match) {
      const seq = parseInt(match[1], 10);
      if (seq > maxSeq) maxSeq = seq;
    }
  }

  const nextSeq = Math.max(maxSeq + 1, floor + 1);
  return `${prefix}-${String(nextSeq).padStart(4, "0")}`;
}

export async function allocateJvNumber() {
  return allocateVoucherNumber("JV", 0);
}

export async function allocatePvNumber() {
  return allocateVoucherNumber("PV", 0);
}

export async function allocateRvNumber() {
  return allocateVoucherNumber("RV", 0);
}

export async function applyBalanceChange(
  accountId: string,
  debit: number,
  credit: number,
) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { Subgroup: { include: { MainGroup: true } } },
  });
  if (!account?.Subgroup?.MainGroup) return;

  const accountType = account.Subgroup.MainGroup.type.toLowerCase();
  const balanceChange =
    accountType === "asset" || accountType === "expense" || accountType === "cost"
      ? debit - credit
      : credit - debit;

  if (balanceChange === 0) return;

  await prisma.account.update({
    where: { id: accountId },
    data: {
      currentBalance: { increment: balanceChange },
      updatedAt: new Date(),
    },
  });
}

/** Reverse posted balances and remove a system employee voucher. */
export async function reverseEmployeeVoucher(voucherId: string) {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    include: {
      VoucherEntry: {
        select: { accountId: true, debit: true, credit: true },
      },
    },
  });
  if (!voucher) return;

  if (voucher.status === "posted") {
    for (const entry of voucher.VoucherEntry) {
      if (!entry.accountId) continue;
      // Swap debit/credit to reverse the original balance effect
      await applyBalanceChange(entry.accountId, entry.credit, entry.debit);
    }
  }

  await prisma.voucherEntry.deleteMany({ where: { voucherId } });
  await prisma.voucher.delete({ where: { id: voucherId } });
}

type VoucherEntryInput = {
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
  description?: string;
  employeeId?: string;
};

export async function postEmployeeVoucher(params: {
  type: "journal" | "payment" | "receipt";
  date: Date;
  narration: string;
  employeeId: string;
  entries: VoucherEntryInput[];
  cashBankAccountId?: string;
}) {
  const totalDebit = params.entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = params.entries.reduce((sum, entry) => sum + entry.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error("Voucher entries must balance.");
  }

  const voucherNumber =
    params.type === "payment"
      ? await allocatePvNumber()
      : params.type === "receipt"
        ? await allocateRvNumber()
        : await allocateJvNumber();

  const voucher = await prisma.voucher.create({
    data: {
      id: randomUUID(),
      voucherNumber,
      type: params.type,
      date: params.date,
      narration: params.narration,
      cashBankAccount: params.cashBankAccountId || null,
      totalDebit,
      totalCredit,
      status: "posted",
      createdBy: "System",
      approvedBy: "System",
      approvedAt: new Date(),
      isSystemGenerated: true,
      updatedAt: new Date(),
      VoucherEntry: {
        create: params.entries.map((entry, index) => ({
          id: randomUUID(),
          accountId: entry.accountId,
          accountName: entry.accountName,
          description: entry.description || null,
          debit: entry.debit,
          credit: entry.credit,
          sortOrder: index,
          employeeId: entry.employeeId || params.employeeId,
        })),
      },
    },
  });

  for (const entry of params.entries) {
    await applyBalanceChange(entry.accountId, entry.debit, entry.credit);
  }

  return voucher;
}

export async function createEmployeeLedgerAccount(params: {
  employeeId: string;
  employeeName: string;
  role: EmployeeAccountRole;
  subgroupId: string;
  subgroupCode: string;
  description: string;
}) {
  const code = await generateAccountCode(params.subgroupCode);
  const roleLabel = getEmployeeAccountRoleLabel(params.role);

  return prisma.account.create({
    data: {
      id: randomUUID(),
      subgroupId: params.subgroupId,
      code,
      name: formatEmployeeAccountName(params.employeeName, params.role),
      description: `${roleLabel}: ${params.description}`,
      accountType: "person",
      openingBalance: 0,
      currentBalance: 0,
      status: "Active",
      canDelete: false,
      employeeId: params.employeeId,
      employeeAccountRole: params.role,
      updatedAt: new Date(),
    },
  });
}

export async function postOpeningBalanceJv(params: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: Date;
  account: { id: string; code: string; name: string };
  amount: number;
  accountRole: EmployeeAccountRole;
}) {
  // Opening is carried only by the JV — do not set Account.openingBalance
  // or ledgers will double-count (static OB row + voucher).
  return postEmployeeOpeningBalanceChange({
    ...params,
    amount: params.amount,
    narration: `Employee opening balance: ${params.employeeName} (${params.employeeCode})`,
    entryDescription: `Opening balance (${params.accountRole})`,
    offsetDescription: "Employee opening balance offset",
  });
}

export async function adjustEmployeeOpeningBalance(params: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: Date;
  account: { id: string; code: string; name: string };
  previousOpening: number;
  newOpening: number;
  accountRole: EmployeeAccountRole;
}) {
  const delta = params.newOpening - params.previousOpening;
  if (Math.abs(delta) < 0.01) return null;

  // Opening is carried only by the JV — do not set Account.openingBalance
  // or ledgers will double-count (static OB row + voucher).
  return postEmployeeOpeningBalanceChange({
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    employeeCode: params.employeeCode,
    date: params.date,
    account: params.account,
    amount: delta,
    accountRole: params.accountRole,
    narration: `Employee opening balance adjustment: ${params.employeeName} (${params.employeeCode})`,
    entryDescription: `Opening balance adjustment (${params.accountRole})`,
    offsetDescription: "Employee opening balance adjustment offset",
  });
}

async function postEmployeeOpeningBalanceChange(params: {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  date: Date;
  account: { id: string; code: string; name: string };
  amount: number;
  accountRole: EmployeeAccountRole;
  narration: string;
  entryDescription: string;
  offsetDescription: string;
}) {
  const absAmount = Math.abs(params.amount);
  if (absAmount < 0.01) return null;

  const ownerCapital = await getOwnerCapitalAccount();
  const ownerCapitalName = `${ownerCapital.code}-${ownerCapital.name}`;
  const employeeAccountName = `${params.account.code}-${params.account.name}`;

  let employeeDebit = 0;
  let employeeCredit = 0;
  let capitalDebit = 0;
  let capitalCredit = 0;

  if (params.accountRole === "salary_payable") {
    const isPositive = params.amount > 0;
    employeeDebit = isPositive ? 0 : absAmount;
    employeeCredit = isPositive ? absAmount : 0;
    capitalDebit = isPositive ? absAmount : 0;
    capitalCredit = isPositive ? 0 : absAmount;
  } else {
    const isPositive = params.amount > 0;
    employeeDebit = isPositive ? absAmount : 0;
    employeeCredit = isPositive ? 0 : absAmount;
    capitalDebit = isPositive ? 0 : absAmount;
    capitalCredit = isPositive ? absAmount : 0;
  }

  return postEmployeeVoucher({
    type: "journal",
    date: params.date,
    narration: params.narration,
    employeeId: params.employeeId,
    entries: [
      {
        accountId: params.account.id,
        accountName: employeeAccountName,
        debit: employeeDebit,
        credit: employeeCredit,
        description: params.entryDescription,
        employeeId: params.employeeId,
      },
      {
        accountId: ownerCapital.id,
        accountName: ownerCapitalName,
        debit: capitalDebit,
        credit: capitalCredit,
        description: params.offsetDescription,
        employeeId: params.employeeId,
      },
    ],
  });
}

export function getEmployeeAccountByRole(
  accounts: Array<{ employeeAccountRole: string | null; id: string; code: string; name: string; currentBalance: number }>,
  role: EmployeeAccountRole,
) {
  return accounts.find((account) => account.employeeAccountRole === role) || null;
}

export function isCashBankAccount(account: {
  Subgroup?: { name?: string | null; MainGroup?: { type?: string | null } | null } | null;
}) {
  const subgroupName = String(account.Subgroup?.name || "").toLowerCase();
  const mainType = String(account.Subgroup?.MainGroup?.type || "").toLowerCase();
  if (mainType !== "asset") return false;
  return subgroupName.includes("cash") || subgroupName.includes("bank");
}
