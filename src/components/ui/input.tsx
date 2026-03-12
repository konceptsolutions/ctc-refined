import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, onWheel, onKeyDown, inputMode, ...props }, ref) => {
    const isNumberType = type === "number";
    const finalType = isNumberType ? "text" : type;
    const finalInputMode = isNumberType ? inputMode || "decimal" : inputMode;

    // For number-like inputs, prevent changing value via mouse wheel or arrow keys
    const handleWheel: React.WheelEventHandler<HTMLInputElement> = (event) => {
      if (isNumberType) {
        event.preventDefault();
      }
      onWheel?.(event);
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (
      event,
    ) => {
      if (isNumberType && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        event.preventDefault();
      }
      onKeyDown?.(event);
    };

    return (
      <input
        type={finalType}
        inputMode={finalInputMode}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
