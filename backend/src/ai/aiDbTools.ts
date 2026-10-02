/**
 * Read-only DB tools for the AI assistant.
 * General allowlisted lookups — not raw SQL — so users can ask about most ERP data safely.
 */

import prisma from "../config/database";
import { calculateStockQuantity } from "../utils/inventoryFormulas";
import { buildPartSearchWhereWithFamily } from "../utils/partFamilySearch";
import {
  createAiExportFile,
  MAX_EXPORT_ROWS,
  type AiExportAttachment,
} from "./aiExportFiles";

const MAX_ROWS = 20;

/** Entities the model may query. Expand here when adding modules. */
export const QUERYABLE_ENTITIES = [
  "customers",
  "suppliers",
  "employees",
  "parts",
  "accounts",
  "sales_invoices",
  "sales_quotations",
  "sales_returns",
  "purchase_orders",
  "direct_purchase_orders",
  "vouchers",
  "stores",
  "brands",
  "categories",
  "posted_expenses",
  "transfers",
  "receivables",
] as const;

export type QueryableEntity = (typeof QUERYABLE_ENTITIES)[number];

const ENTITY_HELP: Record<QueryableEntity, string> = {
  customers: "Customers (name, code, phone, status)",
  suppliers: "Suppliers (name, code, type local/import)",
  employees: "Employees (name, code, department, salary)",
  parts: "Parts/items with live stock qty",
  accounts: "Chart of accounts (code, name, balances)",
  sales_invoices: "Sales invoices (any payment/status)",
  sales_quotations: "Sales quotations",
  sales_returns: "Sales returns",
  purchase_orders: "Import purchase orders",
  direct_purchase_orders: "Local / direct purchase orders (DPO)",
  vouchers: "Payment/receipt/journal/contra vouchers",
  stores: "Stores / warehouses",
  brands: "Part brands",
  categories: "Part categories",
  posted_expenses: "Posted operational expenses",
  transfers: "Stock transfers between locations/branches",
  receivables: "Receivable records linked to invoices",
};

export const AI_DB_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "list_queryable_entities",
      description:
        "List ERP data types you can look up live. Call this if unsure which entity fits the user’s question.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "query_erp",
      description:
        "Search live ERP records for ANY supported entity (customers, suppliers, invoices, vouchers, parts+stock, POs, accounts, employees, etc.). Prefer this for general data questions.",
      parameters: {
        type: "object",
        properties: {
          entity: {
            type: "string",
            enum: [...QUERYABLE_ENTITIES],
            description: "Which table/module to search",
          },
          query: {
            type: "string",
            description:
              "Free-text search (name, number, code, narration). Empty = recent records.",
          },
          status: {
            type: "string",
            description: "Optional status filter (e.g. active, posted, unpaid, Draft)",
          },
          paymentStatus: {
            type: "string",
            description: "For sales_invoices: unpaid | partial | paid",
          },
          dateFrom: {
            type: "string",
            description: "ISO date lower bound when entity has a date field",
          },
          dateTo: {
            type: "string",
            description: "ISO date upper bound",
          },
          limit: {
            type: "number",
            description: `Max rows (default 10, max ${MAX_ROWS})`,
          },
        },
        required: ["entity"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_customer_balance",
      description:
        "Computed live receivable balance for a customer (preferred over inventing balances).",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          query: { type: "string", description: "Customer name/code if id unknown" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_customer_open_invoices",
      description: "Unpaid/partial sales invoices + due totals for a customer.",
      parameters: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_part_stock",
      description: "Live stock for one part by id or part number.",
      parameters: {
        type: "object",
        properties: {
          partId: { type: "string" },
          partNo: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_voucher_detail",
      description:
        "Fetch one voucher with entry lines (accounts Dr/Cr) by voucher number or id.",
      parameters: {
        type: "object",
        properties: {
          voucherId: { type: "string" },
          voucherNumber: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "get_invoice_detail",
      description: "Fetch one sales invoice with line items by invoice number or id.",
      parameters: {
        type: "object",
        properties: {
          invoiceId: { type: "string" },
          invoiceNo: { type: "string" },
        },
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "export_data",
      description:
        "Create a downloadable Excel (.xlsx) or PDF file from live ERP data or a custom table. Use when the user asks for PDF/Excel/export/report/download. Prefer entity+filters for live data; or pass columns+rows from prior tool results.",
      parameters: {
        type: "object",
        properties: {
          format: {
            type: "string",
            enum: ["excel", "pdf"],
            description: "excel = .xlsx spreadsheet, pdf = printable PDF",
          },
          title: {
            type: "string",
            description: "Report title shown in the file",
          },
          entity: {
            type: "string",
            enum: [...QUERYABLE_ENTITIES],
            description: "Live entity to query before exporting (optional if rows provided)",
          },
          query: { type: "string" },
          status: { type: "string" },
          paymentStatus: { type: "string" },
          dateFrom: { type: "string" },
          dateTo: { type: "string" },
          columns: {
            type: "array",
            items: { type: "string" },
            description: "Column keys for custom rows",
          },
          rows: {
            type: "array",
            items: { type: "object" },
            description: "Custom row objects to export (max ~200)",
          },
        },
        required: ["format", "title"],
      },
    },
  },
];

function money(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function clampLimit(n?: number, max = MAX_ROWS) {
  return Math.min(Math.max(Number(n) || 10, 1), max);
}

function parseDate(v?: string): Date | undefined {
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function contains(q: string) {
  return { contains: q, mode: "insensitive" as const };
}

async function findCustomers(query: string, take = MAX_ROWS) {
  const q = String(query || "").trim();
  if (!q) {
    return prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        code: true,
        shortTitle: true,
        contactNo: true,
        cellNumber: true,
        status: true,
        openingBalance: true,
        Account: {
          select: {
            id: true,
            code: true,
            openingBalance: true,
            currentBalance: true,
            Subgroup: {
              select: { code: true, MainGroup: { select: { type: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      take,
      orderBy: { updatedAt: "desc" },
    });
  }
  return prisma.customer.findMany({
    where: {
      OR: [
        { name: contains(q) },
        { code: contains(q) },
        { shortTitle: contains(q) },
        { contactNo: contains(q) },
        { cellNumber: contains(q) },
      ],
    },
    select: {
      id: true,
      name: true,
      code: true,
      shortTitle: true,
      contactNo: true,
      cellNumber: true,
      status: true,
      openingBalance: true,
      Account: {
        select: {
          id: true,
          code: true,
          openingBalance: true,
          currentBalance: true,
          Subgroup: {
            select: { code: true, MainGroup: { select: { type: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
    take,
    orderBy: { name: "asc" },
  });
}

function pickReceivableAccount(customer: any) {
  const accounts = Array.isArray(customer?.Account) ? customer.Account : [];
  const isReceivable = (a: any) =>
    String(a?.code || "").startsWith("105") ||
    String(a?.Subgroup?.code || "") === "105";
  return accounts.find((a: any) => isReceivable(a)) || accounts[0] || null;
}

function balanceChange(debit: number, credit: number, accountType: string) {
  const t = String(accountType || "").toLowerCase();
  if (["asset", "expense", "cost"].includes(t)) return debit - credit;
  return credit - debit;
}

async function liveAccountBalance(account: any): Promise<number> {
  if (!account?.id) return 0;
  const aggregate = await prisma.voucherEntry.aggregate({
    where: {
      accountId: account.id,
      Voucher: {
        status: "posted",
        OR: [{ isCleared: null }, { isCleared: 1 }],
      },
    },
    _sum: { debit: true, credit: true },
  });
  const opening = Number(account.openingBalance || 0);
  const accountType = String(account?.Subgroup?.MainGroup?.type || "asset");
  return money(
    opening +
      balanceChange(
        Number(aggregate._sum.debit || 0),
        Number(aggregate._sum.credit || 0),
        accountType,
      ),
  );
}

async function resolveCustomer(args: { customerId?: string; query?: string }) {
  if (args.customerId) {
    const list = await prisma.customer.findUnique({
      where: { id: args.customerId },
      select: {
        id: true,
        name: true,
        code: true,
        shortTitle: true,
        status: true,
        openingBalance: true,
        Account: {
          select: {
            id: true,
            code: true,
            openingBalance: true,
            currentBalance: true,
            Subgroup: {
              select: { code: true, MainGroup: { select: { type: true } } },
            },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    return list;
  }
  if (args.query) {
    const list = await findCustomers(args.query, 5);
    return list[0] || null;
  }
  return null;
}

async function toolListEntities() {
  return {
    entities: QUERYABLE_ENTITIES.map((e) => ({
      entity: e,
      description: ENTITY_HELP[e],
    })),
    tip: "Use query_erp with entity + optional query/status/date filters. Use specialized tools for balances, open invoices, part stock, voucher/invoice detail.",
  };
}

async function queryErp(args: {
  entity: string;
  query?: string;
  status?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) {
  const entity = String(args.entity || "").trim() as QueryableEntity;
  if (!QUERYABLE_ENTITIES.includes(entity)) {
    return {
      error: `Unsupported entity "${args.entity}". Call list_queryable_entities.`,
      supported: QUERYABLE_ENTITIES,
    };
  }

  const q = String(args.query || "").trim();
  const take = clampLimit(args.limit, MAX_EXPORT_ROWS);
  const status = args.status ? String(args.status).trim() : "";
  const paymentStatus = args.paymentStatus
    ? String(args.paymentStatus).trim()
    : "";
  const dateFrom = parseDate(args.dateFrom);
  const dateTo = parseDate(args.dateTo);

  switch (entity) {
    case "customers": {
      const rows = await findCustomers(q, take);
      return {
        entity,
        count: rows.length,
        rows: rows.map((c) => ({
          id: c.id,
          name: c.name,
          code: c.code,
          shortTitle: c.shortTitle,
          phone: c.cellNumber || c.contactNo,
          status: c.status,
        })),
      };
    }
    case "suppliers": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { name: contains(q) },
          { code: contains(q) },
          { companyName: contains(q) },
          { shortTitle: contains(q) },
          { phone: contains(q) },
          { cellNumber: contains(q) },
        ];
      }
      const rows = await prisma.supplier.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          companyName: true,
          type: true,
          phone: true,
          cellNumber: true,
          status: true,
          openingBalance: true,
        },
        take,
        orderBy: { updatedAt: "desc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "employees": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { name: contains(q) },
          { code: contains(q) },
          { department: contains(q) },
          { designation: contains(q) },
          { contactNo: contains(q) },
        ];
      }
      const rows = await prisma.employee.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          department: true,
          designation: true,
          monthlySalary: true,
          status: true,
          contactNo: true,
        },
        take,
        orderBy: { name: "asc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "parts": {
      const where = q
        ? await buildPartSearchWhereWithFamily(q, {
            status: status || "active",
          })
        : { status: status || "active" };
      const parts = await prisma.part.findMany({
        where,
        select: {
          id: true,
          partNo: true,
          description: true,
          reorderLevel: true,
          avgCost: true,
          priceA: true,
          Brand: { select: { name: true } },
          MasterPart: { select: { masterPartNo: true } },
        },
        take,
        orderBy: { partNo: "asc" },
      });
      const rows = [];
      for (const p of parts) {
        rows.push({
          id: p.id,
          partNo: p.partNo,
          masterPartNo: p.MasterPart?.masterPartNo || null,
          description: p.description,
          brand: p.Brand?.name || null,
          stock: money(await calculateStockQuantity(p.id)),
          reorderLevel: p.reorderLevel,
          avgCost: p.avgCost,
          priceA: p.priceA,
        });
      }
      return { entity, count: rows.length, rows };
    }
    case "accounts": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [{ code: contains(q) }, { name: contains(q) }];
      }
      const rows = await prisma.account.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          openingBalance: true,
          currentBalance: true,
          Subgroup: { select: { code: true, name: true } },
        },
        take,
        orderBy: { code: "asc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          status: a.status,
          openingBalance: money(a.openingBalance),
          currentBalance: money(a.currentBalance),
          subgroup: a.Subgroup
            ? `${a.Subgroup.code} ${a.Subgroup.name}`
            : null,
        })),
      };
    }
    case "sales_invoices": {
      const where: any = {};
      if (status) where.status = status;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (q) {
        where.OR = [
          { invoiceNo: contains(q) },
          { customerName: contains(q) },
          { Customer: { name: contains(q) } },
          { Customer: { code: contains(q) } },
        ];
      }
      if (dateFrom || dateTo) {
        where.invoiceDate = {};
        if (dateFrom) where.invoiceDate.gte = dateFrom;
        if (dateTo) where.invoiceDate.lte = dateTo;
      }
      const rows = await prisma.salesInvoice.findMany({
        where,
        select: {
          id: true,
          invoiceNo: true,
          invoiceDate: true,
          customerName: true,
          customerId: true,
          grandTotal: true,
          paidAmount: true,
          paymentStatus: true,
          status: true,
        },
        take,
        orderBy: { invoiceDate: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((inv) => ({
          ...inv,
          grandTotal: money(inv.grandTotal),
          paidAmount: money(inv.paidAmount),
          dueAmount: money(inv.grandTotal - inv.paidAmount),
        })),
      };
    }
    case "sales_quotations": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { quotationNo: contains(q) },
          { customerName: contains(q) },
        ];
      }
      if (dateFrom || dateTo) {
        where.quotationDate = {};
        if (dateFrom) where.quotationDate.gte = dateFrom;
        if (dateTo) where.quotationDate.lte = dateTo;
      }
      const rows = await prisma.salesQuotation.findMany({
        where,
        select: {
          id: true,
          quotationNo: true,
          quotationDate: true,
          customerName: true,
          status: true,
          totalAmount: true,
        },
        take,
        orderBy: { quotationDate: "desc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "sales_returns": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { returnNumber: contains(q) },
          { legacyInvoiceNo: contains(q) },
          { legacyCustomerName: contains(q) },
          { Customer: { name: contains(q) } },
          { Customer: { code: contains(q) } },
        ];
      }
      if (dateFrom || dateTo) {
        where.returnDate = {};
        if (dateFrom) where.returnDate.gte = dateFrom;
        if (dateTo) where.returnDate.lte = dateTo;
      }
      const rows = await prisma.salesReturn.findMany({
        where,
        select: {
          id: true,
          returnNumber: true,
          returnDate: true,
          status: true,
          totalAmount: true,
          Customer: { select: { name: true, code: true } },
          SalesInvoice: { select: { invoiceNo: true } },
        },
        take,
        orderBy: { returnDate: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          returnNumber: r.returnNumber,
          returnDate: r.returnDate,
          status: r.status,
          totalAmount: money(r.totalAmount),
          customer: r.Customer?.name || null,
          invoiceNo: r.SalesInvoice?.invoiceNo || null,
        })),
      };
    }
    case "purchase_orders": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { poNumber: contains(q) },
          { invoiceNo: contains(q) },
          { Supplier: { name: contains(q) } },
          { Supplier: { code: contains(q) } },
        ];
      }
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }
      const rows = await prisma.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          poNumber: true,
          date: true,
          status: true,
          invoiceNo: true,
          currency: true,
          fcTotal: true,
          Supplier: { select: { name: true, code: true } },
        },
        take,
        orderBy: { date: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          poNumber: r.poNumber,
          date: r.date,
          status: r.status,
          invoiceNo: r.invoiceNo,
          currency: r.currency,
          fcTotal: r.fcTotal,
          supplier: r.Supplier?.name || null,
          supplierCode: r.Supplier?.code || null,
        })),
      };
    }
    case "direct_purchase_orders": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { dpoNumber: contains(q) },
          { invoiceNo: contains(q) },
          { description: contains(q) },
          { Supplier: { name: contains(q) } },
        ];
      }
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }
      const rows = await prisma.directPurchaseOrder.findMany({
        where,
        select: {
          id: true,
          dpoNumber: true,
          date: true,
          status: true,
          totalAmount: true,
          invoiceNo: true,
          orderType: true,
          Supplier: { select: { name: true, code: true } },
          Store: { select: { name: true } },
        },
        take,
        orderBy: { date: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          dpoNumber: r.dpoNumber,
          date: r.date,
          status: r.status,
          totalAmount: money(r.totalAmount),
          invoiceNo: r.invoiceNo,
          orderType: r.orderType,
          supplier: r.Supplier?.name || null,
          store: r.Store?.name || null,
        })),
      };
    }
    case "vouchers": {
      const where: any = { deletedAt: null };
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { voucherNumber: contains(q) },
          { narration: contains(q) },
          { type: contains(q) },
          { chequeNumber: contains(q) },
        ];
      }
      // type filter via query words like payment/receipt often in type field
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }
      const rows = await prisma.voucher.findMany({
        where,
        select: {
          id: true,
          voucherNumber: true,
          type: true,
          date: true,
          narration: true,
          totalDebit: true,
          totalCredit: true,
          status: true,
        },
        take,
        orderBy: { date: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((v) => ({
          ...v,
          totalDebit: money(v.totalDebit),
          totalCredit: money(v.totalCredit),
        })),
      };
    }
    case "stores": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [{ name: contains(q) }, { code: contains(q) }];
      }
      const rows = await prisma.store.findMany({
        where,
        select: { id: true, name: true, code: true, status: true },
        take,
        orderBy: { name: "asc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "brands": {
      const where: any = {};
      if (q) where.name = contains(q);
      const rows = await prisma.brand.findMany({
        where,
        select: { id: true, name: true },
        take,
        orderBy: { name: "asc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "categories": {
      const where: any = {};
      if (q) where.name = contains(q);
      const rows = await prisma.category.findMany({
        where,
        select: { id: true, name: true },
        take,
        orderBy: { name: "asc" },
      });
      return { entity, count: rows.length, rows };
    }
    case "posted_expenses": {
      const where: any = {};
      if (q) {
        where.OR = [
          { description: contains(q) },
          { ExpenseType: { name: contains(q) } },
        ];
      }
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }
      const rows = await prisma.postedExpense.findMany({
        where,
        select: {
          id: true,
          date: true,
          amount: true,
          description: true,
          ExpenseType: { select: { name: true } },
        },
        take,
        orderBy: { date: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          date: r.date,
          amount: money(r.amount),
          description: r.description,
          expenseType: r.ExpenseType?.name || null,
        })),
      };
    }
    case "transfers": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { transferNumber: contains(q) },
          { notes: contains(q) },
        ];
      }
      if (dateFrom || dateTo) {
        where.date = {};
        if (dateFrom) where.date.gte = dateFrom;
        if (dateTo) where.date.lte = dateTo;
      }
      const rows = await prisma.transfer.findMany({
        where,
        select: {
          id: true,
          transferNumber: true,
          date: true,
          status: true,
          notes: true,
          totalQty: true,
          Store_Transfer_fromStoreIdToStore: { select: { name: true } },
          Store_Transfer_toStoreIdToStore: { select: { name: true } },
        },
        take,
        orderBy: { date: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          transferNumber: r.transferNumber,
          date: r.date,
          status: r.status,
          notes: r.notes,
          totalQty: r.totalQty,
          fromStore: r.Store_Transfer_fromStoreIdToStore?.name || null,
          toStore: r.Store_Transfer_toStoreIdToStore?.name || null,
        })),
      };
    }
    case "receivables": {
      const where: any = {};
      if (status) where.status = status;
      if (q) {
        where.OR = [
          { Customer: { name: contains(q) } },
          { Customer: { code: contains(q) } },
          { SalesInvoice: { invoiceNo: contains(q) } },
        ];
      }
      const rows = await prisma.receivable.findMany({
        where,
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          dueAmount: true,
          status: true,
          Customer: { select: { name: true, code: true } },
          SalesInvoice: { select: { invoiceNo: true, invoiceDate: true } },
        },
        take,
        orderBy: { updatedAt: "desc" },
      });
      return {
        entity,
        count: rows.length,
        rows: rows.map((r) => ({
          id: r.id,
          amount: money(r.amount),
          paidAmount: money(r.paidAmount),
          dueAmount: money(r.dueAmount),
          status: r.status,
          customer: r.Customer?.name || null,
          customerCode: r.Customer?.code || null,
          invoiceNo: r.SalesInvoice?.invoiceNo || null,
          invoiceDate: r.SalesInvoice?.invoiceDate || null,
        })),
      };
    }
    default:
      return { error: `Handler missing for ${entity}` };
  }
}

async function toolGetCustomerBalance(args: {
  customerId?: string;
  query?: string;
}) {
  const customer = await resolveCustomer(args);
  if (!customer) return { found: false, message: "No matching customer." };
  const account = pickReceivableAccount(customer);
  const balance = account
    ? await liveAccountBalance(account)
    : money(Number(customer.openingBalance || 0));
  return {
    found: true,
    customer: { id: customer.id, name: customer.name, code: customer.code },
    receivableAccount: account
      ? { id: account.id, code: account.code }
      : null,
    balance,
    note: "Positive balance usually means customer owes the company (receivable).",
  };
}

async function toolGetCustomerOpenInvoices(args: {
  customerId?: string;
  query?: string;
  limit?: number;
}) {
  const customer = await resolveCustomer(args);
  if (!customer) return { found: false, message: "No matching customer." };
  const take = clampLimit(args.limit, MAX_EXPORT_ROWS);
  const invoices = await prisma.salesInvoice.findMany({
    where: {
      customerId: customer.id,
      paymentStatus: { in: ["unpaid", "partial"] },
      status: { notIn: ["cancelled"] },
    },
    select: {
      id: true,
      invoiceNo: true,
      invoiceDate: true,
      grandTotal: true,
      paidAmount: true,
      paymentStatus: true,
      status: true,
    },
    orderBy: { invoiceDate: "desc" },
    take,
  });
  const mapped = invoices.map((inv) => ({
    invoiceNo: inv.invoiceNo,
    invoiceDate: inv.invoiceDate,
    grandTotal: money(inv.grandTotal),
    paidAmount: money(inv.paidAmount),
    dueAmount: money(inv.grandTotal - inv.paidAmount),
    paymentStatus: inv.paymentStatus,
    status: inv.status,
  }));
  return {
    found: true,
    customer: { id: customer.id, name: customer.name, code: customer.code },
    count: mapped.length,
    totalDue: money(mapped.reduce((s, i) => s + i.dueAmount, 0)),
    invoices: mapped,
  };
}

async function toolGetPartStock(args: { partId?: string; partNo?: string }) {
  let part =
    args.partId
      ? await prisma.part.findUnique({
          where: { id: args.partId },
          select: {
            id: true,
            partNo: true,
            description: true,
            Brand: { select: { name: true } },
            MasterPart: { select: { masterPartNo: true } },
          },
        })
      : null;

  if (!part && args.partNo) {
    const where = await buildPartSearchWhereWithFamily(
      String(args.partNo).trim(),
      { status: "active" },
    );
    part = await prisma.part.findFirst({
      where,
      select: {
        id: true,
        partNo: true,
        description: true,
        Brand: { select: { name: true } },
        MasterPart: { select: { masterPartNo: true } },
      },
    });
  }

  if (!part) return { found: false, message: "Part not found." };
  return {
    found: true,
    part: {
      id: part.id,
      partNo: part.partNo,
      masterPartNo: part.MasterPart?.masterPartNo || null,
      description: part.description,
      brand: part.Brand?.name || null,
    },
    stock: money(await calculateStockQuantity(part.id)),
  };
}

async function toolGetVoucherDetail(args: {
  voucherId?: string;
  voucherNumber?: string;
}) {
  const where = args.voucherId
    ? { id: args.voucherId }
    : args.voucherNumber
      ? { voucherNumber: String(args.voucherNumber).trim() }
      : null;
  if (!where) return { found: false, message: "Provide voucherId or voucherNumber." };

  const voucher = await prisma.voucher.findFirst({
    where: { ...where, deletedAt: null },
    select: {
      id: true,
      voucherNumber: true,
      type: true,
      date: true,
      narration: true,
      status: true,
      totalDebit: true,
      totalCredit: true,
      chequeNumber: true,
      VoucherEntry: {
        select: {
          debit: true,
          credit: true,
          description: true,
          accountName: true,
          Account: { select: { code: true, name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  if (!voucher) return { found: false, message: "Voucher not found." };
  return {
    found: true,
    voucher: {
      id: voucher.id,
      voucherNumber: voucher.voucherNumber,
      type: voucher.type,
      date: voucher.date,
      narration: voucher.narration,
      status: voucher.status,
      totalDebit: money(voucher.totalDebit),
      totalCredit: money(voucher.totalCredit),
      chequeNumber: voucher.chequeNumber,
      entries: voucher.VoucherEntry.map((e) => ({
        accountCode: e.Account?.code || null,
        accountName: e.Account?.name || e.accountName || null,
        debit: money(e.debit),
        credit: money(e.credit),
        description: e.description,
      })),
    },
  };
}

async function toolGetInvoiceDetail(args: {
  invoiceId?: string;
  invoiceNo?: string;
}) {
  const where = args.invoiceId
    ? { id: args.invoiceId }
    : args.invoiceNo
      ? { invoiceNo: String(args.invoiceNo).trim() }
      : null;
  if (!where) return { found: false, message: "Provide invoiceId or invoiceNo." };

  const inv = await prisma.salesInvoice.findFirst({
    where,
    select: {
      id: true,
      invoiceNo: true,
      invoiceDate: true,
      customerName: true,
      customerId: true,
      grandTotal: true,
      paidAmount: true,
      paymentStatus: true,
      status: true,
      remarks: true,
      SalesInvoiceItem: {
        select: {
          partNo: true,
          description: true,
          orderedQty: true,
          deliveredQty: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
  });
  if (!inv) return { found: false, message: "Invoice not found." };
  return {
    found: true,
    invoice: {
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      customerName: inv.customerName,
      customerId: inv.customerId,
      grandTotal: money(inv.grandTotal),
      paidAmount: money(inv.paidAmount),
      dueAmount: money(inv.grandTotal - inv.paidAmount),
      paymentStatus: inv.paymentStatus,
      status: inv.status,
      remarks: inv.remarks,
      items: inv.SalesInvoiceItem,
    },
  };
}

async function toolExportData(args: {
  format?: string;
  title?: string;
  entity?: string;
  query?: string;
  status?: string;
  paymentStatus?: string;
  dateFrom?: string;
  dateTo?: string;
  columns?: string[];
  rows?: Record<string, unknown>[];
}): Promise<
  | (AiExportAttachment & { success: true; message: string })
  | { success: false; error: string }
> {
  const format = args.format === "pdf" ? "pdf" : "excel";
  const title = String(args.title || "Koncepts export").slice(0, 120);

  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(args.rows) && args.rows.length > 0) {
    rows = args.rows
      .filter((r) => r && typeof r === "object")
      .slice(0, MAX_EXPORT_ROWS) as Record<string, unknown>[];
  } else if (args.entity) {
    const result = await queryErp({
      entity: String(args.entity),
      query: args.query,
      status: args.status,
      paymentStatus: args.paymentStatus,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
      limit: MAX_EXPORT_ROWS,
    });
    if ((result as any).error) {
      return { success: false, error: String((result as any).error) };
    }
    const list = (result as any).rows;
    if (!Array.isArray(list) || list.length === 0) {
      return {
        success: false,
        error: "No rows found to export for that filter.",
      };
    }
    rows = list as Record<string, unknown>[];
  } else {
    return {
      success: false,
      error:
        "Provide entity (to query live data) or rows (from a previous lookup).",
    };
  }

  const file = await createAiExportFile({
    format,
    title,
    rows,
    columns: Array.isArray(args.columns)
      ? args.columns.map(String)
      : undefined,
  });

  return {
    success: true,
    ...file,
    message: `Created ${format.toUpperCase()} with ${file.rowCount} row(s). Tell the user to use the download button. File expires in about 1 hour.`,
  };
}

export async function executeAiDbTool(
  name: string,
  rawArgs: unknown,
): Promise<unknown> {
  let args: Record<string, unknown> = {};
  try {
    if (typeof rawArgs === "string") {
      args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
    } else if (rawArgs && typeof rawArgs === "object") {
      args = rawArgs as Record<string, unknown>;
    }
  } catch {
    return { error: "Invalid tool arguments JSON" };
  }

  try {
    switch (name) {
      case "list_queryable_entities":
        return await toolListEntities();
      case "query_erp":
        return await queryErp({
          entity: String(args.entity || ""),
          query: args.query != null ? String(args.query) : undefined,
          status: args.status != null ? String(args.status) : undefined,
          paymentStatus:
            args.paymentStatus != null
              ? String(args.paymentStatus)
              : undefined,
          dateFrom: args.dateFrom != null ? String(args.dateFrom) : undefined,
          dateTo: args.dateTo != null ? String(args.dateTo) : undefined,
          limit: args.limit != null ? Number(args.limit) : undefined,
        });
      case "search_customers":
        return await queryErp({
          entity: "customers",
          query: String(args.query || ""),
        });
      case "search_parts_stock":
        return await queryErp({
          entity: "parts",
          query: String(args.query || ""),
        });
      case "get_customer_balance":
        return await toolGetCustomerBalance({
          customerId: args.customerId ? String(args.customerId) : undefined,
          query: args.query ? String(args.query) : undefined,
        });
      case "get_customer_open_invoices":
        return await toolGetCustomerOpenInvoices({
          customerId: args.customerId ? String(args.customerId) : undefined,
          query: args.query ? String(args.query) : undefined,
          limit: args.limit != null ? Number(args.limit) : undefined,
        });
      case "get_part_stock":
        return await toolGetPartStock({
          partId: args.partId ? String(args.partId) : undefined,
          partNo: args.partNo ? String(args.partNo) : undefined,
        });
      case "get_voucher_detail":
        return await toolGetVoucherDetail({
          voucherId: args.voucherId ? String(args.voucherId) : undefined,
          voucherNumber: args.voucherNumber
            ? String(args.voucherNumber)
            : undefined,
        });
      case "get_invoice_detail":
        return await toolGetInvoiceDetail({
          invoiceId: args.invoiceId ? String(args.invoiceId) : undefined,
          invoiceNo: args.invoiceNo ? String(args.invoiceNo) : undefined,
        });
      case "export_data":
        return await toolExportData({
          format: args.format ? String(args.format) : undefined,
          title: args.title ? String(args.title) : undefined,
          entity: args.entity ? String(args.entity) : undefined,
          query: args.query != null ? String(args.query) : undefined,
          status: args.status != null ? String(args.status) : undefined,
          paymentStatus:
            args.paymentStatus != null
              ? String(args.paymentStatus)
              : undefined,
          dateFrom: args.dateFrom != null ? String(args.dateFrom) : undefined,
          dateTo: args.dateTo != null ? String(args.dateTo) : undefined,
          columns: Array.isArray(args.columns)
            ? args.columns.map(String)
            : undefined,
          rows: Array.isArray(args.rows)
            ? (args.rows as Record<string, unknown>[])
            : undefined,
        });
      default:
        return {
          error: `Unknown tool: ${name}. Call list_queryable_entities or query_erp.`,
        };
    }
  } catch (e: any) {
    return { error: e?.message || "Tool execution failed" };
  }
}
