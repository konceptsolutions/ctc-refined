import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EditKitForm } from "./EditKitForm";
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
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Loader2, Pencil, Trash } from "lucide-react";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

export interface KitItem {
  id: string;
  partNo: string;
  partName: string;
  quantity: number;
  cost: number;
}

export interface Kit {
  id: string;
  name: string;
  badge?: string;
  itemsCount: number;
  totalCost: number;
  price: number;
  items?: KitItem[];
}

const initialKits: Kit[] = [];

interface KitsListProps {
  kits?: Kit[];
  onEdit?: (kit: Kit) => void;
  onBreakKit?: (kit: Kit) => void;
  onDelete?: (kit: Kit) => void;
  onUpdateKit?: (kit: Kit) => void;
  refreshTrigger?: number;
}

export const KitsList = ({
  kits: propKits,
  onEdit,
  onBreakKit,
  onDelete,
  onUpdateKit,
  refreshTrigger,
}: KitsListProps) => {
  const [kits, setKits] = useState<Kit[]>(propKits || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingKit, setEditingKit] = useState<Kit | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [kitToDelete, setKitToDelete] = useState<Kit | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch kits from API only when parent does not provide kit data
  useEffect(() => {
    if (!propKits) {
      fetchKits();
    }
  }, [refreshTrigger, propKits]);

  // Update kits when propKits changes
  useEffect(() => {
    if (propKits) {
      setKits(propKits);
    }
  }, [propKits]);

  const fetchKits = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getKits({ limit: 1000 });
      if (response.data && Array.isArray(response.data)) {
        const transformedKits: Kit[] = response.data.map((k: any) => ({
          id: k.id,
          name: k.name,
          badge: k.badge,
          itemsCount: k.itemsCount,
          totalCost: k.totalCost,
          price: k.sellingPrice,
          items: k.items?.map((item: any) => ({
            id: item.id,
            partNo: item.partNo,
            partName: item.partName,
            quantity: item.quantity,
            cost: item.costPerUnit || item.cost,
          })),
        }));
        setKits(transformedKits);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch kits",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filteredKits = useMemo(() => {
    return kits.filter(
      (kit) =>
        kit.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        kit.badge?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [kits, searchQuery]);

  const formatCurrency = (value: number) => {
    return `Rs ${value.toFixed(2)}`;
  };

  const handleEditClick = (kit: Kit) => {
    setEditingKit(kit);
    onEdit?.(kit);
  };

  const handleDeleteClick = (kit: Kit) => {
    setKitToDelete(kit);
    setDeleteConfirmOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (kitToDelete) {
      try {
        const response = await apiClient.deleteKit(kitToDelete.id);
        if (response.error) {
          throw new Error(response.error);
        }
        onDelete?.(kitToDelete);
        await fetchKits(); // Refresh the list
        toast({
          title: "Kit Deleted",
          description: `"${kitToDelete.name}" has been deleted successfully.`,
        });
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to delete kit",
          variant: "destructive",
        });
      }
    }
    setDeleteConfirmOpen(false);
    setKitToDelete(null);
    setEditingKit(null);
  };

  const handleSaveKit = async (updatedKit: Kit) => {
    onUpdateKit?.(updatedKit);
    setEditingKit(null);
    if (!propKits) {
      await fetchKits(); // Refresh the list
    }
  };

  const handleCancelEdit = () => {
    setEditingKit(null);
  };

  // Show edit form when a kit is being edited
  if (editingKit) {
    return (
      <EditKitForm
        kit={editingKit}
        onSave={handleSaveKit}
        onDelete={(kit) => {
          setKitToDelete(kit);
          setDeleteConfirmOpen(true);
        }}
        onCancel={handleCancelEdit}
      />
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border flex flex-col">
      <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">All Kits</h3>
          <p className="text-xs text-muted-foreground">{filteredKits.length} kit{filteredKits.length !== 1 ? 's' : ''} found</p>
        </div>
        <Input
          placeholder="Search kits..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-48 h-8 text-sm"
        />
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading kits...</span>
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            No kits found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredKits.map((kit) => (
              <div
                key={kit.id}
                className="border border-border rounded-lg p-3 hover:shadow-sm transition-shadow bg-background"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-foreground text-sm">{kit.name}</span>
                      {kit.badge && (
                        <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded">
                          {kit.badge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      <span>
                        <strong className="text-foreground">Items:</strong> {kit.itemsCount}
                      </span>
                      <span>
                        <strong className="text-foreground">Total Cost:</strong>{" "}
                        {formatCurrency(kit.totalCost)}
                      </span>
                      <span>
                        <strong className="text-foreground">Price:</strong>{" "}
                        {formatCurrency(kit.price)}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <ActionButtonTooltip label="Edit" variant="edit">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-primary"
                        onClick={() => handleEditClick(kit)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </ActionButtonTooltip>
                    <ActionButtonTooltip label="Delete" variant="delete">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteClick(kit)}
                      >
                        <Trash className="w-3.5 h-3.5" />
                      </Button>
                    </ActionButtonTooltip>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Kit</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{kitToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
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
