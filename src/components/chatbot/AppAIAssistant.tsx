import { useLocation } from "react-router-dom";
import { getTokenRoleName, isAuthenticated } from "@/utils/auth";
import AIChatBot from "./AIChatBot";

/**
 * Global AI assistant — visible to Admin users only, on authenticated pages except login.
 */
export const AppAIAssistant = () => {
  const location = useLocation();
  const roleName = getTokenRoleName()?.trim().toLowerCase();
  const isAdmin = roleName === "admin";

  if (!isAuthenticated() || !isAdmin || location.pathname === "/login") {
    return null;
  }

  return <AIChatBot />;
};
