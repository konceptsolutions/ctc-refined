import { useCallback } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';

// Hook for triggering notifications from different modules
export const useAppNotifications = () => {
  const { addNotification } = useNotifications();

  // Parts Module
  const notifyPartCreated = useCallback((partName: string) => {
    addNotification({
      title: 'Part Created',
      message: `New part "${partName}" has been added to inventory.`,
      type: 'success',
      module: 'parts',
      action: { label: 'View Parts', path: '/parts' },
    });
  }, [addNotification]);

  const notifyPartUpdated = useCallback((partName: string) => {
    addNotification({
      title: 'Part Updated',
      message: `Part "${partName}" has been updated successfully.`,
      type: 'info',
      module: 'parts',
    });
  }, [addNotification]);

  const notifyKitCreated = useCallback((kitName: string) => {
    addNotification({
      title: 'Kit Created',
      message: `Kit "${kitName}" has been assembled.`,
      type: 'success',
      module: 'parts',
    });
  }, [addNotification]);

  // Sales Module
  const notifyInvoiceCreated = useCallback((invoiceNumber: string, amount?: number) => {
    addNotification({
      title: 'Invoice Created',
      message: `Invoice ${invoiceNumber}${amount ? ` for $${amount.toFixed(2)}` : ''} has been created.`,
      type: 'success',
      module: 'sales',
      action: { label: 'View Sales', path: '/sales' },
    });
  }, [addNotification]);

  const notifyQuotationSent = useCallback((customerName: string) => {
    addNotification({
      title: 'Quotation Sent',
      message: `Quotation sent to ${customerName} successfully.`,
      type: 'success',
      module: 'sales',
    });
  }, [addNotification]);

  const notifyDeliveryDispatched = useCallback((challanNumber: string) => {
    addNotification({
      title: 'Delivery Dispatched',
      message: `Delivery challan ${challanNumber} has been dispatched.`,
      type: 'info',
      module: 'sales',
    });
  }, [addNotification]);

  const notifyPaymentReceived = useCallback((amount: number, customerName: string) => {
    addNotification({
      title: 'Payment Received',
      message: `Payment of $${amount.toFixed(2)} received from ${customerName}.`,
      type: 'success',
      module: 'sales',
    });
  }, [addNotification]);

  // Inventory Module
  const notifyStockLow = useCallback((itemName: string, quantity: number) => {
    addNotification({
      title: 'Low Stock Alert',
      message: `${itemName} is running low (${quantity} remaining).`,
      type: 'warning',
      module: 'inventory',
      action: { label: 'View Stock', path: '/inventory' },
    });
  }, [addNotification]);

  const notifyStockTransferred = useCallback((itemName: string, from: string, to: string) => {
    addNotification({
      title: 'Stock Transferred',
      message: `${itemName} transferred from ${from} to ${to}.`,
      type: 'info',
      module: 'inventory',
    });
  }, [addNotification]);

  const notifyStockAdjusted = useCallback((itemName: string) => {
    addNotification({
      title: 'Stock Adjusted',
      message: `Stock for ${itemName} has been adjusted.`,
      type: 'info',
      module: 'inventory',
    });
  }, [addNotification]);

  const notifyPurchaseOrderCreated = useCallback((poNumber: string, supplierName: string) => {
    addNotification({
      title: 'Purchase Order Created',
      message: `PO ${poNumber} created for ${supplierName}.`,
      type: 'success',
      module: 'inventory',
      action: { label: 'View Orders', path: '/inventory' },
    });
  }, [addNotification]);

  // Voucher Module
  const notifyVoucherCreated = useCallback((voucherType: string, voucherNumber: string) => {
    addNotification({
      title: `${voucherType} Voucher Created`,
      message: `Voucher ${voucherNumber} has been saved.`,
      type: 'success',
      module: 'vouchers',
      action: { label: 'View Vouchers', path: '/vouchers' },
    });
  }, [addNotification]);

  // Expense Module
  const notifyExpenseAdded = useCallback((category: string, amount: number) => {
    addNotification({
      title: 'Expense Recorded',
      message: `${category} expense of $${amount.toFixed(2)} has been recorded.`,
      type: 'info',
      module: 'expenses',
    });
  }, [addNotification]);

  const notifyExpenseApproved = useCallback((expenseId: string) => {
    addNotification({
      title: 'Expense Approved',
      message: `Expense ${expenseId} has been approved.`,
      type: 'success',
      module: 'expenses',
    });
  }, [addNotification]);

  // Customer/Supplier Module
  const notifyCustomerAdded = useCallback((customerName: string) => {
    addNotification({
      title: 'Customer Added',
      message: `${customerName} has been added to your customers.`,
      type: 'success',
      module: 'manage',
      action: { label: 'View Customers', path: '/manage' },
    });
  }, [addNotification]);

  const notifySupplierAdded = useCallback((supplierName: string) => {
    addNotification({
      title: 'Supplier Added',
      message: `${supplierName} has been added to your suppliers.`,
      type: 'success',
      module: 'manage',
    });
  }, [addNotification]);

  // Settings Module
  const notifyUserCreated = useCallback((userName: string) => {
    addNotification({
      title: 'User Created',
      message: `User account for ${userName} has been created.`,
      type: 'success',
      module: 'settings',
    });
  }, [addNotification]);

  const notifySettingsSaved = useCallback((section: string) => {
    addNotification({
      title: 'Settings Saved',
      message: `${section} settings have been updated.`,
      type: 'success',
      module: 'settings',
    });
  }, [addNotification]);

  const notifyBackupCreated = useCallback(() => {
    addNotification({
      title: 'Backup Created',
      message: 'System backup has been created successfully.',
      type: 'success',
      module: 'settings',
    });
  }, [addNotification]);

  // Accounting Module
  const notifyJournalEntryCreated = useCallback((entryNumber: string) => {
    addNotification({
      title: 'Journal Entry Created',
      message: `Journal entry ${entryNumber} has been recorded.`,
      type: 'success',
      module: 'accounting',
    });
  }, [addNotification]);

  const notifyAccountCreated = useCallback((accountName: string) => {
    addNotification({
      title: 'Account Created',
      message: `Account "${accountName}" added to chart of accounts.`,
      type: 'success',
      module: 'accounting',
    });
  }, [addNotification]);

  // General Notifications
  const notifyError = useCallback((message: string) => {
    addNotification({
      title: 'Error',
      message,
      type: 'error',
    });
  }, [addNotification]);

  const notifySuccess = useCallback((title: string, message: string) => {
    addNotification({
      title,
      message,
      type: 'success',
    });
  }, [addNotification]);

  const notifyWarning = useCallback((title: string, message: string) => {
    addNotification({
      title,
      message,
      type: 'warning',
    });
  }, [addNotification]);

  const notifyInfo = useCallback((title: string, message: string) => {
    addNotification({
      title,
      message,
      type: 'info',
    });
  }, [addNotification]);

  return {
    // Parts
    notifyPartCreated,
    notifyPartUpdated,
    notifyKitCreated,
    // Sales
    notifyInvoiceCreated,
    notifyQuotationSent,
    notifyDeliveryDispatched,
    notifyPaymentReceived,
    // Inventory
    notifyStockLow,
    notifyStockTransferred,
    notifyStockAdjusted,
    notifyPurchaseOrderCreated,
    // Vouchers
    notifyVoucherCreated,
    // Expenses
    notifyExpenseAdded,
    notifyExpenseApproved,
    // Customers/Suppliers
    notifyCustomerAdded,
    notifySupplierAdded,
    // Settings
    notifyUserCreated,
    notifySettingsSaved,
    notifyBackupCreated,
    // Accounting
    notifyJournalEntryCreated,
    notifyAccountCreated,
    // General
    notifyError,
    notifySuccess,
    notifyWarning,
    notifyInfo,
  };
};
