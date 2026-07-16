import express, { Request, Response } from "express";
import prisma from "../config/database";

const router = express.Router();

// ========== Helper Functions for Accounting Calculations ==========

/**
 * Determines if an account type has a normal DEBIT balance
 * Assets and Expenses have normal DEBIT balances
 */
function isDebitNormal(accountType: string): boolean {
  const type = accountType.toLowerCase();
  return type === "asset" || type === "expense" || type === "cost";
}

/**
 * Calculates account balance based on account type and transactions
 * For DEBIT normal Account: balance = openingBalance + debits - credits
 * For CREDIT normal Account: balance = openingBalance + credits - debits
 */
function calculateAccountBalance(
  openingBalance: number,
  totalDebit: number,
  totalCredit: number,
  accountType: string,
): number {
  if (isDebitNormal(accountType)) {
    // Assets and Expenses: increase with debit, decrease with credit
    return openingBalance + totalDebit - totalCredit;
  } else {
    // Liabilities, Equity, Revenue: increase with credit, decrease with debit
    return openingBalance + totalCredit - totalDebit;
  }
}

/**
 * Calculates the balance change for posting journal entries
 * For DEBIT normal: balanceChange = debit - credit
 * For CREDIT normal: balanceChange = credit - debit
 */
function calculateBalanceChange(
  debit: number,
  credit: number,
  accountType: string,
): number {
  if (isDebitNormal(accountType)) {
    return debit - credit;
  } else {
    return credit - debit;
  }
}

/**
 * Gets trial balance amounts (debit and credit columns)
 * For DEBIT normal Account: positive balance = debit, negative = credit
 * For CREDIT normal Account: positive balance = credit, negative = debit
 */
function getTrialBalanceAmounts(
  balance: number,
  accountType: string,
): { debit: number; credit: number } {
  if (isDebitNormal(accountType)) {
    return {
      debit: balance > 0 ? balance : 0,
      credit: balance < 0 ? Math.abs(balance) : 0,
    };
  } else {
    return {
      debit: balance < 0 ? Math.abs(balance) : 0,
      credit: balance > 0 ? balance : 0,
    };
  }
}

// ========== Main Groups ==========
router.get("/main-groups", async (req: Request, res: Response) => {
  try {
    const groups = await prisma.mainGroup.findMany({
      orderBy: { displayOrder: "asc" },
    });
    res.json({ data: groups });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

router.post("/main-groups", async (req: Request, res: Response) => {
  try {
    const { code, name, type, displayOrder } = req.body;
    const group = await prisma.mainGroup.create({
      data: { code, name, type, displayOrder } as any,
    });
    res.json({ data: group });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/main-groups/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if this is a fixed main group (codes 1-9 are fixed)
    const existing = await prisma.mainGroup.findUnique({ where: { id } });
    if (
      existing &&
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(existing.code)
    ) {
      return res
        .status(403)
        .json({ error: "This main group is fixed and cannot be modified" });
    }

    const { code, name, type, displayOrder } = req.body;
    const group = await prisma.mainGroup.update({
      where: { id },
      data: { code, name, type, displayOrder },
    });
    res.json({ data: group });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/main-groups/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if this is a fixed main group (codes 1-9 are fixed)
    const existing = await prisma.mainGroup.findUnique({ where: { id } });
    if (
      existing &&
      ["1", "2", "3", "4", "5", "6", "7", "8", "9"].includes(existing.code)
    ) {
      return res
        .status(403)
        .json({ error: "This main group is fixed and cannot be deleted" });
    }

    await prisma.mainGroup.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Restore default main groups (upsert codes 1–9). Safe to call when empty or to recover deleted.
router.post("/seed-main-groups", async (req: Request, res: Response) => {
  try {
    const MainGroupsData = [
      { code: "1", name: "Current Assets", type: "Asset", displayOrder: 1 },
      { code: "2", name: "Long Term Assets", type: "Asset", displayOrder: 2 },
      {
        code: "3",
        name: "Current Liabilities",
        type: "Liability",
        displayOrder: 3,
      },
      {
        code: "4",
        name: "Long Term Liabilities",
        type: "Liability",
        displayOrder: 4,
      },
      { code: "5", name: "Capital", type: "Equity", displayOrder: 5 },
      { code: "6", name: "Drawings", type: "Equity", displayOrder: 6 },
      { code: "7", name: "Revenues", type: "Revenue", displayOrder: 7 },
      { code: "8", name: "Expenses", type: "Expense", displayOrder: 8 },
      { code: "9", name: "Cost", type: "Cost", displayOrder: 9 },
    ];

    for (const mg of MainGroupsData) {
      await prisma.mainGroup.upsert({
        where: { code: mg.code },
        update: { name: mg.name, type: mg.type, displayOrder: mg.displayOrder },
        create: mg as any,
      });
    }

    const groups = await prisma.mainGroup.findMany({
      orderBy: { displayOrder: "asc" },
    });
    res.json({ success: true, count: groups.length, data: groups });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Subgroup seed data (needed for Inventory 104, Capital 501, Expense 801, etc.)
const SUBGROUPS_SEED = [
  { MainGroupCode: "1", code: "101", name: "Cash and Cash Equivalents" },
  { MainGroupCode: "1", code: "102", name: "Bank Accounts" },
  { MainGroupCode: "1", code: "103", name: "Accounts Receivable" },
  { MainGroupCode: "1", code: "104", name: "Inventory" },
  { MainGroupCode: "1", code: "105", name: "Prepaid Expenses" },
  { MainGroupCode: "2", code: "206", name: "SHOP INVESTMENT" },
  { MainGroupCode: "5", code: "501", name: "Owner's Capital" },
  { MainGroupCode: "8", code: "801", name: "Operating Expenses" },
];

router.post("/seed-subgroups", async (req: Request, res: Response) => {
  try {
    let created = 0;
    for (const sg of SUBGROUPS_SEED) {
      const mg = await prisma.mainGroup.findFirst({
        where: { code: sg.MainGroupCode },
      });
      if (!mg) continue;
      await prisma.subgroup.upsert({
        where: { code: sg.code },
        update: { name: sg.name, mainGroupId: mg.id },
        create: { mainGroupId: mg.id, code: sg.code, name: sg.name } as any,
      });
      created++;
    }
    const Subgroup = await prisma.subgroup.findMany({
      where: { code: { in: SUBGROUPS_SEED.map((s) => s.code) } },
      include: { MainGroup: true },
    });
    res.json({ success: true, count: Subgroup.length, data: Subgroup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create required Account for inventory adjustments: 104005 (Inventory), 501003 (Owner Capital), 801014 (Dispose Inventory)
router.post("/seed-required-accounts", async (req: Request, res: Response) => {
  try {
    const created: string[] = [];
    for (const { SubgroupCode, code, name, description } of [
      {
        SubgroupCode: "104",
        code: "104005",
        name: "Inventory - General",
        description: "General inventory account for adjustments",
      },
      {
        SubgroupCode: "501",
        code: "501003",
        name: "OWNER CAPITAL",
        description: "Owner Capital account for inventory adjustments",
      },
      {
        SubgroupCode: "801",
        code: "801014",
        name: "Dispose Inventory",
        description: "Dispose Inventory expense for adjustments",
      },
      {
        SubgroupCode: "206",
        code: "206001",
        name: "SHOP INVESTMENT",
        description: "Long term asset — shop investment",
      },
    ]) {
      const sg = await prisma.subgroup.findFirst({
        where: { code: SubgroupCode },
      });
      if (!sg) continue;
      const existing = await prisma.account.findUnique({ where: { code } });
      if (existing) continue;
      await prisma.account.create({
        data: {
          subgroupId: sg.id,
          code,
          name,
          description: description || name,
          openingBalance: 0,
          currentBalance: 0,
          status: "Active",
        } as any,
      });
      created.push(code);
    }
    res.json({ success: true, created, count: created.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Subgroups ==========
router.get("/subgroups", async (req: Request, res: Response) => {
  try {
    const { mainGroupId, isActive } = req.query;
    const where: any = {};
    if (mainGroupId) where.mainGroupId = mainGroupId;
    if (isActive !== undefined) where.isActive = isActive === "true";

    const Subgroup = await prisma.subgroup.findMany({
      where,
      include: { MainGroup: true },
      orderBy: { code: "asc" },
    });
    res.json({ data: Subgroup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/subgroups", async (req: Request, res: Response) => {
  try {
    const { mainGroupId, code, name, isActive, canDelete } = req.body;
    const Subgroup = await prisma.subgroup.create({
      data: {
        mainGroupId,
        code,
        name,
        isActive: isActive !== undefined ? isActive : true,
        canDelete: canDelete !== undefined ? canDelete : true,
      } as any,
      include: { MainGroup: true },
    });
    res.json({ data: Subgroup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/subgroups/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mainGroupId, name, isActive } = req.body;

    // Restriction removed as per user request
    // const existingSubgroup = await prisma.subgroup.findUnique({ where: { id } });
    // if (existingSubgroup && ['101', '102', '103', '104', '301', '302', '304', '501', '701', '801', '901'].includes(existingSubgroup.code)) {
    //   return res.status(403).json({ error: 'This Subgroup is fixed and cannot be edited' });
    // }

    const Subgroup = await prisma.subgroup.update({
      where: { id },
      data: { mainGroupId, name, isActive },
      include: { MainGroup: true },
    });
    res.json({ data: Subgroup });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/subgroups/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent deleting fixed Subgroup (codes 101, 102, 103, 104, 301, 302, 304, 501, 701, 801, 901)
    const existingSubgroup = await prisma.subgroup.findUnique({
      where: { id },
    });
    if (
      existingSubgroup &&
      [
        "101",
        "102",
        "103",
        "104",
        "301",
        "302",
        "304",
        "501",
        "701",
        "801",
        "901",
      ].includes(existingSubgroup.code)
    ) {
      return res
        .status(403)
        .json({ error: "This Subgroup is fixed and cannot be deleted" });
    }

    await prisma.subgroup.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Accounts ==========
router.get("/accounts", async (req: Request, res: Response) => {
  try {
    const { subgroupId, status, mainGroupId } = req.query;
    const where: any = {};
    if (subgroupId) {
      where.subgroupId = subgroupId;
    } else if (mainGroupId) {
      where.Subgroup = { mainGroupId };
    }
    if (status) where.status = status;
    const Account = await prisma.account.findMany({
      where,
      include: {
        Subgroup: {
          include: {
            MainGroup: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    res.json({ data: Account });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/accounts", async (req: Request, res: Response) => {
  try {
    const {
      subgroupId,
      code,
      name,
      description,
      accountType,
      openingBalance,
      status,
    } = req.body;

    // Validate account code is provided
    if (!code || String(code).trim() === "") {
      return res.status(400).json({ error: "Account code is required" });
    }

    // Fetch Subgroup to validate code matches
    const Subgroup = await prisma.subgroup.findUnique({
      where: { id: subgroupId },
    });

    if (!Subgroup) {
      return res.status(400).json({ error: "Subgroup not found" });
    }

    // Validate that account code starts with Subgroup code
    const SubgroupCode = String(Subgroup.code || "").trim();
    const accountCodeStr = String(code).trim();

    if (!SubgroupCode) {
      return res.status(400).json({
        error:
          "Subgroup does not have a code. Please add a code to the Subgroup first.",
      });
    }

    if (!accountCodeStr.startsWith(SubgroupCode)) {
      return res.status(400).json({
        error: `Account code must start with Subgroup code "${SubgroupCode}". Provided code "${accountCodeStr}" does not match.`,
      });
    }

    const account = await prisma.account.create({
      data: {
        subgroupId,
        code,
        name,
        description,
        accountType: accountType || "regular",
        openingBalance: openingBalance || 0,
        currentBalance: openingBalance || 0,
        status: status || "Active",
      } as any,
      include: {
        Subgroup: {
          include: { MainGroup: true },
        },
      },
    });
    res.json({ data: account });
  } catch (error: any) {
    if (error.code === "P2002") {
      return res.status(400).json({
        error: "Account code already exists. Please use a unique code.",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put("/accounts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { subgroupId, name, description, status } = req.body;
    const account = await prisma.account.update({
      where: { id },
      data: { subgroupId, name, description, status },
      include: {
        Subgroup: {
          include: { MainGroup: true },
        },
      },
    });
    res.json({ data: account });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/accounts/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.account.delete({ where: { id } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Journal Entries (now Vouchers with type 'journal') ==========
router.get("/journal-entries", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const where: any = { type: "journal" };
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { voucherNumber: { contains: search as string, mode: "insensitive" } },
        { narration: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const entries = await prisma.voucher.findMany({
      where,
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: { MainGroup: true },
                },
              },
            },
          },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: { date: "desc" },
    });
    res.json({ data: entries });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/journal-entries", async (req: Request, res: Response) => {
  try {
    const { entryDate, reference, description, lines, createdBy } = req.body;

    const totalDebit = lines.reduce(
      (sum: number, line: any) => sum + (line.debit || 0),
      0,
    );
    const totalCredit = lines.reduce(
      (sum: number, line: any) => sum + (line.credit || 0),
      0,
    );

    if (totalDebit !== totalCredit) {
      return res
        .status(400)
        .json({ error: "Total debits must equal total credits" });
    }

    // Generate voucher number
    const count = await prisma.voucher.count({ where: { type: "journal" } });
    const voucherNumber = `JV-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    // Fetch account names for the voucher entries
    const linesWithNames = await Promise.all(
      lines.map(async (line: any) => {
        const account = await prisma.account.findUnique({
          where: { id: line.accountId },
        });
        return {
          ...line,
          accountName: account ? account.name : "Unknown Account",
        };
      }),
    );

    const entry = await prisma.voucher.create({
      data: {
        voucherNumber,
        type: "journal",
        date: new Date(entryDate),
        chequeNumber: reference,
        narration: description,
        totalDebit,
        totalCredit,
        createdBy,
        VoucherEntry: {
          create: linesWithNames.map((line: any, index: number) => ({
            accountId: line.accountId,
            accountName: line.accountName,
            description: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
            sortOrder: index,
          })),
        },
      } as any,
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: { MainGroup: true },
                },
              },
            },
          },
        },
      },
    });

    res.json({ data: entry });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/journal-entries/:id/post",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { postedBy } = req.body;

      const entry = await prisma.voucher.findUnique({
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

      if (!entry) {
        return res.status(404).json({ error: "Voucher not found" });
      }

      if (entry.status === "posted") {
        return res.status(400).json({ error: "Voucher already posted" });
      }

      // Update voucher status
      const updatedEntry = await prisma.voucher.update({
        where: { id },
        data: {
          status: "posted",
          approvedBy: postedBy,
          approvedAt: new Date(),
        },
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

        // Update account balances using proper accounting logic
        // ONLY if the voucher is cleared (isCleared is null or not 0)
        if (entry.isCleared === null || entry.isCleared !== 0) {
          for (const line of entry.VoucherEntry) {
            if (!line.Account) continue;
            const accountType = line.Account.Subgroup.MainGroup.type;
            const balanceChange = calculateBalanceChange(
              line.debit,
              line.credit,
              accountType,
            );

            if (line.accountId) {
              await prisma.account.update({
                where: { id: line.accountId },
                data: {
                  currentBalance: {
                    increment: balanceChange,
                  },
                },
              });
            }
          }
        }

      res.json({ data: updatedEntry });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ========== General Journal ==========
router.get("/general-journal", async (req: Request, res: Response) => {
  try {
    const {
      search_by,
      search,
      from_date,
      to_date,
      page = "1",
      limit = "10",
    } = req.query;

    // Build where clause for Vouchers
    const VoucherWhere: any = {
      status: "posted",
      OR: [
        { isCleared: null },
        { isCleared: { not: 0 } }
      ],
    };

    // Date range filter
    if (from_date || to_date) {
      VoucherWhere.date = {};
      if (from_date) {
        VoucherWhere.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        VoucherWhere.date.lte = new Date(to_date as string);
      }
    }

    // Search filter
    let searchFilter: any = null;
    if (search) {
      const searchStr = (search as string).toLowerCase();
      searchFilter = { searchStr, search_by };
    }

    // Get all Vouchers with entries
    const VouchersList = await prisma.voucher.findMany({
      where: VoucherWhere,
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
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ date: "desc" }, { voucherNumber: "desc" }],
    });

    // Flatten entries into individual lines for general journal view
    let JournalLines: any[] = [];
    let tId = 1;

    // Process Voucher records
    VouchersList.forEach((voucher) => {
      voucher.VoucherEntry.forEach((entry) => {
        const accountName = entry.Account
          ? `${entry.Account.code}-${entry.Account.name}`
          : entry.accountName || "Unknown";
        const description = entry.description || voucher.narration || "";

        // Apply search filter if provided
        if (searchFilter) {
          const { searchStr, search_by } = searchFilter;
          if (search_by === "Voucher") {
            if (!voucher.voucherNumber.toLowerCase().includes(searchStr))
              return;
          } else if (search_by === "account") {
            if (!accountName.toLowerCase().includes(searchStr)) return;
          } else if (search_by === "description") {
            if (!description.toLowerCase().includes(searchStr)) return;
          } else {
            // General search
            if (
              !voucher.voucherNumber.toLowerCase().includes(searchStr) &&
              !description.toLowerCase().includes(searchStr) &&
              !accountName.toLowerCase().includes(searchStr)
            )
              return;
          }
        }

        JournalLines.push({
          id: `v-${voucher.id}-${entry.id}`,
          tId: tId++,
          VoucherNo: voucher.voucherNumber,
          date: voucher.date.toISOString().split("T")[0],
          type: voucher.type,
          account: accountName,
          description: description,
          debit: entry.debit,
          credit: entry.credit,
          VoucherId: voucher.id,
          entryId: entry.id,
          status: voucher.status,
        });
      });
    });

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const totalLines = JournalLines.length;
    const totalPages = Math.ceil(totalLines / limitNum);
    const paginatedLines = JournalLines.slice(
      (pageNum - 1) * limitNum,
      pageNum * limitNum,
    );

    res.json({
      data: paginatedLines,
      pagination: {
        total: totalLines,
        totalPages,
        currentPage: pageNum,
        limit: limitNum,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== General Ledger ==========
router.get("/general-ledger", async (req: Request, res: Response) => {
  try {
    const { accountCode, type, dateFrom, dateTo } = req.query;

    // Normalize type filter to handle both lowercase and capitalized values
    const typeFilter = type ? (type as string).toLowerCase() : null;
    const typeVariants = typeFilter
      ? [typeFilter, typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)]
      : [];

    const Account = await prisma.account.findMany({
      where: {
        ...(accountCode && {
          code: { contains: accountCode as string },
        }),
        ...(typeFilter && {
          Subgroup: {
            MainGroup: {
              type: { in: typeVariants }, // Match both lowercase and capitalized
            },
          },
        }),
      },
      include: {
        Subgroup: {
          include: { MainGroup: true },
        },
        VoucherEntry: {
          where: {
            Voucher: {
               status: "posted",
               OR: [
                 { isCleared: null },
                 { isCleared: { not: 0 } }
               ],
               ...(dateFrom && { date: { gte: new Date(dateFrom as string) } }),
               ...(dateTo && { date: { lte: new Date(dateTo as string) } }),
            },
          },
          include: {
            Voucher: true,
          },
          orderBy: [
            { Voucher: { date: "asc" } },
            { sortOrder: "asc" },
          ],
        },
      },
    });

    // Calculate running balances using proper accounting logic
    const ledgerAccounts = Account.map((account) => {
      const accountType = account.Subgroup?.MainGroup?.type || "";
      // Normalize account type to lowercase for frontend compatibility
      const normalizedType = accountType.toLowerCase();
      let runningBalance = account.openingBalance;

      // Combine transactions (now only using VoucherEntries)
      const allTransactions: any[] = [];

      // Add Voucher transactions (includes what used to be Journal Entries)
      (account.VoucherEntry || []).forEach((entry: any) => {
        allTransactions.push({
          id: `ve-${entry.id}`,
          date: entry.Voucher.date,
          dateStr: entry.Voucher.date.toISOString().split("T")[0],
          journalNo: entry.Voucher.voucherNumber,
          reference:
            entry.Voucher.chequeNumber || entry.Voucher.narration || "",
          description: entry.description || entry.Voucher.narration || "",
          debit: entry.debit,
          credit: entry.credit,
          sortOrder: entry.sortOrder ?? 0,
        });
      });

      allTransactions.sort((a, b) => {
        const timeDiff = a.date.getTime() - b.date.getTime();
        if (timeDiff !== 0) return timeDiff;
        const vA = parseInt(String(a.journalNo).match(/(\d+)/)?.[1] || "0", 10);
        const vB = parseInt(String(b.journalNo).match(/(\d+)/)?.[1] || "0", 10);
        if (vA !== vB) return vA - vB;
        return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      });

      // Calculate running balance
      const transactions = allTransactions.map((txn: any) => {
        const balanceChange = calculateBalanceChange(
          txn.debit,
          txn.credit,
          accountType,
        );
        runningBalance += balanceChange;

        return {
          id: txn.id,
          date: txn.dateStr,
          journalNo: txn.journalNo,
          reference: txn.reference,
          description: txn.description,
          debit: txn.debit,
          credit: txn.credit,
          balance: runningBalance,
        };
      });

      return {
        code: account.code,
        name: account.name,
        type: normalizedType, // Use normalized lowercase type for frontend filter compatibility
        openingBalance: account.openingBalance,
        currentBalance: runningBalance,
        transactions,
      };
    });

    res.json({ data: ledgerAccounts });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Daily Closing (Cash & Bank) ==========
const cashBankAccountWhere = {
  status: "Active" as const,
  AND: [
    {
      Subgroup: {
        MainGroup: { type: { in: ["Asset", "asset"] } },
      },
    },
    {
      OR: [
        { Subgroup: { name: { contains: "Cash", mode: "insensitive" as const } } },
        { Subgroup: { name: { contains: "Bank", mode: "insensitive" as const } } },
      ],
    },
    {
      NOT: {
        Subgroup: {
          name: { contains: "Receivable", mode: "insensitive" as const },
        },
      },
    },
  ],
};

router.get("/daily-closing/accounts", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: cashBankAccountWhere,
      select: {
        id: true,
        code: true,
        name: true,
        Subgroup: { select: { name: true, code: true } },
      },
      orderBy: [{ Subgroup: { code: "asc" } }, { code: "asc" }],
    });

    const options = accounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      label: `${account.code} - ${account.name}`,
      subgroupName: account.Subgroup?.name || "",
    }));

    res.json({ data: options });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/daily-closing", async (req: Request, res: Response) => {
  try {
    const dateStr = String(req.query.date || "").trim();
    const accountIdsParam = String(req.query.account_ids || "").trim();
    const singleAccountId = String(
      req.query.account_id || req.query.accountId || "",
    ).trim();

    const accountIds = accountIdsParam
      ? accountIdsParam
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean)
      : singleAccountId
        ? [singleAccountId]
        : Array.isArray(req.query.account_id)
          ? (req.query.account_id as string[]).map(String).filter(Boolean)
          : [];

    if (!dateStr) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const accounts = await prisma.account.findMany({
      where: {
        ...cashBankAccountWhere,
        ...(accountIds.length > 0 ? { id: { in: accountIds } } : {}),
      },
      include: {
        Subgroup: { include: { MainGroup: true } },
        VoucherEntry: {
          where: {
            Voucher: {
              status: "posted",
              OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
            },
          },
          include: { Voucher: true },
          orderBy: [{ Voucher: { date: "asc" } }, { sortOrder: "asc" }],
        },
      },
      orderBy: [{ Subgroup: { code: "asc" } }, { code: "asc" }],
    });

    if (accountIds.length > 0) {
      const foundIds = new Set(accounts.map((account) => account.id));
      const hasInvalid = accountIds.some((id) => !foundIds.has(id));
      if (hasInvalid || accounts.length === 0) {
        return res.status(404).json({
          error:
            "One or more selected accounts are not valid active cash or bank accounts.",
        });
      }
    }

    const classifyCashBank = (subgroupName: string): "cash" | "bank" => {
      const normalized = subgroupName.toLowerCase();
      if (normalized.includes("bank")) return "bank";
      return "cash";
    };

    const closingAccounts = accounts.map((account) => {
      const accountType = account.Subgroup?.MainGroup?.type || "Asset";
      let openingBalance = account.openingBalance;
      let receipts = 0;
      let payments = 0;
      const dayEntries: Array<{
        id: string;
        date: Date;
        voucherNumber: string;
        voucherType: string;
        description: string;
        debit: number;
        credit: number;
        sortOrder: number;
      }> = [];

      for (const entry of account.VoucherEntry || []) {
        const voucherDate = entry.Voucher.date;
        const balanceChange = calculateBalanceChange(
          entry.debit,
          entry.credit,
          accountType,
        );

        if (voucherDate < dayStart) {
          openingBalance += balanceChange;
        } else if (voucherDate >= dayStart && voucherDate <= dayEnd) {
          const debit = Number(entry.debit || 0);
          const credit = Number(entry.credit || 0);
          receipts += debit;
          payments += credit;
          dayEntries.push({
            id: entry.id,
            date: voucherDate,
            voucherNumber: entry.Voucher.voucherNumber,
            voucherType: entry.Voucher.type,
            description: entry.description || entry.Voucher.narration || "",
            debit,
            credit,
            sortOrder: entry.sortOrder ?? 0,
          });
        }
      }

      const closingBalance = openingBalance + receipts - payments;

      return {
        id: account.id,
        code: account.code,
        name: account.name,
        subgroupCode: account.Subgroup?.code || "",
        subgroupName: account.Subgroup?.name || "",
        accountType: classifyCashBank(account.Subgroup?.name || ""),
        openingBalance,
        receipts,
        payments,
        closingBalance,
        dayEntries,
      };
    });

    const sortedAccounts = [...closingAccounts].sort((a, b) => {
      if (a.accountType !== b.accountType) {
        return a.accountType === "cash" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const columns = sortedAccounts.map((account) => ({
      id: account.id,
      code: account.code,
      name: account.name,
      accountType: account.accountType,
    }));

    const openingBalances: Record<string, number> = {};
    const totalReceipts: Record<string, number> = {};
    const totalPayments: Record<string, number> = {};
    const closingBalances: Record<string, number> = {};

    for (const account of sortedAccounts) {
      openingBalances[account.id] = account.openingBalance;
      totalReceipts[account.id] = account.receipts;
      totalPayments[account.id] = account.payments;
      closingBalances[account.id] = account.closingBalance;
    }

    type MatrixRow = {
      voucherNumber: string;
      description: string;
      amounts: Record<string, number>;
      sortDate: number;
      sortOrder: number;
    };

    const receiptRows: MatrixRow[] = [];
    const paymentRows: MatrixRow[] = [];

    for (const account of sortedAccounts) {
      for (const entry of account.dayEntries) {
        if (entry.debit > 0) {
          receiptRows.push({
            voucherNumber: entry.voucherNumber,
            description: entry.description,
            amounts: { [account.id]: entry.debit },
            sortDate: entry.date.getTime(),
            sortOrder: entry.sortOrder,
          });
        }
        if (entry.credit > 0) {
          paymentRows.push({
            voucherNumber: entry.voucherNumber,
            description: entry.description,
            amounts: { [account.id]: entry.credit },
            sortDate: entry.date.getTime(),
            sortOrder: entry.sortOrder,
          });
        }
      }
    }

    const sortMatrixRows = (a: MatrixRow, b: MatrixRow) => {
      if (a.sortDate !== b.sortDate) return a.sortDate - b.sortDate;
      const vA = parseInt(String(a.voucherNumber).match(/(\d+)/)?.[1] || "0", 10);
      const vB = parseInt(String(b.voucherNumber).match(/(\d+)/)?.[1] || "0", 10);
      if (vA !== vB) return vA - vB;
      return a.sortOrder - b.sortOrder;
    };

    receiptRows.sort(sortMatrixRows);
    paymentRows.sort(sortMatrixRows);

    const receipts = receiptRows.map((row, index) => ({
      serialNo: index + 1,
      voucherNumber: row.voucherNumber,
      description: row.description,
      amounts: row.amounts,
    }));

    const payments = paymentRows.map((row, index) => ({
      serialNo: index + 1,
      voucherNumber: row.voucherNumber,
      description: row.description,
      amounts: row.amounts,
    }));

    const sumRecord = (record: Record<string, number>) =>
      Object.values(record).reduce((sum, value) => sum + Number(value || 0), 0);

    res.json({
      data: {
        date: dateStr,
        columns,
        openingBalances,
        receipts,
        payments,
        totalReceipts,
        totalPayments,
        closingBalances,
        totals: {
          openingBalance: sumRecord(openingBalances),
          receipts: sumRecord(totalReceipts),
          payments: sumRecord(totalPayments),
          closingBalance: sumRecord(closingBalances),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Trial Balance ==========
router.get("/trial-balance", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, type } = req.query;

    // Build date filter for Vouchers (to_date inclusive: end of day)
    let VoucherDateFilter: any = {};
    if (from_date || to_date) {
      VoucherDateFilter.date = {};
      if (from_date) {
        VoucherDateFilter.date.gte = new Date((from_date as string) + "T00:00:00.000Z");
      }
      if (to_date) {
        VoucherDateFilter.date.lte = new Date((to_date as string) + "T23:59:59.999Z");
      }
    }

    const AccountList = await prisma.account.findMany({
      include: {
        Subgroup: {
          include: { MainGroup: true },
        },
        VoucherEntry: {
          where: {
            Voucher: {
               status: "posted",
               OR: [
                 { isCleared: null },
                 { isCleared: { not: 0 } }
               ],
               ...VoucherDateFilter,
            },
          },
        },
      },
      orderBy: [
        {
          Subgroup: {
            MainGroup: {
              displayOrder: "asc",
            },
          },
        },
        {
          code: "asc",
        },
      ],
    });

    // Group Account by main group and Subgroup
    const groupedData: any[] = [];
    let currentMainGroup: any = null;
    let currentSubgroup: any = null;

    AccountList.forEach((account) => {
      const accountType = account.Subgroup.MainGroup.type;

      const totalDebit =
        account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) || 0;
      const totalCredit =
        account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) ||
        0;

      // Calculate balance using proper accounting logic
      const balance = calculateAccountBalance(
        account.openingBalance,
        totalDebit,
        totalCredit,
        accountType,
      );

      // Get trial balance amounts (debit/credit columns)
      const { debit, credit } = getTrialBalanceAmounts(balance, accountType);

      // Filter by type if specified
      if (type && type !== "all") {
        if (accountType.toLowerCase() !== (type as string).toLowerCase()) {
          return;
        }
      }

      const MainGroupCode = account.Subgroup.MainGroup.code;
      const MainGroupName = account.Subgroup.MainGroup.name;
      const SubgroupCode = account.Subgroup.code;
      const SubgroupName = account.Subgroup.name;

      // Add main group header if changed
      if (!currentMainGroup || currentMainGroup.code !== MainGroupCode) {
        currentMainGroup = { code: MainGroupCode, name: MainGroupName };
        groupedData.push({
          type: "MainGroup",
          code: MainGroupCode,
          name: `${MainGroupCode}-${MainGroupName}`,
          debit: 0,
          credit: 0,
        });
      }

      // Add Subgroup header if changed
      if (!currentSubgroup || currentSubgroup.code !== SubgroupCode) {
        currentSubgroup = { code: SubgroupCode, name: SubgroupName };
        groupedData.push({
          type: "Subgroup",
          code: SubgroupCode,
          name: `${SubgroupCode}-${SubgroupName}`,
          debit: 0,
          credit: 0,
        });
      }

      // Add account
      groupedData.push({
        type: "account",
        accountCode: account.code,
        accountName: `${account.code}-${account.name}`,
        accountType: accountType,
        debit,
        credit,
      });
    });

    // Validate that all Vouchers are balanced
    const dateFilterForValidation: any = {};
    if (to_date) {
      dateFilterForValidation.lte = new Date(to_date as string);
    }

    const allVouchersList = await prisma.voucher.findMany({
      where: {
        status: "posted",
        OR: [
          { isCleared: null },
          { isCleared: { not: 0 } }
        ],
        ...(Object.keys(dateFilterForValidation).length > 0 && {
          date: dateFilterForValidation,
        }),
      },
      select: {
        totalDebit: true,
        totalCredit: true,
        voucherNumber: true,
        date: true,
      },
    });

    const unbalancedVouchers = allVouchersList.filter(
      (voucher) => Math.abs(voucher.totalDebit - voucher.totalCredit) > 0.01,
    );

    if (unbalancedVouchers.length > 0) {
      // Logic for logging unbalanced vouchers can be added here if needed
    }

    res.json({ data: groupedData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Financial Statements ==========
router.get("/income-statement", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    // Prepare Date Objects with end-of-day fix
    let fromDateObj: Date | undefined;
    let toDateObj: Date | undefined;

    if (from_date) {
      fromDateObj = new Date(from_date as string);
    }
    if (to_date) {
      toDateObj = new Date(to_date as string);
      toDateObj.setHours(23, 59, 59, 999);
    }

    const dateFilter: any = {};
    if (fromDateObj) dateFilter.gte = fromDateObj;
    if (toDateObj) dateFilter.lte = toDateObj;

    const commonInclude = {
      Subgroup: {
        include: { MainGroup: true },
      },
      VoucherEntry: {
        where: {
          Voucher: {
            status: "posted",
            OR: [
              { isCleared: null },
              { isCleared: { not: 0 } }
            ],
            ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
          },
        },
      },
    };

    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Revenue", "revenue", "REVENUE"] },
          },
        },
      },
      include: commonInclude,
      orderBy: {
        code: "asc",
      },
    });

    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            name: "Cost",
          },
        },
      },
      include: commonInclude,
      orderBy: {
        code: "asc",
      },
    });

    // Expense Account: type is "Expense" but exclude "Cost" main group
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Expense", "expense", "EXPENSE"] },
            name: { not: "Cost" },
          },
        },
      },
      include: commonInclude,
      orderBy: {
        code: "asc",
      },
    });

    // Helper to calculate period movement
    const calculatePeriodAmount = (acc: any, type: "revenue" | "expense") => {
      const VoucherDebit =
        acc.VoucherEntry?.reduce(
          (sum: number, entry: any) => sum + (entry.debit || 0),
          0,
        ) || 0;
      const VoucherCredit =
        acc.VoucherEntry?.reduce(
          (sum: number, entry: any) => sum + (entry.credit || 0),
          0,
        ) || 0;

      const totalDebit = VoucherDebit;
      const totalCredit = VoucherCredit;

      if (type === "revenue") {
        return totalCredit - totalDebit;
      } else {
        return totalDebit - totalCredit;
      }
    };

    const processAccounts = (Account: any[], type: "revenue" | "expense") => {
      const bySubgroup: Record<string, any[]> = {};
      Account.forEach((account) => {
        const subGroupName = account.Subgroup.name;
        if (!bySubgroup[subGroupName]) {
          bySubgroup[subGroupName] = [];
        }

        const amount = calculatePeriodAmount(account, type);

        if (amount !== 0) {
          bySubgroup[subGroupName].push({
            name: `${account.code}-${account.name}`,
            amount: amount,
          });
        }
      });

      return Object.entries(bySubgroup)
        .filter(([_, items]) => items.length > 0)
        .map(([name, items]) => ({ name, items }));
    };

    const revenueCategories = processAccounts(revenueAccounts, "revenue");
    const costCategories = processAccounts(costAccounts, "expense");
    const expenseCategories = processAccounts(expenseAccounts, "expense");

    res.json({
      data: {
        revenue: revenueCategories,
        cost: costCategories,
        expenses: expenseCategories,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Recalculate All Account Balances ==========
router.post("/recalculate-balances", async (req: Request, res: Response) => {
  try {
    const AccountList = await prisma.account.findMany({
      include: {
        Subgroup: {
          include: {
            MainGroup: true,
          },
        },
        VoucherEntry: {
          where: {
            Voucher: {
                status: "posted",
              OR: [
                { isCleared: null },
                { isCleared: { not: 0 } }
              ],
            },
          },
        },
      },
    });

    // Recalculate all account balances from scratch
    for (const account of AccountList) {
      const accountType = account.Subgroup.MainGroup.type;
      const totalDebit = account.VoucherEntry.reduce(
        (sum, entry) => sum + entry.debit,
        0,
      );
      const totalCredit = account.VoucherEntry.reduce(
        (sum, entry) => sum + entry.credit,
        0,
      );

      const calculatedBalance = calculateAccountBalance(
        account.openingBalance,
        totalDebit,
        totalCredit,
        accountType,
      );

      await prisma.account.update({
        where: { id: account.id },
        data: {
          currentBalance: calculatedBalance,
        },
      });
    }

    res.json({
      success: true,
      message: `Recalculated balances for ${AccountList.length} Account`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const balanceSheetAssetMainGroupWhere = {
  OR: [
    { type: "Asset" },
    { type: { equals: "Asset", mode: "insensitive" as const } },
    { code: { in: ["1", "2"] } },
  ],
};

const balanceSheetEquityMainGroupWhere = {
  OR: [
    { type: "Equity" },
    { type: { equals: "Equity", mode: "insensitive" as const } },
    { code: { in: ["5", "6"] } },
  ],
};

function parseBalanceSheetAsOfDate(dateParam: string): Date {
  const trimmed = String(dateParam).trim();
  if (trimmed.includes("/")) {
    const parts = trimmed.split("/");
    const fullYear =
      parseInt(parts[2], 10) < 100
        ? 2000 + parseInt(parts[2], 10)
        : parseInt(parts[2], 10);
    const month = String(parseInt(parts[1], 10)).padStart(2, "0");
    const day = String(parseInt(parts[0], 10)).padStart(2, "0");
    return new Date(`${fullYear}-${month}-${day}T23:59:59.999Z`);
  }

  const isoDate = trimmed.slice(0, 10);
  return new Date(`${isoDate}T23:59:59.999Z`);
}

function buildBalanceSheetVoucherInclude(asOfDate: Date) {
  return {
    VoucherEntry: {
      where: {
        Voucher: {
          status: "posted",
          OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
          date: { lte: asOfDate },
        },
      },
    },
  };
}

async function getFirstPostedVoucherDateByAccount(): Promise<
  Map<string, Date>
> {
  const entries = await prisma.voucherEntry.findMany({
    where: {
      accountId: { not: null },
      Voucher: {
        status: "posted",
        OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
      },
    },
    select: {
      accountId: true,
      Voucher: { select: { date: true } },
    },
    orderBy: [{ Voucher: { date: "asc" } }, { sortOrder: "asc" }],
  });

  const firstByAccount = new Map<string, Date>();
  for (const entry of entries) {
    if (!entry.accountId || firstByAccount.has(entry.accountId)) continue;
    firstByAccount.set(entry.accountId, entry.Voucher.date);
  }
  return firstByAccount;
}

type BalanceSheetAccountRow = {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  createdAt: Date;
  VoucherEntry?: Array<{ debit: number; credit: number }>;
};

function computeBalanceSheetAccountBalance(
  account: BalanceSheetAccountRow,
  accountType: string,
  asOfDate: Date,
  firstVoucherDateByAccount: Map<string, Date>,
): number {
  const asOfMs = asOfDate.getTime();
  const createdAtMs = new Date(account.createdAt).getTime();
  const firstVoucherDate = firstVoucherDateByAccount.get(account.id);
  const hasVoucherOnOrBefore =
    (account.VoucherEntry?.length ?? 0) > 0 ||
    (firstVoucherDate ? firstVoucherDate.getTime() <= asOfMs : false);

  // A backdated posted voucher establishes the account on its accounting date,
  // even when the account record itself was created later.
  if (createdAtMs > asOfMs && !hasVoucherOnOrBefore) {
    return 0;
  }

  // Hide balances for accounts whose first posted activity is after the as-of date.
  if (!hasVoucherOnOrBefore) {
    const opening = Number(account.openingBalance || 0);
    if (Math.abs(opening) < 0.01) {
      return 0;
    }
    if (firstVoucherDate && firstVoucherDate.getTime() > asOfMs) {
      return 0;
    }
    // Opening balance without any posted voucher is not established on the balance sheet.
    if (!firstVoucherDate) {
      return 0;
    }
  }

  const debit =
    account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) || 0;
  const credit =
    account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) || 0;

  let openingBalance = Number(account.openingBalance || 0);
  if (firstVoucherDate && firstVoucherDate.getTime() > asOfMs) {
    openingBalance = 0;
  }

  return calculateAccountBalance(
    openingBalance,
    debit,
    credit,
    accountType,
  );
}

function mapBalanceSheetAccounts(
  accounts: BalanceSheetAccountRow[],
  accountType: string,
  asOfDate: Date,
  firstVoucherDateByAccount: Map<string, Date>,
) {
  return accounts.map((acc) => ({
    id: acc.id,
    code: acc.code,
    name: acc.name,
    balance: {
      balance: computeBalanceSheetAccountBalance(
        acc,
        accountType,
        asOfDate,
        firstVoucherDateByAccount,
      ),
    },
  }));
}

// Get Balance Sheet
router.get("/balance-sheet", async (req: Request, res: Response) => {
  try {
    const dateParam = (req.query.date || req.query.as_of_date) as string;

    if (!dateParam) {
      return res.status(400).json({
        error: 'Date parameter is required (use "date" or "as_of_date")',
      });
    }

    const asOfDate = parseBalanceSheetAsOfDate(dateParam);
    const commonInclude = buildBalanceSheetVoucherInclude(asOfDate);
    const firstVoucherDateByAccount = await getFirstPostedVoucherDateByAccount();

    // Get Assets (include case variants and standard codes 1/2 for Current/Long Term Assets)
    const assetMainGroups = await prisma.mainGroup.findMany({
      where: balanceSheetAssetMainGroupWhere,
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: commonInclude,
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    const assets = assetMainGroups.map((mg) => {
      const subgroups = mg.Subgroup.map((sg) => {
        const accounts = mapBalanceSheetAccounts(
          sg.Account as BalanceSheetAccountRow[],
          "Asset",
          asOfDate,
          firstVoucherDateByAccount,
        );

        return {
          id: sg.id,
          code: sg.code,
          name: sg.name,
          coa_accounts: accounts,
        };
      });

      return {
        id: mg.id,
        code: mg.code,
        name: mg.name,
        non_depreciation_sub_groups: subgroups,
      };
    });

    // Get Liabilities (include common type and code variants so Current/Long Term Liabilities show)
    const liabilityMainGroupsRaw = await prisma.mainGroup.findMany({
      where: {
        OR: [
          { type: "Liability" },
          { type: "Liabilities" },
          { type: { equals: "Liability", mode: "insensitive" } },
          { type: { equals: "Liabilities", mode: "insensitive" } },
          // Also include standard liability codes 3 (Current Liabilities) and 4 (Long Term Liabilities)
          { code: { in: ["3", "4"] } },
        ],
      },
      include: {
        Subgroup: {
          include: {
            Account: {
              include: commonInclude,
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });
    // If no liability groups found by type, include any main group whose type contains "liab" (e.g. "Current Liability")
    const liabilityMainGroups =
      liabilityMainGroupsRaw.length > 0
        ? liabilityMainGroupsRaw
        : await prisma.mainGroup.findMany({
            where: {
              type: { contains: "liab", mode: "insensitive" },
            },
            include: {
              Subgroup: {
                include: {
                  Account: { include: commonInclude },
                },
                orderBy: { code: "asc" },
              },
            },
            orderBy: { code: "asc" },
          });

    const liabilities = liabilityMainGroups.map((mg) => {
      const subgroups = mg.Subgroup.map((sg) => {
        const accounts = mapBalanceSheetAccounts(
          sg.Account as BalanceSheetAccountRow[],
          "Liability",
          asOfDate,
          firstVoucherDateByAccount,
        );

        return {
          id: sg.id,
          code: sg.code,
          name: sg.name,
          coa_accounts: accounts,
        };
      });

      return {
        id: mg.id,
        code: mg.code,
        name: mg.name,
        coa_sub_groups: subgroups,
      };
    });

    // Get Capital & Drawings (include case variants and standard codes 5/6)
    const capitalMainGroups = await prisma.mainGroup.findMany({
      where: balanceSheetEquityMainGroupWhere,
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: commonInclude,
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    const capital = capitalMainGroups.map((mg) => {
      const subgroups = mg.Subgroup.map((sg) => {
        const accounts = mapBalanceSheetAccounts(
          sg.Account as BalanceSheetAccountRow[],
          "Equity",
          asOfDate,
          firstVoucherDateByAccount,
        );

        return {
          id: sg.id,
          code: sg.code,
          name: sg.name,
          coa_accounts: accounts,
        };
      });

      return {
        id: mg.id,
        code: mg.code,
        name: mg.name,
        coa_sub_groups: subgroups,
      };
    });

    // Calculate Net Income (Revenue - Expense - Cost) as of date
    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            OR: [
              { type: { equals: "Income", mode: "insensitive" } },
              { type: { equals: "Revenue", mode: "insensitive" } },
              { code: "7" },
            ],
          },
        },
      },
      include: {
        ...commonInclude,
        Subgroup: {
          include: { MainGroup: true },
        },
      },
    });

    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            OR: [
              { name: { in: ["Cost", "Cost of Sales"] } },
              { code: "9" },
            ],
          },
        },
      },
      include: {
        ...commonInclude,
        Subgroup: {
          include: { MainGroup: true },
        },
      },
    });

    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            OR: [
              {
                AND: [
                  { type: { equals: "Expense", mode: "insensitive" } },
                  { name: { notIn: ["Cost", "Cost of Sales"] } },
                ],
              },
              { code: "8" },
            ],
          },
        },
      },
      include: {
        ...commonInclude,
        Subgroup: {
          include: { MainGroup: true },
        },
      },
    });

    const sumNetActivity = (
      accounts: BalanceSheetAccountRow[],
      kind: "revenue" | "cost" | "expense",
    ) =>
      accounts.reduce((sum, acc) => {
        const balance = computeBalanceSheetAccountBalance(
          acc,
          kind === "revenue" ? "Revenue" : "Expense",
          asOfDate,
          firstVoucherDateByAccount,
        );
        return sum + balance;
      }, 0);

    const revenueSum = sumNetActivity(
      revenueAccounts as BalanceSheetAccountRow[],
      "revenue",
    );
    const costSum = sumNetActivity(
      costAccounts as BalanceSheetAccountRow[],
      "cost",
    );
    const expenseSum = sumNetActivity(
      expenseAccounts as BalanceSheetAccountRow[],
      "expense",
    );

    const netIncome = revenueSum - expenseSum - costSum;

    res.json({
      data: {
        assets: JSON.parse(JSON.stringify(assets)),
        liabilities: JSON.parse(JSON.stringify(liabilities)),
        capital: JSON.parse(JSON.stringify(capital)),
        revExp: netIncome,
        revenue: revenueSum,
        expense: expenseSum,
        cost: costSum,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

function supplierLabel(
  supplier?: { name?: string | null; companyName?: string | null } | null,
): string {
  if (!supplier) return "N/A";
  const companyName = String(supplier.companyName || "").trim();
  const name = String(supplier.name || "").trim();
  return companyName || name || "N/A";
}

router.get("/daily-activity", async (req: Request, res: Response) => {
  try {
    const dateStr = String(req.query.date || "").trim();
    if (!dateStr) {
      return res.status(400).json({ error: "date is required (YYYY-MM-DD)" });
    }

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const dateRange = { gte: dayStart, lte: dayEnd };

    const [
      purchaseOrders,
      directPurchaseOrders,
      salesInvoices,
      salesReturns,
    ] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where: { date: dateRange },
        include: {
          Supplier: true,
          PurchaseOrderItem: {
            include: {
              Part: { select: { partNo: true, description: true } },
            },
          },
        },
        orderBy: [{ poNumber: "desc" }, { createdAt: "desc" }],
      }),
      prisma.directPurchaseOrder.findMany({
        where: {
          date: dateRange,
          orderType: { not: "transfer_in" },
        },
        include: {
          Supplier: true,
          Store: true,
          BranchAccount: true,
          DirectPurchaseOrderItem: {
            include: {
              Part: { select: { partNo: true, description: true } },
            },
          },
        },
        orderBy: [{ dpoNumber: "desc" }, { createdAt: "desc" }],
      }),
      prisma.salesInvoice.findMany({
        where: {
          invoiceDate: dateRange,
          customerType: { not: "transfer" },
        },
        include: {
          SalesInvoiceItem: {
            select: {
              id: true,
              partNo: true,
              description: true,
              orderedQty: true,
              unitPrice: true,
              lineTotal: true,
              brand: true,
            },
          },
        },
        orderBy: [{ invoiceNo: "desc" }, { createdAt: "desc" }],
      }),
      prisma.salesReturn.findMany({
        where: { returnDate: dateRange },
        include: {
          Customer: { select: { name: true } },
          SalesInvoice: {
            select: {
              invoiceNo: true,
              customerName: true,
            },
          },
          SalesReturnItem: {
            include: {
              Part: {
                select: { partNo: true, description: true, uom: true },
              },
            },
          },
        },
        orderBy: [{ returnNumber: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const filteredInvoices = salesInvoices.filter(
      (invoice) => !invoice.customerName.toLowerCase().includes("demo"),
    );

    const poRows = purchaseOrders.map((po) => ({
      id: po.id,
      number: po.poNumber,
      date: po.date,
      supplierName: supplierLabel(po.Supplier),
      status: po.status,
      totalAmount: po.totalAmount,
      itemsCount: po.PurchaseOrderItem.length,
      items: po.PurchaseOrderItem.map((item) => ({
        partNo: item.Part?.partNo || "",
        description: item.Part?.description || "",
        quantity: item.quantity,
        unitPrice: item.unitCost,
        lineTotal: item.totalCost,
      })),
    }));

    const dpoRows = directPurchaseOrders.map((dpo) => ({
      id: dpo.id,
      number: dpo.dpoNumber,
      date: dpo.date,
      supplierName: dpo.Supplier
        ? supplierLabel(dpo.Supplier)
        : dpo.BranchAccount?.name?.trim() || "N/A",
      storeName: dpo.Store?.name || null,
      status: dpo.status,
      discount: dpo.discount ?? 0,
      totalAmount: dpo.totalAmount,
      itemsCount: dpo.DirectPurchaseOrderItem.length,
      items: dpo.DirectPurchaseOrderItem.map((item) => ({
        partNo: item.Part?.partNo || "",
        description: item.Part?.description || "",
        quantity: item.quantity,
        unitPrice: item.purchasePrice,
        lineTotal: item.amount,
      })),
    }));

    const invoiceRows = filteredInvoices.map((inv) => ({
      id: inv.id,
      number: inv.invoiceNo,
      date: inv.invoiceDate,
      customerName: inv.customerName,
      customerType: inv.customerType,
      term: inv.term || null,
      bankAmount: Number(inv.bankAmount || 0),
      cashAmount: Number(inv.cashAmount || 0),
      status: inv.status,
      paymentStatus: inv.paymentStatus,
      subtotal: inv.subtotal,
      tax: inv.tax,
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      itemsCount: inv.SalesInvoiceItem.length,
      items: inv.SalesInvoiceItem.map((item) => ({
        partNo: item.partNo,
        description: item.description || "",
        brand: item.brand || "",
        quantity: item.orderedQty,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    }));

    const returnRows = salesReturns.map((sr) => ({
      id: sr.id,
      number: sr.returnNumber,
      date: sr.returnDate,
      invoiceNo:
        sr.SalesInvoice?.invoiceNo || sr.legacyInvoiceNo || null,
      customerName:
        sr.Customer?.name ||
        sr.SalesInvoice?.customerName ||
        sr.legacyCustomerName ||
        "N/A",
      status: sr.status,
      subtotal: sr.subtotal,
      tax: sr.tax,
      deduction: sr.deduction,
      totalAmount: sr.totalAmount,
      paidAmount: sr.paidAmount,
      itemsCount: sr.SalesReturnItem.length,
      items: sr.SalesReturnItem.map((item) => ({
        partNo: item.Part?.partNo || "",
        description: item.Part?.description || "",
        quantity: item.returnQuantity,
        unitPrice: item.originalSalePrice,
        lineTotal: item.amount,
      })),
    }));

    const sumAmount = (rows: { totalAmount: number }[]) =>
      rows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);

    res.json({
      data: {
        date: dateStr,
        summary: {
          purchaseOrders: {
            count: poRows.length,
            totalAmount: sumAmount(poRows),
          },
          directPurchaseOrders: {
            count: dpoRows.length,
            totalAmount: sumAmount(dpoRows),
          },
          salesInvoices: {
            count: invoiceRows.length,
            totalAmount: invoiceRows.reduce(
              (sum, row) => sum + Number(row.grandTotal || 0),
              0,
            ),
          },
          salesReturns: {
            count: returnRows.length,
            totalAmount: sumAmount(returnRows),
          },
        },
        purchaseOrders: poRows,
        directPurchaseOrders: dpoRows,
        salesInvoices: invoiceRows,
        salesReturns: returnRows,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
