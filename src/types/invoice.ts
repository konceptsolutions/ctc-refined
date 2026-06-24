// Invoice Types for Sales Invoice System

export type CustomerType = "walking" | "registered" | "transfer";

/** Display label for sale / customer type (API values stay walking | registered). */
export function getCustomerTypeLabel(
  customerType: CustomerType | string | null | undefined,
): string {
  switch (customerType) {
    case "walking":
      return "Walk-in";
    case "registered":
      return "Party";
    case "transfer":
      return "Transfer Out";
    default:
      return customerType?.trim() ? String(customerType) : "N/A";
  }
}

export type StockStatus = "available" | "reserved" | "out";

export type InvoiceStatus =
  | "pending"
  | "on_hold"
  | "approved"
  | "partially_delivered"
  | "partially_delivered_reversed"
  | "delivered"
  | "cancelled"
  | "fully_delivered"
  | "partially_return"
  | "return";

export type PaymentStatus = "unpaid" | "partial" | "paid";

export type ItemGrade = "A" | "B" | "C" | "D";

export interface Customer {
  id: string;
  name: string;
  type: CustomerType;
  phone?: string;
  address?: string;
  area?: string | null;
  balance?: number;
  creditLimit?: number;
  creditDays?: number;
  priceType?: "A" | "B" | "M" | null;
  category?: "Reseller" | "EndUser" | string | null;
}

export interface ItemBrand {
  id: string;
  name: string;
}

export interface ItemCategory {
  id: string;
  name: string;
}

export interface MachineModel {
  id: string;
  name: string;
  requiredQty?: number;
}

export interface PartItem {
  id: string;
  partNo: string; // Master Part No (Red Block) - displayed in dropdown
  masterPartNo?: string; // Part No (Blue Block) - stored but not displayed in dropdown
  description: string;
  application?: string;
  price: number;
  priceA?: number;
  priceB?: number;
  priceM?: number;
  stockQty: number;
  reservedQty: number;
  availableQty: number;
  grade: ItemGrade;
  category: string;
  brands: ItemBrand[];
  lastSaleQty?: number;
  lastSalePrice?: number;
  lastSaleCustomerName?: string;
  lastSaleDate?: string;
  machineModels?: MachineModel[];
  locations?: StockLocation[];
  unlocatedStock?: number;
  images?: string[];
}

export interface StockLocation {
  id: string; // PartRackShelf ID
  storeId?: string;
  storeName?: string;
  rackId?: string;
  rackCode?: string;
  shelfId?: string;
  shelfNo?: string;
  quantity: number;
}

export interface InvoiceItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  orderedQty: number;
  deliveredQty: number;
  pendingQty: number;
  reversedQty?: number;
  unitPrice: number;
  avgCost?: number;
  discount: number;
  discountType: "percent" | "fixed";
  lineTotal: number;
  grade: ItemGrade;
  brand?: string;
  machineModel?: string;
  machineRequiredQty?: number;
  stockLocations?: StockLocation[];
  totalStock?: number;
  storeName?: string;
  rackCode?: string;
  shelfNo?: string;
  useUnlocatedStock?: boolean;
}

export interface DeliveryLogEntry {
  id: string;
  deliveryDate: string;
  challanNo: string;
  items: {
    invoiceItemId: string;
    partId: string;
    partNo: string;
    quantity: number;
  }[];
  deliveredBy?: string;
  remarks?: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  term?: string | null;
  customerType: CustomerType;
  customerId: string;
  customerName: string;
  salesPerson: string;
  items: InvoiceItem[];
  subtotal: number;
  overallDiscount: number;
  overallDiscountType: "percent" | "fixed";
  freightCharges?: number;
  tax: number;
  taxPercentage?: number | null;
  grandTotal: number;
  paidAmount: number;
  accountId?: string;
  bankAccountId?: string | null;
  cashAccountId?: string | null;
  bankAmount?: number;
  cashAmount?: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  deliveryLog: DeliveryLogEntry[];
  holdReason?: string;
  holdSince?: string;
  createdAt: string;
  updatedAt: string;
  /** Quotation-only (when reused from sales quotation list) */
  validUntil?: string;
  quotationStatus?: string;
  /** Present on sales invoices converted from quotations */
  quotationId?: string | null;
  remarks?: string | null;
}

export interface StockReservation {
  invoiceId: string;
  partId: string;
  reservedQty: number;
  reservedAt: string;
}
