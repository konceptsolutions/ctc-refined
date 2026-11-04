import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { PartEntryTopNav } from "@/components/parts/PartEntryTopNav";
import { HsCodesPage } from "@/components/hs-codes/HsCodesPage";

const HsCodes = () => {
  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />
        <PartEntryTopNav />
        <main className="flex-1 p-4 overflow-auto">
          <HsCodesPage />
        </main>
      </div>
    </div>
  );
};

export default HsCodes;
