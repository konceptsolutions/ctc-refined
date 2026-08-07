import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { DirectPurchaseOrder } from "@/components/inventory/DirectPurchaseOrder";

const DirectPurchaseOrderPage = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          <DirectPurchaseOrder />
        </main>
      </div>
    </div>
  );
};

export default DirectPurchaseOrderPage;

