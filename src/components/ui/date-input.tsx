import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatUiDate,
  UI_DATE_FORMAT,
  UI_DATE_PLACEHOLDER,
} from "@/utils/dateUtils";

export interface DateInputProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  id?: string;
  align?: "start" | "center" | "end";
}

function parseValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const iso = parse(value.slice(0, 10), "yyyy-MM-dd", new Date());
  if (isValid(iso)) return iso;
  const ui = parse(value, UI_DATE_FORMAT, new Date());
  if (isValid(ui)) return ui;
  const legacy = parse(value, "MM-dd-yyyy", new Date());
  if (isValid(legacy)) return legacy;
  const fallback = new Date(value);
  return isValid(fallback) ? fallback : undefined;
}

export function DateInput({
  value,
  onChange,
  placeholder = UI_DATE_PLACEHOLDER,
  className,
  buttonClassName,
  disabled,
  id,
  align = "start",
}: DateInputProps) {
  const [open, setOpen] = React.useState(false);
  const selected = React.useMemo(() => parseValue(value), [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !selected && "text-muted-foreground",
            buttonClassName,
            className,
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {selected ? formatUiDate(selected) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align={align}>
        {open ? (
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange?.(date ? format(date, "yyyy-MM-dd") : "");
              setOpen(false);
            }}
            initialFocus
            className="pointer-events-auto p-3"
          />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
