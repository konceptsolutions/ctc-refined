import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { UsersManagementTab } from "@/components/settings/UsersManagementTab";
import { ActivityLogsTab } from "@/components/settings/ActivityLogsTab";
import { RolesPermissionsTab } from "@/components/settings/RolesPermissionsTab";
import { ChangePasswordTab } from "@/components/settings/ChangePasswordTab";
import { Activity, KeyRound, Settings as SettingsIcon, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate, useParams } from "react-router-dom";
import { usePermissions } from "@/permissions/PermissionsProvider";
import { isAdminRole } from "@/utils/auth";

type SettingsTab = "users" | "activity" | "roles" | "password";

const Settings = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();
  const { can, version } = usePermissions();
  void version;
  const isAdmin = isAdminRole();

  const allowedTabs: SettingsTab[] = [
    ...(can("page.settings.users") || can("module.settings") ? (["users"] as const) : []),
    ...(can("page.settings.roles") || can("module.settings") ? (["roles"] as const) : []),
    ...(can("page.settings.activity") || can("module.settings") ? (["activity"] as const) : []),
    ...(!isAdmin ? (["password"] as const) : []),
  ];

  const activeTab: SettingsTab = allowedTabs.includes(tab as SettingsTab)
    ? (tab as SettingsTab)
    : allowedTabs[0] || "password";

  useEffect(() => {
    if (!allowedTabs.length) {
      navigate("/", { replace: true });
      return;
    }
    if (!tab || !allowedTabs.includes(tab as SettingsTab)) {
      navigate(`/settings/${allowedTabs[0]}`, { replace: true });
      return;
    }
    if (tab === "password") {
      if (isAdmin) {
        navigate(`/settings/${allowedTabs[0] || "users"}`, { replace: true });
      }
      return;
    }
    const pageKey =
      tab === "activity"
        ? "page.settings.activity"
        : tab === "roles"
          ? "page.settings.roles"
          : "page.settings.users";
    if (!can(pageKey) && !can("module.settings")) {
      navigate(`/settings/${allowedTabs[0]}`, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- allowedTabs derived from can/isAdmin
  }, [tab, navigate, isAdmin, version]);

  const handleTabChange = (nextTab: SettingsTab) => {
    if (nextTab === activeTab && tab === nextTab) return;
    navigate(`/settings/${nextTab}`);
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden app-content-offset">
        <Header />

        <div className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <SettingsIcon className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">
                {isAdmin
                  ? "Manage users, roles, and review system activity"
                  : "Manage your account password"}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card border-b border-border px-4 py-2">
          <div className="flex items-center gap-2 flex-wrap">
            {allowedTabs.includes("users") && (
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
            {allowedTabs.includes("roles") && (
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
            {allowedTabs.includes("activity") && (
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
            {allowedTabs.includes("password") && (
              <button
                type="button"
                onClick={() => handleTabChange("password")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded",
                  activeTab === "password"
                    ? "border border-primary text-primary bg-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <KeyRound className="w-3.5 h-3.5" />
                Password
              </button>
            )}
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          {activeTab === "users" && <UsersManagementTab />}
          {activeTab === "roles" && <RolesPermissionsTab />}
          {activeTab === "activity" && <ActivityLogsTab />}
          {activeTab === "password" && <ChangePasswordTab />}
        </main>
      </div>
    </div>
  );
};

export default Settings;
