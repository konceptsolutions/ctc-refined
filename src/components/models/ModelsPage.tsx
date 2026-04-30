import { useState, useMemo, useRef, useEffect } from "react";
import { Search, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface Item {
  id: string;
  masterPartNo: string;
  partNo: string;
  brand: string;
  description: string;
  category: string;
  subCategory: string;
  application: string;
  status: string;
  images: string[];
}

interface Model {
  id: string;
  name: string;
  qtyUsed: number;
  partId: string;
}

export const ModelsPage = () => {
  // Unified search state - single field for all search types
  const [unifiedSearch, setUnifiedSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<Item | null>(null);
  const [showUnifiedDropdown, setShowUnifiedDropdown] = useState(false);
  const [unifiedSearchResults, setUnifiedSearchResults] = useState<Item[]>([]);
  const [modelSearchResults, setModelSearchResults] = useState<
    Array<{ modelName: string; part: Item }>
  >([]);
  const [searchType, setSearchType] = useState<
    "model" | "part" | "master" | "mixed"
  >("mixed");
  const [manualSearchScope, setManualSearchScope] = useState<
    "all" | "model" | "part" | "master" | "brand"
  >("all");
  const [loadingUnifiedSearch, setLoadingUnifiedSearch] = useState(false);
  const unifiedDropdownRef = useRef<HTMLDivElement>(null);

  // Models state
  const [models, setModels] = useState<Model[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);

  // Inline editing states
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editQty, setEditQty] = useState("");

  // Add new model inline state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newModelName, setNewModelName] = useState("");
  const [newModelQty, setNewModelQty] = useState("");

  // Delete state
  const [deleteModelOpen, setDeleteModelOpen] = useState(false);
  const [modelToDelete, setModelToDelete] = useState<Model | null>(null);

  // State for parts fetched from API
  const [parts, setParts] = useState<Item[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);

  // Fetch initial parts on mount
  useEffect(() => {
    const fetchInitialParts = async () => {
      setLoadingParts(true);
      try {
        const response = await apiClient.getParts({
          limit: 100000, // Effectively no limit for faster initial load
          page: 1,
        });

        if (response.error) {
          setParts([]);
        } else {
          const responseData = response.data as any;
          let partsData: any[] = [];

          if (Array.isArray(responseData)) {
            partsData = responseData;
          } else if (responseData && Array.isArray(responseData.data)) {
            partsData = responseData.data;
          }

          // Transform API data to Item format
          // SWAPPED: partNo shows master_part_no (actual Part No), masterPartNo shows part_no (Master Part No)
          const transformedParts: Item[] = partsData.map((p: any) => ({
            id: p.id,
            masterPartNo: p.part_no || p.masterPartNo || "",
            partNo: p.master_part_no || p.partNo || "",
            brand: p.brand_name || p.brand || "",
            description: p.description || "",
            category: p.category_name || p.category || "",
            subCategory: p.subcategory_name || p.subcategory || "",
            application: p.application_name || p.application || "",
            status: p.status || "active",
            images: [],
          }));

          setParts(transformedParts);
        }
      } catch (error: any) {
        setParts([]);
      } finally {
        setLoadingParts(false);
      }
    };

    fetchInitialParts();
  }, []);

  // Detect search type based on input pattern and try both searches

  // Unified search - smart detection and appropriate results
  // Unified search - smart detection and appropriate results
  // Unified search - smart detection and appropriate results
  // Unified search - smart detection and appropriate results
  useEffect(() => {
    const performUnifiedSearch = async () => {
      // Don't search for empty or very short strings
      if (!unifiedSearch || unifiedSearch.trim().length < 1) {
        setUnifiedSearchResults([]);
        setModelSearchResults([]);
        if (manualSearchScope === "all") {
          setSearchType("mixed");
        } else {
          setSearchType(manualSearchScope as any);
        }
        setLoadingUnifiedSearch(false);
        return;
      }

      setLoadingUnifiedSearch(true);
      const searchTerm = unifiedSearch.trim();

      // Update local search type for UI feedback
      const looksLikeModel =
        /^\d+[a-z]+$/i.test(searchTerm) || /^[a-z]+\d+$/i.test(searchTerm);

      if (manualSearchScope !== "all") {
        setSearchType(manualSearchScope as any);
      } else {
        if (looksLikeModel) {
          setSearchType("model");
        } else if (searchTerm.length > 10) {
          setSearchType("master");
        } else {
          setSearchType("mixed");
        }
      }

      // FALLBACK SEARCH FUNCTION
      const performLegacySearch = async () => {
        try {
          const allResults: Item[] = [];
          const modelResults: Array<{ modelName: string; part: Item }> = [];
          const processedPartIds = new Set<string>();

          // Search parts using standard API
          const apiResponse = await apiClient.getParts({
            search: searchTerm,
            limit: 50,
            page: 1,
          });

          if (!apiResponse.error) {
            const responseData = apiResponse.data as any;
            let partsData: any[] = [];

            if (Array.isArray(responseData)) {
              partsData = responseData;
            } else if (responseData && Array.isArray(responseData.data)) {
              partsData = responseData.data;
            }

            // Fetch detailed information for parts in parallel to get their models
            // attributes. The standard list API doesn't return models, so we must fetch details.
            const detailedPartsPromises = partsData
              .slice(0, 40)
              .map(async (p: any) => {
                if (processedPartIds.has(p.id)) return null;

                try {
                  // We MUST fetch individual part details to see the 'models' array!
                  const detailResponse = await apiClient.getPart(p.id);
                  if (!detailResponse.error) {
                    return (detailResponse as any).data || detailResponse;
                  }
                  return p;
                } catch (e) {
                  return p;
                }
              });

            const detailedParts = await Promise.all(detailedPartsPromises);

            // Transform results
            detailedParts.forEach((p: any) => {
              if (!p || processedPartIds.has(p.id)) return;

              const item = {
                id: p.id,
                masterPartNo: p.part_no || p.masterPartNo || p.partNo || "",
                partNo: p.master_part_no || p.partNo || "",
                brand: p.brand_name || p.brand || p.brand?.name || "",
                description: p.description || "",
                category:
                  p.category_name || p.category || p.category?.name || "",
                subCategory:
                  p.subcategory_name ||
                  p.subcategory ||
                  p.subcategory?.name ||
                  "",
                application:
                  p.application_name ||
                  p.application ||
                  p.application?.name ||
                  "",
                status: p.status || "active",
                images: [],
              };

              // Filter based on scope if needed
              if (
                manualSearchScope === "part" &&
                !item.partNo.toLowerCase().includes(searchTerm.toLowerCase())
              )
                return;
              if (
                manualSearchScope === "brand" &&
                !item.brand.toLowerCase().includes(searchTerm.toLowerCase())
              )
                return;

              allResults.push(item);
              processedPartIds.add(p.id);

              // Check if it matches model pattern
              if (
                (manualSearchScope === "all" && looksLikeModel) ||
                manualSearchScope === "model"
              ) {
                if (p.models && Array.isArray(p.models)) {
                  p.models.forEach((m: any) => {
                    // Check if model name contains search term
                    // OR if we are just showing all models for a part that matched differently?
                    // User expects: Search "140G" -> Show parts for 140G.
                    if (
                      m.name.toLowerCase().includes(searchTerm.toLowerCase())
                    ) {
                      modelResults.push({ modelName: m.name, part: item });
                    }
                  });
                }
              }
            });
          }

          // Sort models: Exact matches first, then starts-with, then others
          modelResults.sort((a, b) => {
            const lowerTerm = searchTerm.toLowerCase();
            const aName = a.modelName.toLowerCase();
            const bName = b.modelName.toLowerCase();

            // 1. Exact match priority
            if (aName === lowerTerm && bName !== lowerTerm) return -1;
            if (bName === lowerTerm && aName !== lowerTerm) return 1;

            // 2. Starts-with priority
            const aStarts = aName.startsWith(lowerTerm);
            const bStarts = bName.startsWith(lowerTerm);
            if (aStarts && !bStarts) return -1;
            if (bStarts && !aStarts) return 1;

            return aName.localeCompare(bName);
          });

          if (manualSearchScope === "model") {
            setModelSearchResults(modelResults);
            setUnifiedSearchResults([]);
          } else if (
            manualSearchScope === "part" ||
            manualSearchScope === "brand" ||
            manualSearchScope === "master"
          ) {
            setModelSearchResults([]);
            setUnifiedSearchResults(allResults);
          } else {
            // ALL / Auto
            if (modelResults.length > 0) {
              setModelSearchResults(modelResults);
              if (modelResults.length > 0 && looksLikeModel) {
                setUnifiedSearchResults([]);
                setSearchType("model");
              } else {
                setUnifiedSearchResults(allResults);
              }
            } else {
              setModelSearchResults([]);
              setUnifiedSearchResults(allResults);
            }
          }
        } catch (err) {
          console.error("Legacy search failed", err);
          setUnifiedSearchResults([]);
        } finally {
          setLoadingUnifiedSearch(false);
        }
      };

      try {
        // Try Advanced Search API First
        const response = await apiClient.get(
          `/advanced-search/search?q=${encodeURIComponent(searchTerm)}&type=${manualSearchScope}&limit=100`,
        );

        if (response.error) {
          // If 404 or error, fallback to legacy
          console.warn(
            "Advanced search failed, falling back to legacy",
            response.error,
          );
          performLegacySearch();
          return;
        }

        const data = (response as any).data || response;
        if (!data || (!data.exact && !data.related)) {
          // Invalid response structure, fallback
          performLegacySearch();
          return;
        }

        const exactMatches = data.exact || [];
        const relatedMatches = data.related || [];

        // Use Sets to prevent duplicates
        const modelResults: Array<{ modelName: string; part: Item }> = [];
        const partResults: Item[] = [];
        const processedPartIds = new Set<string>();

        const processItem = (item: any, isModel: boolean) => {
          const part: Item = {
            id: item.partId,
            masterPartNo: item.masterPartNo || "",
            partNo: item.partNo || "",
            brand: item.brand || "",
            description: item.description || "",
            category: item.category || "",
            subCategory: item.subcategory || "",
            application: item.application || "",
            status: item.status || "active",
            images: [],
          };

          if (isModel) {
            modelResults.push({ modelName: item.modelName, part });
          } else if (!processedPartIds.has(item.partId)) {
            partResults.push(part);
            processedPartIds.add(item.partId);
          }
        };

        // Process results
        exactMatches.forEach((item: any) =>
          processItem(item, item.type === "model"),
        );
        relatedMatches.forEach((item: any) => {
          // Avoid duplicates in model results
          if (item.type === "model") {
            if (
              !modelResults.some(
                (m) =>
                  m.modelName === item.modelName && m.part.id === item.partId,
              )
            ) {
              processItem(item, true);
            }
          } else {
            processItem(item, false);
          }
        });

        // Determine display logic based on SCOPE
        if (manualSearchScope === "model") {
          setModelSearchResults(modelResults);
          setUnifiedSearchResults([]);
        } else if (
          manualSearchScope === "part" ||
          manualSearchScope === "brand" ||
          manualSearchScope === "master"
        ) {
          setModelSearchResults([]);
          setUnifiedSearchResults(partResults);
        } else {
          // Auto / All
          if (modelResults.length > 0) {
            setModelSearchResults(modelResults);
            if (modelResults.length > 0 && looksLikeModel) {
              setUnifiedSearchResults([]);
              setSearchType("model");
            } else {
              setUnifiedSearchResults(partResults);
            }
          } else {
            setModelSearchResults([]);
            setUnifiedSearchResults(partResults);
          }
        }
        setLoadingUnifiedSearch(false);
      } catch (error) {
        console.error("Search error, falling back:", error);
        performLegacySearch();
      }
    };

    const timeoutId = setTimeout(() => {
      performUnifiedSearch();
    }, 150);

    return () => clearTimeout(timeoutId);
  }, [unifiedSearch, manualSearchScope]);

  // Get models for selected part
  const partModels = useMemo(() => {
    if (!selectedPart) return [];
    return models.filter((model) => model.partId === selectedPart.id);
  }, [models, selectedPart]);

  // Fetch models when a part is selected
  useEffect(() => {
    const fetchModels = async () => {
      if (!selectedPart) {
        setModels([]);
        return;
      }

      setLoadingModels(true);
      try {
        const response = await apiClient.getPart(selectedPart.id);

        if (response.error) {
          toast({
            title: "Error",
            description: response.error || "Failed to fetch models",
            variant: "destructive",
          });
          setModels([]);
        } else {
          // The API client returns the response object directly
          // Backend returns: { id, part_no, models: [...], ... }
          // So models are directly on the response object
          const responseData = (response as any).data || response;
          const apiModels = responseData?.models || [];

          const transformedModels: Model[] = apiModels.map((m: any) => ({
            id: m.id,
            name: m.name,
            qtyUsed: m.qty_used || m.qtyUsed || 1,
            partId: selectedPart.id,
          }));

          setModels(transformedModels);
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch models",
          variant: "destructive",
        });
        setModels([]);
      } finally {
        setLoadingModels(false);
      }
    };

    fetchModels();
  }, [selectedPart]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        unifiedDropdownRef.current &&
        !unifiedDropdownRef.current.contains(event.target as Node)
      ) {
        setShowUnifiedDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectPart = (part: Item) => {
    setSelectedPart(part);
    setUnifiedSearch(part.partNo);
    setShowUnifiedDropdown(false);
    setUnifiedSearchResults([]);
    // Models will be fetched automatically via useEffect
  };

  // Handle Enter key for unified search
  const handleUnifiedSearchKeyDown = async (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Enter" && unifiedSearch && unifiedSearch.trim()) {
      // If there's exactly one result, select it
      if (unifiedSearchResults.length === 1) {
        handleSelectPart(unifiedSearchResults[0]);
      } else if (unifiedSearchResults.length > 0) {
        // If multiple results, select the first one
        handleSelectPart(unifiedSearchResults[0]);
      } else {
        // Try to find part by exact match
        try {
          const params: any = {
            master_part_no: unifiedSearch.trim(),
            limit: 1,
          };

          const response = await apiClient.getParts(params);
          if (!response.error && response.data) {
            const responseData = response.data as any;
            let partsData: any[] = [];

            if (Array.isArray(responseData)) {
              partsData = responseData;
            } else if (responseData && Array.isArray(responseData.data)) {
              partsData = responseData.data;
            }

            if (partsData.length > 0) {
              const part = partsData[0];
              const transformedPart: Item = {
                id: part.id,
                masterPartNo: part.part_no || part.masterPartNo || "",
                partNo: part.master_part_no || part.partNo || "",
                brand: part.brand_name || part.brand || "",
                description: part.description || "",
                category: part.category_name || part.category || "",
                subCategory: part.subcategory_name || part.subcategory || "",
                application: part.application_name || part.application || "",
                status: part.status || "active",
                images: [],
              };
              handleSelectPart(transformedPart);
            }
          }
        } catch (error) {}
      }
    }
  };

  // Save models to backend
  const saveModelsToBackend = async (updatedModels: Model[]) => {
    if (!selectedPart) return;

    try {
      // Transform models to API format
      const modelsForApi = updatedModels.map((m) => ({
        name: m.name,
        qty_used: m.qtyUsed,
      }));

      const response = await apiClient.updatePart(selectedPart.id, {
        models: modelsForApi,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      return true;
    } catch (error: any) {
      throw error;
    }
  };

  // Inline Add Model
  const handleStartAddModel = () => {
    setIsAddingNew(true);
    setNewModelName("");
    setNewModelQty("1");
  };

  const handleSaveNewModel = async () => {
    if (!selectedPart || !newModelName.trim()) return;

    const newModel: Model = {
      id: Date.now().toString(), // Temporary ID, will be replaced by backend
      name: newModelName.trim(),
      qtyUsed: parseInt(newModelQty) || 1,
      partId: selectedPart.id,
    };

    const updatedModels = [...models, newModel];

    try {
      await saveModelsToBackend(updatedModels);
      // Refresh models from backend to get the actual IDs
      const response = await apiClient.getPart(selectedPart.id);
      if (!response.error) {
        const responseData = (response as any).data || response;
        const apiModels = responseData?.models || [];
        const transformedModels: Model[] = apiModels.map((m: any) => ({
          id: m.id,
          name: m.name,
          qtyUsed: m.qty_used || m.qtyUsed || 1,
          partId: selectedPart.id,
        }));
        setModels(transformedModels);
      }
      setNewModelName("");
      setNewModelQty("");
      setIsAddingNew(false);
      toast({ title: "Model added successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save model",
        variant: "destructive",
      });
    }
  };

  const handleCancelAddModel = () => {
    setIsAddingNew(false);
    setNewModelName("");
    setNewModelQty("");
  };

  // Inline Edit Model
  const handleStartEdit = (model: Model) => {
    setEditingModelId(model.id);
    setEditName(model.name);
    setEditQty(model.qtyUsed.toString());
  };

  const handleSaveEdit = async () => {
    if (!editingModelId || !editName.trim()) return;

    const updatedModels = models.map((m) =>
      m.id === editingModelId
        ? { ...m, name: editName.trim(), qtyUsed: parseInt(editQty) || 1 }
        : m,
    );

    try {
      await saveModelsToBackend(updatedModels);
      setModels(updatedModels);
      setEditingModelId(null);
      setEditName("");
      setEditQty("");
      toast({ title: "Model updated successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update model",
        variant: "destructive",
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingModelId(null);
    setEditName("");
    setEditQty("");
  };

  // Delete Model
  const handleDeleteModel = async () => {
    if (!modelToDelete) return;

    const updatedModels = models.filter((m) => m.id !== modelToDelete.id);

    try {
      await saveModelsToBackend(updatedModels);
      setModels(updatedModels);
      setModelToDelete(null);
      setDeleteModelOpen(false);
      toast({ title: "Model deleted successfully" });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete model",
        variant: "destructive",
      });
    }
  };

  const openDeleteModel = (model: Model) => {
    setModelToDelete(model);
    setDeleteModelOpen(true);
  };

  const handleRefresh = async () => {
    // Cancel any unsaved new entry
    if (isAddingNew) {
      setIsAddingNew(false);
      setNewModelName("");
      setNewModelQty("");
    }
    // Cancel any editing
    if (editingModelId) {
      setEditingModelId(null);
      setEditName("");
      setEditQty("");
    }

    // Re-fetch models from backend
    if (selectedPart) {
      setLoadingModels(true);
      try {
        const response = await apiClient.getPart(selectedPart.id);
        if (response.error) {
          toast({
            title: "Error",
            description: response.error || "Failed to refresh models",
            variant: "destructive",
          });
        } else {
          // The API client returns the response object directly
          const responseData = (response as any).data || response;
          const apiModels = responseData?.models || [];
          const transformedModels: Model[] = apiModels.map((m: any) => ({
            id: m.id,
            name: m.name,
            qtyUsed: m.qty_used || m.qtyUsed || 1,
            partId: selectedPart.id,
          }));
          setModels(transformedModels);
          toast({ title: "Data refreshed" });
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to refresh models",
          variant: "destructive",
        });
      } finally {
        setLoadingModels(false);
      }
    } else {
      toast({ title: "Data refreshed" });
    }
  };

  return (
    <div className="h-full flex flex-col overflow-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <div className="w-1 h-8 bg-primary rounded-full" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Models Management
            </h1>
            <p className="text-sm text-muted-foreground">
              Select a part to view its models and quantity used
            </p>
          </div>
        </div>
      </div>

      {/* Model Selection Card */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-1 h-6 bg-primary rounded-full" />
          <h2 className="text-lg font-semibold text-foreground">
            Model Selection
          </h2>
        </div>

        {/* Search Scope Selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-foreground mb-1.5">
            Search By
          </label>
          <Select
            value={manualSearchScope}
            onValueChange={(v: any) => setManualSearchScope(v)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select search scope" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All (Auto-Detect)</SelectItem>
              <SelectItem value="model">Machine Model</SelectItem>
              <SelectItem value="part">Part Number</SelectItem>
              <SelectItem value="master">Master Part Number</SelectItem>
              <SelectItem value="brand">Brand</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Unified Search Field - Single field for all search types */}
        <div ref={unifiedDropdownRef} className="relative">
          <label className="block text-sm font-medium text-foreground mb-2">
            Search <span className="text-destructive">*</span>
            <span className="text-muted-foreground text-xs ml-2">
              (Model, Part No, Master Part No, Description, Brand - e.g., 140g,
              X770651)
            </span>
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by model name, part number, master part number, description, or brand..."
              value={unifiedSearch}
              onChange={(e) => {
                setUnifiedSearch(e.target.value);
                setShowUnifiedDropdown(true);
                if (e.target.value !== selectedPart?.partNo) {
                  setSelectedPart(null);
                }
              }}
              onKeyDown={handleUnifiedSearchKeyDown}
              onFocus={() => setShowUnifiedDropdown(true)}
              className={cn(
                "pl-10 h-10 part-code-font font-mono",
                showUnifiedDropdown && "ring-2 ring-primary border-primary",
              )}
            />
          </div>

          {/* Unified Search Results Dropdown */}
          {showUnifiedDropdown && (
            <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-auto">
              {loadingUnifiedSearch ? (
                <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                  Searching...
                </div>
              ) : (manualSearchScope === "model" || searchType === "model") &&
                modelSearchResults.length > 0 ? (
                // Show models when searching for models
                <>
                  <div className="px-4 py-2 text-xs font-semibold text-primary bg-muted/50 border-b border-border">
                    Models matching "{unifiedSearch}" (
                    {modelSearchResults.length} results)
                  </div>
                  {modelSearchResults.map((result, idx) => (
                    <button
                      key={`${result.part.id}-${result.modelName}-${idx}`}
                      onClick={() => handleSelectPart(result.part)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0",
                        selectedPart?.id === result.part.id && "bg-muted",
                      )}
                    >
                      <p className="font-medium text-foreground text-sm">
                        <span className="text-primary">
                          Model: {result.modelName}
                        </span>
                      </p>
                      <p className="text-sm text-muted-foreground mt-1 part-code-font font-mono">
                        Part No: {result.part.partNo}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {result.part.description
                          ?.replace(/\s*\(Grade:\s*[A-Z0-9]+\)/gi, "")
                          .trim() || ""}
                        {result.part.application &&
                          ` (${result.part.application})`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 part-code-font font-mono">
                        Master Part: {result.part.masterPartNo} &nbsp;&nbsp;
                        Brand: {result.part.brand}
                      </p>
                    </button>
                  ))}
                </>
              ) : manualSearchScope === "model" &&
                unifiedSearch &&
                unifiedSearch.length >= 1 &&
                modelSearchResults.length === 0 ? (
                // Show "no models found" when searching for models specifically
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No models found matching "{unifiedSearch}". Try a different
                  model name.
                </div>
              ) : unifiedSearchResults.length > 0 ? (
                // Show parts when searching for part numbers or master part numbers
                <>
                  {searchType === "master" && (
                    <div className="px-4 py-2 text-xs font-semibold text-primary bg-muted/50 border-b border-border">
                      Master Part Numbers matching "{unifiedSearch}"
                    </div>
                  )}
                  {searchType === "part" && (
                    <div className="px-4 py-2 text-xs font-semibold text-primary bg-muted/50 border-b border-border">
                      Part Numbers matching "{unifiedSearch}"
                    </div>
                  )}
                  {unifiedSearchResults.map((part) => (
                    <button
                      key={part.id}
                      onClick={() => handleSelectPart(part)}
                      className={cn(
                        "w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0",
                        selectedPart?.id === part.id && "bg-muted",
                      )}
                    >
                      <p className="font-medium text-foreground text-sm part-code-font font-mono">
                        {searchType === "master"
                          ? `Master Part: ${part.masterPartNo}`
                          : `Part No: ${part.partNo}`}
                      </p>
                      {searchType === "master" && (
                        <p className="text-sm text-muted-foreground mt-1 part-code-font font-mono">
                          Part No: {part.partNo}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {part.description
                          ?.replace(/\s*\(Grade:\s*[A-Z0-9]+\)/gi, "")
                          .trim() || ""}
                        {part.application && ` (${part.application})`}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Brand: {part.brand} &nbsp;&nbsp; Category:{" "}
                        {part.category || "-"}
                      </p>
                    </button>
                  ))}
                </>
              ) : unifiedSearch && unifiedSearch.length >= 2 ? (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No results found. Try a different search term (model name,
                  part number, master part number, description, or brand).
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Models Table */}
      {selectedPart && (
        <div className="mt-6 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-1 h-6 bg-primary rounded-full" />
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Models for <span className="part-code-font font-mono">{selectedPart.partNo}</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  {selectedPart.description}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={handleStartAddModel}
                disabled={isAddingNew}
              >
                <Plus className="w-4 h-4" />
                Add Model
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleRefresh}
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>

          <div className="border border-border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Model</TableHead>
                  <TableHead className="font-semibold text-center w-40">
                    Qty. Used
                  </TableHead>
                  <TableHead className="font-semibold text-center w-32">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Add New Model Row */}
                {isAddingNew && (
                  <TableRow>
                    <TableCell>
                      <Input
                        placeholder="Enter model name..."
                        value={newModelName}
                        onChange={(e) => setNewModelName(e.target.value)}
                        className="h-9"
                        autoFocus
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        placeholder="1"
                        value={newModelQty}
                        onChange={(e) => setNewModelQty(e.target.value)}
                        className="h-9 text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={handleSaveNewModel}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-3 text-xs"
                          onClick={handleCancelAddModel}
                        >
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}

                {/* Existing Models */}
                {loadingModels ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground py-8"
                    >
                      Loading models...
                    </TableCell>
                  </TableRow>
                ) : partModels.length > 0 ? (
                  partModels.map((model) => (
                    <TableRow key={model.id}>
                      <TableCell>
                        {editingModelId === model.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-9"
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-medium cursor-pointer hover:text-primary transition-colors"
                            onClick={() => handleStartEdit(model)}
                          >
                            {model.name}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingModelId === model.id ? (
                          <Input
                            type="number"
                            value={editQty}
                            onChange={(e) => setEditQty(e.target.value)}
                            className="h-9 text-center"
                          />
                        ) : (
                          <span className="flex justify-center">
                            {model.qtyUsed}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-2">
                          {editingModelId === model.id ? (
                            <>
                              <Button
                                size="sm"
                                className="h-7 px-3 text-xs"
                                onClick={handleSaveEdit}
                              >
                                Save
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-3 text-xs"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <button
                              onClick={() => openDeleteModel(model)}
                              className="p-1.5 text-destructive hover:bg-destructive/10 rounded transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : !isAddingNew ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="text-center text-muted-foreground py-8"
                    >
                      No models found for this part. Click "Add Model" to create
                      one.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>

          {/* Reset Button */}
          <div className="flex justify-center mt-4">
            <Button
              variant="outline"
              size="sm"
              className="px-6"
              onClick={handleRefresh}
            >
              Reset
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteModelOpen} onOpenChange={setDeleteModelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Model</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{modelToDelete?.name}"? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteModel}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
