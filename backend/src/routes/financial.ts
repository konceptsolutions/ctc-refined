import { Router, Request, Response } from "express";
import prisma from "../config/database";

const router = Router();

function voucherNumberSortKey(voucherNo: string): number {
  const match = String(voucherNo || "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/** Keep all lines of one voucher together: date → voucher no → line order. */
function compareLedgerVoucherEntries(
  a: { entryDate: Date | string; entryNo: string; sortOrder: number },
  b: { entryDate: Date | string; entryNo: string; sortOrder: number },
): number {
  const timeA = new Date(a.entryDate).getTime();
  const timeB = new Date(b.entryDate).getTime();
  if (timeA !== timeB) return timeA - timeB;

  const vA = voucherNumberSortKey(a.entryNo);
  const vB = voucherNumberSortKey(b.entryNo);
  if (vA !== vB) return vA - vB;

  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
}

// Helper function to format date
const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

// Get General Journal Entries (From Vouchers)
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

    // Filter for Voucher Entries
    const where: any = {
      Voucher: {
        status: "posted",
        OR: [
          { isCleared: null },
          { isCleared: { not: 0 } }
        ]
      },
    };

    // Date filter
    const dateFilter: any = {};
    if (from_date) {
      dateFilter.gte = new Date(from_date as string);
    }
    if (to_date) {
      const toDateObj = new Date(to_date as string);
      toDateObj.setHours(23, 59, 59, 999);
      dateFilter.lte = toDateObj;
    }
    if (from_date || to_date) {
      if (!where.Voucher) where.Voucher = {};
      where.Voucher.date = dateFilter;
    }

    // Search filter
    if (search && search_by) {
      const searchValue = search as string;
      if (search_by === "voucher") {
        if (!where.Voucher) where.Voucher = {};
        where.Voucher.voucherNumber = {
          contains: searchValue,
          mode: "insensitive",
        };
      } else if (search_by === "account") {
        where.Account = {
          OR: [
            { code: { contains: searchValue, mode: "insensitive" } },
            { name: { contains: searchValue, mode: "insensitive" } },
          ],
        };
      } else if (search_by === "description") {
        if (!where.Voucher) where.Voucher = {};
        where.OR = [
          { description: { contains: searchValue, mode: "insensitive" } },
          {
            Voucher: {
              ...(where.Voucher || {}), // Keep existing voucher filters
              narration: { contains: searchValue, mode: "insensitive" },
            },
          },
        ];
      }
    }

    // Get Voucher Entries with related data
    const voucherEntries = await prisma.voucherEntry.findMany({
      where,
      include: {
        Voucher: true,
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
      orderBy: [{ Voucher: { date: "desc" } }, { sortOrder: "asc" }],
    });

    // Transform to match frontend format
    const entries = voucherEntries.map((entry: any, index: number) => {
      // Generate a unique tId
      let tId = index + 1;
      if (entry.id) {
        // Try to extract a number from hash
        const idStr = entry.id.replace(/-/g, "");
        const numPart = parseInt(idStr.slice(0, 8), 16);
        tId = numPart % 100000;
      }

      return {
        id: entry.id || `entry-${index}`,
        tId: tId,
        voucherNo: entry.Voucher?.voucherNumber || "N/A",
        date: entry.Voucher ? formatDate(entry.Voucher.date) : "",
        account: entry.Account
          ? `${entry.Account.code}-${entry.Account.name}`
          : "N/A",
        description: entry.description || entry.Voucher?.narration || "",
        debit: entry.debit || 0,
        credit: entry.credit || 0,
      };
    });

    // Apply client-side filters if needed (e.g. description search sometimes needs more fuzzy match?)
    let filteredEntries = entries;
    // (Search logic already handled in query 'where' clause, no client-side filter needed unless complicated)

    // Pagination
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedEntries = filteredEntries.slice(startIndex, endIndex);

    res.json({
      data: paginatedEntries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredEntries.length,
        totalPages: Math.ceil(filteredEntries.length / limitNum),
      },
    });
  } catch (error: any) {
    console.error("General Journal Error:", error);
    res
      .status(500)
      .json({
        error: error.message || "Failed to fetch general journal entries",
      });
  }
});

// Helper functions for accounting calculations (same as accounting.ts)
function isDebitNormal(accountType: string): boolean {
  const type = accountType.toLowerCase();
  return type === "asset" || type === "expense" || type === "cost";
}

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

// Get Trial Balance
router.get("/trial-balance", async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    // (Code removed: removed postedVouchers exclusion logic as we now ignore JournalLine completely)

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

    // Query accounts from database
    const accounts = await prisma.account.findMany({
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
              ...(from_date || to_date
                ? {
                  date: {
                    ...(from_date && { gte: new Date(from_date as string) }),
                    ...(to_date && { lte: new Date(to_date as string) }),
                  },
                }
                : {}),
            },
          },
        },
      },
      orderBy: [
        { Subgroup: { MainGroup: { displayOrder: "asc" } } },
        { Subgroup: { code: "asc" } },
        { code: "asc" },
      ],
    });

    // Calculate trial balance using proper accounting logic
    const trialBalance: any[] = [];

    // Group by main group, subgroup, and account
    const mainGroups = new Map();
    const subgroups = new Map();
    let currentMainGroupId: string | null = null;
    let currentSubgroupId: string | null = null;

    accounts.forEach((account: any) => {
      const mainGroup = account.Subgroup.MainGroup;
      const subgroup = account.Subgroup;
      const accountType = mainGroup.type;

      // Calculate totals from voucher entries ONLY

      const totalDebit =
        account.VoucherEntry?.reduce(
          (sum: number, entry: any) => sum + (entry.debit || 0),
          0,
        ) || 0;
      const totalCredit =
        account.VoucherEntry?.reduce(
          (sum: number, entry: any) => sum + (entry.credit || 0),
          0,
        ) || 0;

      // Calculate balance using proper accounting logic (INCLUDING opening balance)
      const balance = calculateAccountBalance(
        account.openingBalance || 0,
        totalDebit,
        totalCredit,
        accountType,
      );

      // Get trial balance amounts (debit/credit columns)
      const { debit, credit } = getTrialBalanceAmounts(balance, accountType);

      // Add main group header if changed
      if (currentMainGroupId !== mainGroup.id) {
        currentMainGroupId = mainGroup.id;
        if (!mainGroups.has(mainGroup.id)) {
          mainGroups.set(mainGroup.id, {
            code: mainGroup.code,
            name: mainGroup.name,
            debit: 0,
            credit: 0,
            isSubgroup: true,
            level: 0,
          });
          trialBalance.push({
            code: mainGroup.code,
            name: mainGroup.name,
            debit: 0,
            credit: 0,
            isSubgroup: true,
            level: 0,
          });
        }
      }

      // Add subgroup header if changed
      if (currentSubgroupId !== subgroup.id) {
        currentSubgroupId = subgroup.id;
        if (!subgroups.has(subgroup.id)) {
          subgroups.set(subgroup.id, {
            code: subgroup.code,
            name: subgroup.name,
            debit: 0,
            credit: 0,
            isSubgroup: true,
            level: 0,
          });
          trialBalance.push({
            code: subgroup.code,
            name: subgroup.name,
            debit: 0,
            credit: 0,
            isSubgroup: true,
            level: 0,
          });
        }
      }

      // Add account entry with proper debit/credit amounts
      trialBalance.push({
        code: account.code,
        name: account.name,
        debit: debit,
        credit: credit,
        isSubgroup: false,
        level: 1,
      });

      // Update subgroup totals
      const subgroupEntry = subgroups.get(subgroup.id);
      if (subgroupEntry) {
        subgroupEntry.debit += debit;
        subgroupEntry.credit += credit;
      }

      // Update main group totals
      const mainGroupEntry = mainGroups.get(mainGroup.id);
      if (mainGroupEntry) {
        mainGroupEntry.debit += debit;
        mainGroupEntry.credit += credit;
      }
    });

    // Update subgroup and main group entries in the array with calculated totals
    trialBalance.forEach((entry, index) => {
      if (entry.isSubgroup && entry.level === 0) {
        // Check if it's a subgroup first
        const subgroupEntry = Array.from(subgroups.values()).find(
          (sg) => sg.code === entry.code && sg.name === entry.name,
        );
        if (subgroupEntry) {
          trialBalance[index].debit = subgroupEntry.debit;
          trialBalance[index].credit = subgroupEntry.credit;
        } else {
          // Otherwise it's a main group
          const mainGroupEntry = Array.from(mainGroups.values()).find(
            (mg) => mg.code === entry.code && mg.name === entry.name,
          );
          if (mainGroupEntry) {
            trialBalance[index].debit = mainGroupEntry.debit;
            trialBalance[index].credit = mainGroupEntry.credit;
          }
        }
      }
    });

    res.json({ data: trialBalance });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch trial balance" });
  }
});

// Public Income Statement (for testing without authentication)
router.get("/public-income-statement", async (req: Request, res: Response) => {
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

    // Define common include for accounts (VoucherEntry only)
    const commonInclude = {
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

    // Query revenue accounts - use MainGroup type "Income"
    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Income", "income", "INCOME", "Revenue", "revenue", "REVENUE"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query cost accounts - use MainGroup name "Cost of Sales"
    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            name: { in: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query expense accounts - exclude Cost and Cost of Sales main groups
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["expense", "Expense", "EXPENSE"] },
            name: { notIn: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Helper to calculate period movement (Income statement is period-based)
    const calculatePeriodAmount = (acc: any, type: "revenue" | "expense") => {
      const totalDebit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.debit || 0),
        0,
      );
      const totalCredit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.credit || 0),
        0,
      );

      if (type === "revenue") {
        return totalCredit - totalDebit;
      } else {
        return totalDebit - totalCredit;
      }
    };

    // Calculate amounts
    const revenue = revenueAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "revenue"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const cost = costAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const expenses = expenseAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
    const totalCost = cost.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);

    res.json({
      revenue,
      cost,
      expenses,
      summary: {
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        totalExpenses,
        netProfit: totalRevenue - totalCost - totalExpenses,
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch income statement" });
  }
});

// Get Income Statement
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

    // (Removed postedVouchers fetching logic)
    // Define common include for accounts (VoucherEntry only)
    const commonInclude = {
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
      // Removed JournalLine
    };

    // Query revenue accounts - use MainGroup type "Income"
    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["Income", "income", "INCOME", "Revenue", "revenue", "REVENUE"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query cost accounts - use MainGroup name "Cost of Sales"
    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            name: { in: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query expense accounts - exclude Cost and Cost of Sales main groups
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["expense", "Expense", "EXPENSE"] },
            name: { notIn: ["Cost", "Cost of Sales"] },
          },
        },
      },
      include: commonInclude,
    });

    // Helper to calculate period movement (Income statement is period-based)
    const calculatePeriodAmount = (acc: any, type: "revenue" | "expense") => {
      const totalDebit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.debit || 0),
        0,
      );
      const totalCredit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.credit || 0),
        0,
      );

      if (type === "revenue") {
        return totalCredit - totalDebit;
      } else {
        return totalDebit - totalCredit;
      }
    };

    // Calculate amounts
    const revenue = revenueAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "revenue"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const cost = costAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const expenses = expenseAccounts
      .map((acc) => ({
        code: acc.code,
        name: acc.name,
        amount: calculatePeriodAmount(acc, "expense"),
        level: 0,
      }))
      .filter((a) => a.amount !== 0);

    const totalRevenue = revenue.reduce((sum, item) => sum + item.amount, 0);
    const totalCost = cost.reduce((sum, item) => sum + item.amount, 0);
    const totalExpenses = expenses.reduce((sum, item) => sum + item.amount, 0);

    res.json({
      revenue,
      cost,
      expenses,
      summary: {
        totalRevenue,
        totalCost,
        grossProfit: totalRevenue - totalCost,
        totalExpenses,
        netProfit: totalRevenue - totalCost - totalExpenses,
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch income statement" });
  }
});

// Get Ledgers
router.get("/ledgers", async (req: Request, res: Response) => {
  try {
    const {
      main_group,
      sub_group,
      account,
      from_date,
      to_date,
      page = "1",
      limit = "10",
    } = req.query;

    // Prepare Date Objects
    // Ensure to_date covers the entire day
    let fromDateObj: Date | undefined;
    let toDateObj: Date | undefined;

    if (from_date) {
      fromDateObj = new Date(from_date as string);
    }
    if (to_date) {
      toDateObj = new Date(to_date as string);
      toDateObj.setHours(23, 59, 59, 999);
    }

    // Build where clause for account filter
    const accountWhere: any = {};
    if (main_group) {
      accountWhere.Subgroup = {
        MainGroup: { id: main_group as string },
      };
    }
    if (sub_group) {
      accountWhere.Subgroup = {
        ...accountWhere.Subgroup,
        id: sub_group as string,
      };
    }
    if (account) {
      accountWhere.id = account as string;
    }

    // Get accounts first
    const accounts = await prisma.account.findMany({
      where: accountWhere,
      include: {
        Subgroup: {
          include: {
            MainGroup: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    // Helper function to calculate balance change based on account type
    const calculateBalanceChange = (
      debit: number,
      credit: number,
      accountType: string,
    ) => {
      // Assets, Expenses, Cost: Normal balance is DEBIT (increase with debit, decrease with credit)
      // Liabilities, Equity, Revenue: Normal balance is CREDIT (increase with credit, decrease with debit)
      if (["asset", "expense", "cost"].includes(accountType.toLowerCase())) {
        return debit - credit;
      } else {
        return credit - debit;
      }
    };

    // Helper function to format date as DD/MM/YYYY
    const formatDate = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    const ledgerEntries: any[] = [];
    let tIdCounter = 1;

    for (const acc of accounts) {
      const accountType = (acc as any).Subgroup?.MainGroup?.type || "asset";

      // 1. Calculate Opening Balance (Static + Transactions before from_date)
      let runningBalance = acc.openingBalance || 0;

      if (fromDateObj) {
        // Fetch transactions BEFORE from_date (Voucher Only)
        const priorVoucherEntries = await prisma.voucherEntry.findMany({
          where: {
            accountId: acc.id,
            Voucher: {
              status: "posted",
              OR: [
                { isCleared: null },
                { isCleared: { not: 0 } }
              ],
              date: { lt: fromDateObj },
            },
          },
        });

        const priorDebit = priorVoucherEntries.reduce(
          (sum, e) => sum + (e.debit || 0),
          0,
        );

        const priorCredit = priorVoucherEntries.reduce(
          (sum, e) => sum + (e.credit || 0),
          0,
        );

        runningBalance += calculateBalanceChange(
          priorDebit,
          priorCredit,
          accountType,
        );
      }

      // Add Opening Balance Row if filtered by specific account
      if (account) {
        ledgerEntries.push({
          id: `opening-balance-${acc.id}`,
          tId: null,
          voucherNo: "-",
          timeStamp: from_date
            ? formatDate(new Date(from_date as string))
            : "-",
          description: "Opening Balance",
          debit: null,
          credit: null,
          balance: runningBalance,
        });
      }

      // 2. Fetch Transactions WITHIN Date Range (Voucher Only)
      const dateFilter: any = {};
      if (fromDateObj) dateFilter.gte = fromDateObj;
      if (toDateObj) dateFilter.lte = toDateObj;

      // Voucher Entries within range
      const voucherEntries = await prisma.voucherEntry.findMany({
        where: {
          accountId: acc.id,
          Voucher: {
            status: "posted",
            OR: [
              { isCleared: null },
              { isCleared: { not: 0 } }
            ],
            ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
          },
        },
        include: { Voucher: true },
        orderBy: [
          { Voucher: { date: "asc" } },
          { sortOrder: "asc" },
        ],
      });

      const allEntries = voucherEntries.map((entry: any) => ({
        type: "voucher",
        entryDate: entry.Voucher.date,
        entryNo: entry.Voucher.voucherNumber,
        description: entry.description || entry.Voucher.narration || "",
        debit: entry.debit,
        credit: entry.credit,
        sortOrder: entry.sortOrder ?? 0,
        id: entry.id,
      }));

      allEntries.sort(compareLedgerVoucherEntries);

      // 3. Process entries and calculate running balance
      for (const entry of allEntries) {
        const debit = entry.debit || 0;
        const credit = entry.credit || 0;

        runningBalance += calculateBalanceChange(debit, credit, accountType);

        ledgerEntries.push({
          id: entry.id,
          tId: tIdCounter++,
          voucherNo: entry.entryNo,
          timeStamp: formatDate(new Date(entry.entryDate)),
          description: entry.description,
          debit: debit > 0 ? debit : null,
          credit: credit > 0 ? credit : null,
          balance: runningBalance,
        });
      }
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedLedger = ledgerEntries.slice(startIndex, endIndex);

    res.json({
      data: paginatedLedger,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: ledgerEntries.length,
        totalPages: Math.ceil(ledgerEntries.length / limitNum),
      },
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ error: error.message || "Failed to fetch ledger entries" });
  }
});

// Get Account Groups (for dropdowns)
router.get("/account-groups", async (req: Request, res: Response) => {
  try {
    // Query from database
    const mainGroups = await prisma.mainGroup.findMany({
      orderBy: { displayOrder: "asc" },
    });

    const subGroups = await prisma.subgroup.findMany({
      include: { MainGroup: true },
      orderBy: { code: "asc" },
    });

    const accounts = await prisma.account.findMany({
      include: { Subgroup: true },
      orderBy: { code: "asc" },
    });

    res.json({
      data: {
        mainGroups: mainGroups.map((mg) => ({
          id: mg.id,
          name: `${mg.code}-${mg.name}`,
        })),
        subGroups: subGroups.map((sg: any) => ({
          id: sg.id,
          name: `${sg.code}-${sg.name}`,
          mainGroup: sg.MainGroup.id,
        })),
        accounts: accounts.map((acc: any) => ({
          id: acc.id,
          name: `${acc.code}-${acc.name}`,
          subGroup: acc.Subgroup.id,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch account groups" });
  }
});

// International supplier linked accounts (for International Supplier Ledger dropdown)
router.get("/international-supplier-accounts", async (_req: Request, res: Response) => {
  try {
    const accounts = await prisma.account.findMany({
      where: {
        OR: [
          {
            supplierId: { not: null },
            Supplier: { type: "international" },
          },
          {
            Subgroup: { code: "402" },
          },
        ],
      },
      include: {
        Subgroup: {
          select: { code: true, name: true },
        },
        Supplier: {
          select: {
            id: true,
            companyName: true,
            name: true,
            code: true,
            currencyName: true,
            type: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    res.json({
      data: accounts.map((acc: any) => ({
        id: acc.id,
        name: `${acc.code}-${acc.name}`,
        code: acc.code,
        supplierId: acc.supplierId,
        supplierName:
          acc.Supplier?.companyName ||
          acc.Supplier?.name ||
          (acc.Subgroup?.code === "402" ? "Supplier Security" : acc.name),
        currencyName: acc.Supplier?.currencyName || "USD",
        accountCategory:
          acc.Subgroup?.code === "402"
            ? "supplier_security"
            : "supplier_payable",
      })),
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to fetch international supplier accounts",
    });
  }
});

// International supplier ledger (same as ledgers, plus FC amounts from voucher conversionRate)
router.get("/international-supplier-ledgers", async (req: Request, res: Response) => {
  try {
    const {
      account,
      from_date,
      to_date,
      page = "1",
      limit = "10000",
    } = req.query;

    if (!account || !String(account).trim()) {
      return res.status(400).json({ error: "Account is required" });
    }

    let fromDateObj: Date | undefined;
    let toDateObj: Date | undefined;

    if (from_date) {
      fromDateObj = new Date(from_date as string);
    }
    if (to_date) {
      toDateObj = new Date(to_date as string);
      toDateObj.setHours(23, 59, 59, 999);
    }

    const acc = await prisma.account.findFirst({
      where: {
        id: String(account),
        OR: [
          {
            supplierId: { not: null },
            Supplier: { type: "international" },
          },
          {
            Subgroup: { code: "402" },
          },
        ],
      },
      include: {
        Subgroup: { include: { MainGroup: true } },
        Supplier: {
          select: {
            id: true,
            companyName: true,
            name: true,
            currencyName: true,
            type: true,
          },
        },
      },
    });

    if (!acc) {
      return res.status(404).json({
        error: "International supplier or supplier security account not found",
      });
    }

    const accountType = (acc as any).Subgroup?.MainGroup?.type || "asset";
    const currencyName = (acc as any).Supplier?.currencyName || "USD";

    const calculateBalanceChange = (
      debit: number,
      credit: number,
      type: string,
    ) => {
      if (["asset", "expense", "cost"].includes(type.toLowerCase())) {
        return debit - credit;
      }
      return credit - debit;
    };

    const toFc = (amountLc: number, rate: number | null | undefined) => {
      const r = Number(rate);
      if (!Number.isFinite(r) || r <= 0) return amountLc;
      return amountLc / r;
    };

    const formatDate = (date: Date): string => {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };

    let runningBalanceLc = acc.openingBalance || 0;
    // Opening balance is stored in LC; without a historical rate use 1:1 for FC seed.
    let runningBalanceFc = acc.openingBalance || 0;

    if (fromDateObj) {
      const priorVoucherEntries = await prisma.voucherEntry.findMany({
        where: {
          accountId: acc.id,
          Voucher: {
            status: "posted",
            OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
            date: { lt: fromDateObj },
          },
        },
        include: { Voucher: true },
      });

      for (const entry of priorVoucherEntries as any[]) {
        const debit = entry.debit || 0;
        const credit = entry.credit || 0;
        const rate = entry.Voucher?.conversionRate;
        runningBalanceLc += calculateBalanceChange(debit, credit, accountType);
        runningBalanceFc += calculateBalanceChange(
          toFc(debit, rate),
          toFc(credit, rate),
          accountType,
        );
      }
    }

    const ledgerEntries: any[] = [
      {
        id: `opening-balance-${acc.id}`,
        tId: null,
        voucherNo: "-",
        timeStamp: from_date ? formatDate(new Date(from_date as string)) : "-",
        description: "Opening Balance",
        debit: null,
        credit: null,
        balance: runningBalanceLc,
        debitFc: null,
        creditFc: null,
        balanceFc: runningBalanceFc,
        conversionRate: null,
        currencyName,
      },
    ];

    const dateFilter: any = {};
    if (fromDateObj) dateFilter.gte = fromDateObj;
    if (toDateObj) dateFilter.lte = toDateObj;

    const voucherEntries = await prisma.voucherEntry.findMany({
      where: {
        accountId: acc.id,
        Voucher: {
          status: "posted",
          OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
          ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
        },
      },
      include: { Voucher: true },
      orderBy: [{ Voucher: { date: "asc" } }, { sortOrder: "asc" }],
    });

    const allEntries = voucherEntries.map((entry: any) => ({
      entryDate: entry.Voucher.date,
      entryNo: entry.Voucher.voucherNumber,
      description: entry.description || entry.Voucher.narration || "",
      debit: entry.debit || 0,
      credit: entry.credit || 0,
      conversionRate: entry.Voucher?.conversionRate ?? null,
      sortOrder: entry.sortOrder ?? 0,
      id: entry.id,
    }));

    allEntries.sort(compareLedgerVoucherEntries);

    let tIdCounter = 1;
    for (const entry of allEntries) {
      const debitLc = entry.debit || 0;
      const creditLc = entry.credit || 0;
      const debitFc = toFc(debitLc, entry.conversionRate);
      const creditFc = toFc(creditLc, entry.conversionRate);

      runningBalanceLc += calculateBalanceChange(debitLc, creditLc, accountType);
      runningBalanceFc += calculateBalanceChange(debitFc, creditFc, accountType);

      ledgerEntries.push({
        id: entry.id,
        tId: tIdCounter++,
        voucherNo: entry.entryNo,
        timeStamp: formatDate(new Date(entry.entryDate)),
        description: entry.description,
        debit: debitLc > 0 ? debitLc : null,
        credit: creditLc > 0 ? creditLc : null,
        balance: runningBalanceLc,
        debitFc: debitLc > 0 ? debitFc : null,
        creditFc: creditLc > 0 ? creditFc : null,
        balanceFc: runningBalanceFc,
        conversionRate: entry.conversionRate,
        currencyName,
      });
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedLedger = ledgerEntries.slice(startIndex, endIndex);

    res.json({
      data: paginatedLedger,
      meta: {
        accountId: acc.id,
        accountName: `${acc.code}-${acc.name}`,
        supplierId: (acc as any).supplierId,
        supplierName:
          (acc as any).Supplier?.companyName ||
          (acc as any).Supplier?.name ||
          acc.name,
        currencyName,
      },
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: ledgerEntries.length,
        totalPages: Math.ceil(ledgerEntries.length / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to fetch international supplier ledger",
    });
  }
});

export default router;
