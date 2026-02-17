import { useState, useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PartEntryTopNav } from "@/components/parts/PartEntryTopNav";
import { ItemsListPage } from "@/components/parts/ItemsListPage";
import { Kit } from "@/components/parts/KitsList";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const ItemsList = () => {
  const [kits, setKits] = useState<Kit[]>([]);
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [kitRefreshTrigger, setKitRefreshTrigger] = useState(0);

  // Fetch kits on mount and when refresh is triggered
  useEffect(() => {
    const fetchKits = async () => {
      try {
        setLoading(true);
        const response = await apiClient.getKits();
        const kitsData = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
        setKits(kitsData);
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to fetch kits",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchKits();
  }, [kitRefreshTrigger]);

  const handleDeleteKit = (kit: Kit) => {
    // Kit is deleted via API in KitsList, just trigger refresh
    setKitRefreshTrigger(prev => prev + 1);
    toast({
      title: "Kit Deleted",
      description: `${kit.name} has been deleted successfully`,
    });
  };

  const handleUpdateKit = (updatedKit: Kit) => {
    // Kit is updated via API in EditKitForm, just trigger refresh
    setKitRefreshTrigger(prev => prev + 1);
    toast({
      title: "Kit Updated",
      description: `${updatedKit.name} has been updated successfully`,
    });
  };

  const handlePartsUpdate = (updatedParts: any[]) => {
    setParts(updatedParts);
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
          <ItemsListPage
            kits={kits}
            onDeleteKit={handleDeleteKit}
            onUpdateKit={handleUpdateKit}
            onPartsUpdate={handlePartsUpdate}
          />
        </main>
      </div>
    </div>
  );
};

export default ItemsList;
