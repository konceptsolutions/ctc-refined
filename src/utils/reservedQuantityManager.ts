// LocalStorage Reserved Quantity Manager
// This fixes the broken backend API by storing reserved quantities locally

export const ReservedQuantityManager = {
    // Get all reserved quantities
    getAll(): Record<string, number> {
        const stored = localStorage.getItem('partReservedQuantities');
        return stored ? JSON.parse(stored) : {};
    },

    // Get reserved quantity for a specific part
    get(partId: string): number {
        const all = this.getAll();
        return all[partId] || 0;
    },

    // Set reserved quantity for a part
    set(partId: string, quantity: number): void {
        const all = this.getAll();
        if (quantity <= 0) {
            delete all[partId];
        } else {
            all[partId] = quantity;
        }
        localStorage.setItem('partReservedQuantities', JSON.stringify(all));
    },

    // Add to reserved quantity
    add(partId: string, quantity: number): number {
        const current = this.get(partId);
        const newTotal = current + quantity;
        this.set(partId, newTotal);
        return newTotal;
    },

    // Remove reservation
    remove(partId: string): void {
        const all = this.getAll();
        delete all[partId];
        localStorage.setItem('partReservedQuantities', JSON.stringify(all));
    },

    // Clear all reservations
    clearAll(): void {
        localStorage.removeItem('partReservedQuantities');
    }
};
