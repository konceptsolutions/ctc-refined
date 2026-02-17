import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import prisma from "../config/database";

const router = express.Router();

// Expense Types CRUD
router.get("/expense-types", async (req: Request, res: Response) => {
  try {
    const { search, category, status, page = "1", limit = "100" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search as string } },
        { code: { contains: search as string } },
      ];
    }
    if (category && category !== "all") {
      where.category = category;
    }
    if (status && status !== "all") {
      where.status = status;
    }

    // Check if table exists first
    try {
      const [expenseTypes, total] = await Promise.all([
        prisma.expenseType.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: "desc" },
        }),
        prisma.expenseType.count({ where }),
      ]);

      res.json({
        data: expenseTypes,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (tableError: any) {
      if (tableError.message && tableError.message.includes("does not exist")) {
        res.status(500).json({
          error:
            "Database tables not initialized. Please run: npx prisma db push or apply migration.",
        });
      } else {
        throw tableError;
      }
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/expense-types", async (req: Request, res: Response) => {
  try {
    const { name, description, category, budget, status } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Name is required" });
    }

    // Generate robust code
    const lastExpenseType = await prisma.expenseType.findFirst({
      orderBy: { code: "desc" },
    });
    let nextNo = 1;
    if (lastExpenseType) {
      const match = lastExpenseType.code.match(/EXP-(\d+)/);
      if (match) {
        nextNo = parseInt(match[1]) + 1;
      }
    }
    const code = `EXP-${String(nextNo).padStart(3, "0")}`;

    const expenseType = await prisma.expenseType.create({
      data: {
        id: randomUUID(),
        code,
        name,
        description: description || "",
        category: category || "General",
        budget: budget !== undefined ? parseFloat(budget) : 0,
        spent: 0,
        status: status || "Active",
        updatedAt: new Date(),
      },
    });

    res.status(201).json({ data: expenseType });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put("/expense-types/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description, category, budget, status } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (budget !== undefined) updateData.budget = parseFloat(budget);
    if (status !== undefined) updateData.status = status;

    const expenseType = await prisma.expenseType.update({
      where: { id },
      data: updateData,
    });

    res.json({ data: expenseType });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/expense-types/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.expenseType.delete({ where: { id } });
    res.json({ message: "Expense type deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Posted Expenses CRUD
router.get("/posted-expenses", async (req: Request, res: Response) => {
  try {
    const { search, from_date, to_date, page = "1", limit = "100" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (from_date || to_date) {
      where.date = {};
      if (from_date) where.date.gte = new Date(from_date as string);
      if (to_date) where.date.lte = new Date(to_date as string);
    }
    if (search) {
      where.OR = [
        { paidTo: { contains: search as string } },
        { referenceNumber: { contains: search as string } },
      ];
    }

    const [expenses, total] = await Promise.all([
      prisma.postedExpense.findMany({
        where,
        include: { ExpenseType: true },
        skip,
        take: limitNum,
        orderBy: { date: "desc" },
      }),
      prisma.postedExpense.count({ where }),
    ]);

    res.json({
      data: expenses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/posted-expenses", async (req: Request, res: Response) => {
  try {
    const {
      date,
      expense_type_id,
      amount,
      paidTo,
      paymentMode,
      referenceNumber,
      description,
    } = req.body;

    if (!date || !expense_type_id || !amount || !paidTo) {
      return res
        .status(400)
        .json({
          error: "Date, expense type, amount, and paid to are required",
        });
    }

    const expense = await prisma.postedExpense.create({
      data: {
        id: randomUUID(),
        date: new Date(date),
        expenseTypeId: expense_type_id,
        amount: parseFloat(amount),
        paidTo,
        paymentMode: paymentMode || "Cash",
        referenceNumber: referenceNumber || "",
        description: description || "",
      },
      include: { ExpenseType: true },
    });

    // Update expense type spent amount
    await prisma.expenseType.update({
      where: { id: expense_type_id },
      data: {
        spent: { increment: parseFloat(amount) },
      },
    });

    res.status(201).json({ data: expense });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Operational Expenses CRUD
router.get("/operational-expenses", async (req: Request, res: Response) => {
  try {
    const { search, from_date, to_date, page = "1", limit = "100" } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};
    if (from_date || to_date) {
      where.date = {};
      if (from_date) where.date.gte = new Date(from_date as string);
      if (to_date) where.date.lte = new Date(to_date as string);
    }
    if (search) {
      where.OR = [
        { voucherNo: { contains: search as string } },
        { expenseType: { contains: search as string } },
        { paidTo: { contains: search as string } },
      ];
    }

    const [expenses, total] = await Promise.all([
      prisma.operationalExpense.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { date: "desc" },
      }),
      prisma.operationalExpense.count({ where }),
    ]);

    res.json({
      data: expenses,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/operational-expenses", async (req: Request, res: Response) => {
  try {
    const { date, expenseType, paidTo, amount, description } = req.body;

    if (!date || !expenseType || !paidTo || !amount) {
      return res
        .status(400)
        .json({
          error: "Date, expense type, paid to, and amount are required",
        });
    }

    // Generate robust voucher number
    const year = new Date(date).getFullYear();
    const lastOpExpense = await prisma.operationalExpense.findFirst({
      where: {
        voucherNo: {
          startsWith: `EV-${year}-`,
        },
      },
      orderBy: {
        voucherNo: "desc",
      },
    });

    let nextNo = 1;
    if (lastOpExpense) {
      const parts = lastOpExpense.voucherNo.split("-");
      const lastNo = parseInt(parts[2]);
      if (!isNaN(lastNo)) {
        nextNo = lastNo + 1;
      }
    }
    const voucherNo = `EV-${year}-${String(nextNo).padStart(3, "0")}`;

    const expense = await prisma.operationalExpense.create({
      data: {
        id: randomUUID(),
        date: new Date(date),
        voucherNo,
        expenseType,
        paidTo,
        amount: parseFloat(amount),
        description: description || "",
        status: "Pending",
        updatedAt: new Date(),
      },
    });

    res.status(201).json({ data: expense });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/operational-expenses/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const expense = await prisma.operationalExpense.findUnique({
      where: { id },
    });
    if (!expense) {
      return res.status(404).json({ error: "Expense not found" });
    }
    res.json({ data: expense });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expense Statistics
router.get("/statistics", async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    try {
      const [totalExpenses, operationalExpenses, expenseTypes] =
        await Promise.all([
          // Total expenses this month (from posted expenses)
          prisma.postedExpense.aggregate({
            _sum: { amount: true },
            where: {
              date: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          }),
          // Operational expenses count and total
          prisma.operationalExpense.aggregate({
            _sum: { amount: true },
            _count: true,
            where: {
              date: {
                gte: startOfMonth,
                lte: endOfMonth,
              },
            },
          }),
          // Active expense types count
          prisma.expenseType.count({
            where: { status: "Active" },
          }),
        ]);

      res.json({
        data: {
          totalExpenses: totalExpenses._sum.amount || 0,
          operationalExpenses: operationalExpenses._sum.amount || 0,
          operationalExpensesCount: operationalExpenses._count || 0,
          expenseTypesCount: expenseTypes,
        },
      });
    } catch (tableError: any) {
      if (tableError.message && tableError.message.includes("does not exist")) {
        res.status(500).json({
          error:
            "Database tables not initialized. Please run: npx prisma db push or apply migration.",
          data: {
            totalExpenses: 0,
            operationalExpenses: 0,
            operationalExpensesCount: 0,
            expenseTypesCount: 0,
          },
        });
      } else {
        throw tableError;
      }
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
