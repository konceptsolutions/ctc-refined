import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Truck } from "lucide-react";
import { useState, useEffect } from "react";
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
  onDeliveryConfirmed,
}: StoreSalesInvoiceReceiptProps) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const [deliveryQuantities, setDeliveryQuantities] = useState<{
    [itemId: string]: number;
  }>({});

  // Initialise delivery quantities when dialog opens
  useEffect(() => {
    if (open && invoice.items) {
      const initial: { [itemId: string]: number } = {};
      invoice.items.forEach((item) => {
        const pending = item.orderedQty - item.deliveredQty;
        initial[item.id] = pending > 0 ? pending : 0;
      });
      setDeliveryQuantities(initial);
    }
  }, [open, invoice.items]);

  const handleQuantityChange = (itemId: string, value: string) => {
    const qty = parseInt(value) || 0;
    const item = invoice.items?.find((i) => i.id === itemId);
    if (item) {
      const maxQty = item.orderedQty - item.deliveredQty;
      setDeliveryQuantities((prev) => ({
        ...prev,
        [itemId]: Math.max(0, Math.min(qty, maxQty)),
      }));
    }
  };

  const getDeliveryQty = (itemId: string) =>
    deliveryQuantities[itemId] ?? 0;

  const hasAnyDelivery = () =>
    Object.values(deliveryQuantities).some((qty) => qty > 0);

  const handleConfirmDelivery = async () => {
    try {
      setIsConfirming(true);

      const deliveryItems = (invoice.items || [])
        .filter((item) => getDeliveryQty(item.id) > 0)
        .map((item) => ({
          invoiceItemId: item.id,
          quantity: getDeliveryQty(item.id),
        }));

      if (deliveryItems.length === 0) {
        toast.error("Please enter a delivery quantity for at least one item.");
        return;
      }

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

      const totalPending = (invoice.items || []).reduce(
        (sum, item) => sum + (item.orderedQty - item.deliveredQty),
        0
      );
      const totalDelivering = deliveryItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      if (totalDelivering < totalPending) {
        toast.success(
          `Partial stock out confirmed for Order ${invoice.invoiceNo}.`
        );
      } else {
        toast.success(
          `Full stock out confirmed for Order ${invoice.invoiceNo}.`
        );
      }

      onDeliveryConfirmed?.();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to confirm delivery");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Truck className="w-5 h-5 text-primary" />
            Record Stock Out — {invoice.invoiceNo}
          </DialogTitle>
          <DialogDescription>
            Enter the stock out quantity for each item. Leave 0 for items not
            yet processed.
          </DialogDescription>
        </DialogHeader>

        {/* Items Table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Item</TableHead>
                <TableHead className="text-center w-[80px] font-semibold">
                  Qty
                </TableHead>
                <TableHead className="text-center w-[120px] font-semibold">
                  Stock Out Qty
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items && invoice.items.length > 0 ? (
                invoice.items.map((item) => {
                  const pendingQty = item.orderedQty - item.deliveredQty;
                  const isFullyDelivered = pendingQty <= 0;
                  return (
                    <TableRow
                      key={item.id}
                      className={isFullyDelivered ? "opacity-50" : ""}
                    >
                      {/* Item */}
                      <TableCell className="align-middle">
                        <p className="font-medium text-sm">{item.partNo}</p>
                        {item.description && (
                          <p className="text-xs text-muted-foreground">
                            {item.description}
                          </p>
                        )}
                      </TableCell>

                      {/* Qty (ordered) */}
                      <TableCell className="text-center align-middle font-medium">
                        {item.orderedQty}
                      </TableCell>


                      {/* Stock Out Qty – editable */}
                      <TableCell className="text-center align-middle">
                        {isFullyDelivered ? (
                          <span className="text-green-600 text-sm font-medium">
                            Stock Out
                          </span>
                        ) : (
                          <Input
                            type="number"
                            min={0}
                            max={pendingQty}
                            value={getDeliveryQty(item.id)}
                            onChange={(e) =>
                              handleQuantityChange(item.id, e.target.value)
                            }
                            className="w-20 text-center mx-auto h-8"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground py-8"
                  >
                    No items found for this invoice.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDelivery}
            disabled={isConfirming || !hasAnyDelivery()}
            className="gap-2"
          >
            <Truck className="w-4 h-4" />
            {isConfirming
              ? "Confirming..."
              : hasAnyDelivery()
                ? "Confirm Stock Out"
                : "Enter quantities for stock out"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
