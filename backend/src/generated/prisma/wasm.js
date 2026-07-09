
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.AccountScalarFieldEnum = {
  id: 'id',
  subgroupId: 'subgroupId',
  code: 'code',
  name: 'name',
  description: 'description',
  accountType: 'accountType',
  openingBalance: 'openingBalance',
  currentBalance: 'currentBalance',
  status: 'status',
  canDelete: 'canDelete',
  supplierId: 'supplierId',
  customerId: 'customerId',
  employeeId: 'employeeId',
  employeeAccountRole: 'employeeAccountRole',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ActivityLogScalarFieldEnum = {
  id: 'id',
  timestamp: 'timestamp',
  user: 'user',
  userRole: 'userRole',
  action: 'action',
  actionType: 'actionType',
  module: 'module',
  description: 'description',
  ipAddress: 'ipAddress',
  status: 'status',
  details: 'details',
  createdAt: 'createdAt'
};

exports.Prisma.AdjustmentScalarFieldEnum = {
  id: 'id',
  adjustmentNo: 'adjustmentNo',
  date: 'date',
  subject: 'subject',
  storeId: 'storeId',
  addInventory: 'addInventory',
  notes: 'notes',
  totalAmount: 'totalAmount',
  status: 'status',
  voucherId: 'voucherId',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.AdjustmentItemScalarFieldEnum = {
  id: 'id',
  adjustmentId: 'adjustmentId',
  partId: 'partId',
  quantity: 'quantity',
  cost: 'cost',
  notes: 'notes',
  rackId: 'rackId',
  shelfId: 'shelfId',
  createdAt: 'createdAt',
  priceA: 'priceA',
  priceB: 'priceB',
  priceM: 'priceM',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.AreaScalarFieldEnum = {
  id: 'id',
  name: 'name',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApplicationScalarFieldEnum = {
  id: 'id',
  subcategoryId: 'subcategoryId',
  masterPartId: 'masterPartId',
  name: 'name',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApprovalFlowScalarFieldEnum = {
  id: 'id',
  name: 'name',
  status: 'status',
  description: 'description',
  steps: 'steps',
  module: 'module',
  trigger: 'trigger',
  condition: 'condition',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BackupScalarFieldEnum = {
  id: 'id',
  name: 'name',
  tables: 'tables',
  type: 'type',
  size: 'size',
  status: 'status',
  createdAt: 'createdAt',
  createdBy: 'createdBy'
};

exports.Prisma.BackupScheduleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  frequency: 'frequency',
  tables: 'tables',
  time: 'time',
  status: 'status',
  lastRun: 'lastRun',
  nextRun: 'nextRun',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BrandScalarFieldEnum = {
  id: 'id',
  name: 'name',
  longName: 'longName',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CategoryScalarFieldEnum = {
  id: 'id',
  name: 'name',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CompanyProfileScalarFieldEnum = {
  id: 'id',
  companyInfo: 'companyInfo',
  systemSettings: 'systemSettings',
  invoiceSettings: 'invoiceSettings',
  notificationSettings: 'notificationSettings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CustomerScalarFieldEnum = {
  id: 'id',
  name: 'name',
  address: 'address',
  email: 'email',
  cnic: 'cnic',
  contactNo: 'contactNo',
  openingBalance: 'openingBalance',
  date: 'date',
  creditLimit: 'creditLimit',
  status: 'status',
  priceType: 'priceType',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  accountHead: 'accountHead',
  area: 'area',
  cellNumber: 'cellNumber',
  code: 'code',
  contactPersons: 'contactPersons',
  gstNumber: 'gstNumber',
  ntn: 'ntn',
  pstNumber: 'pstNumber',
  referenceName: 'referenceName',
  remarks: 'remarks',
  shortTitle: 'shortTitle',
  accountClosingDate: 'accountClosingDate',
  accountOpeningDate: 'accountOpeningDate',
  category: 'category',
  tax: 'tax'
};

exports.Prisma.EmployeeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  cnic: 'cnic',
  contactNo: 'contactNo',
  email: 'email',
  address: 'address',
  designation: 'designation',
  department: 'department',
  joiningDate: 'joiningDate',
  openingBalanceDate: 'openingBalanceDate',
  monthlySalary: 'monthlySalary',
  workingDays: 'workingDays',
  status: 'status',
  remarks: 'remarks',
  openingLoanBalance: 'openingLoanBalance',
  openingAdvanceBalance: 'openingAdvanceBalance',
  openingSalaryPayable: 'openingSalaryPayable',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.EmployeeTransactionScalarFieldEnum = {
  id: 'id',
  employeeId: 'employeeId',
  type: 'type',
  date: 'date',
  payrollMonth: 'payrollMonth',
  amount: 'amount',
  absentDays: 'absentDays',
  loanRecovery: 'loanRecovery',
  advanceRecovery: 'advanceRecovery',
  netPaid: 'netPaid',
  description: 'description',
  voucherId: 'voucherId',
  referenceNo: 'referenceNo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DeliveryLogScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  challanNo: 'challanNo',
  deliveryDate: 'deliveryDate',
  deliveredBy: 'deliveredBy',
  createdAt: 'createdAt'
};

exports.Prisma.DeliveryLogItemScalarFieldEnum = {
  id: 'id',
  deliveryLogId: 'deliveryLogId',
  invoiceItemId: 'invoiceItemId',
  quantity: 'quantity',
  createdAt: 'createdAt'
};

exports.Prisma.DirectPurchaseOrderScalarFieldEnum = {
  id: 'id',
  dpoNumber: 'dpoNumber',
  date: 'date',
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
  storeId: 'storeId',
  supplierId: 'supplierId',
  branchAccountId: 'branchAccountId',
  orderType: 'orderType',
  account: 'account',
  description: 'description',
  status: 'status',
  discount: 'discount',
  totalAmount: 'totalAmount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DirectPurchaseOrderExpenseScalarFieldEnum = {
  id: 'id',
  directPurchaseOrderId: 'directPurchaseOrderId',
  expenseType: 'expenseType',
  payableAccount: 'payableAccount',
  description: 'description',
  amount: 'amount',
  createdAt: 'createdAt'
};

exports.Prisma.DirectPurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  directPurchaseOrderId: 'directPurchaseOrderId',
  partId: 'partId',
  quantity: 'quantity',
  purchasePrice: 'purchasePrice',
  salePrice: 'salePrice',
  amount: 'amount',
  priceA: 'priceA',
  priceB: 'priceB',
  priceM: 'priceM',
  rackId: 'rackId',
  shelfId: 'shelfId',
  createdAt: 'createdAt'
};

exports.Prisma.DirectPurchaseOrderReturnScalarFieldEnum = {
  id: 'id',
  returnNumber: 'returnNumber',
  directPurchaseOrderId: 'directPurchaseOrderId',
  returnDate: 'returnDate',
  reason: 'reason',
  status: 'status',
  totalAmount: 'totalAmount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  supplierId: 'supplierId',
  deduction: 'deduction',
  netAmount: 'netAmount'
};

exports.Prisma.DirectPurchaseOrderReturnItemScalarFieldEnum = {
  id: 'id',
  dpoReturnId: 'dpoReturnId',
  partId: 'partId',
  returnQuantity: 'returnQuantity',
  originalPurchasePrice: 'originalPurchasePrice',
  amount: 'amount',
  createdAt: 'createdAt'
};

exports.Prisma.ExpenseTypeScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  description: 'description',
  category: 'category',
  budget: 'budget',
  spent: 'spent',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LongCatSettingsScalarFieldEnum = {
  id: 'id',
  apiKey: 'apiKey',
  model: 'model',
  baseUrl: 'baseUrl',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MainGroupScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  type: 'type',
  displayOrder: 'displayOrder',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MasterPartScalarFieldEnum = {
  id: 'id',
  masterPartNo: 'masterPartNo',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ModelScalarFieldEnum = {
  id: 'id',
  partId: 'partId',
  name: 'name',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  qtyUsed: 'qtyUsed'
};

exports.Prisma.OperationalExpenseScalarFieldEnum = {
  id: 'id',
  date: 'date',
  voucherNo: 'voucherNo',
  expenseType: 'expenseType',
  description: 'description',
  paidTo: 'paidTo',
  amount: 'amount',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PartScalarFieldEnum = {
  id: 'id',
  masterPartId: 'masterPartId',
  partNo: 'partNo',
  brandId: 'brandId',
  description: 'description',
  categoryId: 'categoryId',
  subcategoryId: 'subcategoryId',
  applicationId: 'applicationId',
  hsCode: 'hsCode',
  weight: 'weight',
  reorderLevel: 'reorderLevel',
  uom: 'uom',
  cost: 'cost',
  purchasePrice: 'purchasePrice',
  avgCost: 'avgCost',
  costSource: 'costSource',
  costSourceRef: 'costSourceRef',
  costUpdatedAt: 'costUpdatedAt',
  priceA: 'priceA',
  priceB: 'priceB',
  priceM: 'priceM',
  smc: 'smc',
  size: 'size',
  origin: 'origin',
  type: 'type',
  imageP1: 'imageP1',
  imageP2: 'imageP2',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.KitItemScalarFieldEnum = {
  id: 'id',
  partId: 'partId',
  componentPartId: 'componentPartId',
  partNo: 'partNo',
  partName: 'partName',
  quantity: 'quantity',
  costPerUnit: 'costPerUnit',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseImportRequestScalarFieldEnum = {
  id: 'id',
  requestNo: 'requestNo',
  batchId: 'batchId',
  supplierId: 'supplierId',
  partReference: 'partReference',
  consignee: 'consignee',
  status: 'status',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseImportRequestItemScalarFieldEnum = {
  id: 'id',
  purchaseImportRequestId: 'purchaseImportRequestId',
  partId: 'partId',
  currentStock: 'currentStock',
  demandQuantity: 'demandQuantity',
  khiQuantity: 'khiQuantity',
  isbQuantity: 'isbQuantity',
  otherQuantity: 'otherQuantity',
  weight: 'weight',
  totalWeight: 'totalWeight',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseQuotationScalarFieldEnum = {
  id: 'id',
  quotationNo: 'quotationNo',
  purchaseImportRequestId: 'purchaseImportRequestId',
  supplierId: 'supplierId',
  currency: 'currency',
  conversionRate: 'conversionRate',
  fcTotal: 'fcTotal',
  lcTotal: 'lcTotal',
  fcRevisedTotal: 'fcRevisedTotal',
  lcRevisedTotal: 'lcRevisedTotal',
  quotationDate: 'quotationDate',
  revisedQuotationDate: 'revisedQuotationDate',
  quotationType: 'quotationType',
  terms: 'terms',
  status: 'status',
  confirmationDate: 'confirmationDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseQuotationItemScalarFieldEnum = {
  id: 'id',
  purchaseQuotationId: 'purchaseQuotationId',
  partId: 'partId',
  demandQuantity: 'demandQuantity',
  quotationQuantity: 'quotationQuantity',
  shipDays: 'shipDays',
  fcRate: 'fcRate',
  fcAmount: 'fcAmount',
  lcRate: 'lcRate',
  lcAmount: 'lcAmount',
  revisedFcRate: 'revisedFcRate',
  revisedFcAmount: 'revisedFcAmount',
  revisedLcRate: 'revisedLcRate',
  revisedLcAmount: 'revisedLcAmount',
  weight: 'weight',
  totalWeight: 'totalWeight',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PostedExpenseScalarFieldEnum = {
  id: 'id',
  date: 'date',
  expenseTypeId: 'expenseTypeId',
  amount: 'amount',
  paidTo: 'paidTo',
  paymentMode: 'paymentMode',
  referenceNumber: 'referenceNumber',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.PriceHistoryScalarFieldEnum = {
  id: 'id',
  partId: 'partId',
  partNo: 'partNo',
  description: 'description',
  priceField: 'priceField',
  updateType: 'updateType',
  oldValue: 'oldValue',
  newValue: 'newValue',
  updateValue: 'updateValue',
  itemsUpdated: 'itemsUpdated',
  reason: 'reason',
  updatedBy: 'updatedBy',
  createdAt: 'createdAt'
};

exports.Prisma.PurchaseOrderScalarFieldEnum = {
  id: 'id',
  poNumber: 'poNumber',
  date: 'date',
  supplierId: 'supplierId',
  purchaseQuotationId: 'purchaseQuotationId',
  consignee: 'consignee',
  currency: 'currency',
  conversionRate: 'conversionRate',
  fcTotal: 'fcTotal',
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
  blNo: 'blNo',
  blDate: 'blDate',
  pkgExpPercent: 'pkgExpPercent',
  invDiscPercent: 'invDiscPercent',
  frtExp: 'frtExp',
  discAmt: 'discAmt',
  customsDuty: 'customsDuty',
  additionalCustomsDuty: 'additionalCustomsDuty',
  regulatoryDuty: 'regulatoryDuty',
  salesTax: 'salesTax',
  additionalSalesTax: 'additionalSalesTax',
  incomeTax: 'incomeTax',
  ed: 'ed',
  doAmount: 'doAmount',
  miscExp: 'miscExp',
  locFrt: 'locFrt',
  crnExp: 'crnExp',
  totalExp: 'totalExp',
  status: 'status',
  expectedDate: 'expectedDate',
  notes: 'notes',
  totalAmount: 'totalAmount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PurchaseOrderItemScalarFieldEnum = {
  id: 'id',
  purchaseOrderId: 'purchaseOrderId',
  partId: 'partId',
  quantity: 'quantity',
  unitCost: 'unitCost',
  totalCost: 'totalCost',
  fcRate: 'fcRate',
  fcAmount: 'fcAmount',
  weight: 'weight',
  totalWeight: 'totalWeight',
  receivedQty: 'receivedQty',
  additionalQty: 'additionalQty',
  backQty: 'backQty',
  notes: 'notes',
  createdAt: 'createdAt'
};

exports.Prisma.RackScalarFieldEnum = {
  id: 'id',
  codeNo: 'codeNo',
  storeId: 'storeId',
  description: 'description',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ReceivableScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  customerId: 'customerId',
  amount: 'amount',
  paidAmount: 'paidAmount',
  dueAmount: 'dueAmount',
  dueDate: 'dueDate',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  name: 'name',
  type: 'type',
  description: 'description',
  permissions: 'permissions',
  usersCount: 'usersCount',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SalesInquiryScalarFieldEnum = {
  id: 'id',
  inquiryNo: 'inquiryNo',
  inquiryDate: 'inquiryDate',
  customerName: 'customerName',
  customerEmail: 'customerEmail',
  customerPhone: 'customerPhone',
  subject: 'subject',
  description: 'description',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SalesInquiryItemScalarFieldEnum = {
  id: 'id',
  inquiryId: 'inquiryId',
  partId: 'partId',
  quantity: 'quantity',
  purchasePrice: 'purchasePrice',
  priceA: 'priceA',
  priceB: 'priceB',
  priceM: 'priceM',
  location: 'location',
  stock: 'stock',
  reservedQty: 'reservedQty',
  createdAt: 'createdAt'
};

exports.Prisma.SalesInvoiceScalarFieldEnum = {
  id: 'id',
  invoiceNo: 'invoiceNo',
  invoiceDate: 'invoiceDate',
  term: 'term',
  customerId: 'customerId',
  customerName: 'customerName',
  customerType: 'customerType',
  salesPerson: 'salesPerson',
  subtotal: 'subtotal',
  overallDiscount: 'overallDiscount',
  freightCharges: 'freightCharges',
  tax: 'tax',
  taxPercentage: 'taxPercentage',
  grandTotal: 'grandTotal',
  paidAmount: 'paidAmount',
  status: 'status',
  paymentStatus: 'paymentStatus',
  accountId: 'accountId',
  bankAccountId: 'bankAccountId',
  cashAccountId: 'cashAccountId',
  bankAmount: 'bankAmount',
  cashAmount: 'cashAmount',
  deliveredTo: 'deliveredTo',
  remarks: 'remarks',
  quotationId: 'quotationId',
  holdReason: 'holdReason',
  holdSince: 'holdSince',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SalesInvoiceItemScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  partId: 'partId',
  partNo: 'partNo',
  description: 'description',
  orderedQty: 'orderedQty',
  deliveredQty: 'deliveredQty',
  pendingQty: 'pendingQty',
  unitPrice: 'unitPrice',
  discount: 'discount',
  lineTotal: 'lineTotal',
  grade: 'grade',
  brand: 'brand',
  createdAt: 'createdAt',
  avgCost: 'avgCost',
  useUnlocatedStock: 'useUnlocatedStock'
};

exports.Prisma.InvoiceRackShelfScalarFieldEnum = {
  id: 'id',
  salesInvoiceItemId: 'salesInvoiceItemId',
  storeId: 'storeId',
  rackId: 'rackId',
  shelfId: 'shelfId',
  quantity: 'quantity',
  createdAt: 'createdAt'
};

exports.Prisma.SalesQuotationScalarFieldEnum = {
  id: 'id',
  quotationNo: 'quotationNo',
  quotationDate: 'quotationDate',
  validUntil: 'validUntil',
  customerType: 'customerType',
  customerId: 'customerId',
  customerName: 'customerName',
  customerEmail: 'customerEmail',
  customerPhone: 'customerPhone',
  customerAddress: 'customerAddress',
  status: 'status',
  subtotal: 'subtotal',
  overallDiscount: 'overallDiscount',
  freightCharges: 'freightCharges',
  tax: 'tax',
  taxPercentage: 'taxPercentage',
  totalAmount: 'totalAmount',
  notes: 'notes',
  invoiceId: 'invoiceId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SalesQuotationItemScalarFieldEnum = {
  id: 'id',
  quotationId: 'quotationId',
  partId: 'partId',
  partNo: 'partNo',
  description: 'description',
  quantity: 'quantity',
  unitPrice: 'unitPrice',
  total: 'total',
  createdAt: 'createdAt'
};

exports.Prisma.SalesReturnScalarFieldEnum = {
  id: 'id',
  returnNumber: 'returnNumber',
  salesInvoiceId: 'salesInvoiceId',
  isDirectReturn: 'isDirectReturn',
  legacyInvoiceNo: 'legacyInvoiceNo',
  legacyCustomerName: 'legacyCustomerName',
  customerType: 'customerType',
  returnDate: 'returnDate',
  reason: 'reason',
  status: 'status',
  subtotal: 'subtotal',
  tax: 'tax',
  taxPercentage: 'taxPercentage',
  deduction: 'deduction',
  totalAmount: 'totalAmount',
  paymentAccountId: 'paymentAccountId',
  paidAmount: 'paidAmount',
  createdBy: 'createdBy',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  customerId: 'customerId'
};

exports.Prisma.SalesReturnItemScalarFieldEnum = {
  id: 'id',
  salesReturnId: 'salesReturnId',
  partId: 'partId',
  returnQuantity: 'returnQuantity',
  originalSalePrice: 'originalSalePrice',
  amount: 'amount',
  createdAt: 'createdAt',
  avgCost: 'avgCost'
};

exports.Prisma.ShelfScalarFieldEnum = {
  id: 'id',
  shelfNo: 'shelfNo',
  rackId: 'rackId',
  description: 'description',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockMovementScalarFieldEnum = {
  id: 'id',
  partId: 'partId',
  type: 'type',
  quantity: 'quantity',
  storeId: 'storeId',
  rackId: 'rackId',
  shelfId: 'shelfId',
  referenceType: 'referenceType',
  referenceId: 'referenceId',
  notes: 'notes',
  createdAt: 'createdAt',
  supplierId: 'supplierId'
};

exports.Prisma.StockReservationScalarFieldEnum = {
  id: 'id',
  invoiceId: 'invoiceId',
  partId: 'partId',
  quantity: 'quantity',
  reservedAt: 'reservedAt',
  releasedAt: 'releasedAt',
  status: 'status',
  notes: 'notes',
  rackId: 'rackId',
  shelfId: 'shelfId',
  storeId: 'storeId',
  useUnlocatedStock: 'useUnlocatedStock'
};

exports.Prisma.StockVerificationScalarFieldEnum = {
  id: 'id',
  name: 'name',
  notes: 'notes',
  status: 'status',
  startDate: 'startDate',
  completedDate: 'completedDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StockVerificationItemScalarFieldEnum = {
  id: 'id',
  verificationId: 'verificationId',
  partId: 'partId',
  storeId: 'storeId',
  rackId: 'rackId',
  shelfId: 'shelfId',
  systemQty: 'systemQty',
  physicalQty: 'physicalQty',
  variance: 'variance',
  status: 'status',
  remarks: 'remarks',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StoreScalarFieldEnum = {
  id: 'id',
  code: 'code',
  name: 'name',
  address: 'address',
  phone: 'phone',
  manager: 'manager',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SubcategoryScalarFieldEnum = {
  id: 'id',
  categoryId: 'categoryId',
  name: 'name',
  status: 'status',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SubgroupScalarFieldEnum = {
  id: 'id',
  mainGroupId: 'mainGroupId',
  code: 'code',
  name: 'name',
  isActive: 'isActive',
  canDelete: 'canDelete',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SupplierScalarFieldEnum = {
  id: 'id',
  code: 'code',
  type: 'type',
  currencyName: 'currencyName',
  name: 'name',
  companyName: 'companyName',
  address: 'address',
  city: 'city',
  state: 'state',
  country: 'country',
  zipCode: 'zipCode',
  email: 'email',
  phone: 'phone',
  cnic: 'cnic',
  contactPerson: 'contactPerson',
  taxId: 'taxId',
  paymentTerms: 'paymentTerms',
  openingBalance: 'openingBalance',
  date: 'date',
  status: 'status',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  accountHead: 'accountHead',
  area: 'area',
  cellNumber: 'cellNumber',
  contactPersons: 'contactPersons',
  gstNumber: 'gstNumber',
  ntn: 'ntn',
  referenceName: 'referenceName',
  remarks: 'remarks',
  shortTitle: 'shortTitle'
};

exports.Prisma.TransferScalarFieldEnum = {
  id: 'id',
  transferNumber: 'transferNumber',
  date: 'date',
  status: 'status',
  notes: 'notes',
  totalQty: 'totalQty',
  fromStoreId: 'fromStoreId',
  toStoreId: 'toStoreId',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TransferItemScalarFieldEnum = {
  id: 'id',
  transferId: 'transferId',
  partId: 'partId',
  fromStoreId: 'fromStoreId',
  fromRackId: 'fromRackId',
  fromShelfId: 'fromShelfId',
  toStoreId: 'toStoreId',
  toRackId: 'toRackId',
  toShelfId: 'toShelfId',
  quantity: 'quantity',
  createdAt: 'createdAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  name: 'name',
  email: 'email',
  password: 'password',
  roleId: 'roleId',
  status: 'status',
  lastLogin: 'lastLogin',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.VoucherScalarFieldEnum = {
  id: 'id',
  voucherNumber: 'voucherNumber',
  type: 'type',
  date: 'date',
  narration: 'narration',
  cashBankAccount: 'cashBankAccount',
  chequeNumber: 'chequeNumber',
  chequeDate: 'chequeDate',
  checkClearDate: 'checkClearDate',
  isCleared: 'isCleared',
  totalDebit: 'totalDebit',
  totalCredit: 'totalCredit',
  status: 'status',
  createdBy: 'createdBy',
  approvedBy: 'approvedBy',
  approvedAt: 'approvedAt',
  isSystemGenerated: 'isSystemGenerated',
  conversionRate: 'conversionRate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  storeId: 'storeId',
  adjustmentId: 'adjustmentId',
  salesInvoiceId: 'salesInvoiceId',
  salesReturnId: 'salesReturnId'
};

exports.Prisma.VoucherEntryScalarFieldEnum = {
  id: 'id',
  voucherId: 'voucherId',
  accountId: 'accountId',
  accountName: 'accountName',
  description: 'description',
  debit: 'debit',
  credit: 'credit',
  sortOrder: 'sortOrder',
  supplierId: 'supplierId',
  customerId: 'customerId',
  employeeId: 'employeeId',
  createdAt: 'createdAt',
  deletedAt: 'deletedAt',
  adjustmentId: 'adjustmentId',
  salesInvoiceId: 'salesInvoiceId'
};

exports.Prisma.WhatsAppSettingsScalarFieldEnum = {
  id: 'id',
  appKey: 'appKey',
  authKey: 'authKey',
  administratorPhoneNumber: 'administratorPhoneNumber',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.PartRackShelfScalarFieldEnum = {
  id: 'id',
  partId: 'partId',
  storeId: 'storeId',
  rackId: 'rackId',
  shelfId: 'shelfId',
  quantity: 'quantity',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};


exports.Prisma.ModelName = {
  Account: 'Account',
  ActivityLog: 'ActivityLog',
  Adjustment: 'Adjustment',
  AdjustmentItem: 'AdjustmentItem',
  Area: 'Area',
  Application: 'Application',
  ApprovalFlow: 'ApprovalFlow',
  Backup: 'Backup',
  BackupSchedule: 'BackupSchedule',
  Brand: 'Brand',
  Category: 'Category',
  CompanyProfile: 'CompanyProfile',
  Customer: 'Customer',
  Employee: 'Employee',
  EmployeeTransaction: 'EmployeeTransaction',
  DeliveryLog: 'DeliveryLog',
  DeliveryLogItem: 'DeliveryLogItem',
  DirectPurchaseOrder: 'DirectPurchaseOrder',
  DirectPurchaseOrderExpense: 'DirectPurchaseOrderExpense',
  DirectPurchaseOrderItem: 'DirectPurchaseOrderItem',
  DirectPurchaseOrderReturn: 'DirectPurchaseOrderReturn',
  DirectPurchaseOrderReturnItem: 'DirectPurchaseOrderReturnItem',
  ExpenseType: 'ExpenseType',
  LongCatSettings: 'LongCatSettings',
  MainGroup: 'MainGroup',
  MasterPart: 'MasterPart',
  Model: 'Model',
  OperationalExpense: 'OperationalExpense',
  Part: 'Part',
  KitItem: 'KitItem',
  PurchaseImportRequest: 'PurchaseImportRequest',
  PurchaseImportRequestItem: 'PurchaseImportRequestItem',
  PurchaseQuotation: 'PurchaseQuotation',
  PurchaseQuotationItem: 'PurchaseQuotationItem',
  PostedExpense: 'PostedExpense',
  PriceHistory: 'PriceHistory',
  PurchaseOrder: 'PurchaseOrder',
  PurchaseOrderItem: 'PurchaseOrderItem',
  Rack: 'Rack',
  Receivable: 'Receivable',
  Role: 'Role',
  SalesInquiry: 'SalesInquiry',
  SalesInquiryItem: 'SalesInquiryItem',
  SalesInvoice: 'SalesInvoice',
  SalesInvoiceItem: 'SalesInvoiceItem',
  InvoiceRackShelf: 'InvoiceRackShelf',
  SalesQuotation: 'SalesQuotation',
  SalesQuotationItem: 'SalesQuotationItem',
  SalesReturn: 'SalesReturn',
  SalesReturnItem: 'SalesReturnItem',
  Shelf: 'Shelf',
  StockMovement: 'StockMovement',
  StockReservation: 'StockReservation',
  StockVerification: 'StockVerification',
  StockVerificationItem: 'StockVerificationItem',
  Store: 'Store',
  Subcategory: 'Subcategory',
  Subgroup: 'Subgroup',
  Supplier: 'Supplier',
  Transfer: 'Transfer',
  TransferItem: 'TransferItem',
  User: 'User',
  Voucher: 'Voucher',
  VoucherEntry: 'VoucherEntry',
  WhatsAppSettings: 'WhatsAppSettings',
  PartRackShelf: 'PartRackShelf'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
