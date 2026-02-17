import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import ReportsAnalytics from "@/components/reports/ReportsAnalytics";

const Reports = () => {
  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      <div className="flex-1 ml-16">
        <Header />
        <main className="p-4 lg:p-6">
          <ReportsAnalytics />
        </main>
      </div>
    </div>
  );
};

export default Reports;
