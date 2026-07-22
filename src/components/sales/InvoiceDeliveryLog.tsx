import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Truck, Package, Calendar, User, FileText } from "lucide-react";
import { InvoiceItem, DeliveryLogEntry } from "@/types/invoice";

interface InvoiceDeliveryLogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceNo: string;
  items: InvoiceItem[];
  deliveryLog: DeliveryLogEntry[];
  onRecordDelivery: (delivery: DeliveryLogEntry, updatedItems: InvoiceItem[]) => void;
}

export const InvoiceDeliveryLog = ({
  open,
  onOpenChange,
  invoiceNo,
  items,
  deliveryLog,
  onRecordDelivery,
}: InvoiceDeliveryLogProps) => {
  const [deliveryQtys, setDeliveryQtys] = useState<Record<string, number>>({});
  const [challanNo, setChallanNo] = useState("");
  const [deliveredBy, setDeliveredBy] = useState("");
  const [remarks, setRemarks] = useState("");

  const pendingItems = items.filter((item) => item.pendingQty > 0);

  const handleQtyChange = (partId: string, qty: number, maxQty: number) => {
    setDeliveryQtys((prev) => ({
      ...prev,
      [partId]: Math.min(Math.max(0, qty), maxQty),
    }));
  };

  const handleRecordDelivery = () => {
    const deliveryItems = Object.entries(deliveryQtys)
      .filter(([_, qty]) => qty > 0)
      .map(([partId, quantity]) => {
        const item = items.find((i) => i.partId === partId);
        return {
          partId,
          partNo: item?.partNo || "",
          quantity,
        };
      });

    if (deliveryItems.length === 0) return;

    const delivery: DeliveryLogEntry = {
      id: `del-${Date.now()}`,
      deliveryDate: new Date().toISOString().split("T")[0],
      challanNo: challanNo || `DC-${Date.now()}`,
      items: deliveryItems,
      deliveredBy,
      remarks,
    };

    // Update items with new delivered quantities
    const updatedItems = items.map((item) => {
      const deliveredQty = deliveryQtys[item.partId] || 0;
      return {
        ...item,
        deliveredQty: item.deliveredQty + deliveredQty,
        pendingQty: item.pendingQty - deliveredQty,
      };
    });

    onRecordDelivery(delivery, updatedItems);

    // Reset form
    setDeliveryQtys({});
    setChallanNo("");
    setDeliveredBy("");
    setRemarks("");
  };

  const totalOrdered = items.reduce((sum, item) => sum + item.orderedQty, 0);
  const totalDelivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const totalPending = items.reduce((sum, item) => sum + item.pendingQty, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5 text-primary" />
            Delivery Management - {invoiceNo}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 bg-muted/30 rounded-lg border border-border text-center">
              <p className="text-2xl font-bold text-foreground">{totalOrdered}</p>
              <p className="text-xs text-muted-foreground">Total Ordered</p>
            </div>
            <div className="p-3 bg-green-500/10 rounded-lg border border-green-500/20 text-center">
              <p className="text-2xl font-bold text-green-600">{totalDelivered}</p>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </div>
            <div className="p-3 bg-primary/10 rounded-lg border border-primary/20 text-center">
              <p className="text-2xl font-bold text-primary">{totalPending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>

          {/* Record New Delivery */}
          {pendingItems.length > 0 && (
            <div className="p-4 bg-muted/20 rounded-lg border border-border space-y-4">
              <h4 className="font-medium text-foreground flex items-center gap-2">
                <Package className="w-4 h-4" />
                Record New Delivery
              </h4>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <FileText className="w-3 h-3" />
                    Challan No
                  </Label>
                  <Input
                    value={challanNo}
                    onChange={(e) => setChallanNo(e.target.value)}
                    placeholder="DC-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    Delivered By
                  </Label>
                  <Input
                    value={deliveredBy}
                    onChange={(e) => setDeliveredBy(e.target.value)}
                    placeholder="Driver name"
                  />
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ListNumberHeader />
                      <TableHead>Part No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Ordered</TableHead>
                      <TableHead className="text-center">Delivered</TableHead>
                      <TableHead className="text-center">Pending</TableHead>
                      <TableHead className="text-center">Deliver Now</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingItems.map((item, index) => (
                      <TableRow key={item.partId}>
                        <ListNumberCell index={index} total={pendingItems.length} />
                        <TableCell className="font-medium">{item.partNo}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {item.description}
                        </TableCell>
                        <TableCell className="text-center">{item.orderedQty}</TableCell>
                        <TableCell className="text-center text-green-600">
                          {item.deliveredQty}
                        </TableCell>
                        <TableCell className="text-center text-primary">
                          {item.pendingQty}
                        </TableCell>
                        <TableCell className="text-center">
                          <Input
                            type="number"
                            min={0}
                            max={item.pendingQty}
                            value={deliveryQtys[item.partId] || ""}
                            onChange={(e) =>
                              handleQtyChange(
                                item.partId,
                                parseInt(e.target.value) || 0,
                                item.pendingQty
                              )
                            }
                            className="w-20 mx-auto text-center"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-2">
                <Label>Remarks</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any notes about this delivery..."
                  rows={2}
                />
              </div>

              <Button
                onClick={handleRecordDelivery}
                disabled={Object.values(deliveryQtys).every((q) => !q || q === 0)}
                className="w-full"
              >
                <Truck className="w-4 h-4 mr-2" />
                Record Delivery
              </Button>
            </div>
          )}

          {/* Delivery History */}
          <div className="space-y-2">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Delivery History
            </h4>
            <ScrollArea className="h-[200px] border rounded-lg">
              {deliveryLog.length > 0 ? (
                <div className="p-3 space-y-3">
                  {deliveryLog.map((delivery) => (
                    <div
                      key={delivery.id}
                      className="p-3 bg-muted/30 rounded-lg border border-border"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="bg-primary/10 text-primary">
                            {delivery.challanNo}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {delivery.deliveryDate}
                          </span>
                        </div>
                        {delivery.deliveredBy && (
                          <span className="text-xs text-muted-foreground">
                            By: {delivery.deliveredBy}
                          </span>
                        )}
                      </div>
                      <div className="space-y-1">
                        {delivery.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <span>{item.partNo}</span>
                            <span className="font-medium">{item.quantity} pcs</span>
                          </div>
                        ))}
                      </div>
                      {delivery.remarks && (
                        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                          {delivery.remarks}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground">
                  <p>No deliveries recorded yet</p>
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
