import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PartEntryTopNav } from "@/components/parts/PartEntryTopNav";
import { ItemsListPage } from "@/components/parts/ItemsListPage";

const ItemsList = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />
        
        {/* Top Navigation Tabs */}
        <PartEntryTopNav />

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          <ItemsListPage />
        </main>
      </div>
    </div>
  );
};

export default ItemsList;
