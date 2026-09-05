import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StoreOperatorPasswordDialog } from "@/components/store/StoreOperatorPasswordDialog";

export type StoreOperator = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type StoreOperatorAuthContextValue = {
  /** True when saves must be gated by operator password (Store module routes). */
  requiresOperatorAuth: boolean;
  /**
   * Opens the password dialog when on Store routes.
   * Resolves with the matched user, or null if cancelled / not required.
   */
  requestOperatorAuth: () => Promise<StoreOperator | null>;
};

const StoreOperatorAuthContext = createContext<StoreOperatorAuthContextValue | null>(
  null,
);

export function performedByPayload(operator: StoreOperator | null | undefined) {
  if (!operator) return {};
  return {
    performedBy: operator.name,
    performedById: operator.id,
    performedByRole: operator.role,
  };
}

export function StoreOperatorAuthProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const resolverRef = useRef<((value: StoreOperator | null) => void) | null>(null);

  const closeWith = useCallback((value: StoreOperator | null) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpen(false);
  }, []);

  const requestOperatorAuth = useCallback(() => {
    return new Promise<StoreOperator | null>((resolve) => {
      if (resolverRef.current) {
        resolverRef.current(null);
      }
      resolverRef.current = resolve;
      setOpen(true);
    });
  }, []);

  const value = useMemo(
    () => ({
      requiresOperatorAuth: true,
      requestOperatorAuth,
    }),
    [requestOperatorAuth],
  );

  return (
    <StoreOperatorAuthContext.Provider value={value}>
      {children}
      <StoreOperatorPasswordDialog
        open={open}
        onSuccess={(op) => closeWith(op)}
        onCancel={() => closeWith(null)}
      />
    </StoreOperatorAuthContext.Provider>
  );
}

/**
 * When wrapped in StoreOperatorAuthProvider: prompts for operator password.
 * Elsewhere: no prompt; returns null and requiresOperatorAuth=false.
 */
export function useStoreOperatorAuth(): StoreOperatorAuthContextValue {
  const ctx = useContext(StoreOperatorAuthContext);

  const noopRequest = useCallback(async () => null, []);

  if (ctx) {
    return ctx;
  }

  return {
    requiresOperatorAuth: false,
    requestOperatorAuth: noopRequest,
  };
}
