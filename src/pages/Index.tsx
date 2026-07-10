import { Package, Tag, ShoppingBag, Building2 } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { StatCard } from "@/components/dashboard/StatCard";
import { InventoryChart } from "@/components/dashboard/InventoryChart";
import { OrderStatusChart } from "@/components/dashboard/OrderStatusChart";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { InventoryDistribution } from "@/components/dashboard/InventoryDistribution";
import { useDashboardData } from "@/hooks/useDashboardData";
import { useState } from "react";

const Index = () => {
  const [timeRange, setTimeRange] = useState<'Week' | 'Month' | 'Year'>('Month');
  const { stats, orderStatus, loading } = useDashboardData(timeRange);

  return (
    <div className="min-h-screen flex bg-background">
      <Sidebar />
      
      <div className="flex-1 flex flex-col ml-16">
        <Header />
        
        <main className="flex-1 p-6 overflow-auto">
          {/* Welcome Section */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-foreground">
              Welcome to Inventory Management
            </h1>
            {/* <p className="text-muted-foreground">Here's what's happening with your inventory today.</p> */}
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              icon={<Package className="w-5 h-5 text-chart-orange" />}
              value={loading ? 0 : stats.totalParts}
              label="Total Parts"
              change=""
              progressColor="orange"
              iconBgColor="bg-chart-orange/10"
            />
            <StatCard
              icon={<Tag className="w-5 h-5 text-chart-blue" />}
              value={loading ? 0 : stats.categoriesCount}
              label="Categories"
              change=""
              progressColor="blue"
              iconBgColor="bg-chart-blue/10"
            />
            <div className="lg:col-span-2">
              <RecentActivity />
            </div>

            {/* <StatCard
              icon={<ShoppingBag className="w-5 h-5 text-chart-yellow" />}
              value={loading ? 0 : stats.activeKits}
              label="Active Kits"
              change=""
              progressColor="blue"
              iconBgColor="bg-chart-yellow/10"
            /> */}
            {/* <StatCard
              icon={<Building2 className="w-5 h-5 text-chart-green" />}
              value={loading ? 0 : stats.suppliersCount}
              label="Suppliers"
              change=""
              progressColor="green"
              iconBgColor="bg-chart-green/10"
            /> */}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            <div className="lg:col-span-2">
              <InventoryChart timeRange={timeRange} onTimeRangeChange={setTimeRange} />
            </div>
            <OrderStatusChart orderStatus={orderStatus} loading={loading} />
          </div>

          {/* Quick Actions and Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="lg:col-span-2">
              <QuickActions />
            </div>
          </div>

          {/* Inventory Distribution */}
          <InventoryDistribution />
        </main>
      </div>
    </div>
  );
};

export default Index;
