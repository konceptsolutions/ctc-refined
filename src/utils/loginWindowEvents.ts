export const LOGIN_WINDOW_EVENT = "login-window-ended";

export function dispatchLoginWindowEnded(message?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(LOGIN_WINDOW_EVENT, {
      detail: {
        message:
          message ||
          "Your allowed login time has ended. Please sign in again during your scheduled hours.",
      },
    }),
  );
}
