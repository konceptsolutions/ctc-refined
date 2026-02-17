import { ReservedQuantityManager } from "@/utils/reservedQuantityManager";
import { apiClient } from "@/lib/api";

export const handleReserveStockFixed = async ({
    selectedItem,
    quantity,
    items,
    onItemsUpdate,
    toast,
}: {
    selectedItem: any;
    quantity: number;
    items: any[];
    onItemsUpdate: (items: any[]) => void;
    toast: any;
}) => {
    const partId = selectedItem.id;
    const partNo = selectedItem.partNo;

    if (quantity === 0) {
        // Remove reservation
        ReservedQuantityManager.remove(partId);

        const updatedItems = items.map(i =>
            i.id === partId ? { ...i, reservedQuantity: 0 } : i
        );
        onItemsUpdate(updatedItems);

        toast({
            title: "Reservation Removed",
            description: `Reservation for ${partNo} has been removed`,
        });

        return { success: true };
    }

    try {
        // Try to save to backend (optional)
        try {
            await apiClient.reserveStock({ partId, quantity });
        } catch (err) {
        }

        // Update localStorage (SET to new quantity, NOT add)
        ReservedQuantityManager.set(partId, quantity);
        const newTotal = quantity;

        // Update UI
        const updatedItems = items.map(i =>
            i.id === partId ? { ...i, reservedQuantity: newTotal } : i
        );
        onItemsUpdate(updatedItems);

        toast({
            title: "✅ Stock Reserved",
            description: `Reserved quantity for ${partNo} updated to ${newTotal} units`,
            className: "bg-green-50 border-green-200",
        });

        return { success: true, total: newTotal };
    } catch (error: any) {
        toast({
            title: "❌ Error",
            description: error?.message || "Failed to reserve stock",
            variant: "destructive",
        });
        return { success: false, error: error?.message };
    }
};

// Load reserved quantities from localStorage on page load
export const loadReservedQuantities = (items: any[]): any[] => {
    return items.map(item => ({
        ...item,
        reservedQuantity: ReservedQuantityManager.get(item.id)
    }));
};
