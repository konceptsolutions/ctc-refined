import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { MapPin } from "lucide-react";

interface DirectPurchaseOrderItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  amount: number;
  rackId?: string;
  shelfId?: string;
  rackCode?: string;
  shelfNo?: string;
}

interface DirectPurchaseOrder {
  id: string;
  dpo_no: string;
  items?: DirectPurchaseOrderItem[];
}

interface Rack {
  id: string;
  codeNo: string;
  storeId: string;
  shelves: Shelf[];
}

interface Shelf {
  id: string;
  shelfNo: string;
  rackId: string;
}

interface StoreLocationAssignProps {
  order: DirectPurchaseOrder;
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const StoreLocationAssign = ({
  order,
  storeId,
  open,
  onOpenChange,
  onSuccess,
}: StoreLocationAssignProps) => {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRacks, setFetchingRacks] = useState(false);
  const [itemLocations, setItemLocations] = useState<Record<string, { rackId: string; shelfId: string }>>({});

  useEffect(() => {
    if (open && storeId && order.items && order.items.length > 0) {
      fetchRacks();
      // Initialize item locations from existing data
      const initialLocations: Record<string, { rackId: string; shelfId: string }> = {};
      order.items.forEach((item) => {
        if (item.rackId && item.shelfId) {
          initialLocations[item.id] = {
            rackId: item.rackId,
            shelfId: item.shelfId,
          };
        }
      });
      setItemLocations(initialLocations);
    }
  }, [open, storeId, order.id]);

  const fetchRacks = async () => {
    try {
      setFetchingRacks(true);
      // If storeId is "all" (or missing), don't filter server-side,
      // otherwise the API will return zero racks.
      const effectiveStoreId = storeId && storeId !== "all" ? storeId : undefined;
      const response = await apiClient.getRacks(effectiveStoreId);
      const racksData = response.data || response;

      // Fallback: if a specific store filter returns no racks (common when racks
      // were created without a valid store link), load all racks so user can assign.
      let resolvedRacksData: any = racksData;
      if (effectiveStoreId && Array.isArray(racksData) && racksData.length === 0) {
        const fallbackResponse = await apiClient.getRacks(undefined);
        resolvedRacksData = fallbackResponse.data || fallbackResponse;
      }

      if (Array.isArray(resolvedRacksData)) {
        setRacks(
          resolvedRacksData.map((r: any) => ({
            id: r.id,
            codeNo: r.codeNo || r.code_no,
            storeId: r.storeId || r.store_id,
            shelves: (r.shelves || []).map((s: any) => ({
              id: s.id,
              shelfNo: s.shelfNo || s.shelf_no,
              rackId: s.rackId || s.rack_id,
            })),
          }))
        );
      }
    } catch (error: any) {
      toast.error("Failed to fetch racks and shelves");
    } finally {
      setFetchingRacks(false);
    }
  };

  const getShelvesForRack = (rackId: string): Shelf[] => {
    const rack = racks.find((r) => r.id === rackId);
    return rack?.shelves || [];
  };

  const handleRackChange = (itemId: string, rackId: string) => {
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        rackId,
        shelfId: "", // Reset shelf when rack changes
      },
    }));
  };

  const handleShelfChange = (itemId: string, shelfId: string) => {
    setItemLocations((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        shelfId,
      },
    }));
  };

  const handleSave = async () => {
    if (!order.items || order.items.length === 0) {
      toast.error("No items to update");
      return;
    }

    try {
      setLoading(true);
      
      // Update each item with location - we need to send all items with updated locations
      const updatedItems = order.items.map((item) => {
        const location = itemLocations[item.id];
        const purchasePrice = item.purchasePrice !== undefined && item.purchasePrice !== null ? item.purchasePrice : 0;
        const quantity = item.quantity || 0;
        const amount = item.amount || (purchasePrice * quantity);
        return {
          part_id: item.partId,
          quantity: quantity,
          purchase_price: purchasePrice,
          sale_price: item.salePrice || 0,
          amount: amount,
          rack_id: location?.rackId || null,
          shelf_id: location?.shelfId || null,
        };
      });

      // Update the order with new locations
      const response = await apiClient.updateDirectPurchaseOrder(order.id, {
        items: updatedItems,
      });

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("Locations assigned successfully");
      onSuccess();
    } catch (error: any) {
      toast.error(error.error || "Failed to assign locations");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" />
            Assign Locations - {order.dpo_no}
          </DialogTitle>
          <DialogDescription>
            Assign rack and shelf locations for each item in this order.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-180px)]">
          {fetchingRacks ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading racks and shelves...
            </div>
          ) : !order.items || order.items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No items found in this order.
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[150px]">Part No</TableHead>
                        <TableHead className="min-w-[200px]">Description</TableHead>
                        <TableHead className="w-[120px]">Brand</TableHead>
                        <TableHead className="w-[80px] text-right">Qty</TableHead>
                        <TableHead className="w-[200px]">Rack</TableHead>
                        <TableHead className="w-[200px]">Shelf</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {order.items.map((item) => {
                        const location = itemLocations[item.id];
                        const shelves = location?.rackId
                          ? getShelvesForRack(location.rackId)
                          : [];
                        
                        return (
                          <TableRow key={item.id} className="h-14">
                            <TableCell className="font-medium align-middle">{item.partNo}</TableCell>
                            <TableCell className="align-middle">{item.description || "-"}</TableCell>
                            <TableCell className="align-middle">{item.brand}</TableCell>
                            <TableCell className="text-right align-middle">{item.quantity}</TableCell>
                            <TableCell className="align-middle">
                              <Select
                                value={location?.rackId || ""}
                                onValueChange={(value) => handleRackChange(item.id, value)}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder="Select Rack" />
                                </SelectTrigger>
                                <SelectContent>
                                  {racks.length === 0 ? (
                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No racks available</div>
                                  ) : (
                                    racks.map((rack) => (
                                      <SelectItem key={rack.id} value={rack.id}>
                                        {rack.codeNo}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="align-middle">
                              <Select
                                value={location?.shelfId || ""}
                                onValueChange={(value) => handleShelfChange(item.id, value)}
                                disabled={!location?.rackId}
                              >
                                <SelectTrigger className="w-[180px]">
                                  <SelectValue placeholder={location?.rackId ? "Select Shelf" : "Select Rack first"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {shelves.length === 0 ? (
                                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                                      {location?.rackId ? "No shelves available" : "Select rack first"}
                                    </div>
                                  ) : (
                                    shelves.map((shelf) => (
                                      <SelectItem key={shelf.id} value={shelf.id}>
                                        {shelf.shelfNo}
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </ScrollArea>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Locations"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

