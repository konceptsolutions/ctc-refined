import express, { Request, Response } from 'express';
import prisma from '../config/database';
import crypto from 'crypto';
import { resolveCashBankModeFromAccount } from '../utils/cashBankMode';

const router = express.Router();

const VOUCHER_TYPE_PREFIX: Record<string, string> = {
  payment: "PV",
  receipt: "RV",
  journal: "JV",
  contra: "CV",
};

const RECEIPT_KIND_PREFIX: Record<string, string> = {
  cash: "RVC",
  bank: "RVB",
  cheque: "RVCH",
};

const VOUCHER_SEQUENCE_FLOORS: Record<string, number> = {
  payment: 2000,
  receipt: 1000,
  journal: 3000,
  contra: 100,
};

const RECEIPT_KIND_FLOORS: Record<string, number> = {
  cash: 1000,
  bank: 1000,
  cheque: 1000,
};

function parseVoucherSequence(
  voucherNumber: string,
  prefix: string,
): number | null {
  const match = String(voucherNumber)
    .trim()
    .match(new RegExp(`^${prefix}(\\d+)$`, "i"));
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function allocateNextReceiptVoucherNumber(
  kind: string,
): Promise<string> {
  const normalizedKind = String(kind).trim().toLowerCase();
  const prefix = RECEIPT_KIND_PREFIX[normalizedKind];
  if (!prefix) {
    throw new Error("Invalid receipt voucher kind");
  }

  const vouchers = await prisma.voucher.findMany({
    where: { type: "receipt" },
    select: { voucherNumber: true },
  });

  let maxSeq = 0;
  for (const voucher of vouchers) {
    const seq = parseVoucherSequence(voucher.voucherNumber, prefix);
    if (seq !== null && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const floor = RECEIPT_KIND_FLOORS[normalizedKind] ?? 1000;
  const nextSeq = Math.max(maxSeq + 1, floor + 1);
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

async function allocateNextVoucherNumber(type: string): Promise<string> {
  const normalized = String(type).trim().toLowerCase();
  const prefix = VOUCHER_TYPE_PREFIX[normalized];
  if (!prefix) {
    throw new Error("Invalid voucher type");
  }

  const vouchers = await prisma.voucher.findMany({
    where: { type: normalized },
    select: { voucherNumber: true },
  });

  let maxSeq = 0;
  for (const voucher of vouchers) {
    const seq = parseVoucherSequence(voucher.voucherNumber, prefix);
    if (seq !== null && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const floor = VOUCHER_SEQUENCE_FLOORS[normalized] ?? 0;
  const nextSeq = Math.max(maxSeq + 1, floor + 1);
  return `${prefix}${String(nextSeq).padStart(4, "0")}`;
}

function normalizeVoucherTypeFilter(typeParam: unknown): string | undefined {
  if (typeParam === undefined || typeParam === null) return undefined;
  const raw = String(typeParam).trim();
  if (!raw || raw.toLowerCase() === 'all') return undefined;

  // Compatibility mapping: frontend may send numeric voucher type ids.
  // DB stores voucher.type as strings ("payment" | "receipt" | "journal" | ...).
  const numericMap: Record<string, string> = {
    '1': 'payment',
    '2': 'receipt',
    '3': 'journal',
  };
  if (Object.prototype.hasOwnProperty.call(numericMap, raw)) {
    return numericMap[raw];
  }

  // String types (e.g. "payment", "receipt", "journal", "contra", ...)
  return raw;
}

function isSentinel(value: unknown, sentinels: string[]): boolean {
  const raw = String(value ?? '').trim();
  return !raw || sentinels.includes(raw);
}

async function applyAccountFilters(
  where: Record<string, unknown>,
  query: Request['query'],
): Promise<void> {
  const accountId = isSentinel(query.account_id, ['_all', 'all'])
    ? undefined
    : String(query.account_id).trim();
  const subgroupId = isSentinel(query.subgroup_id, ['_all', 'all'])
    ? undefined
    : String(query.subgroup_id).trim();
  const mainGroupId = isSentinel(query.maingroup_id, ['_all', 'all'])
    ? undefined
    : String(query.maingroup_id).trim();
  const category = isSentinel(query.category, ['default', 'all'])
    ? undefined
    : String(query.category).trim().toLowerCase();

  const entryAccountWhere: Record<string, unknown> = {};

  if (subgroupId) {
    entryAccountWhere.subgroupId = subgroupId;
  }

  const subgroupFilter: Record<string, unknown> = {};
  if (mainGroupId) {
    subgroupFilter.mainGroupId = mainGroupId;
  }

  if (category === 'expense' || category === 'income') {
    const mainGroupTypes =
      category === 'expense'
        ? ['expense', 'Expense', 'EXPENSE', 'cost', 'Cost', 'COST']
        : ['Income', 'income', 'INCOME', 'Revenue', 'revenue', 'REVENUE'];
    subgroupFilter.MainGroup = {
      ...(typeof subgroupFilter.MainGroup === 'object' && subgroupFilter.MainGroup !== null
        ? subgroupFilter.MainGroup
        : {}),
      type: { in: mainGroupTypes },
    };
  }

  if (Object.keys(subgroupFilter).length > 0) {
    entryAccountWhere.Subgroup = subgroupFilter;
  }

  const entrySome: Record<string, unknown> = {};
  if (accountId) {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { code: true },
    });
    const entryOr: Record<string, unknown>[] = [{ accountId }];
    if (account?.code) {
      entryOr.push({
        accountName: { contains: account.code, mode: 'insensitive' },
      });
    }
    entrySome.OR = entryOr;
    if (Object.keys(entryAccountWhere).length > 0) {
      entrySome.Account = entryAccountWhere;
    }

    const accountClause = {
      OR: [
        { VoucherEntry: { some: entrySome } },
        { cashBankAccount: accountId },
      ],
    };

    if (!Array.isArray(where.AND)) {
      where.AND = [];
    }
    (where.AND as Record<string, unknown>[]).push(accountClause);
    return;
  }

  if (Object.keys(entryAccountWhere).length > 0) {
    entrySome.Account = entryAccountWhere;
    if (!Array.isArray(where.AND)) {
      where.AND = [];
    }
    (where.AND as Record<string, unknown>[]).push({
      VoucherEntry: { some: entrySome },
    });
  }
}

function applyPostDatedFilter(
  where: Record<string, unknown>,
  isPostDated: unknown,
): void {
  const value = String(isPostDated ?? '').trim().toLowerCase();
  if (value !== 'yes' && value !== 'no') return;

  const dateFilter =
    typeof where.date === 'object' && where.date !== null
      ? { ...(where.date as Record<string, unknown>) }
      : {};

  if (value === 'yes') {
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    dateFilter.gte = startOfTomorrow;
  } else {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    dateFilter.lte = endOfToday;
  }

  where.date = dateFilter;
}

// Get all vouchers
router.get('/', async (req: Request, res: Response) => {
  try {
    const {
      type,
      status,
      from_date,
      to_date,
      search,
      search_by,
      page = '1',
      limit = '100',
    } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    const normalizedType = normalizeVoucherTypeFilter(type);
    if (normalizedType) {
      where.type = normalizedType;
    }

    if (status && status !== 'all') {
      where.status = status as string;
    }

    if (from_date || to_date) {
      where.date = {};
      if (from_date) {
        const fromDateObj = new Date(from_date as string);
        fromDateObj.setHours(0, 0, 0, 0);
        where.date.gte = fromDateObj;
      }
      if (to_date) {
        const toDateObj = new Date(to_date as string);
        toDateObj.setHours(23, 59, 59, 999);
        where.date.lte = toDateObj;
      }
    }

    if (search && String(search).trim()) {
      const searchTerm = (search as string).trim();
      const searchBy = (search_by as string) || 'voucher-no';
      const insensitiveContains = (field: string) => ({
        [field]: { contains: searchTerm, mode: 'insensitive' as const },
      });

      switch (searchBy) {
        case 'voucher-no':
          where.OR = [insensitiveContains('voucherNumber')];
          break;
        case 'voucher-name':
          where.OR = [insensitiveContains('narration')];
          break;
        case 'amount':
          // Filtered in memory after fetch (debit/credit on entries)
          break;
        default:
          where.OR = [
            insensitiveContains('voucherNumber'),
            insensitiveContains('narration'),
          ];
      }
    }

    applyPostDatedFilter(where, req.query.is_post_dated);
    await applyAccountFilters(where, req.query);

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: {
          VoucherEntry: {
            include: {
              Account: {
                select: {
                  id: true,
                  code: true,
                  name: true,
                  Subgroup: {
                    select: {
                      code: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ date: "desc" }, { voucherNumber: "desc" }],
        skip,
        take: limitNum,
      }),
      prisma.voucher.count({ where }),
    ]);

    const resolveCashBankIdFromEntries = (voucher: (typeof vouchers)[number]): string | null => {
      if (voucher.cashBankAccount) return voucher.cashBankAccount;
      if (voucher.type !== "payment" && voucher.type !== "receipt") return null;
      const side = voucher.type === "receipt" ? "debit" : "credit";
      let bestId: string | null = null;
      let bestAmt = 0;
      for (const entry of voucher.VoucherEntry) {
        const amt = side === "debit" ? Number(entry.debit || 0) : Number(entry.credit || 0);
        if (amt <= 0 || !entry.accountId || !entry.Account) continue;
        const subgroupCode = String(entry.Account.Subgroup?.code || "");
        const isCashBank =
          subgroupCode.startsWith("102") ||
          subgroupCode.startsWith("103") ||
          subgroupCode.startsWith("108") ||
          /cash|bank/i.test(String(entry.Account.Subgroup?.name || "")) ||
          /cash|bank/i.test(String(entry.Account.name || ""));
        if (!isCashBank) continue;
        if (amt > bestAmt) {
          bestAmt = amt;
          bestId = entry.accountId;
        }
      }
      return bestId;
    };

    const cashBankAccountIds = Array.from(
      new Set(
        vouchers
          .filter((v) => v.type === "payment" || v.type === "receipt")
          .map((v) => resolveCashBankIdFromEntries(v))
          .filter((id): id is string => Boolean(id)),
      ),
    );
    const cashBankAccounts = cashBankAccountIds.length
      ? await prisma.account.findMany({
          where: { id: { in: cashBankAccountIds } },
          select: {
            id: true,
            code: true,
            name: true,
            Subgroup: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        })
      : [];
    const accountModeById = new Map<string, 'cash' | 'online'>();
    for (const account of cashBankAccounts) {
      accountModeById.set(account.id, resolveCashBankModeFromAccount(account));
    }

    // Filter out vouchers linked to soft-deleted sales invoices
    let filteredVouchers = vouchers.filter((voucher) => {
      // This is a simple filter since we don't have entries loaded
      // In a real implementation, you'd need to check voucher entries for customer links
      return true; // For now, return all vouchers
    });

    const requestedMode = String(req.query.mode ?? '').trim().toLowerCase();
    if (
      (requestedMode === 'cash' || requestedMode === 'online') &&
      (normalizedType === 'payment' || normalizedType === 'receipt')
    ) {
      filteredVouchers = filteredVouchers.filter((voucher) => {
        if (voucher.type !== 'payment' && voucher.type !== 'receipt') return false;
        const cashBankId = resolveCashBankIdFromEntries(voucher);
        if (!cashBankId) return false;
        const mode = accountModeById.get(cashBankId) ?? 'cash';
        return mode === requestedMode;
      });
    }

    // Handle amount search if needed
    if (search && (search_by as string) === 'amount') {
      const searchAmount = parseFloat(search as string);
      if (!isNaN(searchAmount)) {
        filteredVouchers = filteredVouchers.filter(voucher => {
          // Check if any voucher entry has the searched amount
          return voucher.VoucherEntry.some(entry => 
            entry.debit === searchAmount || entry.credit === searchAmount
          );
        });
      }
    }

    // Transform vouchers to match frontend format
    const transformedVouchers = filteredVouchers.map((voucher) => {
      const cashBankId = resolveCashBankIdFromEntries(voucher);
      return {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      type: voucher.type,
      date: voucher.date.toISOString().split('T')[0],
      narration: voucher.narration || '',
      cashBankAccount: cashBankId || voucher.cashBankAccount || '',
      conversionRate: (voucher as any).conversionRate ?? undefined,
      mode:
        voucher.type === 'payment' || voucher.type === 'receipt'
          ? (cashBankId ? accountModeById.get(cashBankId) ?? 'cash' : undefined)
          : undefined,
      chequeNumber: voucher.chequeNumber || undefined,
      chequeDate: voucher.chequeDate ? voucher.chequeDate.toISOString().split('T')[0] : undefined,
      checkClearDate: voucher.checkClearDate ? voucher.checkClearDate.toISOString().split('T')[0] : undefined,
      isCleared: voucher.isCleared,
      entries: voucher.VoucherEntry.map(entry => ({
        id: entry.id,
        account: entry.accountId || entry.accountName,
        description: entry.description || '',
        debit: entry.debit,
        credit: entry.credit,
        Account: entry.Account
      })),
      totalDebit: voucher.totalDebit,
      totalCredit: voucher.totalCredit,
      status: voucher.status,
      storeId: (voucher as any).storeId,
      adjustmentId: (voucher as any).adjustmentId,
      isSystemGenerated: (voucher as any).isSystemGenerated,
      createdAt: voucher.createdAt.toISOString(),
    };
    });

    res.json({
      data: transformedVouchers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredVouchers.length,
        totalPages: Math.ceil(filteredVouchers.length / limitNum) || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Next voucher number for manual entry (payment / receipt / journal / contra)
router.get("/next-number", async (req: Request, res: Response) => {
  try {
    const type = String(req.query.type ?? "").trim().toLowerCase();
    const receiptKind = String(req.query.receipt_kind ?? "")
      .trim()
      .toLowerCase();

    if (type === "receipt" && receiptKind) {
      if (!RECEIPT_KIND_PREFIX[receiptKind]) {
        return res.status(400).json({ error: "Invalid receipt voucher kind" });
      }

      const voucherNumber = await allocateNextReceiptVoucherNumber(receiptKind);
      const prefix = RECEIPT_KIND_PREFIX[receiptKind];
      const sequence = parseVoucherSequence(voucherNumber, prefix) ?? 0;

      return res.json({
        data: {
          type,
          receiptKind,
          voucherNumber,
          sequence,
        },
      });
    }

    if (!VOUCHER_TYPE_PREFIX[type]) {
      return res.status(400).json({ error: "Invalid voucher type" });
    }

    const voucherNumber = await allocateNextVoucherNumber(type);
    const prefix = VOUCHER_TYPE_PREFIX[type];
    const sequence = parseVoucherSequence(voucherNumber, prefix) ?? 0;

    res.json({
      data: {
        type,
        voucherNumber,
        sequence,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single voucher by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              select: {
                id: true,
                code: true,
                name: true
              }
            }
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    res.json({
      data: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        type: voucher.type,
        date: voucher.date.toISOString().split('T')[0],
        narration: voucher.narration || '',
        cashBankAccount: voucher.cashBankAccount || '',
        conversionRate: (voucher as any).conversionRate ?? undefined,
        chequeNumber: voucher.chequeNumber || undefined,
        chequeDate: voucher.chequeDate ? voucher.chequeDate.toISOString().split('T')[0] : undefined,
        checkClearDate: voucher.checkClearDate ? voucher.checkClearDate.toISOString().split('T')[0] : undefined,
        isCleared: voucher.isCleared,
        entries: voucher.VoucherEntry.map((entry) => ({
          id: entry.id,
          account: entry.accountId || entry.accountName,
          description: entry.description || '',
          debit: entry.debit,
          credit: entry.credit,
          Account: entry.Account,
          adjustmentId: (entry as any).adjustmentId,
        })),
        totalDebit: voucher.totalDebit,
        totalCredit: voucher.totalCredit,
        status: voucher.status,
        storeId: (voucher as any).storeId,
        adjustmentId: (voucher as any).adjustmentId,
        isSystemGenerated: (voucher as any).isSystemGenerated,
        createdAt: voucher.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new voucher
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      voucherNumber,
      type,
      date,
      narration,
      cashBankAccount,
      conversionRate,
      chequeNumber,
      chequeDate,
      checkClearDate,
      isCleared,
      entries,
      totalDebit,
      totalCredit,
      status = 'draft',
      createdBy,
      storeId,
    } = req.body;

    if (!voucherNumber || !type || !date) {
      return res.status(400).json({ error: 'Voucher number, type, and date are required' });
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'At least one entry is required' });
    }

    // Validate debit equals credit (coerce so "" / null don't break totals)
    const calculatedDebit = entries.reduce(
      (sum: number, e: any) => sum + (Number(e.debit) || 0),
      0,
    );
    const calculatedCredit = entries.reduce(
      (sum: number, e: any) => sum + (Number(e.credit) || 0),
      0,
    );

    if (Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
      return res.status(400).json({
        error: 'Total debit must equal total credit',
        details: { debit: calculatedDebit, credit: calculatedCredit },
      });
    }

    const voucher = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber,
        type,
        date: new Date(date),
        narration: narration || null,
        cashBankAccount: cashBankAccount || null,
        conversionRate:
          conversionRate !== undefined &&
          conversionRate !== null &&
          conversionRate !== "" &&
          Number.isFinite(Number(conversionRate)) &&
          Number(conversionRate) > 0
            ? Number(conversionRate)
            : null,
        chequeNumber: chequeNumber || null,
        chequeDate: chequeDate ? new Date(chequeDate) : null,
        checkClearDate: checkClearDate ? new Date(checkClearDate) : null,
        isCleared: (isCleared !== undefined && isCleared !== null && isCleared !== "") 
          ? parseInt(isCleared) 
          : (String(chequeNumber || "").trim() || String(chequeDate || "").trim()) ? 0 : null,
        totalDebit: calculatedDebit,
        totalCredit: calculatedCredit,
        status,
        createdBy: createdBy || null,
        storeId: storeId || null,
        updatedAt: new Date(),
        VoucherEntry: {
          create: entries.map((entry: any, index: number) => ({
            id: crypto.randomUUID(),
            accountId: entry.accountId || null,
            accountName: entry.account || entry.accountName || 'Account',
            description: entry.description || null,
            debit: Number(entry.debit) || 0,
            credit: Number(entry.credit) || 0,
            sortOrder: entry.sortOrder !== undefined ? entry.sortOrder : index,
          })),
        },
      } as any,
      include: {
        VoucherEntry: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    // Update account balances if the voucher is created as 'posted' and is NOT uncleared
    if (voucher.status === "posted" && (voucher.isCleared === null || (voucher.isCleared !== undefined && voucher.isCleared !== 0))) {
      // Re-fetch with full account context for balance updates
      const fullVoucher = await prisma.voucher.findUnique({
        where: { id: voucher.id },
        include: {
          VoucherEntry: {
            include: {
              Account: {
                include: {
                  Subgroup: {
                    include: { MainGroup: true }
                  }
                }
              }
            }
          }
        }
      });

      if (fullVoucher) {
        for (const entry of fullVoucher.VoucherEntry) {
          if (!entry.accountId || !entry.Account) continue;
          
          const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
          let balanceChange = (["asset", "expense", "cost"].includes(accountType))
            ? (entry.debit || 0) - (entry.credit || 0)
            : (entry.credit || 0) - (entry.debit || 0);

          if (balanceChange !== 0) {
            await prisma.account.update({
              where: { id: entry.accountId },
              data: { currentBalance: { increment: balanceChange } }
            });
          }
        }
      }
    }

    let mode: 'cash' | 'online' | undefined;
    if (
      (voucher.type === 'payment' || voucher.type === 'receipt') &&
      voucher.cashBankAccount
    ) {
      const cashBankAccount = await prisma.account.findUnique({
        where: { id: voucher.cashBankAccount },
        select: {
          name: true,
          Subgroup: { select: { code: true, name: true } },
        },
      });
      if (cashBankAccount) {
        mode = resolveCashBankModeFromAccount(cashBankAccount);
      }
    }

    const mappedEntries = (voucher as any).VoucherEntry.map((entry: any) => ({
      id: entry.id,
      account: entry.accountId || entry.accountName,
      accountName: entry.accountName,
      description: entry.description || '',
      debit: entry.debit,
      credit: entry.credit,
    }));

    res.status(201).json({
      data: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        type: voucher.type,
        date: voucher.date.toISOString().split('T')[0],
        narration: voucher.narration || '',
        cashBankAccount: voucher.cashBankAccount || '',
        conversionRate: (voucher as any).conversionRate ?? undefined,
        mode,
        entries: mappedEntries,
        VoucherEntry: mappedEntries,
        totalDebit: voucher.totalDebit,
        totalCredit: voucher.totalCredit,
        status: voucher.status,
        storeId: (voucher as any).storeId,
        createdAt: voucher.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Voucher number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update a voucher
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      type,
      date,
      narration,
      cashBankAccount,
      conversionRate,
      chequeNumber,
      chequeDate,
      checkClearDate,
      isCleared,
      entries,
      status,
      approvedBy,
      storeId,
    } = req.body;

    // Check if voucher exists
    const existingVoucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!existingVoucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    // Check if status is changing to "posted" and update account balances
    if (existingVoucher.status !== 'posted' && status === 'posted') {
      console.log(`Posting voucher ${existingVoucher.voucherNumber}, updating account balances...`);
      
      for (const entry of existingVoucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          console.log(`Skipping entry ${entry.id} - no account linked`);
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceChange = 0;

        // Calculate balance change based on account type
        // Assets/Expenses: Debit increases balance, Credit decreases balance
        // Liabilities/Equity/Revenue: Credit increases balance, Debit decreases balance
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceChange = entry.debit - entry.credit;
        } else {
          balanceChange = entry.credit - entry.debit;
        }

        // Update account balance
        if (balanceChange !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                increment: balanceChange,
              },
              updatedAt: new Date(),
            },
          });
          
          console.log(`Updated account ${entry.Account.code} (${entry.Account.name}): ${balanceChange > 0 ? '+' : ''}Rs. ${balanceChange}`);
        }
      }
    }

    // If status is changing from "posted" to "draft", reverse the balances
    if (existingVoucher.status === 'posted' && status === 'draft') {
      console.log(`Unposting voucher ${existingVoucher.voucherNumber}, reversing account balances...`);
      
      for (const entry of existingVoucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceReversal = 0;

        // Calculate reversal (opposite of posting)
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceReversal = entry.credit - entry.debit;
        } else {
          balanceReversal = entry.debit - entry.credit;
        }

        // Reverse the balance change
        if (balanceReversal !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                increment: balanceReversal,
              },
              updatedAt: new Date(),
            },
          });
          
          console.log(`Reversed account ${entry.Account.code} (${entry.Account.name}): ${balanceReversal > 0 ? '+' : ''}Rs. ${balanceReversal}`);
        }
      }
    }

    if ((existingVoucher as any).isSystemGenerated || (existingVoucher as any).adjustmentId) {
      return res.status(403).json({ error: 'Voucher status cannot be changed because it is system generated. Edit the source transaction (e.g. Adjustment) instead.' });
    }

    let updatedVoucher;
    // If entries are provided, validate and update
    if (entries && Array.isArray(entries)) {
      const calculatedDebit = entries.reduce(
        (sum: number, e: any) => sum + (Number(e.debit) || 0),
        0,
      );
      const calculatedCredit = entries.reduce(
        (sum: number, e: any) => sum + (Number(e.credit) || 0),
        0,
      );

      if (Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
        return res.status(400).json({
          error: "Total debit must equal total credit",
          details: { debit: calculatedDebit, credit: calculatedCredit },
        });
      }

      // Delete existing entries and create new ones
      await prisma.voucherEntry.deleteMany({
        where: { voucherId: id },
      });

      updatedVoucher = await prisma.voucher.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(date && { date: new Date(date) }),
          ...(narration !== undefined && { narration: narration || null }),
          ...(cashBankAccount !== undefined && { cashBankAccount: cashBankAccount || null }),
          ...(conversionRate !== undefined && {
            conversionRate:
              Number.isFinite(Number(conversionRate)) && Number(conversionRate) > 0
                ? Number(conversionRate)
                : null,
          }),
          ...(chequeNumber !== undefined && { chequeNumber: chequeNumber || null }),
          ...(chequeDate !== undefined && { chequeDate: chequeDate ? new Date(chequeDate) : null }),
          ...(checkClearDate !== undefined && { checkClearDate: checkClearDate ? new Date(checkClearDate) : null }),
          ...(isCleared !== undefined && isCleared !== null && isCleared !== "" 
            ? { isCleared: parseInt(isCleared) } 
            : (chequeNumber !== undefined || chequeDate !== undefined) && (String(chequeNumber || "").trim() || String(chequeDate || "").trim()) 
              ? { isCleared: 0 } 
              : {}
          ),
          totalDebit: calculatedDebit,
          totalCredit: calculatedCredit,
          ...(status && { status }),
          ...(status === "posted" && approvedBy && {
            approvedBy,
            approvedAt: new Date(),
          }),
          ...(status === "draft" && {
            approvedBy: null,
            approvedAt: null,
          }),
          ...(storeId !== undefined && { storeId: storeId || null }),
        },
        include: { VoucherEntry: true }
      });

      // Create new voucher entries
      await prisma.voucherEntry.createMany({
        data: entries.map((entry: any, index: number) => ({
          id: `ve_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          voucherId: id,
          accountId: entry.accountId || null,
          accountName: entry.account || entry.accountName || "Account",
          description: entry.description || null,
          debit: Number(entry.debit) || 0,
          credit: Number(entry.credit) || 0,
          sortOrder: entry.sortOrder !== undefined ? entry.sortOrder : index,
        })),
      });
    } else {
      // Update voucher fields only
      updatedVoucher = await prisma.voucher.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(date && { date: new Date(date) }),
          ...(narration !== undefined && { narration: narration || null }),
          ...(cashBankAccount !== undefined && { cashBankAccount: cashBankAccount || null }),
          ...(conversionRate !== undefined && {
            conversionRate:
              Number.isFinite(Number(conversionRate)) && Number(conversionRate) > 0
                ? Number(conversionRate)
                : null,
          }),
          ...(chequeNumber !== undefined && { chequeNumber: chequeNumber || null }),
          ...(chequeDate !== undefined && { chequeDate: chequeDate ? new Date(chequeDate) : null }),
          ...(checkClearDate !== undefined && { checkClearDate: checkClearDate ? new Date(checkClearDate) : null }),
          ...(isCleared !== undefined && isCleared !== null && isCleared !== "" 
            ? { isCleared: parseInt(isCleared) } 
            : (chequeNumber !== undefined || chequeDate !== undefined) && (String(chequeNumber || "").trim() || String(chequeDate || "").trim()) 
              ? { isCleared: 0 } 
              : {}
          ),
          ...(status && { status }),
          ...(status === "posted" && approvedBy && {
            approvedBy,
            approvedAt: new Date(),
          }),
          ...(status === "draft" && {
            approvedBy: null,
            approvedAt: null,
          }),
          ...(storeId !== undefined && { storeId: storeId || null }),
        },
        include: { VoucherEntry: true }
      });
    }

    // After update, sync balances if clearance status changed for a POSTED voucher
    if (updatedVoucher && updatedVoucher.status === "posted") {
      const oldIsCleared = (existingVoucher as any).isCleared;
      const newIsCleared = updatedVoucher.isCleared;

      const becameCleared = (oldIsCleared === 0 && (newIsCleared === null || newIsCleared !== 0));
      const becameUncleared = ((oldIsCleared === null || oldIsCleared !== 0) && newIsCleared === 0);

      if (becameCleared || becameUncleared) {
        const fullVoucher = await prisma.voucher.findUnique({
          where: { id },
          include: {
            VoucherEntry: {
              include: {
                Account: {
                  include: {
                    Subgroup: {
                      include: { MainGroup: true }
                    }
                  }
                }
              }
            }
          }
        });

        if (fullVoucher) {
          for (const entry of fullVoucher.VoucherEntry) {
            if (!entry.accountId || !entry.Account) continue;
            const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
            let balanceChange = (["asset", "expense", "cost"].includes(accountType))
              ? (entry.debit || 0) - (entry.credit || 0)
              : (entry.credit || 0) - (entry.debit || 0);

            if (becameUncleared) balanceChange = -balanceChange;

            if (balanceChange !== 0) {
              await prisma.account.update({
                where: { id: entry.accountId },
                data: { currentBalance: { increment: balanceChange } }
              });
            }
          }
        }
      }
    }

    res.json({
      data: {
        id: updatedVoucher!.id,
        voucherNumber: updatedVoucher!.voucherNumber,
        type: updatedVoucher!.type,
        date: updatedVoucher!.date.toISOString().split("T")[0],
        narration: updatedVoucher!.narration || "",
        cashBankAccount: updatedVoucher!.cashBankAccount || "",
        conversionRate: (updatedVoucher as any).conversionRate ?? undefined,
        VoucherEntry: updatedVoucher!.VoucherEntry.map((entry) => ({
          id: entry.id,
          account: entry.accountName,
          description: entry.description || "",
          debit: entry.debit,
          credit: entry.credit,
        })),
        totalDebit: updatedVoucher!.totalDebit,
        totalCredit: updatedVoucher!.totalCredit,
        status: updatedVoucher!.status,
        storeId: (updatedVoucher as any).storeId,
        createdAt: updatedVoucher!.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a voucher and reverse account balances
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if ((voucher as any).isSystemGenerated || (voucher as any).adjustmentId) {
      return res.status(403).json({ error: 'System generated vouchers cannot be deleted. Delete the source transaction (e.g. Adjustment) instead.' });
    }

    // If voucher is posted, reverse account balances before deletion
    // ONLY if it was cleared (isCleared is null or not 0)
    if (voucher.status === 'posted' && voucher.VoucherEntry.length > 0 && (voucher.isCleared === null || voucher.isCleared !== 0)) {

      for (const entry of voucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceReversal: number;

        // Calculate reversal based on account type
        // Assets/Expenses: Original change = debit - credit, Reverse = credit - debit
        // Liabilities/Equity/Revenue: Original change = credit - debit, Reverse = debit - credit
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceReversal = entry.credit - entry.debit;
        } else {
          balanceReversal = entry.debit - entry.credit;
        }

        // Reverse the balance change
        if (balanceReversal !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                decrement: balanceReversal, // Decrement the reversal amount (which reverses the original change)
              },
            },
          });

        }
      }

    }

    // Delete voucher entries (will cascade, but explicit for clarity)
    await prisma.voucherEntry.deleteMany({
      where: { voucherId: id },
    });

    // Delete the voucher
    await prisma.voucher.delete({
      where: { id },
    });

    res.json({
      message: 'Voucher deleted successfully',
      reversedAccounts: voucher.status === 'posted' ? voucher.VoucherEntry.length : 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

