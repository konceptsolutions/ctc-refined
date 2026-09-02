import { formatUiDate } from "@/utils/dateUtils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Eye, Edit, Trash, Printer, CheckCircle } from "lucide-react";

interface PurchaseOrderItem {
  id: string;
  part_no: string;
  part_description?: string;
  brand: string;
  quantity: number;
  received_qty?: number;
  unit_cost: number;
  total_cost: number;
  notes?: string;
}

interface PurchaseOrder {
  id: string;
  po_number: string;
  date: string;
  supplier_name?: string;
  supplier_id?: string;
  status: string;
  expected_date?: string;
  notes?: string;
  total_amount: number;
  items?: PurchaseOrderItem[];
  created_at?: string;
}

interface StorePurchaseOrderDetailProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPrint?: () => void;
  onReceive?: () => void;
}

export const StorePurchaseOrderDetail = ({ 
  order, 
  open, 
  onOpenChange,
  onEdit,
  onDelete,
  onPrint,
  onReceive
}: StorePurchaseOrderDetailProps) => {
  if (!order) return null;

  const canEdit = order.status !== "Received";
  const canDelete = order.status !== "Received";
  const canReceive = order.status !== "Received";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Purchase Order Details - {order.po_number}</span>
            <Badge 
              variant={
                order.status === "Received" 
                  ? "default" 
                  : order.status === "Draft"
                  ? "secondary"
                  : "outline"
              }
            >
              {order.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-180px)]">
          <div className="space-y-4">
            {/* Order Information */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Order Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Purchase Order Number</p>
                    <p className="font-medium">{order.po_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date</p>
                    <p className="font-medium">{formatUiDate(order.date)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Supplier</p>
                    <p className="font-medium">{order.supplier_name || "N/A"}</p>
                  </div>
                  {order.expected_date && (
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Date</p>
                      <p className="font-medium">{formatUiDate(order.expected_date)}</p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Total Amount</p>
                    <p className="font-medium text-lg">Rs {order.total_amount.toFixed(2)}</p>
                  </div>
                  {order.notes && (
                    <div className="col-span-2">
                      <p className="text-sm text-muted-foreground">Notes</p>
                      <p className="font-medium">{order.notes}</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Separator />

            {/* Items Table */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Items ({order.items?.length || 0})</h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <ListNumberHeader />
                        <TableHead className="w-[120px]">Part No</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="w-[120px]">Brand</TableHead>
                        <TableHead className="text-right w-[100px]">Ordered Qty</TableHead>
                        <TableHead className="text-right w-[100px]">Received Qty</TableHead>
                        <TableHead className="text-right w-[120px]">Unit Cost</TableHead>
                        <TableHead className="text-right w-[120px]">Total Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items && order.items.length > 0 ? (
                        order.items.map((item, index) => (
                          <TableRow key={item.id} className="h-12">
                            <ListNumberCell index={index} total={order.items.length} className="align-middle" />
                            <TableCell className="font-medium align-middle">{item.part_no}</TableCell>
                            <TableCell className="align-middle">{item.part_description || "-"}</TableCell>
                            <TableCell className="align-middle">{item.brand || "N/A"}</TableCell>
                            <TableCell className="text-right align-middle">{item.quantity}</TableCell>
                            <TableCell className="text-right align-middle">
                              {item.received_qty !== undefined ? item.received_qty : "-"}
                            </TableCell>
                            <TableCell className="text-right align-middle">Rs {item.unit_cost.toFixed(2)}</TableCell>
                            <TableCell className="text-right align-middle">Rs {item.total_cost.toFixed(2)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No items found in this order
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {order.items && order.items.length > 0 && (
                  <div className="mt-4 flex justify-end">
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Total Amount</p>
                      <p className="text-lg font-semibold">Rs {order.total_amount.toFixed(2)}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div className="flex gap-2">
            {canEdit && onEdit && (
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onEdit} title="Edit">
                <Edit className="w-4 h-4" />
              </Button>
            )}
            {canDelete && onDelete && (
              <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={onDelete} title="Delete">
                <Trash className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {onPrint && (
              <Button variant="outline" onClick={onPrint}>
                <Printer className="w-4 h-4 mr-2" />
                Print
              </Button>
            )}
            {canReceive && onReceive && (
              <Button onClick={onReceive}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Receive Order
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

