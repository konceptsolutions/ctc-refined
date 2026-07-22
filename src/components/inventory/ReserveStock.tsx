import { useState, useEffect } from "react";
import {
  Search,
  Package,
  Plus,
  Edit,
  Trash,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ReservedStockItem {
  id: string;
  partId: string;
  partNo: string;
  description: string;
  brand?: string;
  category?: string;
  reservedQuantity: number;
  reservedAt: string;
}

export const ReserveStock = () => {
  const [items, setItems] = useState<ReservedStockItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ReservedStockItem | null>(null);
  const [reserveQuantity, setReserveQuantity] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableParts, setAvailableParts] = useState<Array<{ id: string; partNo: string; description: string }>>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>("");

  // Fetch reserved stock on mount and after operations
  const fetchReservedStock = async () => {
    try {
      setLoading(true);
      // Fetch all stock movements (backend doesn't filter by reference_type in query)
      // We'll filter client-side for stock_reservation type
      let allMovements: any[] = [];
      let page = 1;
      const limit = 1000;
      let hasMore = true;

      // Fetch all pages to get all stock_reservation movements
      while (hasMore) {
        const response: any = await apiClient.getStockMovements({
          page,
          limit
        });

        const movementsData = response.data || response;
        const movements = Array.isArray(movementsData.data)
          ? movementsData.data
          : Array.isArray(movementsData)
            ? movementsData
            : [];

        // Filter for stock_reservation type
        const reservedMovements = movements.filter((m: any) =>
          (m.reference_type || '').toLowerCase() === 'stock_reservation'
        );

        allMovements = [...allMovements, ...reservedMovements];

        // Check if there are more pages - stop if we got less than limit items
        hasMore = movements.length >= limit;
        page++;

        // Safety limit to prevent infinite loops
        if (page > 100) {
          break;
        }
      }

      // Group by partId and sum quantities
      const reservedMap = new Map<string, ReservedStockItem>();

      allMovements.forEach((movement: any) => {
        const partId = movement.part_id || movement.partId;
        const quantity = movement.quantity || 0;

        if (reservedMap.has(partId)) {
          const existing = reservedMap.get(partId)!;
          existing.reservedQuantity += quantity;
        } else {
          reservedMap.set(partId, {
            id: movement.id,
            partId: partId,
            partNo: movement.part_no || movement.master_part_no || '',
            description: movement.part_description || movement.description || '',
            brand: movement.brand || '',
            category: movement.category || '',
            reservedQuantity: quantity,
            reservedAt: movement.created_at || movement.date || '',
          });
        }
      });

      setItems(Array.from(reservedMap.values()));
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch reserved stock",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch parts for dropdown when adding new reserve
  const fetchParts = async (search: string = "") => {
    try {
      const params: any = { limit: 100 };
      if (search) {
        params.search = search;
      }
      const response: any = await apiClient.getParts(params);
      const partsData = response.data || response;
      const partsList = Array.isArray(partsData.data) ? partsData.data : Array.isArray(partsData) ? partsData : [];

      setAvailableParts(partsList.map((part: any) => ({
        id: part.id,
        partNo: part.master_part_no || part.part_no || '',
        description: part.description || '',
      })));
    } catch (error) {
    }
  };

  useEffect(() => {
    fetchReservedStock();
    fetchParts();
  }, []);

  // Filter items by search term
  const filteredItems = items.filter(item =>
    item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle reserve/update stock
  const handleReserveStock = async () => {
    if (!selectedPartId && !selectedItem) {
      toast({
        title: "Validation Error",
        description: "Please select a part",
        variant: "destructive",
      });
      return;
    }

    if (reserveQuantity === "" || parseInt(reserveQuantity) < 0) {
      toast({
        title: "Invalid Quantity",
        description: "Please enter a valid quantity (0 or greater)",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      const partId = selectedItem?.partId || selectedPartId;
      const quantity = parseInt(reserveQuantity);

      const response = await apiClient.reserveStock({
        partId,
        quantity,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      // Show success toast with green styling
      toast({
        title: "✅ Stock Reserved Successfully",
        description: `${quantity} units have been reserved successfully`,
        className: "bg-green-50 border-green-200",
      });

      // Reset form
      setIsDialogOpen(false);
      setReserveQuantity("");
      setSelectedItem(null);
      setSelectedPartId("");

      // Refresh the list
      await fetchReservedStock();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to reserve stock. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete reservation (set quantity to 0)
  const handleDeleteReservation = async (item: ReservedStockItem) => {
    try {
      setIsSubmitting(true);
      const response = await apiClient.reserveStock({
        partId: item.partId,
        quantity: 0,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      toast({
        title: "Reservation Removed",
        description: `Reservation for ${item.partNo} has been removed`,
      });

      await fetchReservedStock();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to remove reservation",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open dialog for new reservation
  const openNewReserveDialog = () => {
    setSelectedItem(null);
    setSelectedPartId("");
    setReserveQuantity("");
    setIsDialogOpen(true);
    fetchParts();
  };

  // Open dialog for editing reservation
  const openEditDialog = async (item: ReservedStockItem) => {
    setSelectedItem(item);
    setSelectedPartId(item.partId);
    setReserveQuantity(item.reservedQuantity.toString());
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Reserve Stock</h1>
            <p className="text-sm text-muted-foreground">Manage stock reservations</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReservedStock}
            disabled={loading}
          >
            <RefreshCw className={cn("w-4 h-4 mr-2", loading && "animate-spin")} />
            Refresh
          </Button>
          <Button onClick={openNewReserveDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Reserve Stock
          </Button>
        </div>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by Part No or Description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reserved Stock Table */}
      <Card>
        <CardHeader>
          <CardTitle>Reserved Stock ({filteredItems.length} items)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-primary mr-2" />
              <span className="text-sm text-muted-foreground">Loading reserved stock...</span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground">
                {searchTerm ? "No reserved stock found matching your search." : "No stock reserved yet. Click 'Reserve Stock' to add a reservation."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Part No</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="text-right">Reserved Quantity</TableHead>
                  <TableHead>Reserved Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item, index) => (
                  <TableRow key={item.partId || index}>
                    <ListNumberCell index={index} total={filteredItems.length} />
                    <TableCell className="font-medium">{item.partNo}</TableCell>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.brand || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        {item.reservedQuantity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.reservedAt ? new Date(item.reservedAt).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-primary hover:text-primary/80"
                          onClick={() => openEditDialog(item)}
                          title="Edit Reservation"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive/80"
                          onClick={() => handleDeleteReservation(item)}
                          disabled={isSubmitting}
                          title="Remove Reservation"
                        >
                          <Trash className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Reserve Stock Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {selectedItem ? "Update Reserved Stock" : "Reserve Stock"}
            </DialogTitle>
            <DialogDescription>
              {selectedItem
                ? `Update the reserved quantity for ${selectedItem.partNo}`
                : "Select a part and enter the quantity to reserve"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!selectedItem && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Part</label>
                <select
                  value={selectedPartId}
                  onChange={(e) => setSelectedPartId(e.target.value)}
                  className="w-full h-10 px-3 border rounded-md bg-background"
                >
                  <option value="">Select a part...</option>
                  {availableParts.map((part) => (
                    <option key={part.id} value={part.id}>
                      {part.partNo} - {part.description}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {selectedItem && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Item</label>
                <div className="p-2 border rounded-md bg-muted/50">
                  <p className="text-sm font-medium">{selectedItem.partNo}</p>
                  <p className="text-xs text-muted-foreground">{selectedItem.description}</p>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="reserveQuantity" className="text-sm font-medium">
                Reserve Quantity <span className="text-destructive">*</span>
              </label>
              <Input
                id="reserveQuantity"
                type="number"
                min="0"
                placeholder="Enter quantity to reserve"
                value={reserveQuantity}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "" || (parseInt(value) >= 0)) {
                    setReserveQuantity(value);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && reserveQuantity !== "" && parseInt(reserveQuantity) >= 0) {
                    handleReserveStock();
                  }
                }}
                className="w-full"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setReserveQuantity("");
                setSelectedItem(null);
                setSelectedPartId("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleReserveStock}
              disabled={isSubmitting || reserveQuantity === "" || parseInt(reserveQuantity) < 0 || (!selectedItem && !selectedPartId)}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                selectedItem ? "Update" : "Reserve"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
