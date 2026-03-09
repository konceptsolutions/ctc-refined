import express, { Request, Response } from "express";
import prisma from "../config/database";
import { getCanonicalPartId } from "../services/partCanonical";

const router = express.Router();

async function getNextNumberForPrefix(args: {
  prefix: string;
  voucherType?: string;
}): Promise<string> {
  const { prefix, voucherType } = args;
  const re = new RegExp(`^${prefix}(\\d+)$`);

  const [lastVoucher] = await Promise.all([
    prisma.voucher.findFirst({
      where: {
        ...(voucherType ? { type: voucherType } : {}),
        voucherNumber: { startsWith: prefix },
      },
      orderBy: { voucherNumber: "desc" },
      select: { voucherNumber: true },
    }),
  ]);

  let max = 0;
  for (const v of [lastVoucher?.voucherNumber]) {
    if (!v) continue;
    const m = String(v).match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }

  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

// Helper function to calculate stock balance
async function getStockBalance(partId: string): Promise<number> {
  const movements = await prisma.stockMovement.findMany({
    where: { partId },
    select: { type: true, quantity: true },
  });

  const stockIn = movements
    .filter((m) => m.type === "in")
    .reduce((sum, m) => sum + m.quantity, 0);
  const stockOut = movements
    .filter((m) => m.type === "out")
    .reduce((sum, m) => sum + m.quantity, 0);

  return stockIn - stockOut;
}

// Helper function to get reserved quantity
async function getReservedQuantity(partId: string): Promise<number> {
  try {
    const reservations = await prisma.stockReservation.findMany({
      where: {
        partId,
        status: "reserved",
      },
    });

    return reservations.reduce((sum, r) => sum + r.quantity, 0);
  } catch (error) {
    console.error("Error fetching reserved quantity:", error);
    return 0;
  }
}

// Robust helper to find account by name keywords with optional exclusion
async function findAccountByKeywords(
  keywords: string[],
  fallbackCodes: string[] = [],
  excludeKeywords: string[] = [],
  tx: any = prisma,
) {
  // Try exact match first for better precision
  for (const k of keywords) {
    const exactAcc = await tx.account.findFirst({
      where: {
        status: "Active",
        name: { equals: k, mode: "insensitive" },
      },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
    if (exactAcc) return exactAcc;
  }

  let acc = await tx.account.findFirst({
    where: {
      status: "Active",
      AND: [
        {
          OR: keywords.map((k) => ({
            name: { contains: k, mode: "insensitive" },
          })),
        },
        ...(excludeKeywords.length > 0
          ? [
            {
              NOT: {
                OR: excludeKeywords.map((k) => ({
                  name: { contains: k, mode: "insensitive" },
                })),
              },
            },
          ]
          : []),
      ] as any,
    },
    include: { Subgroup: { include: { MainGroup: true } } },
  });

  if (!acc && fallbackCodes.length) {
    acc = await tx.account.findFirst({
      where: {
        status: "Active",
        OR: fallbackCodes.map((c) => ({ code: { contains: c } })),
      },
      include: { Subgroup: { include: { MainGroup: true } } },
    });
  }
  return acc;
}

// Helper function to create voucher for sales invoice
async function createVoucherForInvoice(
  invoiceNo: string,
  invoiceDate: Date,
  customerType: string,
  accountId: string | null | undefined,
  grandTotal: number,
  invoiceId: string,
  salesPerson?: string,
) {
  try {
    // Generate voucher number (format: JV4707)
    const lastVoucher = await prisma.voucher.findFirst({
      where: {
        type: "journal",
        voucherNumber: {
          startsWith: "JV",
        },
      },
      orderBy: {
        voucherNumber: "desc",
      },
    });

    let nextNumber = 1;
    if (lastVoucher) {
      const match = lastVoucher.voucherNumber.match(/^JV(\d+)$/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      } else {
        const voucherCount = await prisma.voucher.count({
          where: { type: "journal" },
        });
        nextNumber = voucherCount + 1;
      }
    }
    const voucherNumber = `JV${String(nextNumber).padStart(4, "0")}`;

    // Get accounts for voucher entries
    const accountsReceivableAccount =
      customerType === "registered"
        ? await prisma.account.findFirst({
          where: {
            OR: [
              { name: { contains: "Accounts Receivable" } },
              { name: { contains: "Receivable" } },
            ],
            status: "Active",
          },
        })
        : null;

    const salesRevenueAccount = await prisma.account.findFirst({
      where: {
        name: { contains: "Sales Revenue" },
        status: "Active",
      },
    });

    if (!salesRevenueAccount) {
      throw new Error("Sales Revenue account not found");
    }

    // Create voucher entries based on customer type
    const voucherEntries = [];

    if (customerType === "walking" && accountId) {
      // Cash sale - Cash/Bank account (debit) and Sales Revenue (credit)
      const cashAccount = await prisma.account.findUnique({
        where: { id: accountId },
        select: { code: true, name: true },
      });

      voucherEntries.push({
        accountId: accountId,
        accountName: cashAccount
          ? `${cashAccount.code}-${cashAccount.name}`
          : "Cash Account",
        description: `Cash sale - Invoice ${invoiceNo}`,
        debit: grandTotal,
        credit: 0,
        sortOrder: 0,
      });

      voucherEntries.push({
        accountId: salesRevenueAccount.id,
        accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
        description: `Sales Revenue - Invoice ${invoiceNo}`,
        debit: 0,
        credit: grandTotal,
        sortOrder: 1,
      });
    } else if (customerType === "registered" && accountsReceivableAccount) {
      // Party sale - Accounts Receivable (debit) and Sales Revenue (credit)
      voucherEntries.push({
        accountId: accountsReceivableAccount.id,
        accountName: `${accountsReceivableAccount.code}-${accountsReceivableAccount.name}`,
        description: `Receivable - Invoice ${invoiceNo}`,
        debit: grandTotal,
        credit: 0,
        sortOrder: 0,
      });

      voucherEntries.push({
        accountId: salesRevenueAccount.id,
        accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
        description: `Sales Revenue - Invoice ${invoiceNo}`,
        debit: 0,
        credit: grandTotal,
        sortOrder: 1,
      });
    } else {
      // Fallback: only sales revenue if accounts not found
      voucherEntries.push({
        accountId: salesRevenueAccount.id,
        accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
        description: `Sales Revenue - Invoice ${invoiceNo}`,
        debit: 0,
        credit: grandTotal,
        sortOrder: 0,
      });
    }

    // Extract invoice number for narration
    const invoiceNoDisplay = invoiceNo.replace(/^INV-?/i, "");

    // Create voucher
    const voucher = await prisma.voucher.create({
      data: {
        id: crypto.randomUUID(),
        voucherNumber,
        type: "journal",
        date: invoiceDate,
        narration: `Sales Invoice Number: ${invoiceNoDisplay}`,
        totalDebit: grandTotal,
        totalCredit: grandTotal,
        status: "posted",
        createdBy: salesPerson || "System",
        approvedBy: "System",
        approvedAt: new Date(),
        updatedAt: new Date(),
        salesInvoiceId: invoiceId,
        VoucherEntry: {
          create: voucherEntries.map((e) => ({
            ...e,
            salesInvoiceId: invoiceId,
          })),
        },
      },
    });

    return voucher;
  } catch (error: any) {
    throw error;
  }
}

// ========== Sales Inquiry Routes ==========

// Get all inquiries
router.get("/inquiries", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { inquiryNo: { contains: search as string } },
        { customerName: { contains: search as string } },
        { subject: { contains: search as string } },
      ];
    }

    const inquiries = await prisma.salesInquiry.findMany({
      where,
      orderBy: { inquiryDate: "desc" },
    });

    res.json(inquiries);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get inquiry by ID
router.get("/inquiries/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const inquiry = await prisma.salesInquiry.findUnique({
      where: { id },
      include: {
        SalesInquiryItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
    });

    if (!inquiry) {
      return res.status(404).json({ error: "Inquiry not found" });
    }

    res.json(inquiry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create inquiry
router.post("/inquiries", async (req: Request, res: Response) => {
  try {
    const {
      inquiryDate,
      customerName,
      customerEmail,
      customerPhone,
      subject,
      description,
      status,
      items,
    } = req.body;

    // Generate robust inquiry number
    const lastInquiry = await prisma.salesInquiry.findFirst({
      orderBy: { inquiryNo: "desc" },
    });
    let nextNo = 1;
    if (lastInquiry) {
      const match = lastInquiry.inquiryNo.match(/INQ-(\d+)/);
      if (match) {
        nextNo = parseInt(match[1]) + 1;
      }
    }
    const inquiryNo = `INQ-${String(nextNo).padStart(3, "0")}`;

    // Fetch stock and reserved quantities for each item
    const itemsWithStock = await Promise.all(
      items.map(async (item: any) => {
        const stock = await getStockBalance(item.partId);
        const reservedQty = await getReservedQuantity(item.partId);

        // Get part details for prices
        const part = await prisma.part.findUnique({
          where: { id: item.partId },
        });

        return {
          partId: item.partId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice || part?.cost || 0,
          priceA: item.priceA || part?.priceA || 0,
          priceB: item.priceB || part?.priceB || 0,
          priceM: item.priceM || part?.priceM || 0,
          location: item.location || "",
          stock,
          reservedQty,
        };
      }),
    );

    const inquiry = await prisma.salesInquiry.create({
      data: {
        id: crypto.randomUUID(),
        inquiryNo,
        inquiryDate: new Date(inquiryDate),
        customerName,
        customerEmail,
        customerPhone,
        subject,
        description,
        status: status || "New",
        updatedAt: new Date(),
        SalesInquiryItem: {
          create: itemsWithStock,
        },
      },
      include: {
        SalesInquiryItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
    });

    res.json(inquiry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update inquiry
router.put("/inquiries/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      inquiryDate,
      customerName,
      customerEmail,
      customerPhone,
      subject,
      description,
      status,
      items,
    } = req.body;

    // Update inquiry
    const inquiry = await prisma.salesInquiry.update({
      where: { id },
      data: {
        inquiryDate: inquiryDate ? new Date(inquiryDate) : undefined,
        customerName,
        customerEmail,
        customerPhone,
        subject,
        description,
        status,
      },
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await prisma.salesInquiryItem.deleteMany({
        where: { inquiryId: id },
      });

      // Create new items with stock info
      const itemsWithStock = await Promise.all(
        items.map(async (item: any) => {
          const stock = await getStockBalance(item.partId);
          const reservedQty = await getReservedQuantity(item.partId);

          const part = await prisma.part.findUnique({
            where: { id: item.partId },
          });

          return {
            partId: item.partId,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice || part?.cost || 0,
            priceA: item.priceA || part?.priceA || 0,
            priceB: item.priceB || part?.priceB || 0,
            priceM: item.priceM || part?.priceM || 0,
            location: item.location || "",
            stock,
            reservedQty,
          };
        }),
      );

      await prisma.salesInquiryItem.createMany({
        data: itemsWithStock.map((item: any) => ({
          ...item,
          inquiryId: id,
        })),
      });
    }

    const updatedInquiry = await prisma.salesInquiry.findUnique({
      where: { id },
      include: {
        SalesInquiryItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
    });

    res.json(updatedInquiry);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete inquiry
router.delete("/inquiries/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.salesInquiry.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Convert inquiry to quotation
router.post(
  "/inquiries/:id/convert-to-quotation",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { validUntil, customerAddress, notes } = req.body;

      const inquiry = await prisma.salesInquiry.findUnique({
        where: { id },
        include: { SalesInquiryItem: { include: { Part: true } } },
      });

      if (!inquiry) {
        return res.status(404).json({ error: "Inquiry not found" });
      }

      // Generate robust quotation number
      const lastQuotation = await prisma.salesQuotation.findFirst({
        orderBy: { quotationNo: "desc" },
      });
      let nextNo = 1;
      if (lastQuotation) {
        const match = lastQuotation.quotationNo.match(/SQ-(\d+)/);
        if (match) {
          nextNo = parseInt(match[1]) + 1;
        }
      }
      const quotationNo = `SQ-${String(nextNo).padStart(3, "0")}`;

      // Create quotation
      const quotation = await prisma.salesQuotation.create({
        data: {
          id: crypto.randomUUID(),
          quotationNo,
          quotationDate: new Date(),
          validUntil: validUntil
            ? new Date(validUntil)
            : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          customerName: inquiry.customerName,
          customerEmail: inquiry.customerEmail,
          customerPhone: inquiry.customerPhone,
          customerAddress: customerAddress || "",
          status: "draft",
          totalAmount: 0, // Will be calculated from items
          notes: notes || "",
          updatedAt: new Date(),
          SalesQuotationItem: {
            create: inquiry.SalesInquiryItem.map((item) => ({
              id: crypto.randomUUID(),
              partId: item.partId,
              partNo: item.Part.partNo,
              description: item.Part.description || "",
              quantity: item.quantity,
              unitPrice: item.priceA || item.Part.priceA || 0,
              total: item.quantity * (item.priceA || item.Part.priceA || 0),
            })),
          },
        },
        include: {
          SalesQuotationItem: {
            include: {
              Part: true,
            },
          },
        },
      });

      // Calculate total
      const totalAmount = quotation.SalesQuotationItem.reduce(
        (sum, item) => sum + item.total,
        0,
      );
      const updatedQuotation = await prisma.salesQuotation.update({
        where: { id: quotation.id },
        data: { totalAmount },
        include: {
          SalesQuotationItem: {
            include: {
              Part: true,
            },
          },
        },
      });

      // Update inquiry status
      await prisma.salesInquiry.update({
        where: { id },
        data: { status: "Quoted" },
      });

      res.json(updatedQuotation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ========== Sales Quotation Routes ==========

// Get all quotations
router.get("/quotations", async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (search) {
      where.OR = [
        { quotationNo: { contains: search as string } },
        { customerName: { contains: search as string } },
      ];
    }

    const quotations = await prisma.salesQuotation.findMany({
      where,
      include: {
        SalesQuotationItem: {
          include: {
            Part: true,
          },
        },
      },
      orderBy: { quotationDate: "desc" },
    });

    res.json(quotations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get quotation by ID
router.get("/quotations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const quotation = await prisma.salesQuotation.findUnique({
      where: { id },
      include: {
        SalesQuotationItem: {
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
    });

    if (!quotation) {
      return res.status(404).json({ error: "Quotation not found" });
    }

    res.json(quotation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create quotation
router.post("/quotations", async (req: Request, res: Response) => {
  try {
    const {
      quotationDate,
      validUntil,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      status,
      notes,
      items,
    } = req.body;

    // Generate robust quotation number
    const lastQuotation = await prisma.salesQuotation.findFirst({
      orderBy: { quotationNo: "desc" },
    });
    let nextNo = 1;
    if (lastQuotation) {
      const match = lastQuotation.quotationNo.match(/SQ-(\d+)/);
      if (match) {
        nextNo = parseInt(match[1]) + 1;
      }
    }
    const quotationNo = `SQ-${String(nextNo).padStart(3, "0")}`;

    const quotation = await prisma.salesQuotation.create({
      data: {
        id: crypto.randomUUID(),
        quotationNo,
        quotationDate: new Date(quotationDate),
        validUntil: new Date(validUntil),
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        status: status || "draft",
        notes,
        updatedAt: new Date(),
        SalesQuotationItem: {
          create: items.map((item: any) => ({
            id: crypto.randomUUID(),
            partId: item.partId,
            partNo: item.partNo,
            description: item.description || "",
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
          })),
        },
      },
      include: {
        SalesQuotationItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    // Calculate total
    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const updatedQuotation = await prisma.salesQuotation.update({
      where: { id: quotation.id },
      data: { totalAmount },
      include: {
        SalesQuotationItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    res.json(updatedQuotation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update quotation
router.put("/quotations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      quotationDate,
      validUntil,
      customerName,
      customerEmail,
      customerPhone,
      customerAddress,
      status,
      notes,
      items,
    } = req.body;

    // Update quotation
    const quotation = await prisma.salesQuotation.update({
      where: { id },
      data: {
        quotationDate: quotationDate ? new Date(quotationDate) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        status,
        notes,
      },
    });

    // Update items if provided
    if (items) {
      // Delete existing items
      await prisma.salesQuotationItem.deleteMany({
        where: { quotationId: id },
      });

      // Create new items
      await prisma.salesQuotationItem.createMany({
        data: items.map((item: any) => ({
          quotationId: id,
          partId: item.partId,
          partNo: item.partNo,
          description: item.description || "",
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.quantity * item.unitPrice,
        })),
      });
    }

    // Recalculate total
    const updatedItems = await prisma.salesQuotationItem.findMany({
      where: { quotationId: id },
    });
    const totalAmount = updatedItems.reduce((sum, item) => sum + item.total, 0);

    const updatedQuotation = await prisma.salesQuotation.update({
      where: { id },
      data: { totalAmount },
      include: {
        SalesQuotationItem: {
          include: {
            Part: true,
          },
        },
      },
    });

    res.json(updatedQuotation);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete quotation
router.delete("/quotations/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.salesQuotation.delete({
      where: { id },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Convert quotation to invoice
router.post(
  "/quotations/:id/convert-to-invoice",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const {
        invoiceDate,
        customerId,
        customerType,
        salesPerson,
        accountId,
        deliveredTo,
        remarks,
        discount,
        tax,
        paidAmount,
      } = req.body;

      const quotation = await prisma.salesQuotation.findUnique({
        where: { id },
        include: {
          SalesQuotationItem: {
            include: {
              Part: {
                include: {
                  Brand: true,
                },
              },
            },
          },
        },
      });

      if (!quotation) {
        return res.status(404).json({ error: "Quotation not found" });
      }

      // Check stock availability
      for (const item of quotation.SalesQuotationItem) {
        const stock = await getStockBalance(item.partId);
        const reserved = await getReservedQuantity(item.partId);
        const available = stock - reserved;

        if (available < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for part ${item.partNo}. Available: ${available}, Required: ${item.quantity}`,
          });
        }
      }

      // Generate robust invoice number (format: INV-YYYY-XXX)
      const currentYear = new Date(invoiceDate || new Date()).getFullYear();
      const lastInvoice = await prisma.salesInvoice.findFirst({
        where: {
          invoiceNo: {
            startsWith: `INV-${currentYear}-`,
          },
        },
        orderBy: {
          invoiceNo: "desc",
        },
      });

      let nextNo = 1;
      if (lastInvoice) {
        const parts = lastInvoice.invoiceNo.split("-");
        const lastNo = parseInt(parts[2]);
        if (!isNaN(lastNo)) {
          nextNo = lastNo + 1;
        }
      }
      const invoiceNo = `INV-${currentYear}-${String(nextNo).padStart(3, "0")}`;

      // Calculate totals
      const subtotal = quotation.totalAmount;
      const overallDiscount = discount || 0;
      const taxAmount = tax || 0;
      const grandTotal = subtotal - overallDiscount + taxAmount;

      // Create invoice
      const invoice = await prisma.salesInvoice.create({
        data: {
          id: crypto.randomUUID(),
          invoiceNo,
          invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
          customerId: customerId || null,
          customerName: quotation.customerName,
          customerType: customerType || "registered",
          salesPerson: salesPerson || "Admin",
          subtotal,
          overallDiscount,
          tax: taxAmount,
          grandTotal,
          paidAmount: paidAmount || 0,
          status: "pending",
          paymentStatus:
            paidAmount >= grandTotal
              ? "paid"
              : paidAmount > 0
                ? "partial"
                : "unpaid",
          accountId,
          deliveredTo,
          remarks,
          quotationId: id,
          updatedAt: new Date(),
          SalesInvoiceItem: {
            create: quotation.SalesQuotationItem.map((item) => ({
              id: crypto.randomUUID(),
              partId: item.partId,
              partNo: item.partNo,
              description: item.description || "",
              orderedQty: item.quantity,
              deliveredQty: 0,
              pendingQty: item.quantity,
              unitPrice: item.unitPrice,
              avgCost: item.Part?.avgCost || item.Part?.cost || 0,
              discount: 0,
              lineTotal: item.total,
              grade: "A",
              brand: item.Part.Brand?.name || "",
            })),
          },
        },
        include: {
          SalesInvoiceItem: {
            include: {
              Part: true,
            },
          },
        },
      });

      // Create stock reservations for ALL invoices (stock is reserved but not reduced yet)
      for (const item of invoice.SalesInvoiceItem) {
        await prisma.stockReservation.create({
          data: {
            id: crypto.randomUUID(),
            invoiceId: invoice.id,
            partId: item.partId,
            quantity: item.orderedQty,
            status: "reserved",
          },
        });
      }

      // Determine initial status - default to pending
      let initialStatus = "pending";

      // Update invoice status
      await prisma.salesInvoice.update({
        where: { id: invoice.id },
        data: { status: initialStatus },
      });

      // Update quotation status
      await prisma.salesQuotation.update({
        where: { id },
        data: { status: "converted", invoiceId: invoice.id },
      });

      // PART SELL (walking) - Credit Sale Logic
      // NO immediate stock reduction - stock will be reduced when delivery is confirmed
      if (customerType === "walking" && customerId) {
        const dueAmount = grandTotal - (paidAmount || 0);

        // Create receivable for part sell (credit sale)
        await prisma.receivable.create({
          data: {
            id: crypto.randomUUID(),
            invoiceId: invoice.id,
            customerId: customerId as string,
            amount: grandTotal,
            paidAmount: paidAmount || 0,
            dueAmount,
            status:
              dueAmount === 0 ? "paid" : paidAmount > 0 ? "partial" : "pending",
          } as any,
        });

        const accountsReceivableAccount = await prisma.account.findFirst({
          where: {
            OR: [
              { name: { contains: "Accounts Receivable" } },
              { name: { contains: "Receivable" } },
            ],
            status: "Active",
          },
        });

        const salesRevenueAccount = await prisma.account.findFirst({
          where: {
            name: { contains: "Sales Revenue" },
            status: "Active",
          },
        });

        // Voucher will be created during approval, not during invoice creation
        // if (accountsReceivableAccount && salesRevenueAccount) {
        //   await createVoucherForInvoice(
        //     invoiceNo,
        //     new Date(invoiceDate || new Date()),
        //     customerType,
        //     null,
        //     grandTotal,
        //     invoice.id,
        //     salesPerson,
        //   );
        // }

        // Update customer balance
        await prisma.customer.update({
          where: { id: customerId },
          data: {
            openingBalance: {
              increment: dueAmount,
            },
          },
        });
      }
      // CASH SELL (registered) - Cash Sale Logic
      // Stock will be reduced upon approval, but journal entry created immediately
      else if (customerType === "registered" && accountId) {
        const salesRevenueAccount = await prisma.account.findFirst({
          where: {
            name: { contains: "Sales Revenue" },
            status: "Active",
          },
        });

        // Voucher will be created during approval, not during invoice creation
        // if (salesRevenueAccount) {
        //   // Create voucher for cash sale
        //   try {
        //     await createVoucherForInvoice(
        //       invoiceNo,
        //       new Date(invoiceDate || new Date()),
        //       customerType,
        //       accountId,
        //       grandTotal,
        //       invoice.id,
        //       salesPerson,
        //     );
        //   } catch (voucherError: any) { }
        // }
      }

      const updatedInvoice = await prisma.salesInvoice.findUnique({
        where: { id: invoice.id },
        include: {
          SalesInvoiceItem: {
            include: {
              Part: true,
            },
          },
          Receivable: true,
        },
      });

      res.json(updatedInvoice);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// ========== Sales Invoice Routes ==========

// Get all invoices
router.get("/invoices", async (req: Request, res: Response) => {
  try {
    console.log("GET /invoices query:", req.query);
    const { status, paymentStatus, customerType, search } = req.query;
    const where: any = {};

    if (status && status !== "all") {
      where.status = status;
    }

    if (paymentStatus && paymentStatus !== "all") {
      where.paymentStatus = paymentStatus;
    }

    if (customerType && customerType !== "all") {
      where.customerType = customerType;
    }

    if (search) {
      where.AND = [
        {
          OR: [
            { invoiceNo: { contains: search as string } },
            { customerName: { contains: search as string } },
          ],
        },
      ];
    }

    // Fetch all invoices (we'll filter out "Demo" customers in memory since SQLite doesn't support case-insensitive mode)
    const allInvoices = await prisma.salesInvoice.findMany({
      where,
      orderBy: { invoiceDate: "desc" },
      include: {
        SalesInvoiceItem: {
          select: {
            id: true,
            partId: true,
            partNo: true,
            description: true,
            orderedQty: true,
            deliveredQty: true,
            pendingQty: true,
            unitPrice: true,
            discount: true,
            lineTotal: true,
            grade: true,
            brand: true,
          },
        },
      },
    });

    // Filter out invoices with "Demo" customers (case-insensitive) - SQLite doesn't support mode: 'insensitive'
    const filteredInvoices = allInvoices.filter(
      (invoice) => !invoice.customerName.toLowerCase().includes("demo"),
    );

    res.json(filteredInvoices);
  } catch (error: any) {
    console.error("Error in GET /invoices:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get invoice by ID
router.get("/invoices/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesInvoiceItem: {
          include: {
            InvoiceRackShelf: {
              include: {
                Store: true,
                Rack: true,
                Shelf: true,
              },
            },
            Part: {
              include: {
                Brand: true,
                Category: true,
                PartRackShelf: {
                  include: {
                    Rack: true,
                    Shelf: true,
                  },
                },
              },
            },
          },
        },
        DeliveryLog: {
          include: {
            DeliveryLogItem: true,
          },
        },
        Receivable: true,
        SalesQuotation: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get sales invoices by part ID
router.get("/invoices/by-part/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    const { page = "1", limit = "50" } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Find all sales invoice items for this part
    const invoiceItems = await prisma.salesInvoiceItem.findMany({
      where: { partId },
      include: {
        SalesInvoice: {
          include: {
            SalesInvoiceItem: {
              include: {
                Part: {
                  include: {
                    Brand: true,
                    Category: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        SalesInvoice: {
          invoiceDate: "desc",
        },
      },
      skip,
      take: limitNum,
    });

    // Get unique invoices
    const uniqueInvoiceIds = [
      ...new Set(invoiceItems.map((item) => item.invoiceId)),
    ];
    const invoices = await prisma.salesInvoice.findMany({
      where: { id: { in: uniqueInvoiceIds } },
      include: {
        SalesInvoiceItem: {
          where: { partId },
          include: {
            Part: {
              include: {
                Brand: true,
                Category: true,
              },
            },
          },
        },
      },
      orderBy: {
        invoiceDate: "desc",
      },
    });

    // Format response with invoice details and the specific item for this part
    const result = invoices
      .map((inv) => {
        const itemForPart = inv.SalesInvoiceItem?.find(
          (item) => item.partId === partId,
        );
        return {
          id: inv.id,
          invoice_no: inv.invoiceNo,
          invoice_date: inv.invoiceDate,
          customer_name: inv.customerName,
          customer_type: inv.customerType,
          status: inv.status,
          payment_status: inv.paymentStatus,
          grand_total: inv.grandTotal,
          subtotal: inv.subtotal,
          overall_discount: inv.overallDiscount,
          tax: inv.tax,
          paid_amount: inv.paidAmount,
          delivered_to: inv.deliveredTo,
          sales_person: inv.salesPerson,
          item: itemForPart
            ? {
              id: itemForPart.id,
              part_id: itemForPart.partId,
              part_no: itemForPart.partNo,
              part_description: itemForPart.description,
              brand: itemForPart.brand || itemForPart.Part?.Brand?.name || "",
              ordered_qty: itemForPart.orderedQty,
              delivered_qty: itemForPart.deliveredQty,
              pending_qty: itemForPart.pendingQty,
              unit_price: itemForPart.unitPrice,
              discount: itemForPart.discount,
              line_total: itemForPart.lineTotal,
              grade: itemForPart.grade,
            }
            : null,
          created_at: inv.createdAt,
        };
      })
      .filter((inv) => inv.item !== null); // Only return invoices that have items for this part

    const total = await prisma.salesInvoiceItem.count({
      where: { partId },
    });

    res.json({
      data: result,
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

// Create invoice
router.post("/invoices", async (req: Request, res: Response) => {
  try {
    const {
      invoiceDate,
      customerId,
      customerName,
      customerType,
      salesPerson,
      accountId,
      bankAccountId,
      cashAccountId,
      bankAmount, // NEW: Separate bank amount
      cashAmount, // NEW: Separate cash amount
      deliveredTo,
      remarks,
      items,
      subtotal,
      overallDiscount,
      tax,
      grandTotal,
      paidAmount,
    } = req.body;

    // Check stock availability
    for (const item of items) {
      const stock = await getStockBalance(item.partId);
      const reserved = await getReservedQuantity(item.partId);
      const available = stock - reserved;

      if (available < item.orderedQty) {
        return res.status(400).json({
          error: `Insufficient stock for part ${item.partNo}. Available: ${available}, Required: ${item.orderedQty}`,
        });
      }
    }

    // Generate robust invoice number (format: INV-YYYY-XXX)
    const currentYear = new Date(invoiceDate || new Date()).getFullYear();
    const lastInvoice = await prisma.salesInvoice.findFirst({
      where: {
        invoiceNo: {
          startsWith: `INV-${currentYear}-`,
        },
      },
      orderBy: {
        invoiceNo: "desc",
      },
    });

    let nextNo = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoiceNo.split("-");
      const lastNo = parseInt(parts[2]);
      if (!isNaN(lastNo)) {
        nextNo = lastNo + 1;
      }
    }
    const invoiceNo = `INV-${currentYear}-${String(nextNo).padStart(3, "0")}`;

    // Determine which account ID to store (prefer bank, then cash, then legacy accountId)
    const finalAccountId = bankAccountId || cashAccountId || accountId;

    // Create invoice
    const invoice = await prisma.salesInvoice.create({
      data: {
        id: `inv_${Date.now()}`,
        invoiceNo,
        invoiceDate: new Date(invoiceDate),
        customerId: customerId || null,
        customerName,
        customerType: customerType || "registered",
        salesPerson: salesPerson || "Admin",
        accountId: finalAccountId || null,
        subtotal: subtotal || 0,
        overallDiscount: overallDiscount || 0,
        tax: tax || 0,
        grandTotal: grandTotal || 0,
        paidAmount: paidAmount || 0,
        status: "pending",
        paymentStatus:
          paidAmount >= grandTotal
            ? "paid"
            : paidAmount > 0
              ? "partial"
              : "unpaid",
        deliveredTo,
        remarks,
        updatedAt: new Date(),
        SalesInvoiceItem: {
          create: await Promise.all(
            items.map(async (item: any) => {
              // Only fetch and save avgCost when invoice is not pending
              const isPending = true; // new invoices always start as pending
              let resolvedAvgCost = 0;
              if (!isPending) {
                const part = await prisma.part.findUnique({
                  where: { id: item.partId },
                  select: { avgCost: true, cost: true },
                });
                resolvedAvgCost = part?.avgCost || part?.cost || 0;
              }

              // Resolve location details if selectedLocationId is provided
              let storeId = null;
              let rackId = null;
              let shelfId = null;

              const itemData: any = {
                partId: item.partId,
                partNo: item.partNo,
                description: item.description || "",
                orderedQty: item.orderedQty,
                deliveredQty: 0,
                pendingQty: item.orderedQty,
                unitPrice: item.unitPrice,
                avgCost: resolvedAvgCost,
                discount: item.discount || 0,
                lineTotal: item.lineTotal,
                grade: item.grade || "A",
                brand: item.brand || "",
                useUnlocatedStock: !!item.useUnlocatedStock,
              };

              const locationIds =
                item.selectedLocationIds ||
                (item.selectedLocationId ? [item.selectedLocationId] : []);

              if (locationIds.length > 0 && !item.useUnlocatedStock) {
                const prsList = await prisma.partRackShelf.findMany({
                  where: { id: { in: locationIds } },
                });

                if (prsList.length > 0) {
                  let remainingQty = item.orderedQty;
                  const invoiceRackShelves = [];

                  for (let i = 0; i < prsList.length; i++) {
                    const prs = prsList[i];
                    if (remainingQty <= 0 && i > 0) break;

                    let qtyToTake = Math.min(remainingQty, prs.quantity);
                    // For the last one, or if only one, take whatever is left even if negative stock results
                    if (i === prsList.length - 1) {
                      qtyToTake = remainingQty;
                    }

                    if (qtyToTake > 0 || prsList.length === 1) {
                      invoiceRackShelves.push({
                        storeId: prs.storeId,
                        rackId: prs.rackId,
                        shelfId: prs.shelfId,
                        quantity: qtyToTake,
                      });
                      remainingQty -= qtyToTake;
                    }
                  }

                  itemData.InvoiceRackShelf = {
                    create: invoiceRackShelves,
                  };
                }
              }

              return itemData;
            }),
          ),
        },
      },
      include: {
        SalesInvoiceItem: {
          include: {
            InvoiceRackShelf: true,
          },
        },
      },
    });

    // Create stock reservations for ALL invoices (stock is reserved but not reduced yet)
    // Pass location info if available
    for (const item of (invoice as any).SalesInvoiceItem) {
      if (item.InvoiceRackShelf && item.InvoiceRackShelf.length > 0) {
        for (const loc of item.InvoiceRackShelf) {
          await prisma.stockReservation.create({
            data: {
              invoiceId: invoice.id,
              partId: item.partId,
              quantity: loc.quantity,
              status: "reserved",
              storeId: loc.storeId,
              rackId: loc.rackId,
              shelfId: loc.shelfId,
              useUnlocatedStock: false,
            } as any,
          });
        }
      } else {
        await prisma.stockReservation.create({
          data: {
            invoiceId: invoice.id,
            partId: item.partId,
            quantity: item.orderedQty,
            status: "reserved",
            storeId: null,
            rackId: null,
            shelfId: null,
            useUnlocatedStock: !!item.useUnlocatedStock,
          } as any,
        });
      }
    }

    // Determine initial status - default to pending
    let initialStatus = "pending";

    // Update invoice status
    await prisma.salesInvoice.update({
      where: { id: invoice.id },
      data: { status: initialStatus },
    });

    // ========== VOUCHER CREATION LOGIC (Similar to DPO) ==========
    // Always create JV voucher, and RV vouchers if accounts with amounts are selected
    try {
      // Get Sales Revenue account (required for all invoices)
      // STricter search: Prioritize by Main Group Type 'Revenue'
      let salesRevenueAccount = await prisma.account.findFirst({
        where: {
          Subgroup: {
            MainGroup: {
              type: {
                in: [
                  "Revenue",
                  "revenue",
                  "REVENUE",
                  "Income",
                  "income",
                  "INCOME",
                ],
              },
            },
          },
          status: "Active",
        },
        include: {
          Subgroup: {
            include: {
              MainGroup: true,
            },
          },
        },
        orderBy: {
          code: "asc", // Usually picking the first revenue account is safe
        },
      });

      // Fallback only if no Revenue type account exists
      if (!salesRevenueAccount) {
        salesRevenueAccount = await prisma.account.findFirst({
          where: {
            OR: [
              { name: { contains: "Sales Revenue" } },
              { name: { contains: "Goods Sold" } },
              { name: { contains: "Revenue" } },
              { name: { contains: "Sales" } },
              { code: { startsWith: "701" } },
              { code: { startsWith: "401" } },
            ],
            status: "Active",
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

      // If Sales Revenue account doesn't exist, try to find or create Revenue subgroup and account
      if (!salesRevenueAccount) {
        // Find Revenue main group
        const revenueMainGroup = await prisma.mainGroup.findFirst({
          where: {
            OR: [
              { type: "Revenue" },
              { type: "revenue" },
              { type: "Income" },
              { type: "income" },
              { name: { contains: "Revenue" } },
              { name: { contains: "Income" } },
            ],
          },
        });

        if (revenueMainGroup) {
          // Find or create Revenue subgroup
          let revenueSubgroup = await prisma.subgroup.findFirst({
            where: {
              mainGroupId: revenueMainGroup.id,
              OR: [
                { code: "401" },
                { name: { contains: "Revenue" } },
                { name: { contains: "Sales" } },
                { name: { contains: "Income" } },
              ],
            },
          });

          if (!revenueSubgroup) {
            // Create Revenue subgroup
            const existingSubgroups = await prisma.subgroup.findMany({
              where: {
                mainGroupId: revenueMainGroup.id,
                code: {
                  startsWith: "401",
                },
              },
              orderBy: {
                code: "desc",
              },
            });

            let subgroupCode = "401001";
            if (existingSubgroups.length > 0) {
              const lastCode = existingSubgroups[0].code;
              if (lastCode.length >= 6) {
                const sequence = parseInt(lastCode.slice(-3)) || 0;
                subgroupCode = `401${String(sequence + 1).padStart(3, "0")}`;
              }
            }

            revenueSubgroup = await prisma.subgroup.create({
              data: {
                mainGroupId: revenueMainGroup.id,
                code: subgroupCode,
                name: "Sales Revenue",
              } as any,
            });
          }

          if (revenueSubgroup) {
            // Create Sales Revenue account
            const existingAccounts = await prisma.account.findMany({
              where: {
                subgroupId: revenueSubgroup.id,
                code: {
                  startsWith: revenueSubgroup.code,
                },
              },
              orderBy: {
                code: "desc",
              },
            });

            let accountCode = `${revenueSubgroup.code}001`;
            if (existingAccounts.length > 0) {
              const lastCode = existingAccounts[0].code;
              if (lastCode.length >= 6) {
                const sequence = parseInt(lastCode.slice(-3)) || 0;
                accountCode = `${revenueSubgroup.code}${String(sequence + 1).padStart(3, "0")}`;
              }
            }

            salesRevenueAccount = await prisma.account.create({
              data: {
                subgroupId: revenueSubgroup.id,
                code: accountCode,
                name: "Sales Revenue",
                accountType: "regular",
                openingBalance: 0,
                currentBalance: 0,
                status: "Active",
              } as any,
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

      if (!salesRevenueAccount) {
        console.error(
          "CRITICAL: Failed to find or create Sales Revenue Account. Voucher skipped.",
        );
      } else {
        // Generate JV voucher/journal entry number (must be unique across both tables)
        const jvVoucherNumber = await getNextNumberForPrefix({
          prefix: "JV",
          voucherType: "journal",
        });

        // Get customer receivable account
        let customerReceivableAccount = null;
        if (
          customerId &&
          (customerType === "walking" || customerType === "registered")
        ) {
          const customer = await prisma.customer.findUnique({
            where: { id: customerId },
          });

          if (customer) {
            // Find customer account in Customer Receivable subgroup (105)
            const receivableSubgroup = await prisma.subgroup.findFirst({
              where: {
                OR: [
                  { code: "105" }, // Customer Receivable
                  { code: "201" }, // Standard Accounts Receivable subgroup
                  { name: { contains: "Receivable" } },
                  {
                    MainGroup: { type: "Asset" },
                    name: { contains: "Receivable" },
                  },
                ],
              },
            });

            if (receivableSubgroup) {
              customerReceivableAccount = await prisma.account.findFirst({
                where: {
                  subgroupId: receivableSubgroup.id,
                  name: customer.name,
                  status: "Active",
                },
                include: {
                  Subgroup: {
                    include: {
                      MainGroup: true,
                    },
                  },
                },
              });

              // If customer account doesn't exist, create it
              if (!customerReceivableAccount && receivableSubgroup) {
                const existingAccounts = await prisma.account.findMany({
                  where: {
                    subgroupId: receivableSubgroup.id,
                    code: {
                      startsWith: receivableSubgroup.code,
                    },
                  },
                  orderBy: {
                    code: "desc",
                  },
                });

                let accountCode = `${receivableSubgroup.code}001`;
                if (existingAccounts.length > 0) {
                  const lastCode = existingAccounts[0].code;
                  const lastSequence = parseInt(lastCode.slice(-3)) || 0;
                  accountCode = `${receivableSubgroup.code}${String(lastSequence + 1).padStart(3, "0")}`;
                }

                customerReceivableAccount = await prisma.account.create({
                  data: {
                    subgroupId: receivableSubgroup.id,
                    code: accountCode,
                    name: customer.name,
                    accountType: "regular",
                    openingBalance: customer.openingBalance || 0,
                    currentBalance: customer.openingBalance || 0,
                    status: "Active",
                  } as any,
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
        }

        // Build JV voucher entries
        const jvVoucherEntries = [];

        // Determine receivable account to use
        let receivableAccount = customerReceivableAccount;
        if (!receivableAccount) {
          // Fallback to generic Accounts Receivable
          const receivableSubgroup = await prisma.subgroup.findFirst({
            where: {
              OR: [
                { code: "105" },
                { code: "201" },
                { name: { contains: "Receivable" } },
              ],
            },
          });

          if (receivableSubgroup) {
            receivableAccount = await prisma.account.findFirst({
              where: {
                subgroupId: receivableSubgroup.id,
                OR: [
                  { code: "105001" },
                  { code: "201001" },
                  { name: { contains: "Accounts Receivable" } },
                  { name: { contains: "Receivable" } },
                ],
                status: "Active",
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

        // JV Entry 1: Debit Accounts Receivable (or Customer Account)
        if (receivableAccount) {
          jvVoucherEntries.push({
            accountId: receivableAccount.id,
            accountName: `${receivableAccount.code}-${receivableAccount.name}`,
            description: `INV: ${invoiceNo} Receivable Created - ${customerName}`,
            debit: grandTotal,
            credit: 0,
            sortOrder: 0,
          });
        }

        // JV Entry 2: Credit Sales Revenue
        jvVoucherEntries.push({
          accountId: salesRevenueAccount.id,
          accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
          description: `INV: ${invoiceNo} Sales Revenue - ${customerName}`,
          debit: 0,
          credit: grandTotal,
          sortOrder: 1,
        });

        // Create Journal Entry (for ledger tracking)
        const journalLines = jvVoucherEntries.map((entry, index) => ({
          id: `jl_${Date.now()}_${index}`,
          accountId: entry.accountId,
          description: entry.description,
          debit: entry.debit,
          credit: entry.credit,
          lineOrder: entry.sortOrder,
        }));

        const totalDebit = journalLines.reduce(
          (sum, line) => sum + line.debit,
          0,
        );
        const totalCredit = journalLines.reduce(
          (sum, line) => sum + line.credit,
          0,
        );

        // For WALKING customers: skip creation-time JV.
        // Their vouchers (JV for COGS + RV for revenue/payment) are created at approval time.
        // For REGISTERED customers: also skip creation-time JV to prevent duplicate vouchers.
        // Vouchers will be created during approval process only.
        // if (
        //   jvVoucherEntries.length > 0 &&
        //   totalDebit === totalCredit &&
        //   customerType !== "walking"
        // ) {
        //   // Create JV Voucher
        //   const jvVoucher = await prisma.voucher.create({
        //     data: {
        //       voucherNumber: jvVoucherNumber,
        //       type: "journal",
        //       date: new Date(invoiceDate),
        //       narration: customerName,
        //       totalDebit,
        //       totalCredit,
        //       status: "posted",
        //       createdBy: salesPerson || "System",
        //       approvedBy: "System",
        //       approvedAt: new Date(),
        //       salesInvoiceId: invoice.id,
        //       VoucherEntry: {
        //         create: jvVoucherEntries.map((e) => ({
        //           ...e,
        //           salesInvoiceId: invoice.id,
        //         })),
        //       },
        //     } as any,
        //   });

        //   // Update account balances for JV
        //   for (const entry of jvVoucherEntries) {
        //     const acc = await prisma.account.findUnique({
        //       where: { id: entry.accountId },
        //       include: { Subgroup: { include: { MainGroup: true } } },
        //     });
        //     if (acc) {
        //       const accountType = acc.Subgroup.MainGroup.type.toLowerCase();
        //       const balanceChange =
        //         accountType === "asset" ||
        //           accountType === "expense" ||
        //           accountType === "cost"
        //           ? entry.debit - entry.credit
        //           : entry.credit - entry.debit;

        //       await prisma.account.update({
        //         where: { id: entry.accountId },
        //         data: {
        //           currentBalance: {
        //             increment: balanceChange,
        //           },
        //         },
        //       });
        //     }
        //   }

        //   // ========== RV VOUCHER CREATION (if accounts with amounts are selected) ==========
        //   const accountsToProcess: Array<{
        //     id: string;
        //     name: string;
        //     amount: number;
        //   }> = [];

        //   // Check bank account with amount
        //   if (bankAccountId && bankAmount && bankAmount > 0) {
        //     const bankAccount = await prisma.account.findUnique({
        //       where: { id: bankAccountId },
        //       include: {
        //         Subgroup: {
        //           include: {
        //             MainGroup: true,
        //           },
        //         },
        //       },
        //     });

        //     if (bankAccount) {
        //       accountsToProcess.push({
        //         id: bankAccountId,
        //         name: bankAccount.name,
        //         amount: bankAmount,
        //       });
        //     }
        //   }

        //   // Check cash account with amount
        //   if (cashAccountId && cashAmount && cashAmount > 0) {
        //     const cashAccount = await prisma.account.findUnique({
        //       where: { id: cashAccountId },
        //       include: {
        //         Subgroup: {
        //           include: {
        //             MainGroup: true,
        //           },
        //         },
        //       },
        //     });

        //     if (cashAccount) {
        //       accountsToProcess.push({
        //         id: cashAccountId,
        //         name: cashAccount.name,
        //         amount: cashAmount,
        //       });
        //     }
        //   }

        //   // Create RV vouchers for each account with amount
        //   for (const accountInfo of accountsToProcess) {
        //     try {
        //       const account = await prisma.account.findUnique({
        //         where: { id: accountInfo.id },
        //         include: {
        //           Subgroup: {
        //             include: {
        //               MainGroup: true,
        //             },
        //           },
        //         },
        //       });

        //       if (!account) continue;

        //       const subgroupCode = account.Subgroup?.code || "";
        //       const isCashOrBank =
        //         subgroupCode === "101" || subgroupCode === "102";

        //       if (!isCashOrBank) {
        //         const accountType =
        //           account.Subgroup?.MainGroup?.type?.toLowerCase() || "";
        //         if (accountType !== "asset") {
        //           continue;
        //         }
        //       }

        //       // Generate RV number (format: RV####)
        //       const lastRV = await prisma.voucher.findFirst({
        //         where: {
        //           type: "receipt",
        //           voucherNumber: {
        //             startsWith: "RV",
        //           },
        //         },
        //         orderBy: {
        //           voucherNumber: "desc",
        //         },
        //       });

        //       let rvNumber = 1;
        //       if (lastRV) {
        //         const match = lastRV.voucherNumber.match(/^RV(\d+)$/);
        //         if (match) {
        //           rvNumber = parseInt(match[1]) + 1;
        //         } else {
        //           const voucherCount = await prisma.voucher.count({
        //             where: { type: "receipt" },
        //           });
        //           rvNumber = voucherCount + 1;
        //         }
        //       }
        //       const rvVoucherNumber = `RV${String(rvNumber).padStart(4, "0")}`;

        //       // Create RV Voucher
        //       // Debit Cash/Bank (increases asset) and Credit Receivable (decreases receivable)
        //       const rvVoucher = await prisma.voucher.create({
        //         data: {
        //           voucherNumber: rvVoucherNumber,
        //           type: "receipt",
        //           date: new Date(invoiceDate),
        //           narration: customerName,
        //           cashBankAccount: account.name,
        //           totalDebit: accountInfo.amount,
        //           totalCredit: accountInfo.amount,
        //           status: "posted",
        //           createdBy: salesPerson || "System",
        //           approvedBy: "System",
        //           approvedAt: new Date(),
        //           salesInvoiceId: invoice.id,
        //           VoucherEntry: {
        //             create: [
        //               {
        //                 accountId: account.id,
        //                 accountName: `${account.code}-${account.name}`,
        //                 description: `Receipt for INV ${invoiceNo}`,
        //                 debit: accountInfo.amount,
        //                 credit: 0,
        //                 sortOrder: 0,
        //                 salesInvoiceId: invoice.id,
        //               },
        //               {
        //                 accountId: receivableAccount!.id,
        //                 accountName: `${receivableAccount!.code}-${receivableAccount!.name}`,
        //                 description: `Receipt for INV ${invoiceNo}`,
        //                 debit: 0,
        //                 credit: accountInfo.amount,
        //                 sortOrder: 1,
        //                 salesInvoiceId: invoice.id,
        //               },
        //             ],
        //           },
        //         },
        //       } as any);

        //       // Update account balances for RV voucher
        //       // Debit Cash/Bank (increases asset)
        //       await prisma.account.update({
        //         where: { id: account.id },
        //         data: {
        //           currentBalance: {
        //             increment: accountInfo.amount, // Asset increases with debit
        //           },
        //         },
        //       });

        //       // Credit Receivable (decreases receivable asset)
        //       await prisma.account.update({
        //         where: { id: receivableAccount!.id },
        //         data: {
        //           currentBalance: {
        //             decrement: accountInfo.amount, // Receivable decreases with credit
        //           },
        //         },
        //       });
        //     } catch (rvError: any) { }
        //   }

        //   if (accountsToProcess.length === 0) {
        //     // ========== CASH SALE RV VOUCHER CREATION ==========
        //     // NOTE: For walking customers, RV is created at APPROVAL time (not here).
        //     // This avoids duplicate vouchers. Skip walking customer RV on invoice creation.
        //     if (
        //       false && // Disabled: walking customer RV created at approval time
        //       customerType === "walking" &&
        //       finalAccountId &&
        //       paidAmount > 0
        //     ) {
        //       try {
        //         const cashAccount = await prisma.account.findUnique({
        //           where: { id: finalAccountId },
        //           include: {
        //             Subgroup: {
        //               include: { MainGroup: true },
        //             },
        //           },
        //         });

        //         if (cashAccount) {
        //           const subgroupCode = cashAccount.Subgroup?.code || "";
        //           const isCashOrBank =
        //             subgroupCode === "101" || subgroupCode === "102";
        //           const accountType =
        //             cashAccount.Subgroup?.MainGroup?.type?.toLowerCase() || "";

        //           if (isCashOrBank || accountType === "asset") {
        //             // Generate RV number
        //             const lastRV = await prisma.voucher.findFirst({
        //               where: {
        //                 type: "receipt",
        //                 voucherNumber: { startsWith: "RV" },
        //               },
        //               orderBy: { voucherNumber: "desc" },
        //             });

        //             let rvNumber = 1;
        //             if (lastRV) {
        //               const match = lastRV.voucherNumber.match(/^RV(\d+)$/);
        //               if (match) {
        //                 rvNumber = parseInt(match[1]) + 1;
        //               } else {
        //                 const voucherCount = await prisma.voucher.count({
        //                   where: { type: "receipt" },
        //                 });
        //                 rvNumber = voucherCount + 1;
        //               }
        //             }
        //             const rvVoucherNumber = `RV${String(rvNumber).padStart(4, "0")}`;

        //             // Get Sales Revenue account for RV
        //             const salesRevenueAccount = await prisma.account.findFirst({
        //               where: {
        //                 OR: [
        //                   { name: { contains: "Sales Revenue" } },
        //                   { code: { startsWith: "701" } },
        //                 ],
        //                 status: "Active",
        //               },
        //             });

        //             if (salesRevenueAccount) {
        //               // Create RV Voucher: DR Cash/Bank, CR Sales Revenue
        //               const rvVoucher = await prisma.voucher.create({
        //                 data: {
        //                   voucherNumber: rvVoucherNumber,
        //                   type: "receipt",
        //                   date: new Date(invoiceDate),
        //                   narration: `Cash Sale - Invoice ${invoiceNo}`,
        //                   cashBankAccount: cashAccount.name,
        //                   totalDebit: paidAmount,
        //                   totalCredit: paidAmount,
        //                   status: "posted",
        //                   createdBy: salesPerson || "System",
        //                   approvedBy: "System",
        //                   approvedAt: new Date(),
        //                   salesInvoiceId: invoice.id,
        //                   VoucherEntry: {
        //                     create: [
        //                       {
        //                         accountId: cashAccount.id,
        //                         accountName: `${cashAccount.code}-${cashAccount.name}`,
        //                         description: `Cash Sale - Invoice ${invoiceNo}`,
        //                         debit: paidAmount,
        //                         credit: 0,
        //                         sortOrder: 0,
        //                         salesInvoiceId: invoice.id,
        //                       },
        //                       {
        //                         accountId: salesRevenueAccount.id,
        //                         accountName: `${salesRevenueAccount.code}-${salesRevenueAccount.name}`,
        //                         description: `Sales Revenue - Invoice ${invoiceNo}`,
        //                         debit: 0,
        //                         credit: paidAmount,
        //                         sortOrder: 1,
        //                         salesInvoiceId: invoice.id,
        //                       },
        //                     ],
        //                   },
        //                 },
        //               } as any);

        //               // Update account balances
        //               await prisma.account.update({
        //                 where: { id: cashAccount.id },
        //                 data: { currentBalance: { increment: paidAmount } },
        //               });

        //               await prisma.account.update({
        //                 where: { id: salesRevenueAccount.id },
        //                 data: { currentBalance: { increment: paidAmount } },
        //               });
        //             }
        //           }
        //         }
        //       } catch (rvError: any) { }
        //     } else {
        //     }
        //   }
        // }
      }
    } catch (voucherError: any) {
      // Don't fail invoice creation if voucher creation fails
    }

    // PART SELL (walking) - Credit Sale Logic (for receivable creation)
    // NO immediate stock reduction - stock will be reduced when delivery is confirmed
    if (customerType === "walking" && customerId) {
      const totalPaid =
        (bankAmount || 0) + (cashAmount || 0) || paidAmount || 0;
      const dueAmount = grandTotal - totalPaid;

      // Create receivable for part sell (credit sale)
      await prisma.receivable.create({
        data: {
          invoiceId: invoice.id,
          customerId,
          amount: grandTotal,
          paidAmount: totalPaid,
          dueAmount,
          status:
            dueAmount === 0 ? "paid" : totalPaid > 0 ? "partial" : "pending",
        } as any,
      });

      // Update customer balance
      await prisma.customer.update({
        where: { id: customerId },
        data: {
          openingBalance: {
            increment: dueAmount,
          },
        },
      });
    }

    const updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id: invoice.id },
      include: {
        SalesInvoiceItem: {
          include: {
            Part: true,
          },
        },
        Receivable: true,
      },
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Update sales invoice (for store managers to edit invoices)
router.put("/invoices/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      invoiceDate,
      customerName,
      customerId,
      deliveredTo,
      remarks,
      items,
      overallDiscount,
      subtotal,
      grandTotal,
      accountId,
      bankAccountId,
      cashAccountId,
      bankAmount,
      cashAmount,
      paidAmount,
    } = req.body;

    // Find existing invoice
    const existingInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesInvoiceItem: true,
        StockReservation: true,
        DeliveryLog: true,
        Receivable: true,
      },
    });

    if (!existingInvoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Don't allow editing cancelled or fully delivered invoices
    if (existingInvoice.status === "cancelled") {
      return res.status(400).json({ error: "Cannot edit a cancelled invoice" });
    }

    if (existingInvoice.status === "fully_delivered") {
      return res
        .status(400)
        .json({ error: "Cannot edit a fully delivered invoice" });
    }

    // Check if any items have been delivered
    const hasDeliveredItems = existingInvoice.SalesInvoiceItem?.some(
      (item) => item.deliveredQty > 0,
    );
    if (hasDeliveredItems && items) {
      return res.status(400).json({
        error:
          "Cannot modify items on an invoice that has partial deliveries. Please complete or cancel existing deliveries first.",
      });
    }

    // Update basic invoice fields
    const updateData: any = {};

    if (invoiceDate !== undefined) {
      updateData.invoiceDate = new Date(invoiceDate);
    }
    if (customerName !== undefined) {
      updateData.customerName = customerName;
    }
    if (customerId !== undefined) {
      updateData.customerId = customerId;
    }
    if (deliveredTo !== undefined) {
      updateData.deliveredTo = deliveredTo;
    }
    if (remarks !== undefined) {
      updateData.remarks = remarks;
    }
    if (overallDiscount !== undefined) {
      updateData.overallDiscount = overallDiscount;
    }
    if (subtotal !== undefined) {
      updateData.subtotal = subtotal;
    }
    if (grandTotal !== undefined) {
      updateData.grandTotal = grandTotal;
    }

    // Determine which account ID to store
    if (
      bankAccountId !== undefined ||
      cashAccountId !== undefined ||
      accountId !== undefined
    ) {
      updateData.accountId =
        bankAccountId || cashAccountId || accountId || null;
    }

    if (paidAmount !== undefined) {
      updateData.paidAmount = paidAmount;
    }

    // Recalculate payment status if relevant fields changed
    const currentPaid =
      paidAmount !== undefined ? paidAmount : existingInvoice.paidAmount;
    const currentGrand =
      grandTotal !== undefined ? grandTotal : existingInvoice.grandTotal;

    if (paidAmount !== undefined || grandTotal !== undefined) {
      updateData.paymentStatus =
        currentPaid >= currentGrand
          ? "paid"
          : currentPaid > 0
            ? "partial"
            : "unpaid";
    }

    // If items are being updated, handle them
    if (items && Array.isArray(items) && items.length > 0) {
      // First, release existing stock reservations
      for (const reservation of existingInvoice.StockReservation) {
        if (reservation.status === "reserved") {
          await prisma.stockReservation.update({
            where: { id: reservation.id },
            data: {
              status: "released",
              releasedAt: new Date(),
            },
          });
        }
      }

      // Delete existing items
      await prisma.salesInvoiceItem.deleteMany({
        where: { invoiceId: id },
      });

      // Create new items
      let subtotal = 0;
      for (const item of items) {
        const lineTotal = item.orderedQty * item.unitPrice;
        subtotal += lineTotal;

        const part = await prisma.part.findUnique({
          where: { id: item.partId },
          select: { avgCost: true, cost: true },
        });

        const itemData: any = {
          invoiceId: id,
          partId: item.partId,
          partNo: item.partNo || "",
          description: item.description || "",
          orderedQty: item.orderedQty,
          deliveredQty: 0,
          pendingQty: item.orderedQty,
          unitPrice: item.unitPrice,
          avgCost: part?.avgCost || part?.cost || 0,
          discount: item.discount || 0,
          lineTotal: lineTotal,
          grade: item.grade || "A",
          brand: item.brand || "",
          useUnlocatedStock: !!item.useUnlocatedStock,
        };

        const locationIds =
          item.selectedLocationIds ||
          (item.selectedLocationId ? [item.selectedLocationId] : []);
        const invoiceRackShelves = [];

        if (locationIds.length > 0 && !item.useUnlocatedStock) {
          const prsList = await prisma.partRackShelf.findMany({
            where: { id: { in: locationIds } },
          });

          if (prsList.length > 0) {
            let remainingQty = item.orderedQty;
            for (let i = 0; i < prsList.length; i++) {
              const prs = prsList[i];
              if (remainingQty <= 0 && i > 0) break;

              let qtyToTake = Math.min(remainingQty, prs.quantity);
              if (i === prsList.length - 1) {
                qtyToTake = remainingQty;
              }

              if (qtyToTake > 0 || prsList.length === 1) {
                invoiceRackShelves.push({
                  storeId: prs.storeId,
                  rackId: prs.rackId,
                  shelfId: prs.shelfId,
                  quantity: qtyToTake,
                });
                remainingQty -= qtyToTake;
              }
            }

            itemData.InvoiceRackShelf = {
              create: invoiceRackShelves,
            };
          }
        }

        await prisma.salesInvoiceItem.create({
          data: itemData,
        });

        // Create new stock reservations
        if (invoiceRackShelves.length > 0) {
          for (const loc of invoiceRackShelves) {
            await prisma.stockReservation.create({
              data: {
                invoiceId: id,
                partId: item.partId,
                quantity: loc.quantity,
                status: "reserved",
                storeId: loc.storeId,
                rackId: loc.rackId,
                shelfId: loc.shelfId,
                useUnlocatedStock: false,
              } as any,
            });
          }
        } else {
          await prisma.stockReservation.create({
            data: {
              invoiceId: id,
              partId: item.partId,
              quantity: item.orderedQty,
              status: "reserved",
              storeId: null,
              rackId: null,
              shelfId: null,
              useUnlocatedStock: !!item.useUnlocatedStock,
            } as any,
          });
        }
      }

      // Calculate new totals
      const discount =
        overallDiscount !== undefined
          ? overallDiscount
          : existingInvoice.overallDiscount;
      const grandTotal = subtotal - discount;

      updateData.subtotal = subtotal;
      updateData.grandTotal = grandTotal;
    } else if (overallDiscount !== undefined) {
      // If only discount changed, recalculate grand total
      updateData.grandTotal = existingInvoice.subtotal - overallDiscount;
    }

    // Update the invoice
    const updatedInvoice = await prisma.salesInvoice.update({
      where: { id },
      data: updateData,
      include: {
        SalesInvoiceItem: {
          include: {
            Part: true,
          },
        },
        DeliveryLog: {
          include: {
            DeliveryLogItem: true,
          },
        },
        Receivable: true,
      },
    });

    // Update receivable if exists and totals changed
    if (existingInvoice.Receivable && updateData.grandTotal !== undefined) {
      const newDueAmount = updateData.grandTotal - existingInvoice.paidAmount;
      await prisma.receivable.update({
        where: { invoiceId: id },
        data: {
          amount: updateData.grandTotal,
          dueAmount: newDueAmount,
          status:
            newDueAmount <= 0
              ? "paid"
              : existingInvoice.paidAmount > 0
                ? "partial"
                : "pending",
        },
      });
    }

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Approve Cash Sale Invoice (reduces stock immediately)
router.post("/invoices/:id/approve", async (req: Request, res: Response) => {
  console.log(`[APPROVE] Starting approval for invoice ID: ${req.params.id}`);
  try {
    const { id } = req.params;
    const { approvedBy } = req.body;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesInvoiceItem: {
          include: {
            InvoiceRackShelf: true,
          },
        },
        StockReservation: true,
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Only cash sales (registered) can be approved
    if (invoice.customerType !== "registered") {
      return res.status(400).json({
        error:
          "Only cash sales can be approved. Part sell invoices require delivery confirmation.",
      });
    }

    // Check if already approved (stock already reduced)
    const hasStockMovements = await prisma.stockMovement.findFirst({
      where: {
        referenceType: "sales_invoice",
        referenceId: id,
        notes: { contains: "Approved" },
      },
    });

    if (hasStockMovements) {
      return res.status(400).json({ error: "Invoice already approved" });
    }

    // Reduce stock only if it hasn't been reduced already (e.g., from 'on_hold' transition)
    if (invoice.status !== "on_hold") {
      // Reduce stock immediately for cash sale (coming from pending)
      for (const item of invoice.SalesInvoiceItem) {
        // Update stock reservation status to "out"
        await prisma.stockReservation.updateMany({
          where: { invoiceId: id, partId: item.partId, status: "reserved" },
          data: { status: "out" },
        });

        // Identify where stock should come from (Locations)
        let locations: {
          storeId: string | null;
          rackId: string | null;
          shelfId: string | null;
          quantity: number;
        }[] = [];

        const itemAny = item as any;
        if (itemAny.InvoiceRackShelf && itemAny.InvoiceRackShelf.length > 0) {
          locations = itemAny.InvoiceRackShelf.map((irs: any) => ({
            storeId: irs.storeId || null,
            rackId: irs.rackId || null,
            shelfId: irs.shelfId || null,
            quantity: irs.quantity || item.orderedQty,
          }));
        } else {
          // Check reservations
          const reservations = await prisma.stockReservation.findMany({
            where: { invoiceId: id, partId: item.partId },
          });
          if (reservations.length > 0) {
            locations = reservations.map((r) => ({
              storeId: r.storeId || null,
              rackId: r.rackId || null,
              shelfId: r.shelfId || null,
              quantity: r.quantity,
            }));
          } else {
            locations = [
              {
                storeId: null,
                rackId: null,
                shelfId: null,
                quantity: item.orderedQty,
              },
            ];
          }
        }

        for (const loc of locations) {
          if (loc.quantity <= 0) continue;

          const targetPartId = item.partId;

          const prs = await prisma.partRackShelf.findFirst({
            where: {
              partId: targetPartId,
              storeId: loc.storeId,
              rackId: loc.rackId,
              shelfId: loc.shelfId,
            },
          });

          if (prs) {
            await prisma.partRackShelf.update({
              where: { id: prs.id },
              data: { quantity: { decrement: loc.quantity } },
            });
          } else {
            await prisma.partRackShelf.create({
              data: {
                partId: targetPartId,
                storeId: loc.storeId,
                rackId: loc.rackId,
                shelfId: loc.shelfId,
                quantity: -loc.quantity,
              },
            });
          }

          // Create stock movement with location info
          await prisma.stockMovement.create({
            data: {
              partId: item.partId,
              storeId: loc.storeId,
              rackId: loc.rackId,
              shelfId: loc.shelfId,
              type: "out",
              quantity: loc.quantity,
              referenceType: "sales_invoice",
              referenceId: id,
              customerId: invoice.customerId,
              notes: `Sales Invoice ${invoice.invoiceNo} - Approved by ${approvedBy || "Store Manager"}`,
            } as any,
          });
        }
      }
    } else {
      // Coming from on_hold — stock is already reduced.
      // Just update existing 'out' movement notes to reflect approval
      await prisma.stockMovement.updateMany({
        where: {
          referenceType: "sales_invoice",
          referenceId: id,
          type: "out",
        } as any,
        data: {
          notes: `Sales Invoice ${invoice.invoiceNo} - Approved from Hold by ${approvedBy || "Store Manager"}`,
        },
      });
      // Mark reservations as out (they might still be 'reserved' or already 'out' depending on hold implementation)
      await prisma.stockReservation.updateMany({
        where: { invoiceId: id, status: "reserved" },
        data: { status: "out" },
      });
    }

    // Update invoice status
    await prisma.salesInvoice.update({
      where: { id },
      data: {
        status: "approved", // Mark as approved
      },
    });

    // Create cost JV (COGS vs Inventory) when stock is reduced (approval step)
    // This keeps inventory valuation and COGS in sync with stock-out movements.
    // DISABLED: COGS is now handled in the main voucher creation to avoid duplication
    // Main voucher creation logic will handle all vouchers including COGS
    try {
      const costMarker = `COGS for INV ${invoice.invoiceNo}`;

      const existingCostVoucher = await prisma.voucher.findFirst({
        where: {
          type: "journal",
          VoucherEntry: {
            some: {
              description: { contains: costMarker },
            },
          },
        },
        select: { id: true, voucherNumber: true },
      });

      if (!existingCostVoucher) {
        // Inventory account (flexible search)
        const inventoryAccount = await prisma.account.findFirst({
          where: {
            OR: [
              { code: "101001" },
              { code: "104005" },
              { name: { contains: "Inventory" } },
              { Subgroup: { name: { contains: "Inventory" } } },
              {
                Subgroup: {
                  MainGroup: { type: "Asset" },
                  name: { contains: "Inventory" },
                },
              },
            ],
            status: "Active",
          },
          include: {
            Subgroup: { include: { MainGroup: true } },
          },
        });

        // COGS account (flexible search)
        let cogsAccount = await prisma.account.findFirst({
          where: {
            status: "Active",
            OR: [
              { code: "901001" },
              { name: { contains: "Cost of Goods Sold" } },
              { name: { contains: "COGS" } },
              { name: { contains: "Cost Inventory" } },
              { Subgroup: { MainGroup: { name: "Cost" } } },
              { Subgroup: { MainGroup: { type: "Cost" } } },
            ],
          },
          include: {
            Subgroup: { include: { MainGroup: true } },
          },
        });

        if (!cogsAccount) {
          // Find or create "Cost" main group
          let costMainGroup = await prisma.mainGroup.findFirst({
            where: {
              OR: [
                { code: "9" },
                { type: "Cost" },
                { type: "cost" },
                { name: { contains: "Cost" } },
                { name: { contains: "COGS" } },
              ],
            },
          });
          if (!costMainGroup) {
            costMainGroup = await prisma.mainGroup.create({
              data: {
                code: "9",
                name: "Cost",
                type: "Cost",
                displayOrder: 9,
              } as any,
            });
          }

          // Find or create "Cost of Goods Sold" subgroup (901)
          let cogsSubgroup = await prisma.subgroup.findFirst({
            where: {
              mainGroupId: costMainGroup.id,
              OR: [
                { code: "901" },
                { name: { contains: "Cost of Goods" } },
                { name: { contains: "COGS" } },
              ],
            },
          });
          if (!cogsSubgroup) {
            cogsSubgroup = await prisma.subgroup.create({
              data: {
                mainGroupId: costMainGroup.id,
                code: "901",
                name: "Cost of Goods Sold",
              } as any,
            });
          }

          cogsAccount = await prisma.account.create({
            data: {
              subgroupId: cogsSubgroup.id,
              code: "901001",
              name: "Cost of Goods Sold",
              accountType: "regular",
              openingBalance: 0,
              currentBalance: 0,
              status: "Active",
            } as any,
            include: {
              Subgroup: { include: { MainGroup: true } },
            },
          });
        }

        if (inventoryAccount && cogsAccount) {
          // Cost basis: prefer Part.cost; fallback to most recent DPO purchase price.
          let totalCost = 0;
          for (const item of invoice.SalesInvoiceItem) {
            const part = await prisma.part.findUnique({
              where: { id: item.partId },
              select: { cost: true },
            });
            let unitCost =
              typeof part?.cost === "number" && part.cost > 0 ? part.cost : 0;
            if (!unitCost) {
              const lastDpoItem =
                await prisma.directPurchaseOrderItem.findFirst({
                  where: { partId: item.partId },
                  orderBy: { createdAt: "desc" },
                  select: { purchasePrice: true },
                });
              if (lastDpoItem?.purchasePrice && lastDpoItem.purchasePrice > 0) {
                unitCost = lastDpoItem.purchasePrice;
              }
            }
            totalCost += unitCost * item.orderedQty;
          }

          if (totalCost > 0) {
            // Generate JV voucher number
            const costVoucherNumber = await getNextNumberForPrefix({
              prefix: "JV",
              voucherType: "journal",
            });

            const totalDebit = totalCost;
            const totalCredit = totalCost;

            // Voucher
            const costVoucher = await prisma.voucher.create({
              data: {
                voucherNumber: costVoucherNumber,
                type: "journal",
                date: invoice.invoiceDate,
                narration: `COGS - ${invoice.invoiceNo}`,
                totalDebit,
                totalCredit,
                status: "posted",
                createdBy: approvedBy || "System",
                approvedBy: "System",
                approvedAt: new Date(),
                salesInvoiceId: id,
                VoucherEntry: {
                  create: [
                    {
                      accountId: cogsAccount.id,
                      accountName: `${cogsAccount.code}-${cogsAccount.name}`,
                      description: costMarker,
                      debit: totalCost,
                      credit: 0,
                      sortOrder: 0,
                      salesInvoiceId: id,
                    },
                    {
                      accountId: inventoryAccount.id,
                      accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
                      description: costMarker,
                      debit: 0,
                      credit: totalCost,
                      sortOrder: 1,
                      salesInvoiceId: id,
                    },
                  ],
                },
              },
            } as any);

            // Update account balances
            await prisma.account.update({
              where: { id: cogsAccount.id },
              data: { currentBalance: { increment: totalCost } },
            });
            await prisma.account.update({
              where: { id: inventoryAccount.id },
              data: { currentBalance: { decrement: totalCost } },
            });
          } else {
          }
        } else {
        }
      }
    } catch (costErr: any) {
      // Don't fail approval if cost voucher creation fails
    }

    // Create vouchers on Approval — wrap in try/catch so approval still succeeds
    try {
      console.log(`[VOUCHER] Starting voucher creation for invoice ${invoice.invoiceNo}, customerType: ${invoice.customerType}, paidAmount: ${invoice.paidAmount}`);
      
      // ── Use exact account IDs ───────────────────────────────────────────
      const inventoryAccountId = "101001"; // Inventory account ID
      const costAccountId = "501001"; // Cost of Goods Sold account ID (you may need to adjust this)
      const goodsRevenueAccountId = "401001"; // Sales Revenue account ID (you may need to adjust this)
      const discountAccountId = "502001"; // Discount account ID (you may need to adjust this)
      
      console.log(`[VOUCHER] Using account IDs: inventory=${inventoryAccountId}, cost=${costAccountId}, revenue=${goodsRevenueAccountId}, discount=${discountAccountId}`);

      // Customer account (for registered customers)
      let customerAccount: any = null;
      if (invoice.customerId) {
        customerAccount = await prisma.account.findFirst({
          where: {
            status: "Active",
            OR: [
              { customerId: invoice.customerId },
              { name: invoice.customerName || "" },
            ],
          },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
      }

      // Payment account (cash/bank) - use inventory account as fallback for cash
      let paymentAccountId: string | null = null;
      if (invoice.paidAmount > 0) {
        paymentAccountId = "101001"; // Use inventory account as cash account for now
      }

      // ── Calculate totals ───────────────────────────────────────────────
      const subtotal = invoice.subtotal || 0;
      const overallDiscount = invoice.overallDiscount || 0;
      const grandTotal = invoice.grandTotal || 0;
      const paidAmount = invoice.paidAmount || 0;
      const discountAmount = overallDiscount || 0;

      console.log(`[VOUCHER] Invoice totals: subtotal=${subtotal}, discount=${discountAmount}, grandTotal=${grandTotal}, paid=${paidAmount}`);

      // ── Generate voucher numbers ────────────────────────────────────────
      const jvNo = await getNextNumberForPrefix({
        prefix: "JV",
        voucherType: "journal",
      });
      const rvNo = await getNextNumberForPrefix({
        prefix: "RV",
        voucherType: "receipt",
      });

      // ── JV Voucher ───────────────────────────────────────────────────────
      // Only create JV for registered customers
      let jvEntries: any[] = [];
      if (invoice.customerType === "registered") {

        // Inventory CR (cost)
        let totalCost = 0;
        for (const item of invoice.SalesInvoiceItem) {
          const part = await prisma.part.findUnique({
            where: { id: item.partId },
            select: { avgCost: true, cost: true },
          });
          const avgCost = part?.avgCost || part?.cost || 0;
          totalCost += avgCost * item.orderedQty;
        }

        if (totalCost > 0) {
          jvEntries.push({
            accountId: inventoryAccountId,
            accountName: `101001-Inventory`,
            description: `INV: ${invoice.invoiceNo} - Inventory Cost`,
            debit: 0,
            credit: totalCost,
            sortOrder: 0,
          });

          jvEntries.push({
            accountId: costAccountId,
            accountName: `501001-Cost of Goods Sold`,
            description: `INV: ${invoice.invoiceNo} - Cost of Goods Sold`,
            debit: totalCost,
            credit: 0,
            sortOrder: 1,
          });
        }

        // Sales Revenue CR (subtotal)
        jvEntries.push({
          accountId: goodsRevenueAccountId,
          accountName: `401001-Sales Revenue`,
          description: `INV: ${invoice.invoiceNo} - Sales Revenue`,
          debit: 0,
          credit: subtotal,
          sortOrder: 2,
        });

        // Customer Receivable DR (grand total)
        if (customerAccount) {
          jvEntries.push({
            accountId: customerAccount.id,
            accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
            description: `INV: ${invoice.invoiceNo} - Customer Receivable (${invoice.customerName})`,
            debit: grandTotal,
            credit: 0,
            sortOrder: 3,
          });
        }

        // Discount DR (if any)
        if (discountAmount > 0) {
          jvEntries.push({
            accountId: discountAccountId,
            accountName: `502001-Discount`,
            description: `INV: ${invoice.invoiceNo} - Discount Given`,
            debit: discountAmount,
            credit: 0,
            sortOrder: 4,
          });

          // Customer Account CR (discount amount)
          if (customerAccount) {
            jvEntries.push({
              accountId: customerAccount.id,
              accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
              description: `INV: ${invoice.invoiceNo} - Discount Adjustment`,
              debit: 0,
              credit: discountAmount,
              sortOrder: 5,
            });
          }
        }

        // Create JV voucher
        const jvDebit = jvEntries.reduce((s, e) => s + e.debit, 0);
        const jvCredit = jvEntries.reduce((s, e) => s + e.credit, 0);
        if (jvEntries.length > 0 && Math.abs(jvDebit - jvCredit) < 0.01) {
          await prisma.voucher.create({
            data: {
              id: `v_${Date.now()}_jv`,
              voucherNumber: jvNo,
              type: "journal",
              date: invoice.invoiceDate, // Use invoice date instead of current date
              narration: `Sales Invoice ${invoice.invoiceNo} - ${invoice.customerName}`,
              totalDebit: jvDebit,
              totalCredit: jvCredit,
              status: "posted",
              createdBy: "System",
              approvedBy: "System",
              approvedAt: new Date(),
              salesInvoiceId: id,
              VoucherEntry: {
                create: jvEntries,
              },
            } as any,
          });
          console.log(`[VOUCHER] JV voucher created: ${jvNo}`);
        }
      }

      // ── RV Voucher ───────────────────────────────────────────────────────
      const rvEntries: any[] = [];
      const isWalking = (invoice.customerType as string) === "walking";

      if (isWalking) {
        // Walking customer RV - full accounting
        rvEntries.push({
          accountId: goodsRevenueAccountId,
          accountName: `401001-Sales Revenue`,
          description: `INV: ${invoice.invoiceNo} - Sales Revenue`,
          debit: 0,
          credit: subtotal,
          sortOrder: 0,
        });

        if (discountAmount > 0) {
          rvEntries.push({
            accountId: discountAccountId,
            accountName: `502001-Discount`,
            description: `INV: ${invoice.invoiceNo} - Discount Given`,
            debit: discountAmount,
            credit: 0,
            sortOrder: 1,
          });
        }

        if (paymentAccountId) {
          rvEntries.push({
            accountId: paymentAccountId,
            accountName: `101001-Cash/Bank`,
            description: `INV: ${invoice.invoiceNo} - Cash/Bank Received`,
            debit: grandTotal,
            credit: 0,
            sortOrder: 2,
          });
        }
      } else {
        // Registered customer RV - only when paidAmount > 0
        if (paidAmount > 0 && customerAccount) {
          // Customer Account CR (payment amount)
          rvEntries.push({
            accountId: customerAccount.id,
            accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
            description: `INV: ${invoice.invoiceNo} - Payment Received (${invoice.customerName})`,
            debit: 0,
            credit: paidAmount,
            sortOrder: 0,
          });
          
          if (paymentAccountId) {
            // Cash/Bank Account DR (payment amount)
            rvEntries.push({
              accountId: paymentAccountId,
              accountName: `101001-Cash/Bank`,
              description: `INV: ${invoice.invoiceNo} - Cash/Bank Received`,
              debit: paidAmount,
              credit: 0,
              sortOrder: 1,
            });
          }
        }
      }

      // Create RV voucher
      const rvDebit = rvEntries.reduce((s, e) => s + e.debit, 0);
      const rvCredit = rvEntries.reduce((s, e) => s + e.credit, 0);
      if (rvEntries.length > 0 && Math.abs(rvDebit - rvCredit) < 0.01) {
        await prisma.voucher.create({
          data: {
            id: `v_${Date.now()}_rv`,
            voucherNumber: rvNo,
            type: "receipt",
            date: invoice.invoiceDate, // Use invoice date instead of current date
            narration: `Receipt for Invoice ${invoice.invoiceNo} - ${invoice.customerName}`,
            totalDebit: rvDebit,
            totalCredit: rvCredit,
            status: "posted",
            createdBy: "System",
            approvedBy: "System",
            approvedAt: new Date(),
            salesInvoiceId: id,
            VoucherEntry: {
              create: rvEntries,
            },
          } as any,
        });
        console.log(`[VOUCHER] RV voucher created: ${rvNo}`);
      }

      // Update account balances
      for (const entry of [...jvEntries, ...rvEntries]) {
        const account = await prisma.account.findUnique({
          where: { id: entry.accountId },
          include: { Subgroup: { include: { MainGroup: true } } },
        });
        if (account) {
          const nature = account.Subgroup?.MainGroup?.type?.toLowerCase() || "asset";
          const isDR = ["asset", "expense", "cost"].includes(nature);
          await prisma.account.update({
            where: { id: entry.accountId },
            data: {
              currentBalance: {
                increment: isDR ? entry.debit - entry.credit : entry.credit - entry.debit,
              },
            },
          });
        }
      }
    } catch (vErr: any) {
      console.error("Voucher creation failed (non-fatal):", vErr.message);
      console.error("Full error:", vErr);
      console.error("Stack trace:", vErr.stack);
    }

    const updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesQuotation: {
          include: {
            SalesQuotationItem: {
              include: {
                Part: true,
              },
            },
          },
        },
      },
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Record delivery - Only for Part Sell (walking) invoices
router.post("/invoices/:id/delivery", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { challanNo, deliveryDate, deliveredBy, items } = req.body;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: { SalesInvoiceItem: true },
    });
    if (!invoice) return res.status(404).json({ error: "Invoice not found" });
    if (invoice.customerType !== "walking")
      return res.status(400).json({
        error: "Delivery can only be recorded for Part sell invoices.",
      });

    // Validate request items
    for (const item of items) {
      if (Number(item.quantity) <= 0)
        return res.status(400).json({ error: "Quantity must be > 0" });
      const invItem = invoice.SalesInvoiceItem?.find(
        (i: any) => i.id === item.invoiceItemId,
      );
      if (!invItem)
        return res
          .status(400)
          .json({ error: `Invalid item ID: ${item.invoiceItemId}` });
    }

    await prisma.$transaction(async (tx) => {
      // Create delivery log
      const deliveryLog = await tx.deliveryLog.create({
        data: {
          id: `dl_${Date.now()}`,
          invoiceId: id,
          challanNo,
          deliveryDate: new Date(deliveryDate),
          deliveredBy,
          DeliveryLogItem: {
            create: items.map((item: any, index: number) => ({
              id: `dli_${Date.now()}_${index}`,
              invoiceItemId: item.invoiceItemId,
              quantity: item.quantity,
            })),
          },
        },
      });

      // Update Items & Stock
      for (const item of items) {
        const invoiceItem = await tx.salesInvoiceItem.findUnique({
          where: { id: item.invoiceItemId },
        });

        if (!invoiceItem)
          throw new Error(`Item ${item.invoiceItemId} not found`);

        const qtyToDeliver = Number(item.quantity);
        const newDeliveredQty = invoiceItem.deliveredQty + qtyToDeliver;

        // Strict Validation: Cannot over-deliver
        if (newDeliveredQty > invoiceItem.orderedQty) {
          throw new Error(
            `Cannot deliver ${qtyToDeliver}. Only ${invoiceItem.orderedQty - invoiceItem.deliveredQty} pending.`,
          );
        }

        await tx.salesInvoiceItem.update({
          where: { id: item.invoiceItemId },
          data: {
            deliveredQty: newDeliveredQty,
            pendingQty: invoiceItem.orderedQty - newDeliveredQty,
          },
        });

        const reservations = await tx.stockReservation.findMany({
          where: {
            invoiceId: id,
            partId: invoiceItem.partId,
            status: "reserved",
          },
          orderBy: { reservedAt: "asc" },
        });

        let remainingQty = qtyToDeliver;
        for (const reservation of reservations) {
          if (remainingQty <= 0) break;
          const moveQty = Math.min(reservation.quantity, remainingQty);
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: { status: "out" },
          });

          await tx.stockMovement.create({
            data: {
              id: `sm_${Date.now()}`,
              partId: invoiceItem.partId,
              type: "out",
              quantity: moveQty,
              referenceType: "sales_invoice",
              referenceId: id,
              notes: `Delivery - Invoice ${invoice.invoiceNo} - Part Sell`,
            },
          });
          remainingQty -= moveQty;
        }
      }

      // Update Status
      const updatedInvoice = await tx.salesInvoice.findUnique({
        where: { id },
        include: { SalesInvoiceItem: true },
      });
      const allDelivered = updatedInvoice?.SalesInvoiceItem?.every(
        (item) => item.pendingQty === 0,
      );
      const hasDelivered = updatedInvoice?.SalesInvoiceItem?.some(
        (item) => item.deliveredQty > 0,
      );
      let newStatus = invoice.status;
      if (allDelivered) newStatus = "fully_delivered";
      else if (hasDelivered) newStatus = "partially_delivered";
      await tx.salesInvoice.update({
        where: { id },
        data: { status: newStatus },
      });

      // COGS
      const inventoryAccount = await tx.account.findFirst({
        where: {
          status: "Active",
          OR: [
            { code: "104001" },
            { Subgroup: { code: "104" } },
            { name: { contains: "Inventory" } },
          ],
        },
      });
      const cogsAccount = await tx.account.findFirst({
        where: {
          status: "Active",
          OR: [
            { code: "901001" },
            { Subgroup: { code: "901" } },
            { name: { contains: "Cost" } },
            { name: { contains: "COGS" } },
          ],
        },
      });

      if (inventoryAccount && cogsAccount) {
        let deliveryCost = 0;
        for (const reqItem of items) {
          const invItem = invoice.SalesInvoiceItem?.find(
            (i: any) => i.id === reqItem.invoiceItemId,
          );
          if (invItem) {
            deliveryCost += (invItem.avgCost || 0) * Number(reqItem.quantity);
          }
        }

        if (deliveryCost > 0) {
          const jvNum = await getNextNumberForPrefix({
            prefix: "JV",
            voucherType: "journal",
          });
          await tx.voucher.create({
            data: {
              voucherNumber: jvNum,
              type: "journal",
              date: new Date(),
              narration: `COGS Delivery - Invoice ${invoice.invoiceNo}`,
              totalDebit: deliveryCost,
              totalCredit: deliveryCost,
              status: "posted",
              createdBy: "System",
              approvedBy: "System",
              approvedAt: new Date(),
              salesInvoiceId: id,
              VoucherEntry: {
                create: [
                  {
                    accountId: cogsAccount.id,
                    accountName: cogsAccount.name,
                    description: `Cost of Delivery - ${invoice.invoiceNo}`,
                    debit: deliveryCost,
                    credit: 0,
                    sortOrder: 0,
                    salesInvoiceId: id,
                  },
                  {
                    accountId: inventoryAccount.id,
                    accountName: inventoryAccount.name,
                    description: `Inventory Reduction - ${invoice.invoiceNo}`,
                    debit: 0,
                    credit: deliveryCost,
                    sortOrder: 1,
                    salesInvoiceId: id,
                  },
                ],
              },
            },
          } as any);
          await tx.account.update({
            where: { id: cogsAccount.id },
            data: { currentBalance: { increment: deliveryCost } },
          });
          await tx.account.update({
            where: { id: inventoryAccount.id },
            data: { currentBalance: { decrement: deliveryCost } },
          });
        }
      }
    });

    const finalInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesInvoiceItem: { include: { Part: true } },
        DeliveryLog: { include: { DeliveryLogItem: true } },
      },
    });
    res.json(finalInvoice);
  } catch (error: any) {
    console.error("Delivery Tx Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Record payment
router.post("/invoices/:id/payment", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, accountId, paymentDate } = req.body;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: { Receivable: true },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    const newPaidAmount = invoice.paidAmount + amount;
    const newPaymentStatus =
      newPaidAmount >= invoice.grandTotal
        ? "paid"
        : newPaidAmount > 0
          ? "partial"
          : "unpaid";

    await prisma.salesInvoice.update({
      where: { id },
      data: {
        paidAmount: newPaidAmount,
        paymentStatus: newPaymentStatus,
      },
    });

    // Update receivable if exists
    if (invoice.Receivable) {
      const newReceivablePaid = invoice.Receivable.paidAmount + amount;
      const newReceivableDue = invoice.Receivable.amount - newReceivablePaid;
      const newReceivableStatus =
        newReceivableDue === 0
          ? "paid"
          : newReceivablePaid > 0
            ? "partial"
            : "pending";

      await prisma.receivable.update({
        where: { invoiceId: id },
        data: {
          paidAmount: newReceivablePaid,
          dueAmount: newReceivableDue,
          status: newReceivableStatus,
        },
      });

      // Create journal entry for payment
      if (accountId) {
        const accountsReceivableAccount = await prisma.account.findFirst({
          where: {
            OR: [
              { name: { contains: "Accounts Receivable" } },
              { name: { contains: "Receivable" } },
            ],
            status: "Active",
          },
        });

        if (accountsReceivableAccount) {
          const vNum = await getNextNumberForPrefix({
            prefix: "RV",
            voucherType: "receipt",
          });
          await prisma.voucher.create({
            data: {
              voucherNumber: vNum,
              type: "receipt",
              date: new Date(paymentDate || new Date()),
              narration: `Payment received - Invoice ${invoice.invoiceNo}`,
              totalDebit: amount,
              totalCredit: amount,
              status: "posted",
              createdBy: "System",
              approvedBy: "System",
              approvedAt: new Date(),
              salesInvoiceId: id,
              VoucherEntry: {
                create: [
                  {
                    accountId,
                    accountName: "Cash/Bank Account",
                    description: `Payment - Invoice ${invoice.invoiceNo}`,
                    debit: amount,
                    credit: 0,
                    sortOrder: 0,
                    salesInvoiceId: id,
                  },
                  {
                    accountId: accountsReceivableAccount.id,
                    accountName: accountsReceivableAccount.name,
                    description: `Receivable payment - Invoice ${invoice.invoiceNo}`,
                    debit: 0,
                    credit: amount,
                    sortOrder: 1,
                    salesInvoiceId: id,
                  },
                ],
              },
            } as any,
          });

          // Update account balances
          await prisma.account.update({
            where: { id: accountId },
            data: { currentBalance: { increment: amount } },
          });
          await prisma.account.update({
            where: { id: accountsReceivableAccount.id },
            data: { currentBalance: { decrement: amount } },
          });
        }
      }

      // Update customer balance
      if (invoice.customerId) {
        await prisma.customer.update({
          where: { id: invoice.customerId },
          data: {
            openingBalance: {
              decrement: amount,
            },
          },
        });
      }
    }

    const updatedInvoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        Receivable: true,
      },
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Put invoice on hold
router.post("/invoices/:id/hold", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { holdReason } = req.body;

    const invoice = await prisma.salesInvoice.update({
      where: { id },
      data: {
        status: "on_hold",
        holdReason,
        holdSince: new Date(),
      },
    });

    res.json(invoice);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Release hold
router.post(
  "/invoices/:id/release-hold",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const invoice = await prisma.salesInvoice.findUnique({
        where: { id },
        include: { SalesInvoiceItem: true },
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      const hasPending = invoice.SalesInvoiceItem?.some(
        (item) => item.pendingQty > 0,
      );
      const hasDelivered = invoice.SalesInvoiceItem?.some(
        (item) => item.deliveredQty > 0,
      );

      let newStatus = "pending";
      if (hasDelivered && hasPending) {
        newStatus = "partially_delivered";
      } else if (!hasPending) {
        newStatus = "fully_delivered";
      }

      const updatedInvoice = await prisma.salesInvoice.update({
        where: { id },
        data: {
          status: newStatus,
          holdReason: null,
          holdSince: null,
        },
      });

      res.json(updatedInvoice);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Update invoice status with full business logic
router.put("/invoices/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, approvedBy, deliveredQtys, holdLocations } = req.body;
    // deliveredQtys: { [invoiceItemId]: number } — for partial delivery
    // holdLocations: { [invoiceItemId]: [{ rackId, shelfId, quantity }] } — for hold stock movement

    const validStatuses = [
      "pending",
      "on_hold",
      "approved",
      "partially_delivered",
      "delivered",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
      include: {
        SalesInvoiceItem: {
          include: {
            InvoiceRackShelf: true,
          },
        },
        StockReservation: true,
        Receivable: true,
      },
    });

    if (!invoice) return res.status(404).json({ error: "Invoice not found" });

    const prevStatus = invoice.status;

    // ─── Validate allowed transitions ───────────────────────────────────────
    // Allow delivery directly from pending if the user skips the explicit 'Approve' step
    const deliveryStatuses = ["partially_delivered", "delivered"];
    const preApprovalStatuses = ["pending", "on_hold"];

    if (
      ["approved"].includes(status) &&
      deliveryStatuses.includes(prevStatus)
    ) {
      return res.status(400).json({
        error: "Cannot revert an invoice that has already been delivered.",
      });
    }

    // ─── → ON_HOLD: move stock to hold (remove from available) ──────────────
    if (
      status === "on_hold" &&
      [
        "pending",
        "approved",
        "partially_delivered",
        "pending_approval",
      ].includes(prevStatus)
    ) {
      // If was approved/partially_delivered, we must reverse the "out" movements first
      if (["approved", "partially_delivered"].includes(prevStatus)) {
        // Reverse OUT movements (restore to PartRackShelf)
        const outMovements = await prisma.stockMovement.findMany({
          where: {
            type: "out",
            referenceType: "sales_invoice",
            referenceId: id,
          } as any,
        });

        for (const m of outMovements) {
          const targetPartId = m.partId;
          const prs = await prisma.partRackShelf.findFirst({
            where: {
              partId: targetPartId,
              storeId: m.storeId || null,
              rackId: m.rackId || null,
              shelfId: m.shelfId || null,
            },
          });
          if (prs) {
            await prisma.partRackShelf.update({
              where: { id: prs.id },
              data: { quantity: { increment: m.quantity } },
            });
          }
        }

        await prisma.stockMovement.deleteMany({
          where: {
            type: "out",
            referenceType: "sales_invoice",
            referenceId: id,
          } as any,
        });
        // Restore reservations to "reserved" from "out"
        await prisma.stockReservation.updateMany({
          where: { invoiceId: id, status: "out" },
          data: { status: "reserved" },
        });
      }

      // Create hold movements and deduct from PartRackShelf (all qty goes to hold/out)
      for (const item of invoice.SalesInvoiceItem) {
        const itemAny = item as any;
        const qtyToHold = item.pendingQty || item.orderedQty;
        if (qtyToHold <= 0) continue;

        const targetPartId = item.partId;

        // Use InvoiceRackShelf entries as the source of locations
        const rackShelfEntries: {
          storeId: string | null;
          rackId: string | null;
          shelfId: string | null;
          quantity: number;
        }[] =
          itemAny.InvoiceRackShelf && itemAny.InvoiceRackShelf.length > 0
            ? itemAny.InvoiceRackShelf.map((irs: any) => ({
              storeId: irs.storeId || null,
              rackId: irs.rackId || null,
              shelfId: irs.shelfId || null,
              quantity: irs.quantity || qtyToHold,
            }))
            : [
              {
                storeId: null,
                rackId: null,
                shelfId: null,
                quantity: qtyToHold,
              },
            ];

        for (const loc of rackShelfEntries) {
          if (loc.quantity <= 0) continue;

          // Decrement existing PartRackShelf entry (remove from available stock)
          const existingPrs = await prisma.partRackShelf.findFirst({
            where: {
              partId: targetPartId,
              storeId: loc.storeId,
              rackId: loc.rackId,
              shelfId: loc.shelfId,
            },
          });

          if (existingPrs) {
            await prisma.partRackShelf.update({
              where: { id: existingPrs.id },
              data: { quantity: { decrement: loc.quantity } },
            });
          } else {
            await prisma.partRackShelf.create({
              data: {
                partId: targetPartId,
                storeId: loc.storeId,
                rackId: loc.rackId,
                shelfId: loc.shelfId,
                quantity: -loc.quantity,
              },
            });
          }

          // Create stock-out movement (shows as 'out' in stock movements)
          await prisma.stockMovement.create({
            data: {
              partId: item.partId,
              storeId: loc.storeId,
              rackId: loc.rackId,
              shelfId: loc.shelfId,
              type: "out",
              quantity: loc.quantity,
              referenceType: "sales_invoice",
              referenceId: id,
              notes: `Invoice ${invoice.invoiceNo} placed on hold`,
            } as any,
          });
        }
      }
    }

    // ─── ON_HOLD → PENDING: restore hold stock back to available ─────────────
    if (status === "pending" && prevStatus === "on_hold") {
      // Find hold/out movements to restore balance
      const holdMovements = await prisma.stockMovement.findMany({
        where: {
          type: "out",
          referenceType: "sales_invoice",
          referenceId: id,
          notes: { contains: "placed on hold" },
        } as any,
      });

      for (const m of holdMovements) {
        const targetPartId = m.partId;
        const prs = await prisma.partRackShelf.findFirst({
          where: {
            partId: targetPartId,
            storeId: m.storeId || null,
            rackId: m.rackId || null,
            shelfId: m.shelfId || null,
          },
        });
        if (prs) {
          await prisma.partRackShelf.update({
            where: { id: prs.id },
            data: { quantity: { increment: m.quantity } },
          });
        }
      }

      // Delete hold/out stock movements for this invoice
      await prisma.stockMovement.deleteMany({
        where: {
          type: "out",
          referenceType: "sales_invoice",
          referenceId: id,
          notes: { contains: "placed on hold" },
        } as any,
      });
      // Clear hold fields
      await prisma.salesInvoice.update({
        where: { id },
        data: { holdReason: null, holdSince: null },
      });
    }

    // ─── → APPROVED or DELIVERY: stock out + avgCost + voucher ──────────────
    // If we are moving to approved OR any delivery status, and we haven't 'approved' (stocked out) yet
    const targetStatusIsPostApproval = [
      "approved",
      "partially_delivered",
      "delivered",
    ].includes(status);
    const prevStatusIsPreApproval = preApprovalStatuses.includes(prevStatus);

    if (targetStatusIsPostApproval && prevStatusIsPreApproval) {
      // Check stock is not already reduced for this invoice
      const existingOut = await prisma.stockMovement.findFirst({
        where: { referenceType: "sales_invoice", referenceId: id, type: "out" },
      });

      if (!existingOut) {
        // We'll process all items in a single transaction-like sequence (though for loop is fine if each is awaited)
        for (const item of invoice.SalesInvoiceItem) {
          // 1. Mark reservations as "out"
          await prisma.stockReservation.updateMany({
            where: { invoiceId: id, partId: item.partId, status: "reserved" },
            data: { status: "out" },
          });

          // 2. Identify where stock should come from (Locations)
          // Priority: 1. InvoiceRackShelf, 2. StockReservation, 3. Item Fallback
          let locations: {
            storeId: string | null;
            rackId: string | null;
            shelfId: string | null;
            quantity: number;
          }[] = [];

          const itemAny = item as any;
          if (itemAny.InvoiceRackShelf && itemAny.InvoiceRackShelf.length > 0) {
            locations = itemAny.InvoiceRackShelf.map((irs: any) => ({
              storeId: irs.storeId || null,
              rackId: irs.rackId || null,
              shelfId: irs.shelfId || null,
              quantity: irs.quantity || item.orderedQty,
            }));
          } else {
            // Check reservations for this specific part/invoice
            const reservations = await prisma.stockReservation.findMany({
              where: { invoiceId: id, partId: item.partId },
            });
            if (reservations.length > 0) {
              locations = reservations.map((r) => ({
                storeId: r.storeId || null,
                rackId: r.rackId || null,
                shelfId: r.shelfId || null,
                quantity: r.quantity,
              }));
            } else {
              // Fallback to unlocated
              locations = [
                {
                  storeId: null,
                  rackId: null,
                  shelfId: null,
                  quantity: item.orderedQty,
                },
              ];
            }
          }

          // 3. Deduct from PartRackShelf and create StockMovements
          for (const loc of locations) {
            if (loc.quantity <= 0) continue;

            const targetPartId = item.partId;

            // Atomic update or create
            const prs = await prisma.partRackShelf.findFirst({
              where: {
                partId: targetPartId,
                storeId: loc.storeId,
                rackId: loc.rackId,
                shelfId: loc.shelfId,
              },
            });

            if (prs) {
              await prisma.partRackShelf.update({
                where: { id: prs.id },
                data: { quantity: { decrement: loc.quantity } },
              });
            } else {
              await prisma.partRackShelf.create({
                data: {
                  partId: targetPartId,
                  storeId: loc.storeId,
                  rackId: loc.rackId,
                  shelfId: loc.shelfId,
                  quantity: -loc.quantity,
                },
              });
            }

            // Create stock-out movement
            await prisma.stockMovement.create({
              data: {
                partId: item.partId,
                storeId: loc.storeId,
                rackId: loc.rackId,
                shelfId: loc.shelfId,
                type: "out",
                quantity: loc.quantity,
                referenceType: "sales_invoice",
                referenceId: id,
                notes: `Sales Invoice ${invoice.invoiceNo} - Approved by ${approvedBy || "Manager"} (from ${prevStatus})`,
              } as any,
            });
          }
        }
      } else if (existingOut && status === "approved") {
        // Already has 'out' movement (likely from on_hold)
        // Just update the notes to reflect approval
        await prisma.stockMovement.updateMany({
          where: {
            referenceType: "sales_invoice",
            referenceId: id,
            type: "out",
          } as any,
          data: {
            notes: `Sales Invoice ${invoice.invoiceNo} - Approved from Hold by ${approvedBy || "Manager"}`,
          },
        });
      }

      for (const item of invoice.SalesInvoiceItem) {
        // Save avgCost on each item now that stock is confirmed out
        const part = await prisma.part.findUnique({
          where: { id: item.partId },
          select: { avgCost: true, cost: true },
        });
        await prisma.salesInvoiceItem.update({
          where: { id: item.id },
          data: { avgCost: part?.avgCost || part?.cost || 0 },
        });

        // Also delete any hold movements if coming from on_hold path
        if (prevStatus === "on_hold") {
          await prisma.stockMovement.deleteMany({
            where: {
              type: "hold",
              referenceType: "sales_invoice",
              referenceId: id,
            } as any,
          });
        }
      }

      // Create vouchers on Approval — wrap in try/catch so approval still succeeds
      try {
        // ── Helper: find account by name keywords ──────────────────────────
        const findAccount = async (
          keywords: string[],
          fallbackCodes: string[] = [],
        ) => {
          let acc = await prisma.account.findFirst({
            where: {
              status: "Active",
              OR: keywords.map((k) => ({ name: { contains: k } })),
            },
            include: { Subgroup: { include: { MainGroup: true } } },
          });
          if (!acc && fallbackCodes.length) {
            acc = await prisma.account.findFirst({
              where: {
                status: "Active",
                OR: fallbackCodes.map((c) => ({ code: { contains: c } })),
              },
              include: { Subgroup: { include: { MainGroup: true } } },
            });
          }
          return acc;
        };

        // ── Useful accounts ────────────────────────────────────────────────
        const inventoryAccount = await findAccount(
          ["Inventory", "Stock"],
          ["101", "103"],
        );
        const costAccount = await findAccount(
          ["Cost of Goods", "Cost of Inventory", "COGS", "Cost Inventory"],
          ["501", "701"],
        );
        const goodsRevenueAccount = await findAccount(
          ["Goods Sold", "Sales Revenue", "Revenue", "Sales"],
          ["401", "701"],
        );
        const discountAccount = await findAccount(
          ["Goods Sold Discount", "Sales Discount", "Discount"],
          ["502", "702"],
        );

        // Customer account (for registered customers)
        let customerAccount: any = null;
        if (invoice.customerId) {
          customerAccount = await prisma.account.findFirst({
            where: {
              status: "Active",
              OR: [
                { customerId: invoice.customerId },
                { name: invoice.customerName || "" },
              ],
            },
            include: { Subgroup: { include: { MainGroup: true } } },
          });
        }
        // Fallback: generic Receivable account
        if (!customerAccount) {
          customerAccount = await findAccount(
            ["Accounts Receivable", "Receivable"],
            ["105"], // Use Customer Receivable subgroup code instead of 104/201
          );
        }

        // Payment account (bank or cash selected at time of invoice)
        // SalesInvoice.accountId stores the selected bank/cash account
        const paymentAccountId = invoice.accountId;
        const paymentAccount = paymentAccountId
          ? await prisma.account.findUnique({
            where: { id: paymentAccountId },
            include: { Subgroup: { include: { MainGroup: true } } },
          })
          : null;

        // Check if payment account is a bank/cash account
        const isBankOrCashAccount = paymentAccount && (
          (paymentAccount.Subgroup?.code?.startsWith("101") || // Cash
           paymentAccount.Subgroup?.code?.startsWith("102") || // Bank
           paymentAccount.Subgroup?.MainGroup?.type?.toLowerCase() === "asset")
        );

        // ── Calculate totals ───────────────────────────────────────────────
        let totalAvgCost = 0;
        for (const item of invoice.SalesInvoiceItem) {
          const part = await prisma.part.findUnique({
            where: { id: item.partId },
            select: { avgCost: true, cost: true },
          });
          const avgCost = part?.avgCost || part?.cost || 0;
          totalAvgCost += avgCost * item.orderedQty;
          // Save avgCost to item
          await prisma.salesInvoiceItem.update({
            where: { id: item.id },
            data: { avgCost },
          });
        }

        const totalRevenue =
          invoice.grandTotal + (invoice.overallDiscount || 0); // before discount
        const discountAmount = invoice.overallDiscount || 0;
        const grandTotal = invoice.grandTotal;
        const paidAmount = invoice.paidAmount || 0;
        const isWalking = invoice.customerType === "walking";

        // ── JV Voucher ────────────────────────────────────────────────────
        const jvNo = await getNextNumberForPrefix({
          prefix: "JV",
          voucherType: "journal",
        });
        const jvEntries: any[] = [];

        if (inventoryAccount && totalAvgCost > 0) {
          // Inventory CR (cost going out)
          jvEntries.push({
            accountId: inventoryAccount.id,
            accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
            description: `INV: ${invoice.invoiceNo} - Inventory Out (${invoice.customerName})`,
            debit: 0,
            credit: totalAvgCost,
            sortOrder: 0,
          });
        }
        if (costAccount && totalAvgCost > 0) {
          // Cost of Inventory DR
          jvEntries.push({
            accountId: costAccount.id,
            accountName: `${costAccount.code}-${costAccount.name}`,
            description: `INV: ${invoice.invoiceNo} - Cost of Goods Sold (${invoice.customerName})`,
            debit: totalAvgCost,
            credit: 0,
            sortOrder: 1,
          });
        }

        if (!isWalking) {
          // ── Registered Customer ──────────────────────────────────────────
          if (goodsRevenueAccount) {
            // Goods Revenue CR (subtotal before discount)
            jvEntries.push({
              accountId: goodsRevenueAccount.id,
              accountName: `${goodsRevenueAccount.code}-${goodsRevenueAccount.name}`,
              description: `INV: ${invoice.invoiceNo} - Sales Revenue (${invoice.customerName})`,
              debit: 0,
              credit: totalRevenue,
              sortOrder: 2,
            });
          }
          
          // Only create customer receivable entry if payment account is NOT a bank/cash account
          // If customer selected bank/cash account, skip receivable entry and handle in RV voucher
          if (customerAccount && !isBankOrCashAccount) {
            // Customer Account DR (full invoice total)
            jvEntries.push({
              accountId: customerAccount.id,
              accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
              description: `INV: ${invoice.invoiceNo} - Customer Receivable (${invoice.customerName})`,
              debit: grandTotal,
              credit: 0,
              sortOrder: 3,
            });
          }
          
          if (discountAmount > 0 && discountAccount) {
            // Discount DR
            jvEntries.push({
              accountId: discountAccount.id,
              accountName: `${discountAccount.code}-${discountAccount.name}`,
              description: `INV: ${invoice.invoiceNo} - Sales Discount (${invoice.customerName})`,
              debit: discountAmount,
              credit: 0,
              sortOrder: 4,
            });
            
            // Customer Account CR (discount reduces receivable) - only if not bank/cash account
            if (customerAccount && !isBankOrCashAccount) {
              jvEntries.push({
                accountId: customerAccount.id,
                accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Discount on Receivable (${invoice.customerName})`,
                debit: 0,
                credit: discountAmount,
                sortOrder: 5,
              });
            }
          }
        }

        // Post JV if balanced
        const jvDebit = jvEntries.reduce((s, e) => s + e.debit, 0);
        const jvCredit = jvEntries.reduce((s, e) => s + e.credit, 0);
        if (jvEntries.length > 0 && Math.abs(jvDebit - jvCredit) < 0.01) {
          await prisma.voucher.create({
            data: {
              id: `v_${Date.now()}_jv`,
              voucherNumber: jvNo,
              type: "journal",
              date: new Date(),
              narration: `Sales Invoice ${invoice.invoiceNo} — Approved (${invoice.customerName})`,
              totalDebit: jvDebit,
              totalCredit: jvCredit,
              status: "posted",
              isSystemGenerated: true,
              salesInvoiceId: id,
              VoucherEntry: {
                create: jvEntries.map((e) => ({ ...e, salesInvoiceId: id })),
              },
            } as any,
          });
          // Update account balances
          for (const e of jvEntries) {
            const acc = await prisma.account.findUnique({
              where: { id: e.accountId },
              include: { Subgroup: { include: { MainGroup: true } } },
            });
            if (acc) {
              const nature =
                (acc as any).Subgroup?.MainGroup?.type?.toLowerCase() || "";
              const isDR = ["asset", "expense", "cost"].includes(nature);
              await prisma.account.update({
                where: { id: e.accountId },
                data: {
                  currentBalance: {
                    increment: isDR ? e.debit - e.credit : e.credit - e.debit,
                  },
                },
              });
            }
          }
        }

        // ── RV Voucher — for walking customer always, for registered only if paidAmount > 0 OR if bank/cash account selected
        const createRV = isWalking || (paidAmount > 0 && paymentAccount) || (!isWalking && isBankOrCashAccount && paymentAccount);
        if (createRV) {
          const rvNo = await getNextNumberForPrefix({
            prefix: "RV",
            voucherType: "receipt",
          });
          const rvEntries: any[] = [];

          if (isWalking) {
            // Walking customer RV:
            // Goods Revenue CR (subtotal), Discount DR (if any), Cash/Bank DR (received)
            if (goodsRevenueAccount) {
              rvEntries.push({
                accountId: goodsRevenueAccount.id,
                accountName: `${goodsRevenueAccount.code}-${goodsRevenueAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Sales Revenue`,
                debit: 0,
                credit: totalRevenue,
                sortOrder: 0,
              });
            }
            if (discountAmount > 0 && discountAccount) {
              rvEntries.push({
                accountId: discountAccount.id,
                accountName: `${discountAccount.code}-${discountAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Discount`,
                debit: discountAmount,
                credit: 0,
                sortOrder: 1,
              });
            }
            if (paymentAccount) {
              // Cash/Bank DR = grandTotal (so it always balances with revenue - discount)
              rvEntries.push({
                accountId: paymentAccount.id,
                accountName: `${(paymentAccount as any).code}-${paymentAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Cash/Bank Received`,
                debit: grandTotal,
                credit: 0,
                sortOrder: 2,
              });
            } else {
              // No payment account found — skip RV to avoid imbalance
              console.warn(
                `[Voucher] Walking customer RV skipped: no payment account for invoice ${invoice.invoiceNo}`,
              );
            }
          } else {
            // Registered customer RV (only when bank/cash account selected or paidAmount > 0):
            if (isBankOrCashAccount && paymentAccount) {
              // When customer selected bank/cash account: Bank/Cash DR, Revenue CR
              if (goodsRevenueAccount) {
                rvEntries.push({
                  accountId: goodsRevenueAccount.id,
                  accountName: `${goodsRevenueAccount.code}-${goodsRevenueAccount.name}`,
                  description: `INV: ${invoice.invoiceNo} - Sales Revenue (${invoice.customerName})`,
                  debit: 0,
                  credit: totalRevenue,
                  sortOrder: 0,
                });
              }
              if (discountAmount > 0 && discountAccount) {
                rvEntries.push({
                  accountId: discountAccount.id,
                  accountName: `${discountAccount.code}-${discountAccount.name}`,
                  description: `INV: ${invoice.invoiceNo} - Sales Discount (${invoice.customerName})`,
                  debit: discountAmount,
                  credit: 0,
                  sortOrder: 1,
                });
              }
              rvEntries.push({
                accountId: paymentAccount.id,
                accountName: `${paymentAccount.code}-${paymentAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Payment Received (${invoice.customerName})`,
                debit: grandTotal,
                credit: 0,
                sortOrder: 2,
              });
            } else if (customerAccount && paidAmount > 0) {
              // When customer has receivable account and made payment: Customer CR, Bank/Cash DR
              rvEntries.push({
                accountId: customerAccount.id,
                accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
                description: `INV: ${invoice.invoiceNo} - Payment Received (${invoice.customerName})`,
                debit: 0,
                credit: paidAmount,
                sortOrder: 0,
              });
              if (paymentAccount) {
                rvEntries.push({
                  accountId: paymentAccount.id,
                  accountName: `${paymentAccount.code}-${paymentAccount.name}`,
                  description: `INV: ${invoice.invoiceNo} - Cash/Bank Received`,
                  debit: paidAmount,
                  credit: 0,
                  sortOrder: 1,
                });
              }
            }
          }

          const rvDebit = rvEntries.reduce((s, e) => s + e.debit, 0);
          const rvCredit = rvEntries.reduce((s, e) => s + e.credit, 0);
          if (rvEntries.length > 0 && Math.abs(rvDebit - rvCredit) < 0.01) {
            await prisma.voucher.create({
              data: {
                id: `v_${Date.now()}_rv`,
                voucherNumber: rvNo,
                type: "receipt",
                date: new Date(),
                narration: `Payment - Invoice ${invoice.invoiceNo} (${invoice.customerName})`,
                totalDebit: rvDebit,
                totalCredit: rvCredit,
                status: "posted",
                isSystemGenerated: true,
                salesInvoiceId: id,
                VoucherEntry: {
                  create: rvEntries.map((e) => ({ ...e, salesInvoiceId: id })),
                },
              } as any,
            });
            // Update account balances for RV
            for (const e of rvEntries) {
              const acc = await prisma.account.findUnique({
                where: { id: e.accountId },
                include: { Subgroup: { include: { MainGroup: true } } },
              });
              if (acc) {
                const nature =
                  (acc as any).Subgroup?.MainGroup?.type?.toLowerCase() || "";
                const isDR = ["asset", "expense", "cost"].includes(nature);
                await prisma.account.update({
                  where: { id: e.accountId },
                  data: {
                    currentBalance: {
                      increment: isDR ? e.debit - e.credit : e.credit - e.debit,
                    },
                  },
                });
              }
            }
          }
        }
      } catch (vErr: any) {
        console.error("Voucher creation failed (non-fatal):", vErr.message);
      }
    }

    // ─── → PARTIALLY_DELIVERED: record specific delivered quantities ─────────
    if (status === "partially_delivered") {
      if (!deliveredQtys || typeof deliveredQtys !== "object") {
        return res.status(400).json({
          error:
            "deliveredQtys is required for partial delivery. Provide { [itemId]: qty }.",
        });
      }
      for (const item of invoice.SalesInvoiceItem) {
        const qty = Number(deliveredQtys[item.id] || 0);
        if (qty < 0 || qty > item.orderedQty) continue;
        await prisma.salesInvoiceItem.update({
          where: { id: item.id },
          data: {
            deliveredQty: { increment: qty },
            pendingQty: { decrement: qty },
          },
        });
      }
    }

    // ─── → DELIVERED: mark all quantity as delivered ─────────────────────────
    if (status === "delivered") {
      for (const item of invoice.SalesInvoiceItem) {
        await prisma.salesInvoiceItem.update({
          where: { id: item.id },
          data: {
            deliveredQty: item.orderedQty,
            pendingQty: 0,
          },
        });
      }
      // Release all stock reservations
      await prisma.stockReservation.updateMany({
        where: { invoiceId: id },
        data: { status: "released", releasedAt: new Date() },
      });
    }

    // ─── Save status ─────────────────────────────────────────────────────────
    const updatedInvoice = await prisma.salesInvoice.update({
      where: { id },
      data: { status, updatedAt: new Date() },
      include: {
        SalesInvoiceItem: { include: { Part: true } },
        DeliveryLog: { include: { DeliveryLogItem: true } },
      },
    });

    res.json(updatedInvoice);
  } catch (error: any) {
    console.error("Status update error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel invoice
router.post("/invoices/:id/cancel", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // Update invoice status
    await prisma.salesInvoice.update({
      where: { id },
      data: { status: "cancelled" },
    });

    res.json({ success: true, message: "Invoice cancelled successfully" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Soft delete invoice with stock reversal
router.delete(
  "/invoices/:id/soft-delete",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // First, just get the basic invoice to check if it exists
      const invoice = await prisma.salesInvoice.findUnique({
        where: { id },
      });

      if (!invoice) {
        return res.status(404).json({ error: "Invoice not found" });
      }

      // For now, let's skip the deletedAt check and proceed with the soft delete
      // We'll implement a basic version that just marks as cancelled

      // Start transaction for stock reversal
      await prisma.$transaction(async (tx) => {
        // Soft delete the invoice - mark as cancelled
        await tx.salesInvoice.update({
          where: { id },
          data: {
            status: "cancelled",
            updatedAt: new Date(),
          },
        });
      });

      res.json({
        success: true,
        message: "Invoice soft deleted successfully (basic version)",
      });
    } catch (error: any) {
      console.error("Soft delete error:", error);
      res.status(500).json({ error: error.message });
    }
  },
);

// Permanently delete a cancelled invoice
router.delete("/invoices/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const invoice = await prisma.salesInvoice.findUnique({
      where: { id },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    if (invoice.status !== "cancelled") {
      return res.status(400).json({
        error:
          "Only cancelled invoices can be permanently deleted. Cancel the invoice first.",
      });
    }

    // Delete invoice (cascades to items, reservations, deliveryLogs, returns)
    await prisma.salesInvoice.delete({
      where: { id },
    });

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ========== Stock Management Routes ==========

// Get reserved quantity for a part
router.get("/stock/reserved/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;

    const reservedQty = await getReservedQuantity(partId);

    res.json({ partId, reservedQty });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get available stock for a part
router.get("/stock/available/:partId", async (req: Request, res: Response) => {
  try {
    const { partId } = req.params;
    const stock = Math.max(0, await getStockBalance(partId));
    const reserved = await getReservedQuantity(partId);
    const available = Math.max(0, stock - reserved);
    res.json({ partId, stock, reserved, available });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get undelivered stock alerts
router.get("/invoices/undelivered-alerts", async (req: Request, res: Response) => {
  try {
    console.log("GET /invoices/undelivered-alerts");

    // Find all invoices with pending deliveries
    const invoices = await prisma.salesInvoice.findMany({
      where: {
        status: {
          in: ['approved', 'partially_delivered']
        }
      },
      include: {
        SalesInvoiceItem: {
          include: {
            Part: {
              select: {
                id: true,
                partNo: true,
                description: true
              }
            }
          }
        }
      },
      orderBy: {
        invoiceDate: 'desc'
      }
    });

    // Filter and format alerts for invoices with pending items
    const alerts = invoices
      .filter(invoice => {
        return invoice.SalesInvoiceItem?.some(item => {
          const pendingQty = (item.pendingQty || 0);
          return pendingQty > 0;
        });
      })
      .map(invoice => {
        const items = invoice.SalesInvoiceItem?.filter(item => {
          const pendingQty = (item.pendingQty || 0);
          return pendingQty > 0;
        }).map(item => ({
          itemId: item.id,
          partNo: item.Part?.partNo || '',
          description: item.Part?.description || '',
          orderedQty: item.orderedQty || 0,
          deliveredQty: item.deliveredQty || 0,
          pendingQty: item.pendingQty || 0
        })) || [];

        const totalOrdered = invoice.SalesInvoiceItem?.reduce((sum, item) => sum + (item.orderedQty || 0), 0) || 0;
        const totalDelivered = invoice.SalesInvoiceItem?.reduce((sum, item) => sum + (item.deliveredQty || 0), 0) || 0;
        const totalPending = totalOrdered - totalDelivered;

        return {
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          customerName: invoice.customerName,
          customerType: invoice.customerType,
          invoiceDate: invoice.invoiceDate,
          totalItems: invoice.SalesInvoiceItem?.length || 0,
          totalOrdered,
          totalDelivered,
          totalPending,
          items
        };
      });

    res.json({
      count: alerts.length,
      alerts
    });
  } catch (error: any) {
    console.error('Error fetching undelivered alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk reverse undelivered quantity back to available stock
router.post("/invoices/bulk-reverse", async (req: Request, res: Response) => {
  try {
    const { invoiceId, items, reason } = req.body;

    if (!invoiceId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Valid invoiceId and items array is required" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Get the invoice
      const invoice = await tx.salesInvoice.findUnique({
        where: { id: invoiceId },
        include: {
          SalesInvoiceItem: {
            include: { Part: true },
          },
        },
      });

      if (!invoice) {
        throw new Error("Invoice not found");
      }

      let totalReversedAmount = 0;
      let totalReversedCost = 0;
      const reversedItems = [];

      // Process each item
      for (const reverseItem of items) {
        const invoiceItem = invoice.SalesInvoiceItem.find(
          (item) => item.id === reverseItem.invoiceItemId
        );

        if (!invoiceItem) {
          throw new Error(`Invoice item ${reverseItem.invoiceItemId} not found`);
        }

        const quantity = reverseItem.quantity;
        const undeliveredQty = invoiceItem.orderedQty - invoiceItem.deliveredQty - ((invoiceItem as any).reversedQty || 0);

        if (quantity <= 0) {
          throw new Error(`Invalid quantity for item ${invoiceItem.partNo}`);
        }

        if (quantity > undeliveredQty) {
          throw new Error(`Cannot reverse more than ${undeliveredQty} units for ${invoiceItem.partNo}`);
        }

        // Update pending quantity
        await tx.salesInvoiceItem.update({
          where: { id: reverseItem.invoiceItemId },
          data: {
            pendingQty: { decrement: quantity },
          } as any,
        });

        // Create stock movement
        await tx.stockMovement.create({
          data: {
            partId: invoiceItem.partId,
            type: "IN",
            quantity: quantity,
            referenceType: "sales_invoice_reverse",
            referenceId: invoiceId,
            notes: reason || `Reversed ${quantity} units from Invoice ${invoice.invoiceNo} back to stock`,
          },
        });

        // Update reservation if exists
        const reservation = await tx.stockReservation.findFirst({
          where: {
            partId: invoiceItem.partId,
            invoiceId: invoiceId,
          },
        });

        if (reservation) {
          const newReservedQty = Math.max(0, reservation.quantity - quantity);
          await tx.stockReservation.update({
            where: { id: reservation.id },
            data: {
              quantity: newReservedQty,
              status: newReservedQty === 0 ? "released" : "partial",
            },
          });
        }

        // Calculate totals for voucher
        const itemTotal = invoiceItem.unitPrice * quantity;
        const itemCost = (invoiceItem.avgCost || invoiceItem.Part?.avgCost || invoiceItem.Part?.cost || 0) * quantity;

        totalReversedAmount += itemTotal;
        totalReversedCost += itemCost;
        reversedItems.push({
          item: invoiceItem,
          quantity,
          total: itemTotal,
          cost: itemCost,
        });
      }

      // Create a single JV voucher for all reversed items
      let jvNo: string | null = null;
      if (totalReversedAmount > 0) {
        jvNo = await getNextNumberForPrefix({
          prefix: "JV",
          voucherType: "journal",
        });

        // Find necessary accounts
        const inventoryAccount = await findAccountByKeywords(
          ["Inventory", "Stock"],
          ["101", "103", "104"],
          ["Cost", "COGS", "Discount"],
          tx,
        );
        const costAccount = await findAccountByKeywords(
          ["Cost of Goods", "COGS", "Cost Inventory", "Cost of Sales"],
          ["501", "901"],
          [],
          tx,
        );
        const goodsRevenueAccount = await findAccountByKeywords(
          ["Sales Revenue", "Revenue", "Goods Sold"],
          ["401", "701"],
          [],
          tx,
        );

        let customerAccount: any = null;
        if (invoice.customerId) {
          customerAccount = await tx.account.findFirst({
            where: {
              status: "Active",
              OR: [
                { customerId: invoice.customerId },
                { name: invoice.customerName || "" },
              ],
            },
            include: { Subgroup: { include: { MainGroup: true } } },
          });
        }
        if (!customerAccount) {
          customerAccount = await findAccountByKeywords(
            ["Accounts Receivable", "Receivable", "Customer", invoice.customerName || ""],
            ["105", "201"], // Prioritize Customer Receivable subgroup, remove 104 (Inventory)
            ["Revenue", "COGS", "Inventory"],
            tx,
          );
        }

        const jvEntries: any[] = [];

        // Entry 1: Reverse Revenue - Goods Sold (Debit)
        if (goodsRevenueAccount) {
          jvEntries.push({
            accountId: goodsRevenueAccount.id,
            accountName: `${goodsRevenueAccount.code}-${goodsRevenueAccount.name}`,
            description: `Bulk Reverse Sale Revenue - Invoice ${invoice.invoiceNo} (${reversedItems.length} items)`,
            debit: totalReversedAmount,
            credit: 0,
            sortOrder: 0,
          });
        }

        // Entry 2: Reduce Customer AR (Credit)
        if (customerAccount) {
          jvEntries.push({
            accountId: customerAccount.id,
            accountName: `${customerAccount.code || ""}-${customerAccount.name}`,
            description: `Reduce Receivable - ${invoice.customerName} - Invoice ${invoice.invoiceNo}`,
            debit: 0,
            credit: totalReversedAmount,
            sortOrder: 1,
          });
        }

        // Entry 3: Reverse COGS - Cost Inventory (Credit)
        if (totalReversedCost > 0 && costAccount) {
          jvEntries.push({
            accountId: costAccount.id,
            accountName: `${costAccount.code}-${costAccount.name}`,
            description: `Bulk Reverse COGS - Invoice ${invoice.invoiceNo}`,
            debit: 0,
            credit: totalReversedCost,
            sortOrder: 2,
          });
        }

        // Entry 4: Restore Inventory (Debit)
        if (totalReversedCost > 0 && inventoryAccount) {
          jvEntries.push({
            accountId: inventoryAccount.id,
            accountName: `${inventoryAccount.code}-${inventoryAccount.name}`,
            description: `Bulk Restore Inventory - Invoice ${invoice.invoiceNo}`,
            debit: totalReversedCost,
            credit: 0,
            sortOrder: 3,
          });
        }

        const jvDebit = jvEntries.reduce((s, e) => s + e.debit, 0);
        const jvCredit = jvEntries.reduce((s, e) => s + e.credit, 0);

        if (jvEntries.length > 0 && Math.abs(jvDebit - jvCredit) < 0.01) {
          await tx.voucher.create({
            data: {
              voucherNumber: jvNo,
              type: "journal",
              date: new Date(),
              narration: `Bulk Quantity Reverse - Invoice ${invoice.invoiceNo} (${reversedItems.length} items)`,
              totalDebit: jvDebit,
              totalCredit: jvCredit,
              status: "posted",
              isSystemGenerated: true,
              salesInvoiceId: invoiceId,
              VoucherEntry: {
                create: jvEntries.map((e) => ({ ...e, salesInvoiceId: invoiceId })),
              },
            } as any,
          });

          // Update account balances
          for (const entry of jvEntries) {
            const acc = await tx.account.findUnique({
              where: { id: entry.accountId },
              include: { Subgroup: { include: { MainGroup: true } } },
            });
            if (acc) {
              const type = acc.Subgroup.MainGroup.type.toLowerCase();
              const isDrBalance = ["asset", "expense", "cost"].includes(type);
              const diff = entry.debit - entry.credit;
              await tx.account.update({
                where: { id: entry.accountId },
                data: { currentBalance: { increment: isDrBalance ? diff : -diff } },
              });
            }
          }
        }
      }

      // Recalculate invoice status
      const updatedItems = await tx.salesInvoiceItem.findMany({
        where: { invoiceId },
        include: { Part: true },
      });

      const totalOrdered = updatedItems.reduce((sum, i) => sum + (i.orderedQty || 0), 0);
      const totalDelivered = updatedItems.reduce((sum, i) => sum + (i.deliveredQty || 0), 0);
      const currentPending = updatedItems.reduce((sum, i) => sum + (i.pendingQty || 0), 0);

      // Since we don't have reversedQty in the DB, any quantity that is NOT delivered 
      // AND NOT pending is considered reversed (orderedQty - deliveredQty - pendingQty)
      const totalReversed = Math.max(0, totalOrdered - totalDelivered - currentPending);

      let newStatus = invoice.status;
      if (currentPending === 0 && totalDelivered === 0 && totalReversed > 0) {
        newStatus = "reversed";
      } else if (totalReversed > 0) {
        newStatus = "partially_reversed"; // Or stay as is if partially delivered
      } else if (currentPending === 0 && totalDelivered === 0) {
        newStatus = "cancelled";
      } else if (currentPending === 0) {
        newStatus = "fully_delivered";
      } else if (totalDelivered > 0) {
        newStatus = "partially_delivered";
      }

      if (newStatus !== invoice.status) {
        await tx.salesInvoice.update({
          where: { id: invoiceId },
          data: { status: newStatus },
        });
      }

      return {
        invoiceId,
        voucherNumber: jvNo,
        totalReversed: reversedItems.reduce((sum, r) => sum + r.quantity, 0),
        itemsCount: reversedItems.length,
        newStatus,
      };
    });

    res.json({
      success: true,
      message: `Successfully reversed ${result.totalReversed} units from ${result.itemsCount} items back to stock`,
      data: result,
    });
  } catch (error: any) {
    console.error("Error in bulk reverse:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
