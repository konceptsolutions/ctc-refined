import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shared light-violet styling for print actions across the app. */
export const PRINT_BUTTON_CLASS =
  "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200 hover:text-violet-900 disabled:opacity-60";

export const PRINT_ICON_BUTTON_CLASS = cn(
  PRINT_BUTTON_CLASS,
  "h-8 w-8 shrink-0",
);

type PrintPdfButtonProps = {
  onPrint: () => void;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";
  className?: string;
  /** Visible label when not icon-only; also used as title/aria-label for icon buttons. */
  label?: string;
};

/**
 * Standard print button used system-wide.
 * Icon-only = violet square with printer icon.
 * Labeled = same violet style with text.
 */
export function PrintPdfButton({
  onPrint,
  disabled,
  size = "sm",
  className,
  label = "Print PDF",
}: PrintPdfButtonProps) {
  const iconOnly = size === "icon";

  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? "icon" : size}
      className={cn(
        iconOnly ? "shrink-0" : "gap-1",
        className,
        // Applied last so twMerge keeps violet styles over muted/ghost overrides
        iconOnly ? PRINT_ICON_BUTTON_CLASS : PRINT_BUTTON_CLASS,
      )}
      disabled={disabled}
      onClick={onPrint}
      title={label}
      aria-label={label}
    >
      <Printer className="h-4 w-4" />
      {iconOnly ? null : label}
    </Button>
  );
}
