import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import {
  Search,
  Eye,
  Trash2,
  MoreVertical,
  RotateCcw,
  FileText,
  Printer,
  X,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { Textarea } from "@/components/ui/textarea";
import { getUserRole } from "@/utils/auth";

interface ReturnItem {
  id: string;
  partNo: string;
  itemName: string;
  brand: string;
  model: string;
  uom: string;
  returnQty: number;
  avgCost?: number;
  price: number;
  total: number;
}

interface SalesReturn {
  id: string;
  invoiceNo: string;
  returnDate: string;
  customerName: string;
  remarks: string;
  subtotal: number;
  gst: number;
  totalAmount: number;
  discount: number;
  amountAfterDiscount: number;
  saleType: string;
  items: ReturnItem[];
  originalInvoiceNo?: string;
  /** Server status: pending | completed | rejected */
  status?: string;
}

/** Map Prisma/API sales return row to list UI model */
function mapApiSalesReturn(row: any): SalesReturn {
  const inv = row.SalesInvoice || {};
  const items: ReturnItem[] = (row.SalesReturnItem || []).map((it: any) => {
    const p = it.Part || {};
    const uom = String(p.uom || "pcs").trim() || "pcs";
    return {
      id: String(it.id),
      partNo: String(p.partNo || "").trim(),
      itemName: String(p.description || "").trim() || "—",
      brand: "",
      model: "",
      uom,
      returnQty: Number(it.returnQuantity) || 0,
      avgCost: Number(it.avgCost) || 0,
      price: Number(it.originalSalePrice) || 0,
      total: Number(it.amount) || 0,
    };
  });

  const subtotal = Number(row.subtotal) || 0;
  const tax = Number(row.tax) || 0;
  const deduction = Number(row.deduction) || 0;
  const net = Number(row.totalAmount) || 0;
  const grossBeforeDeduction = Math.round((subtotal + tax) * 100) / 100;

  let returnDate = "";
  if (row.returnDate) {
    try {
      returnDate = new Date(row.returnDate).toLocaleDateString();
    } catch {
      returnDate = String(row.returnDate);
    }
  }

  const saleType =
    inv.customerType === "walking" ? "Walk-in" : "Sale";

  return {
    id: String(row.id),
    invoiceNo: String(row.returnNumber || "").trim() || String(row.id),
    returnDate,
    customerName: String(inv.customerName || "").trim() || "—",
    remarks: row.reason != null && String(row.reason).trim() !== ""
      ? String(row.reason)
      : "—",
    subtotal,
    gst: tax,
    totalAmount: grossBeforeDeduction,
    discount: deduction,
    amountAfterDiscount: net,
    saleType,
    items,
    originalInvoiceNo: inv.invoiceNo
      ? String(inv.invoiceNo)
      : undefined,
    status: row.status != null ? String(row.status) : undefined,
  };
}

export const SalesReturns = () => {
  const [returns, setReturns] = useState<SalesReturn[]>([]);
  const [selectedReturns, setSelectedReturns] = useState<string[]>([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [availableItems, setAvailableItems] = useState<{ id: string; name: string; partNo: string }[]>([]);
  const [availableCustomers, setAvailableCustomers] = useState<{ id: string; name: string }[]>([]);

  // Filter states
  const [filterItemType, setFilterItemType] = useState("");
  const [filterItem, setFilterItem] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [customerNameSearch, setCustomerNameSearch] = useState("");

  // Dialog states
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isApproveConfirmOpen, setIsApproveConfirmOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [isOriginalInvoiceOpen, setIsOriginalInvoiceOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);
  const [returnToDelete, setReturnToDelete] = useState<SalesReturn | null>(null);
  const [returnToApprove, setReturnToApprove] = useState<SalesReturn | null>(null);
  const [returnToReject, setReturnToReject] = useState<SalesReturn | null>(null);
  const [rejectReasonDraft, setRejectReasonDraft] = useState("");
  const [actionSubmittingId, setActionSubmittingId] = useState<string | null>(
    null,
  );

  // Simple pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const totalPages = Math.ceil(returns.length / itemsPerPage);

  const approverLabel = () => {
    const role = getUserRole();
    return role ? `Role: ${role}` : "Web user";
  };

  const loadReturns = useCallback(async () => {
    setLoadingReturns(true);
    try {
      const res = (await apiClient.getSalesReturns({
        page: 1,
        limit: 2000,
      })) as { data?: unknown[]; error?: string };

      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }

      const raw = res?.data;
      const list = Array.isArray(raw) ? raw : [];
      setReturns(list.map(mapApiSalesReturn));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load sales returns",
        variant: "destructive",
      });
      setReturns([]);
    } finally {
      setLoadingReturns(false);
    }
  }, []);

  useEffect(() => {
    void loadReturns();
  }, [loadReturns]);

  // Fetch parts/items from database for filters
  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await apiClient.getParts({
          status: 'active',
          limit: 1000,
          page: 1
        });

        if (response.error) {
          return;
        }

        let partsDataArray: any[] = [];
        if (Array.isArray(response)) {
          partsDataArray = response;
        } else if (response.data && Array.isArray(response.data)) {
          partsDataArray = response.data;
        } else if (response.pagination && response.data) {
          partsDataArray = response.data as any[];
        }

        const transformedItems = partsDataArray
          .filter((p: any) => p.status === 'active' || !p.status)
          .map((p: any) => ({
            id: p.id,
            name: String(p.description || p.part_no || '').trim() || 'No description',
            partNo: String(p.part_no || p.partNo || '').trim(),
          }))
          .filter((item: any) => item.partNo && item.partNo.trim() !== '');

        setAvailableItems(transformedItems);
      } catch (error: any) {
      }
    };

    fetchItems();
  }, []);

  // Extract unique customers from returns for filter dropdown
  useEffect(() => {
    const uniqueCustomers = Array.from(
      new Set(returns.map(r => r.customerName))
    ).map((name, index) => ({
      id: String(index + 1),
      name: name,
    }));
    setAvailableCustomers(uniqueCustomers);
  }, [returns]);

  const filteredReturns = returns.filter((item) => {
    const matchesItemType = !filterItemType || filterItemType === "all";
    const matchesItem = !filterItem || filterItem === "all" ||
      item.items.some(i => i.partNo === filterItem || i.itemName.toLowerCase().includes(filterItem.toLowerCase()));
    const matchesCustomer = !filterCustomer || filterCustomer === "all" || item.customerName === filterCustomer;
    const matchesCustomerName = !customerNameSearch || item.customerName.toLowerCase().includes(customerNameSearch.toLowerCase());
    return matchesItemType && matchesItem && matchesCustomer && matchesCustomerName;
  });

  const paginatedReturns = filteredReturns.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedReturns(paginatedReturns.map((r) => r.id));
    } else {
      setSelectedReturns([]);
    }
  };

  const handleSelectReturn = (returnId: string, checked: boolean) => {
    if (checked) {
      setSelectedReturns([...selectedReturns, returnId]);
    } else {
      setSelectedReturns(selectedReturns.filter((id) => id !== returnId));
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    const filteredCount = filteredReturns.length;
    toast({
      title: "Search Applied",
      description: `Found ${filteredCount} return${filteredCount !== 1 ? 's' : ''} matching your filters.`,
    });
  };

  const handleViewReturn = (returnItem: SalesReturn) => {
    setSelectedReturn(returnItem);
    setIsViewOpen(true);
  };

  const handleDeleteClick = (returnItem: SalesReturn) => {
    setReturnToDelete(returnItem);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!returnToDelete) {
      setIsDeleteConfirmOpen(false);
      return;
    }

    const id = returnToDelete.id;
    const label = returnToDelete.invoiceNo;

    try {
      const res = (await apiClient.deleteSalesReturn(id)) as {
        error?: string;
        message?: string;
      };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }

      setReturns((prev) => prev.filter((r) => r.id !== id));
      setSelectedReturns((prev) => prev.filter((x) => x !== id));
      toast({
        title: "Return Deleted",
        description: `Return ${label} has been deleted successfully.`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete return",
        variant: "destructive",
      });
    } finally {
      setReturnToDelete(null);
      setIsDeleteConfirmOpen(false);
    }
  };

  const handleApproveClick = (returnItem: SalesReturn) => {
    setReturnToApprove(returnItem);
    setIsApproveConfirmOpen(true);
  };

  const handleConfirmApprove = async () => {
    if (!returnToApprove) {
      setIsApproveConfirmOpen(false);
      return;
    }
    const id = returnToApprove.id;
    const label = returnToApprove.invoiceNo;
    setActionSubmittingId(id);
    try {
      const res = (await apiClient.approveSalesReturn(id, {
        approved_by: approverLabel(),
      })) as { error?: string; message?: string };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }
      toast({
        title: "Return approved",
        description:
          res?.message ||
          `Return ${label} completed. Stock and vouchers have been posted.`,
      });
      setSelectedReturn((prev) =>
        prev?.id === id ? { ...prev, status: "completed" } : prev,
      );
      await loadReturns();
    } catch (error: any) {
      toast({
        title: "Approve failed",
        description: error?.message || "Could not approve this return.",
        variant: "destructive",
      });
    } finally {
      setActionSubmittingId(null);
      setReturnToApprove(null);
      setIsApproveConfirmOpen(false);
    }
  };

  const handleRejectClick = (returnItem: SalesReturn) => {
    setReturnToReject(returnItem);
    setRejectReasonDraft("");
    setIsRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!returnToReject) {
      setIsRejectDialogOpen(false);
      return;
    }
    const id = returnToReject.id;
    const label = returnToReject.invoiceNo;
    setActionSubmittingId(id);
    try {
      const res = (await apiClient.rejectSalesReturn(id, {
        rejected_by: approverLabel(),
        rejection_reason: rejectReasonDraft.trim() || undefined,
      })) as { error?: string; message?: string };
      if (res && typeof res === "object" && res.error) {
        throw new Error(res.error);
      }
      toast({
        title: "Return rejected",
        description: res?.message || `Return ${label} was rejected.`,
      });
      setSelectedReturn((prev) =>
        prev?.id === id ? { ...prev, status: "rejected" } : prev,
      );
      await loadReturns();
    } catch (error: any) {
      toast({
        title: "Reject failed",
        description: error?.message || "Could not reject this return.",
        variant: "destructive",
      });
    } finally {
      setActionSubmittingId(null);
      setReturnToReject(null);
      setRejectReasonDraft("");
      setIsRejectDialogOpen(false);
    }
  };

  const handleViewOriginalInvoice = (returnItem: SalesReturn) => {
    setSelectedReturn(returnItem);
    setIsOriginalInvoiceOpen(true);
  };

  const handlePrint = () => {
    if (!selectedReturn) return;

    const itemsRows = selectedReturn.items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.partNo}</td>
        <td>${item.itemName}</td>
        <td>${item.brand}</td>
        <td>${item.uom}</td>
        <td>${item.returnQty}</td>
        <td>${item.price.toLocaleString()}</td>
        <td>${item.total.toLocaleString()}</td>
      </tr>
    `).join('');

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Sale Return Invoice</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
              .invoice-container { max-width: 800px; margin: 0 auto; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
              .shop-info { display: flex; gap: 15px; align-items: flex-start; }
              .logo-placeholder { width: 80px; height: 80px; border: 1px solid #ccc; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #999; }
              .shop-details p { margin: 3px 0; font-size: 12px; }
              .shop-details .shop-name { font-weight: bold; font-size: 14px; }
              .invoice-title { text-align: right; }
              .invoice-title h1 { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
              .invoice-title p { font-size: 12px; margin: 3px 0; }
              .customer-section { background-color: #f97316; color: white; padding: 6px 12px; font-weight: bold; font-size: 12px; margin-bottom: 0; }
              .customer-details { padding: 10px 12px; border: 1px solid #ddd; border-top: none; margin-bottom: 15px; }
              .customer-details p { margin: 3px 0; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th { background-color: #f97316; color: white; padding: 8px; text-align: left; font-size: 11px; font-weight: 600; }
              td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
              tr:nth-child(even) { background-color: #f9f9f9; }
              .totals-section { display: flex; justify-content: space-between; margin-top: 20px; }
              .delivery-note { font-size: 12px; }
              .delivery-note strong { font-weight: bold; }
              .note-section { margin-top: 15px; font-size: 10px; color: #666; }
              .note-section strong { font-weight: bold; color: #333; }
              .totals-box { text-align: right; }
              .totals-box p { margin: 5px 0; font-size: 12px; }
              .totals-box .total-label { display: inline-block; width: 130px; text-align: right; }
              .totals-box .total-value { display: inline-block; width: 100px; text-align: right; font-weight: bold; }
              .totals-box .grand-total { font-size: 14px; font-weight: bold; }
              .signature-section { margin-top: 60px; text-align: right; padding-top: 20px; }
              .signature-line { border-top: 1px solid #333; width: 200px; display: inline-block; margin-bottom: 5px; }
              .signature-label { font-size: 12px; font-weight: bold; }
              @media print {
                body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
              }
              @page { size: A4; margin: 10mm; }
            </style>
          </head>
          <body>
            <div class="invoice-container">
              <div class="header">
                <div class="shop-info">
                  <div class="logo-placeholder">LOGO</div>
                  <div class="shop-details">
                    <p class="shop-name">Shop: LUCKY HYDRAULIC PARTS</p>
                    <p>Address: Shop#8, Adeel Market, Beside Ithihad Plaza, Tarnol, Islamabad</p>
                    <p>Tel: 03120576487</p>
                    <p>Email: daniyalarshad881996@gmail.com</p>
                  </div>
                </div>
                <div class="invoice-title">
                  <h1>SALE RETURN</h1>
                  <p>Invoice : ${selectedReturn.invoiceNo}</p>
                  <p>Date: ${selectedReturn.returnDate}</p>
                </div>
              </div>

              <div class="customer-section">Customer</div>
              <div class="customer-details">
                <p>Name: ${selectedReturn.customerName}</p>
                <p>Contact: ${selectedReturn.remarks || 'N/A'}</p>
              </div>

              <table>
                <thead>
                  <tr>
                    <th>S.No.</th>
                    <th>OEM/ Part No</th>
                    <th>ITEM</th>
                    <th>Brand</th>
                    <th>Uom</th>
                    <th>QTY</th>
                    <th>PRICE</th>
                    <th>SUB TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows}
                </tbody>
              </table>

              <div class="totals-section">
                <div class="left-section">
                  <div class="note-section">
                    <p><strong>NOTE:</strong> All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference.</p>
                    <p>Document invalid without authorised signature and stamp.</p>
                    <p>Goods once sold can not be taken back.</p>
                  </div>
                </div>
                <div class="totals-box">
                  <p><span class="total-label">Subtotal</span> <span class="total-value">PKR ${selectedReturn.subtotal.toLocaleString()}/-</span></p>
                  <p><span class="total-label">GST</span> <span class="total-value">PKR ${selectedReturn.gst.toLocaleString()}/-</span></p>
                  <p><span class="total-label">Total Amount</span> <span class="total-value">PKR ${selectedReturn.totalAmount.toLocaleString()}/-</span></p>
                  <p><span class="total-label">Discount</span> <span class="total-value">PKR ${selectedReturn.discount.toLocaleString()}/-</span></p>
                  <p class="grand-total"><span class="total-label">Total After Discount</span> <span class="total-value">PKR ${selectedReturn.amountAfterDiscount.toLocaleString()}/-</span></p>
                </div>
              </div>

              <div class="signature-section">
                <div class="signature-line"></div>
                <p class="signature-label">Authorised Signature</p>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
    toast({
      title: "Printing",
      description: "Document sent to printer.",
    });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <RotateCcw className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">Return Sale Orders</h2>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div className="space-y-1">
              <Label className="text-xs text-primary">Item Type</Label>
              <Select value={filterItemType} onValueChange={setFilterItemType}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="set">Set</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">Item</Label>
              <Select value={filterItem} onValueChange={setFilterItem}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Items</SelectItem>
                  {availableItems.map((item) => (
                    <SelectItem key={item.id} value={item.partNo}>
                      {item.name} ({item.partNo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">Customer</Label>
              <Select value={filterCustomer} onValueChange={setFilterCustomer}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {availableCustomers.map((customer) => (
                    <SelectItem key={customer.id} value={customer.name}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-primary">Customer Name</Label>
              <Input
                value={customerNameSearch}
                onChange={(e) => setCustomerNameSearch(e.target.value)}
                placeholder=""
                className="h-9 text-xs"
              />
            </div>
          </div>

          <Button
            onClick={handleSearch}
            size="sm"
            className="gap-2 bg-primary text-primary-foreground"
          >
            <Search className="w-4 h-4" />
            Search
          </Button>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedReturns.length === paginatedReturns.length && paginatedReturns.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-semibold">S.NO</TableHead>
                  <TableHead className="text-xs font-semibold">Invoice No</TableHead>
                  <TableHead className="text-xs font-semibold">Return Date</TableHead>
                  <TableHead className="text-xs font-semibold">Customer Name</TableHead>
                  <TableHead className="text-xs font-semibold">Remarks</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Total Amount</TableHead>
                  <TableHead className="text-xs font-semibold">Discount</TableHead>
                  <TableHead className="text-xs font-semibold">Amount After Discount</TableHead>
                  <TableHead className="text-xs font-semibold text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingReturns ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                      Loading returns...
                    </TableCell>
                  </TableRow>
                ) : paginatedReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-8 text-muted-foreground text-xs">
                      {filterItemType || filterItem !== "all" || filterCustomer !== "all" || customerNameSearch
                        ? "No return orders found matching your filters"
                        : "No return orders found. Returns will appear here once created."}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedReturns.map((returnItem, index) => (
                    <TableRow key={returnItem.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedReturns.includes(returnItem.id)}
                          onCheckedChange={(checked) => handleSelectReturn(returnItem.id, checked as boolean)}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{(currentPage - 1) * itemsPerPage + index + 1}</TableCell>
                      <TableCell className="text-xs font-medium">{returnItem.invoiceNo}</TableCell>
                      <TableCell className="text-xs">{returnItem.returnDate}</TableCell>
                      <TableCell className="text-xs">{returnItem.customerName}</TableCell>
                      <TableCell className="text-xs">{returnItem.remarks || "-"}</TableCell>
                      <TableCell className="text-xs capitalize">
                        {returnItem.status || "—"}
                      </TableCell>
                      <TableCell className="text-xs">{returnItem.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{returnItem.discount}</TableCell>
                      <TableCell className="text-xs">{returnItem.amountAfterDiscount.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-center gap-1">
                          <ActionButtonTooltip label="View" variant="view">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-primary"
                              onClick={() => handleViewReturn(returnItem)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                          {returnItem.status === "pending" && (
                            <>
                              <ActionButtonTooltip
                                label="Approve return"
                                variant="view"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-50"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleApproveClick(returnItem)}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Approve
                                </Button>
                              </ActionButtonTooltip>
                              <ActionButtonTooltip
                                label="Reject return"
                                variant="more"
                              >
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 gap-1 text-xs"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleRejectClick(returnItem)}
                                >
                                  <Ban className="w-3 h-3" />
                                  Reject
                                </Button>
                              </ActionButtonTooltip>
                              <ActionButtonTooltip label="Delete" variant="delete">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 gap-1 text-xs text-destructive"
                                  disabled={actionSubmittingId === returnItem.id}
                                  onClick={() => handleDeleteClick(returnItem)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                  Delete
                                </Button>
                              </ActionButtonTooltip>
                            </>
                          )}
                          <DropdownMenu>
                            <ActionButtonTooltip label="More Actions" variant="more">
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 bg-primary text-primary-foreground">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </ActionButtonTooltip>
                            <DropdownMenuContent align="end" className="bg-card border-border">
                              <DropdownMenuItem
                                onClick={() => handleViewOriginalInvoice(returnItem)}
                                className="text-xs cursor-pointer"
                              >
                                <FileText className="w-4 h-4 mr-2" />
                                View Original Invoice
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Simple Pagination */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center space-x-2">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredReturns.length)} of {filteredReturns.length} entries
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* View Return Details Dialog */}
      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="p-2 bg-primary rounded-lg">
              <RotateCcw className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="text-lg">Return Invoice Details</DialogTitle>
              <p className="text-xs text-muted-foreground">Invoice Number: {selectedReturn?.invoiceNo}</p>
            </div>
          </DialogHeader>

          {selectedReturn && (
            <div className="space-y-4" id="return-print-content">
              {/* Invoice Details Header */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs p-4 border rounded-lg bg-muted/20">
                <div>
                  <p className="text-muted-foreground">Return Date:</p>
                  <p className="font-medium">{selectedReturn.returnDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Invoice No:</p>
                  <p className="font-medium">{selectedReturn.invoiceNo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Sale Type:</p>
                  <p className="font-medium">{selectedReturn.saleType}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Customer Name:</p>
                  <p className="font-medium">{selectedReturn.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Remarks:</p>
                  <p className="font-medium">{selectedReturn.remarks || "none"}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-semibold">Sr. No.</TableHead>
                      <TableHead className="text-xs font-semibold">OEM/ Part No</TableHead>
                      <TableHead className="text-xs font-semibold">Item</TableHead>
                      <TableHead className="text-xs font-semibold">Brand</TableHead>
                      <TableHead className="text-xs font-semibold">Model</TableHead>
                      <TableHead className="text-xs font-semibold">Uom</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Return Qty</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Avg Cost</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Price</TableHead>
                      <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedReturn.items.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs">{idx + 1}</TableCell>
                        <TableCell className="text-xs">{item.partNo}</TableCell>
                        <TableCell className="text-xs">{item.itemName}</TableCell>
                        <TableCell className="text-xs">{item.brand}</TableCell>
                        <TableCell className="text-xs">{item.model || "-"}</TableCell>
                        <TableCell className="text-xs">{item.uom}</TableCell>
                        <TableCell className="text-xs text-right">{item.returnQty}</TableCell>
                        <TableCell className="text-xs text-right">{item.avgCost?.toLocaleString() || "0"}</TableCell>
                        <TableCell className="text-xs text-right">{item.price.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{item.total.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex flex-col items-end gap-1 text-xs">
                <p>Subtotal:<span className="font-semibold ml-2">PKR {selectedReturn.subtotal.toLocaleString()}</span></p>
                <p>GST:<span className="font-semibold ml-2">PKR {selectedReturn.gst.toLocaleString()}</span></p>
                <p>Total Amount:<span className="font-semibold ml-2">PKR {selectedReturn.totalAmount.toLocaleString()}</span></p>
                <p>Discount:<span className="font-semibold ml-2">PKR {selectedReturn.discount.toLocaleString()}</span></p>
                <p>Total After Discount:<span className="font-semibold ml-2">PKR {selectedReturn.amountAfterDiscount.toLocaleString()}</span></p>
              </div>
            </div>
          )}

          {/* Dialog Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setIsViewOpen(false)}
              className="gap-2 text-primary text-xs"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
            <div className="flex flex-wrap items-center gap-2">
              {selectedReturn?.status === "pending" && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    disabled={actionSubmittingId === selectedReturn.id}
                    onClick={() =>
                      selectedReturn && handleRejectClick(selectedReturn)
                    }
                  >
                    <Ban className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={actionSubmittingId === selectedReturn.id}
                    onClick={() =>
                      selectedReturn && handleApproveClick(selectedReturn)
                    }
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Approve
                  </Button>
                </>
              )}
              <Button
                onClick={handlePrint}
                className="gap-2 bg-primary text-primary-foreground text-xs"
              >
                <Printer className="w-4 h-4" />
                PRINT
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Original Invoice Dialog */}
      <Dialog open={isOriginalInvoiceOpen} onOpenChange={setIsOriginalInvoiceOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Original Invoice</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className="space-y-4">
              <div className="p-4 border rounded-lg bg-muted/20">
                <p className="text-sm">
                  <span className="text-muted-foreground">Original Invoice Number:</span>{" "}
                  <span className="font-medium">{selectedReturn.originalInvoiceNo || "N/A"}</span>
                </p>
                <p className="text-sm mt-2">
                  <span className="text-muted-foreground">Customer:</span>{" "}
                  <span className="font-medium">{selectedReturn.customerName}</span>
                </p>
                <p className="text-sm mt-2">
                  <span className="text-muted-foreground">Return Invoice:</span>{" "}
                  <span className="font-medium">{selectedReturn.invoiceNo}</span>
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                This shows the reference to the original sale invoice from which the return was made.
              </p>
            </div>
          )}
          <div className="flex justify-end pt-4 border-t">
            <Button variant="outline" onClick={() => setIsOriginalInvoiceOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete return invoice{" "}
              <span className="font-semibold">{returnToDelete?.invoiceNo}</span>? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isApproveConfirmOpen}
        onOpenChange={(open) => {
          setIsApproveConfirmOpen(open);
          if (!open) setReturnToApprove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve sales return?</AlertDialogTitle>
            <AlertDialogDescription>
              This will post stock movements, restore rack/shelf quantities where
              applicable, and create the accounting vouchers for return{" "}
              <span className="font-semibold">{returnToApprove?.invoiceNo}</span>.
              This cannot be undone from this screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!actionSubmittingId}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!!actionSubmittingId}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmApprove();
              }}
            >
              {actionSubmittingId ? "Working…" : "Approve"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={isRejectDialogOpen}
        onOpenChange={(open) => {
          setIsRejectDialogOpen(open);
          if (!open) {
            setReturnToReject(null);
            setRejectReasonDraft("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject return</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Reject{" "}
            <span className="font-medium text-foreground">
              {returnToReject?.invoiceNo}
            </span>
            ? It will be marked rejected (no stock or voucher posting).
          </p>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea
              value={rejectReasonDraft}
              onChange={(e) => setRejectReasonDraft(e.target.value)}
              className="text-xs min-h-[80px]"
              placeholder="Optional note for audit…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!actionSubmittingId}
              onClick={() => setIsRejectDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!!actionSubmittingId}
              onClick={() => void handleConfirmReject()}
            >
              {actionSubmittingId ? "Working…" : "Reject return"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
