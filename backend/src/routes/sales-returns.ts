import * as express from 'express';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import prisma from '../config/database';

const router = express.Router();

/**
 * SALES RETURN SYSTEM - FUNCTIONAL SPECIFICATION
 * 
 * Purpose: Handle returns of items from Sales Invoices
 * 
 * Business Rules:
 * 1. Can only return items from completed sales invoices
 * 2. Return quantity cannot exceed original sold quantity
 * 3. Returns increase inventory (IN movement)
 * 4. Returns create REVERSE accounting entries:
 *    - JV: Debit Sales Revenue, Credit AR/Cash (reverses original revenue)
 *    - JV: Debit Inventory, Credit COGS (reverses original COGS)
 * 5. Return status: pending -> approved -> completed
 * 6. Approved returns trigger:
 *    - Stock movement IN
 *    - Accounting voucher creation (2 JVs)
 *    - Customer account balance adjustment (if credit sale)
 *    - Inventory average cost recalculation
 */

// ==================== GET ALL SALES RETURNS ====================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, from_date, to_date, invoice_id, customer_id, page = '1', limit = '100' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status as string;
    }

    if (invoice_id) {
      where.salesInvoiceId = invoice_id as string;
    }

    if (from_date || to_date) {
      where.returnDate = {};
      if (from_date) where.returnDate.gte = new Date(from_date as string);
      if (to_date) where.returnDate.lte = new Date(to_date as string);
    }

    const [returns, total] = await Promise.all([
      prisma.salesReturn.findMany({
        where,
        include: {
          SalesInvoice: {
            select: {
              invoiceNo: true,
              invoiceDate: true,
              customerName: true,
              grandTotal: true,
            },
          },
          SalesReturnItem: {
            include: {
              Part: {
                select: {
                  partNo: true,
                  description: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.salesReturn.count({ where }),
    ]);

    res.json({
      data: returns,
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

// ==================== GET SINGLE SALES RETURN ====================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
      include: {
        SalesInvoice: {
          include: {
            SalesInvoiceItem: {
              include: {
                Part: true,
              },
            },
          },
        },
        SalesReturnItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    if (!salesReturn) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    res.json(salesReturn);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CREATE SALES RETURN ====================
router.post('/', async (req: Request, res: Response) => {
  try {
    const { invoice_id, return_date, reason, items, created_by } = req.body;

    // Validate required fields
    if (!invoice_id || !return_date || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: invoice_id, return_date, items' });
    }

    // Fetch sales invoice with items
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: invoice_id },
      include: {
        SalesInvoiceItem: true,
        SalesReturn: {
          where: { status: { in: ['pending', 'approved', 'completed'] } },
          include: { SalesReturnItem: true },
        },
      },
    }) as any;

    if (!invoice) {
      return res.status(404).json({ error: 'Sales invoice not found' });
    }

    // Validate each return item
    let totalReturnAmount = 0;
    const validatedItems: any[] = [];

    for (const item of items) {
      const { part_id, return_quantity } = item;

      if (!part_id || !return_quantity || return_quantity <= 0) {
        return res.status(400).json({ error: 'Invalid item: part_id and positive return_quantity required' });
      }

      // Find original invoice item
      const invoiceItem = invoice.SalesInvoiceItem.find((i: any) => i.partId === part_id);
      if (!invoiceItem) {
        return res.status(400).json({ error: `Part ${part_id} not found in original invoice` });
      }

      // Calculate already returned quantity
      let alreadyReturned = 0;
      for (const existingReturn of invoice.SalesReturn) {
        const returnItem = existingReturn.SalesReturnItem.find((ri: any) => ri.partId === part_id);
        if (returnItem) {
          alreadyReturned += returnItem.returnQuantity;
        }
      }

      // Check if return quantity exceeds available
      // Use orderedQty or deliveredQty as the original sold quantity
      const soldQuantity = invoiceItem.deliveredQty || invoiceItem.orderedQty || 0;
      const availableToReturn = soldQuantity - alreadyReturned;
      if (return_quantity > availableToReturn) {
        return res.status(400).json({
          error: `Cannot return ${return_quantity} of part ${part_id}. Only ${availableToReturn} available (sold: ${soldQuantity}, already returned: ${alreadyReturned})`,
        });
      }

      const itemAmount = return_quantity * invoiceItem.unitPrice;
      totalReturnAmount += itemAmount;

      validatedItems.push({
        partId: part_id,
        returnQuantity: return_quantity,
        originalSalePrice: invoiceItem.unitPrice,
        avgCost: invoiceItem.avgCost || 0,
        amount: itemAmount,
      });
    }

    // Generate return number
    const lastReturn = await prisma.salesReturn.findFirst({
      orderBy: { returnNumber: 'desc' },
    });

    let nextNumber = 1;
    if (lastReturn && lastReturn.returnNumber) {
      const match = lastReturn.returnNumber.match(/SR-(\d{4})-(\d+)/);
      if (match) {
        nextNumber = parseInt(match[2]) + 1;
      }
    }

    const year = new Date().getFullYear();
    const returnNumber = `SR-${year}-${String(nextNumber).padStart(4, '0')}`;

    // Create sales return with generated IDs for items
    const salesReturnItemsWithIds = validatedItems.map(item => ({
      id: crypto.randomUUID(),
      ...item,
    }));

    const salesReturn = await prisma.salesReturn.create({
      data: {
        id: crypto.randomUUID(),
        returnNumber,
        SalesInvoice: { connect: { id: invoice_id } },
        ...(invoice.customerId ? { Customer: { connect: { id: invoice.customerId } } } : {}),
        returnDate: new Date(return_date),
        reason: reason || null,
        status: 'pending',
        totalAmount: totalReturnAmount,
        createdBy: created_by || 'System',
        updatedAt: new Date(),
        SalesReturnItem: {
          create: salesReturnItemsWithIds,
        },
      },
      include: {
        SalesReturnItem: {
          include: {
            Part: true,
          },
        },
        SalesInvoice: true,
      },
    });

    res.status(201).json({
      message: 'Sales return created successfully',
      salesReturn,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== APPROVE SALES RETURN ====================
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body;

    // Fetch sales return with all details
    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
      include: {
        SalesReturnItem: {
          include: {
            Part: true,
          },
        },
        SalesInvoice: true,
      },
    }) as any;

    if (!salesReturn) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    if (salesReturn.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve return with status: ${salesReturn.status}` });
    }

    // ========== STEP 1: CREATE STOCK MOVEMENTS (IN) ==========
    const stockMovements: any[] = [];
    for (const item of salesReturn.SalesReturnItem) {
      const movement = await prisma.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          partId: item.partId,
          type: 'in',
          quantity: item.returnQuantity,
          referenceType: 'sales_return',
          referenceId: salesReturn.id,
          notes: `Sales Return ${salesReturn.returnNumber} - Invoice ${salesReturn.SalesInvoice?.invoiceNo || salesReturn.salesInvoiceId}`,
        },
      });
      stockMovements.push(movement);

      // Update part stock quantity (increase)
      await prisma.part.update({
        where: { id: item.partId },
        data: {
          // Note: You may need to add a stock quantity field to Part model
          // For now, stock movements table tracks the movements
        },
      });
    }

    // ========== STEP 2: CREATE ACCOUNTING VOUCHERS ==========

    // Get required accounts
    const inventoryAccount = await prisma.account.findFirst({
      where: {
        Subgroup: {
          code: '104', // Inventory subgroup
        },
        status: 'Active',
      },
      include: { Subgroup: { include: { MainGroup: true } } },
    });

    const salesRevenueAccount = await prisma.account.findFirst({
      where: {
        status: 'Active',
        OR: [
          { name: 'Goods Sold' },
          { name: 'Sales Revenue' },
          { name: { contains: 'Sales Revenue', mode: 'insensitive' } }
        ]
      },
      include: { Subgroup: { include: { MainGroup: true } } },
    });

    const cogsAccount = await prisma.account.findFirst({
      where: {
        status: 'Active',
        OR: [
          { name: 'Cost Inventory' },
          { name: 'Cost of Goods Sold' },
          { name: { contains: 'Cost of Goods Sold', mode: 'insensitive' } },
          { name: { contains: 'Cost of Sales', mode: 'insensitive' } },
          { name: { contains: 'COGS', mode: 'insensitive' } }
        ]
      },
      include: { Subgroup: { include: { MainGroup: true } } },
    });

    if (!inventoryAccount || !salesRevenueAccount || !cogsAccount) {
      return res.status(400).json({
        error: 'Required accounts not found. Please ensure Inventory (104), Sales Revenue, and COGS accounts exist.',
      });
    }

    // Helper function to get next voucher number
    async function getNextVoucherNumber(prefix: string): Promise<string> {
      const lastVoucher = await prisma.voucher.findFirst({
        where: { voucherNumber: { startsWith: prefix } },
        orderBy: { voucherNumber: 'desc' },
      });

      let nextNum = 1;
      if (lastVoucher) {
        const match = lastVoucher.voucherNumber.match(/\d+$/);
        if (match) {
          nextNum = parseInt(match[0]) + 1;
        }
      }
      return `${prefix}${String(nextNum).padStart(4, '0')}`;
    }

    // JV 1: Reverse Revenue (DR Sales Revenue, CR AR/Cash)
    const jv1Number = await getNextVoucherNumber('JV');

    // Determine if it was cash or credit sale
    const invoiceData = salesReturn.salesInvoice || await prisma.salesInvoice.findUnique({ where: { id: salesReturn.salesInvoiceId } });
    const isCashSale = invoiceData?.customerType === 'walking' || (invoiceData?.paidAmount || 0) > 0;
    let customerAccount = null;

    if (!isCashSale && invoiceData?.customerId) {
      // Credit sale - find customer AR account
      customerAccount = await prisma.account.findFirst({
        where: {
          name: { contains: invoiceData.customerName },
          Subgroup: { code: '105' }, // AR subgroup
          status: 'Active',
        },
      });
    }

    // If cash sale or no customer account, use Cash account
    const cashAccount = await prisma.account.findFirst({
      where: {
        Subgroup: { code: '101' }, // Cash subgroup
        status: 'Active',
      },
    });

    const creditAccount = customerAccount || cashAccount;
    if (!creditAccount) {
      return res.status(400).json({ error: 'Cash or Customer AR account not found' });
    }

    const jv1 = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber: jv1Number,
        type: 'journal',
        date: salesReturn.returnDate,
        narration: `Sales Return ${salesReturn.returnNumber} - Reverse Revenue for Invoice ${salesReturn.SalesInvoice?.invoiceNo || salesReturn.salesInvoiceId}`,
        totalDebit: salesReturn.totalAmount,
        totalCredit: salesReturn.totalAmount,
        status: 'posted',
        createdBy: approved_by || 'System',
        approvedBy: approved_by || 'System',
        approvedAt: new Date(),
        updatedAt: new Date(),
        VoucherEntry: {
          create: [
            {
              id: crypto.randomUUID(),
              accountId: salesRevenueAccount.id,
              accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
              description: `Reverse revenue for return ${salesReturn.returnNumber}`,
              debit: salesReturn.totalAmount,
              credit: 0,
              sortOrder: 0,
            },
            {
              id: crypto.randomUUID(),
              accountId: creditAccount.id,
              accountName: `${creditAccount.code}-${creditAccount.name}`,
              description: `Refund to customer for return ${salesReturn.returnNumber}`,
              debit: 0,
              credit: salesReturn.totalAmount,
              sortOrder: 1,
            },
          ],
        },
      },
    });

    // Update account balances for JV1
    await prisma.account.update({
      where: { id: salesRevenueAccount.id },
      data: { currentBalance: { decrement: salesReturn.totalAmount } }, // Decrease revenue
    });
    await prisma.account.update({
      where: { id: creditAccount.id },
      data: { currentBalance: { decrement: salesReturn.totalAmount } }, // Decrease AR or Cash
    });

    // JV 2: Reverse COGS (DR Inventory, CR COGS)
    const jv2Number = await getNextVoucherNumber('JV');
    let totalCOGS = 0;

    for (const item of salesReturn.SalesReturnItem) {
      // Use the recorded average cost from the time of sale
      const itemCOGS = item.returnQuantity * (item.avgCost || 0);
      totalCOGS += itemCOGS;
    }

    const jv2 = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber: jv2Number,
        type: 'journal',
        date: salesReturn.returnDate,
        narration: `Sales Return ${salesReturn.returnNumber} - Reverse COGS for Invoice ${salesReturn.SalesInvoice?.invoiceNo || salesReturn.salesInvoiceId}`,
        totalDebit: totalCOGS,
        totalCredit: totalCOGS,
        status: 'posted',
        createdBy: approved_by || 'System',
        approvedBy: approved_by || 'System',
        approvedAt: new Date(),
        updatedAt: new Date(),
        VoucherEntry: {
          create: [
            {
              id: crypto.randomUUID(),
              accountId: inventoryAccount.id,
              accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
              description: `Restore inventory for return ${salesReturn.returnNumber}`,
              debit: totalCOGS,
              credit: 0,
              sortOrder: 0,
            },
            {
              id: crypto.randomUUID(),
              accountId: cogsAccount.id,
              accountName: `${cogsAccount.code}-${cogsAccount.name}`,
              description: `Reverse COGS for return ${salesReturn.returnNumber}`,
              debit: 0,
              credit: totalCOGS,
              sortOrder: 1,
            },
          ],
        },
      },
    });

    // Update account balances for JV2
    await prisma.account.update({
      where: { id: inventoryAccount.id },
      data: { currentBalance: { increment: totalCOGS } }, // Increase inventory
    });
    await prisma.account.update({
      where: { id: cogsAccount.id },
      data: { currentBalance: { decrement: totalCOGS } }, // Decrease COGS
    });

    // ========== STEP 3: UPDATE SALES RETURN STATUS ==========
    const updatedReturn = await prisma.salesReturn.update({
      where: { id },
      data: {
        status: 'completed',
        approvedBy: approved_by || 'System',
        approvedAt: new Date(),
      },
      include: {
        SalesReturnItem: {
          include: {
            Part: true,
          },
        },
        SalesInvoice: true,
      },
    });

    res.json({
      message: 'Sales return approved successfully',
      salesReturn: updatedReturn,
      stockMovements,
      vouchers: [jv1, jv2],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REJECT SALES RETURN ====================
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejected_by, rejection_reason } = req.body;

    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
    });

    if (!salesReturn) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    if (salesReturn.status !== 'pending') {
      return res.status(400).json({ error: `Cannot reject return with status: ${salesReturn.status}` });
    }

    const updatedReturn = await prisma.salesReturn.update({
      where: { id },
      data: {
        status: 'rejected',
        reason: rejection_reason || salesReturn.reason,
        approvedBy: rejected_by || 'System',
        approvedAt: new Date(),
      },
    });

    res.json({
      message: 'Sales return rejected',
      salesReturn: updatedReturn,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DELETE SALES RETURN ====================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const salesReturn = await prisma.salesReturn.findUnique({
      where: { id },
    });

    if (!salesReturn) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    if (salesReturn.status !== 'pending') {
      return res.status(400).json({
        error: `Cannot delete return with status: ${salesReturn.status}. Only pending returns can be deleted.`,
      });
    }

    await prisma.salesReturn.delete({
      where: { id },
    });

    res.json({ message: 'Sales return deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
