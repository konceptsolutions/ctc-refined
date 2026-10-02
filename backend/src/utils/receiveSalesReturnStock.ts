/**
 * Store receive for Sale Return / Direct Sale Return — creates stock IN + PartRackShelf.
 * Called after Sales approves (status=approved); sets status=completed.
 */
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  directReturnUnitCostForItem,
} from './directSalesReturnApprove';

type ShelfLoc = {
  storeId: string | null;
  rackId: string | null;
  shelfId: string | null;
};

export type ReceiveLocationLine = {
  item_id?: string;
  part_id?: string;
  store_id?: string | null;
  rack_id?: string | null;
  shelf_id?: string | null;
  quantity?: number;
};

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

async function upsertPartRackShelf(
  tx: Prisma.TransactionClient,
  partId: string,
  loc: ShelfLoc,
  qty: number,
) {
  if (!loc.storeId && !loc.rackId && !loc.shelfId) return;
  const prs = await tx.partRackShelf.findFirst({
    where: {
      partId,
      storeId: loc.storeId,
      rackId: loc.rackId,
      shelfId: loc.shelfId,
    },
  });
  if (prs) {
    await tx.partRackShelf.update({
      where: { id: prs.id },
      data: { quantity: { increment: qty } },
    });
  } else {
    await tx.partRackShelf.create({
      data: {
        id: crypto.randomUUID(),
        partId,
        storeId: loc.storeId,
        rackId: loc.rackId,
        shelfId: loc.shelfId,
        quantity: qty,
      },
    });
  }
}

type SalesReturnForReceive = {
  id: string;
  returnNumber: string;
  isDirectReturn: boolean;
  salesInvoiceId?: string | null;
  legacyInvoiceNo?: string | null;
  SalesInvoice?: {
    invoiceNo?: string | null;
    SalesInvoiceItem?: Array<{
      partId: string;
      InvoiceRackShelf?: Array<{
        storeId?: string | null;
        rackId?: string | null;
        shelfId?: string | null;
        quantity?: number | null;
      }>;
    }>;
  } | null;
  SalesReturnItem: Array<{
    id: string;
    partId: string;
    returnQuantity: number;
    avgCost: number;
    Part?: {
      partNo?: string | null;
      avgCost?: number | null;
      cost?: number | null;
    } | null;
  }>;
};

function resolveExplicitAllocations(
  item: SalesReturnForReceive['SalesReturnItem'][0],
  locations: ReceiveLocationLine[] | undefined,
  defaultStoreId?: string | null,
): Array<{ loc: ShelfLoc; qty: number }> | null {
  if (!locations?.length) return null;
  const matched = locations.filter(
    (l) =>
      (l.item_id && l.item_id === item.id) ||
      (l.part_id && l.part_id === item.partId),
  );
  if (!matched.length) return null;

  const allocations: Array<{ loc: ShelfLoc; qty: number }> = [];
  let remaining = item.returnQuantity;
  for (const m of matched) {
    const qty =
      m.quantity != null && Number.isFinite(Number(m.quantity))
        ? Math.max(0, Math.floor(Number(m.quantity)))
        : remaining;
    if (qty <= 0) continue;
    allocations.push({
      loc: {
        storeId: m.store_id ?? defaultStoreId ?? null,
        rackId: m.rack_id ?? null,
        shelfId: m.shelf_id ?? null,
      },
      qty,
    });
    remaining -= qty;
  }
  if (allocations.length === 0) return null;
  const total = allocations.reduce((s, a) => s + a.qty, 0);
  if (total !== item.returnQuantity) {
    throw new Error(
      `Receive qty for part ${item.Part?.partNo || item.partId} must equal return qty ${item.returnQuantity} (got ${total})`,
    );
  }
  return allocations;
}

async function autoAllocationsFromInvoiceOut(
  item: SalesReturnForReceive['SalesReturnItem'][0],
  salesReturn: SalesReturnForReceive,
): Promise<Array<{ loc: ShelfLoc; qty: number }>> {
  const invoiceLineItems = salesReturn.SalesInvoice?.SalesInvoiceItem || [];
  const invoiceItem = invoiceLineItems.find((i) => i.partId === item.partId);
  const R = item.returnQuantity;

  const outs = await prisma.stockMovement.findMany({
    where: {
      partId: item.partId,
      referenceId: salesReturn.salesInvoiceId || undefined,
      referenceType: 'sales_invoice',
      type: { in: ['out', 'OUT'] },
    },
    orderBy: { createdAt: 'asc' },
  });

  const bucketMap = new Map<string, { loc: ShelfLoc; qty: number }>();
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

  if (totalOut > 0) {
    const weights = buckets.map((b) => b.qty);
    const parts = distributeIntegerProportional(R, weights);
    return buckets
      .map((b, i) => ({ loc: b.loc, qty: parts[i] }))
      .filter((x) => x.qty > 0);
  }

  if (invoiceItem?.InvoiceRackShelf?.length) {
    const irs = invoiceItem.InvoiceRackShelf;
    const weights = irs.map((row) => Number(row.quantity) || 0);
    const wsum = weights.reduce((a, b) => a + b, 0);
    if (wsum > 0) {
      const parts = distributeIntegerProportional(R, weights);
      return irs
        .map((row, i) => ({
          loc: {
            storeId: row.storeId ?? null,
            rackId: row.rackId ?? null,
            shelfId: row.shelfId ?? null,
          },
          qty: parts[i],
        }))
        .filter((x) => x.qty > 0);
    }
  }

  return [];
}

export async function receiveSalesReturnStock(
  salesReturn: SalesReturnForReceive,
  opts?: {
    storeId?: string | null;
    locations?: ReceiveLocationLine[];
    receivedBy?: string;
  },
): Promise<{ stockMovements: unknown[] }> {
  const existing = await prisma.stockMovement.findFirst({
    where: {
      referenceId: salesReturn.id,
      referenceType: salesReturn.isDirectReturn
        ? 'sales_return_direct'
        : 'sales_return',
      type: { in: ['in', 'IN'] },
    },
  });
  if (existing) {
    throw new Error('This return has already been stocked in');
  }

  const defaultStoreId = opts?.storeId || null;
  const stockMovements: unknown[] = [];
  const invNo =
    salesReturn.SalesInvoice?.invoiceNo ||
    salesReturn.legacyInvoiceNo ||
    salesReturn.salesInvoiceId ||
    '';
  const refType = salesReturn.isDirectReturn
    ? 'sales_return_direct'
    : 'sales_return';
  const notes = salesReturn.isDirectReturn
    ? `Direct Sales Return ${salesReturn.returnNumber} — legacy invoice ${invNo}`
    : `Sales Return ${salesReturn.returnNumber} - Invoice ${invNo}`;

  await prisma.$transaction(async (tx) => {
    for (const item of salesReturn.SalesReturnItem) {
      let allocations =
        resolveExplicitAllocations(item, opts?.locations, defaultStoreId) ||
        [];

      if (allocations.length === 0 && !salesReturn.isDirectReturn) {
        allocations = await autoAllocationsFromInvoiceOut(item, salesReturn);
      }

      if (allocations.length === 0) {
        const loc: ShelfLoc = {
          storeId: defaultStoreId,
          rackId: null,
          shelfId: null,
        };
        allocations = [{ loc, qty: item.returnQuantity }];
      }

      for (const a of allocations) {
        const storeId = a.loc.storeId ?? defaultStoreId;
        if (a.loc.storeId || a.loc.rackId || a.loc.shelfId || storeId) {
          await upsertPartRackShelf(tx, item.partId, {
            storeId,
            rackId: a.loc.rackId,
            shelfId: a.loc.shelfId,
          }, a.qty);
        }

        const movement = await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            partId: item.partId,
            type: 'in',
            quantity: a.qty,
            storeId: storeId,
            rackId: a.loc.rackId,
            shelfId: a.loc.shelfId,
            referenceType: refType,
            referenceId: salesReturn.id,
            notes,
          },
        });
        stockMovements.push(movement);
      }
    }

    // Direct returns: update weighted average cost on receive (was on approve)
    if (salesReturn.isDirectReturn) {
      const partRollup = new Map<
        string,
        { totalReturnQty: number; weightedCostSum: number }
      >();
      for (const item of salesReturn.SalesReturnItem) {
        const unit = directReturnUnitCostForItem(item as any);
        let agg = partRollup.get(item.partId);
        if (!agg) {
          agg = { totalReturnQty: 0, weightedCostSum: 0 };
          partRollup.set(item.partId, agg);
        }
        agg.totalReturnQty += item.returnQuantity;
        agg.weightedCostSum += unit * item.returnQuantity;
      }

      for (const [partId, roll] of partRollup) {
        const part = await tx.part.findUnique({
          where: { id: partId },
          select: { avgCost: true, cost: true },
        });
        const currentAvg = Number(part?.avgCost) || 0;
        const costPrice = Number(part?.cost) || 0;
        const returnQty = roll.totalReturnQty;
        const returnAvg = returnQty > 0 ? roll.weightedCostSum / returnQty : 0;

        let newAvg: number;
        if (currentAvg <= 0 && costPrice > 0) {
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
    }

    await tx.salesReturn.update({
      where: { id: salesReturn.id },
      data: {
        status: 'completed',
        updatedAt: new Date(),
      },
    });
  });

  return { stockMovements };
}
