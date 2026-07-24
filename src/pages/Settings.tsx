import { useEffect } from "react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { UsersManagementTab } from "@/components/settings/UsersManagementTab";
import { Users, Settings as SettingsIcon } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

const Settings = () => {
  const navigate = useNavigate();
  const { tab } = useParams<{ tab?: string }>();

  useEffect(() => {
    if (tab !== "users") {
      navigate("/settings/users", { replace: true });
    }
  }, [tab, navigate]);

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
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Users className="w-5 h-5 text-primary" />
                Users Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Create accounts for non-admin roles and change user passwords
              </p>
            </div>
          </div>
        </div>

        <main className="flex-1 p-4 overflow-auto">
          <UsersManagementTab />
        </main>
      </div>
    </div>
  );
};

export default Settings;
