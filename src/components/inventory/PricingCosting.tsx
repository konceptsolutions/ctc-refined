import { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import {
  FileText,
  Tag,
  RefreshCw,
  Target,
  TrendingUp,
  Package,
  DollarSign,
  AlertTriangle,
  Download,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Percent,
  History,
  Eye,
  Clock,
  User,
  Calendar,
  Loader2,
} from "lucide-react";

// Sample data for pricing items
interface PriceItem {
  id: string;
  partNo: string;
  partNoAlt?: string;
  description: string;
  category: string;
  subcategory?: string; // Sub category field
  brand: string;
  avgPrice: number;
  lastPurchasePrice: number;
  cost: number;
  newCost: number | ""; // Allow empty string - no auto-fill
  priceA: number;
  newPriceA: number | ""; // Allow empty string - no auto-fill
  priceB: number;
  newPriceB: number | ""; // Allow empty string - no auto-fill
  priceM: number;
  newPriceM: number | ""; // Allow empty string for Price M when not set
  quantity: number;
  selected: boolean;
  modified: boolean;
  lastUpdated?: {
    timestamp: string;
    date: string;
    time: string;
    amount: {
      cost?: number;
      priceA?: number;
      priceB?: number;
      priceM?: number;
    };
    previousPrice?: {
      cost?: number;
      priceA?: number;
      priceB?: number;
      priceM?: number;
    };
  };
  createdAt?: string; // Creation date and time
  update_price_m_fix?: boolean; // Internal flag for Price M fix
}

const sampleItems: PriceItem[] = [];

// Price levels data
interface PriceLevel {
  id: string;
  name: string;
  description: string;
  markup: number;
  customerType: string;
  itemCount: number;
}

const priceLevels: PriceLevel[] = [];

// Landed cost entries
interface LandedCostEntry {
  id: string;
  poNumber: string;
  date: string;
  supplier: string;
  itemCount: number;
  invoiceValue: number;
  freight: number;
  customs: number;
  insurance: number;
  handling: number;
  totalLanded: number;
  status: "pending" | "calculated" | "applied";
}

const landedCostEntries: LandedCostEntry[] = [];

// Price history interface
interface PriceHistoryEntry {
  id: string;
  itemId: string;
  partNo: string;
  description: string;
  date: string;
  time: string;
  updatedBy: string;
  reason: string;
  updateType: "individual" | "bulk" | "margin";
  changes: {
    field: string;
    oldValue: number;
    newValue: number;
  }[];
}

const samplePriceHistory: PriceHistoryEntry[] = [];

export const PricingCosting = () => {
  const [activeTab, setActiveTab] = useState("price-updating");
  const [items, setItems] = useState<PriceItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterSubCategory, setFilterSubCategory] = useState("all");
  const [filterBrand, setFilterBrand] = useState("all");
  const [filterUpdateStatus, setFilterUpdateStatus] = useState<
    "all" | "updated" | "non-updated"
  >("all");
  const [filterZeroPrice, setFilterZeroPrice] = useState<
    "all" | "price-a-zero" | "price-b-zero" | "any-zero"
  >("all");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<
    "new-to-old" | "old-to-new" | "none"
  >("none");
  const [priceUpdateMode, setPriceUpdateMode] = useState<
    "individual" | "group"
  >("individual");
  const [currentPage, setCurrentPage] = useState(1);
  const [updateReason, setUpdateReason] = useState("");
  const [showNewLandedCost, setShowNewLandedCost] = useState(false);
  const [showSetMargins, setShowSetMargins] = useState(false);
  const [showBulkPercentage, setShowBulkPercentage] = useState(false);
  const [priceHistory, setPriceHistory] = useState<PriceHistoryEntry[]>([]);
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyFilterType, setHistoryFilterType] = useState<
    "all" | "individual" | "bulk" | "margin"
  >("all");
  const [showItemHistory, setShowItemHistory] = useState(false);
  const [selectedItemForHistory, setSelectedItemForHistory] =
    useState<PriceItem | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showUpdatePopup, setShowUpdatePopup] = useState(false);
  const [selectedItemForUpdate, setSelectedItemForUpdate] =
    useState<PriceItem | null>(null);
  const [showPriceUpdateHistory, setShowPriceUpdateHistory] = useState(false);
  const [selectedPriceUpdateItem, setSelectedPriceUpdateItem] =
    useState<PriceItem | null>(null);
  const [showModifiedItems, setShowModifiedItems] = useState(false);
  const [showAllItems, setShowAllItems] = useState(false); // Toggle to show all items without pagination
  const historyPerPage = 10;
  const itemsPerPage = 100; // Increased from 25 to 100 for better performance with large datasets

  // Profitability tab filters
  const [profitabilitySearch, setProfitabilitySearch] = useState("");
  const [profitabilityCategory, setProfitabilityCategory] = useState("all");
  const [profitabilitySubCategory, setProfitabilitySubCategory] =
    useState("all");
  const [profitabilityMarginFilter, setProfitabilityMarginFilter] = useState<
    "all" | "profit" | "loss"
  >("all");
  const [profitabilityMinMargin, setProfitabilityMinMargin] =
    useState<string>("");
  const [profitabilityMaxMargin, setProfitabilityMaxMargin] =
    useState<string>("");
  const [profitabilityPage, setProfitabilityPage] = useState(1);
  const profitabilityItemsPerPage = 25;

  // Bulk percentage adjustment state
  const [bulkPercentage, setBulkPercentage] = useState({
    percentage: 0,
    adjustmentType: "increase" as "increase" | "decrease",
    applyToCost: false,
    applyToPriceA: true,
    applyToPriceB: true,
    applyToPriceM: true,
  });

  // New landed cost form state
  const [newLandedCost, setNewLandedCost] = useState({
    poNumber: "",
    supplier: "",
    invoiceValue: 0,
    freight: 0,
    customs: 0,
    insurance: 0,
    handling: 0,
  });

  // Margin settings state
  const [marginSettings, setMarginSettings] = useState({
    minMargin: 10,
    targetMargin: 25,
    maxMargin: 50,
    applyTo: "all",
  });

  // Track current request to prevent multiple simultaneous calls
  const fetchPartsAbortRef = useRef<AbortController | null>(null);
  const isInitialMount = useRef(true);
  const lastFetchParams = useRef<string>("");

  // Check for part number from DPO page on mount
  useEffect(() => {
    const partNoFromDPO = localStorage.getItem("pricingCostingSearchPartNo");
    if (partNoFromDPO) {
      setSearchTerm(partNoFromDPO);
      setActiveTab("price-updating");
      // Clear the stored part number after using it
      localStorage.removeItem("pricingCostingSearchPartNo");
      // Force refetch by resetting lastFetchParams to ensure fresh data
      lastFetchParams.current = "";
      // Force reset isInitialMount to trigger fresh fetch
      isInitialMount.current = true;
      // Trigger immediate fetch for fresh data after DPO receive (with force refresh)
      setTimeout(() => {
        fetchParts(0, true); // Force refresh to bypass cache
      }, 100);
    }
  }, []);

  // Refetch when window gains focus (user returns to tab/window)
  useEffect(() => {
    const handleFocus = () => {
      lastFetchParams.current = "";
      if (activeTab === "price-updating" || activeTab === "profitability") {
        fetchParts();
      }
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [activeTab]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    filterCategory,
    filterSubCategory,
    filterBrand,
    filterUpdateStatus,
    filterZeroPrice,
    filterStartDate,
    filterEndDate,
    sortOrder,
  ]);

  // Fetch parts data - optimized for fast initial load
  useEffect(() => {
    if (activeTab === "price-updating" || activeTab === "profitability") {
      // Cancel previous request if still pending
      if (fetchPartsAbortRef.current) {
        fetchPartsAbortRef.current.abort();
      }

      // Create a key for current fetch parameters
      const currentParams = `${activeTab}-${searchTerm}-${filterCategory}-${filterSubCategory}-${filterBrand}-${currentPage}`;

      // On initial mount, fetch immediately without debounce
      if (isInitialMount.current) {
        isInitialMount.current = false;
        lastFetchParams.current = currentParams;
        fetchParts();
        return;
      }

      // Skip if params haven't changed
      if (currentParams === lastFetchParams.current) {
        return;
      }

      // For subsequent changes (search/filter), debounce to prevent rapid API calls
      const timeoutId = setTimeout(
        () => {
          lastFetchParams.current = currentParams;
          fetchParts();
        },
        searchTerm ? 300 : 150,
      ); // Shorter debounce for better responsiveness

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [
    activeTab,
    searchTerm,
    filterCategory,
    filterSubCategory,
    filterBrand,
    currentPage,
  ]);

  // Fetch price history
  useEffect(() => {
    if (activeTab === "price-history") {
      fetchPriceHistory();
    }
  }, [activeTab, historyPage]);

  const fetchParts = async (retryCount = 0, forceRefresh = false) => {
    // If forceRefresh is true, bypass cache check
    if (forceRefresh) {
      lastFetchParams.current = "";
    }
    const maxRetries = 2;

    try {
      // Only set loading on first attempt to avoid UI flicker during retries
      if (retryCount === 0) {
        setLoading(true);
      }
      const params: any = {
        page: 1,
        limit: 1000000, // Very high limit to fetch all items - backend will handle efficiently
      };

      if (searchTerm) {
        // Use general search for partial matching (works with 2+ characters)
        // This will search across part_no, master_part_no, description, brand, etc.
        params.search = searchTerm.trim();
      }

      if (filterCategory !== "all") {
        params.category_name = filterCategory;
      }

      if (filterSubCategory !== "all") {
        params.subcategory_name = filterSubCategory;
      }

      if (filterBrand !== "all") {
        params.brand_name = filterBrand;
      }

      // Add date filters (time filters removed)
      if (filterStartDate) {
        params.created_from = `${filterStartDate}T00:00:00`;
      }
      if (filterEndDate) {
        params.created_to = `${filterEndDate}T23:59:59`;
      }

      // Add cache-busting timestamp to ensure fresh data (especially after DPO receive)
      params._t = Date.now();

      // Validate params before sending
      const cleanParams: any = {
        page: params.page || 1,
        limit: params.limit || 1000000, // Very high default limit to fetch all items
        _t: params._t, // Include cache-busting timestamp
      };

      // Only add non-empty, non-"all" values
      if (params.search && params.search.trim()) {
        cleanParams.search = params.search.trim();
      }
      if (params.category_name && params.category_name !== "all") {
        cleanParams.category_name = params.category_name;
      }
      if (params.subcategory_name && params.subcategory_name !== "all") {
        cleanParams.subcategory_name = params.subcategory_name;
      }
      if (params.brand_name && params.brand_name !== "all") {
        cleanParams.brand_name = params.brand_name;
      }
      if (params.created_from) {
        cleanParams.created_from = params.created_from;
      }
      if (params.created_to) {
        cleanParams.created_to = params.created_to;
      }

      // Use getPartsForPriceManagement to get data with price history
      // Add timeout and retry logic for 502 errors
      let response;
      try {
        if (process.env.NODE_ENV === "development") {
        }
        response = (await Promise.race([
          apiClient.getPartsForPriceManagement(cleanParams),
          new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("Request timeout")), 60000), // 60 second timeout for large datasets
          ),
        ])) as any;

        if (process.env.NODE_ENV === "development") {
        }
      } catch (timeoutError: any) {
        if (timeoutError?.message === "Request timeout") {
          throw new Error(
            "Request timed out. Please try again with a more specific search.",
          );
        }
        if (process.env.NODE_ENV === "development") {
        }
        throw timeoutError;
      }

      // Check for 502 errors and retry with exponential backoff
      const responseError = response?.error || (response as any)?.error;
      const responseStatus = (response as any)?.status;
      const is502Error =
        responseStatus === 502 ||
        String(responseError || "").includes("502") ||
        String(responseError || "").includes("Bad Gateway");

      if (is502Error) {
        if (retryCount < maxRetries) {
          await new Promise((resolve) =>
            setTimeout(resolve, 1000 * (retryCount + 1)),
          ); // Exponential backoff
          return fetchParts(retryCount + 1);
        } else {
          // Only show error on final failure
          if (process.env.NODE_ENV === "development") {
          }
          toast({
            title: "Server Error",
            description:
              "Unable to fetch parts. The server may be overloaded. Please try again in a moment.",
            variant: "destructive",
          });
          setItems([]);
          return;
        }
      }

      // Handle other errors gracefully
      if (response?.error && !is502Error) {
        if (process.env.NODE_ENV === "development") {
        }
        toast({
          title: "Error",
          description:
            response.error || "Unable to fetch parts. Please try again.",
          variant: "destructive",
        });
        setItems([]);
        setLoading(false);
        return;
      }

      // Check if response is null or undefined
      if (!response) {
        if (process.env.NODE_ENV === "development") {
        }
        toast({
          title: "Error",
          description:
            "No response from server. Please check if the backend is running.",
          variant: "destructive",
        });
        setItems([]);
        setLoading(false);
        return;
      }

      // Check if response is HTML (502 Bad Gateway often returns HTML)
      const responseStr =
        typeof response === "string" ? response : String(response || "");
      if (responseStr.includes("<!DOCTYPE") || responseStr.includes("<html")) {
        if (process.env.NODE_ENV === "development") {
        }
        toast({
          title: "Server Error",
          description:
            "Backend server is temporarily unavailable. Please try again in a moment.",
          variant: "destructive",
        });
        setItems([]);
        setLoading(false);
        return;
      }

      // Handle response data - check multiple possible structures
      const responseData = response?.data;
      let data: any[] = [];

      // Check if response has an error property first
      if (response?.error) {
        throw new Error(response.error);
      }

      // Handle different response structures
      if (Array.isArray(responseData)) {
        data = responseData;
      } else if (responseData && Array.isArray(responseData.data)) {
        data = responseData.data;
      } else if (Array.isArray(response)) {
        // Sometimes the API might return the array directly
        data = response;
      } else if (
        responseData &&
        typeof responseData === "object" &&
        !Array.isArray(responseData)
      ) {
        // Check if responseData has a data property that's an array
        if (Array.isArray(responseData.data)) {
          data = responseData.data;
        } else if (responseData.items && Array.isArray(responseData.items)) {
          data = responseData.items;
        } else if (
          responseData.results &&
          Array.isArray(responseData.results)
        ) {
          data = responseData.results;
        } else {
          // If responseData is an object but not an array, log and show error
          if (process.env.NODE_ENV === "development") {
          }
          toast({
            title: "Error",
            description:
              "Invalid response format from server. Expected array of parts.",
            variant: "destructive",
          });
          setItems([]);
          setLoading(false);
          return;
        }
      } else if (!responseData && !Array.isArray(response)) {
        // If response.data is undefined and response is not an array, log and show error
        if (process.env.NODE_ENV === "development") {
        }
        toast({
          title: "Error",
          description: "No data received from server. Please try again.",
          variant: "destructive",
        });
        setItems([]);
        setLoading(false);
        return;
      }

      if (Array.isArray(data)) {
        // Preserve lastUpdated info from existing items - optimized with early return
        const existingItemsMap = new Map(
          items.map((item) => [item.id, item.lastUpdated]),
        );

        // Cache localStorage read - only check once per fetch
        let localStoragePriceUpdates: any = {};
        try {
          const priceUpdatedItemsStr =
            localStorage.getItem("priceUpdatedItems");
          if (priceUpdatedItemsStr) {
            const priceUpdatedItems = JSON.parse(priceUpdatedItemsStr);
            const now = Date.now(); // Use timestamp for faster comparison

            // Convert localStorage data to lastUpdated format - optimized
            for (const itemId in priceUpdatedItems) {
              const updateInfo = priceUpdatedItems[itemId];
              if (!updateInfo?.timestamp) continue;

              const updateTime = new Date(updateInfo.timestamp).getTime();
              const hoursSinceUpdate = (now - updateTime) / (1000 * 60 * 60);

              // Only include if updated within last 24 hours
              if (hoursSinceUpdate < 24) {
                localStoragePriceUpdates[itemId] = {
                  timestamp: updateInfo.timestamp,
                  date:
                    updateInfo.date ||
                    new Date(updateTime).toLocaleDateString(),
                  time:
                    updateInfo.time ||
                    new Date(updateTime).toLocaleTimeString(),
                  amount: updateInfo.amount || {},
                  previousPrice: updateInfo.previousPrice || {},
                };
              }
            }
          }
        } catch (error) {
          // Silently handle localStorage errors in production
          if (process.env.NODE_ENV === "development") {
          }
        }

        // Deduplication logic removed to show all items as requested by user
        const displayData = data;

        const priceItems: PriceItem[] = displayData.map((item: any) => {
          const priceM = item.price_m ?? item.priceM ?? null;
          // Check existing items first, then API response, then localStorage
          let latestFromApi = null;
          if (item.lastUpdated?.timestamp) {
            const updateTime = new Date(item.lastUpdated.timestamp).getTime();
            const now = Date.now();
            if ((now - updateTime) / (1000 * 60 * 60) < 24) {
              latestFromApi = item.lastUpdated;
            }
          }

          const existingLastUpdated =
            existingItemsMap.get(item.id) ||
            latestFromApi ||
            localStoragePriceUpdates[item.id];

          // SWAPPED: partNo shows master_part_no (actual Part No), not part_no (Master Part No)
          // Get master_part_no directly from API response
          const partNoValue = (
            item.master_part_no ||
            item.partNo ||
            ""
          ).trim();

          return {
            id: item.id,
            partNo: partNoValue,
            partNoAlt: (item.part_no || "").trim(),
            description: item.description || "",
            category: item.category_name || item.category || "Uncategorized",
            subcategory: item.subcategory_name || item.subcategory || "",
            brand: item.brand_name || item.brand || "Unknown",
            avgPrice: item.avgCost ?? 0,
            lastPurchasePrice: item.purchasePrice ?? 0,
            cost: item.cost || 0,
            newCost: "", // No auto-fill - empty by default
            priceA: item.price_a ?? item.priceA ?? 0,
            newPriceA: "", // No auto-fill - empty by default
            priceB: item.price_b ?? item.priceB ?? 0,
            newPriceB: "", // No auto-fill - empty by default
            priceM: priceM ?? 0, // Display value - show 0 if null
            newPriceM: "", // No auto-fill - empty by default
            quantity: Number(
              item.qty ?? item.stock ?? item.current_stock ?? 0,
            ),
            selected: false,
            modified: false,
            lastUpdated: existingLastUpdated, // Preserve lastUpdated info from existing items or localStorage
            createdAt: (() => {
              // Defer expensive date formatting - only parse if needed
              const createdDate =
                item.created_at ||
                item.createdAt ||
                item.created_at_date ||
                item.createdAt_date;
              if (createdDate) {
                try {
                  // Use faster parsing - just return ISO string, format when displaying
                  const date = new Date(createdDate);
                  if (!isNaN(date.getTime())) {
                    // Return formatted only if valid - cache the date object
                    return date.toLocaleString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                  }
                } catch {
                  // Ignore date parsing errors for performance
                }
              }
              return undefined;
            })(),
          };
        });
        setItems(priceItems);
      } else {
        setItems([]);
      }
      setLoading(false);
    } catch (error: any) {
      // Always clear loading state
      setLoading(false);

      if (process.env.NODE_ENV === "development") {
      }

      // Handle different types of errors
      const errorMsg = String(error?.message || "");
      const errorStatus = error?.status || error?.response?.status;

      // Check for 502 Bad Gateway errors
      const is502Error =
        errorStatus === 502 ||
        errorMsg.includes("502") ||
        errorMsg.includes("Bad Gateway") ||
        errorMsg.includes("temporarily unavailable");

      // Check for network errors
      const isNetworkError =
        errorMsg.includes("Failed to fetch") ||
        errorMsg.includes("NetworkError") ||
        errorMsg.includes("network") ||
        errorMsg.includes("fetch");

      // Check for timeout errors
      const isTimeoutError =
        errorMsg.includes("timeout") ||
        errorMsg.includes("Request timeout") ||
        errorMsg.includes("timed out");

      // Check for server errors (5xx)
      const isServerError = errorStatus >= 500 && errorStatus < 600;

      // Retry logic for retryable errors
      if ((is502Error || isServerError) && retryCount < maxRetries) {
        // Retry on server errors with exponential backoff
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * (retryCount + 1)),
        );
        return fetchParts(retryCount + 1);
      } else {
        // Show appropriate error message based on error type
        if (is502Error || isServerError) {
          toast({
            title: "Server Error",
            description:
              "Backend server is temporarily unavailable. Please try again in a moment.",
            variant: "destructive",
          });
        } else if (isNetworkError) {
          toast({
            title: "Network Error",
            description:
              "Unable to connect to the server. Please check your internet connection and try again.",
            variant: "destructive",
          });
        } else if (isTimeoutError) {
          toast({
            title: "Request Timeout",
            description:
              "The request took too long. Please try with more specific filters or try again later.",
            variant: "destructive",
          });
        } else {
          // Generic error message with more details if available
          const errorDescription =
            error?.response?.data?.error ||
            error?.error ||
            errorMsg ||
            "Failed to fetch parts data. Please try again.";

          toast({
            title: "Error",
            description: errorDescription,
            variant: "destructive",
          });
        }
        setItems([]);
      }
    }
  };

  const fetchPriceHistory = async () => {
    try {
      setHistoryLoading(true);
      const response = await apiClient.getPriceHistory({
        page: historyPage,
        limit: 100,
      });
      const data = response.data || [];

      if (Array.isArray(data)) {
        const historyItems: PriceHistoryEntry[] = data.map((item: any) => {
          const dateObj = new Date(item.date);
          // Determine update type
          let updateType: "individual" | "bulk" | "margin" = "individual";
          const updateTypeStr = String(item.updateType || "");
          if (updateTypeStr.includes("Percentage")) {
            updateType = "bulk";
          } else if (updateTypeStr.includes("Fixed")) {
            updateType = "bulk";
          } else if (item.itemsUpdated && item.itemsUpdated > 1) {
            updateType = "bulk";
          }

          // SWAPPED: partNo shows master_part_no (actual Part No), not part_no (Master Part No)
          // Prioritize master_part_no directly
          return {
            id: item.id,
            itemId: item.partId || item.part?.id || "",
            partNo: (
              item.part?.master_part_no ||
              item.master_part_no ||
              ""
            ).trim(),
            description: item.part?.description || item.description || "",
            date: dateObj.toLocaleDateString(),
            time: dateObj.toLocaleTimeString(),
            updatedBy: item.updatedBy || "System",
            reason: item.reason || "",
            updateType: updateType,
            changes: [
              {
                field: item.priceField || "priceA",
                oldValue: 0,
                newValue: item.value || 0,
              },
            ],
          };
        });
        setPriceHistory(historyItems);
      } else {
        setPriceHistory([]);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch price history",
        variant: "destructive",
      });
      setPriceHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Calculate statistics
  const totalStockValue = items.reduce(
    (sum, item) => sum + item.priceA * item.quantity,
    0,
  );
  const totalAvgValue = items.reduce(
    (sum, item) => sum + item.avgPrice * item.quantity,
    0,
  );
  const potentialProfit = totalStockValue - totalAvgValue;
  const profitMargin =
    totalAvgValue > 0 ? (potentialProfit / totalAvgValue) * 100 : 0;

  const itemsWithPrice = items.filter((item) => item.priceA > 0);
  const avgMargin =
    itemsWithPrice.length > 0
      ? itemsWithPrice.reduce((sum, item) => {
        const margin =
          item.cost > 0 ? ((item.priceA - item.cost) / item.cost) * 100 : 0;
        return sum + margin;
      }, 0) / itemsWithPrice.length
      : 0;

  const lowMarginItems = items.filter((item) => {
    if (item.cost === 0 || item.priceA === 0) return false;
    const margin = ((item.priceA - item.cost) / item.cost) * 100;
    return margin < 10;
  });

  const nopriceItems = items.filter((item) => item.priceA === 0);
  const normalMarginItems = items.filter((item) => {
    if (item.cost === 0 || item.priceA === 0) return false;
    const margin = ((item.priceA - item.cost) / item.cost) * 100;
    return margin >= 10 && margin <= 50;
  });
  const highMarginItems = items.filter((item) => {
    if (item.cost === 0 || item.priceA === 0) return false;
    const margin = ((item.priceA - item.cost) / item.cost) * 100;
    return margin > 50;
  });

  const categories = useMemo(() => {
    const cats = [
      "all",
      ...new Set(items.map((item) => item.category).filter(Boolean)),
    ];
    return cats;
  }, [items]);

  const brands = useMemo(() => {
    const brs = [
      "all",
      ...new Set(items.map((item) => item.brand).filter(Boolean)),
    ];
    return brs;
  }, [items]);

  const subcategories = useMemo(() => {
    const subs = [
      "all",
      ...new Set(items.map((item) => item.subcategory).filter(Boolean)),
    ];
    return subs;
  }, [items]);

  // Filter items - memoized for performance
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const partNoStr = String(item.partNo || "");
      const descriptionStr = String(item.description || "");
      const searchTermStr = String(searchTerm || "");
      const matchesSearch =
        partNoStr.toLowerCase().includes(searchTermStr.toLowerCase()) ||
        descriptionStr.toLowerCase().includes(searchTermStr.toLowerCase());
      const matchesCategory =
        filterCategory === "all" || item.category === filterCategory;
      const matchesSubCategory =
        filterSubCategory === "all" || item.subcategory === filterSubCategory;
      const matchesBrand = filterBrand === "all" || item.brand === filterBrand;
      const matchesUpdateStatus =
        filterUpdateStatus === "all"
          ? true
          : filterUpdateStatus === "updated"
            ? Boolean(item.lastUpdated)
            : !item.lastUpdated;

      // Zero price filter - show items where Price A, Price B, or both are zero
      const priceAIsZero = (item.priceA ?? 0) === 0;
      const priceBIsZero = (item.priceB ?? 0) === 0;
      const matchesZeroPrice =
        filterZeroPrice === "all"
          ? true
          : filterZeroPrice === "price-a-zero"
            ? priceAIsZero
            : filterZeroPrice === "price-b-zero"
              ? priceBIsZero
              : filterZeroPrice === "any-zero"
                ? priceAIsZero || priceBIsZero
                : true;

      // Date filter - check if item's createdAt or lastUpdated date falls within the range (time filters removed)
      let matchesDate = true;
      if (filterStartDate || filterEndDate) {
        // Use createdAt if available, otherwise use lastUpdated timestamp
        const dateToCheck = item.createdAt
          ? new Date(item.createdAt)
          : item.lastUpdated?.timestamp
            ? new Date(item.lastUpdated.timestamp)
            : null;

        if (dateToCheck && !isNaN(dateToCheck.getTime())) {
          try {
            if (filterStartDate) {
              let startDateTime = new Date(filterStartDate);
              startDateTime.setHours(0, 0, 0, 0);
              if (dateToCheck < startDateTime) {
                matchesDate = false;
              }
            }

            if (filterEndDate) {
              let endDateTime = new Date(filterEndDate);
              endDateTime.setHours(23, 59, 59, 999);
              if (dateToCheck > endDateTime) {
                matchesDate = false;
              }
            }
          } catch (error) {
            matchesDate = false;
          }
        } else {
          // If no date available and date filter is active, exclude from results
          matchesDate = false;
        }
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesSubCategory &&
        matchesBrand &&
        matchesUpdateStatus &&
        matchesZeroPrice &&
        matchesDate
      );
    });
  }, [
    items,
    searchTerm,
    filterCategory,
    filterSubCategory,
    filterBrand,
    filterUpdateStatus,
    filterZeroPrice,
    filterStartDate,
    filterEndDate,
  ]);

  // Sort filtered items
  const sortedItems = useMemo(() => {
    if (sortOrder === "none") {
      return filteredItems;
    }

    const sorted = [...filteredItems].sort((a, b) => {
      const hasDateA = a.lastUpdated?.timestamp ? true : false;
      const hasDateB = b.lastUpdated?.timestamp ? true : false;

      // Items without dates go to the end
      if (!hasDateA && !hasDateB) return 0;
      if (!hasDateA) return 1; // a goes after b
      if (!hasDateB) return -1; // b goes after a

      const dateA = new Date(a.lastUpdated!.timestamp).getTime();
      const dateB = new Date(b.lastUpdated!.timestamp).getTime();

      if (sortOrder === "new-to-old") {
        return dateB - dateA; // Newest first (descending)
      } else {
        return dateA - dateB; // Oldest first (ascending)
      }
    });

    return sorted;
  }, [filteredItems, sortOrder]);

  const profitabilityFilteredItems = useMemo(() => {
    const searchLower = profitabilitySearch.trim().toLowerCase();

    const filtered = items.filter((item) => {
      const price = Number(item.priceA || 0);
      const avgPrice = Number(item.avgPrice || 0);
      const profit = price - avgPrice;
      const margin = avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : null;

      if (searchLower) {
        const haystack = [
          item.partNo,
          item.partNoAlt || "",
          item.description,
          item.brand,
          item.category,
          item.subcategory || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }

      if (profitabilityCategory !== "all" && item.category !== profitabilityCategory) {
        return false;
      }
      if (
        profitabilitySubCategory !== "all" &&
        item.subcategory !== profitabilitySubCategory
      ) {
        return false;
      }

      if (profitabilityMarginFilter === "profit" && profit <= 0) return false;
      if (profitabilityMarginFilter === "loss" && profit >= 0) return false;

      if (profitabilityMinMargin) {
        const min = parseFloat(profitabilityMinMargin);
        if (!Number.isNaN(min) && (margin === null || margin < min)) return false;
      }
      if (profitabilityMaxMargin) {
        const max = parseFloat(profitabilityMaxMargin);
        if (!Number.isNaN(max) && (margin === null || margin > max)) return false;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const marginA =
        a.cost > 0
          ? ((Number(a.priceA || 0) - Number(a.cost || 0)) / Number(a.cost || 0)) *
            100
          : Number.NEGATIVE_INFINITY;
      const marginB =
        b.cost > 0
          ? ((Number(b.priceA || 0) - Number(b.cost || 0)) / Number(b.cost || 0)) *
            100
          : Number.NEGATIVE_INFINITY;
      return marginB - marginA;
    });
  }, [
    items,
    profitabilitySearch,
    profitabilityCategory,
    profitabilitySubCategory,
    profitabilityMarginFilter,
    profitabilityMinMargin,
    profitabilityMaxMargin,
  ]);

  const profitabilityTotalPages = Math.max(
    1,
    Math.ceil(profitabilityFilteredItems.length / profitabilityItemsPerPage),
  );
  const profitabilityPaginatedItems = useMemo(() => {
    const startIdx = (profitabilityPage - 1) * profitabilityItemsPerPage;
    return profitabilityFilteredItems.slice(
      startIdx,
      startIdx + profitabilityItemsPerPage,
    );
  }, [profitabilityFilteredItems, profitabilityItemsPerPage, profitabilityPage]);

  useEffect(() => {
    if (profitabilityPage > profitabilityTotalPages) {
      setProfitabilityPage(profitabilityTotalPages);
    }
  }, [profitabilityPage, profitabilityTotalPages]);

  // Pagination - show all items if showAllItems is true
  const totalPages = showAllItems
    ? 1
    : Math.ceil(sortedItems.length / itemsPerPage);
  const startIndex = showAllItems ? 0 : (currentPage - 1) * itemsPerPage;
  const paginatedItems = showAllItems
    ? sortedItems
    : sortedItems.slice(startIndex, startIndex + itemsPerPage);

  // Selected and modified counts
  const selectedCount = items.filter((item) => item.selected).length;
  const modifiedCount = items.filter((item) => item.modified).length; // Items with unsaved changes

  // Count items that have been updated (have lastUpdated or localStorage entry)
  const updatedCount = useMemo(() => {
    let count = 0;
    try {
      const priceUpdatedItems = JSON.parse(
        localStorage.getItem("priceUpdatedItems") || "{}",
      );
      items.forEach((item) => {
        // Check if item has lastUpdated field
        if (item.lastUpdated) {
          count++;
        } else if (priceUpdatedItems[item.id]) {
          // Check localStorage for price updates
          const localStorageData = priceUpdatedItems[item.id];
          const hasLocalAmount =
            localStorageData.amount &&
            Object.keys(localStorageData.amount || {}).length > 0;
          const hasLocalPrevious =
            localStorageData.previousPrice &&
            Object.keys(localStorageData.previousPrice || {}).length > 0;
          if (hasLocalAmount || hasLocalPrevious) {
            count++;
          }
        }
      });
    } catch (error) {
      // Fallback to counting items with lastUpdated field
      count = items.filter((item) => item.lastUpdated).length;
    }
    return count;
  }, [items]);

  const formatCurrency = (value: number) => {
    return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Handle individual price changes
  const handlePriceChange = (
    id: string,
    field: "newCost" | "newPriceA" | "newPriceB" | "newPriceM",
    value: number | "",
  ) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const updated = { ...item, [field]: value };
          // Check if modified - empty strings are considered unchanged
          const newCostNum =
            typeof updated.newCost === "string" ? item.cost : updated.newCost;
          const newPriceANum =
            typeof updated.newPriceA === "string"
              ? item.priceA
              : updated.newPriceA;
          const newPriceBNum =
            typeof updated.newPriceB === "string"
              ? item.priceB
              : updated.newPriceB;
          const newPriceMNum =
            typeof updated.newPriceM === "string" ? 0 : updated.newPriceM;
          updated.modified =
            (typeof updated.newCost !== "string" &&
              updated.newCost !== item.cost) ||
            (typeof updated.newPriceA !== "string" &&
              updated.newPriceA !== item.priceA) ||
            (typeof updated.newPriceB !== "string" &&
              updated.newPriceB !== item.priceB) ||
            (typeof updated.newPriceM !== "string" &&
              newPriceMNum !== item.priceM);
          return updated;
        }
        return item;
      }),
    );
  };

  // Handle checkbox selection
  const handleSelectItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item,
      ),
    );
  };

  const handleSelectAll = () => {
    const allSelected = paginatedItems.every((item) => item.selected);
    const ids = paginatedItems.map((item) => item.id);
    setItems((prev) =>
      prev.map((item) =>
        ids.includes(item.id) ? { ...item, selected: !allSelected } : item,
      ),
    );
  };

  // Reset changes
  const handleReset = () => {
    setItems((prev) =>
      prev.map((item) => ({
        ...item,
        newCost: "", // Reset to empty - no auto-fill
        newPriceA: "", // Reset to empty - no auto-fill
        newPriceB: "", // Reset to empty - no auto-fill
        newPriceM: "", // Reset to empty - no auto-fill
        modified: false,
        selected: false,
      })),
    );
    setUpdateReason("");
    toast({
      title: "Changes Reset",
      description: "All price changes have been reset.",
    });
  };

  // Handle single item update
  const handleUpdateSingleItem = async (item: PriceItem) => {
    // Check if item has modifications - empty strings are not considered changes
    const newCostNum =
      typeof item.newCost === "string" ? item.cost : item.newCost;
    const newPriceANum =
      typeof item.newPriceA === "string" ? item.priceA : item.newPriceA;
    const newPriceBNum =
      typeof item.newPriceB === "string" ? item.priceB : item.newPriceB;
    const newPriceMNum =
      typeof item.newPriceM === "string" ? 0 : item.newPriceM;

    const hasChanges =
      (typeof item.newCost !== "string" && item.newCost !== item.cost) ||
      (typeof item.newPriceA !== "string" && item.newPriceA !== item.priceA) ||
      (typeof item.newPriceB !== "string" && item.newPriceB !== item.priceB) ||
      (typeof item.newPriceM !== "string" && newPriceMNum !== item.priceM);

    if (!hasChanges) {
      toast({
        title: "No Changes",
        description: "No changes detected for this item.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const priceUpdates: any = {};
      const updatedAmounts: any = {};

      if (typeof item.newCost !== "string" && item.newCost !== item.cost) {
        priceUpdates.cost = item.newCost;
        updatedAmounts.cost = item.newCost;
      }
      if (
        typeof item.newPriceA !== "string" &&
        item.newPriceA !== item.priceA
      ) {
        priceUpdates.priceA = item.newPriceA;
        updatedAmounts.priceA = item.newPriceA;
      }
      if (
        typeof item.newPriceB !== "string" &&
        item.newPriceB !== item.priceB
      ) {
        priceUpdates.priceB = item.newPriceB;
        updatedAmounts.priceB = item.newPriceB;
      }
      const newPriceMValue =
        typeof item.newPriceM === "string" && item.newPriceM === ""
          ? null
          : typeof item.newPriceM === "number"
            ? item.newPriceM
            : 0;
      if (
        typeof item.newPriceM !== "string" &&
        newPriceMValue !== item.priceM
      ) {
        priceUpdates.priceM = newPriceMValue;
        updatedAmounts.priceM = newPriceMValue;
      }

      if (Object.keys(priceUpdates).length > 0) {
        await apiClient.updatePartPrices(item.id, {
          ...priceUpdates,
          reason: updateReason.trim() || "Individual price update",
          updated_by: "User",
        });
      }

      // Store ALL previous prices (before updating) - store complete price history
      const previousPrice: any = {
        cost: item.cost, // Always store the previous cost
        priceA: item.priceA, // Always store the previous priceA
        priceB: item.priceB, // Always store the previous priceB
        priceM: item.priceM, // Always store the previous priceM
      };

      // Update the item with last update info
      const now = new Date();
      const updatedItem: PriceItem = {
        ...item,
        cost: typeof item.newCost !== "string" ? item.newCost : item.cost,
        priceA:
          typeof item.newPriceA !== "string" ? item.newPriceA : item.priceA,
        update_price_m_fix: true, // Internal flag
        priceB:
          typeof item.newPriceB !== "string" ? item.newPriceB : item.priceB,
        priceM: newPriceMValue ?? 0,
        newCost: "", // Reset to empty after update
        newPriceA: "", // Reset to empty after update
        newPriceB: "", // Reset to empty after update
        newPriceM: "", // Reset to empty after update
        modified: false,
        lastUpdated: {
          timestamp: now.toISOString(),
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
          amount: updatedAmounts,
          previousPrice: previousPrice,
        },
      };

      setItems((prev) => prev.map((i) => (i.id === item.id ? updatedItem : i)));

      // Store price update info in localStorage for Items List page and to survive page refresh
      try {
        const priceUpdatedItems = JSON.parse(
          localStorage.getItem("priceUpdatedItems") || "{}",
        );
        priceUpdatedItems[item.id] = {
          timestamp: now.toISOString(),
          date: now.toLocaleDateString(),
          time: now.toLocaleTimeString(),
          partNo: item.partNo,
          amount: updatedAmounts, // Store updated amounts for popup
          previousPrice: previousPrice, // Store ALL previous prices for popup
        };
        localStorage.setItem(
          "priceUpdatedItems",
          JSON.stringify(priceUpdatedItems),
        );

        // Dispatch custom event to notify other components
        window.dispatchEvent(
          new CustomEvent("priceUpdated", {
            detail: { itemId: item.id, partNo: item.partNo },
          }),
        );
      } catch (error) { }

      toast({
        title: "Item Updated",
        description: `${item.partNo} updated successfully.`,
      });

      // Don't refresh immediately - we've already updated the local state correctly
      // The lastUpdated field is preserved in the updatedItem we just set
      // If refresh is needed, it will happen naturally through other user actions
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Apply changes
  const handleApplyChanges = async () => {
    if (modifiedCount === 0) {
      toast({
        title: "No Changes",
        description: "There are no changes to apply.",
        variant: "destructive",
      });
      return;
    }

    if (!updateReason.trim()) {
      toast({
        title: "Reason Required",
        description: "Please provide a reason for the price update.",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      const modifiedItems = items.filter((item) => item.modified);

      // Update each modified item
      const updatePromises = modifiedItems.map(async (item) => {
        const priceUpdates: any = {};

        // Only update if the field is not empty (not a string) and different from current
        if (typeof item.newCost !== "string" && item.newCost !== item.cost) {
          priceUpdates.cost = item.newCost;
        }
        if (
          typeof item.newPriceA !== "string" &&
          item.newPriceA !== item.priceA
        ) {
          priceUpdates.priceA = item.newPriceA;
        }
        if (
          typeof item.newPriceB !== "string" &&
          item.newPriceB !== item.priceB
        ) {
          priceUpdates.priceB = item.newPriceB;
        }
        // Handle newPriceM - convert empty string to null, otherwise use the numeric value
        const newPriceMValue =
          typeof item.newPriceM === "string" && item.newPriceM === ""
            ? null
            : typeof item.newPriceM === "number"
              ? item.newPriceM
              : 0;
        if (
          typeof item.newPriceM !== "string" &&
          newPriceMValue !== item.priceM
        ) {
          priceUpdates.priceM = newPriceMValue;
        }

        if (Object.keys(priceUpdates).length > 0) {
          return apiClient.updatePartPrices(item.id, {
            ...priceUpdates,
            reason: updateReason,
            updated_by: "User",
          });
        }

        return null;
      });

      await Promise.all(updatePromises.filter((p) => p !== null));

      // Refresh data
      await fetchParts();

      toast({
        title: "Changes Applied",
        description: `${modifiedCount} item(s) updated successfully.`,
      });
      setUpdateReason("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply changes. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Export data
  const handleExport = () => {
    const headers = [
      "Part No",
      "Description",
      "Category",
      "Cost",
      "Price A",
      "Price B",
      "Price M",
      "Margin %",
    ];
    const csvContent = [
      headers.join(","),
      ...items.map((item) => {
        const margin =
          item.avgPrice > 0
            ? (((item.priceA - item.avgPrice) / item.avgPrice) * 100).toFixed(2)
            : "0";
        return [
          item.partNo,
          item.description,
          item.category,
          item.cost,
          item.priceA,
          item.priceB,
          item.priceM,
          margin,
        ].join(",");
      }),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pricing_report.csv";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Pricing report exported successfully.",
    });
  };

  // Handle new landed cost
  const handleSaveLandedCost = () => {
    const total =
      newLandedCost.invoiceValue +
      newLandedCost.freight +
      newLandedCost.customs +
      newLandedCost.insurance +
      newLandedCost.handling;

    toast({
      title: "Landed Cost Calculated",
      description: `Total landed cost: ${formatCurrency(total)}`,
    });
    setShowNewLandedCost(false);
    setNewLandedCost({
      poNumber: "",
      supplier: "",
      invoiceValue: 0,
      freight: 0,
      customs: 0,
      insurance: 0,
      handling: 0,
    });
  };

  // Handle set margins
  const handleApplyMargins = async () => {
    try {
      setLoading(true);
      const targetMargin = marginSettings.targetMargin / 100; // Convert to decimal
      const itemsToUpdate =
        marginSettings.applyTo === "all"
          ? items
          : items.filter((item) => item.category === marginSettings.applyTo);

      const updatePromises = itemsToUpdate.map(async (item) => {
        if (item.cost > 0) {
          const newPriceA = item.cost * (1 + targetMargin);
          const updates: any = {
            priceA: Math.round(newPriceA * 100) / 100,
            reason: `Margin target of ${marginSettings.targetMargin}% applied`,
            updated_by: "User",
          };
          return apiClient.updatePartPrices(item.id, updates);
        }
        return null;
      });

      await Promise.all(updatePromises.filter((p) => p !== null));
      await fetchParts();

      toast({
        title: "Margins Applied",
        description: `Target margin of ${marginSettings.targetMargin}% applied to ${itemsToUpdate.length} item(s).`,
      });
      setShowSetMargins(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to apply margins. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk percentage adjustment
  const handleApplyBulkPercentage = () => {
    const selectedItems = items.filter((item) => item.selected);

    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select items to apply the percentage adjustment.",
        variant: "destructive",
      });
      return;
    }

    if (bulkPercentage.percentage === 0) {
      toast({
        title: "Invalid Percentage",
        description: "Please enter a percentage value greater than 0.",
        variant: "destructive",
      });
      return;
    }

    const multiplier =
      bulkPercentage.adjustmentType === "increase"
        ? 1 + bulkPercentage.percentage / 100
        : 1 - bulkPercentage.percentage / 100;

    setItems((prev) =>
      prev.map((item) => {
        if (!item.selected) return item;

        const updated = {
          ...item,
          newCost: bulkPercentage.applyToCost
            ? Math.round(item.cost * multiplier * 100) / 100
            : item.newCost,
          newPriceA: bulkPercentage.applyToPriceA
            ? Math.round(item.priceA * multiplier * 100) / 100
            : item.newPriceA,
          newPriceB: bulkPercentage.applyToPriceB
            ? Math.round(item.priceB * multiplier * 100) / 100
            : item.newPriceB,
          newPriceM: bulkPercentage.applyToPriceM
            ? item.priceM > 0
              ? Math.round(item.priceM * multiplier * 100) / 100
              : ""
            : item.newPriceM,
        };

        // Check if modified - empty strings are not considered changes
        updated.modified =
          (typeof updated.newCost !== "string" &&
            updated.newCost !== updated.cost) ||
          (typeof updated.newPriceA !== "string" &&
            updated.newPriceA !== updated.priceA) ||
          (typeof updated.newPriceB !== "string" &&
            updated.newPriceB !== updated.priceB) ||
          (typeof updated.newPriceM !== "string" &&
            updated.newPriceM !== updated.priceM);

        return updated;
      }),
    );

    toast({
      title: "Bulk Adjustment Applied",
      description: `${bulkPercentage.percentage}% ${bulkPercentage.adjustmentType} applied to ${selectedItems.length} item(s).`,
    });

    setShowBulkPercentage(false);
    setBulkPercentage({
      percentage: 0,
      adjustmentType: "increase",
      applyToCost: false,
      applyToPriceA: true,
      applyToPriceB: true,
      applyToPriceM: true,
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/10 rounded-lg">
          <DollarSign className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Pricing & Costing
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage costs, pricing, margins, and profitability analysis
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-card border border-border">
          <TabsTrigger
            value="price-updating"
            className="gap-2 data-[state=active]:text-primary"
          >
            <RefreshCw className="w-4 h-4" />
            Price Updating
          </TabsTrigger>
          <TabsTrigger
            value="profitability"
            className="gap-2 data-[state=active]:text-primary"
          >
            <TrendingUp className="w-4 h-4" />
            Profitability
          </TabsTrigger>
        </TabsList>

        {/* Price Updating Tab */}
        <TabsContent value="price-updating" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-success/10 rounded-lg">
                <RefreshCw className="w-5 h-5 text-success" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Price Updating</h2>
                <p className="text-sm text-muted-foreground">
                  Update prices individually or by group (Category/Brand)
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  lastFetchParams.current = "";
                  fetchParts(0, true);
                }}
                className="gap-2"
                title="Refresh data (Ctrl+R)"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => setShowBulkPercentage(true)}
                className="gap-2"
                disabled={selectedCount === 0}
              >
                <Percent className="w-4 h-4" />
                Bulk % Adjust
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Total Items</p>
                <p className="text-2xl font-bold">{items.length}</p>
                {!showAllItems && sortedItems.length > itemsPerPage && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {itemsPerPage} per page • Use "Show All" to see all
                  </p>
                )}
                {showAllItems && (
                  <p className="text-xs text-success mt-1">
                    ✓ All {sortedItems.length} items displayed
                  </p>
                )}
              </CardContent>
            </Card>
            <Card className="border-success/50">
              <CardContent className="p-4">
                <p className="text-sm text-success">Selected</p>
                <p className="text-2xl font-bold text-success">
                  {selectedCount}
                </p>
              </CardContent>
            </Card>
            <Card
              className="border-warning/50 cursor-pointer hover:bg-warning/5 transition-colors"
              onClick={() => setShowModifiedItems(true)}
            >
              <CardContent className="p-4">
                <p className="text-sm text-warning">Modified</p>
                <p className="text-2xl font-bold text-warning">
                  {updatedCount}
                </p>
              </CardContent>
            </Card>
            <Card className="border-info/50">
              <CardContent className="p-4">
                <p className="text-sm text-info">Categories</p>
                <p className="text-2xl font-bold text-info">
                  {categories.length - 1}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Individual Price Editor */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <CardTitle className="text-base">
                  Individual Price Editor
                </CardTitle>
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search"
                      className="pl-9 w-40"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <Select
                    value={filterCategory}
                    onValueChange={setFilterCategory}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat === "all" ? "All Categories" : cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterSubCategory}
                    onValueChange={setFilterSubCategory}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Sub Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub === "all" ? "All Sub Categories" : sub}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterBrand} onValueChange={setFilterBrand}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Brands" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand === "all" ? "All Brands" : brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterUpdateStatus}
                    onValueChange={(value: any) => setFilterUpdateStatus(value)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Update Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="updated">Updated</SelectItem>
                      <SelectItem value="non-updated">Not Updated</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filterZeroPrice}
                    onValueChange={(value: any) => setFilterZeroPrice(value)}
                  >
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Zero Prices" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Prices</SelectItem>
                      <SelectItem value="price-a-zero">Price A is zero</SelectItem>
                      <SelectItem value="price-b-zero">Price B is zero</SelectItem>
                      <SelectItem value="any-zero">Price A and/or B is zero</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      From:
                    </label>
                    <Input
                      type="date"
                      className="w-40"
                      value={filterStartDate}
                      onChange={(e) => setFilterStartDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      To:
                    </label>
                    <Input
                      type="date"
                      className="w-40"
                      value={filterEndDate}
                      onChange={(e) => setFilterEndDate(e.target.value)}
                    />
                  </div>
                  <Select
                    value={sortOrder}
                    onValueChange={(
                      value: "new-to-old" | "old-to-new" | "none",
                    ) => setSortOrder(value)}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Sort By" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Sorting</SelectItem>
                      <SelectItem value="new-to-old">New to Old</SelectItem>
                      <SelectItem value="old-to-new">Old to New</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            paginatedItems.length > 0 &&
                            paginatedItems.every((item) => item.selected)
                          }
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>PART NO</TableHead>
                      <TableHead>DESCRIPTION</TableHead>
                      <TableHead>CATEGORY</TableHead>
                      <TableHead>BRAND</TableHead>
                      <TableHead className="text-right">AVG PRICE</TableHead>
                      <TableHead className="text-right">LAST PUR. PRICE</TableHead>
                      <TableHead className="text-right">COST</TableHead>
                      <TableHead className="text-center bg-primary/5">
                        NEW COST
                      </TableHead>
                      <TableHead className="text-right">PRICE A</TableHead>
                      <TableHead className="text-center bg-primary/5">
                        NEW A
                      </TableHead>
                      <TableHead className="text-right">PRICE B</TableHead>
                      <TableHead className="text-center bg-primary/5">
                        NEW B
                      </TableHead>
                      <TableHead className="text-right">PRICE M</TableHead>
                      <TableHead className="text-center bg-primary/5">
                        NEW M
                      </TableHead>
                      <TableHead className="text-center">ACTION</TableHead>
                      <TableHead className="text-center">STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={17} className="text-center py-8">
                          <div className="flex items-center justify-center">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            <span className="ml-2">Loading...</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : paginatedItems.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={17}
                          className="text-center py-8 text-muted-foreground"
                        >
                          No pricing data found
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedItems.map((item) => {
                        const hasChanges =
                          (typeof item.newCost !== "string" &&
                            item.newCost !== item.cost) ||
                          (typeof item.newPriceA !== "string" &&
                            item.newPriceA !== item.priceA) ||
                          (typeof item.newPriceB !== "string" &&
                            item.newPriceB !== item.priceB) ||
                          (typeof item.newPriceM !== "string" &&
                            item.newPriceM !== item.priceM);

                        return (
                          <TableRow
                            key={item.id}
                            className={item.modified ? "bg-warning/5" : ""}
                            data-part-id={item.id}
                          >
                            <TableCell>
                              <Checkbox
                                checked={item.selected}
                                onCheckedChange={() =>
                                  handleSelectItem(item.id)
                                }
                              />
                            </TableCell>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{item.partNo}</span>
                                {item.createdAt && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0.5 bg-muted/50 text-muted-foreground border-muted-foreground/20 flex items-center gap-1"
                                    title={`Created: ${item.createdAt}`}
                                  >
                                    <Clock className="w-2.5 h-2.5" />
                                    <span>{item.createdAt}</span>
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-32 truncate">
                              {item.description}
                            </TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell>{item.brand}</TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.avgPrice)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.lastPurchasePrice)}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {formatCurrency(item.cost)}
                            </TableCell>
                            <TableCell className="bg-primary/5">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.newCost === "" ? "" : item.newCost}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handlePriceChange(
                                    item.id,
                                    "newCost",
                                    val === "" ? "" : parseFloat(val) || 0,
                                  );
                                }}
                                className="w-24 h-8 text-center"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.priceA)}
                            </TableCell>
                            <TableCell className="bg-primary/5">
                              <Input
                                type="number"
                                step="0.01"
                                value={
                                  item.newPriceA === "" ? "" : item.newPriceA
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handlePriceChange(
                                    item.id,
                                    "newPriceA",
                                    val === "" ? "" : parseFloat(val) || 0,
                                  );
                                }}
                                className="w-24 h-8 text-center"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.priceB)}
                            </TableCell>
                            <TableCell className="bg-primary/5">
                              <Input
                                type="number"
                                step="0.01"
                                value={
                                  item.newPriceB === "" ? "" : item.newPriceB
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handlePriceChange(
                                    item.id,
                                    "newPriceB",
                                    val === "" ? "" : parseFloat(val) || 0,
                                  );
                                }}
                                className="w-24 h-8 text-center"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              {item.priceM > 0
                                ? formatCurrency(item.priceM)
                                : "Rs 0.00"}
                            </TableCell>
                            <TableCell className="bg-primary/5">
                              <Input
                                type="number"
                                step="0.01"
                                value={
                                  item.newPriceM === "" ? "" : item.newPriceM
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  handlePriceChange(
                                    item.id,
                                    "newPriceM",
                                    val === "" ? "" : parseFloat(val) || 0,
                                  );
                                }}
                                placeholder=""
                                className="w-24 h-8 text-center"
                              />
                            </TableCell>
                            <TableCell className="text-center">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleUpdateSingleItem(item)}
                                disabled={!hasChanges || loading}
                                className="gap-1"
                              >
                                Update
                              </Button>
                            </TableCell>
                            <TableCell className="text-center">
                              {(() => {
                                // Show badge if lastUpdated exists (item has been updated)
                                if (item.lastUpdated) {
                                  return (
                                    <Badge
                                      variant="outline"
                                      className="cursor-pointer bg-success/10 text-success border-success/30 hover:bg-success/20"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedPriceUpdateItem(item);
                                        setShowPriceUpdateHistory(true);
                                      }}
                                    >
                                      Price Updated
                                    </Badge>
                                  );
                                }

                                // Fallback: Check localStorage for price updates (survives page refresh)
                                try {
                                  const priceUpdatedItems = JSON.parse(
                                    localStorage.getItem("priceUpdatedItems") ||
                                    "{}",
                                  );
                                  if (priceUpdatedItems[item.id]) {
                                    const localStorageData =
                                      priceUpdatedItems[item.id];
                                    const hasLocalAmount =
                                      localStorageData.amount &&
                                      Object.keys(localStorageData.amount || {})
                                        .length > 0;
                                    const hasLocalPrevious =
                                      localStorageData.previousPrice &&
                                      Object.keys(
                                        localStorageData.previousPrice || {},
                                      ).length > 0;

                                    if (hasLocalAmount || hasLocalPrevious) {
                                      return (
                                        <Badge
                                          variant="outline"
                                          className="cursor-pointer bg-success/10 text-success border-success/30 hover:bg-success/20"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedPriceUpdateItem(item);
                                            setShowPriceUpdateHistory(true);
                                          }}
                                        >
                                          Price Updated
                                        </Badge>
                                      );
                                    }
                                  }
                                } catch (error) {
                                  // Ignore localStorage errors
                                }

                                return null;
                              })()}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination and Actions */}
              <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {showAllItems ? (
                    <span>Showing all {sortedItems.length} items</span>
                  ) : (
                    <>
                      Showing {startIndex + 1} to{" "}
                      {Math.min(startIndex + itemsPerPage, sortedItems.length)}{" "}
                      of {sortedItems.length}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                      >
                        Prev
                      </Button>
                      <span className="px-2 text-primary font-medium">
                        {currentPage} / {totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </>
                  )}
                  <Button
                    variant={showAllItems ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setShowAllItems(!showAllItems);
                      if (!showAllItems) {
                        setCurrentPage(1); // Reset to first page when enabling show all
                      }
                    }}
                    className="ml-2"
                    title={
                      showAllItems
                        ? "Switch to paginated view (100 items per page)"
                        : "Show all items at once (no pagination)"
                    }
                  >
                    {showAllItems
                      ? "Show Paginated"
                      : `Show All (${sortedItems.length})`}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Reason for update..."
                    value={updateReason}
                    onChange={(e) => setUpdateReason(e.target.value)}
                    className="w-48"
                  />
                  <Button variant="outline" onClick={handleReset}>
                    Reset
                  </Button>
                  <Button
                    onClick={handleApplyChanges}
                    disabled={modifiedCount === 0}
                  >
                    Apply {modifiedCount} Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Profitability Tab */}
        <TabsContent value="profitability" className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-success/10 rounded-lg">
              <TrendingUp className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Profitability Analysis</h2>
              <p className="text-sm text-muted-foreground">
                Analyze profit margins and revenue performance
              </p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">Gross Profit</p>
                <p className="text-2xl font-bold text-success">
                  {formatCurrency(potentialProfit)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {profitMargin.toFixed(1)}% margin
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Average Item Profit
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(potentialProfit / items.length)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">per item</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Best Margin Category
                </p>
                <p className="text-2xl font-bold text-primary">Electrical</p>
                <p className="text-xs text-muted-foreground mt-1">
                  35.7% avg margin
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">
                  Lowest Margin Category
                </p>
                <p className="text-2xl font-bold text-destructive">Misc</p>
                <p className="text-xs text-muted-foreground mt-1">
                  -45.0% avg margin
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Part No, Description..."
                      value={profitabilitySearch}
                      onChange={(e) => {
                        setProfitabilitySearch(e.target.value);
                        setProfitabilityPage(1);
                      }}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Category</Label>
                  <Select
                    value={profitabilityCategory}
                    onValueChange={(value) => {
                      setProfitabilityCategory(value);
                      setProfitabilitySubCategory("all"); // Reset subcategory when category changes
                      setProfitabilityPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Array.from(
                        new Set(items.map((item) => item.category)),
                      ).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Sub Category</Label>
                  <Select
                    value={profitabilitySubCategory}
                    onValueChange={(value) => {
                      setProfitabilitySubCategory(value);
                      setProfitabilityPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Sub Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sub Categories</SelectItem>
                      {Array.from(
                        new Set(
                          items
                            .filter(
                              (item) =>
                                profitabilityCategory === "all" ||
                                item.category === profitabilityCategory,
                            )
                            .map((item) => item.subcategory)
                            .filter((sub) => sub && sub.trim() !== ""),
                        ),
                      ).map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Profit/Loss</Label>
                  <Select
                    value={profitabilityMarginFilter}
                    onValueChange={(value: "all" | "profit" | "loss") => {
                      setProfitabilityMarginFilter(value);
                      setProfitabilityPage(1);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Items</SelectItem>
                      <SelectItem value="profit">Profit Only</SelectItem>
                      <SelectItem value="loss">Loss Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Min Margin %</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 10"
                    value={profitabilityMinMargin}
                    onChange={(e) => {
                      setProfitabilityMinMargin(e.target.value);
                      setProfitabilityPage(1);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">Max Margin %</Label>
                  <Input
                    type="number"
                    placeholder="e.g., 50"
                    value={profitabilityMaxMargin}
                    onChange={(e) => {
                      setProfitabilityMaxMargin(e.target.value);
                      setProfitabilityPage(1);
                    }}
                  />
                </div>
              </div>
              <div className="flex justify-end mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setProfitabilitySearch("");
                    setProfitabilityCategory("all");
                    setProfitabilitySubCategory("all");
                    setProfitabilityMarginFilter("all");
                    setProfitabilityMinMargin("");
                    setProfitabilityMaxMargin("");
                    setProfitabilityPage(1);
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Profitable Items */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Profitable Items</CardTitle>
                <div className="text-sm text-muted-foreground">
                  Showing {profitabilityFilteredItems.length}{" "}
                  items
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Part No</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead className="text-right">Avg Price</TableHead>
                    <TableHead className="text-right">Last Pur. Price</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">Profit/Unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8">
                        <div className="flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                          <span className="ml-2">Loading...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    (() => {
                      if (profitabilityPaginatedItems.length === 0) {
                        return (
                          <TableRow>
                            <TableCell
                              colSpan={10}
                              className="text-center text-muted-foreground py-8"
                            >
                              No items found matching the filters
                            </TableCell>
                          </TableRow>
                        );
                      }

                      return profitabilityPaginatedItems.map((item) => {
                        const price = Number(item.priceA || 0);
                        const avgPrice = Number(item.avgPrice || 0);
                        const margin =
                          avgPrice > 0 ? ((price - avgPrice) / avgPrice) * 100 : null;
                        const profit = price - avgPrice;
                        const isProfit = profit >= 0;

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                {item.partNo}
                                {item.createdAt && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 bg-muted/50 text-muted-foreground border-muted-foreground/20"
                                    title={`Created: ${item.createdAt}`}
                                  >
                                    <Clock className="w-2.5 h-2.5 mr-1" />
                                    {item.createdAt}
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell>{item.description}</TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell>{item.brand}</TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.avgPrice)}
                            </TableCell>
                            <TableCell className="text-right text-muted-foreground whitespace-nowrap">
                              {formatCurrency(item.lastPurchasePrice)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.cost)}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(item.priceA)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Badge
                                className={
                                  margin === null
                                    ? "bg-muted text-muted-foreground"
                                    : isProfit
                                    ? "bg-success text-success-foreground"
                                    : "bg-destructive text-destructive-foreground"
                                }
                              >
                                {margin === null ? "N/A" : `${margin.toFixed(1)}%`}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={`text-right font-medium ${isProfit ? "text-success" : "text-destructive"}`}
                            >
                              {formatCurrency(profit)}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })()
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {(() => {
                if (profitabilityTotalPages <= 1) return null;

                return (
                  <div className="flex items-center justify-between mt-4">
                    <div className="text-sm text-muted-foreground">
                      Page {profitabilityPage} of {profitabilityTotalPages}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setProfitabilityPage((p) => Math.max(1, p - 1))
                        }
                        disabled={profitabilityPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                        Prev
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setProfitabilityPage((p) =>
                            Math.min(profitabilityTotalPages, p + 1),
                          )
                        }
                        disabled={profitabilityPage === profitabilityTotalPages}
                      >
                        Next
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Category Profitability */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Category Profitability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.from(new Set(items.map((item) => item.category)))
                  .slice(0, 6)
                  .map((category) => {
                    const categoryItems = items.filter(
                      (item) =>
                        item.category === category &&
                        item.avgPrice > 0 &&
                        item.priceA > 0,
                    );
                    const avgMargin =
                      categoryItems.length > 0
                        ? categoryItems.reduce(
                          (sum, item) =>
                            sum +
                            ((item.priceA - item.avgPrice) / item.avgPrice) * 100,
                          0,
                        ) / categoryItems.length
                        : 0;
                    const totalProfit = categoryItems.reduce(
                      (sum, item) =>
                        sum + (item.priceA - item.avgPrice) * item.quantity,
                      0,
                    );

                    return (
                      <div
                        key={category}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{category}</p>
                          <p className="text-sm text-muted-foreground">
                            {categoryItems.length} items
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              Avg Margin
                            </p>
                            <p
                              className={`font-medium ${avgMargin >= 0 ? "text-success" : "text-destructive"}`}
                            >
                              {avgMargin.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">
                              Total Profit
                            </p>
                            <p
                              className={`font-medium ${totalProfit >= 0 ? "text-success" : "text-destructive"}`}
                            >
                              {formatCurrency(totalProfit)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Landed Cost Dialog */}
      <Dialog open={showNewLandedCost} onOpenChange={setShowNewLandedCost}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Landed Cost Calculation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>PO Number</Label>
                <Input
                  value={newLandedCost.poNumber}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      poNumber: e.target.value,
                    }))
                  }
                  placeholder="PO-2024-XXX"
                />
              </div>
              <div className="space-y-2">
                <Label>Supplier</Label>
                <Input
                  value={newLandedCost.supplier}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      supplier: e.target.value,
                    }))
                  }
                  placeholder="Supplier name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Invoice Value</Label>
              <Input
                type="number"
                value={newLandedCost.invoiceValue}
                onChange={(e) =>
                  setNewLandedCost((prev) => ({
                    ...prev,
                    invoiceValue: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Freight</Label>
                <Input
                  type="number"
                  value={newLandedCost.freight}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      freight: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Customs</Label>
                <Input
                  type="number"
                  value={newLandedCost.customs}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      customs: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Insurance</Label>
                <Input
                  type="number"
                  value={newLandedCost.insurance}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      insurance: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Handling</Label>
                <Input
                  type="number"
                  value={newLandedCost.handling}
                  onChange={(e) =>
                    setNewLandedCost((prev) => ({
                      ...prev,
                      handling: parseFloat(e.target.value) || 0,
                    }))
                  }
                />
              </div>
            </div>
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between">
                <span className="font-medium">Total Landed Cost:</span>
                <span className="font-bold text-primary">
                  {formatCurrency(
                    newLandedCost.invoiceValue +
                    newLandedCost.freight +
                    newLandedCost.customs +
                    newLandedCost.insurance +
                    newLandedCost.handling,
                  )}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowNewLandedCost(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveLandedCost}>Calculate & Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Margins Dialog */}
      <Dialog open={showSetMargins} onOpenChange={setShowSetMargins}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Margin Targets</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Target Margin (%)</Label>
              <Input
                type="number"
                value={marginSettings.targetMargin}
                onChange={(e) =>
                  setMarginSettings((prev) => ({
                    ...prev,
                    targetMargin: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Apply To</Label>
              <Select
                value={marginSettings.applyTo}
                onValueChange={(value) =>
                  setMarginSettings((prev) => ({ ...prev, applyTo: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  {categories
                    .filter((c) => c !== "all")
                    .map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSetMargins(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyMargins}>Apply Margins</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Percentage Adjustment Dialog */}
      <Dialog open={showBulkPercentage} onOpenChange={setShowBulkPercentage}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="w-5 h-5 text-primary" />
              Bulk Percentage Adjustment
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {selectedCount}
                </span>{" "}
                item(s) selected for adjustment
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Percentage (%)</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={bulkPercentage.percentage}
                  onChange={(e) =>
                    setBulkPercentage((prev) => ({
                      ...prev,
                      percentage: parseFloat(e.target.value) || 0,
                    }))
                  }
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Adjustment Type</Label>
                <Select
                  value={bulkPercentage.adjustmentType}
                  onValueChange={(value: "increase" | "decrease") =>
                    setBulkPercentage((prev) => ({
                      ...prev,
                      adjustmentType: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="increase">Increase ↑</SelectItem>
                    <SelectItem value="decrease">Decrease ↓</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label>Apply To</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="applyToCost"
                    checked={bulkPercentage.applyToCost}
                    onCheckedChange={(checked) =>
                      setBulkPercentage((prev) => ({
                        ...prev,
                        applyToCost: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="applyToCost"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Cost
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="applyToPriceA"
                    checked={bulkPercentage.applyToPriceA}
                    onCheckedChange={(checked) =>
                      setBulkPercentage((prev) => ({
                        ...prev,
                        applyToPriceA: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="applyToPriceA"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Price A
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="applyToPriceB"
                    checked={bulkPercentage.applyToPriceB}
                    onCheckedChange={(checked) =>
                      setBulkPercentage((prev) => ({
                        ...prev,
                        applyToPriceB: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="applyToPriceB"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Price B
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="applyToPriceM"
                    checked={bulkPercentage.applyToPriceM}
                    onCheckedChange={(checked) =>
                      setBulkPercentage((prev) => ({
                        ...prev,
                        applyToPriceM: !!checked,
                      }))
                    }
                  />
                  <Label
                    htmlFor="applyToPriceM"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Price M
                  </Label>
                </div>
              </div>
            </div>

            {bulkPercentage.percentage > 0 && (
              <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                <p className="text-sm">
                  <span className="font-medium">Preview:</span> Selected prices
                  will be{" "}
                  <span
                    className={
                      bulkPercentage.adjustmentType === "increase"
                        ? "text-success"
                        : "text-destructive"
                    }
                  >
                    {bulkPercentage.adjustmentType === "increase"
                      ? "increased"
                      : "decreased"}{" "}
                    by {bulkPercentage.percentage}%
                  </span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowBulkPercentage(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyBulkPercentage}
              disabled={selectedCount === 0}
            >
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Item Price History Dialog */}
      <Dialog open={showItemHistory} onOpenChange={setShowItemHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-info" />
              Price History - {selectedItemForHistory?.partNo}
            </DialogTitle>
          </DialogHeader>
          {selectedItemForHistory && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Part Number</p>
                    <p className="font-medium">
                      {selectedItemForHistory.partNo}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="font-medium">
                      {selectedItemForHistory.description}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Last Purchase Price
                    </p>
                    <p className="font-medium">
                      {formatCurrency(selectedItemForHistory.lastPurchasePrice)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Current Price A
                    </p>
                    <p className="font-medium">
                      {formatCurrency(selectedItemForHistory.priceA)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Updated By</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Changes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {priceHistory
                      .filter(
                        (h) =>
                          h.itemId === selectedItemForHistory.id ||
                          h.partNo === selectedItemForHistory.partNo,
                      )
                      .map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{entry.date}</span>
                              <span className="text-xs text-muted-foreground">
                                {entry.time}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-3 h-3 text-primary" />
                              </div>
                              {entry.updatedBy}
                            </div>
                          </TableCell>
                          <TableCell>{entry.reason}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {entry.changes.map((change, idx) => (
                                <span key={idx} className="text-xs">
                                  <span className="text-muted-foreground">
                                    {change.field}:
                                  </span>{" "}
                                  <span className="text-destructive line-through">
                                    {formatCurrency(change.oldValue)}
                                  </span>{" "}
                                  →{" "}
                                  <span className="text-success">
                                    {formatCurrency(change.newValue)}
                                  </span>
                                </span>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    {priceHistory.filter(
                      (h) => h.itemId === selectedItemForHistory.id,
                    ).length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={4}
                            className="text-center py-8 text-muted-foreground"
                          >
                            No price history for this item
                          </TableCell>
                        </TableRow>
                      )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItemHistory(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Last Update Info Popup */}
      <Dialog open={showUpdatePopup} onOpenChange={setShowUpdatePopup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-primary" />
              Last Update Information
            </DialogTitle>
          </DialogHeader>
          {selectedItemForUpdate && selectedItemForUpdate.lastUpdated && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="space-y-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Part Number</p>
                    <p className="font-medium">
                      {selectedItemForUpdate.partNo}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p className="font-medium text-sm">
                      {selectedItemForUpdate.description}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Last Updated Date
                    </span>
                  </div>
                  <span className="font-medium">
                    {selectedItemForUpdate.lastUpdated.date}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">
                      Last Updated Time
                    </span>
                  </div>
                  <span className="font-medium">
                    {selectedItemForUpdate.lastUpdated.time}
                  </span>
                </div>

                <div className="p-3 border rounded-lg bg-primary/5">
                  <p className="text-sm font-medium text-muted-foreground mb-2">
                    Last Updated Amounts:
                  </p>
                  <div className="space-y-2">
                    {selectedItemForUpdate.lastUpdated.amount.cost !==
                      undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Cost:</span>
                          <span className="font-medium">
                            {formatCurrency(
                              selectedItemForUpdate.lastUpdated.amount.cost,
                            )}
                          </span>
                        </div>
                      )}
                    {selectedItemForUpdate.lastUpdated.amount.priceA !==
                      undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price A:</span>
                          <span className="font-medium text-success">
                            {formatCurrency(
                              selectedItemForUpdate.lastUpdated.amount.priceA,
                            )}
                          </span>
                        </div>
                      )}
                    {selectedItemForUpdate.lastUpdated.amount.priceB !==
                      undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price B:</span>
                          <span className="font-medium text-success">
                            {formatCurrency(
                              selectedItemForUpdate.lastUpdated.amount.priceB,
                            )}
                          </span>
                        </div>
                      )}
                    {selectedItemForUpdate.lastUpdated.amount.priceM !==
                      undefined && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Price M:</span>
                          <span className="font-medium text-success">
                            {formatCurrency(
                              selectedItemForUpdate.lastUpdated.amount.priceM,
                            )}
                          </span>
                        </div>
                      )}
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpdatePopup(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price Update History Dialog */}
      <Dialog
        open={showPriceUpdateHistory}
        onOpenChange={setShowPriceUpdateHistory}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Price Update History
            </DialogTitle>
          </DialogHeader>
          {selectedPriceUpdateItem &&
            selectedPriceUpdateItem.lastUpdated &&
            (() => {
              // Get price data from lastUpdated or fallback to localStorage
              let amount = selectedPriceUpdateItem.lastUpdated.amount || {};
              let previousPrice =
                selectedPriceUpdateItem.lastUpdated.previousPrice || {};

              // Always check localStorage first as it has the most complete data
              try {
                const priceUpdatedItems = JSON.parse(
                  localStorage.getItem("priceUpdatedItems") || "{}",
                );
                if (priceUpdatedItems[selectedPriceUpdateItem.id]) {
                  const localStorageData =
                    priceUpdatedItems[selectedPriceUpdateItem.id];

                  // Use localStorage data if it exists (it's more complete)
                  if (
                    localStorageData.amount &&
                    Object.keys(localStorageData.amount).length > 0
                  ) {
                    amount = localStorageData.amount;
                  }
                  if (
                    localStorageData.previousPrice &&
                    Object.keys(localStorageData.previousPrice).length > 0
                  ) {
                    previousPrice = localStorageData.previousPrice;
                  }
                }
              } catch (error) { }

              // If still no new price data, use current item prices as fallback for "New Price"
              if (
                !amount ||
                Object.keys(amount).length === 0 ||
                !Object.values(amount).some(
                  (v: any) => v !== undefined && v !== null,
                )
              ) {
                amount = {
                  cost: selectedPriceUpdateItem.cost,
                  priceA: selectedPriceUpdateItem.priceA,
                  priceB: selectedPriceUpdateItem.priceB,
                  priceM: selectedPriceUpdateItem.priceM,
                };
              }

              const hasPreviousPrice =
                previousPrice &&
                Object.keys(previousPrice).length > 0 &&
                Object.values(previousPrice).some(
                  (v: any) => v !== undefined && v !== null,
                );
              const hasNewPrice =
                amount &&
                Object.keys(amount).length > 0 &&
                Object.values(amount).some(
                  (v: any) => v !== undefined && v !== null,
                );

              return (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded-lg">
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Part Number
                        </p>
                        <p className="font-medium">
                          {selectedPriceUpdateItem.partNo}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Description
                        </p>
                        <p className="font-medium text-sm">
                          {selectedPriceUpdateItem.description}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Updated Date
                        </span>
                      </div>
                      <span className="font-medium">
                        {selectedPriceUpdateItem.lastUpdated.date}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Updated Time
                        </span>
                      </div>
                      <span className="font-medium">
                        {selectedPriceUpdateItem.lastUpdated.time}
                      </span>
                    </div>

                    {hasPreviousPrice ? (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <p className="text-sm font-medium text-muted-foreground mb-3">
                          Previous Price (Before Update):
                        </p>
                        <div className="space-y-2">
                          {previousPrice.cost !== undefined &&
                            previousPrice.cost !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Cost:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.cost)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceA !== undefined &&
                            previousPrice.priceA !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price A:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceA)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceB !== undefined &&
                            previousPrice.priceB !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price B:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceB)}
                                </span>
                              </div>
                            )}
                          {previousPrice.priceM !== undefined &&
                            previousPrice.priceM !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price M:
                                </span>
                                <span className="font-medium">
                                  {formatCurrency(previousPrice.priceM)}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border rounded-lg bg-muted/50">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          Previous Price (Before Update):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No previous price data available
                        </p>
                      </div>
                    )}

                    {hasNewPrice ? (
                      <div className="p-3 border rounded-lg bg-primary/5">
                        <p className="text-sm font-medium text-muted-foreground mb-3">
                          New Price (After Update):
                        </p>
                        <div className="space-y-2">
                          {amount.cost !== undefined &&
                            amount.cost !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Cost:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.cost)}
                                </span>
                              </div>
                            )}
                          {amount.priceA !== undefined &&
                            amount.priceA !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price A:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceA)}
                                </span>
                              </div>
                            )}
                          {amount.priceB !== undefined &&
                            amount.priceB !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price B:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceB)}
                                </span>
                              </div>
                            )}
                          {amount.priceM !== undefined &&
                            amount.priceM !== null && (
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  Price M:
                                </span>
                                <span className="font-medium text-success">
                                  {formatCurrency(amount.priceM)}
                                </span>
                              </div>
                            )}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 border rounded-lg bg-primary/5">
                        <p className="text-sm font-medium text-muted-foreground mb-2">
                          New Price (After Update):
                        </p>
                        <p className="text-xs text-muted-foreground">
                          No new price data available
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPriceUpdateHistory(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modified Items Dialog */}
      <Dialog open={showModifiedItems} onOpenChange={setShowModifiedItems}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-warning" />
              Modified Items ({updatedCount})
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {(() => {
              // Get all updated items
              const updatedItems: PriceItem[] = [];
              try {
                const priceUpdatedItems = JSON.parse(
                  localStorage.getItem("priceUpdatedItems") || "{}",
                );
                items.forEach((item) => {
                  if (item.lastUpdated) {
                    updatedItems.push(item);
                  } else if (priceUpdatedItems[item.id]) {
                    const localStorageData = priceUpdatedItems[item.id];
                    const hasLocalAmount =
                      localStorageData.amount &&
                      Object.keys(localStorageData.amount || {}).length > 0;
                    const hasLocalPrevious =
                      localStorageData.previousPrice &&
                      Object.keys(localStorageData.previousPrice || {}).length >
                      0;
                    if (hasLocalAmount || hasLocalPrevious) {
                      updatedItems.push(item);
                    }
                  }
                });
              } catch (error) {
                updatedItems.push(...items.filter((item) => item.lastUpdated));
              }

              if (updatedItems.length === 0) {
                return (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No items have been modified yet.</p>
                  </div>
                );
              }

              return (
                <div className="space-y-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part No</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Price A</TableHead>
                        <TableHead className="text-right">Price B</TableHead>
                        <TableHead className="text-right">Price M</TableHead>
                        <TableHead>Updated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {updatedItems.map((item) => {
                        const updateInfo =
                          item.lastUpdated ||
                          (() => {
                            try {
                              const priceUpdatedItems = JSON.parse(
                                localStorage.getItem("priceUpdatedItems") ||
                                "{}",
                              );
                              return priceUpdatedItems[item.id] || null;
                            } catch {
                              return null;
                            }
                          })();

                        return (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">
                              {item.partNo}
                            </TableCell>
                            <TableCell className="max-w-xs truncate">
                              {item.description}
                            </TableCell>
                            <TableCell>{item.category}</TableCell>
                            <TableCell className="text-right">
                              {updateInfo?.amount?.cost !== undefined ? (
                                <div>
                                  <div className="text-muted-foreground line-through text-xs">
                                    {formatCurrency(
                                      updateInfo.previousPrice?.cost ||
                                      item.cost,
                                    )}
                                  </div>
                                  <div className="text-success font-medium">
                                    {formatCurrency(updateInfo.amount.cost)}
                                  </div>
                                </div>
                              ) : (
                                formatCurrency(item.cost)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {updateInfo?.amount?.priceA !== undefined ? (
                                <div>
                                  <div className="text-muted-foreground line-through text-xs">
                                    {formatCurrency(
                                      updateInfo.previousPrice?.priceA ||
                                      item.priceA,
                                    )}
                                  </div>
                                  <div className="text-success font-medium">
                                    {formatCurrency(updateInfo.amount.priceA)}
                                  </div>
                                </div>
                              ) : (
                                formatCurrency(item.priceA)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {updateInfo?.amount?.priceB !== undefined ? (
                                <div>
                                  <div className="text-muted-foreground line-through text-xs">
                                    {formatCurrency(
                                      updateInfo.previousPrice?.priceB ||
                                      item.priceB,
                                    )}
                                  </div>
                                  <div className="text-success font-medium">
                                    {formatCurrency(updateInfo.amount.priceB)}
                                  </div>
                                </div>
                              ) : (
                                formatCurrency(item.priceB)
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {updateInfo?.amount?.priceM !== undefined ? (
                                <div>
                                  <div className="text-muted-foreground line-through text-xs">
                                    {formatCurrency(
                                      updateInfo.previousPrice?.priceM ||
                                      item.priceM,
                                    )}
                                  </div>
                                  <div className="text-success font-medium">
                                    {formatCurrency(updateInfo.amount.priceM)}
                                  </div>
                                </div>
                              ) : (
                                formatCurrency(item.priceM)
                              )}
                            </TableCell>
                            <TableCell>
                              {updateInfo?.date && updateInfo?.time ? (
                                <div className="text-xs">
                                  <div>{updateInfo.date}</div>
                                  <div className="text-muted-foreground">
                                    {updateInfo.time}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  -
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              );
            })()}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowModifiedItems(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
