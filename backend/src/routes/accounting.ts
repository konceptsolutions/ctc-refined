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
            MainGroup: true
          }
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

// ========== Journal Entries ==========
router.get("/journal-entries", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const where: any = {};
    if (status && status !== "all") where.status = status;
    if (search) {
      where.OR = [
        { entryNo: { contains: search as string, mode: "insensitive" } },
        { reference: { contains: search as string, mode: "insensitive" } },
        { description: { contains: search as string, mode: "insensitive" } },
      ];
    }

    const entries = await prisma.journalEntry.findMany({
      where,
      include: {
        JournalLine: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: { MainGroup: true },
                },
              },
            },
          },
          orderBy: { lineOrder: "asc" },
        },
      },
      orderBy: { entryDate: "desc" },
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

    // Generate entry number
    const count = await prisma.journalEntry.count();
    const entryNo = `JV-${new Date().getFullYear()}-${String(count + 1).padStart(3, "0")}`;

    const entry = await prisma.journalEntry.create({
      data: {
        entryNo,
        entryDate: new Date(entryDate),
        reference,
        description,
        totalDebit,
        totalCredit,
        createdBy,
        JournalLine: {
          create: lines.map((line: any, index: number) => ({
            accountId: line.accountId,
            description: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
            lineOrder: index,
          })),
        },
      } as any,
      include: {
        JournalLine: {
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

      const entry = await prisma.journalEntry.findUnique({
        where: { id },
        include: {
          JournalLine: {
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
        return res.status(404).json({ error: "Journal entry not found" });
      }

      if (entry.status === "posted") {
        return res.status(400).json({ error: "Entry already posted" });
      }

      // Update entry status
      const updatedEntry = await prisma.journalEntry.update({
        where: { id },
        data: {
          status: "posted",
          postedBy,
          postedAt: new Date(),
        },
        include: {
          JournalLine: {
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
      for (const line of entry.JournalLine) {
        const accountType = line.Account.Subgroup.MainGroup.type;
        const balanceChange = calculateBalanceChange(
          line.debit,
          line.credit,
          accountType,
        );

        await prisma.account.update({
          where: { id: line.accountId },
          data: {
            currentBalance: {
              increment: balanceChange,
            },
          },
        });
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

    // Build where clause for journal entries
    const journalWhere: any = {
      status: "posted", // Only show posted entries
    };

    // Build where clause for Vouchers
    const VoucherWhere: any = {
      status: "posted", // Only show posted Vouchers
    };

    // Date range filter for both
    if (from_date || to_date) {
      journalWhere.entryDate = {};
      VoucherWhere.date = {};
      if (from_date) {
        journalWhere.entryDate.gte = new Date(from_date as string);
        VoucherWhere.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        journalWhere.entryDate.lte = new Date(to_date as string);
        VoucherWhere.date.lte = new Date(to_date as string);
      }
    }

    // Search filter (SQLite doesn't support case-insensitive mode, so we'll filter in memory)
    let searchFilter: any = null;
    if (search) {
      const searchStr = (search as string).toLowerCase();
      searchFilter = { searchStr, search_by };
    }

    // Get all journal entries with lines
    const entries = await prisma.journalEntry.findMany({
      where: journalWhere,
      include: {
        JournalLine: {
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
          orderBy: { lineOrder: "asc" },
        },
      },
      orderBy: [{ entryDate: "desc" }, { entryNo: "desc" }],
    });

    // Get all Vouchers with entries
    const Vouchers = await prisma.voucher.findMany({
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
    let JournalLine: any[] = [];
    let tId = 1;

    // Process JournalEntry records
    entries.forEach((entry) => {
      entry.JournalLine.forEach((line) => {
        const accountName = line.Account
          ? `${line.Account.code}-${line.Account.name}`
          : "Unknown";
        const description = line.description || entry.description || "";

        // Apply search filter if provided
        if (searchFilter) {
          const { searchStr, search_by } = searchFilter;
          if (search_by === "Voucher") {
            if (!entry.entryNo.toLowerCase().includes(searchStr)) return;
          } else if (search_by === "account") {
            if (
              line.Account &&
              !line.Account.code.toLowerCase().includes(searchStr) &&
              !line.Account.name.toLowerCase().includes(searchStr)
            )
              return;
          } else if (search_by === "description") {
            if (
              !description.toLowerCase().includes(searchStr) &&
              !entry.description?.toLowerCase().includes(searchStr)
            )
              return;
          } else {
            // General search
            if (
              !entry.entryNo.toLowerCase().includes(searchStr) &&
              !entry.reference?.toLowerCase().includes(searchStr) &&
              !description.toLowerCase().includes(searchStr) &&
              !accountName.toLowerCase().includes(searchStr)
            )
              return;
          }
        }

        JournalLine.push({
          id: `je-${entry.id}-${line.id}`,
          tId: tId++,
          VoucherNo: entry.entryNo,
          date: entry.entryDate.toISOString().split("T")[0],
          account: accountName,
          description: description,
          debit: line.debit,
          credit: line.credit,
          entryId: entry.id,
          lineId: line.id,
        });
      });
    });

    // Process Voucher records
    Vouchers.forEach((Voucher) => {
      Voucher.VoucherEntry.forEach((entry) => {
        // Ensure consistent account format: code-name
        let accountName = entry.accountName || "Unknown";
        if (entry.Account) {
          accountName = `${entry.Account.code}-${entry.Account.name}`;
        } else if (entry.accountName && !entry.accountName.includes("-")) {
          // If accountName doesn't have code prefix, try to find the account
          accountName = entry.accountName;
        }
        const description = entry.description || Voucher.narration || "";

        // Apply search filter if provided
        if (searchFilter) {
          const { searchStr, search_by } = searchFilter;
          if (search_by === "Voucher") {
            if (!Voucher.voucherNumber.toLowerCase().includes(searchStr))
              return;
          } else if (search_by === "account") {
            if (
              entry.Account &&
              !entry.Account.code.toLowerCase().includes(searchStr) &&
              !entry.Account.name.toLowerCase().includes(searchStr)
            )
              return;
          } else if (search_by === "description") {
            if (
              !description.toLowerCase().includes(searchStr) &&
              !Voucher.narration?.toLowerCase().includes(searchStr)
            )
              return;
          } else {
            // General search
            if (
              !Voucher.voucherNumber.toLowerCase().includes(searchStr) &&
              !description.toLowerCase().includes(searchStr) &&
              !accountName.toLowerCase().includes(searchStr)
            )
              return;
          }
        }

        JournalLine.push({
          id: `v-${Voucher.id}-${entry.id}`,
          tId: tId++,
          VoucherNo: Voucher.voucherNumber,
          date: Voucher.date.toISOString().split("T")[0],
          account: accountName,
          description: description,
          debit: entry.debit,
          credit: entry.credit,
          VoucherId: Voucher.id,
          entryId: entry.id,
        });
      });
    });

    // Sort combined results by date descending
    JournalLine.sort((a, b) => {
      const dateCompare =
        new Date(b.date).getTime() - new Date(a.date).getTime();
      if (dateCompare !== 0) return dateCompare;
      return b.VoucherNo.localeCompare(a.VoucherNo);
    });

    // Reassign tId after sorting
    JournalLine.forEach((line, index) => {
      line.tId = index + 1;
    });

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedLines = JournalLine.slice(startIndex, endIndex);

    res.json({
      data: paginatedLines,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: JournalLine.length,
        totalPages: Math.ceil(JournalLine.length / limitNum),
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
        JournalLine: {
          where: {
            JournalEntry: {
              status: "posted",
              ...(dateFrom && {
                entryDate: { gte: new Date(dateFrom as string) },
              }),
              ...(dateTo && { entryDate: { lte: new Date(dateTo as string) } }),
            },
          },
          include: {
            JournalEntry: true,
          },
          orderBy: {
            JournalEntry: { entryDate: "asc" },
          },
        },
        VoucherEntry: {
          where: {
            Voucher: {
              status: "posted",
              ...(dateFrom && { date: { gte: new Date(dateFrom as string) } }),
              ...(dateTo && { date: { lte: new Date(dateTo as string) } }),
            },
          },
          include: {
            Voucher: true,
          },
          orderBy: {
            Voucher: { date: "asc" },
          },
        },
      },
    });

    // Calculate running balances using proper accounting logic
    const ledgerAccounts = Account.map((account) => {
      const accountType = account.Subgroup?.MainGroup?.type || "";
      // Normalize account type to lowercase for frontend compatibility
      const normalizedType = accountType.toLowerCase();
      let runningBalance = account.openingBalance;

      // Combine JournalLines and VoucherEntries
      const allTransactions: any[] = [];

      // Add JournalEntry transactions
      (account.JournalLine || []).forEach((line: any) => {
        allTransactions.push({
          id: `jl-${line.id}`,
          date: line.JournalEntry.entryDate,
          dateStr: line.JournalEntry.entryDate.toISOString().split("T")[0],
          journalNo: line.JournalEntry.entryNo,
          reference: line.JournalEntry.reference || "",
          description: line.description || line.JournalEntry.description || "",
          debit: line.debit,
          credit: line.credit,
        });
      });

      // Add Voucher transactions
      (account.VoucherEntry || []).forEach((entry: any) => {
        allTransactions.push({
          id: `ve-${entry.id}`,
          date: entry.Voucher.date,
          dateStr: entry.Voucher.date.toISOString().split("T")[0],
          journalNo: entry.Voucher.voucherNumber,
          reference: entry.Voucher.narration || "",
          description: entry.description || entry.Voucher.narration || "",
          debit: entry.debit,
          credit: entry.credit,
        });
      });

      // Sort combined transactions by date
      allTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

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

// ========== Trial Balance ==========
router.get("/trial-balance", async (req: Request, res: Response) => {
  try {
    const { period, type, from_date, to_date } = req.query;

    // Build date filter if provided
    let dateFilter: any = {};
    if (from_date || to_date) {
      dateFilter.entryDate = {};
      if (from_date) {
        dateFilter.entryDate.gte = new Date(from_date as string);
      }
      if (to_date) {
        dateFilter.entryDate.lte = new Date(to_date as string);
      }
    }

    // Build date filter for Vouchers
    let VoucherDateFilter: any = {};
    if (from_date || to_date) {
      VoucherDateFilter.date = {};
      if (from_date) {
        VoucherDateFilter.date.gte = new Date(from_date as string);
      }
      if (to_date) {
        VoucherDateFilter.date.lte = new Date(to_date as string);
      }
    }

    // Get all posted Voucher numbers to avoid double counting
    const postedVouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
        ...(from_date && { date: { gte: new Date(from_date as string) } }),
        ...(to_date && { date: { lte: new Date(to_date as string) } }),
      },
      select: {
        voucherNumber: true,
      },
    });
    const voucherNumbers = postedVouchers.map((v) => v.voucherNumber);
    const journalExcludeVouchers =
      voucherNumbers.length > 0 ? { entryNo: { notIn: voucherNumbers } } : {};

    const Account = await prisma.account.findMany({
      include: {
        Subgroup: {
          include: { MainGroup: true },
        },
        JournalLine: {
          where: {
            JournalEntry: {
              status: "posted",
              ...journalExcludeVouchers,
              ...dateFilter,
            },
          },
        },
        VoucherEntry: {
          where: {
            Voucher: {
              status: "posted",
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

    Account.forEach((account) => {
      const accountType = account.Subgroup.MainGroup.type;
      // Combine debits/credits from both JournalLines and VoucherEntries
      const journalDebit = account.JournalLine.reduce(
        (sum, line) => sum + line.debit,
        0,
      );
      const journalCredit = account.JournalLine.reduce(
        (sum, line) => sum + line.credit,
        0,
      );
      const VoucherDebit =
        account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) ||
        0;
      const VoucherCredit =
        account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) ||
        0;

      const totalDebit = journalDebit + VoucherDebit;
      const totalCredit = journalCredit + VoucherCredit;

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

      // Add account (include all Account, even with zero balances)
      groupedData.push({
        type: "account",
        accountCode: account.code,
        accountName: `${account.code}-${account.name}`,
        accountType: accountType,
        debit,
        credit,
      });
    });

    // Calculate totals for validation
    const calculatedTotalDebit = groupedData
      .filter((item: any) => item.type === "account")
      .reduce((sum: number, item: any) => sum + (item.debit || 0), 0);
    const calculatedTotalCredit = groupedData
      .filter((item: any) => item.type === "account")
      .reduce((sum: number, item: any) => sum + (item.credit || 0), 0);

    // Validate that all journal entries and Vouchers are balanced
    const dateFilterForValidation: any = {};
    if (to_date) {
      dateFilterForValidation.lte = new Date(to_date as string);
    }

    const allJournalEntries = await prisma.journalEntry.findMany({
      where: {
        status: "posted",
        ...(Object.keys(dateFilterForValidation).length > 0 && {
          entryDate: dateFilterForValidation,
        }),
      },
      select: {
        totalDebit: true,
        totalCredit: true,
        entryNo: true,
        entryDate: true,
      },
    });

    const unbalancedJournalEntries = allJournalEntries.filter(
      (entry) => Math.abs(entry.totalDebit - entry.totalCredit) > 0.01,
    );

    const allVouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
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

    const unbalancedVouchers = allVouchers.filter(
      (Voucher) => Math.abs(Voucher.totalDebit - Voucher.totalCredit) > 0.01,
    );

    // Check opening balances
    const totalOpeningDebit = Account.reduce((sum, acc) => {
      const accountType = acc.Subgroup.MainGroup.type.toLowerCase();
      if (isDebitNormal(accountType)) {
        return sum + (acc.openingBalance || 0);
      }
      return sum;
    }, 0);

    const totalOpeningCredit = Account.reduce((sum, acc) => {
      const accountType = acc.Subgroup.MainGroup.type.toLowerCase();
      if (!isDebitNormal(accountType)) {
        return sum + (acc.openingBalance || 0);
      }
      return sum;
    }, 0);

    const openingBalanceDifference = Math.abs(
      totalOpeningDebit - totalOpeningCredit,
    );

    if (unbalancedJournalEntries.length > 0 || unbalancedVouchers.length > 0) {
      if (unbalancedJournalEntries.length > 0) {
      }
      if (unbalancedVouchers.length > 0) {
      }
    }

    res.json({ data: groupedData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Financial Statements ==========
router.get("/income-statement", async (req: Request, res: Response) => {
  try {
    const { period, from_date, to_date } = req.query;

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

    // Get all posted Voucher numbers to avoid double counting
    const postedVouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
        ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
      },
      select: { voucherNumber: true },
    });
    const voucherNumbers = postedVouchers.map((v) => v.voucherNumber);
    const journalExcludeVouchers =
      voucherNumbers.length > 0 ? { entryNo: { notIn: voucherNumbers } } : {};

    const commonInclude = {
      Subgroup: {
        include: { MainGroup: true },
      },
      JournalLine: {
        where: {
          JournalEntry: {
            status: "posted",
            ...journalExcludeVouchers,
            ...(fromDateObj || toDateObj ? { entryDate: dateFilter } : {}),
          },
        },
      },
      VoucherEntry: {
        where: {
          Voucher: {
            status: "posted",
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
            name: "Cost", // Filter by main group name since type is "Expense"
          },
        },
      },
      include: commonInclude,
      orderBy: {
        code: "asc",
      },
    });

    // Expense Account: type is "Expense" but exclude "Cost" main group (it's handled separately)
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Expense", "expense", "EXPENSE"] },
            name: { not: "Cost" }, // Exclude Cost main group
          },
        },
      },
      include: commonInclude,
      orderBy: {
        code: "asc",
      },
    });

    // Group by Subgroup
    // Helper to calculate period movement (Income statement is period-based)
    const calculatePeriodAmount = (acc: any, type: "revenue" | "expense") => {
      const journalDebit = acc.JournalLine.reduce(
        (sum: number, line: any) => sum + (line.debit || 0),
        0,
      );
      const journalCredit = acc.JournalLine.reduce(
        (sum: number, line: any) => sum + (line.credit || 0),
        0,
      );

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

      const totalDebit = journalDebit + VoucherDebit;
      const totalCredit = journalCredit + VoucherCredit;

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
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Recalculate All Account Balances ==========
router.post("/recalculate-balances", async (req: Request, res: Response) => {
  try {
    const Account = await prisma.account.findMany({
      include: {
        Subgroup: {
          include: {
            MainGroup: true,
          },
        },
        JournalLine: {
          where: {
            JournalEntry: {
              status: "posted",
            },
          },
        },
      },
    });

    // Recalculate all account balances from scratch
    for (const account of Account) {
      const accountType = account.Subgroup.MainGroup.type;
      const totalDebit = account.JournalLine.reduce(
        (sum, line) => sum + line.debit,
        0,
      );
      const totalCredit = account.JournalLine.reduce(
        (sum, line) => sum + line.credit,
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
      message: `Recalculated balances for ${Account.length} Account`,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get Balance Sheet
router.get("/balance-sheet", async (req: Request, res: Response) => {
  console.log("=== BALANCE SHEET ENDPOINT CALLED ===");
  console.log("Query params:", req.query);
  try {
    // Accept both 'date' and 'as_of_date' parameters for compatibility
    const dateParam = (req.query.date || req.query.as_of_date) as string;

    if (!dateParam) {
      console.log("ERROR: No date parameter");
      return res.status(400).json({
        error: 'Date parameter is required (use "date" or "as_of_date")',
      });
    }

    // Parse date (format: DD/MM/YY or YYYY-MM-DD)
    let asOfDate: Date;
    if (typeof dateParam === "string") {
      // Try DD/MM/YY format first (autohub format)
      if (dateParam.includes("/")) {
        const parts = dateParam.split("/");
        if (parts.length === 3) {
          const day = parseInt(parts[0], 10);
          const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
          const year = parseInt(parts[2], 10);
          // Handle 2-digit year
          const fullYear = year < 100 ? 2000 + year : year;
          asOfDate = new Date(Date.UTC(fullYear, month, day, 23, 59, 59, 999));
        } else {
          asOfDate = new Date(dateParam);
          asOfDate.setHours(23, 59, 59, 999);
        }
      } else {
        // YYYY-MM-DD format
        const dateParts = dateParam.split("-");
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const day = parseInt(dateParts[2], 10);
          asOfDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
        } else {
          // Try parsing as-is
          asOfDate = new Date(dateParam);
          asOfDate.setHours(23, 59, 59, 999);
        }
      }
    } else {
      asOfDate = new Date();
      asOfDate.setHours(23, 59, 59, 999);
    }

    console.log("Parsed date:", dateParam, "->", asOfDate.toISOString());

    // Get all posted Voucher numbers to avoid double counting
    const postedVouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
        date: { lte: asOfDate },
      },
      select: {
        voucherNumber: true,
      },
    });
    const voucherNumbers = postedVouchers.map((v) => v.voucherNumber);
    const journalExcludeVouchers =
      voucherNumbers.length > 0 ? { entryNo: { notIn: voucherNumbers } } : {};

    // Get Assets (MainGroup type = 'Asset')
    // First get all Account, then fetch their transactions separately to avoid filtering issues
    const assetMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Asset" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      entryNo: { notIn: voucherNumbers },
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    console.log("=== BALANCE SHEET DEBUG ===");
    console.log("Asset MainGroups found:", assetMainGroups.length);
    if (assetMainGroups.length > 0) {
      console.log(
        "First MainGroup:",
        assetMainGroups[0].code,
        assetMainGroups[0].name,
      );
      console.log("Subgroup:", assetMainGroups[0].Subgroup.length);
      if (assetMainGroups[0].Subgroup.length > 0) {
        console.log(
          "First Subgroup Account:",
          assetMainGroups[0].Subgroup[0].Account.length,
        );
      }
    }

    console.log(
      "Balance Sheet Debug - Asset MainGroups:",
      assetMainGroups.length,
    );
    assetMainGroups.forEach((mg, idx) => {
      console.log(
        `MainGroup ${idx}:`,
        mg.code,
        mg.name,
        "Subgroup:",
        mg.Subgroup.length,
      );
      mg.Subgroup.forEach((sg, sgIdx) => {
        console.log(
          `  Subgroup ${sgIdx}:`,
          sg.code,
          sg.name,
          "Accounts:",
          sg.Account.length,
        );
        if (sg.Account.length > 0) {
          const acc = sg.Account[0];
          console.log(
            `    First Account:`,
            acc.code,
            acc.name,
            "VoucherEntries:",
            acc.VoucherEntry?.length || 0,
            "JournalLines:",
            acc.JournalLine?.length || 0,
          );
        }
      });
    });

    // Process Assets: Calculate balances for each account
    const assets = assetMainGroups.map((MainGroup) => {
      const Subgroup = MainGroup.Subgroup.map((Subgroup) => {
        // Ensure we process all Account, even if they have no transactions
        const Account = (Subgroup.Account || []).map((account) => {
          const accountType = MainGroup.type.toLowerCase();
          const normalizedType = accountType;

          // Calculate balance from transactions (matching autohub: SUM(debit) - SUM(credit))
          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const VoucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const VoucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;

          const totalDebit = journalDebit + VoucherDebit;
          const totalCredit = journalCredit + VoucherCredit;

          // Calculate balance using proper accounting logic
          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            MainGroup.type,
          );

          return {
            id: account.id,
            code: account.code,
            name: account.name,
            balance: {
              balance: balance,
            },
          };
        }); // Include all Account, even with zero balance (frontend will filter)

        return {
          id: Subgroup.id,
          code: Subgroup.code,
          name: Subgroup.name,
          coa_accounts: Account,
        };
      });

      // Always return MainGroup, even if empty
      return {
        id: MainGroup.id,
        code: MainGroup.code,
        name: MainGroup.name,
        non_depreciation_sub_groups: Subgroup,
      };
    });

    // Get Liabilities (MainGroup type = 'Liability')
    const liabilityMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Liability" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      ...journalExcludeVouchers,
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    // Process Liabilities
    const liabilities = liabilityMainGroups.map((MainGroup) => {
      const Subgroup = MainGroup.Subgroup.map((Subgroup) => {
        const Account = Subgroup.Account.map((account) => {
          const accountType = MainGroup.type.toLowerCase();
          const normalizedType = accountType;

          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const VoucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const VoucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;

          const totalDebit = journalDebit + VoucherDebit;
          const totalCredit = journalCredit + VoucherCredit;

          // Calculate balance using proper accounting logic
          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            MainGroup.type,
          );

          return {
            id: account.id,
            code: account.code,
            name: account.name,
            balance: {
              balance: balance,
            },
          };
        }); // Include all Account, even with zero balance

        return {
          id: Subgroup.id,
          code: Subgroup.code,
          name: Subgroup.name,
          coa_accounts: Account,
        };
      });

      return {
        id: MainGroup.id,
        code: MainGroup.code,
        name: MainGroup.name,
        coa_sub_groups: Subgroup,
      };
    });

    // Get Capital (MainGroup type = 'Equity')
    const capitalMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Equity" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      entryNo: { notIn: voucherNumbers },
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
          orderBy: { code: "asc" },
        },
      },
      orderBy: { code: "asc" },
    });

    // Process Capital
    const capital = capitalMainGroups.map((MainGroup) => {
      const Subgroup = MainGroup.Subgroup.map((Subgroup) => {
        const Account = Subgroup.Account.map((account) => {
          const accountType = MainGroup.type.toLowerCase();
          const normalizedType = accountType;

          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const VoucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const VoucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;

          const totalDebit = journalDebit + VoucherDebit;
          const totalCredit = journalCredit + VoucherCredit;

          // Calculate balance using proper accounting logic
          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            MainGroup.type,
          );

          return {
            id: account.id,
            code: account.code,
            name: account.name,
            balance: {
              balance: balance,
            },
          };
        }); // Include all Account, even with zero balance

        return {
          id: Subgroup.id,
          code: Subgroup.code,
          name: Subgroup.name,
          coa_accounts: Account,
        };
      });

      return {
        id: MainGroup.id,
        code: MainGroup.code,
        name: MainGroup.name,
        coa_sub_groups: Subgroup,
      };
    });

    // Calculate Net Income from Revenue, Expense, and Cost
    // Get Revenue Account
    const revenueMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Revenue" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      ...journalExcludeVouchers,
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let revenueSum = 0;
    revenueMainGroups.forEach((MainGroup) => {
      MainGroup.Subgroup.forEach((Subgroup) => {
        Subgroup.Account.forEach((account) => {
          const accountType = "revenue";
          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const VoucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const VoucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;

          const totalDebit = journalDebit + VoucherDebit;
          const totalCredit = journalCredit + VoucherCredit;

          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            "revenue",
          );

          // For revenue, positive balance means credit (increase), negative means debit (decrease/refund)
          revenueSum += balance;
        });
      });
    });

    // Get Expense Account
    const expenseMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Expense" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      ...journalExcludeVouchers,
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let expenseTotalSum = 0;
    expenseMainGroups.forEach((expenseMainGroup) => {
      expenseMainGroup.Subgroup.forEach((subgroup) => {
        subgroup.Account.forEach((account) => {
          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const voucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const voucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;
          const totalDebit = journalDebit + voucherDebit;
          const totalCredit = journalCredit + voucherCredit;

          // Expense balance: openingBalance + (debit - credit)
          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            "expense",
          );
          expenseTotalSum += balance;
        });
      });
    });

    // Get Cost Account
    const costMainGroups = await prisma.mainGroup.findMany({
      where: { type: "Cost" },
      include: {
        Subgroup: {
          where: { isActive: true },
          include: {
            Account: {
              include: {
                JournalLine: {
                  where: {
                    JournalEntry: {
                      status: "posted",
                      ...journalExcludeVouchers,
                      entryDate: { lte: asOfDate },
                    },
                  },
                },
                VoucherEntry: {
                  where: {
                    Voucher: {
                      status: "posted",
                      date: { lte: asOfDate },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    let costTotalSum = 0;
    costMainGroups.forEach((costMainGroup) => {
      costMainGroup.Subgroup.forEach((subgroup) => {
        subgroup.Account.forEach((account) => {
          const journalDebit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.debit || 0),
              0,
            ) || 0;
          const journalCredit =
            account.JournalLine?.reduce(
              (sum: number, line: any) => sum + (line.credit || 0),
              0,
            ) || 0;
          const voucherDebit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.debit || 0),
              0,
            ) || 0;
          const voucherCredit =
            account.VoucherEntry?.reduce(
              (sum: number, entry: any) => sum + (entry.credit || 0),
              0,
            ) || 0;
          const totalDebit = journalDebit + voucherDebit;
          const totalCredit = journalCredit + voucherCredit;

          // Cost balance: openingBalance + (debit - credit)
          const balance = calculateAccountBalance(
            account.openingBalance || 0,
            totalDebit,
            totalCredit,
            "cost",
          );
          costTotalSum += balance;
        });
      });
    });

    // Calculate Net Income: Revenue - Expense - Cost
    const netIncome = revenueSum - expenseTotalSum - costTotalSum;

    console.log(
      "Balance Sheet Response - Assets:",
      assets.length,
      "Liabilities:",
      liabilities.length,
      "Capital:",
      capital.length,
    );

    // Debug first asset main group in detail
    if (assets.length > 0) {
      const firstAsset = assets[0];
      console.log("First Asset MainGroup:", {
        id: firstAsset.id,
        code: firstAsset.code,
        name: firstAsset.name,
        subgroupsCount: firstAsset.non_depreciation_sub_groups?.length || 0,
        subgroups: firstAsset.non_depreciation_sub_groups
      });

      if (firstAsset.non_depreciation_sub_groups && firstAsset.non_depreciation_sub_groups.length > 0) {
        const firstSubgroup = firstAsset.non_depreciation_sub_groups[0];
        console.log("First Asset Subgroup:", {
          id: firstSubgroup.id,
          code: firstSubgroup.code,
          name: firstSubgroup.name,
          accountsCount: firstSubgroup.coa_accounts?.length || 0,
          accounts: firstSubgroup.coa_accounts
        });
      }
    }

    // Serialize the response properly to handle Prisma objects
    const responseData = {
      assets: JSON.parse(JSON.stringify(assets)),
      liabilities: JSON.parse(JSON.stringify(liabilities)),
      capital: JSON.parse(JSON.stringify(capital)),
      revExp: netIncome,
      revenue: revenueSum,
      expense: expenseTotalSum,
      cost: costTotalSum,
    };

    console.log("Final Response Data:", JSON.stringify(responseData, null, 2));

    res.json({
      data: responseData,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Failed to fetch balance sheet",
      message: error.message || "Unknown error",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

export default router;
