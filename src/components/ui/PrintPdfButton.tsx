import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

export function PrintPdfButton({
  onPrint,
  disabled,
  size = "sm",
  variant = "outline",
  className,
  label = "Print PDF",
}: PrintPdfButtonProps) {
  const iconOnly = size === "icon";

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(iconOnly ? undefined : "gap-1", className)}
      disabled={disabled}
      onClick={onPrint}
      title={label}
      aria-label={label}
    >
      <FileText className="h-4 w-4" />
      {iconOnly ? null : label}
    </Button>
  );
}
