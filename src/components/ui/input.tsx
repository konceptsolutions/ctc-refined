import * as React from "react";

import { cn } from "@/lib/utils";
import { DateInput } from "@/components/ui/date-input";

const isPartCodeField = (props: React.ComponentProps<"input">) => {
  const hints = [
    props.name,
    props.id,
    props.placeholder,
    props["aria-label"],
    props["data-testid"],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    hints.includes("part no") ||
    hints.includes("part number") ||
    hints.includes("master part") ||
    hints.includes("master_part") ||
    hints.includes("partno")
  );
};

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    { className, type, onWheel, onKeyDown, onKeyDownCapture, inputMode, ...props },
    ref,
  ) => {
    const isNumberType = type === "number";
    const isDateType = type === "date";

    if (isDateType) {
      const { value, onChange, disabled, id, className: inputClassName, ...dateProps } =
        props;
      void dateProps;
      const dateValue = value == null ? "" : String(value);

      return (
        <DateInput
          id={id}
          disabled={disabled}
          value={dateValue}
          onChange={(next) => {
            onChange?.({
              target: { value: next },
              currentTarget: { value: next },
            } as React.ChangeEvent<HTMLInputElement>);
          }}
          buttonClassName={cn("h-10", inputClassName)}
        />
      );
    }

    const finalType = isNumberType ? "text" : type;
    const finalInputMode = isNumberType ? inputMode || "decimal" : inputMode;
    const partCodeFont = isPartCodeField(props);

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

    const handleKeyDownCapture: React.KeyboardEventHandler<HTMLInputElement> = (
      event,
    ) => {
      onKeyDownCapture?.(event);
    };

    return (
      <input
        ref={ref}
        type={finalType}
        inputMode={finalInputMode}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          partCodeFont && "part-code-font font-mono",
          className,
        )}
        {...props}
        onWheel={handleWheel}
        onKeyDownCapture={handleKeyDownCapture}
        onKeyDown={handleKeyDown}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
