import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PrintPdfButtonProps = {
  onPrint: () => void;
  disabled?: boolean;
  size?: "default" | "sm" | "lg" | "icon";
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  className?: string;
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
  return (
    <Button
      variant={variant}
      size={size}
      className={cn("gap-1", className)}
      disabled={disabled}
      onClick={onPrint}
    >
      <FileText className="h-4 w-4" />
      {label}
    </Button>
  );
}
