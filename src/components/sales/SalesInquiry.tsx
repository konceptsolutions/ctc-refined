import { useState, useRef, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Search, Eye, FileText, CalendarIcon, Package, ShoppingCart, Boxes, Settings2, Truck, Printer, RefreshCw, ArrowRight, X, Trash2, Info } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { PrintableDocument, printDocument } from "./PrintableDocument";
import { apiClient } from "@/lib/api";

interface Inquiry {
  id: string;
  inquiryNo: string;
  inquiryDate: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  subject: string;
  description: string;
  status: "New" | "In Progress" | "Quoted" | "Closed" | "Cancelled";
  items?: InquiryItem[];
}

interface InquiryItem {
  id?: string;
  partId: string;
  quantity: number;
  purchasePrice?: number;
  priceA?: number;
  priceB?: number;
  priceM?: number;
  location?: string;
  stock?: number;
  reservedQty?: number;
  part?: {
    partNo: string;
    description?: string;
    brand?: { name: string };
    category?: { name: string };
  };
}

interface PartDetail {
  id?: string; // Part ID for fetching full details
  partNo: string;
  masterPart: string;
  brand: string;
  description: string;
  category: string;
  subCategory: string;
  application?: string;
  uom: string;
  hsCode: string;
  weight: string;
  cost: string;
  priceA: string;
  priceB: string;
  priceM: string;
  origin: string;
  grade: string;
  status: string;
  rackNo: string;
  reOrderLevel: string;
  quantity?: number; // Available stock quantity
}

export const SalesInquiry = () => {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [inquiryDate, setInquiryDate] = useState<Date>(new Date());
  const [formData, setFormData] = useState({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    subject: "",
    description: "",
    status: "New" as Inquiry["status"],
  });
  const [inquiryItems, setInquiryItems] = useState<InquiryItem[]>([]);
  const [loadingInquiries, setLoadingInquiries] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [fullInquiryData, setFullInquiryData] = useState<Inquiry | null>(null);
  const [printInquiry, setPrintInquiry] = useState<Inquiry | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [inquiryToDelete, setInquiryToDelete] = useState<Inquiry | null>(null);
  const [loadingInquiryDetails, setLoadingInquiryDetails] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  // Part lookup state with dropdowns
  const [masterPartSearch, setMasterPartSearch] = useState("");
  const [selectedMasterPart, setSelectedMasterPart] = useState<string | null>(null);
  const [partNoSearch, setPartNoSearch] = useState("");
  const [selectedPart, setSelectedPart] = useState<PartDetail | null>(null);
  const [showMasterDropdown, setShowMasterDropdown] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [partsData, setPartsData] = useState<PartDetail[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [loadingPartDetails, setLoadingPartDetails] = useState(false);
  const [rackMap, setRackMap] = useState<Record<string, string>>({});
  const [partIdMap, setPartIdMap] = useState<Record<string, string>>({}); // Map partNo to part ID
  const [purchaseOrderHistory, setPurchaseOrderHistory] = useState<any[]>([]);
  const [loadingPOHistory, setLoadingPOHistory] = useState(false);
  const [deletePODialogOpen, setDeletePODialogOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState<any | null>(null);
  const [salesInvoiceHistory, setSalesInvoiceHistory] = useState<any[]>([]);
  const [loadingSalesInvoiceHistory, setLoadingSalesInvoiceHistory] = useState(false);
  const [dpoHistory, setDpoHistory] = useState<any[]>([]);
  const [loadingDpoHistory, setLoadingDpoHistory] = useState(false);
  const [relatedKits, setRelatedKits] = useState<any[]>([]);
  const [loadingRelatedKits, setLoadingRelatedKits] = useState(false);
  const [partModels, setPartModels] = useState<any[]>([]);
  const [loadingPartModels, setLoadingPartModels] = useState(false);
  const [modelsSheetOpen, setModelsSheetOpen] = useState(false);
  const [selectedPartForModels, setSelectedPartForModels] = useState<PartDetail | null>(null);

  const masterDropdownRef = useRef<HTMLDivElement>(null);
  const partDropdownRef = useRef<HTMLDivElement>(null);

  // Fetch parts from database
  useEffect(() => {
    const fetchParts = async () => {
      setLoadingParts(true);
      try {
        const [partsResponse, balancesResponse] = await Promise.all([
          apiClient.getParts({
            status: 'active',
            limit: 10000,
            page: 1
          }).catch((err: any) => {
            return { error: err.message || 'Failed to fetch parts', data: [] };
          }),
          apiClient.getStockBalances({ limit: 10000 }).catch(() => ({ data: [], error: null }))
        ]);

        if ((partsResponse as any).error) {
          setPartsData([]);
          setPartIdMap({});
          toast({
            title: "Error",
            description: (partsResponse as any).error || "Failed to load parts from database",
            variant: "destructive",
          });
          return;
        }

        let partsDataArray: any[] = [];
        if (Array.isArray(partsResponse)) {
          partsDataArray = partsResponse;
        } else if ((partsResponse as any).data && Array.isArray((partsResponse as any).data)) {
          partsDataArray = (partsResponse as any).data;
        } else if ((partsResponse as any).pagination && (partsResponse as any).data) {
          partsDataArray = (partsResponse as any).data;
        }

        let balancesData: any[] = [];
        if (Array.isArray(balancesResponse)) {
          balancesData = balancesResponse;
        } else if ((balancesResponse as any).data && Array.isArray((balancesResponse as any).data)) {
          balancesData = (balancesResponse as any).data;
        }

        // Create rack map and stock quantity map from stock balances
        const rackMapData: Record<string, string> = {};
        const stockMapData: Record<string, number> = {};
        if (Array.isArray(balancesData)) {
          balancesData.forEach((b: any) => {
            if (b.part_id) {
              if (b.rack_no) {
                rackMapData[b.part_id] = b.rack_no;
              }
              if (b.current_stock !== undefined && b.current_stock !== null) {
                stockMapData[b.part_id] = b.current_stock;
              }
            }
          });
        }
        setRackMap(rackMapData);

        // Create part ID map
        const idMap: Record<string, string> = {};

        // Transform API data to PartDetail format
        const transformedParts: PartDetail[] = partsDataArray
          .filter((p: any) => p.status === 'active' || !p.status)
          .map((p: any) => {
            const partNo = String(p.part_no || p.partNo || '').trim();
            if (partNo && p.id) {
              idMap[partNo] = p.id;
            }

            // Format numbers properly
            const formatNumber = (val: any): string => {
              if (val === null || val === undefined || val === '') return '0';
              const num = parseFloat(val);
              if (isNaN(num)) return '0';
              // Remove unnecessary decimals if whole number
              return num % 1 === 0 ? String(num) : num.toFixed(2);
            };

            return {
              id: p.id,
              partNo: String(p.master_part_no || p.masterPart || p.master_part_no || '').trim() || 'N/A',
              masterPart: partNo,
              brand: String(p.brand_name || p.brand || '').trim() || 'N/A',
              description: String(p.description || p.part_no || '').trim() || 'No description',
              category: String(p.category_name || p.category || '').trim() || 'N/A',
              subCategory: String(p.subcategory_name || p.subcategory || '').trim() || 'N/A',
              uom: String(p.uom || 'NOS').trim(),
              hsCode: String(p.hs_code || p.hsCode || '').trim() || 'N/A',
              weight: formatNumber(p.weight),
              cost: formatNumber(p.cost),
              priceA: formatNumber(p.price_a || p.priceA),
              priceB: formatNumber(p.price_b || p.priceB),
              priceM: formatNumber(p.price_m || p.priceM),
              origin: String(p.origin || '').trim() || 'N/A',
              grade: String(p.grade || 'A').trim(),
              status: (p.status || 'active').toUpperCase() === 'ACTIVE' ? 'A' : 'I',
              rackNo: rackMapData[p.id] || 'N/A',
              reOrderLevel: formatNumber(p.reorder_level || p.reorderLevel),
              quantity: stockMapData[p.id] !== undefined ? stockMapData[p.id] : 0,
            };
          })
          .filter((p: PartDetail) => p.partNo && p.partNo.trim() !== '');

        setPartIdMap(idMap);
        setPartsData(transformedParts);
      } catch (error: any) {
        setPartsData([]);
        setPartIdMap({});
        const errorMessage = error?.message || error?.toString() || "Failed to fetch parts from database";
        toast({
          title: "Error",
          description: errorMessage.includes('502') || errorMessage.includes('Bad Gateway')
            ? "Backend server is not responding. Please check if the server is running."
            : errorMessage,
          variant: "destructive",
        });
      } finally {
        setLoadingParts(false);
      }
    };

    fetchParts();
  }, []);

  // Fetch inquiries from backend
  useEffect(() => {
    const fetchInquiries = async () => {
      setLoadingInquiries(true);
      try {
        const response = await apiClient.getSalesInquiries();
        if ((response as any).error) {
          toast({
            title: "Error",
            description: "Failed to load inquiries",
            variant: "destructive",
          });
          return;
        }
        const inquiriesData = Array.isArray(response) ? response : ((response as any).data || []);
        setInquiries(inquiriesData as any);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch inquiries",
          variant: "destructive",
        });
      } finally {
        setLoadingInquiries(false);
      }
    };

    fetchInquiries();
  }, []);

  // Fetch purchase order history when a part is selected
  useEffect(() => {
    const fetchPOHistory = async () => {
      if (!selectedPart || !partIdMap[selectedPart.partNo]) {
        setPurchaseOrderHistory([]);
        return;
      }

      setLoadingPOHistory(true);
      try {
        const partId = partIdMap[selectedPart.partNo];
        const response = await apiClient.getPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 100,
        });

        if ((response as any).error) {
          setPurchaseOrderHistory([]);
          return;
        }

        const poData = Array.isArray(response) ? response : ((response as any).data || []);
        // Backend already returns data in the correct format, just ensure it's properly set
        setPurchaseOrderHistory(poData as any);
      } catch (error: any) {
        setPurchaseOrderHistory([]);
      } finally {
        setLoadingPOHistory(false);
      }
    };

    fetchPOHistory();
  }, [selectedPart, partIdMap]);

  // Fetch sales invoice history when a part is selected
  useEffect(() => {
    const fetchSalesInvoiceHistory = async () => {
      if (!selectedPart || !partIdMap[selectedPart.partNo]) {
        setSalesInvoiceHistory([]);
        return;
      }

      setLoadingSalesInvoiceHistory(true);
      try {
        const partId = partIdMap[selectedPart.partNo];
        const response = await apiClient.getSalesInvoicesByPart(partId, {
          page: 1,
          limit: 100,
        });

        if ((response as any).error) {
          setSalesInvoiceHistory([]);
          return;
        }

        const invoiceData = Array.isArray(response) ? response : ((response as any).data || []);
        setSalesInvoiceHistory(invoiceData as any);
      } catch (error: any) {
        setSalesInvoiceHistory([]);
      } finally {
        setLoadingSalesInvoiceHistory(false);
      }
    };

    fetchSalesInvoiceHistory();
  }, [selectedPart, partIdMap]);

  // Fetch direct purchase order history when a part is selected
  useEffect(() => {
    const fetchDpoHistory = async () => {
      if (!selectedPart || !partIdMap[selectedPart.partNo]) {
        setDpoHistory([]);
        return;
      }

      setLoadingDpoHistory(true);
      try {
        const partId = partIdMap[selectedPart.partNo];
        const response = await apiClient.getDirectPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 50,
        });

        if ((response as any).error) {
          setDpoHistory([]);
          return;
        }

        const dpoListData = Array.isArray(response) ? response : ((response as any).data || []);

        // Fetch full details for the first 10 orders to get specific item data (prices, qty per part)
        // This is necessary because the list endpoint usually doesn't return line items
        const enrichedData = await Promise.all(
          dpoListData.slice(0, 10).map(async (dpo: any) => {
            try {
              const fullDpoResponse = await apiClient.getDirectPurchaseOrder(dpo.id) as any;
              const fullDpo = fullDpoResponse.data || fullDpoResponse;

              if (fullDpo && fullDpo.items) {
                const item = fullDpo.items.find((i: any) =>
                  String(i.part_id) === String(partId) || String(i.partId) === String(partId)
                );
                if (item) {
                  // Calculate DPO Cost Price including distributed expenses
                  const purchasePrice = item.purchase_price ?? item.purchasePrice ?? 0;
                  const itemQty = item.quantity ?? item.qty ?? 1;
                  const itemAmount = purchasePrice * itemQty;

                  // Calculate total expenses for this DPO
                  const dpoExpenses = fullDpo.expenses || [];
                  const totalExpenses = dpoExpenses.reduce((sum: number, exp: any) => {
                    const amount = exp.amount || exp.expense_amount || 0;
                    return sum + amount;
                  }, 0);

                  // Calculate distributed expense for this item (weighted by item amount)
                  const allItems = fullDpo.items || [];
                  const totalItemsAmount = allItems.reduce((sum: number, item: any) => {
                    const price = item.purchase_price ?? item.purchasePrice ?? 0;
                    const qty = item.quantity ?? item.qty ?? 0;
                    return sum + (price * qty);
                  }, 0);

                  const distributedExpense = totalItemsAmount > 0
                    ? (itemAmount / totalItemsAmount) * totalExpenses
                    : 0;

                  // Calculate cost per unit including distributed expenses
                  const costPerUnitWithExpenses = itemQty > 0
                    ? (itemAmount + distributedExpense) / itemQty
                    : purchasePrice;

                  return { 
                    ...fullDpo, 
                    item,
                    costPriceWithExpenses: costPerUnitWithExpenses
                  };
                }
              }
              return dpo;
            } catch (err) {
              return dpo;
            }
          })
        );

        // Map to ensure we have date and other required fields if they're named differently
        let finalData = enrichedData.map((dpo: any) => ({
          ...dpo,
          date: dpo.date || dpo.request_date || dpo.requestDate,
          dpo_no: dpo.dpo_no || dpo.dpo_number || dpo.dpoNo,
          supplier_name: dpo.supplier_name || dpo.supplier?.name || dpo.customer_name || dpo.customer,
          qty: dpo.item?.quantity || dpo.qty || 0,
          rate: dpo.item?.purchase_price || dpo.rate || 0,
          amount: dpo.item?.amount || dpo.amount || 0,
        }));

        // Filter out DPOs with zero quantity or zero amount (invalid/empty entries)
        finalData = finalData.filter((dpo: any) => {
          const qty = dpo.qty || dpo.item?.quantity || 0;
          const amount = dpo.amount || dpo.item?.amount || 0;
          // Only include DPOs with valid quantity and amount
          return qty > 0 && amount > 0;
        });

        // Sort by date descending (most recent first)
        finalData.sort((a: any, b: any) => {
          const dateA = a.date ? new Date(a.date).getTime() : 0;
          const dateB = b.date ? new Date(b.date).getTime() : 0;
          return dateB - dateA; // Descending order (newest first)
        });

        setDpoHistory(finalData as any);
      } catch (error: any) {
        setDpoHistory([]);
      } finally {
        setLoadingDpoHistory(false);
      }
    };

    fetchDpoHistory();
  }, [selectedPart, partIdMap]);

  // Fetch models when models sheet opens
  useEffect(() => {
    const fetchModels = async () => {
      if (!modelsSheetOpen || !selectedPartForModels?.id) {
        setPartModels([]);
        return;
      }

      setLoadingPartModels(true);
      try {
        const response = await apiClient.getPart(selectedPartForModels.id);
        
        if ((response as any).error) {
          toast({
            title: "Error",
            description: (response as any).error || "Failed to fetch models",
            variant: "destructive",
          });
          setPartModels([]);
          return;
        }

        const responseData = (response as any).data || response;
        const apiModels = responseData?.models || [];
        
        const transformedModels = apiModels.map((m: any) => ({
          id: m.id,
          name: m.name,
          qtyUsed: m.qty_used || m.qtyUsed || 1,
          partId: selectedPartForModels.id,
        }));
        
        setPartModels(transformedModels);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch models",
          variant: "destructive",
        });
        setPartModels([]);
      } finally {
        setLoadingPartModels(false);
      }
    };

    fetchModels();
  }, [modelsSheetOpen, selectedPartForModels]);

  // Get unique master part numbers from database
  const masterPartNumbers = useMemo(() => {
    const uniqueMasters = [...new Set(partsData.map((item) => item.masterPart))].filter(Boolean);
    if (masterPartSearch) {
      return uniqueMasters.filter((master) =>
        master.toLowerCase().includes(masterPartSearch.toLowerCase())
      );
    }
    return uniqueMasters;
  }, [masterPartSearch, partsData]);

  // Filter parts based on search and selected master part
  const filteredParts = useMemo(() => {
    let filtered = partsData;
    if (selectedMasterPart) {
      filtered = filtered.filter((item) => item.masterPart === selectedMasterPart);
    }
    if (partNoSearch) {
      const searchLower = partNoSearch.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.partNo.toLowerCase().includes(searchLower) ||
          item.description.toLowerCase().includes(searchLower) ||
          item.brand.toLowerCase().includes(searchLower)
      );
    }
    return filtered;
  }, [selectedMasterPart, partNoSearch, partsData]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (masterDropdownRef.current && !masterDropdownRef.current.contains(event.target as Node)) {
        setShowMasterDropdown(false);
      }
      if (partDropdownRef.current && !partDropdownRef.current.contains(event.target as Node)) {
        setShowPartDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelectMasterPart = (master: string) => {
    setSelectedMasterPart(master);
    setMasterPartSearch(master);
    setShowMasterDropdown(false);
    // Reset part selection when master changes
    setSelectedPart(null);
    setPartNoSearch("");
  };

  const handleSelectPart = async (part: PartDetail) => {
    setSelectedPart(part);
    setPartNoSearch(part.partNo);
    // Auto-fill master part field when part is selected
    if (part.masterPart) {
      setMasterPartSearch(part.masterPart);
      setSelectedMasterPart(part.masterPart);
    }
    setShowPartDropdown(false);

    // Fetch full part details if we have the ID
    if (part.id) {
      setLoadingPartDetails(true);
      try {
        const [partResponse, stockResponse] = await Promise.all([
          apiClient.getPart(part.id),
          apiClient.getStockBalance(part.id).catch(() => ({ current_stock: 0, error: null }))
        ]);

        if ((partResponse as any).error) {
          // Keep the selected part from list if API fails
          return;
        }

        const p = (partResponse as any).data || partResponse;
        const stockData = (stockResponse as any).data || stockResponse;

        // Format numbers properly
        const formatNumber = (val: any): string => {
          if (val === null || val === undefined || val === '') return '0';
          const num = parseFloat(val);
          if (isNaN(num)) return '0';
          return num % 1 === 0 ? String(num) : num.toFixed(2);
        };

        // Get master part number from API response
        const masterPartFromAPI = String((p as any).master_part_no || (p as any).masterPart || part.masterPart || '').trim();

        // Update master part fields with API data
        if (masterPartFromAPI) {
          setMasterPartSearch(masterPartFromAPI);
          setSelectedMasterPart(masterPartFromAPI);
        }

        // Update selected part with full details
        const fullPartDetails: PartDetail = {
          id: (p as any).id,
          partNo: String((p as any).master_part_no || (p as any).masterPart || part.partNo || '').trim() || 'N/A',
          masterPart: String((p as any).part_no || (p as any).partNo || part.masterPart || '').trim(),
          brand: String((p as any).brand_name || (p as any).brand || '').trim() || 'N/A',
          description: String((p as any).description || '').trim() || 'No description',
          category: String((p as any).category_name || (p as any).category || '').trim() || 'N/A',
          subCategory: String((p as any).subcategory_name || (p as any).subcategory || '').trim() || 'N/A',
          uom: String((p as any).uom || 'NOS').trim(),
          hsCode: String((p as any).hs_code || (p as any).hsCode || '').trim() || 'N/A',
          weight: formatNumber((p as any).weight),
          cost: formatNumber((p as any).cost),
          priceA: formatNumber((p as any).price_a || (p as any).priceA),
          priceB: formatNumber((p as any).price_b || (p as any).priceB),
          priceM: formatNumber((p as any).price_m || (p as any).priceM),
          origin: String((p as any).origin || '').trim() || 'N/A',
          grade: String((p as any).grade || 'A').trim(),
          status: ((p as any).status || 'active').toUpperCase() === 'ACTIVE' ? 'A' : 'I',
          rackNo: (rackMap[(p as any).id] && rackMap[(p as any).id] !== 'N/A') ? rackMap[(p as any).id] : 'N/A',
          reOrderLevel: formatNumber((p as any).reorder_level || (p as any).reorderLevel),
          quantity: (stockData as any).current_stock !== undefined ? (stockData as any).current_stock : (part.quantity || 0),
        };

        setSelectedPart(fullPartDetails);
      } catch (error: any) {
        // Keep the selected part from list if API fails
      } finally {
        setLoadingPartDetails(false);
      }
    }
  };

  const handleClearSearch = () => {
    setMasterPartSearch("");
    setSelectedMasterPart(null);
    setPartNoSearch("");
    setSelectedPart(null);
  };

  const handleRefreshParts = async () => {
    setLoadingParts(true);
    try {
      const [partsResponse, balancesResponse] = await Promise.all([
        apiClient.getParts({
          status: 'active',
          limit: 10000,
          page: 1
        }),
        apiClient.getStockBalances({ limit: 10000 }).catch(() => ({ data: [], error: null }))
      ]);

      let partsDataArray: any[] = [];
      if (Array.isArray(partsResponse)) {
        partsDataArray = partsResponse;
      } else if ((partsResponse as any).data && Array.isArray((partsResponse as any).data)) {
        partsDataArray = (partsResponse as any).data;
      } else if ((partsResponse as any).pagination && (partsResponse as any).data) {
        partsDataArray = (partsResponse as any).data;
      }

      let balancesData: any[] = [];
      if (Array.isArray(balancesResponse)) {
        balancesData = balancesResponse;
      } else if ((balancesResponse as any).data && Array.isArray((balancesResponse as any).data)) {
        balancesData = (balancesResponse as any).data;
      }

      const rackMapData: Record<string, string> = {};
      const stockMapData: Record<string, number> = {};
      if (Array.isArray(balancesData)) {
        balancesData.forEach((b: any) => {
          if (b.part_id) {
            if (b.rack_no) {
              rackMapData[b.part_id] = b.rack_no;
            }
            if (b.current_stock !== undefined && b.current_stock !== null) {
              stockMapData[b.part_id] = b.current_stock;
            }
          }
        });
      }
      setRackMap(rackMapData);

      // Create part ID map
      const idMap: Record<string, string> = {};

      // Format numbers properly
      const formatNumber = (val: any): string => {
        if (val === null || val === undefined || val === '') return '0';
        const num = parseFloat(val);
        if (isNaN(num)) return '0';
        return num % 1 === 0 ? String(num) : num.toFixed(2);
      };

      const transformedParts: PartDetail[] = partsDataArray
        .filter((p: any) => p.status === 'active' || !p.status)
        .map((p: any) => {
          const partNo = String(p.part_no || p.partNo || '').trim();
          if (partNo && p.id) {
            idMap[partNo] = p.id;
          }

          return {
            id: p.id,
            partNo: String(p.master_part_no || p.masterPart || p.master_part_no || '').trim() || 'N/A',
            masterPart: partNo,
            brand: String(p.brand_name || p.brand || '').trim() || 'N/A',
            description: String(p.description || p.part_no || '').trim() || 'No description',
            category: String(p.category_name || p.category || '').trim() || 'N/A',
            subCategory: String(p.subcategory_name || p.subcategory || '').trim() || 'N/A',
            application: String(p.application_name || p.application || '').trim() || 'N/A',
            uom: String(p.uom || 'NOS').trim(),
            hsCode: String(p.hs_code || p.hsCode || '').trim() || 'N/A',
            weight: formatNumber(p.weight),
            cost: formatNumber(p.cost),
            priceA: formatNumber(p.price_a || p.priceA),
            priceB: formatNumber(p.price_b || p.priceB),
            priceM: formatNumber(p.price_m || p.priceM),
            origin: String(p.origin || '').trim() || 'N/A',
            grade: String(p.grade || 'A').trim(),
            status: (p.status || 'active').toUpperCase() === 'ACTIVE' ? 'A' : 'I',
            rackNo: rackMapData[p.id] || 'N/A',
            reOrderLevel: formatNumber(p.reorder_level || p.reorderLevel),
            quantity: stockMapData[p.id] !== undefined ? stockMapData[p.id] : 0,
          };
        })
        .filter((p: PartDetail) => p.partNo && p.partNo.trim() !== '');

      setPartIdMap(idMap);

      setPartsData(transformedParts);
      toast({
        title: "Parts Refreshed",
        description: `Loaded ${transformedParts.length} parts from database.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to refresh parts",
        variant: "destructive",
      });
    } finally {
      setLoadingParts(false);
    }
  };

  const handleView = async (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setViewDialogOpen(true);
    setLoadingInquiryDetails(true);

    try {
      // Fetch full inquiry details with items
      const response = await apiClient.getSalesInquiry(inquiry.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: "Failed to load inquiry details",
          variant: "destructive",
        });
        setFullInquiryData(inquiry);
      } else {
        const inquiryData = (response as any).data || response;
        setFullInquiryData(inquiryData);
      }
    } catch (error: any) {
      setFullInquiryData(inquiry);
    } finally {
      setLoadingInquiryDetails(false);
    }
  };

  const handleDeleteClick = (inquiry: Inquiry) => {
    setInquiryToDelete(inquiry);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!inquiryToDelete) return;

    try {
      const response = await apiClient.deleteSalesInquiry(inquiryToDelete.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to delete inquiry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Inquiry ${inquiryToDelete.inquiryNo} has been deleted.`,
      });

      // Refresh inquiries list
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);

      setDeleteDialogOpen(false);
      setInquiryToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete inquiry",
        variant: "destructive",
      });
    }
  };

  const handleDeletePO = (po: any) => {
    setPoToDelete(po);
    setDeletePODialogOpen(true);
  };

  const handleDeletePOConfirm = async () => {
    if (!poToDelete || !poToDelete.id) return;

    try {
      const response = await apiClient.deletePurchaseOrder(poToDelete.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to delete purchase order",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Success",
        description: `Purchase Order ${poToDelete.po_number || poToDelete.id} has been deleted.`,
      });

      // Refresh purchase order history
      if (selectedPart && partIdMap[selectedPart.partNo]) {
        const partId = partIdMap[selectedPart.partNo];
        const response = await apiClient.getPurchaseOrdersByPart(partId, {
          page: 1,
          limit: 100,
        });

        if (!(response as any).error) {
          const poData = Array.isArray(response) ? response : ((response as any).data || []);
          setPurchaseOrderHistory(poData as any);
        }
      }

      setDeletePODialogOpen(false);
      setPoToDelete(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete purchase order",
        variant: "destructive",
      });
    }
  };

  const handleConvertToQuote = async (inquiry: Inquiry) => {
    try {
      const response = await apiClient.convertInquiryToQuotation(inquiry.id, {
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });

      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to convert inquiry to quotation",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Quotation Created",
        description: `Inquiry ${inquiry.inquiryNo} has been converted to a quotation.`,
      });

      // Refresh inquiries
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to convert inquiry",
        variant: "destructive",
      });
    }
  };

  // Handle print inquiry
  const handlePrintInquiry = async (inquiry: Inquiry) => {
    // Fetch full inquiry details with items for printing
    try {
      const response = await apiClient.getSalesInquiry(inquiry.id);
      if ((response as any).error) {
        toast({
          title: "Error",
          description: "Failed to load inquiry details for printing",
          variant: "destructive",
        });
        return;
      }
      const inquiryData = (response as any).data || response;
      setPrintInquiry(inquiryData);
      setTimeout(() => {
        printDocument(printRef);
        toast({
          title: "Print Initiated",
          description: `Inquiry ${inquiry.inquiryNo} is being printed.`,
        });
      }, 100);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load inquiry details",
        variant: "destructive",
      });
    }
  };

  const filteredInquiries = inquiries.filter(
    (inquiry) =>
      inquiry.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.inquiryNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inquiry.subject.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const generateInquiryNo = () => {
    const nextNum = inquiries.length + 1;
    return `INQ-${String(nextNum).padStart(3, "0")}`;
  };

  const handleAddItem = async () => {
    if (!selectedPart || !selectedPart.id) {
      toast({
        title: "Validation Error",
        description: "Please select a part first",
        variant: "destructive",
      });
      return;
    }

    // Check if part is already in the items list
    const existingItemIndex = inquiryItems.findIndex(item => item.partId === selectedPart.id);
    if (existingItemIndex >= 0) {
      toast({
        title: "Item Already Added",
        description: "This part is already in the inquiry items. You can update the quantity.",
        variant: "default",
      });
      return;
    }

    // Fetch stock and reserved quantity
    let stock = selectedPart.quantity || 0;
    let reservedQty = 0;

    try {
      const stockResponse = await apiClient.getAvailableStock(selectedPart.id);
      if (!(stockResponse as any).error && (stockResponse as any).data) {
        stock = (stockResponse as any).data.available || (stockResponse as any).data.stock || stock;
        reservedQty = (stockResponse as any).data.reserved || 0;
      }
    } catch (error) {
      // Use quantity from selectedPart if available
      stock = selectedPart.quantity || 0;
    }

    const newItem: InquiryItem = {
      partId: selectedPart.id,
      quantity: 1,
      purchasePrice: parseFloat(selectedPart.cost) || 0,
      priceA: parseFloat(selectedPart.priceA) || 0,
      priceB: parseFloat(selectedPart.priceB) || 0,
      priceM: parseFloat(selectedPart.priceM) || 0,
      location: selectedPart.rackNo || '',
      stock: stock,
      reservedQty: reservedQty,
    };

    setInquiryItems([...inquiryItems, newItem]);
    setSelectedPart(null);
    setPartNoSearch("");
    setSelectedMasterPart(null);
    setMasterPartSearch("");

    toast({
      title: "Item Added",
      description: `${selectedPart.partNo} has been added to the inquiry.`,
    });
  };

  const handleRemoveItem = (index: number) => {
    setInquiryItems(inquiryItems.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!formData.customerName || !formData.subject) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields (Customer Name and Subject).",
        variant: "destructive",
      });
      return;
    }

    if (inquiryItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item to the inquiry.",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createSalesInquiry({
        inquiryDate: inquiryDate.toISOString().split('T')[0],
        customerName: formData.customerName,
        customerEmail: formData.customerEmail,
        customerPhone: formData.customerPhone,
        subject: formData.subject,
        description: formData.description,
        status: formData.status,
        items: inquiryItems.map(item => ({
          partId: item.partId,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          priceA: item.priceA,
          priceB: item.priceB,
          priceM: item.priceM,
          location: item.location,
        })),
      });

      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error || "Failed to create inquiry",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Inquiry Created",
        description: `Inquiry has been created successfully.`,
      });

      // Reset form
      setFormData({
        customerName: "",
        customerEmail: "",
        customerPhone: "",
        subject: "",
        description: "",
        status: "New",
      });
      setInquiryItems([]);
      setShowForm(false);

      // Refresh inquiries
      const inquiriesResponse = await apiClient.getSalesInquiries();
      const inquiriesData = Array.isArray(inquiriesResponse) ? inquiriesResponse : ((inquiriesResponse as any).data || []);
      setInquiries(inquiriesData as any);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create inquiry",
        variant: "destructive",
      });
    }
  };

  const handleCancel = () => {
    setFormData({
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      subject: "",
      description: "",
      status: "New",
    });
    setShowForm(false);
  };

  const getStatusColor = (status: Inquiry["status"]) => {
    switch (status) {
      case "New":
        return "bg-blue-100 text-blue-800";
      case "In Progress":
        return "bg-yellow-100 text-yellow-800";
      case "Quoted":
        return "bg-green-100 text-green-800";
      case "Closed":
        return "bg-gray-100 text-gray-800";
      case "Cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-4">
      {/* View Inquiry Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Inquiry Details - {selectedInquiry?.inquiryNo}</DialogTitle>
          </DialogHeader>
          {loadingInquiryDetails ? (
            <div className="py-8 text-center text-muted-foreground">Loading inquiry details...</div>
          ) : fullInquiryData ? (
            <div className="space-y-6">
              {/* Customer Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Name</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerName}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Email</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerEmail || 'N/A'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Customer Phone</Label>
                  <div className="text-sm font-medium">{fullInquiryData.customerPhone || 'N/A'}</div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Inquiry Date</Label>
                  <div className="text-sm font-medium">
                    {fullInquiryData.inquiryDate ? format(new Date(fullInquiryData.inquiryDate), 'PPP') : 'N/A'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="text-sm font-medium">
                    <Badge className={getStatusColor(fullInquiryData.status)}>
                      {fullInquiryData.status}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Subject and Description */}
              <div>
                <Label className="text-xs text-muted-foreground">Subject</Label>
                <div className="text-sm font-medium">{fullInquiryData.subject}</div>
              </div>
              {fullInquiryData.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <div className="text-sm">{fullInquiryData.description}</div>
                </div>
              )}

              {/* Items Table - Professional Read-Only Inquiry Display */}
              {fullInquiryData.items && fullInquiryData.items.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Inquiry Items</Label>
                    <Badge variant="outline" className="text-xs">
                      {fullInquiryData.items.length} {fullInquiryData.items.length === 1 ? 'Item' : 'Items'}
                    </Badge>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="font-semibold">Part No</TableHead>
                          <TableHead className="font-semibold">Description</TableHead>
                          <TableHead className="font-semibold text-center">Requested Qty</TableHead>
                          <TableHead className="font-semibold text-right">Purchase Price</TableHead>
                          <TableHead className="font-semibold text-right">Price A</TableHead>
                          <TableHead className="font-semibold text-right">Price B</TableHead>
                          <TableHead className="font-semibold text-right">Price M</TableHead>
                          <TableHead className="font-semibold">Location</TableHead>
                          <TableHead className="font-semibold text-center">Available Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fullInquiryData.items.map((item, index) => {
                          const stock = item.stock || 0;
                          const reserved = item.reservedQty || 0;
                          const availableQty = Math.max(0, stock - reserved);
                          
                          return (
                            <TableRow key={item.id || index}>
                              <TableCell className="font-medium">{item.part?.partNo || 'N/A'}</TableCell>
                              <TableCell className="max-w-xs">
                                <div>{item.part?.description || 'N/A'}</div>
                                {item.part?.brand?.name && (
                                  <div className="text-xs text-muted-foreground mt-0.5">
                                    Brand: {item.part.brand.name}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="text-center font-medium">{item.quantity || 0}</TableCell>
                              <TableCell className="text-right">Rs {item.purchasePrice?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceA?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceB?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell className="text-right text-green-600">Rs {item.priceM?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}</TableCell>
                              <TableCell>{item.location || 'N/A'}</TableCell>
                              <TableCell className={cn(
                                "text-center font-semibold",
                                availableQty > 0 ? "text-blue-600" : "text-red-600"
                              )}>
                                {availableQty.toLocaleString('en-US')}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No items in this inquiry</p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">No inquiry data available</div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Inquiry</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete inquiry <strong>{inquiryToDelete?.inquiryNo}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Purchase Order Confirmation Dialog */}
      <AlertDialog open={deletePODialogOpen} onOpenChange={setDeletePODialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Purchase Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete Purchase Order <strong>{poToDelete?.po_number || poToDelete?.id}</strong>?
              This action cannot be undone and will remove all items associated with this purchase order.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePOConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Inquiry Form */}
      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">New Sales Inquiry</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => {
                setShowForm(false);
                setFormData({
                  customerName: "",
                  customerEmail: "",
                  customerPhone: "",
                  subject: "",
                  description: "",
                  status: "New",
                });
                setInquiryItems([]);
              }}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Customer Information */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Email</Label>
                <Input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  placeholder="customer@email.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Phone</Label>
                <Input
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  placeholder="Enter phone number"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="Enter subject"
                />
              </div>
              <div className="space-y-2">
                <Label>Inquiry Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !inquiryDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {inquiryDate ? format(inquiryDate, "PPP") : <span>Pick a date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={inquiryDate}
                      onSelect={(date) => date && setInquiryDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
                rows={3}
              />
            </div>

            {/* Items Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Items</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Scroll to part lookup section
                    document.getElementById('part-lookup-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Item from Part Lookup
                </Button>
              </div>

              {inquiryItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part No</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Purchase Price</TableHead>
                        <TableHead>Price A</TableHead>
                        <TableHead>Price B</TableHead>
                        <TableHead>Price M</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead>Reserved</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inquiryItems.map((item, index) => {
                        const part = partsData.find(p => p.id === item.partId);
                        return (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{part?.partNo || 'N/A'}</TableCell>
                            <TableCell>{part?.description || 'N/A'}</TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                value={item.quantity}
                                onChange={(e) => {
                                  const newItems = [...inquiryItems];
                                  newItems[index].quantity = parseInt(e.target.value) || 1;
                                  setInquiryItems(newItems);
                                }}
                                className="w-20"
                              />
                            </TableCell>
                            <TableCell>Rs {item.purchasePrice?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>Rs {item.priceA?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>Rs {item.priceB?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>Rs {item.priceM?.toFixed(2) || '0.00'}</TableCell>
                            <TableCell>{item.location || 'N/A'}</TableCell>
                            <TableCell>{item.stock || 0}</TableCell>
                            <TableCell>{item.reservedQty || 0}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleRemoveItem(index)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {inquiryItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No items added. Use the part lookup below to add items.</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setShowForm(false);
                setFormData({
                  customerName: "",
                  customerEmail: "",
                  customerPhone: "",
                  subject: "",
                  description: "",
                  status: "New",
                });
                setInquiryItems([]);
                setSelectedPart(null);
                setPartNoSearch("");
                setSelectedMasterPart(null);
                setMasterPartSearch("");
              }}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={inquiryItems.length === 0}>
                Create Inquiry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Part Lookup Section */}
      <Card id="part-lookup-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-primary" />
                <CardTitle className="text-lg font-semibold">Part Inquiry Lookup</CardTitle>
              </div>
              <p className="text-sm text-muted-foreground mt-1">Search for part details using Master Part or Part Number</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshParts}
              disabled={loadingParts}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loadingParts ? "animate-spin" : ""}`} />
              {loadingParts ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search Fields with Dropdowns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            {/* Master Part Dropdown */}
            <div ref={masterDropdownRef} className="relative space-y-2">
              <Label className="text-sm font-medium">Master Part #</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search master part..."
                  value={masterPartSearch}
                  onChange={(e) => {
                    setMasterPartSearch(e.target.value);
                    setShowMasterDropdown(true);
                    if (e.target.value !== selectedMasterPart) {
                      setSelectedMasterPart(null);
                    }
                  }}
                  onFocus={() => setShowMasterDropdown(true)}
                  className={cn(
                    "pl-10",
                    showMasterDropdown && "ring-2 ring-primary border-primary"
                  )}
                />
              </div>
              {/* Master Part Dropdown */}
              {showMasterDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                  {loadingParts ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                      Loading master parts...
                    </div>
                  ) : masterPartNumbers.length > 0 ? (
                    masterPartNumbers.map((master) => (
                      <button
                        key={master}
                        onClick={() => handleSelectMasterPart(master)}
                        className={cn(
                          "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0",
                          selectedMasterPart === master && "bg-muted"
                        )}
                      >
                        {master}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      {masterPartSearch ? "No master part numbers found matching your search" : "No master part numbers available"}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Part No Dropdown */}
            <div ref={partDropdownRef} className="relative space-y-2">
              <Label className="text-sm font-medium">Part No/SSP#</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by part number, description..."
                  value={partNoSearch}
                  onChange={(e) => {
                    setPartNoSearch(e.target.value);
                    setShowPartDropdown(true);
                    if (e.target.value !== selectedPart?.partNo) {
                      setSelectedPart(null);
                    }
                  }}
                  onFocus={() => setShowPartDropdown(true)}
                  className={cn(
                    "pl-10",
                    showPartDropdown && "ring-2 ring-primary border-primary"
                  )}
                />
              </div>
              {/* Part Dropdown */}
              {showPartDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-80 overflow-auto">
                  {loadingParts ? (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                      Loading parts...
                    </div>
                  ) : filteredParts.length > 0 ? (
                    filteredParts.map((part) => (
                      <button
                        key={part.partNo}
                        onClick={() => handleSelectPart(part)}
                        className={cn(
                          "w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0",
                          selectedPart?.partNo === part.partNo && "bg-muted"
                        )}
                      >
                        <p className="font-medium text-foreground text-sm">{part.partNo}</p>
                        <p className="text-sm text-muted-foreground">{part.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Brand: {part.brand} &nbsp;&nbsp; Master: {part.masterPart}
                        </p>
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-sm text-muted-foreground">
                      {partNoSearch ? "No parts found matching your search" : "No parts available"}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button variant="outline" onClick={handleClearSearch}>
              Clear
            </Button>
          </div>

          {/* Part Details Display (Read-only) */}
          {selectedPart && (
            <div className="mt-4 p-4 rounded-lg bg-muted/30 border">
              <div className="flex items-center justify-end mb-4">
                <div className="flex items-center gap-2">
                  {loadingPartDetails && (
                    <Badge variant="outline" className="text-xs">
                      Loading details...
                    </Badge>
                  )}
                  {showForm && (
                    <Button
                      size="sm"
                      onClick={handleAddItem}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add to Inquiry
                    </Button>
                  )}
                </div>
              </div>
              <div className="border border-border rounded-lg overflow-hidden shadow-sm bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-primary/5 border-b-2 border-primary/20">
                      <TableHead className="font-bold text-foreground text-sm py-4 px-6">Part Details</TableHead>
                      <TableHead className="font-bold text-foreground text-sm py-4 px-6 text-right">Prices</TableHead>
                      <TableHead className="font-bold text-foreground text-sm py-4 px-6">Category/Application</TableHead>
                      <TableHead className="font-bold text-foreground text-sm py-4 px-6 text-center">Available Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-muted/30 transition-colors">
                      <TableCell className="py-4 px-6">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-1 h-5 bg-primary rounded-full"></div>
                            <div className="font-semibold text-base text-foreground">
                              Master Part: {selectedPart.masterPart || 'N/A'}
                            </div>
                          </div>
                          <div className="text-sm font-medium text-foreground pl-3">
                            Part No: {selectedPart.partNo || 'N/A'}
                          </div>
                          <div className="text-sm text-muted-foreground pl-3">{selectedPart.description || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-right">
                        <div className="space-y-2 text-sm">
                          <div className="font-semibold text-primary">Cost: <span className="font-bold">Rs {selectedPart.cost && selectedPart.cost !== '0' ? parseFloat(selectedPart.cost).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span></div>
                          <div className="font-semibold text-green-600">Price-A: <span className="font-bold">Rs {selectedPart.priceA && selectedPart.priceA !== '0' ? parseFloat(selectedPart.priceA).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span></div>
                          <div className="font-semibold text-green-600">Price-B: <span className="font-bold">Rs {selectedPart.priceB && selectedPart.priceB !== '0' ? parseFloat(selectedPart.priceB).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span></div>
                          <div className="font-semibold text-green-600">Price-M: <span className="font-bold">Rs {selectedPart.priceM && selectedPart.priceM !== '0' ? parseFloat(selectedPart.priceM).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}</span></div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6">
                        <div className="space-y-2 text-sm">
                          <div className="font-semibold text-foreground">{selectedPart.category || 'N/A'}</div>
                          <div className="text-muted-foreground">{selectedPart.subCategory || 'N/A'}</div>
                          <div className="text-muted-foreground">{selectedPart.application || 'N/A'}</div>
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-6 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="inline-flex items-center justify-center min-w-[60px] px-3 py-2 rounded-md bg-blue-50 border border-blue-200">
                            <span className="font-bold text-lg text-blue-700">
                              {selectedPart.quantity !== undefined ? selectedPart.quantity.toLocaleString('en-US') : '0'}
                            </span>
                          </div>
                          {selectedPart.id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => {
                                setSelectedPartForModels(selectedPart);
                                setModelsSheetOpen(true);
                              }}
                            >
                              <Info className="w-3.5 h-3.5" />
                              Models
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {!selectedPart && (
            <div className="text-center py-6 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>Select a part from the dropdown to view details</p>
            </div>
          )}

          {/* Tabs Section */}
          {selectedPart && (
            <Tabs defaultValue="last-sales-invoice" className="mt-6">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="last-sales-invoice" className="flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5" />
                  Last Sales Invoice
                </TabsTrigger>
                <TabsTrigger value="last-dpo" className="flex items-center gap-1.5 text-xs">
                  <Truck className="h-3.5 w-3.5" />
                  Last Direct PO
                </TabsTrigger>
              </TabsList>

              {/* Last Sales Invoice Tab */}
              <TabsContent value="last-sales-invoice" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">Invoice No</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Customer Type</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        <TableHead className="text-xs">Unit Price</TableHead>
                        <TableHead className="text-xs">Line Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingSalesInvoiceHistory ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                            Loading sales invoice history...
                          </TableCell>
                        </TableRow>
                      ) : salesInvoiceHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                            No sales invoice history available for this part
                          </TableCell>
                        </TableRow>
                      ) : (
                        salesInvoiceHistory.map((invoice) => (
                          <TableRow key={invoice.id} className="hover:bg-muted/20">
                            <TableCell className="text-xs font-medium">{invoice.invoice_no || 'N/A'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {invoice.invoice_date ? format(new Date(invoice.invoice_date), 'dd MMM yyyy') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{invoice.customer_name || 'N/A'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <Badge variant={invoice.customer_type === 'walking' ? 'secondary' : 'default'} className="text-xs">
                                {invoice.customer_type === 'walking' ? 'Party Sale' : invoice.customer_type === 'registered' ? 'Cash Sale' : invoice.customer_type || 'N/A'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {invoice.item?.ordered_qty || 0}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              Rs {invoice.item?.unit_price?.toFixed(2) || '0.00'}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              Rs {invoice.item?.line_total?.toFixed(2) || '0.00'}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Last Direct Purchase Order Tab */}
              <TabsContent value="last-dpo" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="text-xs">DPO No</TableHead>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Customer</TableHead>
                        <TableHead className="text-xs">Qty</TableHead>
                        <TableHead className="text-xs">Rate</TableHead>
                        <TableHead className="text-xs">DPO Cost Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingDpoHistory ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                            Loading direct purchase order history...
                          </TableCell>
                        </TableRow>
                      ) : dpoHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground text-sm">
                            No direct purchase order history available for this part
                          </TableCell>
                        </TableRow>
                      ) : (
                        dpoHistory.map((dpo) => (
                          <TableRow key={dpo.id} className="hover:bg-muted/20">
                            <TableCell className="text-xs font-medium">{dpo.dpo_no || 'N/A'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {dpo.date ? format(new Date(dpo.date), 'dd MMM yyyy') : 'N/A'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{dpo.supplier_name || dpo.customer || 'N/A'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{dpo.item?.quantity || dpo.qty || 0}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              Rs {(dpo.item?.purchase_price || dpo.rate || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs font-medium">
                              Rs {(dpo.costPriceWithExpenses || dpo.item?.purchase_price || dpo.rate || 0).toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Hidden Print Component */}
      {printInquiry && (
        <div className="hidden">
          <PrintableDocument
            ref={printRef}
            type="inquiry"
            data={{
              documentNo: printInquiry.inquiryNo,
              date: printInquiry.inquiryDate ? format(new Date(printInquiry.inquiryDate), 'PPP') : '',
              customerName: printInquiry.customerName,
              customerEmail: printInquiry.customerEmail || '',
              customerPhone: printInquiry.customerPhone || '',
              subject: printInquiry.subject,
              description: printInquiry.description || '',
              status: printInquiry.status,
              items: (printInquiry.items || []).map((item) => ({
                partNo: item.part?.partNo || 'N/A',
                description: item.part?.description || 'N/A',
                quantity: item.quantity || 0,
                unitPrice: item.priceA || item.purchasePrice || 0,
                total: (item.quantity || 0) * (item.priceA || item.purchasePrice || 0),
              })),
            }}
          />
        </div>
      )}

      {/* Models Sheet - Slide from Right */}
      <Sheet open={modelsSheetOpen} onOpenChange={setModelsSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              Quantity Used Details
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-6">
            {loadingPartModels ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading models...
              </div>
            ) : partModels.length > 0 ? (
              <div className="space-y-4">
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-bold text-foreground">Model</TableHead>
                        <TableHead className="font-bold text-foreground text-center">Quantity Used</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partModels.map((model) => (
                        <TableRow key={model.id}>
                          <TableCell className="font-medium">{model.name || 'N/A'}</TableCell>
                          <TableCell className="text-center font-semibold">{model.qtyUsed || 0}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground border rounded-lg bg-muted/20">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No models found for this part</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};