import * as React from "react";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
} from "lucide-react";
import { useDayPicker, useNavigation } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  CALENDAR_FROM_YEAR,
  CALENDAR_TO_YEAR,
} from "@/utils/dateUtils";

type CalendarCaptionProps = {
  displayMonth: Date;
  id?: string;
  displayIndex?: number;
};

export function CalendarCaption({ displayMonth }: CalendarCaptionProps) {
  const { goToMonth, nextMonth, previousMonth } = useNavigation();
  const { fromYear, toYear, locale } = useDayPicker();

  const minYear = fromYear ?? CALENDAR_FROM_YEAR;
  const maxYear = toYear ?? CALENDAR_TO_YEAR;
  const monthIndex = displayMonth.getMonth();
  const year = displayMonth.getFullYear();

  const [yearInput, setYearInput] = React.useState(String(year));

  React.useEffect(() => {
    setYearInput(String(displayMonth.getFullYear()));
  }, [displayMonth]);

  const monthOptions = React.useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => ({
        value: index,
        label: format(new Date(2024, index, 1), "MMMM", { locale }),
      })),
    [locale],
  );

  const applyYear = React.useCallback(
    (nextYear: number) => {
      const clamped = Math.min(maxYear, Math.max(minYear, nextYear));
      goToMonth(new Date(clamped, monthIndex, 1));
      setYearInput(String(clamped));
    },
    [goToMonth, maxYear, minYear, monthIndex],
  );

  const commitYearInput = React.useCallback(() => {
    const parsed = Number.parseInt(yearInput, 10);
    if (Number.isFinite(parsed)) {
      applyYear(parsed);
      return;
    }
    setYearInput(String(year));
  }, [applyYear, year, yearInput]);

  return (
    <div className="mb-2 flex items-center justify-between gap-1 px-1">
      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        )}
        disabled={!previousMonth}
        onClick={() => previousMonth && goToMonth(previousMonth)}
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      <div className="flex items-center gap-2">
        <div className="relative">
          <select
            aria-label="Select month"
            value={monthIndex}
            onChange={(event) => {
              goToMonth(new Date(year, Number(event.target.value), 1));
            }}
            className={cn(
              "h-8 cursor-pointer appearance-none rounded-md border-0 bg-transparent",
              "pr-6 pl-1 text-sm font-medium focus:outline-none focus:ring-0",
            )}
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>

        <div className="flex items-center overflow-hidden rounded-md border border-input bg-muted/40">
          <input
            type="text"
            inputMode="numeric"
            aria-label="Year"
            value={yearInput}
            onChange={(event) => {
              setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4));
            }}
            onBlur={commitYearInput}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitYearInput();
              }
            }}
            className="h-8 w-[4.25rem] border-0 bg-transparent text-center text-sm focus:outline-none"
          />
          <div className="flex flex-col border-l border-input">
            <button
              type="button"
              aria-label="Increase year"
              disabled={year >= maxYear}
              onClick={() => applyYear(year + 1)}
              className="flex h-4 w-6 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label="Decrease year"
              disabled={year <= minYear}
              onClick={() => applyYear(year - 1)}
              className="flex h-4 w-6 items-center justify-center border-t border-input text-muted-foreground hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 opacity-70 hover:opacity-100",
        )}
        disabled={!nextMonth}
        onClick={() => nextMonth && goToMonth(nextMonth)}
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
