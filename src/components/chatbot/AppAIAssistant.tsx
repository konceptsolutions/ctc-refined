import { useLocation } from "react-router-dom";
import { isAuthenticated } from "@/utils/auth";
import AIChatBot from "./AIChatBot";

/**
 * Global AI assistant — visible on all authenticated pages except login.
 */
export const AppAIAssistant = () => {
  const location = useLocation();

  if (!isAuthenticated() || location.pathname === "/login") {
    return null;
  }

  return <AIChatBot />;
};
