import { useState, useRef, useEffect } from "react";
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
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

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
  store: string;
  remarks: string;
  totalAmount: number;
  discount: number;
  amountAfterDiscount: number;
  saleType: string;
  items: ReturnItem[];
  originalInvoiceNo?: string;
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
  const [isOriginalInvoiceOpen, setIsOriginalInvoiceOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<SalesReturn | null>(null);
  const [returnToDelete, setReturnToDelete] = useState<SalesReturn | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Fetch returns from database/localStorage
  useEffect(() => {
    const fetchReturns = async () => {
      setLoadingReturns(true);
      try {
        // TODO: Replace with API call when endpoint is available
        // const response = await apiClient.getSalesReturns();
        // if (response.data) {
        //   setReturns(response.data);
        // }

        // For now, use localStorage
        const storedReturns = localStorage.getItem('salesReturns');
        if (storedReturns) {
          setReturns(JSON.parse(storedReturns));
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to load sales returns",
          variant: "destructive",
        });
      } finally {
        setLoadingReturns(false);
      }
    };

    fetchReturns();
  }, []);

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

  // Save returns to localStorage (temporary until API is ready)
  useEffect(() => {
    if (returns.length > 0) {
      localStorage.setItem('salesReturns', JSON.stringify(returns));
    }
  }, [returns]);

  const filteredReturns = returns.filter((item) => {
    const matchesItemType = !filterItemType || filterItemType === "all";
    const matchesItem = !filterItem || filterItem === "all" ||
      item.items.some(i => i.partNo === filterItem || i.itemName.toLowerCase().includes(filterItem.toLowerCase()));
    const matchesCustomer = !filterCustomer || filterCustomer === "all" || item.customerName === filterCustomer;
    const matchesCustomerName = !customerNameSearch || item.customerName.toLowerCase().includes(customerNameSearch.toLowerCase());
    return matchesItemType && matchesItem && matchesCustomer && matchesCustomerName;
  });

  const totalPages = Math.ceil(filteredReturns.length / itemsPerPage);
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
    if (returnToDelete) {
      // TODO: Add API call when endpoint is available
      // try {
      //   const response = await apiClient.deleteSalesReturn(returnToDelete.id);
      //   if (response.error) {
      //     throw new Error(response.error);
      //   }
      // } catch (error: any) {
      //   toast({
      //     title: "Error",
      //     description: error.message || "Failed to delete return",
      //     variant: "destructive",
      //   });
      //   return;
      // }

      setReturns(returns.filter((r) => r.id !== returnToDelete.id));
      setSelectedReturns(selectedReturns.filter(id => id !== returnToDelete.id));
      toast({
        title: "Return Deleted",
        description: `Return Invoice ${returnToDelete.invoiceNo} has been deleted successfully.`,
      });
      setReturnToDelete(null);
    }
    setIsDeleteConfirmOpen(false);
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
                  <div class="delivery-note">
                    <p><strong>Delivered To:</strong> ${selectedReturn.store}</p>
                  </div>
                  <div class="note-section">
                    <p><strong>NOTE:</strong> All manufacturer's Names, Numbers, Symbols and Descriptions are used for reference.</p>
                    <p>Document invalid without authorised signature and stamp.</p>
                    <p>Goods once sold can not be taken back.</p>
                  </div>
                </div>
                <div class="totals-box">
                  <p><span class="total-label">Total</span> <span class="total-value">PKR ${selectedReturn.totalAmount.toLocaleString()}/-</span></p>
                  <p><span class="total-label">Discount</span> <span class="total-value">${selectedReturn.discount}</span></p>
                  <p class="grand-total"><span class="total-label">Total</span> <span class="total-value">PKR ${selectedReturn.amountAfterDiscount.toLocaleString()}/-</span></p>
                  <p class="grand-total"><span class="total-label">Total After GST</span> <span class="total-value">PKR ${selectedReturn.amountAfterDiscount.toLocaleString()}/-</span></p>
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

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
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
                  <TableHead className="text-xs font-semibold">Store</TableHead>
                  <TableHead className="text-xs font-semibold">Remarks</TableHead>
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
                      <TableCell className="text-xs">{returnItem.store}</TableCell>
                      <TableCell className="text-xs">{returnItem.remarks || "-"}</TableCell>
                      <TableCell className="text-xs">{returnItem.totalAmount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{returnItem.discount}</TableCell>
                      <TableCell className="text-xs">{returnItem.amountAfterDiscount.toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
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
                          <ActionButtonTooltip label="Delete" variant="delete">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 gap-1 text-xs text-destructive"
                              onClick={() => handleDeleteClick(returnItem)}
                            >
                              <Trash2 className="w-3 h-3" />
                              Delete
                            </Button>
                          </ActionButtonTooltip>
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

          {/* Pagination */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-t border-border gap-4">
            <p className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
              {Math.min(currentPage * itemsPerPage, filteredReturns.length)} of{" "}
              {filteredReturns.length} Records
            </p>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(1)}
                disabled={currentPage === 1}
                className="text-xs h-8"
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="text-xs h-8"
              >
                Prev
              </Button>
              <span className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded">
                {currentPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="text-xs h-8"
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => goToPage(totalPages)}
                disabled={currentPage === totalPages}
                className="text-xs h-8"
              >
                Last
              </Button>

              <Select value={String(itemsPerPage)} onValueChange={(value) => setItemsPerPage(Number(value))}>
                <SelectTrigger className="w-16 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                </SelectContent>
              </Select>
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
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs p-4 border rounded-lg bg-muted/20">
                <div>
                  <p className="text-muted-foreground">Return Date:</p>
                  <p className="font-medium">{selectedReturn.returnDate}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Shop:</p>
                  <p className="font-medium">{selectedReturn.store}</p>
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
                <p>Total Amount:<span className="font-semibold ml-2">PKR {selectedReturn.totalAmount.toLocaleString()}</span></p>
                <p>Discount:<span className="font-semibold ml-2">PKR {selectedReturn.discount}</span></p>
                <p>Total After Discount:<span className="font-semibold ml-2">PKR {selectedReturn.amountAfterDiscount.toLocaleString()}</span></p>
              </div>
            </div>
          )}

          {/* Dialog Footer */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setIsViewOpen(false)}
              className="gap-2 text-primary text-xs"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
            <Button
              onClick={handlePrint}
              className="gap-2 bg-primary text-primary-foreground text-xs"
            >
              <Printer className="w-4 h-4" />
              PRINT
            </Button>
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
    </div>
  );
};
