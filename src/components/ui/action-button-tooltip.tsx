import * as React from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ActionButtonTooltipProps {
  label: string;
  children: React.ReactNode;
  variant?: "view" | "edit" | "delete" | "lock" | "copy" | "more" | "default";
  side?: "top" | "bottom" | "left" | "right";
}

const variantStyles = {
  view: "bg-green-600 text-white border-green-700",
  edit: "bg-orange-500 text-white border-orange-600",
  delete: "bg-red-600 text-white border-red-700",
  lock: "bg-orange-500 text-white border-orange-600",
  copy: "bg-purple-600 text-white border-purple-700",
  more: "bg-gray-600 text-white border-gray-700",
  default: "bg-gray-600 text-white border-gray-700",
};

export const ActionButtonTooltip: React.FC<ActionButtonTooltipProps> = ({
  label,
  children,
  variant = "default",
  side = "top",
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          "rounded-lg px-3 py-1.5 text-sm font-medium shadow-lg",
          variantStyles[variant]
        )}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
};

