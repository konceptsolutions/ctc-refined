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
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";
import { MapPin, CheckCircle, X } from "lucide-react";
import { format } from "date-fns";

interface AdjustmentItem {
  id: string;
  part_id: string;
  part_no: string;
  part_description: string;
  brand: string;
  category: string; 
  quantity: number;
  cost: number;
  rack_id?: string;
  shelf_id?: string;
  rack_code?: string;
  shelf_no?: string;
}

interface Adjustment {
  id: string;
  date: string;
  subject?: string;
  store_id: string;
  store_name?: string;
  add_inventory: boolean;
  notes?: string;
  total_amount: number;
  status: string;
  voucher_id?: string;
  voucher_number?: string;
  voucher_status?: string;
  items: AdjustmentItem[];
  items_count: number;
  created_at: string;
  updated_at?: string;
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

interface StoreAdjustedItemProps {
  adjustment: Adjustment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export const StoreAdjustedItem = ({
  adjustment,
  open,
  onOpenChange,
  onSuccess,
}: StoreAdjustedItemProps) => {
  const [racks, setRacks] = useState<Rack[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingRacks, setFetchingRacks] = useState(false);
  const [itemLocations, setItemLocations] = useState<Record<string, { rackId: string; shelfId: string }>>({});

  useEffect(() => {
    if (open && adjustment.store_id) {
      fetchRacks();
      // Initialize item locations from existing data
      const initialLocations: Record<string, { rackId: string; shelfId: string }> = {};
      adjustment.items.forEach((item) => {
        if (item.rack_id && item.shelf_id) {
          initialLocations[item.id] = {
            rackId: item.rack_id,
            shelfId: item.shelf_id,
          };
        }
      });
      setItemLocations(initialLocations);
    }
  }, [open, adjustment.id]);

  const fetchRacks = async () => {
    try {
      setFetchingRacks(true);
      const effectiveStoreId = adjustment.store_id && adjustment.store_id !== "all" ? adjustment.store_id : undefined;
      const response = await apiClient.getRacks(effectiveStoreId);
      const racksData = response.data || response;

      // Fallback: if a specific store filter returns no racks, load all racks
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
            shelves: (r.shelves || r.Shelf || []).map((s: any) => ({
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

  const handleUpdate = async () => {
    if (adjustment.status === "approved") {
      toast.error("This adjustment is already approved");
      return;
    }

    // Validate that all items have rack/shelf assigned
    const itemsToUpdate = adjustment.items.map((item) => {
      const location = itemLocations[item.id];
      if (!location || !location.rackId || !location.shelfId) {
        throw new Error(`Please assign rack and shelf for item: ${item.part_no}`);
      }
      return {
        id: item.id,
        rack_id: location.rackId,
        shelf_id: location.shelfId,
      };
    });

    try {
      setLoading(true);
      const response = await apiClient.approveAdjustment(adjustment.id, {
        items: itemsToUpdate,
      });

      if (response.error) {
        toast.error(response.error);
        return;
      }

      toast.success("Adjustment approved successfully! Voucher auto-approved and accounts updated.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to approve adjustment");
    } finally {
      setLoading(false);
    }
  };

  const isPending = adjustment.status === "pending";
  const isApproved = adjustment.status === "approved";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div>
              <span>Adjustment Details</span>
              {adjustment.voucher_number && (
                <Badge variant="outline" className="ml-2">
                  Voucher: {adjustment.voucher_number} ({adjustment.voucher_status || "draft"})
                </Badge>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="w-4 h-4" />
            </Button>
          </DialogTitle>
          <DialogDescription>
            {isPending && "Assign rack and shelf for each item, then click Update to approve this adjustment."}
            {isApproved && "This adjustment has been approved. Voucher is posted and accounts have been updated."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Adjustment Info */}
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p className="font-medium">{format(new Date(adjustment.date), "MMM dd, yyyy")}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Subject</Label>
                  <p className="font-medium">{adjustment.subject || "Stock Adjustment"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Store</Label>
                  <p className="font-medium">{adjustment.store_name || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Type</Label>
                  <p className="font-medium">
                    <Badge variant={adjustment.add_inventory ? "default" : "secondary"}>
                      {adjustment.add_inventory ? "Add Inventory" : "Remove Inventory"}
                    </Badge>
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Total Amount</Label>
                  <p className="font-medium">Rs {adjustment.total_amount?.toFixed(2) || "0.00"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p>
                    <Badge
                      variant={
                        isApproved ? "default" : isPending ? "secondary" : "outline"
                      }
                    >
                      {adjustment.status}
                    </Badge>
                  </p>
                </div>
                {adjustment.notes && (
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="font-medium">{adjustment.notes}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Items Table */}
          <Card>
            <CardContent className="pt-4">
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part No</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Brand</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Rack</TableHead>
                      <TableHead>Shelf</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustment.items.map((item) => {
                      const location = itemLocations[item.id] || {};
                      const shelves = location.rackId ? getShelvesForRack(location.rackId) : [];
                      const hasLocation = item.rack_id && item.shelf_id;

                      return (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.part_no}</TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {item.part_description || "-"}
                          </TableCell>
                          <TableCell>{item.brand || "-"}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>Rs {item.cost?.toFixed(2) || "0.00"}</TableCell>
                          <TableCell className="font-medium">
                            Rs {((item.quantity || 0) * (item.cost || 0)).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            {isPending ? (
                              <Select
                                value={location.rackId || item.rack_id || ""}
                                onValueChange={(value) => handleRackChange(item.id, value)}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue placeholder="Select Rack" />
                                </SelectTrigger>
                                <SelectContent>
                                  {racks.map((rack) => (
                                    <SelectItem key={rack.id} value={rack.id}>
                                      {rack.codeNo}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">
                                {item.rack_code || item.rack_id || "-"}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isPending ? (
                              <Select
                                value={location.shelfId || item.shelf_id || ""}
                                onValueChange={(value) => handleShelfChange(item.id, value)}
                                disabled={!location.rackId && !item.rack_id}
                              >
                                <SelectTrigger className="w-[150px]">
                                  <SelectValue placeholder="Select Shelf" />
                                </SelectTrigger>
                                <SelectContent>
                                  {shelves.map((shelf) => (
                                    <SelectItem key={shelf.id} value={shelf.id}>
                                      {shelf.shelfNo}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm">
                                {item.shelf_no || item.shelf_id || "-"}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          {isPending && (
            <div className="bg-muted/50 p-4 rounded-lg">
              <p className="text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 inline mr-2" />
                Please assign rack and shelf for all items before updating. Once updated, the adjustment will be approved,
                voucher will be auto-approved, and stock movements will be created.
              </p>
            </div>
          )}

          {isApproved && (
            <div className="bg-green-50 dark:bg-green-950/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-700 dark:text-green-300">
                <CheckCircle className="w-4 h-4 inline mr-2" />
                This adjustment has been approved. Voucher {adjustment.voucher_number} is posted and accounts have been updated.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isApproved ? "Close" : "Cancel"}
          </Button>
          {isPending && (
            <Button onClick={handleUpdate} disabled={loading || fetchingRacks}>
              {loading ? "Updating..." : "Update & Approve"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
