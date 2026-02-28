import { useEffect, useRef, useCallback } from 'react';
import { useNotifications } from '@/contexts/NotificationContext';
import { apiClient } from '@/lib/api';

interface UndeliveredAlert {
  invoiceId: string;
  invoiceNo: string;
  customerName: string;
  customerType: 'walking' | 'registered';
  invoiceDate: string;
  totalItems: number;
  totalOrdered: number;
  totalDelivered: number;
  totalPending: number;
  items: Array<{
    itemId: string;
    partNo: string;
    description: string;
    orderedQty: number;
    deliveredQty: number;
    pendingQty: number;
  }>;
}

interface AlertsResponse {
  count: number;
  alerts: UndeliveredAlert[];
}

// Track which alerts have already been notified
const notifiedAlertsKey = 'undelivered-alerts-notified';

export const useUndeliveredStockAlerts = () => {
  const { addNotification } = useNotifications();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get previously notified alerts from localStorage
  const getNotifiedAlerts = useCallback((): string[] => {
    try {
      const stored = localStorage.getItem(notifiedAlertsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }, []);

  // Save notified alerts to localStorage
  const saveNotifiedAlerts = useCallback((alertIds: string[]) => {
    try {
      // Keep only last 50 notified alerts to prevent storage overflow
      const trimmed = alertIds.slice(-50);
      localStorage.setItem(notifiedAlertsKey, JSON.stringify(trimmed));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const checkForAlerts = useCallback(async () => {
    try {
      const response = (await apiClient.getUndeliveredStockAlerts()) as AlertsResponse;
      
      if (!response || !response.alerts || response.alerts.length === 0) {
        return;
      }

      const notifiedAlerts = getNotifiedAlerts();
      const newNotifiedAlerts = [...notifiedAlerts];

      response.alerts.forEach((alert) => {
        // Create unique alert ID based on invoice and pending quantity
        const alertId = `${alert.invoiceId}-${alert.totalPending}`;
        
        // Skip if already notified for this exact pending state
        if (notifiedAlerts.includes(alertId)) {
          return;
        }

        // Determine notification type based on customer type
        const customerTypeLabel = alert.customerType === 'walking' ? 'Walking Customer' : 'Registered Customer';
        const notificationType = alert.customerType === 'walking' ? 'warning' : 'error';
        
        // Create notification title and message
        const title = `Undelivered Stock - ${customerTypeLabel}`;
        const message = `${alert.customerName} has ${alert.totalPending} item(s) pending delivery in invoice ${alert.invoiceNo}. Total ${alert.totalOrdered - alert.totalDelivered} qty not delivered.`;

        // Add notification
        addNotification({
          title,
          message,
          type: notificationType,
          module: 'sales',
          action: {
            label: 'View Invoice',
            path: `/sales/invoices?id=${alert.invoiceId}`,
          },
        });

        // Mark as notified
        newNotifiedAlerts.push(alertId);
      });

      // Save updated notified alerts list
      saveNotifiedAlerts(newNotifiedAlerts);
    } catch (error) {
      // Silently fail - don't break the app if alerts fail
      console.error('Failed to check for undelivered alerts:', error);
    }
  }, [addNotification, getNotifiedAlerts, saveNotifiedAlerts]);

  useEffect(() => {
    // Check immediately on mount
    checkForAlerts();

    // Check every 5 minutes
    intervalRef.current = setInterval(checkForAlerts, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [checkForAlerts]);
};

export default useUndeliveredStockAlerts;
