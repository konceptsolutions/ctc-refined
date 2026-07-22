import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";

interface DirectPurchaseOrderItem {
  id: string;
  partNo: string;
  brand: string;
  quantity: number;
  uom?: string;
  rackCode?: string;
  shelfNo?: string;
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  date: string;
  store_name: string;
  description?: string;
  status: string;
  total_amount: number;
  items?: DirectPurchaseOrderItem[];
}

interface StoreOrderDetailProps {
  order: DirectPurchaseOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const StoreOrderDetail = ({ order, open, onOpenChange }: StoreOrderDetailProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Order Details - {order.dpo_no}</span>
            <Badge variant={order.status === "Completed" ? "default" : "secondary"}>
              {order.status}
            </Badge>
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-120px)]">
          <div className="space-y-4">
            {/* Items Table */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4">Items</h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <ListNumberHeader />
                        <TableHead className="w-[150px]">Part No</TableHead>
                        <TableHead className="w-[150px]">Brand</TableHead>
                        <TableHead className="text-right w-[100px]">Quantity</TableHead>
                        <TableHead className="w-[100px]">UOM</TableHead>
                        <TableHead className="w-[120px]">Rack</TableHead>
                        <TableHead className="w-[120px]">Shelf</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items && order.items.length > 0 ? (
                        order.items.map((item, index) => (
                          <TableRow key={item.id} className="h-12">
                            <ListNumberCell index={index} total={order.items.length} className="align-middle" />
                            <TableCell className="font-medium align-middle">{item.partNo}</TableCell>
                            <TableCell className="align-middle">{item.brand}</TableCell>
                            <TableCell className="text-right align-middle">{item.quantity}</TableCell>
                            <TableCell className="align-middle">{item.uom || "pcs"}</TableCell>
                            <TableCell className="align-middle">{item.rackCode || "-"}</TableCell>
                            <TableCell className="align-middle">{item.shelfNo || "-"}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No items found in this order
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

