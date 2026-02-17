import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PricingCosting as PricingCostingComponent } from "@/components/inventory/PricingCosting";

const PricingCostingPage = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        {/* Main Content Area */}
        <main className="flex-1 p-4 overflow-auto">
          <div className="animate-fade-in">
            <PricingCostingComponent />
          </div>
        </main>
      </div>
    </div>
  );
};

export default PricingCostingPage;
