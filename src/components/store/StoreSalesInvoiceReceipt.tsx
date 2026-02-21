import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { Printer } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

interface SalesInvoiceItem {
  id: string;
  partNo: string;
  description: string;
  orderedQty: number;
  deliveredQty: number;
  unitPrice: number;
  avgCost?: number;
  lineTotal: number;
}

interface SalesInvoice {
  id: string;
  invoiceNo: string;
  invoiceDate: string;
  customerName: string;
  status: string;
  grandTotal: number;
  deliveredTo?: string;
  items?: SalesInvoiceItem[];
}

interface StoreSalesInvoiceReceiptProps {
  invoice: SalesInvoice;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeliveryConfirmed?: () => void;
}

export const StoreSalesInvoiceReceipt = ({
  invoice,
  open,
  onOpenChange,
  onDeliveryConfirmed
}: StoreSalesInvoiceReceiptProps) => {
  const receiptRef = useRef<HTMLDivElement>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Track delivery quantities for each item
  const [deliveryQuantities, setDeliveryQuantities] = useState<{ [itemId: string]: number }>({});

  // Initialize delivery quantities when dialog opens
  useEffect(() => {
    if (open && invoice.items) {
      const initialQuantities: { [itemId: string]: number } = {};
      invoice.items.forEach((item) => {
        const pendingQty = item.orderedQty - item.deliveredQty;
        initialQuantities[item.id] = pendingQty; // Default to full remaining quantity
      });
      setDeliveryQuantities(initialQuantities);
    }
  }, [open, invoice.items]);

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = parseInt(value) || 0;
    const item = invoice.items?.find((i) => i.id === itemId);
    if (item) {
      const maxQty = item.orderedQty - item.deliveredQty;
      // Clamp between 0 and max pending quantity
      const clampedQty = Math.max(0, Math.min(qty, maxQty));
      setDeliveryQuantities((prev) => ({ ...prev, [itemId]: clampedQty }));
    }
  };

  const getPendingQty = (item: SalesInvoiceItem) => {
    return item.orderedQty - item.deliveredQty;
  };

  const getDeliveryQty = (itemId: string) => {
    return deliveryQuantities[itemId] || 0;
  };

  const hasAnyDelivery = () => {
    return Object.values(deliveryQuantities).some((qty) => qty > 0);
  };

  const handlePrintAndConfirmDelivery = async () => {
    if (!receiptRef.current) return;

    // Print receipt first
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const printContent = receiptRef.current.innerHTML;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Delivery Receipt - ${invoice.invoiceNo}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .invoice-info {
              display: flex;
              justify-content: space-between;
              margin-bottom: 20px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            .total {
              text-align: right;
              font-size: 18px;
              font-weight: bold;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #ddd;
              font-size: 12px;
              color: #666;
            }
            @media print {
              body {
                padding: 0;
              }
              .no-print {
                display: none;
              }
            }
          </style>
        </head>
        <body>
          ${printContent}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();

      // After printing, confirm delivery and reduce stock
      confirmDelivery();
    }, 250);
  };

  const confirmDelivery = async () => {
    try {
      setIsConfirming(true);

      // Prepare delivery items - only deliver items with quantity > 0
      const deliveryItems = (invoice.items || [])
        .filter((item) => {
          const deliverQty = getDeliveryQty(item.id);
          return deliverQty > 0;
        })
        .map((item) => ({
          invoiceItemId: item.id,
          quantity: getDeliveryQty(item.id),
        }));

      if (deliveryItems.length === 0) {
        toast.error("Please enter quantity to deliver for at least one item");
        setIsConfirming(false);
        return;
      }

      // Record delivery - this will reduce stock
      const response = await apiClient.recordDelivery(invoice.id, {
        challanNo: `CH-${invoice.invoiceNo}-${Date.now()}`,
        deliveryDate: new Date().toISOString().split("T")[0],
        deliveredBy: "Store Manager",
        items: deliveryItems,
      });

      if (response.error) {
        toast.error(response.error || "Failed to confirm delivery");
        return;
      }

      // Check if this was a partial delivery
      const totalPending = (invoice.items || []).reduce((sum, item) => sum + getPendingQty(item), 0);
      const totalDelivering = deliveryItems.reduce((sum, item) => sum + item.quantity, 0);
      const isPartialDelivery = totalDelivering < totalPending;

      if (isPartialDelivery) {
        toast.success(`Partial delivery confirmed for Invoice ${invoice.invoiceNo}. Remaining items are pending.`);
      } else {
        toast.success(`Full delivery confirmed for Invoice ${invoice.invoiceNo}. Stock has been reduced.`);
      }

      // Refresh invoices list
      if (onDeliveryConfirmed) {
        onDeliveryConfirmed();
      }

      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to confirm delivery");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle>Delivery Receipt - {invoice.invoiceNo}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div ref={receiptRef} className="bg-white p-6 rounded-lg">
            {/* Header */}
            <div className="header">
              <h1 className="text-2xl font-bold">Sales Invoice Delivery Receipt</h1>
              <p className="text-sm text-muted-foreground mt-2">
                Invoice Number: {invoice.invoiceNo}
              </p>
            </div>

            {/* Invoice Info */}
            <div className="invoice-info">
              <div>
                <p className="text-sm text-muted-foreground">Invoice Date</p>
                <p className="font-medium">
                  {format(new Date(invoice.invoiceDate), "MMMM dd, yyyy")}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Customer</p>
                <p className="font-medium">{invoice.customerName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Deliver To</p>
                <p className="font-medium">{invoice.deliveredTo || "N/A"}</p>
              </div>
            </div>

            {/* Items Table */}
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[150px]">Part No</TableHead>
                    <TableHead className="min-w-[150px]">Description</TableHead>
                    <TableHead className="text-center w-[80px]">Ordered</TableHead>
                    <TableHead className="text-center w-[80px]">Delivered</TableHead>
                    <TableHead className="text-center w-[80px]">Pending</TableHead>
                    <TableHead className="text-center w-[100px]">Deliver Now</TableHead>
                    <TableHead className="text-right w-[100px]">Unit Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invoice.items && invoice.items.length > 0 ? (
                    invoice.items.map((item) => {
                      const pendingQty = getPendingQty(item);
                      const isFullyDelivered = pendingQty === 0;
                      return (
                        <TableRow key={item.id} className={`h-12 ${isFullyDelivered ? 'bg-muted/50' : ''}`}>
                          <TableCell className="font-medium align-middle">{item.partNo}</TableCell>
                          <TableCell className="align-middle">{item.description}</TableCell>
                          <TableCell className="text-center align-middle">{item.orderedQty}</TableCell>
                          <TableCell className="text-center align-middle text-green-600 font-medium">
                            {item.deliveredQty}
                          </TableCell>
                          <TableCell className="text-center align-middle">
                            {isFullyDelivered ? (
                              <span className="text-green-600 font-medium">Done</span>
                            ) : (
                              <span className="text-amber-600 font-medium">{pendingQty}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center align-middle">
                            {isFullyDelivered ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <Input
                                type="number"
                                min="0"
                                max={pendingQty}
                                value={getDeliveryQty(item.id)}
                                onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                                className="w-20 text-center mx-auto"
                              />
                            )}
                          </TableCell>
                          <TableCell className="text-right align-middle">
                            Rs {item.unitPrice.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No items found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="total">
              <p>Grand Total: Rs {invoice.grandTotal.toLocaleString()}</p>
            </div>

            {/* Footer */}
            <div className="footer">
              <p>This receipt confirms that the items have been delivered.</p>
              <p>Stock has been reduced upon printing this receipt.</p>
            </div>
          </div>

          {/* Print Button */}
          <div className="flex justify-end gap-2 no-print">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handlePrintAndConfirmDelivery}
              disabled={isConfirming || !hasAnyDelivery()}
            >
              <Printer className="w-4 h-4 mr-2" />
              {isConfirming ? "Confirming..." : hasAnyDelivery() ? "Print Receipt & Confirm Delivery" : "Enter quantities to deliver"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

