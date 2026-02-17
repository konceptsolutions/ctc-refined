import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiClient } from "@/lib/api";
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
import { Plus, Search, Eye, FileText, ArrowRight, X, Package, Trash2, Pencil, ShoppingCart, Printer, RefreshCw } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { MoreHorizontal } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PrintableDocument, printDocument } from "./PrintableDocument";

interface QuotationItem {
  id: string;
  partNo: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface Quotation {
  id: string;
  quotationNo: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  date: string;
  validUntil: string;
  totalAmount: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "expired";
  items: QuotationItem[];
  notes: string;
}

export const SalesQuotation = () => {
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [selectedItems, setSelectedItems] = useState<QuotationItem[]>([]);
  const [editingQuotationId, setEditingQuotationId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [convertDialogOpen, setConvertDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [printQuotation, setPrintQuotation] = useState<Quotation | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  
  // Parts data from database
  const [availableParts, setAvailableParts] = useState<{ id: string; partNo: string; description: string; price: number; stock: number }[]>([]);
  const [loadingParts, setLoadingParts] = useState(false);
  const [formData, setFormData] = useState<{
    quotationNo: string;
    quotationDate: string;
    validUntil: string;
    status: Quotation["status"];
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    customerAddress: string;
    notes: string;
  }>({
    quotationNo: "",
    quotationDate: new Date().toISOString().split("T")[0],
    validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    status: "draft",
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    notes: "",
  });

  // Fetch quotations from backend
  useEffect(() => {
    const fetchQuotations = async () => {
      try {
        const response = await apiClient.getSalesQuotations();
        if (response.error) {
          toast({
            title: "Error",
            description: "Failed to load quotations",
            variant: "destructive",
          });
          return;
        }
        const quotationsData = Array.isArray(response) ? response : (response.data || []);
        setQuotations(quotationsData);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch quotations",
          variant: "destructive",
        });
      }
    };

    fetchQuotations();
  }, []);

  // Fetch parts from database - lazy loading with debounced search
  useEffect(() => {
    if (!isFormOpen) {
      setAvailableParts([]);
      return;
    }

    // Don't fetch if search term is empty
    if (!itemSearchTerm || itemSearchTerm.trim().length === 0) {
      setAvailableParts([]);
      return;
    }

    // Debounce search to avoid too many API calls
    const debounceTimer = setTimeout(async () => {
      setLoadingParts(true);
      try {
        // Use search parameter to find matching parts, then filter to only show part_no matches
        // The API search searches partNo field, so it should find parts where part_no matches
        const partsResponse = await apiClient.getParts({ 
          status: 'active',
          search: itemSearchTerm.trim(), // Search for the term (searches partNo field)
          limit: 10000, // Get many results to filter from
          page: 1 
        });

        if (partsResponse.error) {
          setAvailableParts([]);
          return;
        }

        // Handle both response formats: { data: [...] } or direct array
        let partsData: any[] = [];
        if (Array.isArray(partsResponse)) {
          partsData = partsResponse;
        } else if (partsResponse.data && Array.isArray(partsResponse.data)) {
          partsData = partsResponse.data;
        } else if (partsResponse.pagination && partsResponse.data) {
          partsData = partsResponse.data;
        }

        // Fetch stock balances - optional, don't block if it fails
        const partIds = partsData.map((p: any) => p.id).filter(Boolean);
        let balanceMap: Record<string, number> = {};
        
        if (partIds.length > 0) {
          try {
            // Fetch stock balances with reasonable limit
            const balancesResponse = await apiClient.getStockBalances({ 
              limit: 500
            }).catch(() => null);

            if (balancesResponse) {
              let balancesData: any[] = [];
              if (Array.isArray(balancesResponse)) {
                balancesData = balancesResponse;
              } else if (balancesResponse.data && Array.isArray(balancesResponse.data)) {
                balancesData = balancesResponse.data;
              } else if (balancesResponse.pagination && balancesResponse.data) {
                balancesData = balancesResponse.data;
              }

              // Create balance map for stock quantities (filter to only our parts)
              const partIdSet = new Set(partIds);
              balancesData.forEach((b: any) => {
                const partId = b.part_id || b.partId;
                if (partId && partIdSet.has(partId)) {
                  balanceMap[partId] = (balanceMap[partId] || 0) + (parseFloat(b.quantity) || parseFloat(b.qty) || 0);
                }
              });
            }
          } catch (err) {
            // Silently continue without stock data - don't block the UI
          }
        }

        // Transform API data to component format - ONLY show Part No (Blue Block), NEVER Master Part No (Red Block)
        // IMPORTANT: Database fields are SWAPPED/LABELED INCORRECTLY:
        // - master_part_no in DB = actual Part No (Blue Block - what we want to show)
        // - part_no in DB = actual Master Part No (Red Block - what we DON'T want to show)
        const searchTermLower = itemSearchTerm.trim().toLowerCase();
        const transformedParts = partsData
          .map((p: any) => {
            // SWAPPED MAPPING: Database labels are wrong, so we swap them
            const partNo = String(p.master_part_no || '').trim(); // Blue Block - Part No (from master_part_no field in DB)
            const masterPartNo = String(p.part_no || '').trim(); // Red Block - Master Part No (from part_no field in DB)
            const description = String(p.description || '').trim();
            const price = parseFloat(p.price_a || p.priceA || p.price || p.cost || 0);
            const stock = balanceMap[p.id] || 0;
            
            return {
              id: String(p.id),
              partNo: partNo, // Blue Block - Part No (from master_part_no in DB)
              masterPartNo: masterPartNo, // Red Block - Master Part No (from part_no in DB)
              description: description,
              price: isNaN(price) ? 0 : price,
              stock: isNaN(stock) ? 0 : Math.max(0, stock),
            };
          })
          .filter((p: any) => {
            // ULTRA-STRICT: ONLY show Blue Block (Part No), NEVER Red Block (Master Part No)
            
            // 1. MUST have a valid part_no (Blue Block) - not empty, not null, not undefined
            const partNo = p.partNo ? String(p.partNo).trim() : '';
            if (!partNo || partNo === '' || partNo === 'null' || partNo === 'undefined') {
              return false; // No Blue Block = exclude
            }
            
            // 2. Get master part number (Red Block) for comparison
            const masterPartNo = p.masterPartNo ? String(p.masterPartNo).trim() : '';
            
            // 3. Allow parts where part_no equals master_part_no (some parts have same value)
            // We'll still filter by part_no match, so this is OK
            
            // 4. If no search term, don't show anything (user must search)
            if (searchTermLower.length === 0) {
              return false;
            }
            
            // 5. Check if Blue Block (part_no) or Red Block (master_part_no) matches
            const partNoLower = partNo.toLowerCase(); // Blue Block - Part No (what we want)
            const masterPartNoLower = masterPartNo.toLowerCase(); // Red Block - Master Part No (what we DON'T want)
            
            // 6. CRITICAL: EXCLUDE if ONLY Red Block (master_part_no) matches
            // If Red Block matches but Blue Block doesn't, exclude it
            // But if Blue Block also matches, include it (even if Red Block matches too)
            if (masterPartNoLower.includes(searchTermLower) && !partNoLower.includes(searchTermLower)) {
              return false; // NEVER show if ONLY Red Block (Master Part No) matches
            }
            
            // 7. ONLY include if Blue Block (part_no) matches the search term
            // This is the key - we ONLY want parts where part_no (Blue Block) matches
            if (!partNoLower.includes(searchTermLower)) {
              return false; // Exclude if Blue Block (Part No) doesn't match
            }
            
            return true; // Include - Blue Block (Part No) matches the search
          });
        
        // Debug: Log what we found
        
        setAvailableParts(transformedParts);
      } catch (error: any) {
        setAvailableParts([]);
      } finally {
        setLoadingParts(false);
      }
    }, 500); // 500ms debounce delay

    return () => {
      clearTimeout(debounceTimer);
    };
  }, [isFormOpen, itemSearchTerm]);

  // Generate quotation number
  const generateQuotationNo = () => {
    const prefix = "SQ";
    const num = String(quotations.length + 1).padStart(3, "0");
    return `${prefix}-${num}`;
  };

  // Filter parts based on search
  const filteredParts = useMemo(() => {
    if (!itemSearchTerm || itemSearchTerm.trim() === "") {
      return availableParts;
    }
    const term = itemSearchTerm.toLowerCase().trim();
    return availableParts.filter(
      (p) =>
        p.partNo?.toLowerCase().includes(term) ||
        p.description?.toLowerCase().includes(term)
    );
  }, [itemSearchTerm, availableParts]);

  // Filter quotations
  const filteredQuotations = quotations.filter((item) =>
    item.quotationNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.customerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate total
  const calculateTotal = () => {
    const total = selectedItems.reduce((sum, item) => {
      const itemTotal = item.quantity * item.unitPrice;
      return sum + itemTotal;
    }, 0);
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  };

  // Handle item selection
  const handleToggleItem = (part: typeof availableParts[0], checked: boolean) => {
    if (checked) {
      // Check if item already exists
      const existingItem = selectedItems.find((i) => i.id === part.id);
      if (existingItem) {
        return; // Silently return if already selected
      }
      
      const newItem: QuotationItem = {
        id: part.id,
        partNo: part.partNo,
        description: part.description,
        quantity: 1,
        unitPrice: part.price,
        total: part.price,
      };
      setSelectedItems([...selectedItems, newItem]);
    } else {
      setSelectedItems(selectedItems.filter((i) => i.id !== part.id));
    }
  };

  // Update item quantity
  const handleQuantityChange = (itemId: string, quantity: number) => {
    const qty = Math.max(1, quantity); // Ensure minimum quantity of 1
    setSelectedItems(
      selectedItems.map((item) =>
        item.id === itemId
          ? { ...item, quantity: qty, total: Math.round(item.unitPrice * qty * 100) / 100 }
          : item
      )
    );
  };

  // Update item unit price (only affects this quotation, not the part's base price)
  const handleUnitPriceChange = (itemId: string, unitPrice: number) => {
    const price = Math.max(0, unitPrice); // Ensure minimum price of 0
    setSelectedItems(
      selectedItems.map((item) =>
        item.id === itemId
          ? { ...item, unitPrice: price, total: Math.round(price * item.quantity * 100) / 100 }
          : item
      )
    );
  };

  // Remove item
  const handleRemoveItem = (itemId: string) => {
    setSelectedItems(selectedItems.filter((i) => i.id !== itemId));
  };

  // Handle new quotation
  const handleNewQuotation = () => {
    setEditingQuotationId(null);
    const today = new Date();
    const validUntilDate = new Date(today);
    validUntilDate.setDate(today.getDate() + 30);
    
    setFormData({
      quotationNo: generateQuotationNo(),
      quotationDate: today.toISOString().split("T")[0],
      validUntil: validUntilDate.toISOString().split("T")[0],
      status: "draft",
      customerName: "",
      customerEmail: "",
      customerPhone: "",
      customerAddress: "",
      notes: "",
    });
    setSelectedItems([]);
    setItemSearchTerm("");
    setIsFormOpen(true);
  };

  // Handle edit quotation
  const handleEditQuotation = (quotation: Quotation) => {
    setEditingQuotationId(quotation.id);
    setFormData({
      quotationNo: quotation.quotationNo,
      quotationDate: quotation.date,
      validUntil: quotation.validUntil,
      status: quotation.status,
      customerName: quotation.customerName,
      customerEmail: quotation.customerEmail,
      customerPhone: quotation.customerPhone,
      customerAddress: quotation.customerAddress,
      notes: quotation.notes,
    });
    setSelectedItems(quotation.items);
    setIsFormOpen(true);
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setDeleteDialogOpen(true);
  };

  // Confirm delete quotation
  const confirmDeleteQuotation = async () => {
    if (!selectedQuotation) return;

    try {
      const response = await apiClient.deleteSalesQuotation(selectedQuotation.id);
      
      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to delete quotation",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Quotation Deleted",
        description: `Quotation ${selectedQuotation.quotationNo} has been deleted successfully.`,
      });

      // Refresh quotations
      const quotationsResponse = await apiClient.getSalesQuotations();
      const quotationsData = Array.isArray(quotationsResponse) ? quotationsResponse : (quotationsResponse.data || []);
      setQuotations(quotationsData);

      setDeleteDialogOpen(false);
      setSelectedQuotation(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete quotation",
        variant: "destructive",
      });
    }
  };

  // Open convert confirmation dialog
  const openConvertDialog = (quotation: Quotation) => {
    setSelectedQuotation(quotation);
    setConvertDialogOpen(true);
  };

  // Confirm convert to invoice
  const confirmConvertToInvoice = async () => {
    if (!selectedQuotation) return;

    try {
      const response = await apiClient.convertQuotationToInvoice(selectedQuotation.id, {
        invoiceDate: new Date().toISOString().split('T')[0],
        customerType: 'registered',
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error || "Failed to convert quotation to invoice",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Converted to Invoice",
        description: `Quotation ${selectedQuotation.quotationNo} has been converted to an invoice successfully.`,
      });

      // Refresh quotations
      const quotationsResponse = await apiClient.getSalesQuotations();
      const quotationsData = Array.isArray(quotationsResponse) ? quotationsResponse : (quotationsResponse.data || []);
      setQuotations(quotationsData);

      setConvertDialogOpen(false);
      setSelectedQuotation(null);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to convert quotation",
        variant: "destructive",
      });
    }
  };

  // Handle print quotation
  const handlePrintQuotation = (quotation: Quotation) => {
    setPrintQuotation(quotation);
    setTimeout(() => {
      printDocument(printRef);
      toast({
        title: "Print Initiated",
        description: `Quotation ${quotation.quotationNo} is being printed.`,
      });
    }, 100);
  };

  // Handle form submit
  const handleSubmit = async () => {
    if (!formData.customerName || formData.customerName.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    if (selectedItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please select at least one item to create a quotation",
        variant: "destructive",
      });
      return;
    }

    // Validate all items have quantity > 0
    const invalidItems = selectedItems.filter(item => item.quantity <= 0);
    if (invalidItems.length > 0) {
      toast({
        title: "Validation Error",
        description: "All selected items must have a quantity greater than 0",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingQuotationId) {
        // Update existing quotation
        const response = await apiClient.updateSalesQuotation(editingQuotationId, {
          quotationDate: formData.quotationDate,
          validUntil: formData.validUntil,
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
          customerAddress: formData.customerAddress,
          status: formData.status,
          notes: formData.notes,
          items: selectedItems.map(item => ({
            partId: item.id,
            partNo: item.partNo,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        });

        if (response.error) {
          toast({
            title: "Error",
            description: response.error || "Failed to update quotation",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Quotation Updated",
          description: `Quotation ${formData.quotationNo} has been updated successfully.`,
        });

        // Refresh quotations
        const quotationsResponse = await apiClient.getSalesQuotations();
        const quotationsData = Array.isArray(quotationsResponse) ? quotationsResponse : (quotationsResponse.data || []);
        setQuotations(quotationsData);

        setIsFormOpen(false);
        setEditingQuotationId(null);
        setSelectedItems([]);
      } else {
        // Create new quotation
        const response = await apiClient.createSalesQuotation({
          quotationDate: formData.quotationDate,
          validUntil: formData.validUntil,
          customerName: formData.customerName,
          customerEmail: formData.customerEmail,
          customerPhone: formData.customerPhone,
          customerAddress: formData.customerAddress,
          status: formData.status,
          notes: formData.notes,
          items: selectedItems.map(item => ({
            partId: item.id,
            partNo: item.partNo,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        });

        if (response.error) {
          toast({
            title: "Error",
            description: response.error || "Failed to create quotation",
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Quotation Created",
          description: `Quotation has been created successfully with ${selectedItems.length} item(s).`,
        });

        // Refresh quotations
        const quotationsResponse = await apiClient.getSalesQuotations();
        const quotationsData = Array.isArray(quotationsResponse) ? quotationsResponse : (quotationsResponse.data || []);
        setQuotations(quotationsData);

        setIsFormOpen(false);
        setSelectedItems([]);
        setFormData({
          quotationNo: generateQuotationNo(),
          quotationDate: new Date().toISOString().split("T")[0],
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          status: "draft",
          customerName: "",
          customerEmail: "",
          customerPhone: "",
          customerAddress: "",
          notes: "",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save quotation",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: Quotation["status"]) => {
    switch (status) {
      case "draft":
        return "secondary";
      case "sent":
        return "default";
      case "accepted":
        return "default";
      case "rejected":
        return "destructive";
      case "expired":
        return "secondary";
      default:
        return "secondary";
    }
  };

  // Form View
  if (isFormOpen) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-4 bg-gradient-to-r from-primary/5 to-transparent">
            <CardTitle className="text-lg">{editingQuotationId ? "Edit Sales Quotation" : "New Sales Quotation"}</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Form Fields - Row 1 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Quotation No</Label>
                <Input
                  value={formData.quotationNo}
                  readOnly
                  className="bg-muted/50 h-9"
                  placeholder="SQ-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Quotation Date</Label>
                <Input
                  type="date"
                  value={formData.quotationDate}
                  onChange={(e) => setFormData({ ...formData, quotationDate: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Valid Until</Label>
                <Input
                  type="date"
                  value={formData.validUntil}
                  onChange={(e) => setFormData({ ...formData, validUntil: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) =>
                    setFormData({ ...formData, status: value as Quotation["status"] })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="accepted">Accepted</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Form Fields - Row 2 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Customer Name</Label>
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Customer Email</Label>
                <Input
                  type="email"
                  value={formData.customerEmail}
                  onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                  placeholder="customer@email.com"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Customer Phone</Label>
                <Input
                  value={formData.customerPhone}
                  onChange={(e) => setFormData({ ...formData, customerPhone: e.target.value })}
                  placeholder="Enter phone number"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground text-xs">Customer Address</Label>
                <Input
                  value={formData.customerAddress}
                  onChange={(e) => setFormData({ ...formData, customerAddress: e.target.value })}
                  placeholder="Enter address"
                  className="h-9"
                />
              </div>
            </div>

            {/* Item Selection Section */}
            <div className="border rounded-lg p-4 mb-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  <h3 className="font-medium">Select Items</h3>
                  <Badge variant="outline" className="text-xs">
                    {loadingParts ? "Loading..." : itemSearchTerm && itemSearchTerm.trim().length > 0 ? `${availableParts.length} results` : "Type to search..."}
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Trigger search refresh by clearing and resetting search
                    if (itemSearchTerm && itemSearchTerm.trim().length > 0) {
                      const currentSearch = itemSearchTerm;
                      setItemSearchTerm('');
                      setTimeout(() => setItemSearchTerm(currentSearch), 100);
                    }
                  }}
                  disabled={loadingParts || !itemSearchTerm || itemSearchTerm.trim().length === 0}
                  className="h-8 text-xs gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingParts ? "animate-spin" : ""}`} />
                  {loadingParts ? "Loading..." : "Refresh"}
                </Button>
              </div>

              {/* Item Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search parts by number or description..."
                  value={itemSearchTerm}
                  onChange={(e) => setItemSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Available Parts */}
              <ScrollArea className="h-48 border rounded-md">
                <div className="p-2 space-y-1">
                  {loadingParts ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Loading parts from database...
                    </div>
                  ) : !itemSearchTerm || itemSearchTerm.trim().length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      Type to search for parts...
                    </div>
                  ) : filteredParts.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-sm">
                      No parts found matching "{itemSearchTerm}". Try a different search term.
                    </div>
                  ) : (
                    filteredParts.map((part) => {
                      const isSelected = selectedItems.some((i) => i.id === part.id);
                      return (
                        <div
                          key={part.id}
                          className={`flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors ${
                            isSelected ? "bg-primary/10 border border-primary/20" : ""
                          }`}
                          onClick={(e) => {
                            e.preventDefault();
                            handleToggleItem(part, !isSelected);
                          }}
                        >
                          <div onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={(checked) => {
                                handleToggleItem(part, checked as boolean);
                              }}
                            />
                          </div>
                          <div className="flex-1 grid grid-cols-4 gap-2 text-sm">
                            <span className="font-medium">{part.partNo}</span>
                            <span className="text-muted-foreground line-clamp-1">{part.description}</span>
                            <span className={`text-center font-medium ${part.stock > 0 ? "text-primary" : "text-destructive"}`}>
                              {part.stock} pcs
                            </span>
                            <span className="text-right font-medium">Rs {part.price.toFixed(2)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>

              {/* Selected Items Table */}
              {selectedItems.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">
                    Selected Items ({selectedItems.length})
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part No</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-24">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.partNo}</TableCell>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const value = parseInt(e.target.value) || 1;
                                handleQuantityChange(item.id, value);
                              }}
                              onBlur={(e) => {
                                if (!e.target.value || parseInt(e.target.value) < 1) {
                                  handleQuantityChange(item.id, 1);
                                }
                              }}
                              className="w-20 h-8 text-center"
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <span className="text-xs text-muted-foreground">Rs</span>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  handleUnitPriceChange(item.id, value);
                                }}
                                onBlur={(e) => {
                                  if (!e.target.value || parseFloat(e.target.value) < 0) {
                                    handleUnitPriceChange(item.id, 0);
                                  }
                                }}
                                className="w-24 h-8 text-right"
                                placeholder="0.00"
                              />
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-primary">
                            Rs {(item.quantity * item.unitPrice).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive"
                              onClick={() => handleRemoveItem(item.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={4} className="text-right font-bold">
                          Grand Total:
                        </TableCell>
                        <TableCell className="text-right font-bold text-primary text-lg">
                          Rs {calculateTotal().toFixed(2)}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2 mb-6">
              <Label className="text-muted-foreground text-sm">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>

            {/* Summary Card */}
            {selectedItems.length > 0 && (
              <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Items</p>
                    <p className="text-2xl font-bold text-foreground">{selectedItems.length}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Grand Total</p>
                    <p className="text-2xl font-bold text-primary">Rs {calculateTotal().toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button 
                onClick={handleSubmit}
                disabled={selectedItems.length === 0 || !formData.customerName.trim()}
                className="bg-primary hover:bg-primary/90"
              >
                {editingQuotationId ? "Update Quotation" : "Create Quotation"}
              </Button>
              <Button variant="outline" onClick={() => {
                setIsFormOpen(false);
                setEditingQuotationId(null);
                setSelectedItems([]);
                setFormData({
                  quotationNo: generateQuotationNo(),
                  quotationDate: new Date().toISOString().split("T")[0],
                  validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                  status: "draft",
                  customerName: "",
                  customerEmail: "",
                  customerPhone: "",
                  customerAddress: "",
                  notes: "",
                });
              }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // List View
  return (
    <div className="space-y-4">
      {/* Search and New Button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search quotations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={handleNewQuotation} className="gap-2">
          <Plus className="w-4 h-4" />
          New Quotation
        </Button>
      </div>

      {/* Quotations Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sales Quotations ({filteredQuotations.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {filteredQuotations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No quotations found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quotation #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Valid Until</TableHead>
                    <TableHead className="text-center">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredQuotations.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.quotationNo}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.customerName}</p>
                          <p className="text-xs text-muted-foreground">{item.customerEmail}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.date}</TableCell>
                      <TableCell>{item.validUntil}</TableCell>
                      <TableCell className="text-center">{item.items.length}</TableCell>
                      <TableCell className="text-right">Rs {item.totalAmount.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusColor(item.status)}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditQuotation(item)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openConvertDialog(item)}>
                              <ShoppingCart className="w-4 h-4 mr-2" />
                              Convert to Invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handlePrintQuotation(item)}>
                              <Printer className="w-4 h-4 mr-2" />
                              Print / Export PDF
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => openDeleteDialog(item)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="w-4 h-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quotation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete quotation{" "}
              <span className="font-semibold">{selectedQuotation?.quotationNo}</span>? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteQuotation}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Convert to Sales Order Confirmation Dialog */}
      <AlertDialog open={convertDialogOpen} onOpenChange={setConvertDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Convert to Sales Order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to convert quotation{" "}
              <span className="font-semibold">{selectedQuotation?.quotationNo}</span>{" "}
              for customer <span className="font-semibold">{selectedQuotation?.customerName}</span>{" "}
              to a sales order?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConvertToInvoice}>
              Convert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden Print Component */}
      {printQuotation && (
        <div className="hidden">
          <PrintableDocument
            ref={printRef}
            type="quotation"
            data={{
              documentNo: printQuotation.quotationNo,
              date: printQuotation.date,
              validUntil: printQuotation.validUntil,
              customerName: printQuotation.customerName,
              customerEmail: printQuotation.customerEmail,
              customerPhone: printQuotation.customerPhone,
              customerAddress: printQuotation.customerAddress,
              status: printQuotation.status,
              items: printQuotation.items,
              totalAmount: printQuotation.totalAmount,
              notes: printQuotation.notes,
            }}
          />
        </div>
      )}
    </div>
  );
};
