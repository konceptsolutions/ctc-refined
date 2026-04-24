import * as express from 'express';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';

const router = express.Router();
const SALES_RETURN_START_NO = 97;

async function getPartStockFromMovements(
  tx: Prisma.TransactionClient,
  partId: string,
): Promise<number> {
  const [smIn, smOut] = await Promise.all([
    tx.stockMovement.aggregate({
      where: { partId, type: 'in' },
      _sum: { quantity: true },
    }),
    tx.stockMovement.aggregate({
      where: { partId, type: 'out' },
      _sum: { quantity: true },
    }),
  ]);
  return (smIn._sum.quantity || 0) - (smOut._sum.quantity || 0);
}

type ShelfLoc = {
  storeId: string | null;
  rackId: string | null;
  shelfId: string | null;
};

/** Split integer total across buckets proportionally; largest remainder gets +1 until exact. */
function distributeIntegerProportional(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const base = raw.map((x) => Math.floor(x));
  let rem = total - base.reduce((a, b) => a + b, 0);
  const order = raw
    .map((x, i) => ({ i, frac: x - base[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    base[order[k].i] += 1;
  }
  return base;
}

/**
 * Refund-from account must be Cash (subgroup 102) or Bank (103), same as SalesInvoice UI.
 * Subgroup 101 is inventory / stock; 104 is typically receivables — not valid for customer refunds.
 */
function isRefundCashOrBankSubgroupCode(subgroupCode: string | null | undefined): boolean {
  const sg = String(subgroupCode ?? '').trim();
  if (!sg) return false;
  return sg.startsWith('102') || sg.startsWith('103');
}

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
              customerType: true,
            },
          },
          SalesReturnItem: {
            include: {
              Part: {
                select: {
                  partNo: true,
                  description: true,
                  uom: true,
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
    const {
      invoice_id,
      return_date,
      reason,
      items,
      created_by,
      deduction: deductionRaw,
      payment_account_id,
      paid_amount: paidAmountRaw,
    } = req.body;

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

      // Return only against delivered quantity (not pending / undelivered)
      const soldQuantity = Number(invoiceItem.deliveredQty ?? 0);
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
        avgCostAtSale: Number(invoiceItem.avgCost) || 0,
        amount: itemAmount,
      });
    }

    const invOverallDiscount = Number(invoice.overallDiscount) || 0;
    const taxPct = Number(invoice.taxPercentage) || 0;
    const returnSubtotal = totalReturnAmount;
    let returnTax = 0;
    let grossReturnAfterTax = returnSubtotal;
    if (taxPct > 0) {
      returnTax =
        Math.round(returnSubtotal * (taxPct / 100) * 100) / 100;
      grossReturnAfterTax =
        Math.round((returnSubtotal + returnTax) * 100) / 100;
    }

    let deduction = deductionRaw === undefined || deductionRaw === null ? 0 : Number(deductionRaw);
    if (!Number.isFinite(deduction) || deduction < 0) {
      return res.status(400).json({ error: "Invalid deduction" });
    }
    deduction = Math.round(deduction * 100) / 100;

    if (deduction > 0 && invOverallDiscount <= 0) {
      return res.status(400).json({
        error: "Deduction is only allowed when the invoice has an overall discount",
      });
    }
    if (deduction > grossReturnAfterTax + 1e-6) {
      return res.status(400).json({
        error: `Deduction cannot exceed return amount after tax (max Rs ${grossReturnAfterTax})`,
      });
    }

    const netReturnTotal = Math.max(
      0,
      Math.round((grossReturnAfterTax - deduction) * 100) / 100,
    );

    let paidAmount =
      paidAmountRaw === undefined || paidAmountRaw === null
        ? 0
        : Number(paidAmountRaw);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      return res.status(400).json({ error: 'Invalid paid_amount' });
    }
    paidAmount = Math.round(paidAmount * 100) / 100;
    if (paidAmount > netReturnTotal + 1e-6) {
      return res.status(400).json({
        error: `paid_amount cannot exceed return net total (${netReturnTotal})`,
      });
    }
    const isWalkingCustomer = invoice.customerType === 'walking';
    if (isWalkingCustomer) {
      if (netReturnTotal > 0.009) {
        if (!payment_account_id) {
          return res.status(400).json({
            error: 'Walk-in sale return requires payment_account_id (cash/bank to refund from).',
          });
        }
        if (Math.abs(paidAmount - netReturnTotal) > 0.02) {
          return res.status(400).json({
            error: `Walk-in return: paid_amount must equal net return total (Rs ${netReturnTotal}).`,
          });
        }
      } else if (paidAmount > 0.009 || payment_account_id) {
        return res.status(400).json({
          error: 'Walk-in return has no net amount; do not send paid_amount or payment account.',
        });
      }
    } else if (paidAmount > 0 && !payment_account_id) {
      return res.status(400).json({
        error: 'payment_account_id is required when paid_amount > 0',
      });
    } else if (payment_account_id && paidAmount <= 0) {
      return res.status(400).json({
        error: 'paid_amount must be greater than 0 when payment_account_id is set',
      });
    }

    if (payment_account_id) {
      const payAcc = await prisma.account.findUnique({
        where: { id: payment_account_id as string },
        include: { Subgroup: true },
      });
      if (!payAcc || payAcc.status !== 'Active') {
        return res.status(400).json({ error: 'Invalid payment account' });
      }
      const sg = payAcc.Subgroup?.code || '';
      if (!isRefundCashOrBankSubgroupCode(sg)) {
        return res.status(400).json({
          error: 'Payment account must be a Cash (subgroup 102) or Bank (103) account',
        });
      }
    }

    const invoiceNoBase = String(invoice.invoiceNo || '').trim();
    if (!invoiceNoBase) {
      return res.status(400).json({
        error: 'Invoice must have an invoice number to generate a return reference.',
      });
    }

    const partRollup = new Map<
      string,
      { totalReturnQty: number; weightedSaleCostSum: number }
    >();
    for (const row of validatedItems) {
      let agg = partRollup.get(row.partId);
      if (!agg) {
        agg = { totalReturnQty: 0, weightedSaleCostSum: 0 };
        partRollup.set(row.partId, agg);
      }
      agg.totalReturnQty += row.returnQuantity;
      agg.weightedSaleCostSum += row.avgCostAtSale * row.returnQuantity;
    }

    const salesReturn = await prisma.$transaction(async (tx) => {
      const prefix = `${invoiceNoBase}-`;
      const existingForInvoice = await tx.salesReturn.findMany({
        where: { salesInvoiceId: invoice_id },
        select: { returnNumber: true },
      });
      let maxSeq = SALES_RETURN_START_NO - 1;
      for (const row of existingForInvoice) {
        const rn = row.returnNumber;
        if (!rn || !rn.startsWith(prefix)) continue;
        const tail = rn.slice(prefix.length);
        if (/^\d+$/.test(tail)) {
          const n = parseInt(tail, 10);
          if (!Number.isNaN(n)) maxSeq = Math.max(maxSeq, n);
        }
      }
      const returnNumber = `${invoiceNoBase}-${maxSeq + 1}`;

      const partSnapshotAvg = new Map<string, number>();
      const partNewAvg = new Map<string, number>();

      for (const [partId, roll] of partRollup) {
        const part = await tx.part.findUnique({
          where: { id: partId },
          select: { avgCost: true, cost: true },
        });
        const currentAvg =
          Number(part?.avgCost ?? part?.cost ?? 0) || 0;
        const currentStock = await getPartStockFromMovements(tx, partId);
        const totalRet = roll.totalReturnQty;
        const saleAvg =
          totalRet > 0 ? roll.weightedSaleCostSum / totalRet : 0;
        const denom = currentStock + totalRet;
        let newAvg = currentAvg;
        if (denom > 0) {
          newAvg =
            (currentAvg * currentStock + saleAvg * totalRet) / denom;
        } else if (totalRet > 0) {
          newAvg = saleAvg;
        }
        newAvg = Math.round(newAvg * 10000) / 10000;
        if (!Number.isFinite(newAvg)) newAvg = currentAvg;

        partSnapshotAvg.set(partId, currentAvg);
        partNewAvg.set(partId, newAvg);
      }

      const salesReturnItemsWithIds = validatedItems.map((item) => ({
        id: crypto.randomUUID(),
        partId: item.partId,
        returnQuantity: item.returnQuantity,
        originalSalePrice: item.originalSalePrice,
        avgCost: partSnapshotAvg.get(item.partId) ?? 0,
        amount: item.amount,
      }));

      const created = await tx.salesReturn.create({
        data: {
          id: crypto.randomUUID(),
          returnNumber,
          SalesInvoice: { connect: { id: invoice_id } },
          ...(invoice.customerId
            ? { Customer: { connect: { id: invoice.customerId } } }
            : {}),
          returnDate: new Date(return_date),
          reason: reason || null,
          status: 'pending',
          subtotal: returnSubtotal,
          tax: returnTax,
          taxPercentage: taxPct,
          deduction,
          totalAmount: netReturnTotal,
          paidAmount,
          ...(payment_account_id && paidAmount > 0
            ? {
                PaymentAccount: {
                  connect: { id: payment_account_id as string },
                },
              }
            : {}),
          createdBy: created_by || 'System',
          updatedAt: new Date(),
          SalesReturnItem: {
            create: salesReturnItemsWithIds,
          },
        } as any,
        include: {
          SalesReturnItem: {
            include: {
              Part: true,
            },
          },
          SalesInvoice: true,
        },
      });

      for (const [partId, newAvgCost] of partNewAvg) {
        await tx.part.update({
          where: { id: partId },
          data: {
            avgCost: newAvgCost,
            costUpdatedAt: new Date(),
          },
        });
      }

      return created;
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
        SalesInvoice: {
          include: {
            SalesInvoiceItem: {
              include: { InvoiceRackShelf: true },
            },
          },
        },
      },
    }) as any;

    if (!salesReturn) {
      return res.status(404).json({ error: 'Sales return not found' });
    }

    if (salesReturn.status !== 'pending') {
      return res.status(400).json({ error: `Cannot approve return with status: ${salesReturn.status}` });
    }

    // ========== STEP 1: RESTORE PartRackShelf + STOCK MOVEMENTS (IN) ==========
    const invoiceLineItems: any[] =
      salesReturn.SalesInvoice?.SalesInvoiceItem || [];
    const stockMovements: any[] = [];

    for (const item of salesReturn.SalesReturnItem) {
      const invoiceItem = invoiceLineItems.find(
        (i: any) => i.partId === item.partId,
      );
      const invNo =
        salesReturn.SalesInvoice?.invoiceNo || salesReturn.salesInvoiceId;

      const outs = await prisma.stockMovement.findMany({
        where: {
          partId: item.partId,
          referenceId: salesReturn.salesInvoiceId,
          referenceType: 'sales_invoice',
          type: { in: ['out', 'OUT'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      const R = item.returnQuantity;
      const bucketMap = new Map<
        string,
        { loc: ShelfLoc; qty: number }
      >();

      for (const m of outs) {
        const key = `${m.storeId ?? ''}|${m.rackId ?? ''}|${m.shelfId ?? ''}`;
        const prev = bucketMap.get(key);
        const q = Number(m.quantity) || 0;
        if (prev) prev.qty += q;
        else {
          bucketMap.set(key, {
            loc: {
              storeId: m.storeId,
              rackId: m.rackId,
              shelfId: m.shelfId,
            },
            qty: q,
          });
        }
      }

      const buckets = Array.from(bucketMap.values());
      const totalOut = buckets.reduce((a, b) => a + b.qty, 0);

      let allocations: Array<{ loc: ShelfLoc; qty: number }> = [];

      if (totalOut > 0) {
        const weights = buckets.map((b) => b.qty);
        const parts = distributeIntegerProportional(R, weights);
        allocations = buckets
          .map((b, i) => ({ loc: b.loc, qty: parts[i] }))
          .filter((x) => x.qty > 0);
      } else if (invoiceItem?.InvoiceRackShelf?.length) {
        const irs: any[] = invoiceItem.InvoiceRackShelf;
        const weights = irs.map((row) => Number(row.quantity) || 0);
        const wsum = weights.reduce((a, b) => a + b, 0);
        if (wsum > 0) {
          const parts = distributeIntegerProportional(R, weights);
          allocations = irs
            .map((row, i) => ({
              loc: {
                storeId: row.storeId,
                rackId: row.rackId,
                shelfId: row.shelfId,
              },
              qty: parts[i],
            }))
            .filter((x) => x.qty > 0);
        }
      }

      if (allocations.length === 0) {
        const movement = await prisma.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            partId: item.partId,
            type: 'in',
            quantity: R,
            referenceType: 'sales_return',
            referenceId: salesReturn.id,
            notes: `Sales Return ${salesReturn.returnNumber} - Invoice ${invNo}`,
          },
        });
        stockMovements.push(movement);
        continue;
      }

      for (const a of allocations) {
        const prs = await prisma.partRackShelf.findFirst({
          where: {
            partId: item.partId,
            storeId: a.loc.storeId,
            rackId: a.loc.rackId,
            shelfId: a.loc.shelfId,
          },
        });
        if (prs) {
          await prisma.partRackShelf.update({
            where: { id: prs.id },
            data: { quantity: { increment: a.qty } },
          });
        } else {
          await prisma.partRackShelf.create({
            data: {
              id: crypto.randomUUID(),
              partId: item.partId,
              storeId: a.loc.storeId,
              rackId: a.loc.rackId,
              shelfId: a.loc.shelfId,
              quantity: a.qty,
            },
          });
        }

        const movement = await prisma.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            partId: item.partId,
            type: 'in',
            quantity: a.qty,
            storeId: a.loc.storeId,
            rackId: a.loc.rackId,
            shelfId: a.loc.shelfId,
            referenceType: 'sales_return',
            referenceId: salesReturn.id,
            notes: `Sales Return ${salesReturn.returnNumber} - Invoice ${invNo}`,
          },
        });
        stockMovements.push(movement);
      }
    }

    // ========== STEP 2: CREATE ACCOUNTING VOUCHERS ==========

    async function getNextVoucherNumber(prefix: string): Promise<string> {
      const lastVoucher = await prisma.voucher.findFirst({
        where: { voucherNumber: { startsWith: prefix } },
        orderBy: { voucherNumber: 'desc' },
      });
      let nextNum = 1;
      if (lastVoucher) {
        const match = lastVoucher.voucherNumber.match(/\d+$/);
        if (match) {
          nextNum = parseInt(match[0], 10) + 1;
        }
      }
      return `${prefix}${String(nextNum).padStart(4, '0')}`;
    }

    const accountByIdOrCode = async (envId: string | undefined, code: string) => {
      if (envId) {
        const acc = await prisma.account.findUnique({
          where: { id: envId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (acc) return acc;
      }
      return prisma.account.findFirst({
        where: { status: 'Active', code },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
    };

    async function applyJvBalanceUpdates(entries: Array<{ accountId: string | null | undefined; debit: number; credit: number }>) {
      for (const e of entries) {
        if (!e.accountId) continue;
        const acc = await prisma.account.findUnique({
          where: { id: e.accountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (!acc) continue;
        const nature =
          ((acc as any).Subgroup?.MainGroup?.type as string | undefined)?.toLowerCase() || '';
        const isDRNature = ['asset', 'expense', 'cost'].includes(nature);
        await prisma.account.update({
          where: { id: e.accountId },
          data: {
            currentBalance: {
              increment: isDRNature ? e.debit - e.credit : e.credit - e.debit,
            },
          },
        });
      }
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;

    const invoiceData =
      salesReturn.SalesInvoice ||
      (await prisma.salesInvoice.findUnique({
        where: { id: salesReturn.salesInvoiceId },
        include: { SalesInvoiceItem: true },
      }));

    const isWalking = invoiceData?.customerType === 'walking';

    let customerAccountReg: any = null;
    if (invoiceData?.customerId && !isWalking) {
      customerAccountReg = await prisma.account.findFirst({
        where: {
          status: 'Active',
          OR: [
            { customerId: invoiceData.customerId },
            { name: invoiceData.customerName || '' },
          ],
        },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
    }
    if (!customerAccountReg && invoiceData?.customerId && !isWalking) {
      customerAccountReg = await accountByIdOrCode(undefined, '105001');
    }

    const isRegisteredCustomer =
      !!invoiceData?.customerId && !isWalking && !!customerAccountReg;

    let retSubtotal = round2(Number(salesReturn.subtotal));
    const retTax = round2(Number(salesReturn.tax));
    const retDeduction = round2(Number(salesReturn.deduction));
    if (!Number.isFinite(retSubtotal) || retSubtotal === 0) {
      retSubtotal = round2(
        salesReturn.SalesReturnItem.reduce(
          (s: number, it: any) => s + Number(it.amount || 0),
          0,
        ),
      );
    }

    const vouchers: any[] = [];

    if (isRegisteredCustomer) {
      const inventoryAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_INVENTORY,
        '101001',
      );
      const costAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_COST_INVENTORY,
        '901001',
      );
      const goodsRevenueAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GOODS_SOLD,
        '701001',
      );
      let discountAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GOODS_SOLD_DISCOUNT,
        '502001',
      );
      if (!discountAccount) {
        discountAccount = await accountByIdOrCode(undefined, '701002');
      }
      const gstAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GST as string | undefined,
        '401001',
      );

      if (!inventoryAccount || !costAccount || !goodsRevenueAccount) {
        return res.status(400).json({
          error:
            'Registered return: need Inventory (101001 / ACCOUNT_ID_INVENTORY), Cost Inventory (901001), Goods Sold (701001).',
        });
      }
      if (retDeduction > 0 && !discountAccount) {
        return res.status(400).json({
          error:
            'Return has deduction: configure Goods Sold Discount (502001 / 701002 or ACCOUNT_ID_GOODS_SOLD_DISCOUNT).',
        });
      }
      if (retTax > 0 && !gstAccount) {
        return res.status(400).json({
          error: 'Return has GST: configure GST account (401001 or ACCOUNT_ID_GST).',
        });
      }

      const jvEntries: Array<{
        accountId: string;
        accountName: string;
        description?: string;
        debit: number;
        credit: number;
        sortOrder: number;
        salesInvoiceId?: string;
      }> = [];
      let sortIdx = 0;

      for (const item of salesReturn.SalesReturnItem) {
        const part =
          item.Part ||
          (await prisma.part.findUnique({
            where: { id: item.partId },
            select: { partNo: true, avgCost: true, cost: true },
          }));
        const unitCost = Number(part?.avgCost ?? part?.cost ?? 0);
        const lineCost = round2(unitCost * item.returnQuantity);
        if (lineCost <= 0) continue;
        const partNo = part?.partNo || item.partId;
        jvEntries.push({
          accountId: inventoryAccount.id,
          accountName: `${inventoryAccount.code ?? ''}-${inventoryAccount.name}`,
          description: `SR ${salesReturn.returnNumber} - ${partNo} (inventory) @ ${unitCost} × ${item.returnQuantity}`,
          debit: lineCost,
          credit: 0,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
        jvEntries.push({
          accountId: costAccount.id,
          accountName: `${costAccount.code ?? ''}-${costAccount.name}`,
          description: `SR ${salesReturn.returnNumber} - ${partNo} (cost inventory)`,
          debit: 0,
          credit: lineCost,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      if (retSubtotal > 0) {
        jvEntries.push({
          accountId: goodsRevenueAccount.id,
          accountName: `${goodsRevenueAccount.code ?? ''}-${goodsRevenueAccount.name}`,
          description: `SR ${salesReturn.returnNumber} - Goods Sold (subtotal)`,
          debit: retSubtotal,
          credit: 0,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
        jvEntries.push({
          accountId: customerAccountReg.id,
          accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
          description: `SR ${salesReturn.returnNumber} - Customer ${invoiceData.customerName || ''} (subtotal)`,
          debit: 0,
          credit: retSubtotal,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      if (retDeduction > 0 && discountAccount) {
        jvEntries.push({
          accountId: discountAccount.id,
          accountName: `${discountAccount.code ?? ''}-${discountAccount.name}`,
          description: `SR ${salesReturn.returnNumber} - Goods Sold Discount`,
          debit: 0,
          credit: retDeduction,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
        jvEntries.push({
          accountId: customerAccountReg.id,
          accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
          description: `SR ${salesReturn.returnNumber} - Customer (deduction)`,
          debit: retDeduction,
          credit: 0,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      if (retTax > 0 && gstAccount) {
        jvEntries.push({
          accountId: gstAccount.id,
          accountName: `${gstAccount.code ?? ''}-${gstAccount.name}`,
          description: `SR ${salesReturn.returnNumber} - GST`,
          debit: retTax,
          credit: 0,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
        jvEntries.push({
          accountId: customerAccountReg.id,
          accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
          description: `SR ${salesReturn.returnNumber} - Customer (GST)`,
          debit: 0,
          credit: retTax,
          sortOrder: sortIdx++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      const jvDebit = jvEntries.reduce((s, e) => s + e.debit, 0);
      const jvCredit = jvEntries.reduce((s, e) => s + e.credit, 0);
      if (jvEntries.length === 0) {
        return res.status(400).json({ error: 'No journal lines generated for this sales return' });
      }
      if (Math.abs(jvDebit - jvCredit) > 0.02) {
        return res.status(400).json({
          error: `Return JV not balanced (DR ${jvDebit} vs CR ${jvCredit}). Check subtotal, tax, deduction and inventory costs.`,
        });
      }

      const jvNo = await getNextVoucherNumber('JV');
      const jv = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: jvNo,
          type: 'journal',
          date: salesReturn.returnDate,
          narration: `Sales Return ${salesReturn.returnNumber} — Registered (${invoiceData.customerName || ''})`,
          totalDebit: jvDebit,
          totalCredit: jvCredit,
          status: 'posted',
          isSystemGenerated: true,
          salesInvoiceId: salesReturn.salesInvoiceId,
          salesReturnId: salesReturn.id,
          createdBy: approved_by || 'System',
          approvedBy: approved_by || 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: jvEntries.map((e) => ({
              id: crypto.randomUUID(),
              accountId: e.accountId,
              accountName: e.accountName,
              description: e.description,
              debit: e.debit,
              credit: e.credit,
              sortOrder: e.sortOrder,
              salesInvoiceId: e.salesInvoiceId,
            })),
          },
        } as any,
        include: { VoucherEntry: true },
      });
      vouchers.push(jv);
      await applyJvBalanceUpdates(jvEntries);
    } else if (isWalking) {
      const inventoryAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_INVENTORY,
        '101001',
      );
      const costAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_COST_INVENTORY,
        '901001',
      );
      const goodsRevenueAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GOODS_SOLD,
        '701001',
      );
      let discountAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GOODS_SOLD_DISCOUNT,
        '502001',
      );
      if (!discountAccount) {
        discountAccount = await accountByIdOrCode(undefined, '701002');
      }
      const gstAccount = await accountByIdOrCode(
        process.env.ACCOUNT_ID_GST as string | undefined,
        '401001',
      );

      if (!inventoryAccount || !costAccount || !goodsRevenueAccount) {
        return res.status(400).json({
          error:
            'Walk-in return: need Inventory (101001), Cost Inventory (901001), Goods Sold (701001).',
        });
      }
      if (retDeduction > 0 && !discountAccount) {
        return res.status(400).json({
          error: 'Walk-in return has deduction: configure Goods Sold Discount (502001 / 701002).',
        });
      }
      if (retTax > 0 && !gstAccount) {
        return res.status(400).json({
          error: 'Walk-in return has tax: configure GST (401001).',
        });
      }

      if (!salesReturn.paymentAccountId) {
        return res.status(400).json({
          error: 'Walk-in return approval requires paymentAccountId (cash/bank) on the return.',
        });
      }
      const payAcc = await prisma.account.findUnique({
        where: { id: salesReturn.paymentAccountId },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
      if (!payAcc || payAcc.status !== 'Active') {
        return res.status(400).json({ error: 'Walk-in return payment account not found' });
      }
      const paySg = payAcc.Subgroup?.code || '';
      if (!isRefundCashOrBankSubgroupCode(paySg)) {
        return res.status(400).json({
          error: 'Walk-in refund must use a Cash (102) or Bank (103) account',
        });
      }

      const netPay = round2(Number(salesReturn.totalAmount));
      const paidStored = round2(Number(salesReturn.paidAmount) || 0);
      if (netPay > 0.009 && Math.abs(netPay - paidStored) > 0.02) {
        return res.status(400).json({
          error: 'Walk-in return: paidAmount must equal net return total on the return record.',
        });
      }

      const jvInvEntries: Array<{
        accountId: string;
        accountName: string;
        description?: string;
        debit: number;
        credit: number;
        sortOrder: number;
        salesInvoiceId?: string;
      }> = [];
      let invSort = 0;
      for (const item of salesReturn.SalesReturnItem) {
        const part =
          item.Part ||
          (await prisma.part.findUnique({
            where: { id: item.partId },
            select: { partNo: true, avgCost: true, cost: true },
          }));
        const unitCost = Number(part?.avgCost ?? part?.cost ?? 0);
        const lineCost = round2(unitCost * item.returnQuantity);
        if (lineCost <= 0) continue;
        const partNo = part?.partNo || item.partId;
        jvInvEntries.push({
          accountId: inventoryAccount.id,
          accountName: `${inventoryAccount.code ?? ''}-${inventoryAccount.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — ${partNo} inventory @ ${unitCost} × ${item.returnQuantity}`,
          debit: lineCost,
          credit: 0,
          sortOrder: invSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
        jvInvEntries.push({
          accountId: costAccount.id,
          accountName: `${costAccount.code ?? ''}-${costAccount.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — ${partNo} cost inventory`,
          debit: 0,
          credit: lineCost,
          sortOrder: invSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      if (jvInvEntries.length === 0 && salesReturn.SalesReturnItem.length > 0) {
        return res.status(400).json({
          error: 'Walk-in inventory JV has no lines (check part average costs).',
        });
      }

      const jvInvDebit = jvInvEntries.reduce((s, e) => s + e.debit, 0);
      const jvInvCredit = jvInvEntries.reduce((s, e) => s + e.credit, 0);
      if (jvInvEntries.length > 0 && Math.abs(jvInvDebit - jvInvCredit) > 0.02) {
        return res.status(400).json({ error: 'Walk-in inventory JV is not balanced' });
      }

      let invJv: any = null;
      if (jvInvEntries.length > 0) {
        const jvWalkInvNo = await getNextVoucherNumber('JV');
        invJv = await prisma.voucher.create({
          data: {
            id: crypto.randomUUID(),
            voucherNumber: jvWalkInvNo,
            type: 'journal',
            date: salesReturn.returnDate,
            narration: `Sales Return ${salesReturn.returnNumber} — Walk-in inventory (avg cost)`,
            totalDebit: jvInvDebit,
            totalCredit: jvInvCredit,
            status: 'posted',
            isSystemGenerated: true,
            salesInvoiceId: salesReturn.salesInvoiceId,
            salesReturnId: salesReturn.id,
            createdBy: approved_by || 'System',
            approvedBy: approved_by || 'System',
            approvedAt: new Date(),
            updatedAt: new Date(),
            VoucherEntry: {
              create: jvInvEntries.map((e) => ({
                id: crypto.randomUUID(),
                accountId: e.accountId,
                accountName: e.accountName,
                description: e.description,
                debit: e.debit,
                credit: e.credit,
                sortOrder: e.sortOrder,
                salesInvoiceId: e.salesInvoiceId,
              })),
            },
          } as any,
          include: { VoucherEntry: true },
        });
        vouchers.push(invJv);
        await applyJvBalanceUpdates(jvInvEntries);
      }

      const pvEntries: typeof jvInvEntries = [];
      let pvSort = 0;
      if (retSubtotal > 0) {
        pvEntries.push({
          accountId: goodsRevenueAccount.id,
          accountName: `${goodsRevenueAccount.code ?? ''}-${goodsRevenueAccount.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — Goods Sold (subtotal)`,
          debit: retSubtotal,
          credit: 0,
          sortOrder: pvSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }
      if (retDeduction > 0 && discountAccount) {
        pvEntries.push({
          accountId: discountAccount.id,
          accountName: `${discountAccount.code ?? ''}-${discountAccount.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — Goods Sold Discount`,
          debit: 0,
          credit: retDeduction,
          sortOrder: pvSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }
      if (retTax > 0 && gstAccount) {
        pvEntries.push({
          accountId: gstAccount.id,
          accountName: `${gstAccount.code ?? ''}-${gstAccount.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — GST`,
          debit: retTax,
          credit: 0,
          sortOrder: pvSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }
      if (netPay > 0) {
        pvEntries.push({
          accountId: payAcc.id,
          accountName: `${payAcc.code ?? ''}-${payAcc.name}`,
          description: `SR ${salesReturn.returnNumber} walk-in — Refund from ${payAcc.name}`,
          debit: 0,
          credit: netPay,
          sortOrder: pvSort++,
          salesInvoiceId: salesReturn.salesInvoiceId,
        });
      }

      const pvDr = pvEntries.reduce((s, e) => s + e.debit, 0);
      const pvCr = pvEntries.reduce((s, e) => s + e.credit, 0);
      if (pvEntries.length === 0) {
        return res.status(400).json({ error: 'Walk-in return: no payment voucher lines generated' });
      }
      if (Math.abs(pvDr - pvCr) > 0.02) {
        return res.status(400).json({
          error: `Walk-in PV not balanced (DR ${pvDr} vs CR ${pvCr}). Check subtotal, tax, deduction, total.`,
        });
      }

      const lastPV = await prisma.voucher.findFirst({
        where: { type: 'payment', voucherNumber: { startsWith: 'PV' } },
        orderBy: { voucherNumber: 'desc' },
      });
      let pvNum = 1;
      if (lastPV?.voucherNumber) {
        const m = lastPV.voucherNumber.match(/^PV(\d+)$/);
        if (m) pvNum = parseInt(m[1], 10) + 1;
      }
      const pvNo = `PV${String(pvNum).padStart(4, '0')}`;

      const walkPv = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: pvNo,
          type: 'payment',
          date: salesReturn.returnDate,
          narration: `Sales Return ${salesReturn.returnNumber} — Walk-in refund (PV)`,
          cashBankAccount: payAcc.name,
          totalDebit: pvDr,
          totalCredit: pvCr,
          status: 'posted',
          isSystemGenerated: true,
          salesInvoiceId: salesReturn.salesInvoiceId,
          salesReturnId: salesReturn.id,
          createdBy: approved_by || 'System',
          approvedBy: approved_by || 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: pvEntries.map((e) => ({
              id: crypto.randomUUID(),
              accountId: e.accountId,
              accountName: e.accountName,
              description: e.description,
              debit: e.debit,
              credit: e.credit,
              sortOrder: e.sortOrder,
              salesInvoiceId: e.salesInvoiceId,
            })),
          },
        } as any,
        include: { VoucherEntry: true },
      });
      vouchers.push(walkPv);
      await applyJvBalanceUpdates(pvEntries);
    } else {
      const inventoryAccount = await prisma.account.findFirst({
        where: {
          Subgroup: { code: '104' },
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
            { name: { contains: 'Sales Revenue', mode: 'insensitive' } },
          ],
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
            { name: { contains: 'COGS', mode: 'insensitive' } },
          ],
        },
        include: { Subgroup: { include: { MainGroup: true } } },
      });

      if (!inventoryAccount || !salesRevenueAccount || !cogsAccount) {
        return res.status(400).json({
          error:
            'Required accounts not found (non‑walking return without registered customer). Need Inventory (104), Sales Revenue / Goods Sold, COGS.',
        });
      }

      let customerAccount: any = null;
      if (invoiceData?.customerId) {
        customerAccount = await prisma.account.findFirst({
          where: {
            name: { contains: invoiceData.customerName },
            Subgroup: { code: '105' },
            status: 'Active',
          },
        });
      }

      const cashAccount = await prisma.account.findFirst({
        where: {
          Subgroup: { code: '101' },
          status: 'Active',
        },
      });

      const creditAccount = customerAccount || cashAccount;
      if (!creditAccount) {
        return res.status(400).json({ error: 'Cash or Customer AR account not found' });
      }

      const jv1Number = await getNextVoucherNumber('JV');
      const jv1Entries = [
        {
          accountId: salesRevenueAccount.id,
          accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
          description: `Reverse revenue for return ${salesReturn.returnNumber}`,
          debit: salesReturn.totalAmount,
          credit: 0,
          sortOrder: 0,
        },
        {
          accountId: creditAccount.id,
          accountName: `${creditAccount.code}-${creditAccount.name}`,
          description: `Refund to customer for return ${salesReturn.returnNumber}`,
          debit: 0,
          credit: salesReturn.totalAmount,
          sortOrder: 1,
        },
      ];

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
          salesInvoiceId: salesReturn.salesInvoiceId,
          salesReturnId: salesReturn.id,
          createdBy: approved_by || 'System',
          approvedBy: approved_by || 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: jv1Entries.map((e) => ({
              id: crypto.randomUUID(),
              accountId: e.accountId!,
              accountName: e.accountName,
              description: e.description,
              debit: e.debit,
              credit: e.credit,
              sortOrder: e.sortOrder,
            })),
          },
        } as any,
      });
      vouchers.push(jv1);

      await prisma.account.update({
        where: { id: salesRevenueAccount.id },
        data: { currentBalance: { decrement: salesReturn.totalAmount } },
      });
      await prisma.account.update({
        where: { id: creditAccount.id },
        data: { currentBalance: { decrement: salesReturn.totalAmount } },
      });

      const jv2Number = await getNextVoucherNumber('JV');
      let totalCOGS = 0;

      const invLines: any[] =
        salesReturn.SalesInvoice?.SalesInvoiceItem || invoiceData?.SalesInvoiceItem || [];
      for (const item of salesReturn.SalesReturnItem) {
        const invLine = invLines.find((i: any) => i.partId === item.partId);
        const cogsPerUnit = Number(invLine?.avgCost) || 0;
        totalCOGS += item.returnQuantity * cogsPerUnit;
      }
      totalCOGS = round2(totalCOGS);

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
          salesInvoiceId: salesReturn.salesInvoiceId,
          salesReturnId: salesReturn.id,
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
        } as any,
      });
      vouchers.push(jv2);

      await prisma.account.update({
        where: { id: inventoryAccount.id },
        data: { currentBalance: { increment: totalCOGS } },
      });
      await prisma.account.update({
        where: { id: cogsAccount.id },
        data: { currentBalance: { decrement: totalCOGS } },
      });
    }

    const refundPaid = round2(Number(salesReturn.paidAmount) || 0);
    if (refundPaid > 0 && isRegisteredCustomer && customerAccountReg) {
      if (!salesReturn.paymentAccountId) {
        return res.status(400).json({
          error:
            'Return has paid amount but no payment account stored; delete and recreate with cash/bank selected.',
        });
      }
      if (refundPaid > round2(Number(salesReturn.totalAmount)) + 0.01) {
        return res.status(400).json({ error: 'Paid amount exceeds return total' });
      }
      const payAcc = await prisma.account.findUnique({
        where: { id: salesReturn.paymentAccountId },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
      if (!payAcc || payAcc.status !== 'Active') {
        return res.status(400).json({ error: 'Refund payment account not found' });
      }
      const paySg = payAcc.Subgroup?.code || '';
      if (!isRefundCashOrBankSubgroupCode(paySg)) {
        return res.status(400).json({
          error: 'Refund must use a Cash (102) or Bank (103) account',
        });
      }
      const lastPV = await prisma.voucher.findFirst({
        where: { type: 'payment', voucherNumber: { startsWith: 'PV' } },
        orderBy: { voucherNumber: 'desc' },
      });
      let pvNum = 1;
      if (lastPV?.voucherNumber) {
        const m = lastPV.voucherNumber.match(/^PV(\d+)$/);
        if (m) pvNum = parseInt(m[1], 10) + 1;
      }
      const pvNo = `PV${String(pvNum).padStart(4, '0')}`;
      // PV: CR cash/bank (money out), DR customer receivable — registered return refund
      const pvEntries = [
        {
          accountId: payAcc.id,
          accountName: `${payAcc.code ?? ''}-${payAcc.name}`,
          description: `SR ${salesReturn.returnNumber} — Cash/bank paid Rs ${refundPaid}`,
          debit: 0,
          credit: refundPaid,
          sortOrder: 0,
          salesInvoiceId: salesReturn.salesInvoiceId,
        },
        {
          accountId: customerAccountReg.id,
          accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
          description: `SR ${salesReturn.returnNumber} — Customer debit Rs ${refundPaid}`,
          debit: refundPaid,
          credit: 0,
          sortOrder: 1,
          salesInvoiceId: salesReturn.salesInvoiceId,
        },
      ];
      const refundPv = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: pvNo,
          type: 'payment',
          date: salesReturn.returnDate,
          narration: `Sales Return ${salesReturn.returnNumber} — PV refund (CR ${payAcc.name}, DR customer) Rs ${refundPaid}`,
          cashBankAccount: payAcc.name,
          totalDebit: refundPaid,
          totalCredit: refundPaid,
          status: 'posted',
          isSystemGenerated: true,
          salesInvoiceId: salesReturn.salesInvoiceId,
          salesReturnId: salesReturn.id,
          createdBy: approved_by || 'System',
          approvedBy: approved_by || 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: pvEntries.map((e) => ({
              id: crypto.randomUUID(),
              accountId: e.accountId,
              accountName: e.accountName,
              description: e.description,
              debit: e.debit,
              credit: e.credit,
              sortOrder: e.sortOrder,
              salesInvoiceId: e.salesInvoiceId,
            })),
          },
        } as any,
        include: { VoucherEntry: true },
      });
      vouchers.push(refundPv);
      await applyJvBalanceUpdates(pvEntries);
    }

    // Walk-in refunds use JV1 against the selected cash/bank account only (no customer PV).

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
      vouchers,
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
