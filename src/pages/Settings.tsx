import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { UsersManagementTab } from "@/components/settings/UsersManagementTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { ApprovalFlowsTab } from "@/components/settings/ApprovalFlowsTab";
import { ActivityLogsTab } from "@/components/settings/ActivityLogsTab";
import { BackupRestoreTab } from "@/components/settings/BackupRestoreTab";
import { CompanyProfileTab } from "@/components/settings/CompanyProfileTab";
import { WhatsAppSettingsTab } from "@/components/settings/WhatsAppSettingsTab";
import { LongCatSettingsTab } from "@/components/settings/LongCatSettingsTab";
import { PaymentAccountsTab } from "@/components/settings/PaymentAccountsTab";
import { 
  Users, 
  Shield, 
  GitBranch, 
  FileText, 
  Database, 
  Building2, 
  MessageCircle,
  Bot,
  Wallet,
  Settings as SettingsIcon
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";

type SettingsTab = "users" | "roles" | "approvals" | "logs" | "backup" | "company" | "whatsapp" | "longcat" | "accounts";

const Settings = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  const isValidTab = (value: string | undefined): value is SettingsTab =>
    value === "users" ||
    value === "roles" ||
    value === "approvals" ||
    value === "logs" ||
    value === "backup" ||
    value === "company" ||
    value === "whatsapp" ||
    value === "longcat" ||
    value === "accounts";

  const activeTab: SettingsTab = isValidTab(tab) ? tab : "users";

  // Ensure /settings redirects to the default dedicated page.
  useEffect(() => {
    if (!tab) navigate("/settings/users", { replace: true });
  }, [tab, navigate]);

  const handleTabChange = (nextTab: SettingsTab) => navigate(`/settings/${nextTab}`);

  const tabs = [
    { id: "users" as const, label: "Users Management", icon: Users },
    { id: "roles" as const, label: "Roles & Permissions", icon: Shield },
    { id: "approvals" as const, label: "Approval Flows", icon: GitBranch },
    { id: "logs" as const, label: "Activity Logs", icon: FileText },
    { id: "backup" as const, label: "Backup & Restore", icon: Database },
    { id: "company" as const, label: "Company Profile", icon: Building2 },
    { id: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle },
    { id: "longcat" as const, label: "LongCat AI", icon: Bot },
    // { id: "accounts" as const, label: "Payment Accounts", icon: Wallet }, // Hidden
  ];

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        {/* Page Header */}
        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">System Administration</h1>
              <p className="text-sm text-muted-foreground">Manage users, roles, approvals, and system settings</p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-card border-b border-border px-4 overflow-x-auto">
          <div className="flex items-center gap-1 py-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-all rounded whitespace-nowrap",
                  activeTab === tab.id
                    ? "border border-primary text-primary bg-background"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <main className="flex-1 p-4 overflow-auto">
          {activeTab === "users" && <UsersManagementTab />}
          {activeTab === "roles" && <RolesPermissionsTab />}
          {activeTab === "approvals" && <ApprovalFlowsTab />}
          {activeTab === "logs" && <ActivityLogsTab />}
          {activeTab === "backup" && <BackupRestoreTab />}
          {activeTab === "company" && <CompanyProfileTab />}
          {activeTab === "whatsapp" && <WhatsAppSettingsTab />}
          {activeTab === "longcat" && <LongCatSettingsTab />}
          {/* {activeTab === "accounts" && <PaymentAccountsTab />} */} {/* Hidden */}
        </main>
      </div>
    </div>
  );
};

export default Settings;
