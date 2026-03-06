import { useState } from "react";
import { Search, Package, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { GlobalSearch } from "./GlobalSearch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

export const Header = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    import("@/utils/auth").then((auth) => {
      auth.clearAuth();
      navigate("/login");
    });
  };

  return (
    <>
      <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
        {/* Left Side - Logo and Brand */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Package className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-foreground">Admin-CTC</span>
        </div>

        {/* Right Side - Actions */}
        <div className="flex items-center gap-4">
          {/* Search */}
          <button
            onClick={() => setSearchOpen(true)}
            className="w-10 h-10 rounded-lg border border-border hover:bg-muted flex items-center justify-center transition-colors"
          >
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>

          {/* Notifications */}
          <NotificationBell />

          {/* User Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger className="focus:outline-none">
              <div className="flex items-center gap-2 hover:bg-muted p-1 px-2 rounded-lg transition-colors cursor-pointer">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">T</div>
                <span className="text-sm text-foreground hidden sm:block">Admin-CTC</span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
};
