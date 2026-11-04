import { cn } from "@/lib/utils";

export type PartIdentityBadgesProps = {
  /** UI Part No (DB master_part_no) */
  partNo?: string | null;
  /** UI Master Part (DB part_no) */
  masterPart?: string | null;
  className?: string;
  /** Compact badges for dense dropdown rows */
  size?: "sm" | "md";
  /** Mute colors when the parent row is selected/highlighted */
  mutedOnParent?: boolean;
};

const clean = (value: unknown) => String(value ?? "").trim();

/**
 * Side-by-side Part No / Master Part chips for item dropdowns.
 * Colors stay distinct so the two numbers are easy to tell apart.
 */
export function PartIdentityBadges({
  partNo,
  masterPart,
  className,
  size = "sm",
  mutedOnParent = false,
}: PartIdentityBadgesProps) {
  const uiPartNo = clean(partNo);
  const uiMasterPart = clean(masterPart);
  if (!uiPartNo && !uiMasterPart) return null;

  const pad = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs";

  return (
    <div
      className={cn(
        "inline-flex flex-nowrap items-center gap-1.5 shrink-0",
        className,
      )}
      title={`Part No: ${uiPartNo || "—"} / Master Part: ${uiMasterPart || "—"}`}
    >
      {uiPartNo ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded border font-mono font-semibold tabular-nums whitespace-nowrap",
            pad,
            mutedOnParent
              ? "bg-sky-500/20 text-inherit border-sky-400/40"
              : "bg-sky-100 text-sky-900 border-sky-200",
          )}
        >
          {uiPartNo}
        </span>
      ) : null}
      {uiPartNo && uiMasterPart ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center font-semibold text-muted-foreground leading-none",
            size === "sm" ? "text-[11px] px-0.5" : "text-xs px-1",
          )}
          aria-hidden
        >
          /
        </span>
      ) : null}
      {uiMasterPart ? (
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded border font-mono font-semibold tabular-nums whitespace-nowrap",
            pad,
            mutedOnParent
              ? "bg-amber-500/20 text-inherit border-amber-400/40"
              : "bg-amber-100 text-amber-950 border-amber-200",
          )}
        >
          {uiMasterPart}
        </span>
      ) : null}
    </div>
  );
}
