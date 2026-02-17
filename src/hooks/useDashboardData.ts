import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/api';

export interface DashboardStats {
  totalParts: number;
  categoriesCount: number;
  activeKits: number;
  suppliersCount: number;
}

export interface InventoryChartData {
  month: string;
  value: number;
}

export interface OrderStatusData {
  draft: number;
  pending: number;
  approved: number;
  received: number;
  total: number;
}

export interface DashboardData { 
  stats: DashboardStats;
  inventoryChartData: InventoryChartData[];
  orderStatus: OrderStatusData;
  loading: boolean;
  error: string | null;
} 

export const useDashboardData = (timeRange: 'Week' | 'Month' | 'Year' = 'Month') => {
  const [data, setData] = useState<DashboardData>({
    stats: {
      totalParts: 0,
      categoriesCount: 0,
      activeKits: 0,
      suppliersCount: 0,
    },
    inventoryChartData: [],
    orderStatus: {
      draft: 0,
      pending: 0,
      approved: 0,
      received: 0,
      total: 0,
    },
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setData(prev => ({ ...prev, loading: true, error: null }));

        // Fetch dashboard stats
        const dashboardResponse = await apiClient.getInventoryDashboard();
        if (dashboardResponse.error) {
          throw new Error(dashboardResponse.error);
        }

        // Handle both wrapped and unwrapped responses
        const dashboardData = dashboardResponse.data || dashboardResponse || {};
        
        // Fetch purchase orders for status breakdown
        const ordersResponse = await apiClient.getPurchaseOrders({ limit: 1000 });
        if (ordersResponse.error) {
          throw new Error(ordersResponse.error);
        }

        // Handle both wrapped and unwrapped responses
        const orders = (ordersResponse.data?.data || ordersResponse.data || ordersResponse) || [];
        
        // Count orders by status
        const orderStatus = {
          draft: orders.filter((o: any) => o.status === 'Draft').length,
          pending: orders.filter((o: any) => o.status === 'Pending').length,
          approved: orders.filter((o: any) => o.status === 'Approved').length,
          received: orders.filter((o: any) => o.status === 'Received').length,
          total: orders.length,
        };

        // Get stock movement data from dashboard response or fetch separately
        let chartData: InventoryChartData[] = [];
        
        // Use stockMovementData from dashboard if available
        if (dashboardData.charts?.stockMovementData) {
          const stockData = dashboardData.charts.stockMovementData;
          
          if (timeRange === 'Month') {
            // Use the last 12 months from stockMovementData
            // Backend returns 6 months, so we'll show those and pad with zeros for full year
            const now = new Date();
            const monthlyData: Record<string, number> = {};
            
            // Initialize last 12 months
            for (let i = 11; i >= 0; i--) {
              const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
              monthlyData[monthKey] = 0;
            }
            
            // Fill in actual data from backend
            // Backend format: "Jan 2024" or "Jan", extract just the month part
            stockData.forEach((item: any) => {
              const monthStr = item.month || '';
              // Extract month abbreviation (first 3 chars)
              const monthKey = monthStr.split(' ')[0].substring(0, 3);
              if (monthlyData.hasOwnProperty(monthKey)) {
                monthlyData[monthKey] = item.stockIn || 0;
              }
            });
            
            chartData = Object.entries(monthlyData).map(([month, value]) => ({
              month,
              value,
            }));
          } else {
            // For Week and Year, we need to fetch movements and process
            const movementsResponse = await apiClient.getStockMovements({ limit: 10000 });
            const movements = (movementsResponse.data?.data || movementsResponse.data || movementsResponse) || [];

            if (timeRange === 'Week') {
              // Weekly data for last 12 weeks
              const weeklyData: Record<string, number> = {};
              const now = new Date();
              
              // Initialize last 12 weeks
              for (let i = 11; i >= 0; i--) {
                const date = new Date(now);
                date.setDate(date.getDate() - (i * 7));
                const weekKey = `W${i + 1}`;
                weeklyData[weekKey] = 0;
              }

              // Process movements
              movements.forEach((movement: any) => {
                if (movement.type === 'in') {
                  const date = new Date(movement.createdAt || movement.created_at);
                  const weekAgo = Math.floor((now.getTime() - date.getTime()) / (7 * 24 * 60 * 60 * 1000));
                  if (weekAgo >= 0 && weekAgo < 12) {
                    const weekKey = `W${12 - weekAgo}`;
                    if (weeklyData.hasOwnProperty(weekKey)) {
                      weeklyData[weekKey] += movement.quantity || 0;
                    }
                  }
                }
              });

              chartData = Object.entries(weeklyData).map(([month, value]) => ({
                month,
                value,
              }));
            } else if (timeRange === 'Year') {
              // Yearly data for last 5 years
              const yearlyData: Record<string, number> = {};
              const now = new Date();
              
              // Initialize last 5 years
              for (let i = 4; i >= 0; i--) {
                const year = now.getFullYear() - i;
                yearlyData[year.toString()] = 0;
              }

              // Process movements
              movements.forEach((movement: any) => {
                if (movement.type === 'in') {
                  const date = new Date(movement.createdAt || movement.created_at);
                  const year = date.getFullYear().toString();
                  if (yearlyData.hasOwnProperty(year)) {
                    yearlyData[year] += movement.quantity || 0;
                  }
                }
              });

              chartData = Object.entries(yearlyData).map(([month, value]) => ({
                month,
                value,
              }));
            }
          }
        } else {
          // Fallback: fetch movements if not in dashboard response
          const movementsResponse = await apiClient.getStockMovements({ limit: 10000 });
          const movements = (movementsResponse.data?.data || movementsResponse.data || movementsResponse) || [];

          if (timeRange === 'Month') {
            // Monthly data for last 12 months
            const monthlyData: Record<string, number> = {};
            const now = new Date();
            
            // Initialize last 12 months
            for (let i = 11; i >= 0; i--) {
              const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
              const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
              monthlyData[monthKey] = 0;
            }

            // Process movements
            movements.forEach((movement: any) => {
              if (movement.type === 'in') {
                const date = new Date(movement.createdAt || movement.created_at);
                const monthKey = date.toLocaleDateString('en-US', { month: 'short' });
                if (monthlyData.hasOwnProperty(monthKey)) {
                  monthlyData[monthKey] += movement.quantity || 0;
                }
              }
            });

            chartData = Object.entries(monthlyData).map(([month, value]) => ({
              month,
              value,
            }));
          }
        }

        setData({
          stats: {
            totalParts: dashboardData.totalParts || 0,
            categoriesCount: dashboardData.categoriesCount || 0,
            activeKits: 0, // Kits model doesn't exist in schema
            suppliersCount: 0, // Suppliers model doesn't exist in schema
          },
          inventoryChartData: chartData,
          orderStatus,
          loading: false,
          error: null,
        });
      } catch (error: any) {
        setData(prev => ({
          ...prev,
          loading: false,
          error: error.message || 'Failed to fetch dashboard data',
        }));
      }
    };

    fetchDashboardData();
  }, [timeRange]);

  return data;
};

