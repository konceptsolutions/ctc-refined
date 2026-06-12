import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { resolveDirectReturnUnitCost } from './directSalesReturnApprove';

const SALES_RETURN_START_NO = 97;

export function isRefundCashOrBankSubgroupCode(
  subgroupCode: string | null | undefined,
): boolean {
  const sg = String(subgroupCode ?? '').trim();
  if (!sg) return false;
  return sg.startsWith('102') || sg.startsWith('103');
}

export type DirectReturnItemInput = {
  partId: string;
  returnQuantity: number;
  originalSalePrice: number;
  avgCostAtSale: number;
  amount: number;
};

export type ParsedDirectReturnInput = {
  legacyInvoiceNo: string;
  returnDate: Date;
  reason: string | null;
  customerType: 'walking' | 'registered';
  customerId: string | null;
  legacyCustomerName: string;
  taxPct: number;
  returnSubtotal: number;
  returnTax: number;
  grossReturnAfterTax: number;
  deduction: number;
  netReturnTotal: number;
  paidAmount: number;
  paymentAccountId: string | null;
  validatedItems: DirectReturnItemInput[];
};

export async function nextDirectReturnNumber(
  tx: Prisma.TransactionClient,
  legacyInvoiceNo: string,
): Promise<string> {
  const prefix = `${legacyInvoiceNo}-`;
  const existingForLegacy = await tx.salesReturn.findMany({
    where: {
      isDirectReturn: true,
      legacyInvoiceNo,
    },
    select: { returnNumber: true },
  });
  let maxSeq = SALES_RETURN_START_NO - 1;
  for (const row of existingForLegacy) {
    const rn = row.returnNumber;
    if (!rn || !rn.startsWith(prefix)) continue;
    const tail = rn.slice(prefix.length);
    if (/^\d+$/.test(tail)) {
      const n = parseInt(tail, 10);
      if (!Number.isNaN(n)) maxSeq = Math.max(maxSeq, n);
    }
  }
  return `${legacyInvoiceNo}-${maxSeq + 1}`;
}

export async function parseDirectReturnBody(
  body: Record<string, unknown>,
): Promise<ParsedDirectReturnInput> {
  const {
    legacy_invoice_no,
    return_date,
    reason,
    customer_type,
    customer_id,
    legacy_customer_name,
    tax_percentage: taxPctRaw,
    items,
    deduction: deductionRaw,
    payment_account_id,
    paid_amount: paidAmountRaw,
  } = body;

  const legacyInvoiceNo = String(legacy_invoice_no || '').trim();
  if (!legacyInvoiceNo || !return_date || !Array.isArray(items) || !items.length) {
    throw new Error(
      'Missing required fields: legacy_invoice_no, return_date, items',
    );
  }

  const customerType =
    String(customer_type || 'walking').toLowerCase() === 'registered'
      ? 'registered'
      : 'walking';
  const isWalkingCustomer = customerType === 'walking';

  let customerId: string | null =
    customer_id && String(customer_id).trim()
      ? String(customer_id).trim()
      : null;
  let legacyCustomerName = String(legacy_customer_name || '').trim();

  if (!isWalkingCustomer) {
    if (!customerId) {
      throw new Error('Party sale direct return requires customer_id');
    }
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    if (!customer) {
      throw new Error('Customer not found');
    }
    legacyCustomerName = legacyCustomerName || customer.name || '';
  } else if (!legacyCustomerName) {
    throw new Error('Walk-in direct return requires legacy_customer_name');
  }

  let taxPct =
    taxPctRaw === undefined || taxPctRaw === null ? 0 : Number(taxPctRaw);
  if (!Number.isFinite(taxPct) || taxPct < 0) {
    throw new Error('Invalid tax_percentage');
  }

  let totalReturnAmount = 0;
  const validatedItems: DirectReturnItemInput[] = [];

  for (const item of items as Array<Record<string, unknown>>) {
    const partId = String(item.part_id || '').trim();
    const returnQty = Number(item.return_quantity);
    const unitPrice = Number(item.unit_price);

    if (!partId || !returnQty || returnQty <= 0) {
      throw new Error('Each item needs part_id and positive return_quantity');
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Each item needs a valid unit_price');
    }

    const part = await prisma.part.findUnique({
      where: { id: partId },
      select: { id: true, avgCost: true, cost: true },
    });
    if (!part) {
      throw new Error(`Part not found: ${partId}`);
    }

    const itemAmount = Math.round(returnQty * unitPrice * 100) / 100;
    totalReturnAmount += itemAmount;
    validatedItems.push({
      partId,
      returnQuantity: returnQty,
      originalSalePrice: unitPrice,
      avgCostAtSale: resolveDirectReturnUnitCost(part.avgCost, part.cost),
      amount: itemAmount,
    });
  }

  const returnSubtotal = Math.round(totalReturnAmount * 100) / 100;
  let returnTax = 0;
  let grossReturnAfterTax = returnSubtotal;
  if (taxPct > 0) {
    returnTax = Math.round(returnSubtotal * (taxPct / 100) * 100) / 100;
    grossReturnAfterTax =
      Math.round((returnSubtotal + returnTax) * 100) / 100;
  }

  let deduction =
    deductionRaw === undefined || deductionRaw === null
      ? 0
      : Number(deductionRaw);
  if (!Number.isFinite(deduction) || deduction < 0) {
    throw new Error('Invalid deduction');
  }
  deduction = Math.round(deduction * 100) / 100;
  if (deduction > grossReturnAfterTax + 1e-6) {
    throw new Error(
      `Deduction cannot exceed return amount after tax (max Rs ${grossReturnAfterTax})`,
    );
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
    throw new Error('Invalid paid_amount');
  }
  paidAmount = Math.round(paidAmount * 100) / 100;
  if (paidAmount > netReturnTotal + 1e-6) {
    throw new Error(
      `paid_amount cannot exceed return net total (${netReturnTotal})`,
    );
  }

  const paymentAccountId =
    payment_account_id && String(payment_account_id).trim()
      ? String(payment_account_id).trim()
      : null;

  if (isWalkingCustomer) {
    if (netReturnTotal > 0.009) {
      if (!paymentAccountId) {
        throw new Error(
          'Walk-in direct return requires payment_account_id (cash/bank to refund from).',
        );
      }
      if (Math.abs(paidAmount - netReturnTotal) > 0.02) {
        throw new Error(
          `Walk-in direct return: paid_amount must equal net return total (Rs ${netReturnTotal}).`,
        );
      }
    } else if (paidAmount > 0.009 || paymentAccountId) {
      throw new Error(
        'Walk-in direct return has no net amount; do not send paid_amount or payment account.',
      );
    }
  } else if (paidAmount > 0 && !paymentAccountId) {
    throw new Error('payment_account_id is required when paid_amount > 0');
  } else if (paymentAccountId && paidAmount <= 0) {
    throw new Error(
      'paid_amount must be greater than 0 when payment_account_id is set',
    );
  }

  if (paymentAccountId) {
    const payAcc = await prisma.account.findUnique({
      where: { id: paymentAccountId },
      include: { Subgroup: true },
    });
    if (!payAcc || payAcc.status !== 'Active') {
      throw new Error('Invalid payment account');
    }
    const sg = payAcc.Subgroup?.code || '';
    if (!isRefundCashOrBankSubgroupCode(sg)) {
      throw new Error(
        'Payment account must be a Cash (subgroup 102) or Bank (103) account',
      );
    }
  }

  return {
    legacyInvoiceNo,
    returnDate: new Date(String(return_date)),
    reason: reason != null && String(reason).trim() ? String(reason).trim() : null,
    customerType,
    customerId: isWalkingCustomer ? null : customerId,
    legacyCustomerName,
    taxPct,
    returnSubtotal,
    returnTax,
    grossReturnAfterTax,
    deduction,
    netReturnTotal,
    paidAmount,
    paymentAccountId: paidAmount > 0 ? paymentAccountId : null,
    validatedItems,
  };
}

export function buildDirectReturnItemsCreate(
  validatedItems: DirectReturnItemInput[],
): Array<{
  id: string;
  partId: string;
  returnQuantity: number;
  originalSalePrice: number;
  avgCost: number;
  amount: number;
}> {
  const partSnapshotAvg = new Map<string, number>();
  for (const item of validatedItems) {
    if (!partSnapshotAvg.has(item.partId)) {
      partSnapshotAvg.set(item.partId, item.avgCostAtSale);
    }
  }
  return validatedItems.map((item) => ({
    id: crypto.randomUUID(),
    partId: item.partId,
    returnQuantity: item.returnQuantity,
    originalSalePrice: item.originalSalePrice,
    avgCost: partSnapshotAvg.get(item.partId) ?? item.avgCostAtSale,
    amount: item.amount,
  }));
}
