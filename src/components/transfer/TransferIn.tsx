import { DirectPurchaseOrder } from "@/components/inventory/DirectPurchaseOrder";

/** Transfer In — same form layout as Local Purchase (DPO). */
export const TransferIn = () => (
  <DirectPurchaseOrder
    variant="transfer-in"
    permissionPageId="transfer.transfer-in"
  />
);
