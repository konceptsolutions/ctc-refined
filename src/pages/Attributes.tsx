import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PartEntryTopNav } from "@/components/parts/PartEntryTopNav";
import { AttributesPage } from "@/components/attributes/AttributesPage";

const Attributes = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />
        
        {/* Top Navigation Tabs */}
        <PartEntryTopNav />

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          <AttributesPage />
        </main>
      </div>
    </div>
  );
};

export default Attributes; 
