import express, { Request, Response } from 'express';
import prisma from '../config/database';

const router = express.Router();

/** Counts as a sale in reports — excludes pending, on hold, cancelled */
const SALES_REPORT_INVOICE_STATUSES = [
  'approved',
  'partially_delivered',
  'fully_delivered',
  'delivered',
  'return',
  'partially_return',
  'completed',
];

async function buildCustomerSalesInvoiceWhere(params: {
  from_date: string;
  to_date: string;
  customer_type: string;
  customer_id?: string;
  customer_name?: string;
}) {
  const fromDate = new Date(params.from_date);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = new Date(params.to_date);
  toDate.setHours(23, 59, 59, 999);

  const type = String(params.customer_type).toLowerCase();
  const where: any = {
    invoiceDate: { gte: fromDate, lte: toDate },
    status: { in: SALES_REPORT_INVOICE_STATUSES },
    customerType: type,
    NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
  };

  let resolvedCustomerName = '';

  if (type === 'registered' && params.customer_id) {
    const customer = await prisma.customer.findUnique({
      where: { id: String(params.customer_id) },
      select: { name: true },
    });
    resolvedCustomerName = customer?.name?.trim() || '';
    const customerId = String(params.customer_id);
    if (resolvedCustomerName) {
      where.OR = [
        { customerId },
        {
          customerName: { contains: resolvedCustomerName, mode: 'insensitive' },
        },
      ];
    } else {
      where.customerId = customerId;
    }
  } else if (type === 'walking' && params.customer_name) {
    resolvedCustomerName = String(params.customer_name).trim();
    where.customerName = {
      contains: resolvedCustomerName,
      mode: 'insensitive',
    };
  }

  return { where, fromDate, toDate, type, resolvedCustomerName };
}

// Helper functions for accounting calculations
function isDebitNormal(accountType: string): boolean {
  const type = accountType.toLowerCase();
  return type === 'asset' || type === 'expense' || type === 'cost';
}

function calculateAccountBalance(
  openingBalance: number,
  totalDebit: number,
  totalCredit: number,
  accountType: string
): number {
  if (isDebitNormal(accountType)) {
    return openingBalance + totalDebit - totalCredit;
  } else {
    return openingBalance + totalCredit - totalDebit;
  }
}

function getTrialBalanceAmounts(
  balance: number,
  accountType: string
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

// Real-Time Dashboard Metrics
router.get('/dashboard/metrics', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Calculate today's sales (from purchase orders and direct purchase orders)
    const todayPurchases = await prisma.directPurchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: {
        date: {
          gte: today,
        },
      },
    });

    // Calculate today's orders (purchase orders count)
    const todayOrders = await prisma.directPurchaseOrder.count({
      where: {
        date: {
          gte: today,
        },
      },
    });

    // Calculate yesterday's purchases for comparison
    const yesterdayPurchases = await prisma.directPurchaseOrder.aggregate({
      _sum: { totalAmount: true },
      where: {
        date: {
          gte: yesterday,
          lt: today,
        },
      },
    });

    // Calculate pending orders
    const pendingOrders = await prisma.directPurchaseOrder.count({
      where: {
        status: { not: 'Completed' },
      },
    });

    // Calculate low stock items (parts below reorder level)
    const lowStockItems = await prisma.part.count({
      where: {
        status: 'active',
        reorderLevel: { gt: 0 },
      },
    });

    // Calculate profit (simplified: assume 22% margin on purchases)
    const todayProfit = (todayPurchases._sum.totalAmount || 0) * 0.22;
    const yesterdayProfit = (yesterdayPurchases._sum.totalAmount || 0) * 0.22;

    // Calculate percentage changes
    const salesChange = yesterdayPurchases._sum.totalAmount
      ? ((todayPurchases._sum.totalAmount || 0) - yesterdayPurchases._sum.totalAmount) / yesterdayPurchases._sum.totalAmount * 100
      : 0;

    const ordersChange = todayOrders > 0 ? 0 : -100;
    const profitChange = yesterdayProfit
      ? ((todayProfit - yesterdayProfit) / yesterdayProfit * 100)
      : 0;

    res.json({
      data: {
        todaysSales: todayPurchases._sum.totalAmount || 0,
        todaysOrders: todayOrders,
        todaysPurchases: todayPurchases._sum.totalAmount || 0,
        pendingOrders,
        lowStockItems,
        todaysProfit: todayProfit,
        salesChange: salesChange.toFixed(1),
        ordersChange: ordersChange.toFixed(1),
        profitChange: profitChange.toFixed(1),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Hourly Sales Data
router.get('/dashboard/hourly-sales', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const purchases = await prisma.directPurchaseOrder.findMany({
      where: {
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
      select: {
        date: true,
        totalAmount: true,
      },
    });

    // Group by hour
    const hourlyData: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      hourlyData[i] = 0;
    }

    purchases.forEach((purchase) => {
      const hour = new Date(purchase.date).getHours();
      hourlyData[hour] = (hourlyData[hour] || 0) + (purchase.totalAmount || 0);
    });

    const result = Object.entries(hourlyData).map(([hour, sales]) => ({
      time: `${hour.toString().padStart(2, '0')}:00`,
      sales: Math.round(sales),
    }));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Top Selling Items
router.get('/dashboard/top-selling', async (req: Request, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const items = await prisma.directPurchaseOrderItem.findMany({
      where: {
        DirectPurchaseOrder: {
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
      },
      include: {
        Part: {
          include: {
            Brand: true,
          },
        },
      },
    });

    // Aggregate by part
    const partMap: Record<string, { name: string; units: number; value: number }> = {};

    items.forEach((item: any) => {
      const partId = item.partId;
      if (!partMap[partId]) {
        partMap[partId] = {
          name: item.Part.description || item.Part.partNo,
          units: 0,
          value: 0,
        };
      }
      partMap[partId].units += item.quantity;
      partMap[partId].value += item.amount || 0;
    });

    const result = Object.entries(partMap)
      .map(([_, data], index) => ({
        rank: index + 1,
        name: data.name,
        units: data.units,
        value: data.value,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Item sales analytics by date range (from approved sales invoices)
router.get('/sales/top-items', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, limit = '50', sort_by, order } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(from_date as string);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to_date as string);
    toDate.setHours(23, 59, 59, 999);
    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 500);

    const sortKey = String(sort_by || 'demand').toLowerCase();
    const sortBy: 'demand' | 'revenue' | 'profit' =
      sortKey === 'revenue' || sortKey === 'profit' ? sortKey : 'demand';
    const sortOrder = String(order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const invoiceItems = await prisma.salesInvoiceItem.findMany({
      where: {
        SalesInvoice: {
          invoiceDate: { gte: fromDate, lte: toDate },
          status: { in: SALES_REPORT_INVOICE_STATUSES },
        },
      },
      select: {
        partId: true,
        partNo: true,
        description: true,
        brand: true,
        orderedQty: true,
        deliveredQty: true,
        lineTotal: true,
        avgCost: true,
        invoiceId: true,
      },
    });

    const partMap = new Map<
      string,
      {
        partId: string;
        partNo: string;
        description: string;
        brand: string;
        quantity: number;
        totalAmount: number;
        totalCost: number;
        invoiceIds: Set<string>;
      }
    >();

    for (const item of invoiceItems) {
      const qty =
        Number(item.deliveredQty) > 0
          ? Number(item.deliveredQty)
          : Number(item.orderedQty) || 0;
      const lineTotal = Number(item.lineTotal) || 0;
      const lineCost = (Number(item.avgCost) || 0) * qty;
      const existing = partMap.get(item.partId);
      if (!existing) {
        partMap.set(item.partId, {
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || '',
          brand: item.brand || '',
          quantity: qty,
          totalAmount: lineTotal,
          totalCost: lineCost,
          invoiceIds: new Set([item.invoiceId]),
        });
      } else {
        existing.quantity += qty;
        existing.totalAmount += lineTotal;
        existing.totalCost += lineCost;
        existing.invoiceIds.add(item.invoiceId);
      }
    }

    const aggregated = Array.from(partMap.values()).map((row) => {
      const totalProfit = row.totalAmount - row.totalCost;
      const marginPercent =
        row.totalAmount > 0 ? (totalProfit / row.totalAmount) * 100 : 0;
      return {
        partId: row.partId,
        partNo: row.partNo,
        description: row.description,
        brand: row.brand,
        quantity: row.quantity,
        totalAmount: row.totalAmount,
        totalCost: row.totalCost,
        totalProfit,
        marginPercent,
        invoiceCount: row.invoiceIds.size,
      };
    });

    const dir = sortOrder === 'asc' ? 1 : -1;
    aggregated.sort((a, b) => {
      const metricA =
        sortBy === 'revenue'
          ? a.totalAmount
          : sortBy === 'profit'
            ? a.totalProfit
            : a.quantity;
      const metricB =
        sortBy === 'revenue'
          ? b.totalAmount
          : sortBy === 'profit'
            ? b.totalProfit
            : b.quantity;
      if (metricA !== metricB) return (metricA - metricB) * dir;
      return (b.totalAmount - a.totalAmount) * dir;
    });

    const result = aggregated.slice(0, limitNum).map((row, index) => ({
      rank: index + 1,
      ...row,
    }));

    res.json({
      data: result,
      meta: {
        from_date,
        to_date,
        sort_by: sortBy,
        order: sortOrder,
        totalParts: result.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer-wise sales report (approved sales invoices for one customer)
router.get('/sales/customer-wise', async (req: Request, res: Response) => {
  try {
    const {
      from_date,
      to_date,
      customer_type,
      customer_id,
      customer_name,
    } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const type = String(customer_type || '').toLowerCase();
    if (type !== 'walking' && type !== 'registered') {
      return res.status(400).json({ error: 'customer_type must be walking or registered.' });
    }

    if (type === 'registered' && !customer_id) {
      return res.status(400).json({ error: 'customer_id is required for registered customers.' });
    }

    if (type === 'walking' && !customer_name) {
      return res.status(400).json({ error: 'customer_name is required for cash sale customers.' });
    }

    const fromDate = new Date(from_date as string);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to_date as string);
    toDate.setHours(23, 59, 59, 999);

    const { where, resolvedCustomerName } = await buildCustomerSalesInvoiceWhere({
      from_date: from_date as string,
      to_date: to_date as string,
      customer_type: type,
      customer_id: customer_id as string | undefined,
      customer_name: customer_name as string | undefined,
    });

    const invoices = await prisma.salesInvoice.findMany({
      where,
      orderBy: { invoiceDate: 'desc' },
      include: {
        SalesInvoiceItem: {
          select: {
            partNo: true,
            description: true,
            orderedQty: true,
            deliveredQty: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            brand: true,
          },
        },
        Customer: {
          select: { id: true, name: true, code: true, contactNo: true },
        },
      },
    });

    const filtered = invoices.filter(
      (inv) => !inv.customerName.toLowerCase().includes('demo'),
    );

    const displayName =
      type === 'registered'
        ? resolvedCustomerName ||
          filtered[0]?.Customer?.name ||
          filtered[0]?.customerName ||
          'Unknown'
        : String(customer_name).trim();

    const rows = filtered.map((inv) => {
      const items = inv.SalesInvoiceItem.map((line) => {
        const qty =
          Number(line.deliveredQty) > 0
            ? Number(line.deliveredQty)
            : Number(line.orderedQty) || 0;
        return {
          partNo: line.partNo,
          description: line.description || '',
          brand: line.brand || '',
          quantity: qty,
          unitPrice: Number(line.unitPrice) || 0,
          discount: Number(line.discount) || 0,
          lineTotal: Number(line.lineTotal) || 0,
        };
      });
      const itemQty = items.reduce((sum, i) => sum + i.quantity, 0);
      return {
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        invoiceDate: inv.invoiceDate.toISOString().split('T')[0],
        status: inv.status,
        paymentStatus: inv.paymentStatus,
        customerName: inv.customerName,
        itemCount: items.length,
        itemQty,
        subtotal: Number(inv.subtotal) || 0,
        tax: Number(inv.tax) || 0,
        grandTotal: Number(inv.grandTotal) || 0,
        paidAmount: Number(inv.paidAmount) || 0,
        balance: Math.max(0, (Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0)),
        items,
      };
    });

    const summary = {
      invoiceCount: rows.length,
      totalItems: rows.reduce((sum, r) => sum + r.itemCount, 0),
      totalQty: rows.reduce((sum, r) => sum + r.itemQty, 0),
      totalAmount: rows.reduce((sum, r) => sum + r.grandTotal, 0),
      totalPaid: rows.reduce((sum, r) => sum + r.paidAmount, 0),
      totalBalance: rows.reduce((sum, r) => sum + r.balance, 0),
    };

    res.json({
      data: {
        customerType: type,
        customerName: displayName,
        customerId: type === 'registered' ? String(customer_id) : null,
        invoices: rows,
        summary,
      },
      meta: { from_date, to_date },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer-wise item analytics (top items for one customer)
router.get('/sales/customer-wise/top-items', async (req: Request, res: Response) => {
  try {
    const {
      from_date,
      to_date,
      customer_type,
      customer_id,
      customer_name,
      limit = '50',
      sort_by,
      order,
    } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const type = String(customer_type || '').toLowerCase();
    if (type !== 'walking' && type !== 'registered') {
      return res.status(400).json({ error: 'customer_type must be walking or registered.' });
    }

    if (type === 'registered' && !customer_id) {
      return res.status(400).json({ error: 'customer_id is required for registered customers.' });
    }

    if (type === 'walking' && !customer_name) {
      return res.status(400).json({ error: 'customer_name is required for cash sale customers.' });
    }

    const { where: invoiceWhere, resolvedCustomerName } =
      await buildCustomerSalesInvoiceWhere({
      from_date: from_date as string,
      to_date: to_date as string,
      customer_type: type,
      customer_id: customer_id as string | undefined,
      customer_name: customer_name as string | undefined,
    });

    const limitNum = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 500);
    const sortKey = String(sort_by || 'demand').toLowerCase();
    const sortBy: 'demand' | 'revenue' | 'profit' =
      sortKey === 'revenue' || sortKey === 'profit' ? sortKey : 'demand';
    const sortOrder = String(order || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';

    const invoiceItems = await prisma.salesInvoiceItem.findMany({
      where: { SalesInvoice: invoiceWhere },
      select: {
        partId: true,
        partNo: true,
        description: true,
        brand: true,
        orderedQty: true,
        deliveredQty: true,
        lineTotal: true,
        avgCost: true,
        invoiceId: true,
        SalesInvoice: {
          select: {
            customerName: true,
            customerId: true,
            Customer: { select: { name: true } },
          },
        },
      },
    });

    const partMap = new Map<
      string,
      {
        partId: string;
        partNo: string;
        description: string;
        brand: string;
        quantity: number;
        totalAmount: number;
        totalCost: number;
        invoiceIds: Set<string>;
      }
    >();

    let displayName =
      type === 'walking'
        ? String(customer_name).trim()
        : resolvedCustomerName || 'Unknown';

    for (const item of invoiceItems) {
      if (type === 'registered' && displayName === 'Unknown') {
        displayName =
          item.SalesInvoice.Customer?.name ||
          item.SalesInvoice.customerName ||
          'Unknown';
      }

      const qty =
        Number(item.deliveredQty) > 0
          ? Number(item.deliveredQty)
          : Number(item.orderedQty) || 0;
      const lineTotal = Number(item.lineTotal) || 0;
      const lineCost = (Number(item.avgCost) || 0) * qty;
      const existing = partMap.get(item.partId);
      if (!existing) {
        partMap.set(item.partId, {
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || '',
          brand: item.brand || '',
          quantity: qty,
          totalAmount: lineTotal,
          totalCost: lineCost,
          invoiceIds: new Set([item.invoiceId]),
        });
      } else {
        existing.quantity += qty;
        existing.totalAmount += lineTotal;
        existing.totalCost += lineCost;
        existing.invoiceIds.add(item.invoiceId);
      }
    }

    const aggregated = Array.from(partMap.values()).map((row) => {
      const totalProfit = row.totalAmount - row.totalCost;
      const marginPercent =
        row.totalAmount > 0 ? (totalProfit / row.totalAmount) * 100 : 0;
      return {
        partId: row.partId,
        partNo: row.partNo,
        description: row.description,
        brand: row.brand,
        quantity: row.quantity,
        totalAmount: row.totalAmount,
        totalCost: row.totalCost,
        totalProfit,
        marginPercent,
        invoiceCount: row.invoiceIds.size,
      };
    });

    const dir = sortOrder === 'asc' ? 1 : -1;
    aggregated.sort((a, b) => {
      const metricA =
        sortBy === 'revenue'
          ? a.totalAmount
          : sortBy === 'profit'
            ? a.totalProfit
            : a.quantity;
      const metricB =
        sortBy === 'revenue'
          ? b.totalAmount
          : sortBy === 'profit'
            ? b.totalProfit
            : b.quantity;
      if (metricA !== metricB) return (metricA - metricB) * dir;
      return (b.totalAmount - a.totalAmount) * dir;
    });

    const result = aggregated.slice(0, limitNum).map((row, index) => ({
      rank: index + 1,
      ...row,
    }));

    res.json({
      data: result,
      meta: {
        from_date,
        to_date,
        customer_type: type,
        customer_id: type === 'registered' ? customer_id : null,
        customer_name: displayName,
        sort_by: sortBy,
        order: sortOrder,
        totalParts: result.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Recent Activity
router.get('/dashboard/recent-activity', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;

    const purchases = await prisma.directPurchaseOrder.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        dpoNumber: true,
        date: true,
        totalAmount: true,
        createdAt: true,
      },
    });

    // Try to get expenses, but handle if table doesn't exist
    let expenses: any[] = [];
    try {
      expenses = await prisma.postedExpense.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          date: true,
          amount: true,
          paidTo: true,
          createdAt: true,
        },
      });
    } catch (expenseError: any) {
      // If PostedExpense table doesn't exist, try OperationalExpense
      try {
        const operationalExpenses = await prisma.operationalExpense.findMany({
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            date: true,
            amount: true,
            paidTo: true,
            createdAt: true,
          },
        });
        expenses = operationalExpenses;
      } catch (opError) {
        // If neither table exists, just use empty array
      }
    }

    const activities = [
      ...purchases.map((p) => ({
        id: p.id,
        type: 'order' as const,
        title: `Purchase Order ${p.dpoNumber}`,
        subtitle: `Total: Rs ${p.totalAmount?.toLocaleString() || 0}`,
        amount: p.totalAmount || 0,
        time: new Date(p.createdAt).toLocaleTimeString(),
      })),
      ...expenses.map((e) => ({
        id: e.id,
        type: 'payment' as const,
        title: `Expense Payment to ${e.paidTo}`,
        subtitle: `Amount: Rs ${e.amount.toLocaleString()}`,
        amount: e.amount,
        time: new Date(e.createdAt).toLocaleTimeString(),
      })),
    ]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit);

    res.json({ data: activities });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sales Report
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, customer_id } = req.query;

    const where: any = {};

    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    // Note: DirectPurchaseOrder is used as sales proxy since invoices table doesn't exist
    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
      include: {
        DirectPurchaseOrderItem: {
          include: {
            Part: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    const salesData = purchases.map((p: any) => ({
      id: p.id,
      date: new Date(p.date).toLocaleDateString(),
      invoiceNo: p.dpoNumber,
      customer: 'N/A', // Customer info not in schema
      items: p.DirectPurchaseOrderItem.length,
      amount: p.totalAmount || 0,
      status: p.status === 'Completed' ? 'paid' : 'pending' as 'paid' | 'pending' | 'partial',
    }));

    res.json({ data: salesData });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Periodic Sales Report
router.get('/sales/periodic', async (req: Request, res: Response) => {
  try {
    const { period_type, year } = req.query;
    const periodType = (period_type as string) || 'monthly';
    const yearNum = parseInt(year as string) || new Date().getFullYear();

    const startDate = new Date(yearNum, 0, 1);
    const endDate = new Date(yearNum, 11, 31, 23, 59, 59);

    const purchases = await prisma.directPurchaseOrder.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        DirectPurchaseOrderItem: true,
      },
    });

    let periodData: Record<string, any> = {};

    purchases.forEach((purchase: any) => {
      const date = new Date(purchase.date);
      let periodKey: string;

      if (periodType === 'daily') {
        periodKey = date.toLocaleDateString();
      } else if (periodType === 'monthly') {
        periodKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else {
        periodKey = yearNum.toString();
      }

      if (!periodData[periodKey]) {
        periodData[periodKey] = {
          period: periodKey,
          grossSales: 0,
          orders: 0,
          returns: 0,
          netSales: 0,
          profit: 0,
          margin: 0,
          avgOrder: 0,
        };
      }

      periodData[periodKey].grossSales += purchase.totalAmount || 0;
      periodData[periodKey].orders += 1;
      periodData[periodKey].netSales += purchase.totalAmount || 0;
    });

    // Calculate profit and margin (assume 22% margin)
    Object.values(periodData).forEach((period: any) => {
      period.profit = period.netSales * 0.22;
      period.margin = period.netSales > 0 ? 22 : 0;
      period.avgOrder = period.orders > 0 ? period.netSales / period.orders : 0;
    });

    const result = Object.values(periodData).sort((a: any, b: any) => {
      return new Date(a.period).getTime() - new Date(b.period).getTime();
    });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sales by Type
router.get('/sales/by-type', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date } = req.query;

    const where: any = {};
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
      include: {
        DirectPurchaseOrderItem: true,
      },
    });

    // Group by payment mode or status as type
    const typeData: Record<string, any> = {
      'Cash Sales': { transactions: 0, totalAmount: 0, profit: 0 },
      'Credit Sales': { transactions: 0, totalAmount: 0, profit: 0 },
      'Online Sales': { transactions: 0, totalAmount: 0, profit: 0 },
    };

    purchases.forEach((purchase: any) => {
      // Simplified: use status as type
      const type = purchase.status === 'Completed' ? 'Cash Sales' : 'Credit Sales';
      typeData[type].transactions += 1;
      typeData[type].totalAmount += purchase.totalAmount || 0;
      typeData[type].profit += (purchase.totalAmount || 0) * 0.22;
    });

    const totalAmount = Object.values(typeData).reduce((sum: number, t: any) => sum + t.totalAmount, 0);

    const result = Object.entries(typeData).map(([type, data]) => ({
      type,
      transactions: data.transactions,
      totalAmount: data.totalAmount,
      avgTransaction: data.transactions > 0 ? data.totalAmount / data.transactions : 0,
      profit: data.profit,
      percentage: totalAmount > 0 ? (data.totalAmount / totalAmount * 100) : 0,
    }));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Target Achievement
router.get('/sales/target-achievement', async (req: Request, res: Response) => {
  try {
    const { period, month } = req.query;

    // Mock target data - in real app, this would come from a targets table
    const targets = [
      { category: 'Sales', target: 1000000, achieved: 0 },
      { category: 'Orders', target: 100, achieved: 0 },
      { category: 'Profit', target: 220000, achieved: 0 },
    ];

    // Calculate achieved values
    const startDate = month
      ? new Date(month as string)
      : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const endDate = month
      ? new Date(new Date(month as string).getFullYear(), new Date(month as string).getMonth() + 1, 0)
      : new Date();

    const purchases = await prisma.directPurchaseOrder.aggregate({
      _sum: { totalAmount: true },
      _count: true,
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    targets[0].achieved = purchases._sum.totalAmount || 0;
    targets[1].achieved = purchases._count || 0;
    targets[2].achieved = (purchases._sum.totalAmount || 0) * 0.22;

    const result = targets.map((t) => ({
      category: t.category,
      target: t.target,
      achieved: t.achieved,
      percentage: t.target > 0 ? (t.achieved / t.target * 100) : 0,
      status: t.achieved >= t.target ? 'exceeded' : t.achieved >= t.target * 0.8 ? 'on-track' : 'behind' as 'exceeded' | 'on-track' | 'behind',
    }));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stock Movement Report
router.get('/inventory/stock-movement', async (req: Request, res: Response) => {
  try {
    const { period, category, brand } = req.query;
    const periodDays = parseInt(period as string) || 90;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const where: any = { status: 'active' };

    if (category && category !== 'all') {
      const categoryRecord = await prisma.category.findFirst({
        where: { name: category as string },
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    if (brand && brand !== 'all') {
      const brandRecord = await prisma.brand.findFirst({
        where: { name: brand as string },
      });
      if (brandRecord) {
        where.brandId = brandRecord.id;
      }
    }

    const parts = await prisma.part.findMany({
      where,
      include: {
        Brand: true,
        Category: true,
        StockMovement: {
          where: {
            createdAt: { gte: startDate },
            type: 'out',
          },
        },
      },
    });

    const result = parts.map((part: any) => {
      const totalOut = part.StockMovement.reduce((sum, m) => sum + m.quantity, 0);
      const avgMonthly = totalOut / (periodDays / 30);

      let status: 'fast' | 'slow' | 'dead';
      if (avgMonthly > 10) {
        status = 'fast';
      } else if (avgMonthly > 2) {
        status = 'slow';
      } else {
        status = 'dead';
      }

      const stockValue = (part.cost || 0) * totalOut;
      const turnover = avgMonthly > 0 ? (totalOut / avgMonthly) : 0;

      return {
        id: part.id,
        partNumber: part.partNo,
        name: part.description || part.partNo,
        brand: part.Brand?.name || 'N/A',
        category: part.Category?.name || 'N/A',
        stock: totalOut,
        avgMonthly: Math.round(avgMonthly * 10) / 10,
        lastSale: part.StockMovement.length > 0
          ? new Date(part.StockMovement[part.StockMovement.length - 1].createdAt).toLocaleDateString()
          : 'Never',
        stockValue,
        turnover: Math.round(turnover * 10) / 10,
        status,
        recommendation: status === 'dead' ? 'Consider discounting or discontinuing'
          : status === 'slow' ? 'Monitor closely'
            : 'Maintain stock levels',
      };
    });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Brand Wise Report
router.get('/inventory/brand-wise', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, brand } = req.query;

    const where: any = {};
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
      include: {
        DirectPurchaseOrderItem: {
          include: {
            Part: {
              include: {
                Brand: true,
              },
            },
          },
        },
      },
    });

    const brandMap: Record<string, any> = {};

    purchases.forEach((purchase: any) => {
      purchase.DirectPurchaseOrderItem.forEach((item) => {
        const brandName = item.Part.Brand?.name || 'Unknown';
        if (!brandMap[brandName]) {
          brandMap[brandName] = {
            brand: brandName,
            avgSale: 0,
            products: 0,
            totalSales: 0,
            purchases: 0,
            profit: 0,
            margin: 0,
            trend: 'stable' as 'rising' | 'falling' | 'stable',
          };
        }
        brandMap[brandName].totalSales += item.amount || 0;
        brandMap[brandName].purchases += item.quantity;
        brandMap[brandName].products += 1;
      });
    });

    const result = Object.values(brandMap).map((b: any) => {
      b.avgSale = b.purchases > 0 ? b.totalSales / b.purchases : 0;
      b.profit = b.totalSales * 0.22;
      b.margin = b.totalSales > 0 ? 22 : 0;
      return b;
    });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchases Report
router.get('/financial/purchases', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, supplier_id } = req.query;

    const where: any = {};
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }
    if (supplier_id) {
      where.supplierId = supplier_id as string;
    }

    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
      include: {
        DirectPurchaseOrderItem: true,
        Store: true,
      },
      orderBy: { date: 'desc' },
    });

    const result = purchases.map((p: any) => ({
      id: p.id,
      date: new Date(p.date).toLocaleDateString(),
      poNumber: p.dpoNumber,
      supplier: 'N/A', // Supplier info not linked
      items: p.DirectPurchaseOrderItem.length,
      amount: p.totalAmount || 0,
      status: p.status === 'Completed' ? 'completed' : 'pending' as 'completed' | 'pending' | 'partial',
    }));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase Comparison
router.get('/financial/purchase-comparison', async (req: Request, res: Response) => {
  try {
    const { period1_start, period1_end, period2_start, period2_end } = req.query;

    if (!period1_start || !period1_end || !period2_start || !period2_end) {
      return res.status(400).json({ error: 'All period dates are required' });
    }

    const [period1Purchases, period2Purchases] = await Promise.all([
      prisma.directPurchaseOrder.findMany({
        where: {
          date: {
            gte: new Date(period1_start as string),
            lte: new Date(period1_end as string),
          },
        },
        include: {
          DirectPurchaseOrderItem: true,
        },
      }),
      prisma.directPurchaseOrder.findMany({
        where: {
          date: {
            gte: new Date(period2_start as string),
            lte: new Date(period2_end as string),
          },
        },
        include: {
          DirectPurchaseOrderItem: true,
        },
      }),
    ]);

    const period1Total = period1Purchases.reduce((sum, p: any) => sum + (p.totalAmount || 0), 0);
    const period2Total = period2Purchases.reduce((sum, p: any) => sum + (p.totalAmount || 0), 0);
    const change = period2Total > 0 ? ((period1Total - period2Total) / period2Total * 100) : 0;

    const totalItems = period1Purchases.reduce((sum, p: any) => sum + p.DirectPurchaseOrderItem.length, 0);

    res.json({
      data: {
        currentPeriod: period1Total,
        previousPeriod: period2Total,
        change: change.toFixed(2),
        totalItems,
        comparison: [
          {
            supplier: 'All Suppliers',
            currentPeriod: period1Total,
            previousPeriod: period2Total,
            change: change.toFixed(2),
            items: totalItems,
            avgDelivery: 0,
          },
        ],
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import Cost Summary
router.get('/financial/import-cost', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, country } = req.query;

    const where: any = {};
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
      include: {
        DirectPurchaseOrderItem: true,
        DirectPurchaseOrderExpense: true,
      },
    });

    let totalFOB = 0;
    let totalFreight = 0;
    let totalDuties = 0;
    let totalLanded = 0;

    purchases.forEach((purchase: any) => {
      totalFOB += purchase.totalAmount || 0;
      purchase.DirectPurchaseOrderExpense.forEach((expense) => {
        if (expense.expenseType === 'Freight') {
          totalFreight += expense.amount;
        } else if (expense.expenseType === 'Duties') {
          totalDuties += expense.amount;
        }
      });
    });

    totalLanded = totalFOB + totalFreight + totalDuties;
    const avgLandingPercent = totalFOB > 0 ? ((totalLanded - totalFOB) / totalFOB * 100) : 0;

    const result = purchases.map((p: any) => {
      const freight = p.DirectPurchaseOrderExpense.filter(e => e.expenseType === 'Freight').reduce((sum, e) => sum + e.amount, 0);
      const duties = p.DirectPurchaseOrderExpense.filter(e => e.expenseType === 'Duties').reduce((sum, e) => sum + e.amount, 0);
      const totalCost = (p.totalAmount || 0) + freight + duties;

      return {
        id: p.id,
        date: new Date(p.date).toLocaleDateString(),
        lcNumber: p.dpoNumber,
        supplier: 'N/A',
        country: country as string || 'N/A',
        fobValue: p.totalAmount || 0,
        freight,
        insurance: 0,
        duties,
        totalCost,
        items: p.DirectPurchaseOrderItem.length,
      };
    });

    res.json({
      data: {
        records: result,
        summary: {
          totalFOB,
          totalFreight,
          totalDuties,
          totalLanded,
          avgLandingPercent: avgLandingPercent.toFixed(2),
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses Report
router.get('/financial/expenses', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, category } = req.query;

    const where: any = {};
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    let expenses: any[] = [];
    try {
      expenses = await prisma.postedExpense.findMany({
        where,
        include: {
          ExpenseType: true,
        },
        orderBy: { date: 'desc' },
      });
    } catch (error: any) {
      // If PostedExpense table doesn't exist, try OperationalExpense
      try {
        const operationalExpenses = await prisma.operationalExpense.findMany({
          where,
          orderBy: { date: 'desc' },
        });
        // Map OperationalExpense to match PostedExpense structure
        expenses = operationalExpenses.map((e: any) => ({
          ...e,
          expenseType: {
            name: e.expenseType,
            category: 'Operational',
          },
        }));
      } catch (opError) {
        // If neither table exists, return empty array
        return res.json({ data: [] });
      }
    }

    const filtered = category && category !== 'all'
      ? expenses.filter(e => e.expenseType?.category === category)
      : expenses;

    res.json({ data: filtered });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Analysis
router.get('/analytics/customers', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, customer_id } = req.query;

    const customers = await prisma.customer.findMany({
      where: customer_id ? { id: customer_id as string } : undefined,
    });

    // Since invoices don't exist, return customer data with placeholder values
    const result = customers.map((c) => ({
      id: c.id,
      customer: c.name,
      contact: c.contactNo || c.email || 'N/A',
      totalOrders: 0,
      totalSales: 0,
      balanceDue: c.openingBalance || 0,
      lastOrder: 'N/A',
    }));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Aging
router.get('/analytics/customer-aging', async (req: Request, res: Response) => {
  try {
    const { customer_type, sort_by } = req.query;

    const customers = await prisma.customer.findMany({
      where: customer_type && customer_type !== 'all'
        ? { status: customer_type as string }
        : {},
    });

    // Since invoices don't exist, use opening balance as aging data
    const result = customers.map((c) => {
      const total = c.openingBalance || 0;
      return {
        id: c.id,
        customer: c.name,
        type: 'customer' as 'customer' | 'distributor',
        current: total,
        days30: 0,
        days60: 0,
        days90: 0,
        over90: 0,
        total,
      };
    });

    // Sort
    if (sort_by === 'total') {
      result.sort((a, b) => b.total - a.total);
    } else if (sort_by === 'over90') {
      result.sort((a, b) => b.over90 - a.over90);
    } else {
      result.sort((a, b) => a.customer.localeCompare(b.customer));
    }

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Overdue invoices by term date (unpaid/partial)
router.get('/analytics/customer-aging-overdue', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, search, sort_by } = req.query;
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        status: { not: 'cancelled' },
        paymentStatus: { not: 'paid' },
        term: { not: null },
      },
      include: {
        Customer: true,
      },
      orderBy: {
        invoiceDate: 'asc',
      },
    });

    const fromDate = from_date ? new Date(String(from_date)) : null;
    const toDate = to_date ? new Date(String(to_date)) : null;
    if (toDate) toDate.setHours(23, 59, 59, 999);
    const searchText = String(search || '').trim().toLowerCase();

    const rows = invoices
      .map((inv) => {
        const rawTerm = String(inv.term || '').trim();
        const termDays = parseInt(rawTerm, 10);
        if (!Number.isFinite(termDays) || termDays <= 0) return null;

        const dueDate = new Date(inv.invoiceDate);
        dueDate.setDate(dueDate.getDate() + termDays);

        const dueAmount = Math.max(0, Number(inv.grandTotal || 0) - Number(inv.paidAmount || 0));
        if (dueAmount <= 0) return null;
        if (dueDate > today) return null;

        if (fromDate && dueDate < fromDate) return null;
        if (toDate && dueDate > toDate) return null;

        const customerName = inv.customerName || inv.Customer?.name || 'Unknown';
        if (searchText) {
          const haystack = `${customerName} ${inv.invoiceNo}`.toLowerCase();
          if (!haystack.includes(searchText)) return null;
        }

        return {
          id: inv.id,
          customer: customerName,
          invoice_no: inv.invoiceNo,
          invoice_date: inv.invoiceDate,
          term: rawTerm,
          due_date: dueDate,
          due_amount: dueAmount,
          payment_status: inv.paymentStatus,
        };
      })
      .filter(Boolean) as any[];

    if (sort_by === 'due_amount') {
      rows.sort((a, b) => b.due_amount - a.due_amount);
    } else if (sort_by === 'invoice_date') {
      rows.sort((a, b) => new Date(a.invoice_date).getTime() - new Date(b.invoice_date).getTime());
    } else {
      rows.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
    }

    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Supplier Performance
router.get('/analytics/supplier-performance', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, supplier_id } = req.query;

    const where: any = {};
    if (supplier_id) {
      where.supplierId = supplier_id as string;
    }
    if (from_date && to_date) {
      where.date = {
        gte: new Date(from_date as string),
        lte: new Date(to_date as string),
      };
    }

    const suppliers = await prisma.supplier.findMany({
      where: supplier_id ? { id: supplier_id as string } : {},
    });

    const purchases = await prisma.directPurchaseOrder.findMany({
      where,
    });

    const result = suppliers.map((s) => {
      const supplierPurchases = purchases.filter(p => p.supplierId === s.id);
      const totalValue = supplierPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);

      return {
        id: s.id,
        supplier: s.companyName,
        totalOrders: supplierPurchases.length,
        totalValue,
        onTimeDelivery: 95, // Mock value
        qualityRating: 4.5, // Mock value
        avgDeliveryDays: 7, // Mock value
        defectRate: 2.5, // Mock value
        trend: 'stable' as 'up' | 'down' | 'stable',
      };
    });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Trial Balance Report ==========
router.get('/trial-balance', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;

    // Use provided date or default to today (end of day)
    let asOfDate: Date;
    if (date) {
      const dateParts = (date as string).split('-');
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10) - 1;
      const day = parseInt(dateParts[2], 10);
      asOfDate = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
    } else {
      asOfDate = new Date();
      asOfDate.setHours(23, 59, 59, 999);
    }

    const voucherDateFilter: any = {
      status: 'posted',
      date: {
        lte: asOfDate,
      },
    };

    // Get all active accounts with their transactions
    const accounts = await prisma.account.findMany({
      where: {
        status: 'Active', // Only active accounts
      },
      include: {
        Subgroup: {
          include: {
            MainGroup: true,
          },
        },
        VoucherEntry: {
          where: {
            Voucher: voucherDateFilter,
          },
        },
      },
      orderBy: [
        {
          Subgroup: {
            code: 'asc',
          },
        },
        {
          code: 'asc',
        },
      ],
    });

    // Group by subgroup
    const subgroupMap = new Map<string, {
      subGroupCode: string;
      subGroupName: string;
      subGroupLabel: string;
      accounts: Array<{
        accountId: string;
        label: string;
        debit: number;
        credit: number;
      }>;
      subTotalDebit: number;
      subTotalCredit: number;
    }>();

    let totalDebit = 0;
    let totalCredit = 0;

    accounts.forEach((account: any) => {
      const subgroupCode = account.Subgroup.code;
      const subgroupName = account.Subgroup.name;
      const subGroupLabel = `${subgroupCode}-${subgroupName}`;
      const accountType = account.Subgroup.MainGroup.type;

      // Calculate totals from voucher entries
      const totalDebitAmount = account.VoucherEntry?.reduce((sum, entry) => sum + (entry.debit || 0), 0) || 0;
      const totalCreditAmount = account.VoucherEntry?.reduce((sum, entry) => sum + (entry.credit || 0), 0) || 0;

      // Calculate balance including opening balance using proper accounting logic
      const balance = calculateAccountBalance(
        account.openingBalance || 0,
        totalDebitAmount,
        totalCreditAmount,
        accountType
      );

      // Get trial balance amounts (debit/credit columns) based on account type
      const { debit, credit } = getTrialBalanceAmounts(balance, accountType);

      // Get or create subgroup entry
      if (!subgroupMap.has(subGroupLabel)) {
        subgroupMap.set(subGroupLabel, {
          subGroupCode: subgroupCode,
          subGroupName: subgroupName,
          subGroupLabel: subGroupLabel,
          accounts: [],
          subTotalDebit: 0,
          subTotalCredit: 0,
        });
      }

      const subgroup = subgroupMap.get(subGroupLabel)!;
      subgroup.accounts.push({
        accountId: account.id,
        label: `${account.code}-${account.name}`,
        debit,
        credit,
      });
      subgroup.subTotalDebit += debit;
      subgroup.subTotalCredit += credit;

      totalDebit += debit;
      totalCredit += credit;
    });

    // Convert map to array and sort by subgroup code
    const rows = Array.from(subgroupMap.values()).sort((a, b) => {
      return a.subGroupCode.localeCompare(b.subGroupCode);
    });

    // Sort accounts within each subgroup by account code
    rows.forEach(row => {
      row.accounts.sort((a, b) => {
        const codeA = a.label.split('-')[0];
        const codeB = b.label.split('-')[0];
        return codeA.localeCompare(codeB);
      });
    });

    res.json({
      date: asOfDate.toISOString().split('T')[0],
      rows,
      totalDebit,
      totalCredit,
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch trial balance',
      message: error.message
    });
  }
});

// ========== Income Statement Report ==========
router.get('/income-statement', async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date parameters are required' });
    }

    const fromDate = new Date(from as string);
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(to as string);
    toDate.setHours(23, 59, 59, 999);

    const voucherDateFilter: any = {
      status: 'posted',
      date: {
        gte: fromDate,
        lte: toDate,
      },
    };

    // Fetch Revenue accounts (Group 7 - type: 'revenue')
    const revenueAccounts = await prisma.account.findMany({
      where: {
        status: 'Active',
        Subgroup: {
          MainGroup: {
            type: { in: ['revenue', 'Revenue', 'REVENUE'] },
          },
        },
      },
      include: {
        VoucherEntry: {
          where: {
            Voucher: voucherDateFilter,
          },
        },
      },
      orderBy: {
        code: 'asc',
      },
    });

    // Fetch Cost accounts (Group 9 - type: 'cost')
    const costAccounts = await prisma.account.findMany({
      where: {
        status: 'Active',
        Subgroup: {
          MainGroup: {
            type: { in: ['cost', 'Cost', 'COST', 'COGS', 'cogs'] },
          },
        },
      },
      include: {
        VoucherEntry: {
          where: {
            Voucher: voucherDateFilter,
          },
        },
      },
      orderBy: {
        code: 'asc',
      },
    });

    // Fetch Expense accounts (Group 8 - type: 'expense')
    const expenseAccounts = await prisma.account.findMany({
      where: {
        status: 'Active',
        Subgroup: {
          MainGroup: {
            type: { in: ['expense', 'Expense', 'EXPENSE'] },
          },
        },
      },
      include: {
        VoucherEntry: {
          where: {
            Voucher: voucherDateFilter,
          },
        },
      },
      orderBy: {
        code: 'asc',
      },
    });

    // Process Revenue accounts: amount = credit - debit
    const revenueData = revenueAccounts.map((account: any) => {
      const totalDebit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) || 0;
      const totalCredit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) || 0;
      const amount = totalCredit - totalDebit; // Revenue: credit - debit

      return {
        accountId: account.id,
        label: `${account.code}-${account.name}`,
        amount: amount,
      };
    });

    const totalRevenue = revenueData.reduce((sum, acc) => sum + acc.amount, 0);

    // Process Cost accounts: amount = debit - credit
    const costData = costAccounts.map((account: any) => {
      const totalDebit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) || 0;
      const totalCredit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) || 0;
      const amount = totalDebit - totalCredit; // Cost: debit - credit

      return {
        accountId: account.id,
        label: `${account.code}-${account.name}`,
        amount: amount,
      };
    });

    const totalCost = costData.reduce((sum, acc) => sum + acc.amount, 0);

    // Calculate Gross Profit/Loss
    const gross = totalRevenue - totalCost;
    const grossLabel = gross >= 0 ? "Gross Profit" : "Gross Loss";

    // Process Expense accounts: amount = debit - credit
    const expenseData = expenseAccounts.map((account: any) => {
      const totalDebit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.debit, 0) || 0;
      const totalCredit = account.VoucherEntry?.reduce((sum, entry) => sum + entry.credit, 0) || 0;
      const amount = totalDebit - totalCredit; // Expense: debit - credit

      return {
        accountId: account.id,
        label: `${account.code}-${account.name}`,
        amount: amount,
      };
    });

    const totalExpenses = expenseData.reduce((sum, acc) => sum + acc.amount, 0);

    // Calculate Net Profit/Loss
    const net = gross - totalExpenses;
    const netLabel = net >= 0 ? 'Net Profit' : 'Net Loss';

    res.json({
      from: from as string,
      to: to as string,
      revenue: {
        accounts: revenueData,
        total: totalRevenue,
      },
      cost: {
        accounts: costData,
        total: totalCost,
      },
      gross: {
        label: grossLabel,
        amount: gross,
      },
      expenses: {
        accounts: expenseData,
        total: totalExpenses,
      },
      net: {
        label: netLabel,
        amount: net,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: 'Failed to fetch income statement',
      message: error.message
    });
  }
});

// ─── Supplier Payable Report ────────────────────────────────────────────────
/**
 * GET /reports/financial/supplier-payable
 * Returns every supplier + its payable account balance as of the given date.
 * Query params: to_date (optional, defaults to today)
 */
router.get('/financial/supplier-payable', async (req: Request, res: Response) => {
  try {
    const { to_date } = req.query;

    const toDate = to_date ? new Date(to_date as string) : new Date();
    toDate.setHours(23, 59, 59, 999);

    // Fetch all supplier-linked accounts with their voucher entries up to to_date
    const accounts = await prisma.account.findMany({
      where: {
        supplierId: { not: null },
        status: 'Active',
      },
      include: {
        Supplier: {
          select: {
            id: true,
            name: true,
            companyName: true,
            code: true,
            type: true,
          },
        },
        Subgroup: { include: { MainGroup: true } },
        VoucherEntry: {
          where: {
            Voucher: {
              status: 'posted',
              OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
              date: { lte: toDate },
            },
          },
          select: { debit: true, credit: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    const rows = accounts
      .map((acc: any) => {
        const accountType = acc.Subgroup?.MainGroup?.type || 'liability';
        const totalDebit = acc.VoucherEntry.reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0);
        const totalCredit = acc.VoucherEntry.reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);

        // Liabilities: balance increases with credit, decreases with debit
        const isDebitNorm = ['asset', 'expense', 'cost'].includes(accountType.toLowerCase());
        const balance = isDebitNorm
          ? (Number(acc.openingBalance) || 0) + totalDebit - totalCredit
          : (Number(acc.openingBalance) || 0) + totalCredit - totalDebit;

        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          supplierId: acc.supplierId,
          supplierName: acc.Supplier?.companyName || acc.Supplier?.name || acc.name,
          supplierCode: acc.Supplier?.code || null,
          supplierType: acc.Supplier?.type || null,
          balance,
        };
      })
      .filter((r: any) => r.balance !== 0);

    const totalBalance = rows.reduce((s: number, r: any) => s + r.balance, 0);

    res.json({ data: rows, totalBalance, asOf: toDate.toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch supplier payable report' });
  }
});

// ─── Customer Receivable Report ───────────────────────────────────────────────
/**
 * GET /reports/financial/customer-receivable
 * Returns every customer + its receivable account balance as of the given date,
 * plus credit limit and contact number.
 * Query params: to_date (optional)
 */
router.get('/financial/customer-receivable', async (req: Request, res: Response) => {
  try {
    const { to_date } = req.query;

    const toDate = to_date ? new Date(to_date as string) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const accounts = await prisma.account.findMany({
      where: {
        customerId: { not: null },
        supplierId: null,
        status: 'Active',
      },
      include: {
        Customer: {
          select: {
            id: true,
            name: true,
            code: true,
            contactNo: true,
            cellNumber: true,
            creditLimit: true,
          },
        },
        Subgroup: { include: { MainGroup: true } },
        VoucherEntry: {
          where: {
            Voucher: {
              status: 'posted',
              OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
              date: { lte: toDate },
            },
          },
          select: { debit: true, credit: true },
        },
      },
      orderBy: { code: 'asc' },
    });

    const rows = accounts
      .map((acc: any) => {
        const accountType = acc.Subgroup?.MainGroup?.type || 'asset';
        const totalDebit = acc.VoucherEntry.reduce((s: number, e: any) => s + (Number(e.debit) || 0), 0);
        const totalCredit = acc.VoucherEntry.reduce((s: number, e: any) => s + (Number(e.credit) || 0), 0);

        const isDebitNorm = ['asset', 'expense', 'cost'].includes(accountType.toLowerCase());
        const balance = isDebitNorm
          ? (Number(acc.openingBalance) || 0) + totalDebit - totalCredit
          : (Number(acc.openingBalance) || 0) + totalCredit - totalDebit;

        const phone = acc.Customer?.cellNumber || acc.Customer?.contactNo || null;
        const creditLimit = Number(acc.Customer?.creditLimit) || 0;

        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          customerId: acc.customerId,
          customerName: acc.Customer?.name || acc.name,
          customerCode: acc.Customer?.code || null,
          phone,
          creditLimit,
          balance,
        };
      })
      .filter((r: any) => r.balance !== 0);

    const totalBalance = rows.reduce((s: number, r: any) => s + r.balance, 0);

    res.json({ data: rows, totalBalance, asOf: toDate.toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to fetch customer receivable report' });
  }
});

export default router;

