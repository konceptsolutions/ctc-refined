import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { UsersManagementTab } from "@/components/settings/UsersManagementTab";
import { ActivityLogsTab } from "@/components/settings/ActivityLogsTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { Activity, Settings as SettingsIcon, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/permissions/PermissionsProvider";

type SettingsTab = "users" | "activity" | "roles";

const SETTINGS_TABS: SettingsTab[] = ["users", "activity", "roles"];

const Settings = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const { can, version } = usePermissions();
  void version;

  const activeTab: SettingsTab = SETTINGS_TABS.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : "users";

  useEffect(() => {
    if (!tab) {
      navigate("/settings/users", { replace: true });
      return;
    }
    if (!SETTINGS_TABS.includes(tab as SettingsTab)) {
      navigate("/settings/users", { replace: true });
      return;
    }
    // Page-level permission within settings
    const pageKey =
      tab === "activity"
        ? "page.settings.activity"
        : tab === "roles"
          ? "page.settings.roles"
          : "page.settings.users";
    if (!can(pageKey) && !can("module.settings")) {
      navigate("/", { replace: true });
    }
  }, [tab, navigate]);

  const handleTabChange = (nextTab: SettingsTab) => {
    if (nextTab === activeTab && tab === nextTab) return;
    navigate(`/settings/${nextTab}`);
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden ml-16">
        <Header />

        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage users, roles, and review system activity
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            {can("page.settings.users") && (
              <button
                type="button"
                onClick={() => handleTabChange("users")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                  activeTab === "users"
                    ? "border border-primary text-primary bg-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Users className="w-3.5 h-3.5" />
                Users Management
              </button>
            )}
            {can("page.settings.roles") && (
              <button
                type="button"
                onClick={() => handleTabChange("roles")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                  activeTab === "roles"
                    ? "border border-primary text-primary bg-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Shield className="w-3.5 h-3.5" />
                Roles & Permissions
              </button>
            )}
            {can("page.settings.activity") && (
              <button
                type="button"
                onClick={() => handleTabChange("activity")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                  activeTab === "activity"
                    ? "border border-primary text-primary bg-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Activity className="w-3.5 h-3.5" />
                User Activity
              </button>
            )}
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          {activeTab === "users" && <UsersManagementTab />}
          {activeTab === "roles" && <RolesPermissionsTab />}
          {activeTab === "activity" && <ActivityLogsTab />}
        </main>
      </div>
    </div>
  );
};

export default Settings;
