import * as express from 'express';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import prisma from '../config/database';
import { calculateStockQuantity, calculateAverageCostDPOReturn } from '../utils/inventoryFormulas';

const router = express.Router();

/**
 * DPO RETURN SYSTEM - FUNCTIONAL SPECIFICATION
 * 
 * Purpose: Handle returns of items from Direct Purchase Orders
 * 
 * Business Rules:
 * 1. Can only return items from completed DPOs
 * 2. Return quantity cannot exceed original purchased quantity
 * 3. Returns reduce inventory (OUT movement)
 * 4. Returns create REVERSE accounting entries:
 *    - JV: Debit Supplier Payable, Credit Inventory (reverses original JV)
 *    - If original DPO had payment (PV), return creates a refund expectation
 * 5. Return status: pending -> approved -> completed
 * 6. Approved returns trigger:
 *    - Stock movement OUT
 *    - Accounting voucher creation (JV)
 *    - Supplier account balance adjustment
 */

// ==================== GET ALL DPO RETURNS ====================
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, from_date, to_date, dpo_id, page = '1', limit = '100' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status as string;
    }

    if (dpo_id) {
      where.directPurchaseOrderId = dpo_id as string;
    }

    if (from_date || to_date) {
      where.returnDate = {};
      if (from_date) where.returnDate.gte = new Date(from_date as string);
      if (to_date) where.returnDate.lte = new Date(to_date as string);
    }

    const [returns, total] = await Promise.all([
      prisma.directPurchaseOrderReturn.findMany({
        where,
        include: {
          DirectPurchaseOrder: {
            select: {
              dpoNumber: true,
              supplierId: true,
              date: true,
              Supplier: {
                select: {
                  name: true,
                  companyName: true,
                }
              }
            },
          },
          DirectPurchaseOrderReturnItem: {
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
        orderBy: { returnDate: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.directPurchaseOrderReturn.count({ where }),
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

// ==================== GET SINGLE DPO RETURN ====================
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const dpoReturn = await prisma.directPurchaseOrderReturn.findUnique({
      where: { id },
      include: {
        DirectPurchaseOrder: {
          include: {
            Supplier: true,
            DirectPurchaseOrderItem: {
              include: {
                Part: true,
              },
            },
          },
        },
        DirectPurchaseOrderReturnItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    if (!dpoReturn) {
      return res.status(404).json({ error: 'DPO Return not found' });
    }

    res.json(dpoReturn);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CREATE DPO RETURN ====================
router.post('/', async (req: Request, res: Response) => {
  try {
    const { dpo_id, return_date, reason, account_id, deduction, items } = req.body;

    if (!dpo_id || !return_date || !items || items.length === 0) {
      return res.status(400).json({ error: 'dpo_id, return_date, and items are required' });
    }

    // Verify DPO exists
    const dpo = await prisma.directPurchaseOrder.findUnique({
      where: { id: dpo_id },
      include: {
        DirectPurchaseOrderItem: {
          include: {
            Part: {
              include: { Brand: true }
            }
          },
        },
      },
    });

    if (!dpo) {
      return res.status(404).json({ error: 'Direct Purchase Order not found' });
    }

    // Validate return quantities
    for (const returnItem of items) {
      const dpoItem = dpo.DirectPurchaseOrderItem.find(item => item.partId === returnItem.part_id);

      if (!dpoItem) {
        return res.status(400).json({
          error: `Part ${returnItem.part_id} not found in original DPO`
        });
      }

      // Check if return quantity exceeds purchased quantity
      const existingReturns = await prisma.directPurchaseOrderReturnItem.findMany({
        where: {
          DirectPurchaseOrderReturn: {
            directPurchaseOrderId: dpo_id,
            status: { in: ['approved', 'completed'] },
          },
          partId: returnItem.part_id,
        },
      });

      const totalReturned = existingReturns.reduce((sum, item) => sum + item.returnQuantity, 0);
      const availableToReturn = dpoItem.quantity - totalReturned;

      if (returnItem.return_quantity > availableToReturn) {
        return res.status(400).json({
          error: `Cannot return ${returnItem.return_quantity} units of part ${returnItem.part_id}. Only ${availableToReturn} units available for return.`
        });
      }

      const currentStock = await calculateStockQuantity(returnItem.part_id, prisma);
      if (returnItem.return_quantity > currentStock) {
        const part = await prisma.part.findUnique({
          where: { id: returnItem.part_id },
          select: { partNo: true },
        });
        return res.status(400).json({
          error: `Cannot return ${returnItem.return_quantity} units of ${part?.partNo || 'item'}. Item stock is only ${currentStock}.`,
        });
      }
    }

    // Generate return number
    const year = new Date(return_date).getFullYear();
    const lastReturn = await prisma.directPurchaseOrderReturn.findFirst({
      where: {
        returnNumber: {
          startsWith: `DPOR-${year}-`,
        },
      },
      orderBy: {
        returnNumber: 'desc',
      },
    });

    let nextNum = 1;
    if (lastReturn) {
      const match = lastReturn.returnNumber.match(new RegExp(`^DPOR-${year}-(\\d+)$`));
      if (match) {
        nextNum = parseInt(match[1]) + 1;
      }
    }
    const returnNumber = `DPOR-${year}-${String(nextNum).padStart(3, '0')}`;

    // Calculate total amount & construct item details string
    let itemDetailsStr = "";
    const totalAmount = items.reduce((sum: number, item: any) => {
      const dpoItem = dpo.DirectPurchaseOrderItem.find(i => i.partId === item.part_id);
      const itemTotal = dpoItem!.purchasePrice * item.return_quantity;

      const partNo = dpoItem?.Part?.partNo || "Unknown";
      const brand = dpoItem?.Part?.Brand?.name || "No Brand";
      const desc = dpoItem?.Part?.description || "";
      const detail = `${partNo} - ${brand} - ${desc} (${item.return_quantity} x ${dpoItem!.purchasePrice})`;
      itemDetailsStr += itemDetailsStr ? `, ${detail}` : detail;

      return sum + itemTotal;
    }, 0);

    const accountsDeduction = deduction || 0;
    const netAmount = totalAmount - accountsDeduction;

    // Create return in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create return record
      const dpoReturn = await tx.directPurchaseOrderReturn.create({
        data: {
          id: crypto.randomUUID(),
          returnNumber,
          directPurchaseOrderId: dpo_id,
          supplierId: dpo.supplierId,
          returnDate: new Date(return_date),
          reason: reason || null,
          status: 'completed', // Complete immediately
          totalAmount: totalAmount,
          deduction: accountsDeduction,
          netAmount: netAmount,
          updatedAt: new Date(),
          DirectPurchaseOrderReturnItem: {
            create: items.map((item: any) => {
              const dpoItem = dpo.DirectPurchaseOrderItem.find(i => i.partId === item.part_id);
              return {
                id: crypto.randomUUID(),
                partId: item.part_id,
                returnQuantity: item.return_quantity,
                originalPurchasePrice: dpoItem!.purchasePrice,
                amount: dpoItem!.purchasePrice * item.return_quantity,
              };
            }),
          },
        } as any,
        include: {
          DirectPurchaseOrderReturnItem: {
            include: {
              Part: true,
            },
          },
        },
      });

      // 1. Create stock movements (OUT) and update Average Cost
      for (const item of items) {
        // Find part to get current cost
        const part = await tx.part.findUnique({
          where: { id: item.part_id },
          select: { cost: true, avgCost: true }
        });

        const oldAvgCost = part?.cost || part?.avgCost || 0;
        const oldQty = await calculateStockQuantity(item.part_id, tx);
        const dpoItem = dpo.DirectPurchaseOrderItem.find(i => i.partId === item.part_id);
        const rate = dpoItem ? dpoItem.purchasePrice : oldAvgCost;

        // Create movement
        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            partId: item.part_id,
            type: 'out',
            quantity: item.return_quantity,
            storeId: dpo.storeId || undefined,
            referenceType: 'dpo_return',
            referenceId: dpoReturn.id,
            supplierId: dpo.supplierId || undefined,
            notes: `DPO Return ${returnNumber} auto-created`,
          } as any,
        });

        // Calculate new Average Cost: (stock * avg - qty * rate) / (stock - qty)
        const newAvgCost = calculateAverageCostDPOReturn(oldQty, oldAvgCost, item.return_quantity, rate);

        console.log(`[DPOR FORMULA] Part: ${item.part_id}, OldQty: ${oldQty}, OldAvg: ${oldAvgCost}, ReturnQty: ${item.return_quantity}, Rate: ${rate} => NewAvg: ${newAvgCost}`);

        // Update Part cost
        await tx.part.update({
          where: { id: item.part_id },
          data: {
            cost: newAvgCost,
            avgCost: newAvgCost
          }
        });
      }

      // 2. Create vouchers
      // JV: always DR Supplier Payable / CR Inventory (supplier is already on the LPO)
      // RV: only when cash/bank account_id is selected (refund receipt)
      // Prefer exact Inventory GL (101001); avoid matching Cost/Disposed Inventory by name
      let inventoryAccount = await tx.account.findFirst({
        where: { code: '101001', status: 'Active' },
      });
      if (!inventoryAccount) {
        inventoryAccount = await tx.account.findFirst({
          where: {
            OR: [{ code: '104005' }, { code: '104001' }],
            status: 'Active',
          },
        });
      }
      if (!inventoryAccount) {
        inventoryAccount = await tx.account.findFirst({
          where: {
            name: { equals: 'Inventory', mode: 'insensitive' },
            status: 'Active',
          },
        });
      }

      let supplierAccount: any = null;
      // 1) Direct link Account.supplierId (most reliable)
      if (dpo.supplierId) {
        supplierAccount = await tx.account.findFirst({
          where: {
            supplierId: dpo.supplierId,
            status: 'Active',
            Subgroup: { code: '301' },
          },
          include: { Subgroup: true },
        });
        if (!supplierAccount) {
          supplierAccount = await tx.account.findFirst({
            where: {
              supplierId: dpo.supplierId,
              status: 'Active',
            },
            include: { Subgroup: true },
          });
        }
      }
      // 2) Name match in payables subgroup
      if (!supplierAccount && dpo.supplierId) {
        const supplier = await tx.supplier.findUnique({
          where: { id: dpo.supplierId },
          select: { companyName: true, name: true },
        });
        if (supplier) {
          const payablesSubgroup = await tx.subgroup.findFirst({
            where: { code: '301' },
          });
          if (payablesSubgroup) {
            const nameOrCompany = [supplier.name, supplier.companyName]
              .map((n) => String(n || '').trim())
              .filter(Boolean);
            if (nameOrCompany.length > 0) {
              supplierAccount = await tx.account.findFirst({
                where: {
                  subgroupId: payablesSubgroup.id,
                  status: 'Active',
                  OR: nameOrCompany.map((n) => ({
                    name: { equals: n, mode: 'insensitive' as const },
                  })),
                },
                include: { Subgroup: true },
              });
              if (!supplierAccount) {
                supplierAccount = await tx.account.findFirst({
                  where: {
                    subgroupId: payablesSubgroup.id,
                    status: 'Active',
                    OR: nameOrCompany.map((n) => ({
                      name: { contains: n, mode: 'insensitive' as const },
                    })),
                  },
                  include: { Subgroup: true },
                });
              }
            }
          }
        }
      }

      if (!supplierAccount) {
        supplierAccount = await tx.account.findFirst({
          where: {
            OR: [{ code: '301001' }, { name: 'Accounts Payable' }],
            status: 'Active',
          },
          include: { Subgroup: true },
        });
      }

      if (!inventoryAccount) {
        throw new Error(
          'Inventory account not found. Cannot create LPO return JV.',
        );
      }
      if (!supplierAccount) {
        throw new Error(
          'Supplier payable account not found for this LPO supplier. Cannot create LPO return JV.',
        );
      }

      const voucherDescription = `Return ${returnNumber}: ${itemDetailsStr}`;

      // A. JOURNAL VOUCHER — DR Supplier Payable, CR Inventory
      const jvCandidates = await tx.voucher.findMany({
        where: { type: 'journal', voucherNumber: { startsWith: 'JV' } },
        select: { voucherNumber: true },
      });
      let jvMax = 0;
      for (const v of jvCandidates) {
        const match = String(v.voucherNumber).match(/^JV(\d+)$/);
        if (match) jvMax = Math.max(jvMax, parseInt(match[1], 10));
      }
      const jvVoucherNumber = `JV${String(jvMax + 1).padStart(4, '0')}`;

      await tx.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: jvVoucherNumber,
          type: 'journal',
          date: new Date(return_date),
          narration: `LPO Return ${returnNumber} - Inventory Adjusted (LPO ${dpo.dpoNumber})`,
          totalDebit: totalAmount,
          totalCredit: totalAmount,
          status: 'posted',
          createdBy: 'System',
          approvedBy: 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: [
              {
                id: crypto.randomUUID(),
                accountId: supplierAccount.id,
                accountName: `${supplierAccount.code}-${supplierAccount.name}`,
                description: voucherDescription,
                debit: totalAmount,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: voucherDescription,
                debit: 0,
                credit: totalAmount,
                sortOrder: 1,
              },
            ],
          },
        } as any,
      });

      // JV balances: DR payable (liability down), CR inventory (asset down)
      await tx.account.update({
        where: { id: supplierAccount.id },
        data: { currentBalance: { decrement: totalAmount } },
      });
      await tx.account.update({
        where: { id: inventoryAccount.id },
        data: { currentBalance: { decrement: totalAmount } },
      });

      let rvVoucherNumber: string | null = null;

      // B. RECEIPT VOUCHER — only when cash/bank account selected for refund
      if (account_id && netAmount > 0) {
        const selectedAccount = await tx.account.findUnique({
          where: { id: account_id },
          include: { Subgroup: true },
        });
        if (!selectedAccount) {
          throw new Error('Selected cash/bank account not found for receipt voucher.');
        }

        const sg = String(selectedAccount.Subgroup?.code || '');
        const isCashOrBank =
          sg.startsWith('102') ||
          sg.startsWith('103') ||
          sg === '101' ||
          sg === '102';
        if (!isCashOrBank) {
          throw new Error(
            'Receipt voucher account must be Cash or Bank. Supplier payable is used on the JV.',
          );
        }

        const rvCandidates = await tx.voucher.findMany({
          where: { type: 'receipt', voucherNumber: { startsWith: 'RV' } },
          select: { voucherNumber: true },
        });
        let rvMax = 0;
        for (const v of rvCandidates) {
          const match = String(v.voucherNumber).match(/^RV(\d+)$/);
          if (match) rvMax = Math.max(rvMax, parseInt(match[1], 10));
        }
        rvVoucherNumber = `RV${String(rvMax + 1).padStart(4, '0')}`;

        await tx.voucher.create({
          data: {
            id: crypto.randomUUID(),
            voucherNumber: rvVoucherNumber,
            type: 'receipt',
            date: new Date(return_date),
            narration: `LPO Return ${returnNumber} - Cash/Bank Refund Received`,
            cashBankAccount: selectedAccount.name,
            totalDebit: netAmount,
            totalCredit: netAmount,
            status: 'posted',
            createdBy: 'System',
            approvedBy: 'System',
            approvedAt: new Date(),
            updatedAt: new Date(),
            VoucherEntry: {
              create: [
                {
                  id: crypto.randomUUID(),
                  accountId: selectedAccount.id,
                  accountName: `${selectedAccount.code}-${selectedAccount.name}`,
                  description: voucherDescription,
                  debit: netAmount,
                  credit: 0,
                  sortOrder: 0,
                },
                {
                  id: crypto.randomUUID(),
                  accountId: supplierAccount.id,
                  accountName: `${supplierAccount.code}-${supplierAccount.name}`,
                  description: voucherDescription,
                  debit: 0,
                  credit: netAmount,
                  sortOrder: 1,
                },
              ],
            },
          } as any,
        });

        // RV: DR cash/bank (asset up), CR payable (liability up / offsets JV debit)
        await tx.account.update({
          where: { id: selectedAccount.id },
          data: { currentBalance: { increment: netAmount } },
        });
        await tx.account.update({
          where: { id: supplierAccount.id },
          data: { currentBalance: { increment: netAmount } },
        });
      }

      console.log(
        `[DPOR] ${returnNumber} vouchers: JV=${jvVoucherNumber}` +
          (rvVoucherNumber ? ` RV=${rvVoucherNumber}` : ' (no RV)'),
      );

      return {
        ...dpoReturn,
        jvVoucherNumber,
        rvVoucherNumber,
      };
    });

    res.status(201).json(result);
  } catch (error: any) {
    console.error('Error creating DPO return:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== APPROVE DPO RETURN ====================
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const dpoReturn = await prisma.directPurchaseOrderReturn.findUnique({
      where: { id },
      include: {
        DirectPurchaseOrderReturnItem: {
          include: {
            Part: true,
          },
        },
        DirectPurchaseOrder: {
          include: {
            DirectPurchaseOrderItem: true,
          },
        },
      },
    });

    if (!dpoReturn) {
      return res.status(404).json({ error: 'DPO Return not found' });
    }

    if (dpoReturn.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending returns can be approved' });
    }

    // Update status to approved
    await prisma.directPurchaseOrderReturn.update({
      where: { id },
      data: { status: 'approved' },
    });

    // Create stock movements (OUT) for returned items and update Average Cost
    const dpo = dpoReturn.DirectPurchaseOrder;
    await prisma.$transaction(async (tx) => {
      for (const returnItem of dpoReturn.DirectPurchaseOrderReturnItem) {
        const part = await tx.part.findUnique({
          where: { id: returnItem.partId },
          select: { cost: true, avgCost: true }
        });

        const oldAvgCost = part?.cost || part?.avgCost || 0;
        const oldQty = await calculateStockQuantity(returnItem.partId, tx);
        const rate = returnItem.originalPurchasePrice || oldAvgCost;

        await tx.stockMovement.create({
          data: {
            id: crypto.randomUUID(),
            partId: returnItem.partId,
            type: 'out',
            quantity: returnItem.returnQuantity,
            storeId: dpo.storeId || undefined,
            referenceType: 'dpo_return',
            referenceId: dpoReturn.id,
            supplierId: dpoReturn.supplierId || undefined,
            notes: `DPO Return ${dpoReturn.returnNumber} - Original DPO: ${dpo.dpoNumber}`,
          } as any,
        });

        const newAvgCost = calculateAverageCostDPOReturn(oldQty, oldAvgCost, returnItem.returnQuantity, rate);

        console.log(`[DPOR APPROVE] Part: ${returnItem.partId}, OldQty: ${oldQty}, OldAvg: ${oldAvgCost}, ReturnQty: ${returnItem.returnQuantity}, Rate: ${rate} => NewAvg: ${newAvgCost}`);

        await tx.part.update({
          where: { id: returnItem.partId },
          data: {
            cost: newAvgCost,
            avgCost: newAvgCost
          }
        });
      }
    });

    // Create accounting voucher (JV) - REVERSE of original DPO JV
    // Original DPO JV: DR Inventory, CR Supplier Payable
    // Return JV: DR Supplier Payable, CR Inventory
    try {
      // Find Inventory Account (prefer 101001)
      let inventoryAccount = await prisma.account.findFirst({
        where: { code: '101001', status: 'Active' },
        include: {
          Subgroup: {
            include: {
              MainGroup: true,
            },
          },
        },
      });
      if (!inventoryAccount) {
        inventoryAccount = await prisma.account.findFirst({
          where: {
            OR: [{ code: '104005' }, { code: '104001' }],
            status: 'Active',
          },
          include: {
            Subgroup: {
              include: {
                MainGroup: true,
              },
            },
          },
        });
      }
      if (!inventoryAccount) {
        inventoryAccount = await prisma.account.findFirst({
          where: {
            name: { equals: 'Inventory', mode: 'insensitive' },
            status: 'Active',
          },
          include: {
            Subgroup: {
              include: {
                MainGroup: true,
              },
            },
          },
        });
      }

      if (!inventoryAccount) {
        return res.status(400).json({ error: 'Inventory Account not found' });
      }

      // Find Supplier Account
      let supplierAccount = null;
      if (dpo.supplierId) {
        const supplier = await prisma.supplier.findUnique({
          where: { id: dpo.supplierId },
        });

        if (supplier) {
          const payablesSubgroup = await prisma.subgroup.findFirst({
            where: { code: '301' },
          });

          if (payablesSubgroup) {
            supplierAccount = await prisma.account.findFirst({
              where: {
                subgroupId: payablesSubgroup.id,
                OR: [
                  { name: supplier.name || '' },
                  { name: supplier.companyName || '' },
                ],
              },
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true,
                  },
                },
              },
            });
          }
        }
      }

      if (!supplierAccount) {
        return res.status(400).json({ error: 'Supplier Account not found' });
      }

      // Generate JV number
      const lastJV = await prisma.voucher.findFirst({
        where: {
          type: 'journal',
          voucherNumber: {
            startsWith: 'JV',
          },
        },
        orderBy: {
          voucherNumber: 'desc',
        },
      });

      let jvNumber = 1;
      if (lastJV) {
        const match = lastJV.voucherNumber.match(/^JV(\d+)$/);
        if (match) {
          jvNumber = parseInt(match[1]) + 1;
        }
      }
      const jvVoucherNumber = `JV${String(jvNumber).padStart(4, '0')}`;

      // Create JV Voucher (REVERSE of original DPO)
      const jvVoucher = await prisma.voucher.create({
        data: {
          id: crypto.randomUUID(),
          voucherNumber: jvVoucherNumber,
          type: 'journal',
          date: dpoReturn.returnDate,
          narration: `DPO Return ${dpoReturn.returnNumber} - Original DPO: ${dpo.dpoNumber}`,
          totalDebit: dpoReturn.totalAmount,
          totalCredit: dpoReturn.totalAmount,
          status: 'posted',
          createdBy: 'System',
          approvedBy: 'System',
          approvedAt: new Date(),
          updatedAt: new Date(),
          VoucherEntry: {
            create: [
              {
                id: crypto.randomUUID(),
                accountId: supplierAccount.id,
                accountName: `${supplierAccount.code}-${supplierAccount.name}`,
                description: `DPO Return ${dpoReturn.returnNumber}`,
                debit: dpoReturn.totalAmount,
                credit: 0,
                sortOrder: 0,
              },
              {
                id: crypto.randomUUID(),
                accountId: inventoryAccount.id,
                accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                description: `DPO Return ${dpoReturn.returnNumber}`,
                debit: 0,
                credit: dpoReturn.totalAmount,
                sortOrder: 1,
              },
            ],
          },
        } as any,
      });

      // Update account balances
      // Debit Supplier Payable (decreases liability)
      await prisma.account.update({
        where: { id: supplierAccount.id },
        data: {
          currentBalance: {
            decrement: dpoReturn.totalAmount,
          },
        },
      });

      // Credit Inventory (decreases asset)
      await prisma.account.update({
        where: { id: inventoryAccount.id },
        data: {
          currentBalance: {
            decrement: dpoReturn.totalAmount,
          },
        },
      });

    } catch (voucherError: any) {
      // Don't fail the approval if voucher creation fails
    }

    // Update return status to completed
    const updatedReturn = await prisma.directPurchaseOrderReturn.update({
      where: { id },
      data: { status: 'completed' },
      include: {
        DirectPurchaseOrderReturnItem: {
          include: {
            Part: true,
          },
        },
        DirectPurchaseOrder: true,
      },
    });

    res.json(updatedReturn);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== REJECT DPO RETURN ====================
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const dpoReturn = await prisma.directPurchaseOrderReturn.findUnique({
      where: { id },
    });

    if (!dpoReturn) {
      return res.status(404).json({ error: 'DPO Return not found' });
    }

    if (dpoReturn.status !== 'pending') {
      return res.status(400).json({ error: 'Only pending returns can be rejected' });
    }

    const updatedReturn = await prisma.directPurchaseOrderReturn.update({
      where: { id },
      data: {
        status: 'rejected',
        reason: rejection_reason || dpoReturn.reason,
      },
      include: {
        DirectPurchaseOrderReturnItem: {
          include: {
            Part: true,
          },
        },
        DirectPurchaseOrder: true,
      },
    });

    res.json(updatedReturn);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DELETE DPO RETURN ====================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const dpoReturn = await prisma.directPurchaseOrderReturn.findUnique({
      where: { id },
    });

    if (!dpoReturn) {
      return res.status(404).json({ error: 'DPO Return not found' });
    }

    if (dpoReturn.status !== 'pending') {
      return res.status(400).json({
        error: 'Only pending returns can be deleted. Approved/completed returns cannot be deleted.'
      });
    }

    await prisma.directPurchaseOrderReturn.delete({
      where: { id },
    });

    res.json({ message: 'DPO Return deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
