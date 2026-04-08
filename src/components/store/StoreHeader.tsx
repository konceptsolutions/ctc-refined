import { Package, LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { getTokenUserName } from "@/utils/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";

interface StoreHeaderProps {
  storeName?: string;
}

export const StoreHeader = ({ storeName }: StoreHeaderProps) => {
  const navigate = useNavigate();
  const userName = getTokenUserName() || "User";
  const avatarLetter = userName.charAt(0).toUpperCase();

  const handleLogout = () => {
    import("@/utils/auth").then((auth) => {
      auth.clearAuth();
      navigate("/login");
    });
  };

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-4 md:px-6 sticky top-0 z-40 shadow-sm">
      {/* Left Side - Logo and Store Info */}
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-md shadow-primary/20">
          <Package className="w-5 h-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-base md:text-lg">{userName}</h1>
          {storeName && (
            <p className="text-xs text-muted-foreground hidden sm:block">Store: {storeName}</p>
          )}
        </div>
      </div>

      {/* Right Side - Actions */}
      <div className="flex items-center gap-3 md:gap-4">
        {/* Notifications */}
        <NotificationBell />

        {/* Store Badge */}
        <Badge variant="outline" className="px-2 md:px-3 py-1 text-xs hidden sm:flex">
          Store Manager
        </Badge>

        {/* User Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none">
            <div className="flex items-center gap-2 hover:bg-muted p-1 px-2 rounded-lg transition-colors cursor-pointer">
              <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">{avatarLetter}</div>
              <span className="text-sm text-foreground hidden md:block">{userName}</span>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Store Portal</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

