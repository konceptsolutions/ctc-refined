import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MainGroupsTab } from "./MainGroupsTab";
import { SubgroupsTab } from "./SubgroupsTab";
import { AccountsTab } from "./AccountsTab";

export const ChartOfAccounts = () => {
  const [activeTab, setActiveTab] = useState("main-groups");

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="main-groups" 
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Main Groups
          </TabsTrigger>
          <TabsTrigger 
            value="subgroups"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          > 
            <span className="mr-1">λ</span> Subgroups
          </TabsTrigger>
          <TabsTrigger 
            value="accounts"
            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-4 py-2 transition-all duration-200"
          >
            <span className="mr-1">λ</span> Accounts
          </TabsTrigger>
        </TabsList>

        <TabsContent value="main-groups" className="animate-fade-in mt-4">
          <MainGroupsTab />
        </TabsContent>

        <TabsContent value="subgroups" className="animate-fade-in mt-4">
          <SubgroupsTab />
        </TabsContent>

        <TabsContent value="accounts" className="animate-fade-in mt-4">
          <AccountsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};
