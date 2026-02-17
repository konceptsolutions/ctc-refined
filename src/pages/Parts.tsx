import { useState } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PartEntryTopNav } from "@/components/parts/PartEntryTopNav";
import { PartEntryPage } from "@/components/parts/PartEntryPage";
import { Part } from "@/components/parts/PartsList";

const Parts = () => {
  const [parts, setParts] = useState<Part[]>([]);

  // Shared state for syncing
  const [sharedSearchFilters, setSharedSearchFilters] = useState({
    search: '',
    master_part_no: '',
    part_no: '',
    brand_name: '',
    description: '',
    category_name: 'all',
    subcategory_name: 'all',
    application_name: 'all',
  });
  const [sharedItemsPage, setSharedItemsPage] = useState(1);
  const [sharedItemsPerPage, setSharedItemsPerPage] = useState(50);
  
  // Shared fetch function for syncing
  const sharedFetchItems = async () => {
    // This is handled by ItemsListPage internally
    // Just a placeholder for PartEntryPage compatibility
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />
        
        {/* Top Navigation Tabs */}
        <PartEntryTopNav />

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          <PartEntryPage
            searchFilters={sharedSearchFilters}
            setSearchFilters={setSharedSearchFilters}
            itemsPage={sharedItemsPage}
            setItemsPage={setSharedItemsPage}
            itemsPerPage={sharedItemsPerPage}
            fetchItems={sharedFetchItems}
          />
        </main>
      </div>
    </div>
  );
};

export default Parts;
