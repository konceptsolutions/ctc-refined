/**
 * Inventory & Accounting Formulas Implementation
 * Reference: docs/ACCOUNTING_FORMULAS_WHEN_TO_RUN.md
 *
 * This file implements all inventory costing and accounting formulas
 * as documented in the accounting formulas guide.
 */

import prisma from "../config/database";
import { netStockFromMovements } from "./stockMovementBalance";

// ============================================================================
// 1. INVENTORY FORMULAS
// ============================================================================

/**
 * Formula 1.1: Calculate Stock Quantity
 * StockQty = TotalIn - TotalOut
 *
 * WHEN: Query current stock level
 * WHERE: Any stock check, availability check, reports
 */
export async function calculateStockQuantity(partId: string, tx?: any): Promise<number> {
  const client = tx || prisma;
  const movements = await client.stockMovement.findMany({
    where: { partId },
    select: { type: true, quantity: true, referenceType: true },
  });

  return netStockFromMovements(movements);
}

/**
 * Formula 1.2a: Weighted Average Cost (Standard Purchase)
 * AvgCostNew = (OldQty * OldAvgCost + NewQty * NewUnitCost) / (OldQty + NewQty)
 * 
 * WHEN: Standard purchase receive
 * @param oldQty - Current stock quantity
 * @param oldAvgCost - Current average cost
 * @param newQty - Quantity being received
 * @param newUnitCost - Unit cost of received items
 */
export function calculateAverageCostStandard(
  oldQty: number,
  oldAvgCost: number,
  newQty: number,
  newUnitCost: number,
): number {
  if (oldQty <= 0) return newUnitCost;
  if (newUnitCost === 0) return oldAvgCost;
  if (newQty <= 0) return oldAvgCost;

  const oldValue = oldQty * oldAvgCost;
  const newValue = newQty * newUnitCost;
  const totalQty = oldQty + newQty;

  return (oldValue + newValue) / totalQty;
}

/**
 * Formula 1.2b: Weighted Average Cost (DPO Formula)
 * AvgCostNew = (OldQty * OldAvgCost + NewQty * NewUnitCost) / (OldQty + NewQty)
 * 
 * WHEN: Standard purchase receive (DPO)
 * @param oldQty - Current stock quantity
 * @param oldAvgCost - Current average cost
 * @param newQty - Quantity being received
 * @param newUnitCost - Unit cost of received items (rate)
 */
export function calculateAverageCostDPO(
  oldQty: number,
  oldAvgCost: number,
  newQty: number,
  newUnitCost: number,
): number {
  if (oldQty <= 0) {
    return newUnitCost;
  }

  const oldValue = oldQty * oldAvgCost;
  const newValue = newQty * newUnitCost;
  const totalQty = oldQty + newQty;

  return (oldValue + newValue) / totalQty;
}

/**
 * Formula 1.2c: Weighted Average Cost (DPO Return Formula)
 * AvgCostNew = (OldQty * OldAvgCost - ReturnQty * Rate) / (OldQty - ReturnQty)
 * 
 * WHEN: Specific user-requested DPO Return calculation
 * @param oldQty - Current stock quantity (before return)
 * @param oldAvgCost - Current average cost
 * @param returnQty - Quantity being returned
 * @param rate - Original purchase rate
 */
export function calculateAverageCostDPOReturn(
  oldQty: number,
  oldAvgCost: number,
  returnQty: number,
  rate: number,
): number {
  const denominator = oldQty - returnQty;
  // If we return everything or more than we have (shouldn't happen), keep avg or set to 0
  if (denominator <= 0) {
    return oldAvgCost;
  }

  const oldValue = oldQty * oldAvgCost;
  const returnValue = returnQty * rate;

  return (oldValue - returnValue) / denominator;
}

/**
 * Formula 1.2: Calculate New Average Cost (Weighted Average)
 * AvgCostNew = (OldQty * OldAvgCost + NewQty * NewUnitCost) / (OldQty + NewQty)
 *
 * WHEN: On IN movements (PO receive, DPO receive, Adjust-IN)
 * WHERE: Purchase receiving, inventory adjustment
 *
 * @param oldQty - Current stock quantity before receive
 * @param oldAvgCost - Current average cost
 * @param newQty - Quantity being received
 * @param newUnitCost - Unit cost of received items (may include landed cost)
 * @returns New average cost
 */
export function calculateAverageCost(
  oldQty: number,
  oldAvgCost: number,
  newQty: number,
  newUnitCost: number,
): number {
  // Edge case 1: Zero or negative old quantity - use new unit cost directly
  if (oldQty <= 0) {
    return newUnitCost;
  }

  // Edge case 2: Zero new unit cost - don't update avg cost
  if (newUnitCost === 0) {
    return oldAvgCost;
  }

  // Edge case 3: Zero new quantity - keep old avg cost
  if (newQty <= 0) {
    return oldAvgCost;
  }

  // Standard weighted average calculation (Same as 1.2a)
  return calculateAverageCostStandard(oldQty, oldAvgCost, newQty, newUnitCost);
}

/**
 * Formula 1.3: Calculate Cost of Goods Sold (COGS)
 * COGS = SoldQty * AvgCost
 *
 * WHEN: At sales invoice posting
 * WHERE: Sales invoice posting logic
 *
 * @param soldQty - Quantity sold
 * @param avgCost - Average cost at time of sale
 * @returns COGS amount
 */
export function calculateCOGS(soldQty: number, avgCost: number): number {
  return soldQty * avgCost;
}

// ============================================================================
// 2. PURCHASING FORMULAS
// ============================================================================

/**
 * Formula 2.1: Calculate Average Purchase Price (for reporting)
 * AvgPurchasePrice = Sum(Qty * Price) / Sum(Qty)
 *
 * WHEN: For purchase history reporting
 * WHERE: Purchase reports, last purchase price display
 */
export function calculateAveragePurchasePrice(
  purchases: Array<{ quantity: number; price: number }>,
): number {
  const totalValue = purchases.reduce(
    (sum, p) => sum + p.quantity * p.price,
    0,
  );
  const totalQty = purchases.reduce((sum, p) => sum + p.quantity, 0);

  return totalQty > 0 ? totalValue / totalQty : 0;
}

/**
 * Formula 2.2: Calculate Average Expense Per Unit
 * AvgExpensePerUnit = TotalExpenses / TotalReceivedQty
 *
 * WHEN: During PO/DPO receive with expenses
 * WHERE: Expense allocation logic
 *
 * @param totalExpenses - Sum of all expenses
 * @param totalQty - Total quantity received
 * @returns Expense per unit
 */
export function calculateAverageExpensePerUnit(
  totalExpenses: number,
  totalQty: number,
): number {
  return totalQty > 0 ? totalExpenses / totalQty : 0;
}

/**
 * Formula 2.2b: Distribute Expenses Proportionally by Value
 * Alternative method: distribute expenses based on item value proportion
 *
 * @param items - Array of items with quantity and price
 * @param totalExpenses - Total expenses to distribute
 * @returns Array of distributed expense amounts per item
 */
export function distributeExpensesByValue(
  items: Array<{ quantity: number; price: number }>,
  totalExpenses: number,
): number[] {
  const totalValue = items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  if (totalValue === 0) {
    // Fallback to equal distribution
    return items.map(() => totalExpenses / items.length);
  }

  return items.map((item) => {
    const itemValue = item.quantity * item.price;
    return (itemValue / totalValue) * totalExpenses;
  });
}

/**
 * Formula 2.3: Calculate Average Landed Cost Per Unit
 * AvgLandedCostPerUnit = PurchasePrice + AvgExpensePerUnit
 *
 * WHEN: PO/DPO receive completion
 * WHERE: Inventory valuation update
 *
 * @param purchasePrice - Unit price from PO/DPO
 * @param expensePerUnit - Calculated expense per unit
 * @returns Landed cost per unit
 */
export function calculateLandedCost(
  purchasePrice: number,
  expensePerUnit: number,
): number {
  return purchasePrice + expensePerUnit;
}

// ============================================================================
// 3. PURCHASE RECEIVE LOGIC (Implements formulas 2.2, 2.3, 1.2, 1.1)
// ============================================================================

/**
 * Process Purchase Order Receive with Expense Allocation
 * Implements the complete purchase receive flow from the documentation
 *
 * Steps:
 * 1. Calculate AvgExpensePerUnit (Formula 2.2)
 * 2. Calculate AvgLandedCostPerUnit (Formula 2.3)
 * 3. Calculate AvgCostNew (Formula 1.2)
 * 4. Update StockQty (Formula 1.1)
 * 5. Create Voucher
 */
export interface PurchaseReceiveItem {
  partId: string;
  quantity: number;
  purchasePrice: number;
}

export interface PurchaseReceiveResult {
  items: Array<{
    partId: string;
    quantity: number;
    purchasePrice: number;
    expensePerUnit: number;
    landedCost: number;
    oldAvgCost: number;
    newAvgCost: number;
    oldQty: number;
    newQty: number;
  }>;
  totalExpenses: number;
}

export async function processPurchaseReceive(
  items: PurchaseReceiveItem[],
  totalExpenses: number,
  expenseDistributionMethod: "quantity" | "value" = "value",
  costFormula: "standard" | "dpo" = "standard",
): Promise<PurchaseReceiveResult> {
  const result: PurchaseReceiveResult = {
    items: [],
    totalExpenses,
  };

  // Step 1: Calculate expense distribution
  let expensesPerItem: number[];

  if (expenseDistributionMethod === "quantity") {
    // Equal expense per unit across all items
    const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
    const expensePerUnit = calculateAverageExpensePerUnit(
      totalExpenses,
      totalQty,
    );
    expensesPerItem = items.map((item) => expensePerUnit * item.quantity);
  } else {
    // Proportional to item value
    const itemsWithPrice = items.map((item) => ({
      quantity: item.quantity,
      price: item.purchasePrice,
    }));
    expensesPerItem = distributeExpensesByValue(itemsWithPrice, totalExpenses);
  }

  // Step 2-4: Process each item
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const distributedExpense = expensesPerItem[i];
    const expensePerUnit =
      item.quantity > 0 ? distributedExpense / item.quantity : 0;

    // Formula 2.3: Calculate landed cost
    const landedCost = calculateLandedCost(item.purchasePrice, expensePerUnit);

    // Get current part data
    const part = await prisma.part.findUnique({
      where: { id: item.partId },
      select: { cost: true },
    });

    const oldAvgCost = part?.cost || 0;
    const oldQty = await calculateStockQuantity(item.partId);

    // Formula 1.2: Calculate new average cost
    if (costFormula === "dpo") {
      console.log(`[DPO FORMULA] Applying: (${oldQty} * ${oldAvgCost} - ${item.quantity} * ${landedCost}) / (${oldQty} + ${item.quantity})`);
    }

    const newAvgCost =
      costFormula === "dpo"
        ? calculateAverageCostDPO(oldQty, oldAvgCost, item.quantity, landedCost)
        : calculateAverageCost(oldQty, oldAvgCost, item.quantity, landedCost);

    // Update part's average cost and latest purchase price
    await prisma.part.update({
      where: { id: item.partId },
      data: {
        cost: newAvgCost,
        avgCost: newAvgCost,
        purchasePrice: item.purchasePrice,
      },
    });

    result.items.push({
      partId: item.partId,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      expensePerUnit,
      landedCost,
      oldAvgCost,
      newAvgCost,
      oldQty,
      newQty: oldQty + item.quantity,
    });
  }

  return result;
}

// ============================================================================
// 4. SALES POST LOGIC (Implements formulas 1.3, 1.1)
// ============================================================================

/**
 * Process Sales Invoice Posting with COGS Calculation
 * Implements the complete sales posting flow from the documentation
 *
 * Steps:
 * 1. Validate Stock Availability (Formula 1.1)
 * 2. Calculate COGS (Formula 1.3)
 * 3. Update StockQty (Formula 1.1)
 * 4. Create Vouchers (Revenue JV + COGS JV)
 */
export interface SalesPostItem {
  partId: string;
  quantity: number;
  salePrice: number;
}

export interface SalesPostResult {
  items: Array<{
    partId: string;
    quantity: number;
    salePrice: number;
    avgCost: number;
    cogs: number;
    grossProfit: number;
    availableStock: number;
  }>;
  totalRevenue: number;
  totalCOGS: number;
  totalGrossProfit: number;
  stockWarnings: Array<{
    partId: string;
    requested: number;
    available: number;
    message: string;
  }>;
}

export async function processSalesPost(
  items: SalesPostItem[],
  allowNegativeStock: boolean = false,
): Promise<SalesPostResult> {
  const result: SalesPostResult = {
    items: [],
    totalRevenue: 0,
    totalCOGS: 0,
    totalGrossProfit: 0,
    stockWarnings: [],
  };

  // Step 1: Validate stock availability
  for (const item of items) {
    const availableStock = await calculateStockQuantity(item.partId);

    if (!allowNegativeStock && availableStock < item.quantity) {
      result.stockWarnings.push({
        partId: item.partId,
        requested: item.quantity,
        available: availableStock,
        message: `Insufficient stock: requested ${item.quantity}, available ${availableStock}`,
      });
    }
  }

  // Throw error if stock warnings and not allowing negative stock
  if (result.stockWarnings.length > 0 && !allowNegativeStock) {
    throw new Error(
      `Stock validation failed: ${result.stockWarnings.length} items have insufficient stock`,
    );
  }

  // Step 2-3: Calculate COGS and process each item
  for (const item of items) {
    // Get current part data
    const part = await prisma.part.findUnique({
      where: { id: item.partId },
      select: { cost: true },
    });

    const avgCost = part?.cost || 0;
    const availableStock = await calculateStockQuantity(item.partId);

    // Formula 1.3: Calculate COGS
    const cogs = calculateCOGS(item.quantity, avgCost);
    const revenue = item.quantity * item.salePrice;
    const grossProfit = revenue - cogs;

    result.items.push({
      partId: item.partId,
      quantity: item.quantity,
      salePrice: item.salePrice,
      avgCost,
      cogs,
      grossProfit,
      availableStock,
    });

    result.totalRevenue += revenue;
    result.totalCOGS += cogs;
    result.totalGrossProfit += grossProfit;
  }

  return result;
}

// ============================================================================
// 5. INVENTORY ADJUSTMENT LOGIC
// ============================================================================

/**
 * Process Inventory Adjustment IN
 * Updates average cost if cost is provided
 */
export async function processInventoryAdjustmentIn(
  partId: string,
  quantity: number,
  unitCost?: number,
): Promise<{
  oldQty: number;
  newQty: number;
  oldAvgCost: number;
  newAvgCost: number;
}> {
  const oldQty = await calculateStockQuantity(partId);

  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { cost: true },
  });

  const oldAvgCost = part?.cost || 0;
  let newAvgCost = oldAvgCost;

  // Update average cost if unit cost provided
  if (unitCost !== undefined && unitCost > 0) {
    newAvgCost = calculateAverageCost(oldQty, oldAvgCost, quantity, unitCost);

    await prisma.part.update({
      where: { id: partId },
      data: {
        cost: newAvgCost,
        avgCost: newAvgCost,
        purchasePrice: unitCost,
      },
    });
  }

  return {
    oldQty,
    newQty: oldQty + quantity,
    oldAvgCost,
    newAvgCost,
  };
}

/**
 * Process Inventory Adjustment OUT
 * Calculates COGS using current average cost
 */
export async function processInventoryAdjustmentOut(
  partId: string,
  quantity: number,
): Promise<{
  oldQty: number;
  newQty: number;
  avgCost: number;
  cogs: number;
}> {
  const oldQty = await calculateStockQuantity(partId);

  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { cost: true },
  });

  const avgCost = part?.cost || 0;
  const cogs = calculateCOGS(quantity, avgCost);

  return {
    oldQty,
    newQty: oldQty - quantity,
    avgCost,
    cogs,
  };
}

// ============================================================================
// 6. UTILITY FUNCTIONS
// ============================================================================

/**
 * Get Part Average Cost
 */
export async function getPartAverageCost(partId: string): Promise<number> {
  const part = await prisma.part.findUnique({
    where: { id: partId },
    select: { cost: true },
  });

  return part?.cost || 0;
}

/**
 * Calculate Inventory Valuation
 * Total Value = Sum(StockQty * AvgCost) for all parts
 */
export async function calculateInventoryValuation(): Promise<{
  totalValue: number;
  itemCount: number;
  items: Array<{
    partId: string;
    quantity: number;
    avgCost: number;
    value: number;
  }>;
}> {
  const parts = await prisma.part.findMany({
    where: { status: "active" },
    select: { id: true, cost: true },
  });

  const items = [];
  let totalValue = 0;

  for (const part of parts) {
    const quantity = await calculateStockQuantity(part.id);
    const value = quantity * (part.cost || 0);

    items.push({
      partId: part.id,
      quantity,
      avgCost: part.cost || 0,
      value,
    });

    totalValue += value;
  }

  return {
    totalValue,
    itemCount: items.length,
    items,
  };
}

/**
 * Validate Accounting Equation Balance
 * Assets = Liabilities + Equity
 */
export async function validateAccountingEquation(): Promise<{
  balanced: boolean;
  assets: number;
  liabilities: number;
  equity: number;
  difference: number;
}> {
  // Get all accounts grouped by type
  const accounts = await prisma.account.findMany({
    include: {
      Subgroup: {
        include: {
          MainGroup: true,
        },
      },
    },
  });

  let assets = 0;
  let liabilities = 0;
  let equity = 0;

  // Calculate balances (simplified - should use ledger entries)
  for (const account of accounts) {
    const mainGroupCode = (account as any).Subgroup.MainGroup.code;

    // This is simplified - actual implementation should sum voucher entries
    const balance = 0; // TODO: Calculate from voucher entries

    if (mainGroupCode.startsWith("1")) {
      assets += balance;
    } else if (mainGroupCode.startsWith("2")) {
      liabilities += balance;
    } else if (mainGroupCode.startsWith("3")) {
      equity += balance;
    }
  }

  const difference = assets - (liabilities + equity);
  const balanced = Math.abs(difference) < 0.01; // Allow for rounding

  return {
    balanced,
    assets,
    liabilities,
    equity,
    difference,
  };
}
