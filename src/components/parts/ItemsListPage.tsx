import { useState, useEffect, useRef } from "react";
import { ItemsListView, Item, getItemDuplicateKey } from "@/components/parts/ItemsListView";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { ReservedQuantityManager } from "@/utils/reservedQuantityManager";
import { shareImagesAcrossFamilyItems } from "@/lib/part-images";

interface ItemsListPageProps {
  onPartsUpdate?: (parts: any[]) => void;
}

export const ItemsListPage = ({
  onPartsUpdate,
}: ItemsListPageProps) => {
  const [showItemsForm, setShowItemsForm] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [totalItems, setTotalItems] = useState(0);
  const [categoryOptions, setCategoryOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [subcategoryOptions, setSubcategoryOptions] = useState<
    { value: string; label: string; categoryName?: string }[]
  >([]);
  const [applicationOptions, setApplicationOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [brandOptions, setBrandOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [descriptionOptions, setDescriptionOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [masterPartOptions, setMasterPartOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [partNoOptions, setPartNoOptions] = useState<
    { value: string; label: string }[]
  >([]);
  const [searchFilters, setSearchFilters] = useState({
    search: "",
    master_part_no: "",
    part_no: "",
    brand_name: "",
    description: "",
    part_type: "all",
    category_name: "all",
    subcategory_name: "all",
    application_name: "all",
    duplicates_only: "all",
    created_from_date: "",
    created_to_date: new Date().toISOString().split("T")[0], // Set to current date
    created_from_time: "",
    created_to_time: "",
  });

  // Track the latest request to prevent stale responses overwriting newer ones
  const latestRequestIdRef = useRef(0);

  // Clean up old price update entries from localStorage (older than 24 hours)
  const cleanupOldPriceUpdates = () => {
    try {
      const priceUpdatedItems = JSON.parse(
        localStorage.getItem("priceUpdatedItems") || "{}",
      );
      const now = new Date();
      let hasChanges = false;

      Object.keys(priceUpdatedItems).forEach((itemId) => {
        const updateTime = new Date(priceUpdatedItems[itemId].timestamp);
        const hoursSinceUpdate =
          (now.getTime() - updateTime.getTime()) / (1000 * 60 * 60);
        if (hoursSinceUpdate >= 24) {
          delete priceUpdatedItems[itemId];
          hasChanges = true;
        }
      });

      if (hasChanges) {
        localStorage.setItem(
          "priceUpdatedItems",
          JSON.stringify(priceUpdatedItems),
        );
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  };

  // Fetch dropdown options (not restricted by selection)
  useEffect(() => {
    const fetchDropdowns = async () => {
      try {
        const [cats, subs, apps, brands, mParts, partNos, partsForDescriptions] = await Promise.all([
          apiClient.getAllCategories?.(),
          apiClient.getAllSubcategories?.(undefined, "all"),
          apiClient.getAllApplications?.(),
          apiClient.getAllBrands?.(),
          apiClient.getMasterParts?.(),
          apiClient.getPartNos?.(),
          apiClient.getPartEntryList?.({ limit: "all", page: 1 }),
        ]);

        const catData = Array.isArray(cats?.data) ? cats.data : Array.isArray(cats) ? cats : [];
        const uniqueCatMap = new Map<string, { value: string; label: string }>();
        catData.forEach((c: any) => {
          const name = c.name;
          if (name && !uniqueCatMap.has(name)) {
            uniqueCatMap.set(name, { value: name, label: name });
          }
        });
        setCategoryOptions(Array.from(uniqueCatMap.values()));

        const subData = Array.isArray((subs as any)?.data) ? (subs as any).data : Array.isArray(subs) ? subs : [];
        const subcategoryOptionsList: { value: string; label: string; categoryName?: string }[] = [];
        subData.forEach((s: any) => {
          const name = (s.name || "").trim();
          if (name && name !== "null" && name !== "undefined") {
            subcategoryOptionsList.push({
              value: name,
              label: name,
              categoryName: (s.categoryName || s.category?.name || "").trim(),
            });
          }
        });
        setSubcategoryOptions(subcategoryOptionsList);

        const appData = Array.isArray((apps as any)?.data) ? (apps as any).data : Array.isArray(apps) ? apps : [];
        const validApplications = appData
          .map((a: any) => (a.name || "").trim())
          .filter((name: string) => name && name !== "null" && name !== "undefined" && name !== "." && name.length > 0);
        const uniqueApps = Array.from(new Set(validApplications));
        setApplicationOptions(uniqueApps.map((name: any) => ({ value: String(name), label: String(name) })));

        const brandsData = Array.isArray((brands as any)?.data) ? (brands as any).data : Array.isArray(brands) ? brands : [];
        const uniqueBrands = new Set<string>();
        brandsData.forEach((b: any) => {
          const name = b.name || b.brand_name || "";
          if (name && name.trim()) uniqueBrands.add(name.trim());
        });
        setBrandOptions(Array.from(uniqueBrands).map((b) => ({ value: b, label: b })));

        // Master Part No filter options = DB part_no values
        // Part No filter options = DB master_part_no values
        const partNosData = Array.isArray((partNos as any)?.data)
          ? (partNos as any).data
          : Array.isArray(partNos)
            ? partNos
            : [];
        const uniqueMasterPartUi = new Set<string>();
        partNosData.forEach((pn: any) => {
          const val = typeof pn === "string" ? pn : pn.part_no || pn.partNo || "";
          if (val && String(val).trim()) uniqueMasterPartUi.add(String(val).trim());
        });
        setMasterPartOptions(
          Array.from(uniqueMasterPartUi)
            .sort((a, b) => a.localeCompare(b))
            .map((mp) => ({ value: mp, label: mp })),
        );

        const masterPartsData = Array.isArray((mParts as any)?.data) ? (mParts as any).data : Array.isArray(mParts) ? mParts : [];
        const uniquePartNoUi = new Set<string>();
        masterPartsData.forEach((mp: any) => {
          const val = typeof mp === "string" ? mp : mp.master_part_no || mp.name || "";
          if (val && val.trim()) uniquePartNoUi.add(val.trim());
        });
        setPartNoOptions(
          Array.from(uniquePartNoUi)
            .sort((a, b) => a.localeCompare(b))
            .map((pn) => ({ value: pn, label: pn })),
        );

        const partRows = Array.isArray((partsForDescriptions as any)?.data)
          ? (partsForDescriptions as any).data
          : [];
        const uniqueDescriptions = new Set<string>();
        partRows.forEach((p: any) => {
          const desc = String(p?.description || "").trim();
          if (desc && desc !== "null" && desc !== "undefined") {
            uniqueDescriptions.add(desc);
          }
        });
        setDescriptionOptions(
          Array.from(uniqueDescriptions).map((d) => ({ value: d, label: d })),
        );
      } catch (err) { }
    };
    fetchDropdowns();
    cleanupOldPriceUpdates(); // Clean up old entries on mount
  }, []);

  // Sync priceUpdated flag from localStorage when items are loaded or localStorage changes
  useEffect(() => {
    const syncPriceUpdatedFlags = () => {
      try {
        const priceUpdatedItems = JSON.parse(
          localStorage.getItem("priceUpdatedItems") || "{}",
        );
        const now = new Date();

        // Update items with priceUpdated flag if they exist in localStorage
        setItems((prevItems) => {
          let hasChanges = false;
          const updatedItems = prevItems.map((item) => {
            if (priceUpdatedItems[item.id]) {
              const updateTime = new Date(priceUpdatedItems[item.id].timestamp);
              const hoursSinceUpdate =
                (now.getTime() - updateTime.getTime()) / (1000 * 60 * 60);
              const shouldShowBadge = hoursSinceUpdate < 24;

              // Only update if the flag has changed to avoid unnecessary re-renders
              if (item.priceUpdated !== shouldShowBadge) {
                hasChanges = true;
                return { ...item, priceUpdated: shouldShowBadge };
              }
            } else if (item.priceUpdated) {
              // Remove flag if item is no longer in localStorage
              hasChanges = true;
              return { ...item, priceUpdated: false };
            }
            return item;
          });

          return hasChanges ? updatedItems : prevItems;
        });
      } catch (error) {
        // Ignore localStorage errors
      }
    };

    // Sync when items are loaded
    syncPriceUpdatedFlags();

    // Listen for storage events (when localStorage changes in another tab/window)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "priceUpdatedItems") {
        syncPriceUpdatedFlags();
      }
    };

    // Listen for page visibility changes (when user returns to this tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncPriceUpdatedFlags();
      }
    };

    // Listen for custom priceUpdated event (when price is updated in Pricing & Costing page)
    const handlePriceUpdated = (e: CustomEvent) => {
      syncPriceUpdatedFlags();
    };

    window.addEventListener("storage", handleStorageChange);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener(
      "priceUpdated",
      handlePriceUpdated as EventListener,
    );

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener(
        "priceUpdated",
        handlePriceUpdated as EventListener,
      );
    };
  }, [items.length]); // Run when items array length changes (items loaded/refreshed)

  // Helper function to transform API response to Item format
  const transformApiDataToItem = (p: any): Item => {
    const applicationName =
      p.application_name ||
      p.application?.name ||
      (p.application && typeof p.application === "object" && p.application.name
        ? p.application.name
        : null) ||
      "";

    // Check if price was recently updated (within last 24 hours)
    let priceUpdated = false;
    try {
      const priceUpdatedItems = JSON.parse(
        localStorage.getItem("priceUpdatedItems") || "{}",
      );
      if (priceUpdatedItems[p.id]) {
        const updateTime = new Date(priceUpdatedItems[p.id].timestamp);
        const now = new Date();
        const hoursSinceUpdate =
          (now.getTime() - updateTime.getTime()) / (1000 * 60 * 60);
        // Show badge if updated within last 24 hours
        priceUpdated = hoursSinceUpdate < 24;
        if (priceUpdated) {
        }
      }
    } catch (error) { }

    // Format createdAt date and time
    let formattedCreatedAt: string | undefined = undefined;
    if (p.createdAt || p.created_at) {
      try {
        const date = new Date(p.createdAt || p.created_at);
        if (!isNaN(date.getTime())) {
          formattedCreatedAt = date.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      } catch (error) {
        // Ignore date parsing errors
      }
    }

    return {
      id: p.id,
      // SWAPPED to match Part Entry / Items List UI convention:
      // UI "Part No" = DB master_part_no, UI "Master Part No" = DB part_no
      masterPartNo: p.part_no || "",
      partNo: p.master_part_no || "",
      brand: p.brand_name || "",
      type: p.type || "single",
      description: p.description || "",
      category: p.category_name || p.category?.name || "",
      subCategory: p.subcategory_name || p.subcategory?.name || "",
      application: applicationName || "",
      origin: p.origin || "",
      status: p.status === "active" ? "Active" : "Inactive",
      images: [
        p.image_p1
          ? p.image_p1.startsWith("data:") || p.image_p1.startsWith("/") || p.image_p1.startsWith("http")
            ? p.image_p1
            : `data:image/jpeg;base64,${p.image_p1}`
          : null,
        p.image_p2
          ? p.image_p2.startsWith("data:") || p.image_p2.startsWith("/") || p.image_p2.startsWith("http")
            ? p.image_p2
            : `data:image/jpeg;base64,${p.image_p2}`
          : null,
      ].filter((img) => img && img.trim() !== ""),
      priceUpdated: priceUpdated,
      createdAt: formattedCreatedAt,
      reservedQuantity: p.reserved_quantity || p.reservedQuantity || 0,
      stock: Number(p.quantity ?? p.current_stock ?? p.stock ?? 0) || 0,
      reservedStock: Number(p.reserved_stock ?? p.reservedstock ?? 0) || 0,
      canDelete: p.can_delete === true,
      deleteBlockReason: p.delete_block_reason || null,
      cost: p.cost ? parseFloat(p.cost) : null,
      purchasePrice: p.purchasePrice ? parseFloat(p.purchasePrice) : null,
      avgCost: p.avgCost ? parseFloat(p.avgCost) : null,
      weight: p.weight ? String(p.weight) : "-",
      duplicateGroupKey: p.duplicate_key
        ? String(p.duplicate_key).trim().toLowerCase()
        : undefined,
      duplicateGroupSize: p.duplicate_group_size
        ? Number(p.duplicate_group_size)
        : undefined,
    };
  };

  // Helper function to parse API response data
  const parseApiResponse = (response: any): any[] => {
    const responseData = response.data as any;
    if (Array.isArray(responseData)) {
      return responseData;
    } else if (responseData && Array.isArray(responseData.data)) {
      return responseData.data;
    }
    return [];
  };

  // Fetch family items (items with same part_no OR master_part_no)
  const fetchFamilyItems = async (item: Item) => {
    const partNo = item.partNo?.trim();
    const masterPartNo = item.masterPartNo?.trim();

    if (!partNo && !masterPartNo) {
      await fetchItems(itemsPage, itemsPerPage, searchFilters);
      return;
    }

    setItemsLoading(true);
    try {
      // UI values are swapped vs DB columns:
      // UI Part No = DB master_part_no, UI Master Part No = DB part_no
      const partNoParams: any = {
        master_part_no: partNo,
        limit: 1000,
      };
      const partNoResponse = await apiClient.getParts(partNoParams);

      const masterPartNoParams: any = {
        part_no: masterPartNo,
        limit: 1000,
      };
      const masterPartNoResponse =
        masterPartNo && masterPartNo !== partNo
          ? await apiClient.getParts(masterPartNoParams)
          : null;

      // Parse responses
      const partNoItems = parseApiResponse(partNoResponse);
      const masterPartNoItems = masterPartNoResponse
        ? parseApiResponse(masterPartNoResponse)
        : [];

      // Merge and deduplicate by ID
      const allItemsMap = new Map<string, any>();
      [...partNoItems, ...masterPartNoItems].forEach((p: any) => {
        if (!allItemsMap.has(p.id)) {
          allItemsMap.set(p.id, p);
        }
      });

      const mergedItems = Array.from(allItemsMap.values());

      // Transform to Item format
      let transformedItems = shareImagesAcrossFamilyItems(
        mergedItems.map(transformApiDataToItem),
      );

      // Set items immediately for faster display
      setItems(transformedItems);

      // FIXED: Load reserved quantities from localStorage instead of broken backend API
      try {
        const itemsWithReserved = transformedItems.map((item) => ({
          ...item,
          reservedQuantity: ReservedQuantityManager.get(item.id),
        }));

        const totalReserved = itemsWithReserved.reduce(
          (sum, item) => sum + (item.reservedQuantity || 0),
          0,
        );

        setItems(itemsWithReserved);
      } catch (error: any) {
        setItems(
          transformedItems.map((item) => ({ ...item, reservedQuantity: 0 })),
        );
      }
      setTotalItems(transformedItems.length);
      setItemsPage(1);

      // Also update the parts state for PartsList on Part Entry page
      if (onPartsUpdate) {
        const transformedParts = mergedItems.map((p: any) => ({
          id: p.id,
          // SWAPPED for Part Entry PartsList convention
          partNo: p.master_part_no || "",
          brand: p.brand_name || p.brand || "-",
          uom: p.uom || "NOS",
          cost: p.cost ? parseFloat(p.cost) : null,
          purchasePrice: p.purchasePrice ? parseFloat(p.purchasePrice) : null,
          avgCost: p.avgCost ? parseFloat(p.avgCost) : null,
          price: p.price_a ? parseFloat(p.price_a) : null,
          stock: p.quantity || p.current_stock || p.stock || 0, // Stock quantity from API
          masterPartNo: (p.part_no || "").trim(),
          weight: p.weight ? String(p.weight) : "-",
        }));
        onPartsUpdate(transformedParts);
      }

      // Update filters to show we're in "family view"
      setSearchFilters((prev) => ({
        ...prev,
        part_no: partNo || "",
        master_part_no: masterPartNo || "",
      }));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || "Failed to fetch family items",
        variant: "destructive",
      });
    } finally {
      setItemsLoading(false);
    }
  };

  // Fetch items for ItemsListView with pagination and filters
  const fetchItems = async (
    page: number = itemsPage,
    limit: number = itemsPerPage,
    filters?: typeof searchFilters,
  ) => {
    // Clean up old price update entries before fetching
    cleanupOldPriceUpdates();

    const activeFilters = filters || searchFilters;
    const requestId = ++latestRequestIdRef.current;

    setItemsLoading(true);
    try {
      // Duplicate view hides pagination and groups matching rows together,
      // so load the full match set. Missing category/subcategory must still
      // be included (e.g. 9M4849).
      const effectiveLimit =
        activeFilters.duplicates_only === "yes" ? "all" : limit;
      const effectivePage =
        activeFilters.duplicates_only === "yes" ? 1 : page;
      const params: any = {
        page: effectivePage,
        limit: effectiveLimit,
        include_locations: "false",
      };

      // Add search filters - use activeFilters, not the stale filters parameter
      // SWAPPED: UI Master Part No → DB part_no, UI Part No → DB master_part_no
      if (activeFilters.search) params.search = activeFilters.search;
      if (activeFilters.master_part_no)
        params.part_no = activeFilters.master_part_no;
      if (activeFilters.part_no)
        params.master_part_no = activeFilters.part_no;
      if (activeFilters.brand_name)
        params.brand_name = activeFilters.brand_name;
      if (activeFilters.description)
        params.description = activeFilters.description;
      if (activeFilters.part_type && activeFilters.part_type !== "all")
        params.part_type = activeFilters.part_type;
      if (activeFilters.category_name && activeFilters.category_name !== "all")
        params.category_name = activeFilters.category_name;
      if (
        activeFilters.subcategory_name &&
        activeFilters.subcategory_name !== "all"
      )
        params.subcategory_name = activeFilters.subcategory_name;
      if (
        activeFilters.application_name &&
        activeFilters.application_name !== "all"
      )
        params.application_name = activeFilters.application_name;
      if (activeFilters.duplicates_only === "yes")
        params.duplicates_only = "true";

      const response = await apiClient.getParts(params);

      // Handle different response structures
      let partsData: any[] = [];
      const responseAny = response as any;
      const responseData = responseAny.data;

      if (Array.isArray(responseData)) {
        partsData = responseData;
      } else if (
        responseData &&
        typeof responseData === "object" &&
        Array.isArray(responseData.data)
      ) {
        partsData = responseData.data;
      }

      if (partsData.length > 0) {
        const filterType = activeFilters.master_part_no
          ? "master part"
          : activeFilters.part_no
            ? "part number"
            : "none";
        const filterValue =
          activeFilters.master_part_no || activeFilters.part_no || "none";

        // Transform API data to Item format for ItemsListView
        let transformedItems = shareImagesAcrossFamilyItems(
          partsData.map(transformApiDataToItem),
        );

        if (activeFilters.duplicates_only === "yes") {
          transformedItems = [...transformedItems].sort((a, b) => {
            const keyA = a.duplicateGroupKey || getItemDuplicateKey(a);
            const keyB = b.duplicateGroupKey || getItemDuplicateKey(b);
            const byKey = keyA.localeCompare(keyB);
            if (byKey !== 0) return byKey;
            const byPart = a.partNo.localeCompare(b.partNo);
            if (byPart !== 0) return byPart;
            return a.id.localeCompare(b.id);
          });
        }

        // Set items immediately for faster display
        if (latestRequestIdRef.current === requestId) {
          setItems(transformedItems);
        }

        // FIXED: Load reserved quantities from localStorage instead of broken backend API
        try {
          const itemsWithReserved = transformedItems.map((item) => ({
            ...item,
            reservedQuantity: ReservedQuantityManager.get(item.id),
          }));

          const totalReserved = itemsWithReserved.reduce(
            (sum, item) => sum + (item.reservedQuantity || 0),
            0,
          );

          // Update items with reserved quantities (only if still latest request)
          if (latestRequestIdRef.current === requestId) {
            setItems(itemsWithReserved);
          }
        } catch (error: any) {
          // If loading fails, still set items without reserved quantities
          if (latestRequestIdRef.current === requestId) {
            setItems(
              transformedItems.map((item) => ({
                ...item,
                reservedQuantity: 0,
              })),
            );
          }
        }

        const pagination = response.pagination;
        if (latestRequestIdRef.current === requestId) {
          setTotalItems(
            activeFilters.duplicates_only === "yes"
              ? transformedItems.length
              : pagination?.total != null
                ? pagination.total
                : transformedItems.length,
          );
        }

        // Also update parts state for PartsList when filtering by part_no or master_part_no
        if (
          onPartsUpdate &&
          (activeFilters.part_no || activeFilters.master_part_no)
        ) {
          const transformedParts = partsData.map((p: any) => ({
            id: p.id,
            // SWAPPED for Part Entry PartsList convention
            partNo: p.master_part_no || "",
            brand: p.brand_name || p.brand || "-",
            uom: p.uom || "NOS",
            cost: p.cost ? parseFloat(p.cost) : null,
            purchasePrice: p.purchasePrice ? parseFloat(p.purchasePrice) : null,
            avgCost: p.avgCost ? parseFloat(p.avgCost) : null,
            price: p.price_a ? parseFloat(p.price_a) : null,
            stock: p.quantity || p.current_stock || p.stock || 0, // Stock quantity from API
            masterPartNo: (p.part_no || "").trim(),
            weight: p.weight ? String(p.weight) : "-",
          }));
          onPartsUpdate(transformedParts);
        }
      } else {
        if (latestRequestIdRef.current === requestId) {
          setItems([]);
          setTotalItems(0);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || "Failed to fetch items",
        variant: "destructive",
      });
      if (latestRequestIdRef.current === requestId) {
        setItems([]);
        setTotalItems(0);
      }
    } finally {
      if (latestRequestIdRef.current === requestId) {
        setItemsLoading(false);
      }
    }
  };

  // Fetch when filters, page, or page size change
  useEffect(() => {
    fetchItems(itemsPage, itemsPerPage, searchFilters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsPage, itemsPerPage, searchFilters]);

  useEffect(() => {
    if (searchFilters.duplicates_only === "yes" && itemsPage !== 1) {
      setItemsPage(1);
    }
  }, [searchFilters.duplicates_only, itemsPage]);

  return (
    <ItemsListView
      items={items}
      loading={itemsLoading}
      currentPage={itemsPage}
      itemsPerPage={itemsPerPage}
      totalItems={totalItems}
      searchFilters={searchFilters}
      categoryOptions={categoryOptions}
      subcategoryOptions={subcategoryOptions}
      applicationOptions={applicationOptions}
      brandOptions={brandOptions}
      descriptionOptions={descriptionOptions}
      masterPartOptions={masterPartOptions}
      partNoOptions={partNoOptions}
      onFiltersChange={(filters) => {
        setSearchFilters(filters);
        // Reset to page 1 when filters change
        setItemsPage(1);
      }}
      onPageChange={(page) => {
        setItemsPage(page);
      }}
      onItemsPerPageChange={(limit) => {
        setItemsPerPage(limit);
        setItemsPage(1);
      }}
      onEdit={(item) => {
        setEditingItem(item);
        setShowItemsForm(true);
        // Don't auto-update filters when editing - just open the form
      }}
      onItemSelect={(item) => {
        // Automatically fetch and show family items when clicking on a row
        fetchFamilyItems(item);
      }}
      onDelete={async (item) => {
        try {
          // Optimistically remove from UI
          setItems((prev) => prev.filter((i) => i.id !== item.id));
          setTotalItems((prev) => Math.max(0, prev - 1));

          const response = await apiClient.deletePart(item.id);

          if (response.error) {
            throw new Error(response.error);
          }

          // Silently refresh in background to sync with server (use current filters)
          fetchItems(itemsPage, itemsPerPage, searchFilters).catch((err) => { });
        } catch (error: any) {
          // Restore item on error (use current filters)
          fetchItems(itemsPage, itemsPerPage, searchFilters);

          // Extract error message and details from response
          const errorMessage =
            error?.response?.data?.error ||
            error?.error ||
            error?.message ||
            "Failed to delete item";
          const errorDetails = error?.response?.data?.details || error?.details;

          toast({
            title: "Cannot Delete Item",
            description: errorDetails || errorMessage,
            variant: "destructive",
          });
        }
      }}
      onBulkDelete={async (itemIds: string[]) => {
        const success: string[] = [];
        const failed: string[] = [];

        // Optimistically remove all items from UI
        setItems((prev) => {
          const removed = prev.filter((i) => itemIds.includes(i.id));
          const remaining = prev.filter((i) => !itemIds.includes(i.id));
          setTotalItems((prevTotal) => Math.max(0, prevTotal - removed.length));
          return remaining;
        });

        // Delete in background (parallel)
        const deletePromises = itemIds.map(async (id) => {
          try {
            const response = await apiClient.deletePart(id);
            if (response.error) {
              throw new Error(response.error);
            }
            success.push(id);
          } catch (error: any) {
            failed.push(id);
            // Store error details for later display if needed
            (error as any).itemId = id;
          }
        });

        await Promise.all(deletePromises);

        // Silently refresh in background to sync (use current filters)
        fetchItems(itemsPage, itemsPerPage, searchFilters).catch((err) => { });

        return { success, failed };
      }}
      onBulkPartTypeChange={async (
        itemIds: string[],
        nextType: "single" | "kit",
        quantity: number,
      ) => {
        if (itemIds.length !== 1) return;
        const targetId = itemIds[0];
        try {
          const qty = Math.max(1, Math.floor(Number(quantity || 1)));
          const response =
            nextType === "kit"
              ? await apiClient.makeKit(targetId, { quantity: qty })
              : await apiClient.breakKit(targetId, { quantity: qty });
          if ((response as any)?.error) {
            throw new Error((response as any).error);
          }
          await fetchItems(itemsPage, itemsPerPage, searchFilters);
        } catch (error: any) {
          toast({
            title: "Update failed",
            description: error?.message || "Failed to update item type",
            variant: "destructive",
          });
          throw error;
        }
      }}
      onItemsUpdate={(updatedItems) => {
        setItems(updatedItems);
        setTotalItems(updatedItems.length);
      }}
      onAddNew={() => {
        setEditingItem(null);
        // Clear master part filter when adding new part
        setSearchFilters((prev) => ({
          ...prev,
          master_part_no: "",
        }));
        setShowItemsForm(true);
      }}
      onStatusChange={async (item, newStatus) => {
        try {
          setItemsLoading(true);
          const apiData = {
            master_part_no: item.masterPartNo || null,
            part_no: item.partNo,
            brand_name: item.brand || null,
            description: item.description || null,
            category_id: null, // Will need to fetch these from API
            subcategory_id: null,
            application_id: null,
            status: newStatus === "Active" ? "active" : "inactive",
          };

          const response = await apiClient.updatePart(item.id, apiData);

          if (response.error) {
            throw new Error(response.error);
          }

          // Refresh items list (use current filters)
          await fetchItems(itemsPage, itemsPerPage, searchFilters);

          toast({
            title: "Success",
            description: "Status updated successfully",
          });
        } catch (error: any) {
          toast({
            title: "Error",
            description: error.message || "Failed to update status",
            variant: "destructive",
          });
        } finally {
          setItemsLoading(false);
        }
      }}
      showForm={showItemsForm}
      onCancelForm={() => {
        setShowItemsForm(false);
        setEditingItem(null);
      }}
      onSavePart={async (partData, isEdit, editItemId) => {
        try {
          setItemsLoading(true);

          // Transform form data to API format
          // Get master part number - ensure it's properly trimmed
          const masterPartNoValue =
            partData.masterPartNo && String(partData.masterPartNo).trim()
              ? String(partData.masterPartNo).trim()
              : null;

          const apiData: any = {
            master_part_no: masterPartNoValue,
            part_no: partData.partNo,
            brand_name: partData.brand || null,
            type: partData.type || "single",
            description: partData.description || null,
            category_id: partData.categoryId || partData.category || null,
            subcategory_id:
              partData.subCategoryId || partData.subCategory || null,
            application_id:
              partData.applicationId || partData.application || null,
            hs_code: partData.hsCode || null,
            weight: partData.weight ? parseFloat(partData.weight) : null,
            reorder_level: partData.reOrderLevel
              ? parseInt(partData.reOrderLevel)
              : 0,
            uom: partData.uom || "pcs",
            cost: partData.cost ? parseFloat(partData.cost) : null,
            price_a: partData.priceA ? parseFloat(partData.priceA) : null,
            price_b: partData.priceB ? parseFloat(partData.priceB) : null,
            price_m: partData.priceM ? parseFloat(partData.priceM) : null,
            smc: partData.smc || null,
            size: partData.size || null,
            origin:
              partData.origin && partData.origin.trim()
                ? partData.origin.trim()
                : null,
            remarks: partData.remarks?.trim() ? partData.remarks.trim() : null,
            status: partData.status === "A" ? "active" : "inactive",
            models:
              partData.modelQuantities
                ?.filter(
                  (mq: any) => mq && mq.model && String(mq.model).trim() !== "",
                )
                .map((mq: any) => ({
                  name: String(mq.model).trim(),
                  qty_used: Number(mq.qty || 1),
                })) || [],
            kit_items:
              (partData.kitItems || [])
                .filter((row: any) => row && row.itemPartId)
                .map((row: any) => ({
                  item_part_id: String(row.itemPartId).trim(),
                  quantity: Number(row.quantity || 1),
                })) || [],
          };

          // Handle images - if updating, explicitly set to null if not provided to clear them
          if (isEdit && editItemId) {
            // When updating, always include image fields (null if not provided to clear old images)
            apiData.image_p1 =
              partData.imageP1 !== undefined ? partData.imageP1 : null;
            apiData.image_p2 =
              partData.imageP2 !== undefined ? partData.imageP2 : null;
          } else {
            // When creating, only add if provided
            if (partData.imageP1) {
              apiData.image_p1 = partData.imageP1;
            }
            if (partData.imageP2) {
              apiData.image_p2 = partData.imageP2;
            }
          }

          let response;
          if (isEdit && editItemId) {
            // Update existing item
            response = await apiClient.updatePart(editItemId, apiData);
          } else {
            // Create new item
            response = await apiClient.createPart(apiData);
          }

          if (response.error) {
            throw new Error(response.error);
          }

          // Optimistic update: Update local state immediately for fast UI response
          if (isEdit && editItemId && response.data) {
            const updatedItem = transformApiDataToItem(response.data);
            setItems((prevItems) =>
              prevItems.map((item) =>
                item.id === editItemId ? updatedItem : item,
              ),
            );
          } else if (!isEdit && response.data) {
            const createdItem = transformApiDataToItem(response.data);
            setItems((prevItems) =>
              shareImagesAcrossFamilyItems([createdItem, ...prevItems]),
            );
          }

          // Close form immediately for fast response
          toast({
            title: "Success",
            description: isEdit
              ? "Item updated successfully"
              : "Item created successfully",
          });

          setEditingItem(null);
          setShowItemsForm(false);
          setItemsLoading(false); // Stop loading immediately

          // Refresh in background without blocking UI
          if (!isEdit && searchFilters.master_part_no) {
            // UI Master Part No is stored in DB part_no
            const newPartMasterPartNo = (apiData.part_no || "").trim();
            const filterMasterPartNo = (
              searchFilters.master_part_no || ""
            ).trim();

            if (newPartMasterPartNo !== filterMasterPartNo) {
              const updatedFilters = {
                ...searchFilters,
                master_part_no: "",
              };
              setSearchFilters(updatedFilters);
              fetchItems(1, itemsPerPage, updatedFilters).catch(() => { });
            } else {
              fetchItems(itemsPage, itemsPerPage, searchFilters).catch(
                () => { },
              );
            }
          } else {
            // Refresh in background
            fetchItems(itemsPage, itemsPerPage, searchFilters).catch(() => { });
          }
        } catch (error: any) {
          setItemsLoading(false);
          toast({
            title: "Error",
            description: error.message || "Failed to save item",
            variant: "destructive",
          });
        }
      }}
      editItem={editingItem}
    />
  );
};
