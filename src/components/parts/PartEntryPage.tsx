import { useState, useEffect } from "react";
import { PartEntryForm } from "@/components/parts/PartEntryForm";
import { PartsList, Part } from "@/components/parts/PartsList";
import { cn } from "@/lib/utils";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

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
  const [rightTab, setRightTab] = useState<RightTab>("parts-list");
  const [selectedPart, setSelectedPart] = useState<Part | null>(null);
  const [parts, setParts] = useState<Part[]>([]);
  const [selectedMasterPartNo, setSelectedMasterPartNo] = useState<
    string | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [kitParts, setKitParts] = useState<Part[]>([]);

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
            type: p.type || "single",
            uom: p.uom || "NOS",
            weight: p.weight ? String(p.weight) : "-",
            cost: p.cost ? parseFloat(p.cost) : null,
            purchasePrice: null, // Minimal fields for dedicated list
            avgCost: null,
            price: p.price_a ? parseFloat(p.price_a) : null,
            priceA:
              p.price_a !== undefined && p.price_a !== null && p.price_a !== ""
                ? parseFloat(p.price_a)
                : p.priceA !== undefined && p.priceA !== null && p.priceA !== ""
                  ? parseFloat(p.priceA)
                  : null,
            priceB:
              p.price_b !== undefined && p.price_b !== null && p.price_b !== ""
                ? parseFloat(p.price_b)
                : p.priceB !== undefined && p.priceB !== null && p.priceB !== ""
                  ? parseFloat(p.priceB)
                  : null,
            stock: p.stock || 0,
            reservedStock: p.reserved_stock || 0,
            masterPartNo: (p.part_no || "").trim(),
            modelTotalQty: p.model_total_qty != null ? p.model_total_qty : undefined,
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
        return false;
      }

      // SWAPPED mapping to match ItemsListView display convention:
      // - "Master Part No" UI field saves to part_no column
      // - "Part No" UI field saves to master_part_no column
      const apiData: any = {
        part_no: String(partData.masterPartNo || "").trim(),
        master_part_no: String(partData.partNo).trim(),
        brand_name: partData.brand || null,
        type: partData.type || "single",
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
        remarks: partData.remarks?.trim() ? partData.remarks.trim() : null,
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
        kit_items:
          (partData.kitItems || [])
            .filter((row: any) => row && row.itemPartId)
            .map((row: any) => ({
              item_part_id: String(row.itemPartId).trim(),
              quantity: Number(row.quantity || 1),
            })) || [],
      };

      const updatePartId =
        partData.saveMode === "update"
          ? partData.editingPartId || selectedPart?.id || null
          : null;

      // Handle images
      if (updatePartId) {
        apiData.image_p1 =
          partData.imageP1 !== undefined ? partData.imageP1 : null;
        apiData.image_p2 =
          partData.imageP2 !== undefined ? partData.imageP2 : null;
      } else {
        if (partData.imageP1) apiData.image_p1 = partData.imageP1;
        if (partData.imageP2) apiData.image_p2 = partData.imageP2;
      }

      let response;
      if (updatePartId) {
        response = await apiClient.updatePart(updatePartId, apiData);
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
        type: savedPart.type || partData.type || "single",
        uom: savedPart.uom || "NOS",
        weight: savedPart.weight ? String(savedPart.weight) : "-",
        cost: savedPart.cost ? parseFloat(savedPart.cost) : null,
        purchasePrice: savedPart.purchasePrice
          ? parseFloat(savedPart.purchasePrice)
          : null,
        avgCost: savedPart.avgCost ? parseFloat(savedPart.avgCost) : null,
        price: savedPart.price_a ? parseFloat(savedPart.price_a) : null,
        priceA:
          savedPart.price_a !== undefined &&
          savedPart.price_a !== null &&
          savedPart.price_a !== ""
            ? parseFloat(savedPart.price_a)
            : savedPart.priceA !== undefined &&
                savedPart.priceA !== null &&
                savedPart.priceA !== ""
              ? parseFloat(savedPart.priceA)
              : null,
        priceB:
          savedPart.price_b !== undefined &&
          savedPart.price_b !== null &&
          savedPart.price_b !== ""
            ? parseFloat(savedPart.price_b)
            : savedPart.priceB !== undefined &&
                savedPart.priceB !== null &&
                savedPart.priceB !== ""
              ? parseFloat(savedPart.priceB)
              : null,
        stock: savedPart.qty || savedPart.stock || 0,
        reservedStock: savedPart.reserved_stock || 0,
        modelTotalQty:
          savedPart.model_total_qty != null
            ? savedPart.model_total_qty
            : partData.modelQuantities?.reduce((s: number, mq: any) => s + (mq?.qty || 0), 0),
      };

      if (updatePartId) {
        setParts((prev) =>
          prev.map((p) => (p.id === updatePartId ? newPart : p)),
        );
      } else {
        setParts((prev) => [newPart, ...prev]);
      }
      setSelectedPart(null);

      await fetchItems(itemsPage, itemsPerPage, searchFilters);

      toast({
        title: "Success",
        description: updatePartId
          ? "Part updated successfully"
          : "Part created successfully",
      });
      return true;
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save part",
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (rightTab !== "kits-list") return;

    const fetchKitParts = async () => {
      setLoading(true);
      try {
        const response = await apiClient.getPartEntryList({ limit: "all", page: 1 });
        const responseData = (response as any).data;
        if (responseData && Array.isArray(responseData)) {
          const transformedKitParts: Part[] = responseData
            .filter((p: any) => (p.type || "single") === "kit")
            .map((p: any) => ({
              id: p.id,
              partNo: (p.master_part_no || "").trim(),
              brand: p.brand_name || "-",
              type: p.type || "single",
              uom: p.uom || "NOS",
              weight: p.weight ? String(p.weight) : "-",
              cost: p.cost ? parseFloat(p.cost) : null,
              purchasePrice: null,
              avgCost: null,
              price: p.price_a ? parseFloat(p.price_a) : null,
              priceA:
                p.price_a !== undefined && p.price_a !== null && p.price_a !== ""
                  ? parseFloat(p.price_a)
                  : p.priceA !== undefined && p.priceA !== null && p.priceA !== ""
                    ? parseFloat(p.priceA)
                    : null,
              priceB:
                p.price_b !== undefined && p.price_b !== null && p.price_b !== ""
                  ? parseFloat(p.price_b)
                  : p.priceB !== undefined && p.priceB !== null && p.priceB !== ""
                    ? parseFloat(p.priceB)
                    : null,
              stock: p.stock || 0,
              reservedStock: p.reserved_stock || 0,
              masterPartNo: (p.part_no || "").trim(),
              modelTotalQty:
                p.model_total_qty != null ? p.model_total_qty : undefined,
            }));
          setKitParts(transformedKitParts);
        } else {
          setKitParts([]);
        }
      } catch (error: any) {
        setKitParts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchKitParts();
  }, [rightTab]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full rounded-lg">
      {/* Left Section - Forms */}
      <ResizablePanel defaultSize={60} minSize={25} maxSize={85}>
        <div className="h-full flex flex-col pr-3">
          {/* Form Content */}
          <div className="flex-1 overflow-auto">
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
                          type: p.type || "single",
                          uom: p.uom || "NOS",
                          weight: p.weight ? String(p.weight) : "-",
                          cost: p.cost ? parseFloat(p.cost) : null,
                          purchasePrice: null,
                          avgCost: null,
                          price: p.price_a ? parseFloat(p.price_a) : null,
                          priceA:
                            p.price_a !== undefined &&
                            p.price_a !== null &&
                            p.price_a !== ""
                              ? parseFloat(p.price_a)
                              : p.priceA !== undefined &&
                                  p.priceA !== null &&
                                  p.priceA !== ""
                                ? parseFloat(p.priceA)
                                : null,
                          priceB:
                            p.price_b !== undefined &&
                            p.price_b !== null &&
                            p.price_b !== ""
                              ? parseFloat(p.price_b)
                              : p.priceB !== undefined &&
                                  p.priceB !== null &&
                                  p.priceB !== ""
                                ? parseFloat(p.priceB)
                                : null,
                          stock: p.stock || 0,
                          reservedStock: p.reserved_stock || 0,
                          masterPartNo: (p.part_no || "").trim(),
                          modelTotalQty: p.model_total_qty != null ? p.model_total_qty : undefined,
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
                              type: p.type || "single",
                              uom: p.uom || "NOS",
                              weight: p.weight ? String(p.weight) : "-",
                              cost: p.cost ? parseFloat(p.cost) : null,
                              purchasePrice: null,
                              avgCost: null,
                              price: p.price_a ? parseFloat(p.price_a) : null,
                              priceA:
                                p.price_a !== undefined &&
                                p.price_a !== null &&
                                p.price_a !== ""
                                  ? parseFloat(p.price_a)
                                  : p.priceA !== undefined &&
                                      p.priceA !== null &&
                                      p.priceA !== ""
                                    ? parseFloat(p.priceA)
                                    : null,
                              priceB:
                                p.price_b !== undefined &&
                                p.price_b !== null &&
                                p.price_b !== ""
                                  ? parseFloat(p.price_b)
                                  : p.priceB !== undefined &&
                                      p.priceB !== null &&
                                      p.priceB !== ""
                                    ? parseFloat(p.priceB)
                                    : null,
                              stock: p.stock || 0,
                              reservedStock: p.reserved_stock || 0,
                              masterPartNo: (p.part_no || "").trim(),
                              modelTotalQty: p.model_total_qty != null ? p.model_total_qty : undefined,
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
                                  type: p.type || "single",
                                  uom: p.uom || "NOS",
                                  weight: p.weight ? String(p.weight) : "-",
                                  cost: p.cost ? parseFloat(p.cost) : null,
                                  purchasePrice: null,
                                  avgCost: null,
                                  price: p.price_a ? parseFloat(p.price_a) : null,
                                  priceA:
                                    p.price_a !== undefined &&
                                    p.price_a !== null &&
                                    p.price_a !== ""
                                      ? parseFloat(p.price_a)
                                      : p.priceA !== undefined &&
                                          p.priceA !== null &&
                                          p.priceA !== ""
                                        ? parseFloat(p.priceA)
                                        : null,
                                  priceB:
                                    p.price_b !== undefined &&
                                    p.price_b !== null &&
                                    p.price_b !== ""
                                      ? parseFloat(p.price_b)
                                      : p.priceB !== undefined &&
                                          p.priceB !== null &&
                                          p.priceB !== ""
                                        ? parseFloat(p.priceB)
                                        : null,
                                  stock: p.stock || 0,
                                  reservedStock: p.reserved_stock || 0,
                                  masterPartNo: (p.part_no || "").trim(),
                                  modelTotalQty: p.model_total_qty != null ? p.model_total_qty : undefined,
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
                              type: p.type || "single",
                              uom: p.uom || "NOS",
                              weight: p.weight ? String(p.weight) : "-",
                              cost: p.cost ? parseFloat(p.cost) : null,
                              purchasePrice: null,
                              avgCost: null,
                              price: p.price_a ? parseFloat(p.price_a) : null,
                              priceA:
                                p.price_a !== undefined &&
                                p.price_a !== null &&
                                p.price_a !== ""
                                  ? parseFloat(p.price_a)
                                  : p.priceA !== undefined &&
                                      p.priceA !== null &&
                                      p.priceA !== ""
                                    ? parseFloat(p.priceA)
                                    : null,
                              priceB:
                                p.price_b !== undefined &&
                                p.price_b !== null &&
                                p.price_b !== ""
                                  ? parseFloat(p.price_b)
                                  : p.priceB !== undefined &&
                                      p.priceB !== null &&
                                      p.priceB !== ""
                                    ? parseFloat(p.priceB)
                                    : null,
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
          </div>
        </div>
      </ResizablePanel>

      <ResizableHandle
        withHandle
        className="mx-1 bg-border hover:bg-primary/50 transition-colors data-[resize-handle-active]:bg-primary"
      />

      {/* Right Section - Lists */}
      <ResizablePanel defaultSize={40} minSize={15} maxSize={85}>
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
                            type: p.type || "single",
                            uom: p.uom || "NOS",
                            weight: p.weight ? String(p.weight) : "-",
                            cost: p.cost ? parseFloat(p.cost) : null,
                            purchasePrice: null,
                            avgCost: null,
                            price: p.price_a ? parseFloat(p.price_a) : null,
                            priceA:
                              p.price_a !== undefined &&
                              p.price_a !== null &&
                              p.price_a !== ""
                                ? parseFloat(p.price_a)
                                : p.priceA !== undefined &&
                                    p.priceA !== null &&
                                    p.priceA !== ""
                                  ? parseFloat(p.priceA)
                                  : null,
                            priceB:
                              p.price_b !== undefined &&
                              p.price_b !== null &&
                              p.price_b !== ""
                                ? parseFloat(p.price_b)
                                : p.priceB !== undefined &&
                                    p.priceB !== null &&
                                    p.priceB !== ""
                                  ? parseFloat(p.priceB)
                                  : null,
                            stock: p.stock || 0,
                            reservedStock: p.reserved_stock || 0,
                            masterPartNo: (p.part_no || "").trim(),
                            modelTotalQty: p.model_total_qty != null ? p.model_total_qty : undefined,
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
              <PartsList
                parts={kitParts}
                onSelectPart={async (part) => {
                  setSelectedPart(part);

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
                            type: p.type || "single",
                            uom: p.uom || "NOS",
                            weight: p.weight ? String(p.weight) : "-",
                            cost: p.cost ? parseFloat(p.cost) : null,
                            purchasePrice: null,
                            avgCost: null,
                            price: p.price_a ? parseFloat(p.price_a) : null,
                            priceA:
                              p.price_a !== undefined &&
                              p.price_a !== null &&
                              p.price_a !== ""
                                ? parseFloat(p.price_a)
                                : p.priceA !== undefined &&
                                    p.priceA !== null &&
                                    p.priceA !== ""
                                  ? parseFloat(p.priceA)
                                  : null,
                            priceB:
                              p.price_b !== undefined &&
                              p.price_b !== null &&
                              p.price_b !== ""
                                ? parseFloat(p.price_b)
                                : p.priceB !== undefined &&
                                    p.priceB !== null &&
                                    p.priceB !== ""
                                  ? parseFloat(p.priceB)
                                  : null,
                            stock: p.stock || 0,
                            reservedStock: p.reserved_stock || 0,
                            masterPartNo: (p.part_no || "").trim(),
                            modelTotalQty:
                              p.model_total_qty != null
                                ? p.model_total_qty
                                : undefined,
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
            )}
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
