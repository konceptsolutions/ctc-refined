import express from "express";
import prisma from "../config/database.js";

const router = express.Router();

const customerUsageInclude = {
  Account: {
    select: {
      id: true,
      code: true,
      currentBalance: true,
      status: true,
      customerId: true,
      openingBalance: true,
      Subgroup: {
        select: {
          code: true,
          MainGroup: { select: { type: true } },
        },
      },
      _count: { select: { VoucherEntry: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  _count: {
    select: {
      Receivable: true,
      SalesInvoice: true,
      SalesQuotation: true,
      SalesReturn: true,
      VoucherEntry: true,
    },
  },
} as const;

const pickPrimaryReceivableAccountFromCustomer = (customer: any) => {
  const accounts = Array.isArray(customer?.Account) ? customer.Account : [];
  const isReceivable = (a: any) =>
    String(a?.code || "").startsWith("105") ||
    String(a?.Subgroup?.code || "") === "105";

  return (
    accounts.find((a: any) => a.customerId === customer.id && isReceivable(a)) ||
    accounts.find((a: any) => a.customerId === customer.id) ||
    accounts.find((a: any) => isReceivable(a)) ||
    accounts[0] ||
    null
  );
};

const calculateBalanceChangeByType = (
  debit: number,
  credit: number,
  accountType: string,
) => {
  const t = String(accountType || "").toLowerCase();
  if (["asset", "expense", "cost"].includes(t)) return debit - credit;
  return credit - debit;
};

async function getLiveLedgerBalanceForAccount(account: any): Promise<number> {
  if (!account?.id) return 0;
  const aggregate = await prisma.voucherEntry.aggregate({
    where: {
      accountId: account.id,
      Voucher: {
        status: "posted",
        OR: [{ isCleared: null }, { isCleared: 1 }],
      },
    },
    _sum: {
      debit: true,
      credit: true,
    },
  });

  const totalDebit = Number(aggregate._sum.debit || 0);
  const totalCredit = Number(aggregate._sum.credit || 0);
  const opening = Number(account.openingBalance || 0);
  const accountType = String(account?.Subgroup?.MainGroup?.type || "asset");
  return opening + calculateBalanceChangeByType(totalDebit, totalCredit, accountType);
}

const customerCanBeDeleted = (customer: any) =>
  Number(customer.openingBalance || 0) === 0 &&
  customer._count.Receivable === 0 &&
  customer._count.SalesInvoice === 0 &&
  customer._count.SalesQuotation === 0 &&
  customer._count.SalesReturn === 0 &&
  customer._count.VoucherEntry === 0 &&
  customer.Account.every(
    (account: any) =>
      Number(account.currentBalance || 0) === 0 &&
      account._count.VoucherEntry === 0,
  );

/**
 * Resolve the customer's receivable ledger account.
 * Prefer FK / payload id; fall back to legacy accounts matched by name under subgroup 105.
 * Never creates an account — callers that need create must do so explicitly.
 */
async function findCustomerLedgerAccount(
  customerId: string,
  opts: {
    accountId?: string | null;
    names?: Array<string | null | undefined>;
  } = {},
) {
  const preferReceivable = (accounts: any[]) =>
    accounts.find((a) => a.code?.startsWith("105")) ||
    accounts.find((a) => a.Subgroup?.code === "105") ||
    accounts[0] ||
    null;

  if (opts.accountId) {
    const byId = await prisma.account.findFirst({
      where: {
        id: opts.accountId,
        supplierId: null,
        OR: [{ customerId }, { customerId: null }],
      },
      include: { Subgroup: true },
    });
    if (byId) return byId;
  }

  const byCustomerId = await prisma.account.findMany({
    where: { customerId, supplierId: null },
    include: { Subgroup: true },
    orderBy: { createdAt: "asc" },
  });
  const linked = preferReceivable(byCustomerId);
  if (linked) return linked;

  const names = [
    ...new Set(
      (opts.names || [])
        .map((n) => (typeof n === "string" ? n.trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (names.length === 0) return null;

  const receivables = await prisma.subgroup.findFirst({
    where: { code: "105" },
  });
  if (!receivables) return null;

  const byName = await prisma.account.findMany({
    where: {
      name: { in: names },
      subgroupId: receivables.id,
      supplierId: null,
      OR: [{ customerId }, { customerId: null }],
    },
    include: { Subgroup: true },
    orderBy: { createdAt: "asc" },
  });

  // Prefer an account already linked to this customer, then unlinked legacy
  const preferred =
    byName.find((a) => a.customerId === customerId) ||
    byName.find((a) => !a.customerId) ||
    byName[0] ||
    null;

  return preferred;
}

async function findCustomerOpeningBalanceVoucher(
  customerId: string,
  customerName?: string | null,
) {
  const byId = await prisma.voucher.findFirst({
    where: {
      AND: [
        { narration: { contains: `(CUST-${customerId})` } },
        { narration: { contains: "Opening Balance" } },
      ],
      status: "posted",
      deletedAt: null,
    },
    include: { VoucherEntry: true },
  });
  if (byId) return byId;

  const name = String(customerName || "").trim();
  if (!name) return null;

  return prisma.voucher.findFirst({
    where: {
      narration: {
        startsWith: `Customer Opening Balance: ${name}`,
      },
      status: "posted",
      deletedAt: null,
    },
    include: { VoucherEntry: true },
  });
}

async function nextCustomerOpeningBalanceJvNumber(): Promise<string> {
  const lastVoucher = await prisma.voucher.findFirst({
    where: { voucherNumber: { startsWith: "JV-" } },
    orderBy: { voucherNumber: "desc" },
  });
  let nextNum = 1;
  if (lastVoucher) {
    const match = lastVoucher.voucherNumber.match(/JV-(\d+)/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }
  return `JV-${String(nextNum).padStart(4, "0")}`;
}

/**
 * Ensure the system JV for a customer's opening balance exists and matches
 * Customer.openingBalance / date. Rebuilds the receivable currentBalance from
 * posted ledger entries so phantom balances without vouchers get corrected.
 */
async function syncCustomerOpeningBalanceVoucher(opts: {
  customerId: string;
  customerName: string;
  openingBalance: number;
  date?: Date | null;
  customerAccountId: string;
}) {
  const ownerCapital = await prisma.account.findFirst({
    where: { code: "501003" },
  });
  if (!ownerCapital) {
    throw new Error(
      "Owner Capital account (501003) not found. Cannot post opening balance.",
    );
  }

  const custAcc = await prisma.account.findUnique({
    where: { id: opts.customerAccountId },
    include: { Subgroup: { include: { MainGroup: true } } },
  });
  if (!custAcc) {
    throw new Error("Customer receivable account not found for opening balance");
  }

  const target = Number(opts.openingBalance || 0);
  const existing = await findCustomerOpeningBalanceVoucher(
    opts.customerId,
    opts.customerName,
  );

  // Remove prior OB voucher; reverse only Owner Capital (receivable rebuilt below).
  if (existing) {
    for (const entry of existing.VoucherEntry) {
      if (entry.accountId === ownerCapital.id) {
        // Capital was applied as +(credit - debit); reverse with opposite.
        await prisma.account.update({
          where: { id: ownerCapital.id },
          data: {
            currentBalance: {
              increment: Number(entry.debit || 0) - Number(entry.credit || 0),
            },
          },
        });
      }
    }
    await prisma.voucherEntry.deleteMany({ where: { voucherId: existing.id } });
    await prisma.voucher.delete({ where: { id: existing.id } });
  }

  if (target !== 0) {
    const absBalance = Math.abs(target);
    const isPositive = target > 0;
    const voucherNumber = await nextCustomerOpeningBalanceJvNumber();
    const voucherDate = opts.date ? new Date(opts.date) : new Date();

    const customerEntry = {
      id: crypto.randomUUID(),
      accountId: custAcc.id,
      accountName: `${custAcc.code}-${custAcc.name}`,
      description: `Customer Opening Balance: ${opts.customerName} - ${absBalance}`,
      debit: isPositive ? absBalance : 0,
      credit: isPositive ? 0 : absBalance,
      sortOrder: 0,
      customerId: opts.customerId,
    };
    const capitalEntry = {
      id: crypto.randomUUID(),
      accountId: ownerCapital.id,
      accountName: `${ownerCapital.code}-${ownerCapital.name}`,
      description: `Customer Opening Balance: ${opts.customerName} - ${absBalance}`,
      debit: isPositive ? 0 : absBalance,
      credit: isPositive ? absBalance : 0,
      sortOrder: 1,
      customerId: opts.customerId,
    };

    await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber,
        type: "journal",
        date: voucherDate,
        narration: `Customer Opening Balance: ${opts.customerName} (CUST-${opts.customerId})`,
        totalDebit: absBalance,
        totalCredit: absBalance,
        status: "posted",
        createdBy: "System",
        approvedBy: "System",
        approvedAt: new Date(),
        isSystemGenerated: true,
        updatedAt: new Date(),
        VoucherEntry: { create: [customerEntry, capitalEntry] },
      },
    });

    await prisma.account.update({
      where: { id: ownerCapital.id },
      data: {
        currentBalance: {
          increment: isPositive ? absBalance : -absBalance,
        },
      },
    });
  }

  const live = await getLiveLedgerBalanceForAccount(custAcc);
  await prisma.account.update({
    where: { id: custAcc.id },
    data: {
      currentBalance: live,
      ...(custAcc.customerId !== opts.customerId
        ? { customerId: opts.customerId }
        : {}),
    },
  });

  return { voucherPosted: target !== 0, balance: live };
}

// GET /api/customers - Get all customers with filters and pagination
router.get("/", async (req, res) => {
  try {
    const { search, searchBy, status, page = "1", limit = "10" } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    // Build the where clause
    const where: any = {};

    // Status filter - only apply if not "all"
    if (status && status !== "all") {
      where.status = status;
    }

    // Fetch all customers matching status filter
    const allCustomers = await prisma.customer.findMany({
      where,
      include: customerUsageInclude,
      orderBy: { createdAt: "desc" },
    });

    // Filter out "Demo" customers (case-insensitive)
    let filteredCustomers = allCustomers.filter(
      (customer: any) => !customer.name.toLowerCase().includes("demo"),
    );

    // Apply case-insensitive search filter in JavaScript (SQLite compatible)
    if (search) {
      const searchTerm = (search as string).toLowerCase();
      filteredCustomers = filteredCustomers.filter((customer: any) => {
        if (searchBy) {
          switch (searchBy) {
            case "name":
              return customer.name?.toLowerCase().includes(searchTerm);
            case "email":
              return customer.email?.toLowerCase().includes(searchTerm);
            case "cnic":
              return customer.cnic?.toLowerCase().includes(searchTerm);
            case "contact":
              return (
                customer.contactNo?.toLowerCase().includes(searchTerm) ||
                customer.cellNumber?.toLowerCase().includes(searchTerm)
              );
            default:
              return (
                customer.name?.toLowerCase().includes(searchTerm) ||
                customer.email?.toLowerCase().includes(searchTerm)
              );
          }
        } else {
          // Search both name and email
          return (
            customer.name?.toLowerCase().includes(searchTerm) ||
            customer.email?.toLowerCase().includes(searchTerm)
          );
        }
      });
    }

    // Get total count for pagination
    const total = filteredCustomers.length;

    // Apply pagination
    const paginatedCustomers = filteredCustomers.slice(skip, skip + limitNum);

    // Map customers to include accountId and balance from linked receivable account
    const customersWithAccountId = await Promise.all(paginatedCustomers.map(async (customer: any) => {
      // Resolve primary receivable account deterministically to match ledger.
      const primaryAccount = pickPrimaryReceivableAccountFromCustomer(customer);
      const liveBalance = primaryAccount
        ? await getLiveLedgerBalanceForAccount(primaryAccount)
        : Number(customer.openingBalance || 0);

      return {
        ...customer,
        canDelete: customerCanBeDeleted(customer),
        balance: liveBalance,
        accountId: primaryAccount?.id || null,
        accounts: undefined, // Remove accounts array from response
        Account: undefined, // Clean up unused relations
        _count: undefined,
      };
    }));

    res.json({
      data: customersWithAccountId,
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

// GET /api/customers/:id - Get single customer
router.get("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: {
        Account: {
          select: {
            id: true,
            code: true,
            currentBalance: true,
            status: true,
            customerId: true,
            openingBalance: true,
            Subgroup: {
              select: {
                code: true,
                MainGroup: { select: { type: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Resolve primary receivable account deterministically to match ledger.
    const primaryAccount = pickPrimaryReceivableAccountFromCustomer(customer);

    const balance = primaryAccount
      ? await getLiveLedgerBalanceForAccount(primaryAccount)
      : Number(customer.openingBalance || 0);
    const accountId = primaryAccount?.id || null;

    // Remove Account from response to match original format
    const customerData = { ...customer };
    delete (customerData as any).Account;

    res.json({ data: { ...customerData, balance, accountId } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/customers - Create new customer
router.post("/", async (req, res) => {
  try {
    const {
      name,
      address,
      email,
      cnic,
      contactNo,
      openingBalance,
      date,
      creditLimit,
      status,
      priceType,
      code,
      accountHead,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      pstNumber,
      ntn,
      remarks,
      category,
      accountOpeningDate,
      accountClosingDate,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Customer name is required" });
    }

    // Parse openingBalance to ensure it's a number (not a string)
    const parsedOpeningBalance = openingBalance
      ? parseFloat(openingBalance)
      : 0;

    // Auto-generate code if missing
    let finalCode = code;
    if (!finalCode) {
      const customers = await prisma.customer.findMany({
        where: { code: { startsWith: "CUST-" } },
        select: { code: true },
      });

      let maxNum = 0;
      customers.forEach((c) => {
        if (c.code) {
          const match = c.code.match(/CUST-(\d+)/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
      });

      const nextNum = maxNum + 1;
      finalCode = `CUST-${String(nextNum).padStart(4, "0")}`;
    }

    const customer = await prisma.customer.create({
      data: {
        id: crypto.randomUUID(), // Generate unique ID
        name,
        address: address || null,
        email: email || null,
        cnic: cnic || null,
        contactNo: contactNo || null,
        openingBalance: parsedOpeningBalance, // Use parsed value
        date: date ? new Date(date) : null,
        creditLimit: creditLimit ? parseFloat(creditLimit) : 0,
        status: status || "active",
        priceType: priceType || null,
        code: finalCode,
        accountHead: accountHead || null,
        shortTitle: shortTitle || null,
        referenceName: referenceName || null,
        area: area || null,
        cellNumber: cellNumber || null,
        contactPersons: contactPersons || [],
        gstNumber: gstNumber || null,
        pstNumber: pstNumber || null,
        ntn: ntn || null,
        remarks: remarks || null,
        category: category || null,
        accountOpeningDate: accountOpeningDate
          ? new Date(accountOpeningDate)
          : null,
        accountClosingDate: accountClosingDate
          ? new Date(accountClosingDate)
          : null,
        updatedAt: new Date(), // Add updatedAt
      },
    });

    // ALWAYS create customer account under Current Assets (subgroup 105)
    // This ensures all customers appear in Current Assets as Accounts Receivable (Customer Receivable)
    try {
      // Find Customer Receivable subgroup (105) - Current Assets
      const receivablesSubgroup = await prisma.subgroup.findFirst({
        where: { code: "105" },
      });

      if (receivablesSubgroup) {
        // Generate account code: 105XXX where XXX is sequential
        const existingAccounts = await prisma.account.findMany({
          where: {
            code: {
              startsWith: "105",
            },
          },
          orderBy: {
            code: "desc",
          },
        });

        let accountCode = "105001";
        if (existingAccounts.length > 0) {
          const lastCode = existingAccounts[0].code;
          const match = lastCode.match(/^105(\d+)$/);
          if (match) {
            const lastNum = parseInt(match[1], 10);
            const nextNum = lastNum + 1;
            accountCode = `105${String(nextNum).padStart(3, "0")}`;
          }
        }

        // Check if account already exists for this customer
        const existingAccount = await prisma.account.findFirst({
          where: {
            name: name,
            subgroupId: receivablesSubgroup.id,
          },
        });

        if (!existingAccount) {
          // Create customer account — balance comes from the OB voucher below.
          const customerAccount = await prisma.account.create({
            data: {
              subgroupId: receivablesSubgroup.id,
              code: accountCode,
              name: name,
              description: `Customer Receivable: ${name}`,
              openingBalance: 0,
              currentBalance: 0,
              status: "Active",
              canDelete: false,
              customerId: customer.id, // Link account to customer
              id: `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              updatedAt: new Date(),
            },
          });

          if (parsedOpeningBalance !== 0) {
            await syncCustomerOpeningBalanceVoucher({
              customerId: customer.id,
              customerName: name,
              openingBalance: parsedOpeningBalance,
              date: date ? new Date(date) : null,
              customerAccountId: customerAccount.id,
            });
          }
        } else {
          // Legacy account already existed by name — still post OB if needed.
          if (existingAccount.customerId !== customer.id) {
            await prisma.account.update({
              where: { id: existingAccount.id },
              data: { customerId: customer.id },
            });
          }
          if (parsedOpeningBalance !== 0) {
            await syncCustomerOpeningBalanceVoucher({
              customerId: customer.id,
              customerName: name,
              openingBalance: parsedOpeningBalance,
              date: date ? new Date(date) : null,
              customerAccountId: existingAccount.id,
            });
          }
        }
      } else {
        console.error(
          "Customer Receivable subgroup (105) not found; customer account not created",
        );
      }
    } catch (accountError: any) {
      console.error(
        "Error creating customer account / opening balance voucher:",
        accountError,
      );
    }

    res.status(201).json({ data: customer });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/customers/:id - Update customer
router.put("/:id", async (req, res) => {
  try {
    const {
      name,
      address,
      email,
      cnic,
      contactNo,
      openingBalance,
      date,
      creditLimit,
      status,
      priceType,
      accountId, // Account ID from payload
      code,
      accountHead,
      shortTitle,
      referenceName,
      area,
      cellNumber,
      contactPersons,
      gstNumber,
      pstNumber,
      ntn,
      remarks,
      category,
      accountOpeningDate,
      accountClosingDate,
    } = req.body;
    // 1. Fetch old customer data BEFORE update
    const oldCustomer = await prisma.customer.findUnique({
      where: { id: req.params.id },
    });

    if (!oldCustomer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address || null;
    if (email !== undefined) updateData.email = email || null;
    if (cnic !== undefined) updateData.cnic = cnic || null;
    if (contactNo !== undefined) updateData.contactNo = contactNo || null;
    if (openingBalance !== undefined)
      updateData.openingBalance = openingBalance
        ? parseFloat(openingBalance.toString())
        : 0;
    if (date !== undefined) updateData.date = date ? new Date(date) : null;
    if (creditLimit !== undefined)
      updateData.creditLimit = parseFloat(creditLimit.toString());
    if (status !== undefined) updateData.status = status;
    if (priceType !== undefined) updateData.priceType = priceType || null;
    if (code !== undefined) updateData.code = code || null;
    if (accountHead !== undefined) updateData.accountHead = accountHead || null;
    if (shortTitle !== undefined) updateData.shortTitle = shortTitle || null;
    if (referenceName !== undefined)
      updateData.referenceName = referenceName || null;
    if (area !== undefined) updateData.area = area || null;
    if (cellNumber !== undefined) updateData.cellNumber = cellNumber || null;
    if (contactPersons !== undefined)
      updateData.contactPersons = contactPersons;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber || null;
    if (pstNumber !== undefined) updateData.pstNumber = pstNumber || null;
    if (ntn !== undefined) updateData.ntn = ntn || null;
    if (remarks !== undefined) updateData.remarks = remarks || null;
    if (category !== undefined) updateData.category = category || null;
    if (accountOpeningDate !== undefined)
      updateData.accountOpeningDate = accountOpeningDate
        ? new Date(accountOpeningDate)
        : null;
    if (accountClosingDate !== undefined)
      updateData.accountClosingDate = accountClosingDate
        ? new Date(accountClosingDate)
        : null;

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: updateData,
    });

    // 2. Handle Opening Balance Change
    const newOpeningBalance =
      openingBalance !== undefined
        ? openingBalance
          ? parseFloat(openingBalance.toString())
          : 0
        : oldCustomer.openingBalance;
    const oldOpeningBalance = oldCustomer.openingBalance;

    // 3. Handle Status or Name Change - Update associated account (never create a new one)
    if (
      (status !== undefined && oldCustomer.status !== status) ||
      (name !== undefined && oldCustomer.name !== name)
    ) {
      try {
        console.log(
          `[SYNC-DEBUG] Sync triggering for Customer ID: ${req.params.id}`,
        );
        console.log(`[SYNC-DEBUG] Status: ${oldCustomer.status} -> ${status}`);
        console.log(`[SYNC-DEBUG] Name: "${oldCustomer.name}" -> "${name}"`);

        const customerAccount = await findCustomerLedgerAccount(req.params.id, {
          accountId,
          names: [oldCustomer.name, name],
        });

        if (customerAccount) {
          console.log(
            `[SYNC-DEBUG] Found associated account: ${customerAccount.code} ("${customerAccount.name}")`,
          );
          const updateAccountData: any = {};

          // Relink legacy accounts that were matched by name only
          if (customerAccount.customerId !== req.params.id) {
            updateAccountData.customerId = req.params.id;
          }

          // Handle Status synchronization
          if (status !== undefined && oldCustomer.status !== status) {
            updateAccountData.status =
              status === "active" ? "Active" : "Inactive";
          }

          // Handle Name synchronization
          if (name !== undefined && oldCustomer.name !== name) {
            updateAccountData.name = name;
            updateAccountData.description = `Customer Account: ${name}`;
          }

          if (Object.keys(updateAccountData).length > 0) {
            const updatedAcc = await prisma.account.update({
              where: { id: customerAccount.id },
              data: updateAccountData,
            });
            if (name !== undefined && oldCustomer.name !== name) {
              await prisma.voucherEntry.updateMany({
                where: { accountId: updatedAcc.id },
                data: {
                  accountName: `${updatedAcc.code}-${updatedAcc.name}`,
                },
              });
            }
            console.log(
              `[SYNC-DEBUG] SUCCESS: Updated account ${updatedAcc.code}. New Name: "${updatedAcc.name}", Status: ${updatedAcc.status}`,
            );
          } else {
            console.log(`[SYNC-DEBUG] No actual changes needed for account.`);
          }
        } else {
          console.warn(
            `[SYNC-DEBUG] WARNING: No account found for customer ID: ${req.params.id}`,
          );
        }
      } catch (err: any) {
        console.error(
          "[SYNC-DEBUG] ERROR synchronizing customer account:",
          err,
        );
      }
    }

    const oldDateMs = oldCustomer.date
      ? new Date(oldCustomer.date).getTime()
      : null;
    const newDateMs = customer.date ? new Date(customer.date).getTime() : null;
    const dateChanged = oldDateMs !== newDateMs;
    const existingObVoucher = await findCustomerOpeningBalanceVoucher(
      customer.id,
      oldCustomer.name || customer.name,
    );
    const missingObVoucher =
      Number(newOpeningBalance || 0) !== 0 && !existingObVoucher;
    const shouldSyncOpeningBalance =
      newOpeningBalance !== oldOpeningBalance ||
      dateChanged ||
      missingObVoucher;

    if (shouldSyncOpeningBalance) {
      try {
        console.log(
          `Syncing Opening Balance for Customer ${customer.id}: ${oldOpeningBalance} -> ${newOpeningBalance}` +
            (missingObVoucher ? " (missing voucher)" : "") +
            (dateChanged ? " (date changed)" : ""),
        );

        const customerAccount = await findCustomerLedgerAccount(customer.id, {
          accountId,
          names: [oldCustomer.name, customer.name],
        });

        if (!customerAccount) {
          console.error(
            "Accounts not found for Customer Opening Balance Voucher",
          );
        } else {
          await syncCustomerOpeningBalanceVoucher({
            customerId: customer.id,
            customerName: customer.name,
            openingBalance: Number(newOpeningBalance || 0),
            date: customer.date,
            customerAccountId: customerAccount.id,
          });

          if (oldCustomer.name !== customer.name) {
            await prisma.account.update({
              where: { id: customerAccount.id },
              data: {
                name: customer.name,
                description: `Customer Account: ${customer.name}`,
              },
            });
          }
        }
      } catch (err) {
        console.error("Error updating customer opening balance voucher:", err);
      }
    }

    // Add a debug header to response
    res.set("X-Backend-Version", "1.0.2-sync-debug");
    res.json({ data: customer });
  } catch (error: any) {
    if (error.code === "P2025") {
      return res.status(404).json({ error: "Customer not found" });
    }
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/customers/:id - Allowed only when the customer has no transactions
router.delete("/:id", async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: req.params.id },
      include: customerUsageInclude,
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    if (!customerCanBeDeleted(customer)) {
      return res.status(409).json({
        error:
          "Customer cannot be deleted because transactions exist against it.",
      });
    }

    await prisma.$transaction([
      prisma.account.deleteMany({ where: { customerId: customer.id } }),
      prisma.customer.delete({ where: { id: customer.id } }),
    ]);

    res.json({ message: "Customer deleted successfully" });
  } catch (error: any) {
    if (error.code === "P2003") {
      return res.status(409).json({
        error:
          "Customer cannot be deleted because transactions exist against it.",
      });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
