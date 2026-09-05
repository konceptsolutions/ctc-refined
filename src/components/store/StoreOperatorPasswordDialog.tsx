import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import apiClient from "@/lib/api";
import type { StoreOperator } from "@/hooks/useStoreOperatorAuth";

interface StoreOperatorPasswordDialogProps {
  open: boolean;
  onSuccess: (operator: StoreOperator) => void;
  onCancel: () => void;
}

export function StoreOperatorPasswordDialog({
  open,
  onSuccess,
  onCancel,
}: StoreOperatorPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError("");
      setLoading(false);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  const handleConfirm = async () => {
    if (!password.trim()) {
      setError("Password is required");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const res = await apiClient.verifyPassword({ password });
      const user = (res as any)?.data;
      if (!user?.id || !user?.name) {
        setError((res as any)?.error || "Password does not match any active user");
        return;
      }
      onSuccess({
        id: String(user.id),
        name: String(user.name),
        email: String(user.email || ""),
        role: String(user.role || ""),
      });
    } catch (err: any) {
      setError(err?.message || "Password does not match any active user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !loading) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Confirm operator</DialogTitle>
          <DialogDescription>
            Enter the password of the user who is performing this action. The entry will be
            attributed to that user.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="store-operator-password">Operator password</Label>
          <Input
            id="store-operator-password"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={loading}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleConfirm();
              }
            }}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Verifying…
              </>
            ) : (
              "Confirm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
