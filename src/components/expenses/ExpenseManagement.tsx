import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Tag, Plus, Building2, DollarSign } from "lucide-react";
import { ExpenseTypesTab } from "./ExpenseTypesTab";
import { PostExpenseTab } from "./PostExpenseTab";
import { OperationalExpensesTab } from "./OperationalExpensesTab";
import { apiClient } from "@/lib/api";

export const ExpenseManagement = () => {
  const [activeTab, setActiveTab] = useState("expense-types");
  const [stats, setStats] = useState({
    totalExpenses: 0,
    operationalExpenses: 0,
    operationalExpensesCount: 0,
    expenseTypesCount: 0,
  });

  useEffect(() => {
    fetchStats();
  }, [activeTab]); 

  const fetchStats = async () => {
    try {
      const response = await apiClient.getExpenseStatistics();
      if (response.data) {
        setStats(response.data);
      }
    } catch (error) {
    }
  };

  const statsCards = [
    {
      title: "Total Expenses",
      value: `Rs ${stats.totalExpenses.toLocaleString()}`,
      subtitle: "This month",
      icon: DollarSign,
      bgColor: "bg-gradient-to-br from-primary/10 to-primary/5",
      borderColor: "border-primary/20",
      iconColor: "text-primary",
    },
    {
      title: "Operational Expenses",
      value: `Rs ${stats.operationalExpenses.toLocaleString()}`,
      subtitle: `${stats.operationalExpensesCount} transactions`,
      icon: Building2,
      bgColor: "bg-gradient-to-br from-emerald-500/10 to-emerald-500/5",
      borderColor: "border-emerald-500/20",
      iconColor: "text-emerald-500",
    },
    {
      title: "Expense Types",
      value: stats.expenseTypesCount.toString(),
      subtitle: `${stats.expenseTypesCount} active`,
      icon: Tag,
      bgColor: "bg-gradient-to-br from-purple-500/10 to-purple-500/5",
      borderColor: "border-purple-500/20",
      iconColor: "text-purple-500",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Expense Management</h1>
        <p className="text-muted-foreground">Manage expense types and post expenses</p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="expense-types" 
            className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary gap-2"
          >
            <Tag className="w-4 h-4" />
            Expense Types
          </TabsTrigger>
          <TabsTrigger 
            value="post-expense" 
            className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary gap-2"
          >
            <Plus className="w-4 h-4" />
            Post Expense
          </TabsTrigger>
          <TabsTrigger 
            value="operational-expenses" 
            className="data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary gap-2"
          >
            <Building2 className="w-4 h-4" />
            Operational Expenses
          </TabsTrigger>
        </TabsList>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsCards.map((stat, index) => (
            <Card 
              key={index} 
              className={`p-4 ${stat.bgColor} border ${stat.borderColor} hover:shadow-md transition-all duration-300`}
            >
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className={`text-sm font-medium ${stat.iconColor}`}>{stat.title}</p>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className={`text-xs ${stat.iconColor}`}>{stat.subtitle}</p>
                </div>
                <div className={`p-2 rounded-full ${stat.bgColor}`}>
                  <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Tab Contents */}
        <TabsContent value="expense-types" className="mt-6">
          <ExpenseTypesTab onUpdate={fetchStats} />
        </TabsContent>

        <TabsContent value="post-expense" className="mt-6">
          <PostExpenseTab onUpdate={fetchStats} />
        </TabsContent>

        <TabsContent value="operational-expenses" className="mt-6">
          <OperationalExpensesTab onUpdate={fetchStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
