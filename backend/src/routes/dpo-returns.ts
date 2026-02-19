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

      // 2. Create Vouchers (JV and potentially RV)
      if (account_id) {
        // Find Inventory Account
        const inventoryAccount = await tx.account.findFirst({
          where: {
            OR: [
              { code: '101001' },
              { Subgroup: { code: '104' } },
              { name: { contains: 'Inventory' } },
            ],
            status: 'Active',
          },
        });

        // Find Supplier Account (Payable)
        let supplierAccount = null;
        if (dpo.supplierId) {
          const supplier = await tx.supplier.findUnique({
            where: { id: dpo.supplierId },
            select: { companyName: true, name: true },
          });
          if (supplier) {
            const payablesSubgroup = await tx.subgroup.findFirst({
              where: { code: '301' },
            });
            if (payablesSubgroup) {
              supplierAccount = await tx.account.findFirst({
                where: {
                  subgroupId: payablesSubgroup.id,
                  OR: [
                    { name: supplier.name || "" },
                    { name: supplier.companyName || "" },
                  ],
                },
                include: { Subgroup: true },
              });
            }
          }
        }

        if (!supplierAccount) {
          supplierAccount = await tx.account.findFirst({
            where: { OR: [{ code: '301001' }, { name: 'Accounts Payable' }], status: 'Active' },
            include: { Subgroup: true },
          });
        }

        const selectedAccount = await tx.account.findUnique({
          where: { id: account_id },
          include: { Subgroup: true }
        });

        if (inventoryAccount && selectedAccount && supplierAccount) {
          const isCashRefund = selectedAccount.Subgroup?.code === '101' || selectedAccount.Subgroup?.code === '102';

          // A. Create JOURNAL VOUCHER (Inventory -> Supplier)
          // For both credit and cash returns, we first reverse the inventory and liability
          const lastJV = await tx.voucher.findFirst({
            where: { type: 'journal', voucherNumber: { startsWith: 'JV' } },
            orderBy: { voucherNumber: "desc" },
          });

          let jvNum = 1;
          if (lastJV) {
            const match = lastJV.voucherNumber.match(/^JV(\d+)$/);
            if (match) jvNum = parseInt(match[1]) + 1;
            else {
              const countJV = await tx.voucher.count({ where: { type: 'journal', voucherNumber: { startsWith: 'JV' } } });
              jvNum = countJV + 1;
            }
          }
          const jvVoucherNumber = `JV${String(jvNum).padStart(4, "0")}`;

          // JV accounts depend on whether it's cash refund or credit
          // If cash refund, JV goes to Supplier Payable. If credit, JV goes to Selected Account (which is the supplier anyway)
          const jvDebitAccount = isCashRefund ? supplierAccount : selectedAccount;

          const voucherDescription = `Return ${returnNumber}: ${itemDetailsStr}`;

          await tx.voucher.create({
            data: {
              id: crypto.randomUUID(),
              voucherNumber: jvVoucherNumber,
              type: 'journal',
              date: new Date(return_date),
              narration: `DPO Return ${returnNumber} - Inventory Adjusted`,
              totalDebit: totalAmount, // Use totalAmount for JV (before deduction) or netAmount? User image shows 237,380 which is likely total.
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
                    accountId: jvDebitAccount.id,
                    accountName: `${jvDebitAccount.code}-${jvDebitAccount.name}`,
                    description: voucherDescription, // UPDATE: Included item details
                    debit: totalAmount,
                    credit: 0,
                    sortOrder: 0,
                  },
                  {
                    id: crypto.randomUUID(),
                    accountId: inventoryAccount.id,
                    accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                    description: voucherDescription, // UPDATE: Included item details
                    debit: 0,
                    credit: totalAmount,
                    sortOrder: 1,
                  },
                ],
              },
            } as any,
          });

          // B. Create RECEIPT VOUCHER (Supplier -> Cash/Bank) if cash refund
          if (isCashRefund) {
            const lastRV = await tx.voucher.findFirst({
              where: { type: 'receipt', voucherNumber: { startsWith: 'RV' } },
              orderBy: { voucherNumber: "desc" },
            });

            let rvNum = 1;
            if (lastRV) {
              const match = lastRV.voucherNumber.match(/^RV(\d+)$/);
              if (match) rvNum = parseInt(match[1]) + 1;
              else {
                const countRV = await tx.voucher.count({ where: { type: 'receipt', voucherNumber: { startsWith: 'RV' } } });
                rvNum = countRV + 1;
              }
            }
            const rvVoucherNumber = `RV${String(rvNum).padStart(4, "0")}`;

            await tx.voucher.create({
              data: {
                id: crypto.randomUUID(),
                voucherNumber: rvVoucherNumber,
                type: 'receipt',
                date: new Date(return_date),
                narration: `DPO Return ${returnNumber} - Cash Refund Received`,
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
                      description: voucherDescription, // UPDATE: Included item details
                      debit: netAmount,
                      credit: 0,
                      sortOrder: 0,
                    },
                    {
                      id: crypto.randomUUID(),
                      accountId: supplierAccount.id,
                      accountName: `${supplierAccount.code}-${supplierAccount.name}`,
                      description: voucherDescription, // UPDATE: Included item details
                      debit: 0,
                      credit: netAmount,
                      sortOrder: 1,
                    },
                  ],
                },
              } as any,
            });

            // Update Balances for Cash Refund
            // JV: DR Supplier. RV: CR Supplier. Net Supplier change = 0 (if totalAmount == netAmount). 
            // If deduction exists, Supplier balance decreases by deduction.
            // RV: DR Cash (increases). JV: CR Inventory (decreases).

            await tx.account.update({
              where: { id: selectedAccount.id },
              data: { currentBalance: { increment: netAmount } } // Cash increases
            });
            await tx.account.update({
              where: { id: inventoryAccount.id },
              data: { currentBalance: { decrement: totalAmount } } // Inventory decreases
            });
            await tx.account.update({
              where: { id: supplierAccount.id },
              // Net change = totalAmount (Debit) - netAmount (Credit) = deduction
              data: { currentBalance: { decrement: totalAmount - netAmount } }
            });

          } else {
            // Update Balances for Credit Return (selectedAccount is Supplier)
            await tx.account.update({
              where: { id: selectedAccount.id },
              data: { currentBalance: { decrement: netAmount } } // Liability decreases
            });
            await tx.account.update({
              where: { id: inventoryAccount.id },
              data: { currentBalance: { decrement: totalAmount } } // Inventory decreases
            });
          }
        }
      }

      return dpoReturn;
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
      // Find Inventory Account
      const inventoryAccount = await prisma.account.findFirst({
        where: {
          OR: [
            {
              Subgroup: {
                code: '104',
              },
            },
            {
              name: {
                contains: 'Inventory',
              },
            },
          ],
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
