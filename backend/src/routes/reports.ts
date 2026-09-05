import express, { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
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
// Sales Report — invoice list from SalesInvoice (not purchases)
router.get('/sales', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, customer_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const where: any = {
      invoiceDate: { gte: fromDate, lte: toDate },
      status: { in: SALES_REPORT_INVOICE_STATUSES },
      customerType: { not: 'transfer' },
      NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
    };

    if (customer_id) {
      where.customerId = String(customer_id);
    }

    const invoices = await prisma.salesInvoice.findMany({
      where,
      include: {
        SalesInvoiceItem: {
          select: {
            orderedQty: true,
            deliveredQty: true,
            lineTotal: true,
            avgCost: true,
          },
        },
        Customer: {
          select: { id: true, name: true },
        },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    const mapPaymentStatus = (paymentStatus: string): 'paid' | 'pending' | 'partial' => {
      const s = String(paymentStatus || '').toLowerCase();
      if (s === 'paid' || s === 'fully_paid') return 'paid';
      if (s === 'partial' || s === 'partially_paid') return 'partial';
      return 'pending';
    };

    const salesData = invoices.map((inv) => {
      let lineSales = 0;
      let cost = 0;
      for (const item of inv.SalesInvoiceItem) {
        const qty =
          Number(item.deliveredQty) > 0
            ? Number(item.deliveredQty)
            : Number(item.orderedQty) || 0;
        lineSales += Number(item.lineTotal) || 0;
        cost += (Number(item.avgCost) || 0) * qty;
      }
      // Invoice amount should match the posted grand total
      const amount =
        Number(inv.grandTotal) > 0
          ? Number(inv.grandTotal)
          : lineSales;

      return {
        id: inv.id,
        date: inv.invoiceDate.toISOString().slice(0, 10),
        invoiceNo: inv.invoiceNo,
        customer:
          inv.Customer?.name ||
          inv.customerName ||
          (inv.customerType === 'walking' ? 'Cash Sale' : 'N/A'),
        items: inv.SalesInvoiceItem.length,
        amount: Math.round(amount),
        profit: Math.round((lineSales > 0 ? lineSales : amount) - cost),
        status: mapPaymentStatus(inv.paymentStatus),
        paymentStatus: inv.paymentStatus,
      };
    });

    const summary = {
      totalSales: salesData.reduce((s, r) => s + r.amount, 0),
      totalInvoices: salesData.length,
      pendingPayment: salesData
        .filter((r) => r.status !== 'paid')
        .reduce((s, r) => s + r.amount, 0),
      profit: salesData.reduce((s, r) => s + r.profit, 0),
    };

    res.json({ data: salesData, summary });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Periodic Sales Report — based on SalesInvoice (+ returns), not purchases
router.get('/sales/periodic', async (req: Request, res: Response) => {
  try {
    const { period_type, year } = req.query;
    const periodType = (period_type as string) || 'monthly';
    const yearNum = parseInt(year as string) || new Date().getFullYear();

    const startDate = new Date(yearNum, 0, 1, 0, 0, 0, 0);
    const endDate = new Date(yearNum, 11, 31, 23, 59, 59, 999);

    const invoiceWhere = {
      invoiceDate: { gte: startDate, lte: endDate },
      status: { in: SALES_REPORT_INVOICE_STATUSES },
      customerType: { not: 'transfer' },
      NOT: { customerName: { contains: 'demo', mode: 'insensitive' as const } },
    };

    const [invoices, returns] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: invoiceWhere,
        include: {
          SalesInvoiceItem: {
            select: {
              orderedQty: true,
              deliveredQty: true,
              lineTotal: true,
              avgCost: true,
            },
          },
        },
      }),
      prisma.salesReturn.findMany({
        where: {
          returnDate: { gte: startDate, lte: endDate },
          status: { in: ['completed', 'approved'] },
        },
        select: {
          returnDate: true,
          totalAmount: true,
        },
      }),
    ]);

    type PeriodBucket = {
      period: string;
      sortKey: string;
      grossSales: number;
      orders: number;
      returns: number;
      netSales: number;
      profit: number;
      margin: number;
      avgOrder: number;
    };

    const periodData: Record<string, PeriodBucket> = {};

    const ensureBucket = (periodKey: string, sortKey: string) => {
      if (!periodData[periodKey]) {
        periodData[periodKey] = {
          period: periodKey,
          sortKey,
          grossSales: 0,
          orders: 0,
          returns: 0,
          netSales: 0,
          profit: 0,
          margin: 0,
          avgOrder: 0,
        };
      }
      return periodData[periodKey];
    };

    const periodKeyFor = (date: Date) => {
      if (periodType === 'daily') {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return {
          period: date.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          }),
          sortKey: `${y}-${m}-${d}`,
        };
      }
      if (periodType === 'yearly') {
        return { period: String(yearNum), sortKey: String(yearNum) };
      }
      // monthly (default)
      return {
        period: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        sortKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      };
    };

    for (const inv of invoices) {
      const date = new Date(inv.invoiceDate);
      const { period, sortKey } = periodKeyFor(date);
      const bucket = ensureBucket(period, sortKey);

      let salesAmount = 0;
      let costAmount = 0;
      for (const item of inv.SalesInvoiceItem) {
        const qty =
          Number(item.deliveredQty) > 0
            ? Number(item.deliveredQty)
            : Number(item.orderedQty) || 0;
        const lineTotal = Number(item.lineTotal) || 0;
        const avgCost = Number(item.avgCost) || 0;
        salesAmount += lineTotal;
        costAmount += avgCost * qty;
      }
      // Prefer line totals; fall back to invoice grandTotal if lines are empty
      if (salesAmount <= 0) {
        salesAmount = Number(inv.grandTotal) || 0;
      }

      bucket.grossSales += salesAmount;
      bucket.orders += 1;
      bucket.profit += salesAmount - costAmount;
    }

    for (const ret of returns) {
      const date = new Date(ret.returnDate);
      if (date.getFullYear() !== yearNum) continue;
      const { period, sortKey } = periodKeyFor(date);
      const bucket = ensureBucket(period, sortKey);
      bucket.returns += Number(ret.totalAmount) || 0;
    }

    const result = Object.values(periodData)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((period) => {
        const netSales = Math.max(0, period.grossSales - period.returns);
        const margin =
          period.grossSales > 0
            ? Math.round((period.profit / period.grossSales) * 1000) / 10
            : 0;
        const avgOrder =
          period.orders > 0
            ? Math.round(period.grossSales / period.orders)
            : 0;
        return {
          period: period.period,
          grossSales: Math.round(period.grossSales),
          orders: period.orders,
          returns: Math.round(period.returns),
          netSales: Math.round(netSales),
          profit: Math.round(period.profit),
          margin,
          avgOrder,
        };
      });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Sales by Type — Cash / Credit / Online derived from invoice customerType + payment split
router.get('/sales/by-type', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, sales_type } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { in: SALES_REPORT_INVOICE_STATUSES },
        customerType: { not: 'transfer' },
        NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
      },
      include: {
        SalesInvoiceItem: {
          select: {
            orderedQty: true,
            deliveredQty: true,
            lineTotal: true,
            avgCost: true,
          },
        },
      },
    });

    const typeData: Record<
      string,
      { transactions: number; totalAmount: number; profit: number }
    > = {
      'Cash Sales': { transactions: 0, totalAmount: 0, profit: 0 },
      'Credit Sales': { transactions: 0, totalAmount: 0, profit: 0 },
      'Online Sales': { transactions: 0, totalAmount: 0, profit: 0 },
      Wholesale: { transactions: 0, totalAmount: 0, profit: 0 },
      Retail: { transactions: 0, totalAmount: 0, profit: 0 },
    };

    const classifyInvoice = (inv: any): string => {
      const customerType = String(inv.customerType || '').toLowerCase();
      const cashAmount = Number(inv.cashAmount) || 0;
      const bankAmount = Number(inv.bankAmount) || 0;

      // Registered / party customers are credit (AR) sales
      if (customerType === 'registered') {
        return 'Credit Sales';
      }

      // Walk-in: bank-only → online; otherwise cash
      if (customerType === 'walking') {
        if (bankAmount > 0 && bankAmount >= cashAmount) {
          return 'Online Sales';
        }
        return 'Cash Sales';
      }

      // Fallback by payment mix
      if (bankAmount > cashAmount) return 'Online Sales';
      if (cashAmount > 0) return 'Cash Sales';
      return 'Credit Sales';
    };

    for (const inv of invoices) {
      const type = classifyInvoice(inv);
      let salesAmount = 0;
      let costAmount = 0;
      for (const item of inv.SalesInvoiceItem) {
        const qty =
          Number(item.deliveredQty) > 0
            ? Number(item.deliveredQty)
            : Number(item.orderedQty) || 0;
        const lineTotal = Number(item.lineTotal) || 0;
        salesAmount += lineTotal;
        costAmount += (Number(item.avgCost) || 0) * qty;
      }
      if (salesAmount <= 0) {
        salesAmount = Number(inv.grandTotal) || 0;
      }

      typeData[type].transactions += 1;
      typeData[type].totalAmount += salesAmount;
      typeData[type].profit += salesAmount - costAmount;
    }

    const filter = String(sales_type || 'all').toLowerCase();
    const typeFilterMap: Record<string, string> = {
      cash: 'Cash Sales',
      credit: 'Credit Sales',
      online: 'Online Sales',
      wholesale: 'Wholesale',
      retail: 'Retail',
    };

    let entries = Object.entries(typeData);
    if (filter && filter !== 'all' && typeFilterMap[filter]) {
      entries = entries.filter(([type]) => type === typeFilterMap[filter]);
    }

    const totalAmount = entries.reduce((sum, [, data]) => sum + data.totalAmount, 0);

    const result = entries
      .map(([type, data]) => ({
        type,
        transactions: data.transactions,
        totalAmount: Math.round(data.totalAmount),
        avgTransaction:
          data.transactions > 0
            ? Math.round(data.totalAmount / data.transactions)
            : 0,
        profit: Math.round(data.profit),
        percentage:
          totalAmount > 0
            ? Math.round((data.totalAmount / totalAmount) * 1000) / 10
            : 0,
      }))
      // Hide unused categories (Wholesale/Retail have no invoice field yet)
      .filter(
        (row) =>
          row.transactions > 0 ||
          !['Wholesale', 'Retail'].includes(row.type),
      );

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Target Achievement — achieved from SalesInvoice; target = same period prior year
router.get('/sales/target-achievement', async (req: Request, res: Response) => {
  try {
    const { period, month } = req.query;
    const periodType = String(period || 'monthly').toLowerCase();

    const now = new Date();
    let startDate: Date;
    let endDate: Date;

    if (month && /^\d{4}-\d{2}$/.test(String(month))) {
      const [y, m] = String(month).split('-').map(Number);
      if (periodType === 'yearly') {
        startDate = new Date(y, 0, 1, 0, 0, 0, 0);
        endDate = new Date(y, 11, 31, 23, 59, 59, 999);
      } else if (periodType === 'quarterly') {
        const qStartMonth = Math.floor((m - 1) / 3) * 3;
        startDate = new Date(y, qStartMonth, 1, 0, 0, 0, 0);
        endDate = new Date(y, qStartMonth + 3, 0, 23, 59, 59, 999);
      } else if (periodType === 'weekly') {
        // Week containing the 1st of the selected month
        const first = new Date(y, m - 1, 1);
        const day = first.getDay(); // 0 Sun
        const diffToMon = (day + 6) % 7;
        startDate = new Date(y, m - 1, 1 - diffToMon, 0, 0, 0, 0);
        endDate = new Date(startDate);
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
      } else {
        // monthly
        startDate = new Date(y, m - 1, 1, 0, 0, 0, 0);
        endDate = new Date(y, m, 0, 23, 59, 59, 999);
      }
    } else if (periodType === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
    } else if (periodType === 'quarterly') {
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      startDate = new Date(now.getFullYear(), qStartMonth, 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), qStartMonth + 3, 0, 23, 59, 59, 999);
    } else if (periodType === 'weekly') {
      const day = now.getDay();
      const diffToMon = (day + 6) % 7;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - diffToMon);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    }

    // Prior-year same window used as target baseline
    const priorStart = new Date(startDate);
    priorStart.setFullYear(priorStart.getFullYear() - 1);
    const priorEnd = new Date(endDate);
    priorEnd.setFullYear(priorEnd.getFullYear() - 1);

    const salesWhere = (from: Date, to: Date) => ({
      invoiceDate: { gte: from, lte: to },
      status: { in: SALES_REPORT_INVOICE_STATUSES },
      customerType: { not: 'transfer' },
      NOT: { customerName: { contains: 'demo', mode: 'insensitive' as const } },
    });

    const [currentInvoices, priorInvoices] = await Promise.all([
      prisma.salesInvoice.findMany({
        where: salesWhere(startDate, endDate),
        include: {
          SalesInvoiceItem: {
            select: {
              orderedQty: true,
              deliveredQty: true,
              lineTotal: true,
              avgCost: true,
            },
          },
        },
      }),
      prisma.salesInvoice.findMany({
        where: salesWhere(priorStart, priorEnd),
        include: {
          SalesInvoiceItem: {
            select: {
              orderedQty: true,
              deliveredQty: true,
              lineTotal: true,
              avgCost: true,
            },
          },
        },
      }),
    ]);

    const summarize = (invoices: typeof currentInvoices) => {
      let sales = 0;
      let profit = 0;
      for (const inv of invoices) {
        let salesAmount = 0;
        let costAmount = 0;
        for (const item of inv.SalesInvoiceItem) {
          const qty =
            Number(item.deliveredQty) > 0
              ? Number(item.deliveredQty)
              : Number(item.orderedQty) || 0;
          const lineTotal = Number(item.lineTotal) || 0;
          salesAmount += lineTotal;
          costAmount += (Number(item.avgCost) || 0) * qty;
        }
        if (salesAmount <= 0) {
          salesAmount = Number(inv.grandTotal) || 0;
        }
        sales += salesAmount;
        profit += salesAmount - costAmount;
      }
      return {
        sales: Math.round(sales),
        orders: invoices.length,
        profit: Math.round(profit),
      };
    };

    const achieved = summarize(currentInvoices);
    const prior = summarize(priorInvoices);

    // If prior year has no data, use a modest uplift over current as soft target floor
    const salesTarget =
      prior.sales > 0 ? prior.sales : Math.max(achieved.sales, 1);
    const ordersTarget =
      prior.orders > 0 ? prior.orders : Math.max(achieved.orders, 1);
    const profitTarget =
      prior.profit > 0 ? prior.profit : Math.max(achieved.profit, 1);

    const buildRow = (category: string, target: number, value: number) => {
      const percentage =
        target > 0 ? Math.round((value / target) * 1000) / 10 : 0;
      const status =
        value >= target
          ? 'exceeded'
          : value >= target * 0.8
            ? 'on-track'
            : 'behind';
      return {
        category,
        target: Math.round(target),
        achieved: Math.round(value),
        percentage,
        status: status as 'exceeded' | 'on-track' | 'behind',
      };
    };

    const result = [
      buildRow('Sales', salesTarget, achieved.sales),
      buildRow('Orders', ordersTarget, achieved.orders),
      buildRow('Profit', profitTarget, achieved.profit),
    ];

    const msLeft = Math.max(0, endDate.getTime() - Date.now());
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));

    res.json({
      data: result,
      meta: {
        period: periodType,
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        priorFrom: priorStart.toISOString(),
        priorTo: priorEnd.toISOString(),
        daysLeft,
        targetBasis:
          prior.sales > 0 || prior.orders > 0
            ? 'prior_year_same_period'
            : 'current_period_floor',
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Stock Movement Report
// Stock Movement — real parts + sales velocity from SalesInvoiceItem
router.get('/inventory/stock-movement', async (req: Request, res: Response) => {
  try {
    const { period, category, brand, category_id, brand_id } = req.query;
    const periodDays = parseInt(String(period || '30'), 10) || 30;

    const startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - periodDays);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    const where: any = { status: 'active' };

    const categoryId =
      (category_id && String(category_id)) ||
      (category && category !== 'all' ? String(category) : '');
    const brandId =
      (brand_id && String(brand_id)) ||
      (brand && brand !== 'all' ? String(brand) : '');

    if (categoryId) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          categoryId,
        );
      if (isUuid) {
        where.categoryId = categoryId;
      } else {
        const categoryRecord = await prisma.category.findFirst({
          where: { name: { equals: categoryId, mode: 'insensitive' } },
        });
        if (!categoryRecord) {
          return res.json({ data: [] });
        }
        where.categoryId = categoryRecord.id;
      }
    }

    if (brandId) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          brandId,
        );
      if (isUuid) {
        where.brandId = brandId;
      } else {
        const brandRecord = await prisma.brand.findFirst({
          where: { name: { equals: brandId, mode: 'insensitive' } },
        });
        if (!brandRecord) {
          return res.json({ data: [] });
        }
        where.brandId = brandRecord.id;
      }
    }

    const salesInvoiceWhere = {
      invoiceDate: { gte: startDate, lte: endDate },
      status: { in: SALES_REPORT_INVOICE_STATUSES },
      customerType: { not: 'transfer' },
      NOT: { customerName: { contains: 'demo', mode: 'insensitive' as const } },
    };

    const [parts, salesAgg, stockAgg] = await Promise.all([
      prisma.part.findMany({
        where,
        select: {
          id: true,
          partNo: true,
          description: true,
          cost: true,
          avgCost: true,
          Brand: { select: { name: true } },
          Category: { select: { name: true } },
        },
      }),
      prisma.salesInvoiceItem.groupBy({
        by: ['partId'],
        where: {
          SalesInvoice: salesInvoiceWhere,
        },
        _sum: {
          deliveredQty: true,
          orderedQty: true,
        },
      }),
      prisma.partRackShelf.groupBy({
        by: ['partId'],
        _sum: { quantity: true },
      }),
    ]);

    const soldMap = new Map<string, number>();
    for (const row of salesAgg) {
      const delivered = Number(row._sum.deliveredQty) || 0;
      const ordered = Number(row._sum.orderedQty) || 0;
      soldMap.set(row.partId, delivered > 0 ? delivered : ordered);
    }

    const stockMap = new Map<string, number>();
    for (const row of stockAgg) {
      stockMap.set(row.partId, Number(row._sum.quantity) || 0);
    }

    const lastSaleRows = await prisma.$queryRaw<
      Array<{ partId: string; lastSale: Date }>
    >`
      SELECT si."partId" AS "partId", MAX(s."invoiceDate") AS "lastSale"
      FROM "SalesInvoiceItem" si
      INNER JOIN "SalesInvoice" s ON s.id = si."invoiceId"
      WHERE s."invoiceDate" >= ${startDate}
        AND s."invoiceDate" <= ${endDate}
        AND s.status IN (${Prisma.join(SALES_REPORT_INVOICE_STATUSES)})
        AND s."customerType" <> 'transfer'
        AND s."customerName" NOT ILIKE '%demo%'
      GROUP BY si."partId"
    `;

    const lastSaleMap = new Map<string, Date>();
    for (const row of lastSaleRows) {
      lastSaleMap.set(row.partId, new Date(row.lastSale));
    }

    const months = Math.max(periodDays / 30, 1 / 30);

    const result = parts.map((part) => {
      const soldQty = soldMap.get(part.id) || 0;
      const stock = stockMap.get(part.id) || 0;
      const unitCost = Number(part.avgCost) || Number(part.cost) || 0;
      const avgMonthly = soldQty / months;

      let status: 'fast' | 'slow' | 'dead';
      if (soldQty <= 0) {
        status = 'dead';
      } else if (avgMonthly >= 5) {
        status = 'fast';
      } else {
        status = 'slow';
      }

      // Annualized inventory turns: (period sales annualized) / current stock
      const annualizedSales = soldQty * (365 / periodDays);
      const turnover =
        stock > 0
          ? Math.round((annualizedSales / stock) * 100) / 100
          : soldQty > 0
            ? 99
            : 0;

      const lastSaleDate = lastSaleMap.get(part.id);
      const lastSale = lastSaleDate
        ? lastSaleDate.toISOString().slice(0, 10)
        : 'Never';
      const daysSinceSale = lastSaleDate
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - lastSaleDate.getTime()) / (1000 * 60 * 60 * 24),
            ),
          )
        : null;

      return {
        id: part.id,
        partNumber: part.partNo,
        name: part.description || part.partNo,
        brand: part.Brand?.name || 'N/A',
        category: part.Category?.name || 'N/A',
        stock,
        avgMonthly: Math.round(avgMonthly * 10) / 10,
        lastSale,
        daysSinceSale,
        stockValue: Math.round(stock * unitCost * 100) / 100,
        turnover,
        status,
        recommendation:
          status === 'dead'
            ? stock > 0
              ? 'Consider discounting or discontinuing'
              : 'No stock / no sales'
            : status === 'slow'
              ? 'Monitor closely'
              : 'Maintain stock levels',
      };
    });

    // Fast / high-value first; within dead, stocked items before zero-stock
    result.sort((a, b) => {
      const rank = { fast: 0, slow: 1, dead: 2 } as const;
      const r = rank[a.status] - rank[b.status];
      if (r !== 0) return r;
      if (a.status === 'dead') {
        const aHas = a.stock > 0 ? 0 : 1;
        const bHas = b.stock > 0 ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
      }
      return b.stockValue - a.stockValue;
    });

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Brand Wise Report — sales by brand from SalesInvoiceItem
router.get('/inventory/brand-wise', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, brand, brand_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const brandFilter =
      (brand_id && String(brand_id)) ||
      (brand && brand !== 'all' ? String(brand) : '');

    let brandIdFilter: string | undefined;
    if (brandFilter) {
      const isUuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          brandFilter,
        );
      if (isUuid) {
        brandIdFilter = brandFilter;
      } else {
        const brandRecord = await prisma.brand.findFirst({
          where: { name: { equals: brandFilter, mode: 'insensitive' } },
        });
        if (!brandRecord) {
          return res.json({ data: [] });
        }
        brandIdFilter = brandRecord.id;
      }
    }

    const items = await prisma.salesInvoiceItem.findMany({
      where: {
        ...(brandIdFilter ? { Part: { brandId: brandIdFilter } } : {}),
        SalesInvoice: {
          invoiceDate: { gte: fromDate, lte: toDate },
          status: { in: SALES_REPORT_INVOICE_STATUSES },
          customerType: { not: 'transfer' },
          NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
        },
      },
      select: {
        partId: true,
        orderedQty: true,
        deliveredQty: true,
        lineTotal: true,
        avgCost: true,
        Part: {
          select: {
            brandId: true,
            Brand: { select: { id: true, name: true } },
          },
        },
      },
    });

    const brandMap: Record<
      string,
      {
        brand: string;
        products: Set<string>;
        totalSales: number;
        qtySold: number;
        cost: number;
      }
    > = {};

    for (const item of items) {
      const brandName = item.Part?.Brand?.name || 'Unknown';
      if (!brandMap[brandName]) {
        brandMap[brandName] = {
          brand: brandName,
          products: new Set(),
          totalSales: 0,
          qtySold: 0,
          cost: 0,
        };
      }
      const qty =
        Number(item.deliveredQty) > 0
          ? Number(item.deliveredQty)
          : Number(item.orderedQty) || 0;
      const sales = Number(item.lineTotal) || 0;
      brandMap[brandName].products.add(item.partId);
      brandMap[brandName].totalSales += sales;
      brandMap[brandName].qtySold += qty;
      brandMap[brandName].cost += (Number(item.avgCost) || 0) * qty;
    }

    // Prior period for trend
    const spanMs = toDate.getTime() - fromDate.getTime();
    const priorTo = new Date(fromDate.getTime() - 1);
    const priorFrom = new Date(priorTo.getTime() - spanMs);
    const priorItems = await prisma.salesInvoiceItem.findMany({
      where: {
        ...(brandIdFilter ? { Part: { brandId: brandIdFilter } } : {}),
        SalesInvoice: {
          invoiceDate: { gte: priorFrom, lte: priorTo },
          status: { in: SALES_REPORT_INVOICE_STATUSES },
          customerType: { not: 'transfer' },
          NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
        },
      },
      select: {
        lineTotal: true,
        Part: { select: { Brand: { select: { name: true } } } },
      },
    });
    const priorSales: Record<string, number> = {};
    for (const item of priorItems) {
      const brandName = item.Part?.Brand?.name || 'Unknown';
      priorSales[brandName] =
        (priorSales[brandName] || 0) + (Number(item.lineTotal) || 0);
    }

    const result = Object.values(brandMap)
      .map((b) => {
        const profit = b.totalSales - b.cost;
        const margin =
          b.totalSales > 0
            ? Math.round((profit / b.totalSales) * 1000) / 10
            : 0;
        const prev = priorSales[b.brand] || 0;
        let trend: 'rising' | 'falling' | 'stable' = 'stable';
        if (prev > 0) {
          const change = (b.totalSales - prev) / prev;
          if (change > 0.05) trend = 'rising';
          else if (change < -0.05) trend = 'falling';
        } else if (b.totalSales > 0) {
          trend = 'rising';
        }
        return {
          brand: b.brand,
          avgSale:
            b.qtySold > 0 ? Math.round(b.totalSales / b.qtySold) : 0,
          products: b.products.size,
          totalSales: Math.round(b.totalSales),
          purchases: b.qtySold,
          profit: Math.round(profit),
          margin,
          trend,
        };
      })
      .sort((a, b) => b.totalSales - a.totalSales);

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchases Report — DirectPurchaseOrder + import PurchaseOrder
router.get('/financial/purchases', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, supplier_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const where: any = {
      date: { gte: fromDate, lte: toDate },
    };
    if (supplier_id) {
      where.supplierId = String(supplier_id);
    }

    const mapStatus = (status: string): 'completed' | 'pending' | 'partial' => {
      const s = String(status || '').toLowerCase();
      if (s.includes('partial')) return 'partial';
      if (
        s.includes('complete') ||
        s === 'posted' ||
        s === 'approved' ||
        s === 'received' ||
        s === 'closed'
      )
        return 'completed';
      return 'pending';
    };

    const supplierInclude = {
      Supplier: { select: { id: true, companyName: true, name: true } },
    } as const;

    const [dpos, pos] = await Promise.all([
      prisma.directPurchaseOrder.findMany({
        where,
        include: {
          DirectPurchaseOrderItem: { select: { id: true } },
          ...supplierInclude,
        },
        orderBy: { date: 'desc' },
      }),
      prisma.purchaseOrder.findMany({
        where,
        include: {
          PurchaseOrderItem: { select: { id: true } },
          ...supplierInclude,
        },
        orderBy: { date: 'desc' },
      }),
    ]);

    const result = [
      ...dpos.map((p) => ({
        id: p.id,
        date: p.date.toISOString().slice(0, 10),
        poNumber: p.dpoNumber,
        supplier: p.Supplier?.companyName || p.Supplier?.name || 'N/A',
        items: p.DirectPurchaseOrderItem.length,
        amount: Math.round(Number(p.totalAmount) || 0),
        status: mapStatus(p.status),
        source: 'DPO' as const,
      })),
      ...pos.map((p) => ({
        id: p.id,
        date: p.date.toISOString().slice(0, 10),
        poNumber: p.poNumber,
        supplier: p.Supplier?.companyName || p.Supplier?.name || 'N/A',
        items: p.PurchaseOrderItem.length,
        amount: Math.round(Number(p.totalAmount) || 0),
        status: mapStatus(p.status),
        source: 'PO' as const,
      })),
    ].sort((a, b) => b.date.localeCompare(a.date) || a.poNumber.localeCompare(b.poNumber));

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Purchase Comparison — by supplier across two periods (DPO + import PO)
router.get('/financial/purchase-comparison', async (req: Request, res: Response) => {
  try {
    const { period1_start, period1_end, period2_start, period2_end } = req.query;

    if (!period1_start || !period1_end || !period2_start || !period2_end) {
      return res.status(400).json({ error: 'All period dates are required' });
    }

    const range = (start: string, end: string) => {
      const from = new Date(start);
      from.setHours(0, 0, 0, 0);
      const to = new Date(end);
      to.setHours(23, 59, 59, 999);
      return { gte: from, lte: to };
    };

    const supplierInclude = {
      Supplier: { select: { id: true, companyName: true, name: true } },
    } as const;

    const loadPeriod = async (start: string, end: string) => {
      const date = range(start, end);
      const [dpos, pos] = await Promise.all([
        prisma.directPurchaseOrder.findMany({
          where: { date },
          include: {
            DirectPurchaseOrderItem: { select: { id: true } },
            ...supplierInclude,
          },
        }),
        prisma.purchaseOrder.findMany({
          where: { date },
          include: {
            PurchaseOrderItem: { select: { id: true } },
            ...supplierInclude,
          },
        }),
      ]);
      return [
        ...dpos.map((p) => ({
          supplierId: p.supplierId,
          supplierName: p.Supplier?.companyName || p.Supplier?.name || 'Unknown Supplier',
          amount: Number(p.totalAmount) || 0,
          items: p.DirectPurchaseOrderItem.length,
        })),
        ...pos.map((p) => ({
          supplierId: p.supplierId,
          supplierName: p.Supplier?.companyName || p.Supplier?.name || 'Unknown Supplier',
          amount: Number(p.totalAmount) || 0,
          items: p.PurchaseOrderItem.length,
        })),
      ];
    };

    const [period1Purchases, period2Purchases] = await Promise.all([
      loadPeriod(String(period1_start), String(period1_end)),
      loadPeriod(String(period2_start), String(period2_end)),
    ]);

    type Bucket = {
      supplier: string;
      currentPeriod: number;
      previousPeriod: number;
      items: number;
    };

    const map: Record<string, Bucket> = {};
    const ensure = (key: string, name: string) => {
      if (!map[key]) {
        map[key] = {
          supplier: name,
          currentPeriod: 0,
          previousPeriod: 0,
          items: 0,
        };
      }
      return map[key];
    };

    for (const p of period1Purchases) {
      const key = p.supplierId || `name:${p.supplierName}`;
      const b = ensure(key, p.supplierName);
      b.currentPeriod += p.amount;
      b.items += p.items;
    }
    for (const p of period2Purchases) {
      const key = p.supplierId || `name:${p.supplierName}`;
      const b = ensure(key, p.supplierName);
      b.previousPeriod += p.amount;
    }

    const comparison = Object.values(map)
      .map((b) => {
        const change =
          b.previousPeriod > 0
            ? ((b.currentPeriod - b.previousPeriod) / b.previousPeriod) * 100
            : b.currentPeriod > 0
              ? 100
              : 0;
        return {
          supplier: b.supplier,
          currentPeriod: Math.round(b.currentPeriod),
          previousPeriod: Math.round(b.previousPeriod),
          change: Math.round(change * 10) / 10,
          items: b.items,
          avgDelivery: null as number | null,
        };
      })
      .sort((a, b) => b.currentPeriod - a.currentPeriod);

    const currentPeriod = comparison.reduce((s, r) => s + r.currentPeriod, 0);
    const previousPeriod = comparison.reduce((s, r) => s + r.previousPeriod, 0);
    const change =
      previousPeriod > 0
        ? ((currentPeriod - previousPeriod) / previousPeriod) * 100
        : currentPeriod > 0
          ? 100
          : 0;
    const totalItems = comparison.reduce((s, r) => s + r.items, 0);

    res.json({
      data: {
        currentPeriod,
        previousPeriod,
        change: Math.round(change * 10) / 10,
        totalItems,
        comparison,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Import Cost Summary — landed cost from import Purchase Orders
router.get('/financial/import-cost', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, country } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const where: any = {
      date: { gte: fromDate, lte: toDate },
    };

    if (country && country !== 'all') {
      where.Supplier = {
        country: { equals: String(country), mode: 'insensitive' },
      };
    }

    const purchases = await prisma.purchaseOrder.findMany({
      where,
      include: {
        PurchaseOrderItem: { select: { id: true } },
        Supplier: {
          select: {
            companyName: true,
            name: true,
            country: true,
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    let totalFOB = 0;
    let totalFreight = 0;
    let totalInsurance = 0;
    let totalDuties = 0;

    const result = purchases.map((p) => {
      const rate = Number(p.conversionRate) || 1;
      const fcTotal = Number(p.fcTotal) || 0;
      // Prefer FC×rate as FOB; fall back to totalAmount minus expenses when FC is blank
      const duties =
        (Number(p.customsDuty) || 0) +
        (Number(p.additionalCustomsDuty) || 0) +
        (Number(p.regulatoryDuty) || 0) +
        (Number(p.salesTax) || 0) +
        (Number(p.additionalSalesTax) || 0) +
        (Number(p.incomeTax) || 0) +
        (Number(p.ed) || 0);
      const freight = (Number(p.frtExp) || 0) + (Number(p.locFrt) || 0);
      const insurance = 0;
      const otherExp = Math.max(
        0,
        (Number(p.totalExp) || 0) - freight - duties,
      );
      const fobFromFc = fcTotal > 0 ? fcTotal * rate : 0;
      const totalAmount = Number(p.totalAmount) || 0;
      const fobValue =
        fobFromFc > 0
          ? fobFromFc
          : Math.max(0, totalAmount - freight - duties - otherExp);
      const totalCost =
        totalAmount > 0 ? totalAmount : fobValue + freight + insurance + duties + otherExp;

      totalFOB += fobValue;
      totalFreight += freight;
      totalInsurance += insurance;
      totalDuties += duties + otherExp;

      return {
        id: p.id,
        date: p.date.toISOString().slice(0, 10),
        lcNumber: p.invoiceNo || p.poNumber,
        supplier: p.Supplier?.companyName || p.Supplier?.name || 'N/A',
        country: p.Supplier?.country || 'N/A',
        fobValue: Math.round(fobValue),
        freight: Math.round(freight),
        insurance: Math.round(insurance),
        duties: Math.round(duties + otherExp),
        totalCost: Math.round(totalCost),
        items: p.PurchaseOrderItem.length,
      };
    });

    const totalLanded = totalFOB + totalFreight + totalInsurance + totalDuties;
    const avgLandingPercent =
      totalFOB > 0 ? ((totalLanded - totalFOB) / totalFOB) * 100 : 0;

    const countries = [
      ...new Set(
        result
          .map((r) => r.country)
          .filter((c) => c && c !== 'N/A'),
      ),
    ].sort((a, b) => a.localeCompare(b));

    res.json({
      data: {
        records: result,
        countries,
        summary: {
          totalFOB: Math.round(totalFOB),
          totalFreight: Math.round(totalFreight),
          totalDuties: Math.round(totalDuties),
          totalLanded: Math.round(totalLanded),
          avgLandingPercent: Math.round(avgLandingPercent * 10) / 10,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Expenses Report — posted ExpenseType expenses, else GL expense voucher lines
router.get('/financial/expenses', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, category, expense_type_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const postedWhere: any = {
      date: { gte: fromDate, lte: toDate },
    };
    if (expense_type_id) {
      postedWhere.expenseTypeId = String(expense_type_id);
    }

    const posted = await prisma.postedExpense.findMany({
      where: postedWhere,
      include: { ExpenseType: true },
      orderBy: { date: 'desc' },
    });

    if (posted.length > 0) {
      let rows = posted.map((e) => ({
        id: e.id,
        date: e.date.toISOString().slice(0, 10),
        reference: e.referenceNumber || e.id.slice(0, 8).toUpperCase(),
        category: e.ExpenseType?.name || 'N/A',
        categoryGroup: e.ExpenseType?.category || 'N/A',
        expenseTypeId: e.expenseTypeId,
        description: e.description || e.paidTo || '',
        amount: Math.round(Number(e.amount) || 0),
        status: 'paid' as const,
        expenseType: e.ExpenseType
          ? { name: e.ExpenseType.name, category: e.ExpenseType.category }
          : null,
      }));

      if (category && category !== 'all') {
        const cat = String(category).toLowerCase();
        rows = rows.filter(
          (e) =>
            e.categoryGroup.toLowerCase() === cat ||
            e.category.toLowerCase() === cat ||
            e.expenseTypeId === String(category),
        );
      }

      return res.json({ data: rows });
    }

    // Fallback: expense accounts from posted vouchers (PostedExpense table empty)
    const entries = await prisma.voucherEntry.findMany({
      where: {
        Voucher: {
          status: 'posted',
          date: { gte: fromDate, lte: toDate },
          OR: [{ isCleared: null }, { isCleared: { not: 0 } }],
        },
        Account: {
          status: 'Active',
          Subgroup: {
            MainGroup: {
              type: { in: ['Expense', 'expense', 'EXPENSE'] },
              name: { notIn: ['Cost of Sales', 'Cost'] },
            },
          },
        },
      },
      include: {
        Voucher: {
          select: {
            id: true,
            voucherNumber: true,
            date: true,
            narration: true,
          },
        },
        Account: {
          select: {
            id: true,
            code: true,
            name: true,
            Subgroup: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { Voucher: { date: 'desc' } },
    });

    let rows = entries
      .map((e) => {
        const amount = (Number(e.debit) || 0) - (Number(e.credit) || 0);
        if (Math.abs(amount) < 0.005) return null;
        const categoryName =
          e.Account?.Subgroup?.name || e.Account?.name || 'Expense';
        return {
          id: e.id,
          date: e.Voucher.date.toISOString().slice(0, 10),
          reference: e.Voucher.voucherNumber || e.Voucher.id.slice(0, 8),
          category: categoryName,
          categoryGroup: categoryName,
          expenseTypeId: e.Account?.id || null,
          description:
            e.description ||
            e.Voucher.narration ||
            `${e.Account?.code || ''} ${e.Account?.name || ''}`.trim(),
          amount: Math.round(amount),
          status: 'paid' as const,
          expenseType: {
            name: e.Account?.name || categoryName,
            category: categoryName,
          },
        };
      })
      .filter(Boolean) as any[];

    if (category && category !== 'all') {
      const cat = String(category).toLowerCase();
      rows = rows.filter(
        (e) =>
          String(e.category).toLowerCase() === cat ||
          String(e.expenseTypeId) === String(category) ||
          String(e.expenseType?.name || '')
            .toLowerCase()
            .includes(cat),
      );
    }

    res.json({ data: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Analysis — real sales from SalesInvoice
router.get('/analytics/customers', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, customer_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const invoiceWhere: any = {
      invoiceDate: { gte: fromDate, lte: toDate },
      status: { in: SALES_REPORT_INVOICE_STATUSES.filter((s) => !s.includes('return')) },
      customerType: { not: 'transfer' },
      NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
    };
    if (customer_id) {
      invoiceWhere.customerId = String(customer_id);
    }

    const invoices = await prisma.salesInvoice.findMany({
      where: invoiceWhere,
      select: {
        id: true,
        customerId: true,
        customerName: true,
        grandTotal: true,
        paidAmount: true,
        invoiceDate: true,
        Customer: {
          select: {
            id: true,
            name: true,
            contactNo: true,
            cellNumber: true,
            email: true,
          },
        },
      },
      orderBy: { invoiceDate: 'desc' },
    });

    type Agg = {
      id: string;
      customer: string;
      contact: string;
      totalOrders: number;
      totalSales: number;
      balanceDue: number;
      lastOrder: string;
    };

    const map: Record<string, Agg> = {};
    for (const inv of invoices) {
      const key = inv.customerId || inv.customerName || inv.id;
      if (!map[key]) {
        map[key] = {
          id: inv.customerId || key,
          customer: inv.Customer?.name || inv.customerName || 'N/A',
          contact:
            inv.Customer?.contactNo ||
            inv.Customer?.cellNumber ||
            inv.Customer?.email ||
            'N/A',
          totalOrders: 0,
          totalSales: 0,
          balanceDue: 0,
          lastOrder: inv.invoiceDate.toISOString().slice(0, 10),
        };
      }
      const amount = Number(inv.grandTotal) || 0;
      const paid = Number(inv.paidAmount) || 0;
      map[key].totalOrders += 1;
      map[key].totalSales += amount;
      map[key].balanceDue += Math.max(0, amount - paid);
      const d = inv.invoiceDate.toISOString().slice(0, 10);
      if (d > map[key].lastOrder) map[key].lastOrder = d;
    }

    const result = Object.values(map)
      .map((r) => ({
        ...r,
        totalSales: Math.round(r.totalSales),
        balanceDue: Math.round(r.balanceDue),
      }))
      .sort((a, b) => b.totalSales - a.totalSales);

    res.json({ data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Customer Aging — unpaid invoice balances bucketed by invoice age
router.get('/analytics/customer-aging', async (req: Request, res: Response) => {
  try {
    const { customer_type, sort_by } = req.query;

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        status: { in: SALES_REPORT_INVOICE_STATUSES },
        customerType: { not: 'transfer' },
        paymentStatus: { not: 'paid' },
        NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
      },
      select: {
        id: true,
        customerId: true,
        customerName: true,
        customerType: true,
        invoiceDate: true,
        grandTotal: true,
        paidAmount: true,
        Customer: {
          select: {
            id: true,
            name: true,
            category: true,
          },
        },
      },
    });

    type Bucket = {
      id: string;
      customer: string;
      type: 'customer' | 'distributor';
      current: number;
      days30: number;
      days60: number;
      days90: number;
      over90: number;
      total: number;
    };

    const map: Record<string, Bucket> = {};

    const resolveType = (inv: (typeof invoices)[0]): 'customer' | 'distributor' => {
      const cat = String(inv.Customer?.category || '').toLowerCase();
      if (cat === 'reseller' || cat.includes('distribut')) return 'distributor';
      return 'customer';
    };

    for (const inv of invoices) {
      const dueAmount = Math.max(
        0,
        (Number(inv.grandTotal) || 0) - (Number(inv.paidAmount) || 0),
      );
      if (dueAmount <= 0) continue;

      const type = resolveType(inv);
      if (customer_type === 'customer' && type !== 'customer') continue;
      if (customer_type === 'distributor' && type !== 'distributor') continue;

      // Classic AR aging by invoice date (matches Current 0–30 / 30–60 / 60–90 / 90+)
      const ageMs = today.getTime() - new Date(inv.invoiceDate).getTime();
      const ageDays = Math.max(0, Math.floor(ageMs / (1000 * 60 * 60 * 24)));

      const key = inv.customerId || `name:${inv.customerName}`;
      if (!map[key]) {
        map[key] = {
          id: inv.customerId || key,
          customer: inv.Customer?.name || inv.customerName || 'N/A',
          type,
          current: 0,
          days30: 0,
          days60: 0,
          days90: 0,
          over90: 0,
          total: 0,
        };
      }

      if (ageDays < 30) map[key].current += dueAmount;
      else if (ageDays < 60) map[key].days30 += dueAmount;
      else if (ageDays < 90) map[key].days60 += dueAmount;
      else map[key].over90 += dueAmount;

      map[key].total += dueAmount;
    }

    let result = Object.values(map)
      .map((r) => ({
        ...r,
        current: Math.round(r.current),
        days30: Math.round(r.days30),
        days60: Math.round(r.days60),
        days90: Math.round(r.days90),
        over90: Math.round(r.over90),
        total: Math.round(r.total),
      }))
      .filter((r) => r.total > 0);

    if (sort_by === 'over90') {
      result.sort((a, b) => b.over90 - a.over90 || b.total - a.total);
    } else if (sort_by === 'name') {
      result.sort((a, b) => a.customer.localeCompare(b.customer));
    } else {
      result.sort((a, b) => b.total - a.total);
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

// Sales profit by invoice (date range)
router.get('/sales/profit', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, search } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);
    const searchText = String(search || '').trim().toLowerCase();

    const invoices = await prisma.salesInvoice.findMany({
      where: {
        invoiceDate: { gte: fromDate, lte: toDate },
        status: { in: SALES_REPORT_INVOICE_STATUSES },
        customerType: { not: 'transfer' },
        NOT: { customerName: { contains: 'demo', mode: 'insensitive' } },
      },
      include: {
        SalesInvoiceItem: {
          select: {
            partNo: true,
            description: true,
            brand: true,
            orderedQty: true,
            deliveredQty: true,
            unitPrice: true,
            lineTotal: true,
            avgCost: true,
          },
        },
        Customer: { select: { name: true } },
      },
      orderBy: [{ invoiceDate: 'desc' }, { invoiceNo: 'desc' }],
    });

    const rows: Array<{
      id: string;
      invoice_no: string;
      invoice_date: Date;
      customer_name: string;
      status: string;
      payment_status: string;
      grand_total: number;
      sales_amount: number;
      cost_amount: number;
      profit_amount: number;
      margin_percent: number;
      items: Array<{
        part_no: string;
        description: string;
        brand: string;
        quantity: number;
        unit_price: number;
        avg_cost: number;
        line_total: number;
        line_cost: number;
        line_profit: number;
      }>;
    }> = [];

    let totalSales = 0;
    let totalCost = 0;

    for (const inv of invoices) {
      const customerName =
        inv.customerName || inv.Customer?.name || 'Walk-in Customer';

      if (searchText) {
        const haystack = `${customerName} ${inv.invoiceNo}`.toLowerCase();
        if (!haystack.includes(searchText)) continue;
      }

      const items = inv.SalesInvoiceItem.map((item) => {
        const qty =
          Number(item.deliveredQty) > 0
            ? Number(item.deliveredQty)
            : Number(item.orderedQty) || 0;
        const lineTotal = Number(item.lineTotal) || 0;
        const avgCost = Number(item.avgCost) || 0;
        const lineCost = avgCost * qty;
        const lineProfit = lineTotal - lineCost;
        return {
          part_no: item.partNo,
          description: item.description || '',
          brand: item.brand || '',
          quantity: qty,
          unit_price: Number(item.unitPrice) || 0,
          avg_cost: avgCost,
          line_total: lineTotal,
          line_cost: lineCost,
          line_profit: lineProfit,
        };
      });

      const salesAmount = items.reduce((sum, row) => sum + row.line_total, 0);
      const costAmount = items.reduce((sum, row) => sum + row.line_cost, 0);
      const profitAmount = salesAmount - costAmount;
      const marginPercent =
        salesAmount > 0 ? (profitAmount / salesAmount) * 100 : 0;

      totalSales += salesAmount;
      totalCost += costAmount;

      rows.push({
        id: inv.id,
        invoice_no: inv.invoiceNo,
        invoice_date: inv.invoiceDate,
        customer_name: customerName,
        status: inv.status,
        payment_status: inv.paymentStatus,
        grand_total: Number(inv.grandTotal) || 0,
        sales_amount: salesAmount,
        cost_amount: costAmount,
        profit_amount: profitAmount,
        margin_percent: marginPercent,
        items,
      });
    }

    const totalProfit = totalSales - totalCost;

    res.json({
      data: rows,
      summary: {
        invoice_count: rows.length,
        total_sales: totalSales,
        total_cost: totalCost,
        total_profit: totalProfit,
        margin_percent:
          totalSales > 0 ? (totalProfit / totalSales) * 100 : 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Supplier Performance — DPO + import Purchase Orders by supplier
router.get('/analytics/supplier-performance', async (req: Request, res: Response) => {
  try {
    const { from_date, to_date, supplier_id } = req.query;

    if (!from_date || !to_date) {
      return res.status(400).json({ error: 'from_date and to_date are required.' });
    }

    const fromDate = new Date(String(from_date));
    fromDate.setHours(0, 0, 0, 0);
    const toDate = new Date(String(to_date));
    toDate.setHours(23, 59, 59, 999);

    const spanMs = Math.max(1, toDate.getTime() - fromDate.getTime());
    const priorTo = new Date(fromDate.getTime() - 1);
    const priorFrom = new Date(priorTo.getTime() - spanMs);

    const where: any = {
      date: { gte: fromDate, lte: toDate },
      supplierId: { not: null },
    };
    if (supplier_id) where.supplierId = String(supplier_id);

    const priorWhere: any = {
      date: { gte: priorFrom, lte: priorTo },
      supplierId: { not: null },
    };
    if (supplier_id) priorWhere.supplierId = String(supplier_id);

    const supplierSelect = {
      Supplier: { select: { id: true, companyName: true, name: true } },
    } as const;

    const [dpos, priorDpos, pos, priorPos] = await Promise.all([
      prisma.directPurchaseOrder.findMany({
        where,
        include: supplierSelect,
      }),
      prisma.directPurchaseOrder.findMany({
        where: priorWhere,
        select: { supplierId: true, totalAmount: true },
      }),
      prisma.purchaseOrder.findMany({
        where,
        include: supplierSelect,
      }),
      prisma.purchaseOrder.findMany({
        where: priorWhere,
        select: { supplierId: true, totalAmount: true },
      }),
    ]);

    const priorBySupplier: Record<string, number> = {};
    for (const p of [...priorDpos, ...priorPos]) {
      if (!p.supplierId) continue;
      priorBySupplier[p.supplierId] =
        (priorBySupplier[p.supplierId] || 0) + (Number(p.totalAmount) || 0);
    }

    const bySupplier: Record<
      string,
      { id: string; supplier: string; totalOrders: number; totalValue: number }
    > = {};

    for (const p of [...dpos, ...pos]) {
      if (!p.supplierId) continue;
      if (!bySupplier[p.supplierId]) {
        bySupplier[p.supplierId] = {
          id: p.supplierId,
          supplier: p.Supplier?.companyName || p.Supplier?.name || 'N/A',
          totalOrders: 0,
          totalValue: 0,
        };
      }
      bySupplier[p.supplierId].totalOrders += 1;
      bySupplier[p.supplierId].totalValue += Number(p.totalAmount) || 0;
    }

    const result = Object.values(bySupplier)
      .map((s) => {
        const prev = priorBySupplier[s.id] || 0;
        let trend: 'up' | 'down' | 'stable' = 'stable';
        if (prev > 0) {
          const change = (s.totalValue - prev) / prev;
          if (change > 0.05) trend = 'up';
          else if (change < -0.05) trend = 'down';
        } else if (s.totalValue > 0) {
          trend = 'up';
        }
        return {
          id: s.id,
          supplier: s.supplier,
          totalOrders: s.totalOrders,
          totalValue: Math.round(s.totalValue),
          // Delivery/quality KPIs are not tracked in DB yet
          onTimeDelivery: null as number | null,
          qualityRating: null as number | null,
          avgDeliveryDays: null as number | null,
          defectRate: null as number | null,
          trend,
        };
      })
      .sort((a, b) => b.totalValue - a.totalValue);

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
            address: true,
            contactPersons: true,
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
        const contactPersons = Array.isArray(acc.Customer?.contactPersons)
          ? acc.Customer.contactPersons
              .map((person: any) =>
                [person?.name, person?.designation, person?.contactNumber]
                  .map((part: unknown) => String(part || "").trim())
                  .filter(Boolean)
                  .join(" — "),
              )
              .filter(Boolean)
              .join("; ")
          : "";

        return {
          accountId: acc.id,
          accountCode: acc.code,
          accountName: acc.name,
          customerId: acc.customerId,
          customerName: acc.Customer?.name || acc.name,
          customerCode: acc.Customer?.code || null,
          phone,
          address: acc.Customer?.address || null,
          contactPerson: contactPersons || null,
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

