import { useState, useEffect } from "react";
import { PartEntryForm } from "@/components/parts/PartEntryForm";
import { CreateKitForm } from "@/components/parts/CreateKitForm";
import { PartsList, Part } from "@/components/parts/PartsList";
import { KitsList, Kit } from "@/components/parts/KitsList";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

type LeftTab = "part-entry" | "create-kit";
type RightTab = "parts-list" | "kits-list";

interface PartEntryPageProps {
  searchFilters: any;
  setSearchFilters: (filters: any) => void;
  itemsPage: number;
  setItemsPage: (page: number) => void;
  itemsPerPage: number;
  fetchItems: (page: number, limit: number, filters: any) => Promise<void>;
}

export const PartEntryPage = ({
  searchFilters,
  setSearchFilters,
  itemsPage,
  setItemsPage,
  itemsPerPage,
  fetchItems,
}: PartEntryPageProps) => {
  const [leftTab, setLeftTab] = useState<LeftTab>("part-entry");
  const [rightTab, setRightTab] = useState<RightTab>("parts-list");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedMasterPartNo, setSelectedMasterPartNo] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [kitRefreshTrigger, setKitRefreshTrigger] = useState(0);

  // Fetch parts from API - only on initial load if no master part is selected
  useEffect(() => {
    // Don't fetch all parts if a master part is selected (family parts are shown instead)
    if (selectedMasterPartNo) {
      return;
    }

    const fetchParts = async () => {
      setLoading(true);
      try {
        // Optimized: Fetch all parts for faster load and complete list availability
        const response = await apiClient.getPartEntryList({ limit: "all", page: 1 });
        const responseData = (response as any).data;

        if (responseData && Array.isArray(responseData)) {
          // SWAPPED: partNo shows master_part_no, masterPartNo shows part_no (to match ItemsListView)
          const transformedParts: Part[] = responseData.map((p: any) => ({
            id: p.id,
            partNo: (p.master_part_no || "").trim(),
            brand: p.brand_name || "-",
            uom: p.uom || "NOS",
            weight: p.weight ? String(p.weight) : "-",
            cost: p.cost ? parseFloat(p.cost) : null,
            purchasePrice: null, // Minimal fields for dedicated list
            avgCost: null,
            price: p.price_a ? parseFloat(p.price_a) : null,
            stock: p.stock || 0,
            reservedStock: p.reserved_stock || 0,
            masterPartNo: (p.part_no || "").trim(),
          }));
          setParts(transformedParts);
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.error || "Failed to fetch parts",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchParts();
  }, [selectedMasterPartNo]);

  // NOTE: Parts fetching is now handled inline in onPartSelected callback
  // This useEffect only runs when no master part is selected to prevent overwriting family parts

  const handleSavePart = async (partData: any) => {
    try {
      setLoading(true);

      if (!partData.partNo || String(partData.partNo).trim() === "") {
        toast({
          title: "Validation Error",
          description: "Part number is required",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      // SWAPPED mapping to match ItemsListView display convention:
      // - "Master Part No" UI field saves to part_no column
      // - "Part No" UI field saves to master_part_no column
      const apiData: any = {
        part_no: String(partData.masterPartNo || "").trim(),
        master_part_no: String(partData.partNo).trim(),
        brand_name: partData.brand || null,
        description: partData.description || null,
        category_id: partData.categoryId || partData.category || null,
        subcategory_id: partData.subCategoryId || partData.subCategory || null,
        application_id: partData.applicationId || partData.application || null,
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
        status: partData.status === "A" ? "active" : "inactive",
        models:
          partData.modelQuantities
            ?.filter(
              (mq: any) => mq && mq.model && String(mq.model).trim() !== "",
            )
            .map((mq: any) => ({
              name: String(mq.model).trim(),
              qty_used: mq.qty || 1,
            })) || [],
      };

      // Handle images
      if (selectedPart) {
        apiData.image_p1 =
          partData.imageP1 !== undefined ? partData.imageP1 : null;
        apiData.image_p2 =
          partData.imageP2 !== undefined ? partData.imageP2 : null;
      } else {
        if (partData.imageP1) apiData.image_p1 = partData.imageP1;
        if (partData.imageP2) apiData.image_p2 = partData.imageP2;
      }

      let response;
      if (selectedPart) {
        response = await apiClient.updatePart(selectedPart.id, apiData);
      } else {
        response = await apiClient.createPart(apiData);
      }

      if (response.error) throw new Error(response.error);

      const savedPart = response.data || response;

      // SWAPPED: partNo shows master_part_no, masterPartNo shows part_no (to match ItemsListView)
      const newPart: Part = {
        id: savedPart.id,
        partNo: (savedPart.master_part_no || "").trim(),
        masterPartNo: (savedPart.part_no || "").trim(),
        brand: savedPart.brand_name || savedPart.brand || "-",
        uom: savedPart.uom || "NOS",
        weight: savedPart.weight ? String(savedPart.weight) : "-",
        cost: savedPart.cost ? parseFloat(savedPart.cost) : null,
        purchasePrice: savedPart.purchasePrice
          ? parseFloat(savedPart.purchasePrice)
          : null,
        avgCost: savedPart.avgCost ? parseFloat(savedPart.avgCost) : null,
        price: savedPart.price_a ? parseFloat(savedPart.price_a) : null,
        stock: savedPart.qty || savedPart.stock || 0,
        reservedStock: savedPart.reserved_stock || 0,
      };

      if (selectedPart) {
        setParts((prev) =>
          prev.map((p) => (p.id === selectedPart.id ? newPart : p)),
        );
        setSelectedPart(null);
      } else {
        setParts((prev) => [newPart, ...prev]);
      }

      await fetchItems(itemsPage, itemsPerPage, searchFilters);

      toast({
        title: "Success",
        description: selectedPart
          ? "Part updated successfully"
          : "Part created successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save part",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKit = (kitData: any) => {
    setKitRefreshTrigger((prev) => prev + 1);
  };

  const handleDeleteKit = (kit: Kit) => {
    setKitRefreshTrigger((prev) => prev + 1);
  };

  const handleUpdateKit = (updatedKit: Kit) => {
    setKitRefreshTrigger((prev) => prev + 1);
  };

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg">
      {/* Left Section - Forms */}
      <ResizablePanel defaultSize={60} minSize={20} maxSize={80}>
        <div className="h-full flex flex-col pr-3">
          {/* Left Tabs */}
          <div className="flex border-b border-border mb-3">
            <button
              onClick={() => {
                setLeftTab("part-entry");
                setRightTab("parts-list");
              }}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-all relative",
                leftTab === "part-entry"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Part Entry
              {leftTab === "part-entry" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => {
                setLeftTab("create-kit");
                setRightTab("kits-list");
              }}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-all relative",
                leftTab === "create-kit"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Create Kit
              {leftTab === "create-kit" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-auto">
            {leftTab === "part-entry" ? (
              <PartEntryForm
                onSave={handleSavePart}
                selectedPart={selectedPart}
                onClearSelection={() => {
                  setSelectedPart(null);
                  setSelectedMasterPartNo(null);

                  setSearchFilters((prev: any) => ({
                    ...prev,
                    master_part_no: "",
                    part_no: "",
                  }));

                  // Optimized: Fetch with smaller initial limit for faster response
                  // The PartsList component handles pagination client-side, so we don't need all parts at once
                  const fetchAllParts = async () => {
                    setLoading(true);
                    try {
                      const response = await apiClient.getPartEntryList({
                        limit: 500,
                        page: 1,
                      });
                      const responseData = (response as any).data;
                      if (responseData && Array.isArray(responseData)) {
                        const transformedParts: Part[] = responseData.map(
                          (p: any) => ({
                            id: p.id,
                            partNo: (p.master_part_no || "").trim(),
                            brand: p.brand_name || "-",
                            uom: p.uom || "NOS",
                            weight: p.weight ? String(p.weight) : "-",
                            cost: p.cost ? parseFloat(p.cost) : null,
                            purchasePrice: null,
                            avgCost: null,
                            price: p.price_a ? parseFloat(p.price_a) : null,
                            stock: p.stock || 0,
                            reservedStock: p.reserved_stock || 0,
                            masterPartNo: (p.part_no || "").trim(),
                          }),
                        );
                        setParts(transformedParts);
                      }
                    } catch (error: any) {
                    } finally {
                      setLoading(false);
                    }
                  };
                  fetchAllParts();
                }}
                onPartSelected={(valueFromDropdown: string) => {
                  // SWAPPED: "Master Part No" dropdown passes part_no values, so filter by part_no
                  setSelectedMasterPartNo(valueFromDropdown || null);

                  if (valueFromDropdown) {
                    const newFilters = {
                      ...searchFilters,
                      part_no: valueFromDropdown.trim(),
                      master_part_no: "",
                    };
                    setSearchFilters(newFilters);
                    setItemsPage(1);
                    fetchItems(1, itemsPerPage, newFilters);

                    const fetchPartsByMasterPart = async () => {
                      setLoading(true);
                      try {
                        const response = await apiClient.getPartEntryList({
                          part_no: valueFromDropdown.trim(),
                          limit: 10000,
                        });

                        const partsData = (response as any).data || [];

                        if (partsData.length > 0) {
                          const transformedParts: Part[] = partsData.map(
                            (p: any) => ({
                              id: p.id,
                              partNo: (p.master_part_no || "").trim(),
                              brand: p.brand_name || "-",
                              uom: p.uom || "NOS",
                              weight: p.weight ? String(p.weight) : "-",
                              cost: p.cost ? parseFloat(p.cost) : null,
                              purchasePrice: null,
                              avgCost: null,
                              price: p.price_a ? parseFloat(p.price_a) : null,
                              stock: p.stock || 0,
                              reservedStock: p.reserved_stock || 0,
                              masterPartNo: (p.part_no || "").trim(),
                            }),
                          );
                          setParts(transformedParts);
                        } else {
                          setParts([]);
                        }
                      } catch (error: any) {
                        setParts([]);
                      } finally {
                        setLoading(false);
                      }
                    };

                    fetchPartsByMasterPart();
                  }
                }}
                onPartNoSelected={(valueFromDropdown: string) => {
                  // When Part No is selected, keep showing ALL family parts (don't filter to single part)
                  // The Parts List should continue showing the whole family based on Master Part No
                  if (valueFromDropdown && selectedMasterPartNo) {
                    // Keep the filter by Master Part No (part_no column) to show whole family
                    const newFilters = {
                      ...searchFilters,
                      part_no: selectedMasterPartNo.trim(),
                      master_part_no: "",
                    };
                    setSearchFilters(newFilters);
                    setItemsPage(1);
                    fetchItems(1, itemsPerPage, newFilters);
                    // Don't change the Parts List - keep showing all family parts
                  } else if (valueFromDropdown && !selectedMasterPartNo) {
                    // No Master Part selected, filter by the Part No's family
                    const fetchFamilyByPartNo = async () => {
                      setLoading(true);
                      try {
                        const response = await apiClient.getPartEntryList({
                          search: valueFromDropdown.trim(),
                          limit: 1,
                        });

                        const partsData = (response as any).data || [];

                        if (partsData.length > 0) {
                          const masterPartNo = (partsData[0].master_part_no || "").trim();
                          const actualPartNo = (partsData[0].part_no || "").trim();

                          if (actualPartNo) {
                            const familyResponse = await apiClient.getPartEntryList({
                              part_no: actualPartNo,
                              limit: 10000,
                            });

                            const familyData = (familyResponse as any).data || [];

                            if (familyData.length > 0) {
                              const transformedParts: Part[] = familyData.map(
                                (p: any) => ({
                                  id: p.id,
                                  partNo: (p.master_part_no || "").trim(),
                                  brand: p.brand_name || "-",
                                  uom: p.uom || "NOS",
                                  weight: p.weight ? String(p.weight) : "-",
                                  cost: p.cost ? parseFloat(p.cost) : null,
                                  purchasePrice: null,
                                  avgCost: null,
                                  price: p.price_a ? parseFloat(p.price_a) : null,
                                  stock: p.stock || 0,
                                  reservedStock: p.reserved_stock || 0,
                                  masterPartNo: (p.part_no || "").trim(),
                                }),
                              );
                              setParts(transformedParts);
                              setSelectedMasterPartNo(actualPartNo);
                            }
                          }
                        }
                      } catch (error: any) {
                      } finally {
                        setLoading(false);
                      }
                    };

                    fetchFamilyByPartNo();
                  } else {
                    const newFilters = {
                      ...searchFilters,
                      part_no: "",
                    };
                    setSearchFilters(newFilters);
                    setItemsPage(1);
                    fetchItems(1, itemsPerPage, newFilters);

                    const fetchAllParts = async () => {
                      setLoading(true);
                      try {
                        const response = await apiClient.getPartEntryList({
                          limit: 10000,
                        });
                        const responseData = (response as any).data;
                        if (responseData && Array.isArray(responseData)) {
                          const transformedParts: Part[] = responseData.map(
                            (p: any) => ({
                              id: p.id,
                              partNo: (p.master_part_no || "").trim(),
                              brand: p.brand_name || "-",
                              uom: p.uom || "NOS",
                              weight: p.weight ? String(p.weight) : "-",
                              cost: p.cost ? parseFloat(p.cost) : null,
                              purchasePrice: null,
                              avgCost: null,
                              price: p.price_a ? parseFloat(p.price_a) : null,
                              stock: p.stock || 0,
                              reservedStock: p.reserved_stock || 0,
                              masterPartNo: (p.part_no || "").trim(),
                            }),
                          );
                          setParts(transformedParts);
                        }
                      } catch (error: any) {
                      } finally {
                        setLoading(false);
                      }
                    };

                    fetchAllParts();
                  }
                }}
              />
            ) : (
              <CreateKitForm onSave={handleSaveKit} />
            )}
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle
        withHandle
        className="mx-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary"
      />

      {/* Right Section - Lists */}
      <ResizablePanel defaultSize={40} minSize={20} maxSize={80}>
        <div className="h-full flex flex-col pl-3">
          {/* Right Tabs */}
          <div className="flex border-b border-border mb-3">
            <button
              onClick={() => setRightTab("parts-list")}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-all relative flex-1 text-center",
                rightTab === "parts-list"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Parts List
              {rightTab === "parts-list" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setRightTab("kits-list")}
              className={cn(
                "px-4 py-2 text-xs font-medium transition-all relative flex-1 text-center",
                rightTab === "kits-list"
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Kits List
              {rightTab === "kits-list" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-hidden">
            {rightTab === "parts-list" ? (
              <PartsList
                parts={parts}
                onSelectPart={async (part) => {
                  setSelectedPart(part);
                  setLeftTab("part-entry");

                  // Fetch family parts when a part is selected from the list
                  if (part.masterPartNo) {
                    setSelectedMasterPartNo(part.masterPartNo);
                    setLoading(true);
                    try {
                      const response = await apiClient.getPartEntryList({
                        part_no: part.masterPartNo.trim(),
                        limit: 10000,
                      });

                      const partsData = (response as any).data || [];

                      if (partsData.length > 0) {
                        const transformedParts: Part[] = partsData.map(
                          (p: any) => ({
                            id: p.id,
                            partNo: (p.master_part_no || "").trim(),
                            brand: p.brand_name || "-",
                            uom: p.uom || "NOS",
                            weight: p.weight ? String(p.weight) : "-",
                            cost: p.cost ? parseFloat(p.cost) : null,
                            purchasePrice: null,
                            avgCost: null,
                            price: p.price_a ? parseFloat(p.price_a) : null,
                            stock: p.stock || 0,
                            reservedStock: p.reserved_stock || 0,
                            masterPartNo: (p.part_no || "").trim(),
                          }),
                        );
                        setParts(transformedParts);
                      }
                    } catch (error: any) {
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
              />
            ) : (
              <KitsList
                refreshTrigger={kitRefreshTrigger}
                onDelete={handleDeleteKit}
                onUpdateKit={handleUpdateKit}
              />
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
