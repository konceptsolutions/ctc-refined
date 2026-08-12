import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Trash, Search } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { resolveInvoiceLinePartFields } from "@/utils/invoiceLinePart";

interface SalesInvoiceItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand?: string;
  orderedQty: number;
  deliveredQty: number;
  pendingQty: number;
  unitPrice: number;
  avgCost?: number;
  discount: number;
  lineTotal: number;
  grade?: string;
}

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  customerId?: string;
  customerType?: string;
  status: string;
  grandTotal: number;
  subtotal?: number;
  overallDiscount?: number;
  deliveredTo?: string;
  remarks?: string;
  items?: SalesInvoiceItem[];
}

interface StoreEditSalesInvoiceProps {
  invoice: SalesInvoice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

interface OrderItemForm {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  orderedQty: string;
  unitPrice: string;
  discount: string;
  grade: string;
}

interface PartOption {
  id: string;
  partNo: string;
  description: string;
  brand: string;
  priceA: number;
  priceB: number;
  priceM: number;
  stockQty: number;
  availableQty: number;
}

interface Customer {
  id: string;
  name: string;
}

export const StoreEditSalesInvoice = ({ invoice, open, onOpenChange, onSuccess }: StoreEditSalesInvoiceProps) => {
  const [loading, setLoading] = useState(false);
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formCustomerId, setFormCustomerId] = useState("");
  const [formCustomerName, setFormCustomerName] = useState("");
  const [formDeliveredTo, setFormDeliveredTo] = useState("");
  const [formRemarks, setFormRemarks] = useState("");
  const [formDiscount, setFormDiscount] = useState("0");
  const [formItems, setFormItems] = useState<OrderItemForm[]>([]);

  // Dropdown data
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [parts, setParts] = useState<PartOption[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);

  // Part search state
  const [partSearchTerms, setPartSearchTerms] = useState<{ [key: string]: string }>({});
  const [showPartsDropdown, setShowPartsDropdown] = useState<{ [key: string]: boolean }>({});
  const partDropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (open && invoice) {
      loadInvoiceData();
    }

    if (open) {
      fetchDropdownData();
    }
  }, [open, invoice]);

  // Click outside handler for parts dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      Object.keys(partDropdownRefs.current).forEach((itemId) => {
        if (
          partDropdownRefs.current[itemId] &&
          !partDropdownRefs.current[itemId]?.contains(event.target as Node)
        ) {
          setShowPartsDropdown((prev) => ({ ...prev, [itemId]: false }));
        }
      });
    };

    if (Object.keys(showPartsDropdown).some(key => showPartsDropdown[key])) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showPartsDropdown]);

  const loadInvoiceData = async () => {
    if (!invoice) return;

    try {
      // Fetch full invoice details
      const response = await apiClient.getSalesInvoice(invoice.id);
      const invoiceData: any = response.data || response;

      if (invoiceData) {
        // Load invoice data
        setFormDate(new Date(invoiceData.invoiceDate || invoice.invoiceDate));
        setFormCustomerId(invoiceData.customerId || invoice.customerId || "");
        setFormCustomerName(invoiceData.customerName || invoice.customerName || "");
        setFormDeliveredTo(invoiceData.deliveredTo || invoice.deliveredTo || "");
        setFormRemarks(invoiceData.remarks || invoice.remarks || "");
        setFormDiscount(String(invoiceData.overallDiscount || invoice.overallDiscount || 0));

        // Load items
        if (invoiceData.items && invoiceData.items.length > 0) {
          setFormItems(invoiceData.items.map((item: any, idx: number) => {
            const linePart = resolveInvoiceLinePartFields(item);
            return {
            id: String(idx + 1),
            partId: item.partId || "",
            partNo: linePart.partNo,
            description: linePart.description,
            brand: linePart.brand || "N/A",
            orderedQty: String(item.orderedQty || 0),
            unitPrice: String(item.unitPrice || 0),
            discount: String(item.discount || 0),
            grade: item.grade || "A",
          };
          }));
        } else if (invoice.items && invoice.items.length > 0) {
          setFormItems(invoice.items.map((item, idx) => {
            const linePart = resolveInvoiceLinePartFields(item);
            return {
            id: String(idx + 1),
            partId: item.partId || "",
            partNo: linePart.partNo,
            description: linePart.description,
            brand: linePart.brand || "N/A",
            orderedQty: String(item.orderedQty || 0),
            unitPrice: String(item.unitPrice || 0),
            discount: String(item.discount || 0),
            grade: item.grade || "A",
          };
          }));
        } else {
          setFormItems([{
            id: "1",
            partId: "",
            partNo: "",
            description: "",
            brand: "",
            orderedQty: "",
            unitPrice: "",
            discount: "0",
            grade: "A"
          }]);
        }
      }
    } catch (error: any) {
      toast.error("Failed to load invoice details");
    }
  };

  const fetchDropdownData = async () => {
    try {
      // Fetch customers
      const customersResponse = await apiClient.getCustomers();
      const customersData = customersResponse.data || customersResponse;
      if (Array.isArray(customersData)) {
        setCustomers(customersData.map((c: any) => ({
          id: c.id,
          name: c.name
        })));
      }

      // Fetch parts
      fetchParts();
    } catch (error: any) {
    }
  };

  const fetchParts = async (searchTerm: string = "") => {
    setPartsLoading(true);
    try {
      const params: any = {
        limit: 500,
        page: 1,
        status: 'active'
      };

      if (searchTerm && searchTerm.trim().length > 0) {
        params.search = searchTerm.trim();
        params.limit = 200;
      }

      const response = await apiClient.getParts(params);
      const partsData = response.data || response;

      if (Array.isArray(partsData)) {
        setParts(partsData
          .map((p: any) => {
            const partNo = String(p.master_part_no || '').trim();
            if (!partNo || partNo === '' || partNo === 'null' || partNo === 'undefined') {
              return null;
            }
            return {
              id: p.id,
              partNo: partNo,
              description: p.description || "",
              brand: p.brand_name || "N/A",
              priceA: p.price_a || 0,
              priceB: p.price_b || 0,
              priceM: p.price_m || 0,
              stockQty: p.stockQty || 0,
              availableQty: (p.stockQty || 0) - (p.reservedQty || 0),
            };
          })
          .filter((p: PartOption | null): p is PartOption => p !== null)
        );
      }
    } catch (error: any) {
    } finally {
      setPartsLoading(false);
    }
  };

  const handleAddItem = () => {
    setFormItems([...formItems, {
      id: String(Date.now()),
      partId: "",
      partNo: "",
      description: "",
      brand: "",
      orderedQty: "",
      unitPrice: "",
      discount: "0",
      grade: "A"
    }]);
  };

  const handleRemoveItem = (id: string) => {
    if (formItems.length > 1) {
      setFormItems(formItems.filter((item) => item.id !== id));
    }
  };

  const handleItemChange = (id: string, field: keyof OrderItemForm, value: string) => {
    setFormItems(formItems.map((item) => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handlePartSelect = (itemId: string, part: PartOption) => {
    setFormItems(formItems.map((item) => {
      if (item.id === itemId) {
        return {
          ...item,
          partId: part.id,
          partNo: part.partNo,
          description: part.description,
          brand: part.brand,
          unitPrice: String(part.priceA || 0),
        };
      }
      return item;
    }));
    setShowPartsDropdown((prev) => ({ ...prev, [itemId]: false }));
    setPartSearchTerms((prev) => ({ ...prev, [itemId]: "" }));
  };

  const getFilteredParts = (itemId: string) => {
    const searchTerm = (partSearchTerms[itemId] || "").toLowerCase().trim();
    if (!searchTerm) return parts.slice(0, 50);

    return parts.filter((part) =>
      part.partNo.toLowerCase().includes(searchTerm) ||
      part.description.toLowerCase().includes(searchTerm) ||
      part.brand.toLowerCase().includes(searchTerm)
    ).slice(0, 50);
  };

  const calculateLineTotal = (item: OrderItemForm): number => {
    const qty = Number(item.orderedQty) || 0;
    const price = Number(item.unitPrice) || 0;
    const discount = Number(item.discount) || 0;
    return qty * price - discount;
  };

  const calculateSubtotal = (): number => {
    return formItems.reduce((sum, item) => sum + calculateLineTotal(item), 0);
  };

  const calculateGrandTotal = (): number => {
    return calculateSubtotal() - (Number(formDiscount) || 0);
  };

  const handleSubmit = async () => {
    if (!invoice) return;

    // Validation
    if (!formCustomerName.trim()) {
      toast.error("Please enter customer name");
      return;
    }

    const validItems = formItems.filter(item => item.partId && item.orderedQty && item.unitPrice);
    if (validItems.length === 0) {
      toast.error("Please add at least one valid item");
      return;
    }

    try {
      setLoading(true);

      // Prepare items for API
      const itemsForUpdate = validItems.map(item => ({
        partId: item.partId,
        partNo: item.partNo,
        description: item.description,
        orderedQty: Number(item.orderedQty),
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount) || 0,
        lineTotal: calculateLineTotal(item),
        grade: item.grade || "A",
        brand: item.brand || "",
      }));

      // Update invoice
      await apiClient.updateSalesInvoice(invoice.id, {
        invoiceDate: formDate.toISOString(),
        customerName: formCustomerName,
        customerId: formCustomerId || undefined,
        deliveredTo: formDeliveredTo || undefined,
        remarks: formRemarks || undefined,
        overallDiscount: Number(formDiscount) || 0,
        items: itemsForUpdate,
      });

      toast.success("Sales Invoice updated successfully");
      onOpenChange(false);
      if (onSuccess) {
        onSuccess();
      }
    } catch (error: any) {
      toast.error(error.error || "Failed to update invoice");
    } finally {
      setLoading(false);
    }
  };

  if (!invoice) return null;

  // Check if invoice can be edited
  const canEdit = invoice.status !== "cancelled" && invoice.status !== "fully_delivered";
  const hasDeliveredItems = invoice.items?.some(item => item.deliveredQty > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Edit Sales Invoice - {invoice.invoiceNo}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-180px)]">
          {!canEdit ? (
            <div className="p-4 bg-destructive/10 text-destructive rounded-md mb-4">
              This invoice cannot be edited because it is {invoice.status === "cancelled" ? "cancelled" : "fully delivered"}.
            </div>
          ) : hasDeliveredItems ? (
            <div className="p-4 bg-warning/10 text-warning rounded-md mb-4">
              This invoice has partial deliveries. You cannot modify items but can update other details.
            </div>
          ) : null}

          <div className="space-y-4">
            {/* Basic Information */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Invoice Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !formDate && "text-muted-foreground"
                      )}
                      disabled={!canEdit}
                    >
                      {formDate ? format(formDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={formDate}
                      onSelect={(date) => date && setFormDate(date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <Label>Customer *</Label>
                <Select
                  value={formCustomerId || undefined}
                  onValueChange={(value) => {
                    setFormCustomerId(value);
                    const customer = customers.find(c => c.id === value);
                    if (customer) {
                      setFormCustomerName(customer.name);
                    }
                  }}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={formCustomerName || "Select customer"} />
                  </SelectTrigger>
                  <SelectContent>
                    {customers.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Deliver To</Label>
                <Input
                  value={formDeliveredTo}
                  onChange={(e) => setFormDeliveredTo(e.target.value)}
                  placeholder="Delivery location or person"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label>Overall Discount</Label>
                <Input
                  type="number"
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label>Remarks</Label>
                <Textarea
                  value={formRemarks}
                  onChange={(e) => setFormRemarks(e.target.value)}
                  placeholder="Enter remarks"
                  rows={2}
                  disabled={!canEdit}
                />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Items *</Label>
                {canEdit && !hasDeliveredItems && (
                  <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                )}
              </div>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[300px]">Part</TableHead>
                      <TableHead className="w-[80px]">Qty</TableHead>
                      <TableHead className="w-[100px]">Unit Price</TableHead>
                      <TableHead className="w-[80px]">Discount</TableHead>
                      <TableHead className="w-[100px]">Total</TableHead>
                      {canEdit && !hasDeliveredItems && <TableHead className="w-[50px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formItems.map((item) => {
                      const lineTotal = calculateLineTotal(item);
                      const filteredParts = getFilteredParts(item.id);

                      return (
                        <TableRow key={item.id}>
                          <TableCell>
                            {canEdit && !hasDeliveredItems ? (
                              <div
                                className="relative"
                                ref={(el) => (partDropdownRefs.current[item.id] = el)}
                              >
                                <div className="relative">
                                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                  <Input
                                    value={partSearchTerms[item.id] || item.partNo}
                                    onChange={(e) => {
                                      setPartSearchTerms((prev) => ({
                                        ...prev,
                                        [item.id]: e.target.value,
                                      }));
                                      setShowPartsDropdown((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }));
                                    }}
                                    onFocus={() => {
                                      setShowPartsDropdown((prev) => ({
                                        ...prev,
                                        [item.id]: true,
                                      }));
                                    }}
                                    placeholder="Search parts..."
                                    className="pl-8"
                                  />
                                </div>
                                {showPartsDropdown[item.id] && (
                                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-auto">
                                    {partsLoading ? (
                                      <div className="p-2 text-sm text-muted-foreground">
                                        Loading...
                                      </div>
                                    ) : filteredParts.length === 0 ? (
                                      <div className="p-2 text-sm text-muted-foreground">
                                        No parts found
                                      </div>
                                    ) : (
                                      filteredParts.map((part) => (
                                        <div
                                          key={part.id}
                                          className="p-2 hover:bg-accent cursor-pointer text-sm"
                                          onClick={() => handlePartSelect(item.id, part)}
                                        >
                                          <div className="font-medium">{part.partNo}</div>
                                          <div className="text-xs text-muted-foreground">
                                            {part.brand} | Stock: {part.availableQty}
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div>
                                <div className="font-medium">{item.partNo}</div>
                                <div className="text-xs text-muted-foreground">{item.brand}</div>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit && !hasDeliveredItems ? (
                              <Input
                                type="number"
                                value={item.orderedQty}
                                onChange={(e) => handleItemChange(item.id, "orderedQty", e.target.value)}
                                placeholder="Qty"
                                min="1"
                                className="w-20"
                              />
                            ) : (
                              <span>{item.orderedQty}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit && !hasDeliveredItems ? (
                              <Input
                                type="number"
                                value={item.unitPrice}
                                onChange={(e) => handleItemChange(item.id, "unitPrice", e.target.value)}
                                placeholder="Price"
                                min="0"
                                step="0.01"
                                className="w-24"
                              />
                            ) : (
                              <span>Rs {Number(item.unitPrice).toFixed(2)}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {canEdit && !hasDeliveredItems ? (
                              <Input
                                type="number"
                                value={item.discount}
                                onChange={(e) => handleItemChange(item.id, "discount", e.target.value)}
                                placeholder="0"
                                min="0"
                                step="0.01"
                                className="w-20"
                              />
                            ) : (
                              <span>Rs {Number(item.discount).toFixed(2)}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">Rs {lineTotal.toFixed(2)}</div>
                          </TableCell>
                          {canEdit && !hasDeliveredItems && (
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveItem(item.id)}
                                disabled={formItems.length === 1}
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-64 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>Rs {calculateSubtotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Discount:</span>
                    <span>- Rs {(Number(formDiscount) || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t pt-2">
                    <span>Grand Total:</span>
                    <span>Rs {calculateGrandTotal().toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          {canEdit && (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
