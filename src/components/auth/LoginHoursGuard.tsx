import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  clearAuth,
  getStoredLoginHours,
  isAdminRole,
  isAuthenticated,
} from "@/utils/auth";
import { isWithinLoginSchedule, msUntilLoginWindowEnd } from "@/utils/loginHours";
import { LOGIN_WINDOW_EVENT } from "@/utils/loginWindowEvents";

const LoginHoursGuard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const loggingOutRef = useRef(false);

  useEffect(() => {
    const logout = (message?: string) => {
      if (loggingOutRef.current) return;
      if (isAdminRole()) return;
      loggingOutRef.current = true;
      clearAuth();
      toast.error(
        message ||
          "Your allowed login time has ended. Please sign in again during your scheduled hours.",
      );
      if (location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
      window.setTimeout(() => {
        loggingOutRef.current = false;
      }, 1500);
    };

    const checkWindow = () => {
      if (!isAuthenticated() || isAdminRole()) return;
      const { loginStartTime, loginEndTime, loginAllowedDays } = getStoredLoginHours();
      if (!isWithinLoginSchedule(loginStartTime, loginEndTime, loginAllowedDays)) {
        logout();
      }
    };

    const onEnded = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      logout(detail?.message);
    };

    checkWindow();
    const intervalId = window.setInterval(checkWindow, 15000);
    window.addEventListener(LOGIN_WINDOW_EVENT, onEnded);

    let timeoutId: number | undefined;
    const scheduleExactLogout = () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (!isAuthenticated() || isAdminRole()) return;
      const { loginStartTime, loginEndTime } = getStoredLoginHours();
      const remaining = msUntilLoginWindowEnd(loginStartTime, loginEndTime);
      if (remaining == null) return;
      timeoutId = window.setTimeout(() => logout(), Math.min(remaining + 250, 2_147_000_000));
    };
    scheduleExactLogout();

    const onVisible = () => {
      checkWindow();
      scheduleExactLogout();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(intervalId);
      if (timeoutId) window.clearTimeout(timeoutId);
      window.removeEventListener(LOGIN_WINDOW_EVENT, onEnded);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [location.pathname, navigate]);

  return null;
};

export default LoginHoursGuard;
