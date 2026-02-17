import { Router, Request, Response } from "express";
import prisma from "../config/database";

const router = Router();

// Helper function to format date
const formatDate = (date: Date): string => {
  return date.toISOString().split("T")[0];
};

// Get General Journal Entries
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

    // Query journal entries from database
    const where: any = {};

    // Date filter
    if (from_date || to_date) {
      where.JournalEntry = {
        ...(from_date && { entryDate: { gte: new Date(from_date as string) } }),
        ...(to_date && { entryDate: { lte: new Date(to_date as string) } }),
      };
    }

    // Search filter
    if (search && search_by) {
      const searchValue = search as string;
      if (search_by === "voucher") {
        where.JournalEntry = {
          ...where.JournalEntry,
          entryNo: { contains: searchValue, mode: "insensitive" },
        };
      } else if (search_by === "account") {
        where.Account = {
          OR: [
            { code: { contains: searchValue, mode: "insensitive" } },
            { name: { contains: searchValue, mode: "insensitive" } },
          ],
        };
      } else if (search_by === "description") {
        where.OR = [
          { description: { contains: searchValue, mode: "insensitive" } },
          {
            JournalEntry: {
              description: { contains: searchValue, mode: "insensitive" },
            },
          },
        ];
      }
    }

    // Build proper where clause - ensure we only get posted entries
    const lineWhere: any = {
      JournalEntry: {
        status: "posted",
        ...(from_date || to_date
          ? {
            entryDate: {
              ...(from_date && { gte: new Date(from_date as string) }),
              ...(to_date && {
                lte: (() => {
                  const toDate = new Date(to_date as string);
                  toDate.setHours(23, 59, 59, 999);
                  return toDate;
                })(),
              }),
            },
          }
          : {}),
        ...(search && search_by === "voucher"
          ? {
            entryNo: { contains: search as string, mode: "insensitive" },
          }
          : {}),
      },
    };

    // Add account search if needed
    if (search && search_by === "account") {
      lineWhere.Account = {
        OR: [
          { code: { contains: search as string, mode: "insensitive" } },
          { name: { contains: search as string, mode: "insensitive" } },
        ],
      };
    }

    // Add description search if needed
    if (search && search_by === "description") {
      lineWhere.OR = [
        { description: { contains: search as string, mode: "insensitive" } },
        {
          JournalEntry: {
            description: { contains: search as string, mode: "insensitive" },
          },
        },
      ];
    }

    // Get journal lines with related data
    const journalLines = await prisma.journalLine.findMany({
      where: lineWhere,
      include: {
        JournalEntry: true,
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
      orderBy: [{ JournalEntry: { entryDate: "desc" } }, { lineOrder: "asc" }],
    });

    // Transform to match frontend format
    const entries = journalLines.map((line: any, index: number) => {
      // Generate a unique tId from the line ID or use index
      let tId = index + 1;
      if (line.id) {
        // Try to extract a number from the UUID or use a hash
        const idStr = line.id.replace(/-/g, "");
        const numPart = parseInt(idStr.slice(0, 8), 16);
        tId = numPart % 100000; // Keep it reasonable
      }

      return {
        id: line.id || `line-${index}`,
        tId: tId,
        voucherNo: line.JournalEntry?.entryNo || "N/A",
        date: line.JournalEntry ? formatDate(line.JournalEntry.entryDate) : "",
        account: line.Account
          ? `${line.Account.code}-${line.Account.name}`
          : "N/A",
        description: line.description || line.JournalEntry?.description || "",
        debit: line.debit || 0,
        credit: line.credit || 0,
      };
    });

    // Apply client-side filters (for search that wasn't handled in query)
    let filteredEntries = entries;
    if (search && search_by === "description") {
      const searchLower = (search as string).toLowerCase();
      filteredEntries = filteredEntries.filter((e: any) =>
        e.description.toLowerCase().includes(searchLower),
      );
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
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
    res.status(500).json({ error: error.message || "Failed to fetch general journal entries" });
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

    // Get all posted voucher numbers to avoid double counting
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
              ...(from_date && {
                date: { gte: new Date(from_date as string) },
              }),
              ...(to_date && { date: { lte: new Date(to_date as string) } }),
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

      // Calculate totals from journal lines and voucher entries
      const journalDebit = account.JournalLine.reduce(
        (sum: number, line: any) => sum + (line.debit || 0),
        0,
      );
      const journalCredit = account.JournalLine.reduce(
        (sum: number, line: any) => sum + (line.credit || 0),
        0,
      );
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

    // Get all posted voucher numbers to avoid double counting
    const postedVouchers = await prisma.voucher.findMany({
      where: {
        status: "posted",
        ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
      },
      select: {
        voucherNumber: true,
      },
    });
    const voucherNumbers = postedVouchers.map((v) => v.voucherNumber);
    const journalExcludeVouchers =
      voucherNumbers.length > 0 ? { entryNo: { notIn: voucherNumbers } } : {};

    const commonInclude = {
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

    // Query revenue accounts
    const revenueAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["revenue", "Revenue", "REVENUE"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query cost accounts
    const costAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["cost", "Cost", "COST", "cogs", "COGS"] },
          },
        },
      },
      include: commonInclude,
    });

    // Query expense accounts
    const expenseAccounts = await prisma.account.findMany({
      where: {
        Subgroup: {
          MainGroup: {
            type: { in: ["expense", "Expense", "EXPENSE"] },
          },
        },
      },
      include: commonInclude,
    });

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

      const voucherDebit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.debit || 0),
        0,
      );
      const voucherCredit = acc.VoucherEntry.reduce(
        (sum: number, entry: any) => sum + (entry.credit || 0),
        0,
      );

      const totalDebit = journalDebit + voucherDebit;
      const totalCredit = journalCredit + voucherCredit;

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

    // Get all posted voucher numbers to filter out journal entries that have corresponding vouchers
    const postedVouchers = await prisma.voucher.findMany({
      where: { status: "posted" },
      select: { voucherNumber: true },
    });
    const voucherNumbers = new Set(postedVouchers.map((v) => v.voucherNumber));

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
        // Fetch transactions BEFORE from_date
        const priorJournalLines = await prisma.journalLine.findMany({
          where: {
            accountId: acc.id,
            JournalEntry: {
              status: "posted",
              entryNo: { notIn: Array.from(voucherNumbers) },
              entryDate: { lt: fromDateObj },
            },
          },
        });

        const priorVoucherEntries = await prisma.voucherEntry.findMany({
          where: {
            accountId: acc.id,
            Voucher: {
              status: "posted",
              date: { lt: fromDateObj },
            },
          },
        });

        const priorDebit =
          priorJournalLines.reduce((sum, l) => sum + (l.debit || 0), 0) +
          priorVoucherEntries.reduce((sum, e) => sum + (e.debit || 0), 0);

        const priorCredit =
          priorJournalLines.reduce((sum, l) => sum + (l.credit || 0), 0) +
          priorVoucherEntries.reduce((sum, e) => sum + (e.credit || 0), 0);

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

      // 2. Fetch Transactions WITHIN Date Range
      const dateFilter: any = {};
      if (fromDateObj) dateFilter.gte = fromDateObj;
      if (toDateObj) dateFilter.lte = toDateObj;

      // Journal Lines within range
      const journalLines = await prisma.journalLine.findMany({
        where: {
          accountId: acc.id,
          JournalEntry: {
            status: "posted",
            entryNo: { notIn: Array.from(voucherNumbers) },
            ...(fromDateObj || toDateObj ? { entryDate: dateFilter } : {}),
          },
        },
        include: { JournalEntry: true },
      });

      // Voucher Entries within range
      const voucherEntries = await prisma.voucherEntry.findMany({
        where: {
          accountId: acc.id,
          Voucher: {
            status: "posted",
            ...(fromDateObj || toDateObj ? { date: dateFilter } : {}),
          },
        },
        include: { Voucher: true },
      });

      // Combine and Sort
      const allEntries = [
        ...journalLines.map((line: any) => ({
          type: "journal",
          entryDate: line.JournalEntry.entryDate,
          entryNo: line.JournalEntry.entryNo,
          description: line.description || line.JournalEntry.description || "",
          debit: line.debit,
          credit: line.credit,
          id: line.id,
        })),
        ...voucherEntries.map((entry: any) => ({
          type: "voucher",
          entryDate: entry.Voucher.date,
          entryNo: entry.Voucher.voucherNumber,
          description: entry.description || entry.Voucher.narration || "",
          debit: entry.debit,
          credit: entry.credit,
          id: entry.id,
        })),
      ].sort((a, b) => {
        const dateDiff =
          new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime();
        return dateDiff !== 0 ? dateDiff : a.entryNo.localeCompare(b.entryNo);
      });

      // 3. Generate Ledger Rows
      allEntries.forEach((entry) => {
        const balanceChange = calculateBalanceChange(
          entry.debit,
          entry.credit,
          accountType,
        );
        runningBalance += balanceChange;

        ledgerEntries.push({
          id: `entry-${entry.type}-${entry.id}`,
          tId: tIdCounter++,
          voucherNo: entry.entryNo,
          timeStamp: formatDate(new Date(entry.entryDate)),
          description: entry.description,
          debit: entry.debit > 0 ? entry.debit : null,
          credit: entry.credit > 0 ? entry.credit : null,
          balance: runningBalance,
        });
      });
    }

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const endIndex = startIndex + limitNum;
    const paginatedEntries = ledgerEntries.slice(startIndex, endIndex);

    res.json({
      data: paginatedEntries,
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

export default router;
