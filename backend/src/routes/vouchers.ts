import express, { Request, Response } from 'express';
import prisma from '../config/database';
import crypto from 'crypto';

const router = express.Router();

function normalizeVoucherTypeFilter(typeParam: unknown): string | undefined {
  if (typeParam === undefined || typeParam === null) return undefined;
  const raw = String(typeParam).trim();
  if (!raw || raw.toLowerCase() === 'all') return undefined;

  // Compatibility mapping: frontend may send numeric voucher type ids.
  // DB stores voucher.type as strings ("payment" | "receipt" | "journal" | ...).
  const numericMap: Record<string, string> = {
    '1': 'payment',
    '2': 'receipt',
    '3': 'journal',
  };
  if (Object.prototype.hasOwnProperty.call(numericMap, raw)) {
    return numericMap[raw];
  }

  // String types (e.g. "payment", "receipt", "journal", "contra", ...)
  return raw;
}

// Get all vouchers
router.get('/', async (req: Request, res: Response) => {
  try {
    const { type, status, from_date, to_date, search, search_by, page = '1', limit = '100' } = req.query;
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    const normalizedType = normalizeVoucherTypeFilter(type);
    if (normalizedType) {
      where.type = normalizedType;
    }

    if (status && status !== 'all') {
      where.status = status as string;
    }

    if (from_date || to_date) {
      where.date = {};
      if (from_date) where.date.gte = new Date(from_date as string);
      if (to_date) where.date.lte = new Date(to_date as string);
    }

    if (search) {
      const searchTerm = (search as string).trim();
      const searchBy = search_by as string || 'voucher-no';
      
      // SQLite doesn't support case-insensitive mode, so we use contains directly
      switch (searchBy) {
        case 'voucher-no':
          where.OR = [
            { voucherNumber: { contains: searchTerm } }
          ];
          break;
        case 'voucher-name':
          where.OR = [
            { narration: { contains: searchTerm } }
          ];
          break;
        case 'amount':
          // For amount search, we need to search in voucher entries
          // First get all vouchers, then filter by amount in entries
          break;
        default:
          // Default search both voucher number and narration
          where.OR = [
            { voucherNumber: { contains: searchTerm } },
            { narration: { contains: searchTerm } }
          ];
      }
    }

    const [vouchers, total] = await Promise.all([
      prisma.voucher.findMany({
        where,
        include: {
          VoucherEntry: {
            include: {
              Account: {
                select: {
                  id: true,
                  code: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.voucher.count({ where }),
    ]);

    // Filter out vouchers linked to soft-deleted sales invoices
    let filteredVouchers = vouchers.filter((voucher) => {
      // This is a simple filter since we don't have entries loaded
      // In a real implementation, you'd need to check voucher entries for customer links
      return true; // For now, return all vouchers
    });

    // Handle amount search if needed
    if (search && (search_by as string) === 'amount') {
      const searchAmount = parseFloat(search as string);
      if (!isNaN(searchAmount)) {
        filteredVouchers = filteredVouchers.filter(voucher => {
          // Check if any voucher entry has the searched amount
          return voucher.VoucherEntry.some(entry => 
            entry.debit === searchAmount || entry.credit === searchAmount
          );
        });
      }
    }

    // Transform vouchers to match frontend format
    const transformedVouchers = filteredVouchers.map((voucher) => ({
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      type: voucher.type,
      date: voucher.date.toISOString().split('T')[0],
      narration: voucher.narration || '',
      cashBankAccount: voucher.cashBankAccount || '',
      chequeNumber: voucher.chequeNumber || undefined,
      chequeDate: voucher.chequeDate ? voucher.chequeDate.toISOString().split('T')[0] : undefined,
      entries: voucher.VoucherEntry.map(entry => ({
        id: entry.id,
        account: entry.accountId || entry.accountName,
        description: entry.description || '',
        debit: entry.debit,
        credit: entry.credit,
        Account: entry.Account
      })),
      totalDebit: voucher.totalDebit,
      totalCredit: voucher.totalCredit,
      status: voucher.status,
      storeId: (voucher as any).storeId,
      adjustmentId: (voucher as any).adjustmentId,
      isSystemGenerated: (voucher as any).isSystemGenerated,
      createdAt: voucher.createdAt.toISOString(),
    }));

    res.json({
      data: transformedVouchers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredVouchers.length,
        totalPages: Math.ceil(filteredVouchers.length / limitNum) || 0,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get a single voucher by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              select: {
                id: true,
                code: true,
                name: true
              }
            }
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    res.json({
      data: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        type: voucher.type,
        date: voucher.date.toISOString().split('T')[0],
        narration: voucher.narration || '',
        cashBankAccount: voucher.cashBankAccount || '',
        chequeNumber: voucher.chequeNumber || undefined,
        chequeDate: voucher.chequeDate ? voucher.chequeDate.toISOString().split('T')[0] : undefined,
        entries: voucher.VoucherEntry.map((entry) => ({
          id: entry.id,
          account: entry.accountId || entry.accountName,
          description: entry.description || '',
          debit: entry.debit,
          credit: entry.credit,
          Account: entry.Account,
          adjustmentId: (entry as any).adjustmentId,
        })),
        totalDebit: voucher.totalDebit,
        totalCredit: voucher.totalCredit,
        status: voucher.status,
        storeId: (voucher as any).storeId,
        adjustmentId: (voucher as any).adjustmentId,
        isSystemGenerated: (voucher as any).isSystemGenerated,
        createdAt: voucher.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new voucher
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      voucherNumber,
      type,
      date,
      narration,
      cashBankAccount,
      chequeNumber,
      chequeDate,
      entries,
      totalDebit,
      totalCredit,
      status = 'draft',
      createdBy,
      storeId,
    } = req.body;

    if (!voucherNumber || !type || !date) {
      return res.status(400).json({ error: 'Voucher number, type, and date are required' });
    }

    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'At least one entry is required' });
    }

    // Validate debit equals credit
    const calculatedDebit = entries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
    const calculatedCredit = entries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);

    if (Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
      return res.status(400).json({ error: 'Total debit must equal total credit' });
    }

    const voucher = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber,
        type,
        date: new Date(date),
        narration: narration || null,
        cashBankAccount: cashBankAccount || null,
        chequeNumber: chequeNumber || null,
        chequeDate: chequeDate ? new Date(chequeDate) : null,
        totalDebit: calculatedDebit,
        totalCredit: calculatedCredit,
        status,
        createdBy: createdBy || null,
        storeId: storeId || null,
        updatedAt: new Date(),
        VoucherEntry: {
          create: entries.map((entry: any, index: number) => ({
            id: crypto.randomUUID(),
            accountId: entry.accountId || null,
            accountName: entry.account || entry.accountName || 'Account',
            description: entry.description || null,
            debit: entry.debit || 0,
            credit: entry.credit || 0,
            sortOrder: entry.sortOrder !== undefined ? entry.sortOrder : index,
          })),
        },
      } as any,
      include: {
        VoucherEntry: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.status(201).json({
      data: {
        id: voucher.id,
        voucherNumber: voucher.voucherNumber,
        type: voucher.type,
        date: voucher.date.toISOString().split('T')[0],
        narration: voucher.narration || '',
        cashBankAccount: voucher.cashBankAccount || '',
        VoucherEntry: (voucher as any).VoucherEntry.map((entry: any) => ({
          id: entry.id,
          account: entry.accountName,
          description: entry.description || '',
          debit: entry.debit,
          credit: entry.credit,
        })),
        totalDebit: voucher.totalDebit,
        totalCredit: voucher.totalCredit,
        status: voucher.status,
        storeId: (voucher as any).storeId,
        createdAt: voucher.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'Voucher number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update a voucher
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      type,
      date,
      narration,
      cashBankAccount,
      chequeNumber,
      chequeDate,
      entries,
      status,
      approvedBy,
      storeId,
    } = req.body;

    // Check if voucher exists
    const existingVoucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!existingVoucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    // Check if status is changing to "posted" and update account balances
    if (existingVoucher.status !== 'posted' && status === 'posted') {
      console.log(`Posting voucher ${existingVoucher.voucherNumber}, updating account balances...`);
      
      for (const entry of existingVoucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          console.log(`Skipping entry ${entry.id} - no account linked`);
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceChange = 0;

        // Calculate balance change based on account type
        // Assets/Expenses: Debit increases balance, Credit decreases balance
        // Liabilities/Equity/Revenue: Credit increases balance, Debit decreases balance
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceChange = entry.debit - entry.credit;
        } else {
          balanceChange = entry.credit - entry.debit;
        }

        // Update account balance
        if (balanceChange !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                increment: balanceChange,
              },
              updatedAt: new Date(),
            },
          });
          
          console.log(`Updated account ${entry.Account.code} (${entry.Account.name}): ${balanceChange > 0 ? '+' : ''}Rs. ${balanceChange}`);
        }
      }
    }

    // If status is changing from "posted" to "draft", reverse the balances
    if (existingVoucher.status === 'posted' && status === 'draft') {
      console.log(`Unposting voucher ${existingVoucher.voucherNumber}, reversing account balances...`);
      
      for (const entry of existingVoucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceReversal = 0;

        // Calculate reversal (opposite of posting)
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceReversal = entry.credit - entry.debit;
        } else {
          balanceReversal = entry.debit - entry.credit;
        }

        // Reverse the balance change
        if (balanceReversal !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                increment: balanceReversal,
              },
              updatedAt: new Date(),
            },
          });
          
          console.log(`Reversed account ${entry.Account.code} (${entry.Account.name}): ${balanceReversal > 0 ? '+' : ''}Rs. ${balanceReversal}`);
        }
      }
    }

    if ((existingVoucher as any).isSystemGenerated || (existingVoucher as any).adjustmentId) {
      return res.status(403).json({ error: 'Voucher status cannot be changed because it is system generated. Edit the source transaction (e.g. Adjustment) instead.' });
    }

    // If entries are provided, validate and update
    if (entries && Array.isArray(entries)) {
      const calculatedDebit = entries.reduce((sum: number, e: any) => sum + (e.debit || 0), 0);
      const calculatedCredit = entries.reduce((sum: number, e: any) => sum + (e.credit || 0), 0);

      if (Math.abs(calculatedDebit - calculatedCredit) > 0.01) {
        return res.status(400).json({ error: 'Total debit must equal total credit' });
      }

      // Delete existing entries and create new ones
      await prisma.voucherEntry.deleteMany({
        where: { voucherId: id },
      });

      await prisma.voucher.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(date && { date: new Date(date) }),
          ...(narration !== undefined && { narration: narration || null }),
          ...(cashBankAccount !== undefined && { cashBankAccount: cashBankAccount || null }),
          ...(chequeNumber !== undefined && { chequeNumber: chequeNumber || null }),
          ...(chequeDate !== undefined && { chequeDate: chequeDate ? new Date(chequeDate) : null }),
          totalDebit: calculatedDebit,
          totalCredit: calculatedCredit,
          ...(status && { status }),
          ...(status === 'posted' && approvedBy && {
            approvedBy,
            approvedAt: new Date(),
          }),
          // Clear approvedBy and approvedAt when changing from posted to draft
          ...(status === 'draft' && {
            approvedBy: null,
            approvedAt: null,
          }),
          ...(storeId !== undefined && { storeId: storeId || null }),
        },
      });

      // Create new voucher entries
      await prisma.voucherEntry.createMany({
        data: entries.map((entry: any, index: number) => ({
          id: `ve_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 9)}`,
          voucherId: id,
          accountId: entry.accountId || null,
          accountName: entry.account || entry.accountName || 'Account',
          description: entry.description || null,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
          sortOrder: entry.sortOrder !== undefined ? entry.sortOrder : index,
        })),
      });
    } else {
      // Update voucher fields only
      await prisma.voucher.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(date && { date: new Date(date) }),
          ...(narration !== undefined && { narration: narration || null }),
          ...(cashBankAccount !== undefined && { cashBankAccount: cashBankAccount || null }),
          ...(chequeNumber !== undefined && { chequeNumber: chequeNumber || null }),
          ...(chequeDate !== undefined && { chequeDate: chequeDate ? new Date(chequeDate) : null }),
          ...(status && { status }),
          ...(status === 'posted' && approvedBy && {
            approvedBy,
            approvedAt: new Date(),
          }),
          // Clear approvedBy and approvedAt when changing from posted to draft
          ...(status === 'draft' && {
            approvedBy: null,
            approvedAt: null,
          }),
          ...(storeId !== undefined && { storeId: storeId || null }),
        },
      });
    }

    const updatedVoucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    res.json({
      data: {
        id: updatedVoucher!.id,
        voucherNumber: updatedVoucher!.voucherNumber,
        type: updatedVoucher!.type,
        date: updatedVoucher!.date.toISOString().split('T')[0],
        narration: updatedVoucher!.narration || '',
        cashBankAccount: updatedVoucher!.cashBankAccount || '',
        VoucherEntry: updatedVoucher!.VoucherEntry.map((entry) => ({
          id: entry.id,
          account: entry.accountName,
          description: entry.description || '',
          debit: entry.debit,
          credit: entry.credit,
        })),
        totalDebit: updatedVoucher!.totalDebit,
        totalCredit: updatedVoucher!.totalCredit,
        status: updatedVoucher!.status,
        storeId: (updatedVoucher as any).storeId,
        createdAt: updatedVoucher!.createdAt.toISOString(),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a voucher and reverse account balances
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const voucher = await prisma.voucher.findUnique({
      where: { id },
      include: {
        VoucherEntry: {
          include: {
            Account: {
              include: {
                Subgroup: {
                  include: {
                    MainGroup: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    if ((voucher as any).isSystemGenerated || (voucher as any).adjustmentId) {
      return res.status(403).json({ error: 'System generated vouchers cannot be deleted. Delete the source transaction (e.g. Adjustment) instead.' });
    }

    // If voucher is posted, reverse account balances before deletion
    if (voucher.status === 'posted' && voucher.VoucherEntry.length > 0) {

      for (const entry of voucher.VoucherEntry) {
        if (!entry.accountId || !entry.Account) {
          continue;
        }

        const accountType = entry.Account.Subgroup.MainGroup.type.toLowerCase();
        let balanceReversal: number;

        // Calculate reversal based on account type
        // Assets/Expenses: Original change = debit - credit, Reverse = credit - debit
        // Liabilities/Equity/Revenue: Original change = credit - debit, Reverse = debit - credit
        if (accountType === 'asset' || accountType === 'expense' || accountType === 'cost') {
          balanceReversal = entry.credit - entry.debit;
        } else {
          balanceReversal = entry.debit - entry.credit;
        }

        // Reverse the balance change
        if (balanceReversal !== 0) {
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                decrement: balanceReversal, // Decrement the reversal amount (which reverses the original change)
              },
            },
          });

        }
      }

    }

    // Delete voucher entries (will cascade, but explicit for clarity)
    await prisma.voucherEntry.deleteMany({
      where: { voucherId: id },
    });

    // Delete the voucher
    await prisma.voucher.delete({
      where: { id },
    });

    res.json({
      message: 'Voucher deleted successfully',
      reversedAccounts: voucher.status === 'posted' ? voucher.VoucherEntry.length : 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

