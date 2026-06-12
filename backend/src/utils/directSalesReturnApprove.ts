/**
 * Approve flow for direct (legacy) sales returns — separate from invoice-linked returns.
 * Uses SalesReturnItem.avgCost snapshot (current avg at save time), not invoice line cost.
 */
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';

type SalesReturnWithItems = {
  id: string;
  returnNumber: string;
  returnDate: Date;
  legacyInvoiceNo?: string | null;
  legacyCustomerName?: string | null;
  customerType?: string | null;
  customerId?: string | null;
  salesInvoiceId?: string | null;
  paymentAccountId?: string | null;
  subtotal: number;
  tax: number;
  deduction: number;
  totalAmount: number;
  paidAmount: number;
  Customer?: { name?: string | null } | null;
  SalesReturnItem: Array<{
    id: string;
    partId: string;
    returnQuantity: number;
    avgCost: number;
    amount: number;
    Part?: { partNo?: string | null; avgCost?: number | null; cost?: number | null } | null;
  }>;
};

function isRefundCashOrBankSubgroupCode(
  subgroupCode: string | null | undefined,
): boolean {
  const sg = String(subgroupCode ?? '').trim();
  if (!sg) return false;
  return sg.startsWith('102') || sg.startsWith('103');
}

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

async function getNextVoucherNumber(prefix: string): Promise<string> {
  const lastVoucher = await prisma.voucher.findFirst({
    where: { voucherNumber: { startsWith: prefix } },
    orderBy: { voucherNumber: 'desc' },
  });
  let nextNum = 1;
  if (lastVoucher) {
    const match = lastVoucher.voucherNumber.match(/\d+$/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}

async function accountByIdOrCode(envId: string | undefined, code: string) {
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
}

async function applyJvBalanceUpdates(
  entries: Array<{
    accountId: string | null | undefined;
    debit: number;
    credit: number;
  }>,
) {
  for (const e of entries) {
    if (!e.accountId) continue;
    const acc = await prisma.account.findUnique({
      where: { id: e.accountId },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
    if (!acc) continue;
    const nature =
      ((acc as any).Subgroup?.MainGroup?.type as string | undefined)?.toLowerCase() ||
      '';
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

/**
 * Direct return unit cost: use avgCost when > 0, otherwise fall back to cost price.
 * (avgCost of 0 is treated as "no avg", not as a valid cost.)
 */
export function resolveDirectReturnUnitCost(
  avgCost: number | null | undefined,
  cost: number | null | undefined,
): number {
  const avg = Number(avgCost);
  if (Number.isFinite(avg) && avg > 0) return avg;
  const c = Number(cost);
  if (Number.isFinite(c) && c > 0) return c;
  return 0;
}

/** Unit cost for direct return COGS: line snapshot, then live part master. */
function directReturnUnitCost(item: SalesReturnWithItems['SalesReturnItem'][0]): number {
  const fromSnap = resolveDirectReturnUnitCost(item.avgCost, undefined);
  if (fromSnap > 0) return fromSnap;
  const p = item.Part;
  return resolveDirectReturnUnitCost(p?.avgCost, p?.cost);
}

export async function approveDirectSalesReturn(
  salesReturn: SalesReturnWithItems,
  approvedBy?: string,
): Promise<{
  salesReturn: unknown;
  stockMovements: unknown[];
  vouchers: unknown[];
}> {
  const legacyRef = salesReturn.legacyInvoiceNo || salesReturn.returnNumber;
  const customerName =
    salesReturn.legacyCustomerName || salesReturn.Customer?.name || '';
  const isWalking = (salesReturn.customerType || 'walking') === 'walking';
  const stockMovements: unknown[] = [];
  const vouchers: unknown[] = [];

  const partsMissingCost: string[] = [];
  for (const item of salesReturn.SalesReturnItem) {
    const unitCost = directReturnUnitCost(item);
    if (unitCost > 0) continue;
    const partNo = item.Part?.partNo?.trim();
    partsMissingCost.push(partNo || item.partId);
  }
  if (partsMissingCost.length > 0) {
    const label = partsMissingCost.join(', ');
    throw new Error(
      `Cannot approve direct return: avg cost and cost price are both zero for part(s): ${label}. Set cost on the part (purchase, adjustment, or part master) before approving.`,
    );
  }

  // —— Stock IN + weighted avg update (on approve, not on create) ——
  const partRollup = new Map<
    string,
    { totalReturnQty: number; weightedCostSum: number }
  >();
  for (const item of salesReturn.SalesReturnItem) {
    const unit = directReturnUnitCost(item);
    let agg = partRollup.get(item.partId);
    if (!agg) {
      agg = { totalReturnQty: 0, weightedCostSum: 0 };
      partRollup.set(item.partId, agg);
    }
    agg.totalReturnQty += item.returnQuantity;
    agg.weightedCostSum += unit * item.returnQuantity;
  }

  await prisma.$transaction(async (tx) => {
    for (const item of salesReturn.SalesReturnItem) {
      const movement = await tx.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          partId: item.partId,
          type: 'in',
          quantity: item.returnQuantity,
          referenceType: 'sales_return_direct',
          referenceId: salesReturn.id,
          notes: `Direct Sales Return ${salesReturn.returnNumber} — legacy invoice ${legacyRef}`,
        },
      });
      stockMovements.push(movement);
    }

    for (const [partId, roll] of partRollup) {
      const part = await tx.part.findUnique({
        where: { id: partId },
        select: { avgCost: true, cost: true },
      });
      const currentAvg = Number(part?.avgCost) || 0;
      const costPrice = Number(part?.cost) || 0;
      const returnQty = roll.totalReturnQty;
      const returnAvg =
        returnQty > 0 ? roll.weightedCostSum / returnQty : 0;

      let newAvg: number;
      if (currentAvg <= 0 && costPrice > 0) {
        // No avg cost: adopt cost price for inventory valuation
        newAvg = costPrice;
      } else if (currentAvg > 0 && returnAvg > 0) {
        const currentStock = await getPartStockFromMovements(tx, partId);
        const stockBeforeReturn = currentStock - returnQty;
        const denom = stockBeforeReturn + returnQty;
        if (denom > 0 && returnQty > 0) {
          newAvg =
            (currentAvg * stockBeforeReturn + returnAvg * returnQty) / denom;
        } else {
          newAvg = returnAvg;
        }
      } else {
        newAvg = returnAvg > 0 ? returnAvg : currentAvg;
      }

      newAvg = Math.round(newAvg * 10000) / 10000;
      if (!Number.isFinite(newAvg) || newAvg < 0) newAvg = currentAvg;

      if (newAvg > 0) {
        await tx.part.update({
          where: { id: partId },
          data: {
            avgCost: newAvg,
            costUpdatedAt: new Date(),
          },
        });
      }
    }
  });

  let retSubtotal = round2(Number(salesReturn.subtotal));
  const retTax = round2(Number(salesReturn.tax));
  const retDeduction = round2(Number(salesReturn.deduction));
  if (!Number.isFinite(retSubtotal) || retSubtotal === 0) {
    retSubtotal = round2(
      salesReturn.SalesReturnItem.reduce(
        (s, it) => s + Number(it.amount || 0),
        0,
      ),
    );
  }

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
    throw new Error(
      'Direct return: need Inventory (101001), Cost Inventory (901001), Goods Sold (701001).',
    );
  }
  if (retDeduction > 0 && !discountAccount) {
    throw new Error(
      'Direct return has deduction: configure Goods Sold Discount (502001 / 701002).',
    );
  }
  if (retTax > 0 && !gstAccount) {
    throw new Error('Direct return has GST: configure GST account (401001).');
  }

  type VoucherLine = {
    accountId: string;
    accountName: string;
    description?: string;
    debit: number;
    credit: number;
    sortOrder: number;
  };

  const inventoryJvLines: VoucherLine[] = [];
  let sortIdx = 0;
  for (const item of salesReturn.SalesReturnItem) {
    const unitCost = directReturnUnitCost(item);
    const lineCost = round2(unitCost * item.returnQuantity);
    if (lineCost <= 0) continue;
    const partNo = item.Part?.partNo || item.partId;
    inventoryJvLines.push({
      accountId: inventoryAccount.id,
      accountName: `${inventoryAccount.code ?? ''}-${inventoryAccount.name}`,
      description: `Direct SR ${salesReturn.returnNumber} — ${partNo} inventory @ ${unitCost} × ${item.returnQuantity}`,
      debit: lineCost,
      credit: 0,
      sortOrder: sortIdx++,
    });
    inventoryJvLines.push({
      accountId: costAccount.id,
      accountName: `${costAccount.code ?? ''}-${costAccount.name}`,
      description: `Direct SR ${salesReturn.returnNumber} — ${partNo} cost inventory`,
      debit: 0,
      credit: lineCost,
      sortOrder: sortIdx++,
    });
  }

  if (
    inventoryJvLines.length === 0 &&
    salesReturn.SalesReturnItem.length > 0
  ) {
    throw new Error(
      'Direct return inventory JV has no lines (check part average costs on return lines).',
    );
  }

  if (inventoryJvLines.length > 0) {
    const jvDebit = inventoryJvLines.reduce((s, e) => s + e.debit, 0);
    const jvCredit = inventoryJvLines.reduce((s, e) => s + e.credit, 0);
    if (Math.abs(jvDebit - jvCredit) > 0.02) {
      throw new Error('Direct return inventory JV is not balanced');
    }
    const jvNo = await getNextVoucherNumber('JV');
    const invJv = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber: jvNo,
        type: 'journal',
        date: salesReturn.returnDate,
        narration: `Direct Sales Return ${salesReturn.returnNumber} — inventory (legacy ${legacyRef})`,
        totalDebit: jvDebit,
        totalCredit: jvCredit,
        status: 'posted',
        isSystemGenerated: true,
        salesReturnId: salesReturn.id,
        createdBy: approvedBy || 'System',
        approvedBy: approvedBy || 'System',
        approvedAt: new Date(),
        updatedAt: new Date(),
        VoucherEntry: {
          create: inventoryJvLines.map((e) => ({
            id: crypto.randomUUID(),
            accountId: e.accountId,
            accountName: e.accountName,
            description: e.description,
            debit: e.debit,
            credit: e.credit,
            sortOrder: e.sortOrder,
          })),
        },
      } as any,
      include: { VoucherEntry: true },
    });
    vouchers.push(invJv);
    await applyJvBalanceUpdates(inventoryJvLines);
  }

  if (isWalking) {
    if (!salesReturn.paymentAccountId) {
      throw new Error(
        'Walk-in direct return requires paymentAccountId (cash/bank refund account).',
      );
    }
    const payAcc = await prisma.account.findUnique({
      where: { id: salesReturn.paymentAccountId },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
    if (!payAcc || payAcc.status !== 'Active') {
      throw new Error('Direct return payment account not found');
    }
    if (!isRefundCashOrBankSubgroupCode(payAcc.Subgroup?.code || '')) {
      throw new Error('Direct return refund must use Cash (102) or Bank (103)');
    }

    const netPay = round2(Number(salesReturn.totalAmount));
    const paidStored = round2(Number(salesReturn.paidAmount) || 0);
    if (netPay > 0.009 && Math.abs(netPay - paidStored) > 0.02) {
      throw new Error(
        'Walk-in direct return: paidAmount must equal net return total.',
      );
    }

    const pvLines: VoucherLine[] = [];
    let pvSort = 0;
    if (retSubtotal > 0) {
      pvLines.push({
        accountId: goodsRevenueAccount.id,
        accountName: `${goodsRevenueAccount.code ?? ''}-${goodsRevenueAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — Goods Sold (subtotal)`,
        debit: retSubtotal,
        credit: 0,
        sortOrder: pvSort++,
      });
    }
    if (retDeduction > 0 && discountAccount) {
      pvLines.push({
        accountId: discountAccount.id,
        accountName: `${discountAccount.code ?? ''}-${discountAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — discount`,
        debit: 0,
        credit: retDeduction,
        sortOrder: pvSort++,
      });
    }
    if (retTax > 0 && gstAccount) {
      pvLines.push({
        accountId: gstAccount.id,
        accountName: `${gstAccount.code ?? ''}-${gstAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — GST`,
        debit: retTax,
        credit: 0,
        sortOrder: pvSort++,
      });
    }
    if (netPay > 0) {
      pvLines.push({
        accountId: payAcc.id,
        accountName: `${payAcc.code ?? ''}-${payAcc.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — refund from ${payAcc.name}`,
        debit: 0,
        credit: netPay,
        sortOrder: pvSort++,
      });
    }

    if (pvLines.length === 0) {
      throw new Error('Walk-in direct return: no payment voucher lines generated');
    }
    const pvDr = pvLines.reduce((s, e) => s + e.debit, 0);
    const pvCr = pvLines.reduce((s, e) => s + e.credit, 0);
    if (Math.abs(pvDr - pvCr) > 0.02) {
      throw new Error(`Walk-in direct PV not balanced (DR ${pvDr} vs CR ${pvCr})`);
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
        narration: `Direct Sales Return ${salesReturn.returnNumber} — walk-in refund (legacy ${legacyRef})`,
        cashBankAccount: payAcc.name,
        totalDebit: pvDr,
        totalCredit: pvCr,
        status: 'posted',
        isSystemGenerated: true,
        salesReturnId: salesReturn.id,
        createdBy: approvedBy || 'System',
        approvedBy: approvedBy || 'System',
        approvedAt: new Date(),
        updatedAt: new Date(),
        VoucherEntry: {
          create: pvLines.map((e) => ({
            id: crypto.randomUUID(),
            accountId: e.accountId,
            accountName: e.accountName,
            description: e.description,
            debit: e.debit,
            credit: e.credit,
            sortOrder: e.sortOrder,
          })),
        },
      } as any,
      include: { VoucherEntry: true },
    });
    vouchers.push(walkPv);
    await applyJvBalanceUpdates(pvLines);
  } else {
    let customerAccountReg: any = null;
    if (salesReturn.customerId) {
      customerAccountReg = await prisma.account.findFirst({
        where: {
          status: 'Active',
          OR: [
            { customerId: salesReturn.customerId },
            { name: customerName },
          ],
        },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
    }
    if (!customerAccountReg && salesReturn.customerId) {
      customerAccountReg = await accountByIdOrCode(undefined, '105001');
    }
    if (!customerAccountReg) {
      throw new Error(
        'Party direct return: customer receivable account not found.',
      );
    }

    const revenueJvLines: VoucherLine[] = [];
    let revSort = 0;
    if (retSubtotal > 0) {
      revenueJvLines.push({
        accountId: goodsRevenueAccount.id,
        accountName: `${goodsRevenueAccount.code ?? ''}-${goodsRevenueAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — Goods Sold (subtotal)`,
        debit: retSubtotal,
        credit: 0,
        sortOrder: revSort++,
      });
      revenueJvLines.push({
        accountId: customerAccountReg.id,
        accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — ${customerName} (subtotal)`,
        debit: 0,
        credit: retSubtotal,
        sortOrder: revSort++,
      });
    }
    if (retDeduction > 0 && discountAccount) {
      revenueJvLines.push({
        accountId: discountAccount.id,
        accountName: `${discountAccount.code ?? ''}-${discountAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — discount`,
        debit: 0,
        credit: retDeduction,
        sortOrder: revSort++,
      });
      revenueJvLines.push({
        accountId: customerAccountReg.id,
        accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — customer (deduction)`,
        debit: retDeduction,
        credit: 0,
        sortOrder: revSort++,
      });
    }
    if (retTax > 0 && gstAccount) {
      revenueJvLines.push({
        accountId: gstAccount.id,
        accountName: `${gstAccount.code ?? ''}-${gstAccount.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — GST`,
        debit: retTax,
        credit: 0,
        sortOrder: revSort++,
      });
      revenueJvLines.push({
        accountId: customerAccountReg.id,
        accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
        description: `Direct SR ${salesReturn.returnNumber} — customer (GST)`,
        debit: 0,
        credit: retTax,
        sortOrder: revSort++,
      });
    }

    if (revenueJvLines.length === 0) {
      throw new Error('Party direct return: no revenue JV lines generated');
    }
    const revDr = revenueJvLines.reduce((s, e) => s + e.debit, 0);
    const revCr = revenueJvLines.reduce((s, e) => s + e.credit, 0);
    if (Math.abs(revDr - revCr) > 0.02) {
      throw new Error('Party direct return revenue JV is not balanced');
    }

    const revJvNo = await getNextVoucherNumber('JV');
    const revJv = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber: revJvNo,
        type: 'journal',
        date: salesReturn.returnDate,
        narration: `Direct Sales Return ${salesReturn.returnNumber} — revenue (legacy ${legacyRef}, ${customerName})`,
        totalDebit: revDr,
        totalCredit: revCr,
        status: 'posted',
        isSystemGenerated: true,
        salesReturnId: salesReturn.id,
        createdBy: approvedBy || 'System',
        approvedBy: approvedBy || 'System',
        approvedAt: new Date(),
        updatedAt: new Date(),
        VoucherEntry: {
          create: revenueJvLines.map((e) => ({
            id: crypto.randomUUID(),
            accountId: e.accountId,
            accountName: e.accountName,
            description: e.description,
            debit: e.debit,
            credit: e.credit,
            sortOrder: e.sortOrder,
          })),
        },
      } as any,
      include: { VoucherEntry: true },
    });
    vouchers.push(revJv);
    await applyJvBalanceUpdates(revenueJvLines);

    const refundPaid = round2(Number(salesReturn.paidAmount) || 0);
    if (refundPaid > 0) {
      if (!salesReturn.paymentAccountId) {
        throw new Error(
          'Party direct return with paid amount requires payment account on the return.',
        );
      }
      const payAcc = await prisma.account.findUnique({
        where: { id: salesReturn.paymentAccountId },
        include: { Subgroup: { include: { MainGroup: true } } },
      });
      if (!payAcc || payAcc.status !== 'Active') {
        throw new Error('Direct return refund payment account not found');
      }
      if (!isRefundCashOrBankSubgroupCode(payAcc.Subgroup?.code || '')) {
        throw new Error('Direct return refund must use Cash (102) or Bank (103)');
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

      const pvLines: VoucherLine[] = [
        {
          accountId: payAcc.id,
          accountName: `${payAcc.code ?? ''}-${payAcc.name}`,
          description: `Direct SR ${salesReturn.returnNumber} — cash/bank paid Rs ${refundPaid}`,
          debit: 0,
          credit: refundPaid,
          sortOrder: 0,
        },
        {
          accountId: customerAccountReg.id,
          accountName: `${customerAccountReg.code ?? ''}-${customerAccountReg.name}`,
          description: `Direct SR ${salesReturn.returnNumber} — customer debit Rs ${refundPaid}`,
          debit: refundPaid,
          credit: 0,
          sortOrder: 1,
        },
      ];

      const refundPv = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: pvNo,
          type: 'payment',
          date: salesReturn.returnDate,
          narration: `Direct Sales Return ${salesReturn.returnNumber} — PV refund Rs ${refundPaid}`,
          cashBankAccount: payAcc.name,
          totalDebit: refundPaid,
          totalCredit: refundPaid,
          status: 'posted',
          isSystemGenerated: true,
          salesReturnId: salesReturn.id,
          createdBy: approvedBy || 'System',
          approvedBy: approvedBy || 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: pvLines.map((e) => ({
              id: crypto.randomUUID(),
              accountId: e.accountId,
              accountName: e.accountName,
              description: e.description,
              debit: e.debit,
              credit: e.credit,
              sortOrder: e.sortOrder,
            })),
          },
        } as any,
        include: { VoucherEntry: true },
      });
      vouchers.push(refundPv);
      await applyJvBalanceUpdates(pvLines);
    }
  }

  const updatedReturn = await prisma.salesReturn.update({
    where: { id: salesReturn.id },
    data: {
      status: 'completed',
      approvedBy: approvedBy || 'System',
      approvedAt: new Date(),
    },
    include: {
      SalesReturnItem: { include: { Part: true } },
      Customer: true,
    },
  });

  return {
    salesReturn: updatedReturn,
    stockMovements,
    vouchers,
  };
}
