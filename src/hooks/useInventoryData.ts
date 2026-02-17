import { useState, useEffect, createContext, useContext } from 'react';
import { apiClient } from '@/lib/api';

export interface Part {
  id: string;
  partNo: string;
  brand: string;
  uom: string;
  cost: number | null;
  price: number | null;
  stock: number;
}

export interface Kit {
  id: string;
  name: string;
  badge?: string;
  itemsCount: number;
  totalCost: number;
  price: number;
}

export interface Supplier {
  id: string;
  code: string;
  companyName: string;
  status: "active" | "inactive";
}

export interface Category {
  id: string;
  name: string;
  count?: number;
}

// Initial data - starts empty
const initialParts: Part[] = [];

const initialKits: Kit[] = [];

const initialSuppliers: Supplier[] = [];

const initialCategories: Category[] = [];

const STORAGE_KEYS = {
  parts: 'inventory-parts',
  kits: 'inventory-kits',
  suppliers: 'inventory-suppliers',
  categories: 'inventory-categories',
};

// Helper to load from localStorage
const loadFromStorage = <T>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
};

// Helper to save to localStorage
const saveToStorage = <T>(key: string, data: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
  }
};

export interface InventoryDataContextType {
  parts: Part[];
  kits: Kit[];
  suppliers: Supplier[];
  categories: Category[];
  addPart: (part: Part) => void;
  updatePart: (part: Part) => void;
  deletePart: (id: string) => void;
  addKit: (kit: Kit) => void;
  updateKit: (kit: Kit) => void;
  deleteKit: (id: string) => void;
  addSupplier: (supplier: Supplier) => void;
  updateSupplier: (supplier: Supplier) => void;
  deleteSupplier: (id: string) => void;
  addCategory: (category: Category) => void;
  updateCategory: (category: Category) => void;
  deleteCategory: (id: string) => void;
}

const InventoryDataContext = createContext<InventoryDataContextType | undefined>(undefined);

export const useInventoryData = () => {
  const context = useContext(InventoryDataContext);
  if (!context) {
    throw new Error('useInventoryData must be used within InventoryDataProvider');
  }
  return context;
};

// For use in dashboard without provider
export const useInventoryStats = () => {
  const [stats, setStats] = useState({
    partsCount: 0,
    kitsCount: 0,
    suppliersCount: 0,
    categoriesCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch all counts in parallel - use limit: 1 to get pagination info efficiently
      const [partsResponse, categoriesResponse, kitsResponse, suppliersResponse] = await Promise.all([
        apiClient.getParts({ limit: 1, page: 1 }).catch(() => ({ data: [], pagination: { total: 0 } })),
        apiClient.getAllCategories().catch(() => ({ data: [] })),
        apiClient.getKits({ limit: 1, page: 1 }).catch(() => ({ data: [], pagination: { total: 0 } })),
        apiClient.getSuppliers({ limit: 1, page: 1 }).catch(() => ({ data: [], pagination: { total: 0 } })),
      ]);

      // Extract counts from responses - prefer pagination.total for accurate counts
      let partsCount = 0;
      if (partsResponse.pagination && typeof partsResponse.pagination.total === 'number') {
        partsCount = partsResponse.pagination.total;
      } else if (Array.isArray(partsResponse.data)) {
        partsCount = partsResponse.data.length;
      } else if (Array.isArray(partsResponse)) {
        partsCount = partsResponse.length;
      }

      let categoriesCount = 0;
      if (Array.isArray(categoriesResponse.data)) {
        categoriesCount = categoriesResponse.data.length;
      } else if (Array.isArray(categoriesResponse)) {
        categoriesCount = categoriesResponse.length;
      }

      let kitsCount = 0;
      if (kitsResponse.pagination && typeof kitsResponse.pagination.total === 'number') {
        kitsCount = kitsResponse.pagination.total;
      } else if (Array.isArray(kitsResponse.data)) {
        kitsCount = kitsResponse.data.length;
      } else if (Array.isArray(kitsResponse)) {
        kitsCount = kitsResponse.length;
      }

      let suppliersCount = 0;
      // For suppliers, fetch active ones separately to get accurate count
      const activeSuppliersResponse = await apiClient.getSuppliers({ limit: 1, page: 1, status: 'active' }).catch(() => ({ data: [], pagination: { total: 0 } }));
      if (activeSuppliersResponse.pagination && typeof activeSuppliersResponse.pagination.total === 'number') {
        suppliersCount = activeSuppliersResponse.pagination.total;
      } else if (Array.isArray(activeSuppliersResponse.data)) {
        suppliersCount = activeSuppliersResponse.data.length;
      } else if (Array.isArray(activeSuppliersResponse)) {
        suppliersCount = activeSuppliersResponse.length;
      }

      setStats({
        partsCount,
        kitsCount,
        suppliersCount,
        categoriesCount,
      });
    } catch (error: any) {
      // Keep existing stats on error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);

    // Listen for custom events to refresh stats
    const handleInventoryUpdate = () => {
      fetchStats();
    };

    window.addEventListener('inventory-updated', handleInventoryUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('inventory-updated', handleInventoryUpdate);
    };
  }, []);

  return { ...stats, loading, refresh: fetchStats };
};

export { InventoryDataContext, loadFromStorage, saveToStorage, STORAGE_KEYS, initialParts, initialKits, initialSuppliers, initialCategories };
