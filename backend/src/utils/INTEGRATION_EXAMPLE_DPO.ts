/**
 * EXAMPLE: Direct Purchase Order Integration with Formulas
 * 
 * This file shows EXACTLY how to integrate the inventory formulas
 * into the existing DPO route in /backend/src/routes/inventory.ts
 * 
 * Copy the relevant parts into your actual route file.
 */

import express, { Request, Response } from 'express';
import crypto from 'crypto';
import prisma from '../config/database';
import {
  processPurchaseReceive,
  calculateStockQuantity,
} from './inventoryFormulas';

const router = express.Router();

/**
 * EXAMPLE 1: Create Direct Purchase Order
 * 
 * Location: /backend/src/routes/inventory.ts
 * Route: POST /direct-purchase-orders
 * Line: ~3895
 * 
 * This shows how to integrate processPurchaseReceive() when creating a DPO
 */
router.post('/direct-purchase-orders', async (req: Request, res: Response) => {
  try {
    let { dpo_number, date, store_id, supplier_id, account, description, status, items, expenses } = req.body;

    if (!date || !items || items.length === 0) {
      return res.status(400).json({ error: 'date and items are required' });
    }

    // Generate DPO number (existing logic - keep as is)
    if (!dpo_number) {
      const year = new Date(date).getFullYear();
      const lastDPO = await prisma.directPurchaseOrder.findFirst({
        where: { dpoNumber: { startsWith: `DPO-${year}-` } },
        orderBy: { dpoNumber: 'desc' },
      });
      let nextNum = 1;
      if (lastDPO) {
        const match = lastDPO.dpoNumber.match(new RegExp(`^DPO-${year}-(\\d+)$`));
        if (match) nextNum = parseInt(match[1]) + 1;
      }
      dpo_number = `DPO-${year}-${String(nextNum).padStart(3, '0')}`;
    }

    // ========================================================================
    // NEW: Apply Inventory Formulas
    // ========================================================================

    // Calculate total expenses
    const totalExpenses = expenses?.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0) || 0;

    // Process purchase receive with formulas
    // This will:
    // 1. Distribute expenses across items
    // 2. Calculate landed cost per item
    // 3. Update average cost for each part
    // 4. Return detailed results
    const receiveResult = await processPurchaseReceive(
      items.map((item: any) => ({
        partId: item.part_id,
        quantity: item.quantity || 0,
        purchasePrice: item.purchase_price || 0,
      })),
      totalExpenses,
      'value', // distribute expenses by item value (proportional)
      'dpo'    // Use the DPO average cost formula
    );

    // ========================================================================
    // Continue with normal DPO creation (existing logic)
    // ========================================================================

    // Calculate totals
    const itemsTotal = items.reduce((sum: number, item: any) => {
      return sum + (item.amount || (item.purchase_price * item.quantity));
    }, 0);

    const grandTotal = itemsTotal + totalExpenses;

    // Create DPO record (existing logic)
    const newOrder = await prisma.directPurchaseOrder.create({
      data: {
        id: crypto.randomUUID(),
        dpoNumber: dpo_number,
        date: new Date(date),
        storeId: store_id || null,
        supplierId: supplier_id || null,
        account: account || null,
        description: description || null,
        status: status || 'Order Receivable Pending',
        totalAmount: grandTotal,
        updatedAt: new Date(),
        DirectPurchaseOrderItem: {
          create: items.map((item: any, index: number) => {
            // Get the formula result for this item
            const formulaItem = receiveResult.items[index];

            return {
              id: crypto.randomUUID(),
              partId: item.part_id,
              quantity: item.quantity || 0,
              unitPrice: item.unit_price || 0,
              purchasePrice: item.purchase_price || 0,
              priceA: item.price_a ?? null,
              priceB: item.price_b ?? null,
              priceM: item.price_m ?? null,
              weight: item.weight ?? null,
              amount: item.amount || (item.purchase_price * item.quantity),
              // ⭐ NEW: Store the calculated landed cost
              landedCost: formulaItem.landedCost,
              distributedExpense: formulaItem.expensePerUnit * formulaItem.quantity,
            } as any;
          }),
        },
        DirectPurchaseOrderExpense: expenses && expenses.length > 0 ? {
          create: expenses.map((exp: any) => ({
            id: crypto.randomUUID(),
            expenseType: exp.expense_type,
            payableAccount: exp.payable_account,
            amount: exp.amount,
          })),
        } : undefined,
      },
      include: {
        DirectPurchaseOrderItem: { include: { Part: true } },
        DirectPurchaseOrderExpense: true,
      },
    });

    // ========================================================================
    // NEW: Create Stock Movements with Landed Cost
    // ========================================================================

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const formulaItem = receiveResult.items[i];

      await prisma.stockMovement.create({
        data: {
          id: crypto.randomUUID(),
          partId: item.part_id,
          quantity: item.quantity || 0,
          type: 'in',
          referenceType: 'direct_purchase',
          referenceId: newOrder.id,
          notes: `DPO ${dpo_number} - Direct Purchase Receive`,
        },
      });
    }

    // ========================================================================
    // NEW: Create Payment Voucher (PV) with Inventory Debit
    // ========================================================================

    // Get required accounts
    const inventoryAccount = await prisma.account.findFirst({
      where: { code: '101' }, // Inventory Asset
    });

    const cashBankAccount = account ? await prisma.account.findFirst({
      where: { id: account },
    }) : null;

    if (inventoryAccount && cashBankAccount) {
      // Create Payment Voucher
      const voucherNumber = `PV-${new Date().getFullYear()}-${String(await getNextVoucherNumber()).padStart(4, '0')}`;

      await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber,
          type: 'payment',
          date: new Date(date),
          narration: `DPO ${dpo_number} - Inventory Purchase`,
          totalDebit: grandTotal,
          totalCredit: grandTotal,
          status: 'posted',
          createdBy: 'System',
          approvedBy: 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: [
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: `DPO ${dpo_number} - Inventory Purchase`,
                debit: grandTotal,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: cashBankAccount.id,
                accountName: `${cashBankAccount.code}-${cashBankAccount.name}`,
                description: `DPO ${dpo_number} - Payment to Supplier`,
                debit: 0,
                credit: grandTotal,
                sortOrder: 1,
              },
            ],
          },
        },
      });

    }

    // Return response with formula results
    res.status(201).json({
      success: true,
      dpo: newOrder,
      formulas: {
        totalExpenses,
        itemsProcessed: receiveResult.items.length,
        averageCostsUpdated: receiveResult.items.map(item => ({
          partId: item.partId,
          oldAvgCost: item.oldAvgCost,
          newAvgCost: item.newAvgCost,
          landedCost: item.landedCost,
        })),
      },
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * EXAMPLE 2: Update Direct Purchase Order
 * 
 * Location: /backend/src/routes/inventory.ts
 * Route: PUT /direct-purchase-orders/:id
 * Line: ~4732
 * 
 * Similar integration when updating a DPO
 */
router.put('/direct-purchase-orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { dpo_number, date, store_id, supplier_id, account, description, status, items, expenses } = req.body;

    const existingOrder = await prisma.directPurchaseOrder.findUnique({
      where: { id },
      include: { DirectPurchaseOrderItem: true },
    });

    if (!existingOrder) {
      return res.status(404).json({ error: 'Direct purchase order not found' });
    }

    // ========================================================================
    // NEW: Apply Formulas if items or status changed
    // ========================================================================

    let receiveResult = null;

    if (items && items.length > 0) {
      const totalExpenses = expenses?.reduce((sum: number, exp: any) => sum + (Number(exp.amount) || 0), 0) || 0;

      receiveResult = await processPurchaseReceive(
        items.map((item: any) => ({
          partId: item.part_id,
          quantity: item.quantity || 0,
          purchasePrice: item.purchase_price || 0,
        })),
        totalExpenses,
        'value'
      );
    }

    // Continue with existing update logic...
    // Use receiveResult data when updating items

    res.json({
      success: true,
      message: 'DPO updated',
      formulas: receiveResult ? {
        averageCostsUpdated: true,
        itemsProcessed: receiveResult.items.length,
      } : { averageCostsUpdated: false },
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Get next voucher number
 */
async function getNextVoucherNumber(): Promise<number> {
  const count = await prisma.voucher.count();
  return count + 1;
}

/**
 * EXAMPLE 3: Stock Check Endpoint (uses formula)
 */
router.get('/parts/:partId/stock', async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;

    // Use formula to calculate current stock
    const currentStock = await calculateStockQuantity(partId);

    // Get part details
    const part = await prisma.part.findUnique({
      where: { id: partId },
      select: {
        id: true,
        partNo: true,
        cost: true,
        reorderLevel: true,
      },
    });

    if (!part) {
      return res.status(404).json({ error: 'Part not found' });
    }

    // Calculate stock value
    const stockValue = currentStock * (part.cost || 0);

    // Check if below reorder level
    const belowReorderLevel = part.reorderLevel > 0 && currentStock <= part.reorderLevel;

    res.json({
      partId: part.id,
      partNo: part.partNo,
      currentStock,
      averageCost: part.cost,
      stockValue,
      reorderLevel: part.reorderLevel,
      belowReorderLevel,
      status: currentStock <= 0 ? 'out_of_stock' : belowReorderLevel ? 'low_stock' : 'in_stock',
    });

  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

/**
 * INTEGRATION NOTES:
 * 
 * 1. Copy the relevant parts from this file into your actual route file
 * 2. Import the formula functions at the top:
 *    import { processPurchaseReceive, calculateStockQuantity } from '../utils/inventoryFormulas';
 * 
 * 3. The key changes are:
 *    - Calculate totalExpenses from expenses array
 *    - Call processPurchaseReceive() before creating DPO
 *    - Use receiveResult to get landed costs and updated avg costs
 *    - Create stock movements with landed cost (not just purchase price)
 *    - Create Payment Voucher with inventory debit
 * 
 * 4. Database schema may need these fields added to DirectPurchaseOrderItem:
 *    - landedCost: Decimal?
 *    - distributedExpense: Decimal?
 * 
 * 5. Test thoroughly with the test scenarios from the documentation
 */
