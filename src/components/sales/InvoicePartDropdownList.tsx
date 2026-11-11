import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { PartItem } from "@/types/invoice";
import { PartIdentityBadges } from "@/components/parts/PartIdentityBadges";

export type InvoicePartDropdownListProps = {
  inlineRowId: string;
  filteredParts: PartItem[];
  highlightIndex: number;
  emptyHint: string;
  onHighlightIndex: (idx: number) => void;
  onPickPart: (part: PartItem) => void;
  markDropdownMouseDown: () => void;
};

/** Cap unfiltered catalog rows so the menu stays responsive without virtualization. */
const MAX_VISIBLE_ROWS = 60;

function hasPrice(value: unknown): value is number {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function PartDropdownRow({
  inlineRowId,
  part,
  idx,
  highlighted,
  onHighlightIndex,
  onPickPart,
  markDropdownMouseDown,
}: {
  inlineRowId: string;
  part: PartItem;
  idx: number;
  highlighted: boolean;
  onHighlightIndex: (idx: number) => void;
  onPickPart: (part: PartItem) => void;
  markDropdownMouseDown: () => void;
}) {
  const brandLabel =
    part.brands && part.brands.length > 0
      ? part.brands
          .map((b) => b.name)
          .filter(Boolean)
          .join(", ")
      : "";
  const showPriceA = hasPrice(part.priceA);
  const showPriceB = hasPrice(part.priceB);
  const showPriceN = hasPrice(part.priceN);
  const showPrices = showPriceA || showPriceB || showPriceN;

  return (
    <div
      data-index={idx}
      data-dropdown-item
      data-invoice-part-dd-row={inlineRowId}
      data-invoice-part-dd-idx={idx}
      className={cn(
        "group px-3 py-2.5 text-sm cursor-pointer border-b border-border transition-colors",
        highlighted
          ? "bg-primary text-primary-foreground"
          : "bg-popover hover:bg-accent hover:text-accent-foreground",
      )}
      onMouseEnter={() => onHighlightIndex(idx)}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        markDropdownMouseDown();
        onPickPart(part);
      }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <PartIdentityBadges
          partNo={part.partNo}
          masterPart={part.masterPartNo}
          mutedOnParent={highlighted}
        />
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
              (part.availableQty ?? part.stockQty ?? 0) > 0
                ? highlighted
                  ? "bg-green-500/25 text-primary-foreground"
                  : "bg-green-100 text-green-700"
                : highlighted
                  ? "bg-red-500/25 text-primary-foreground"
                  : "bg-red-100 text-red-600",
            )}
          >
            {part.availableQty ?? part.stockQty ?? 0} pcs
          </span>
        </div>
      </div>
      <div
        className={cn(
          "text-xs mt-0.5 break-words",
          highlighted ? "text-primary-foreground/90" : "text-muted-foreground",
        )}
      >
        {part.description || "No description available"}
      </div>
      {part.category ? (
        <div
          className={cn(
            "text-[11px] mt-0.5 break-words",
            highlighted
              ? "text-primary-foreground/85"
              : "text-muted-foreground/80",
          )}
        >
          {part.category}
        </div>
      ) : null}
      {part.application ? (
        <div
          className={cn(
            "text-[11px] mt-0.5 break-words",
            highlighted
              ? "text-primary-foreground/85"
              : "text-muted-foreground/80",
          )}
        >
          App: {part.application}
        </div>
      ) : null}
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1 min-h-[1.25rem]">
        {brandLabel ? (
          <div
            className={cn(
              "text-[10px] uppercase font-semibold tracking-wider",
              highlighted ? "text-primary-foreground" : "text-foreground",
            )}
          >
            {brandLabel}
          </div>
        ) : (
          <div
            className={cn(
              "text-[10px] uppercase font-semibold tracking-wider",
              highlighted
                ? "text-primary-foreground/50"
                : "text-muted-foreground/50",
            )}
          >
            —
          </div>
        )}
        {showPrices ? (
          <div
            className={cn(
              "flex items-center gap-2 text-[10px] font-bold",
              highlighted ? "text-primary-foreground" : "text-blue-600",
            )}
          >
            {showPriceA && (
              <span
                className={cn(
                  "px-1 rounded border italic",
                  highlighted
                    ? "bg-primary-foreground/15 border-primary-foreground/30"
                    : "bg-blue-50 border-blue-100",
                )}
              >
                A: {Number(part.priceA).toLocaleString()}
              </span>
            )}
            {showPriceB && (
              <span
                className={cn(
                  "px-1 rounded border italic",
                  highlighted
                    ? "bg-primary-foreground/15 border-primary-foreground/30"
                    : "bg-indigo-50 border-indigo-100",
                )}
              >
                B: {Number(part.priceB).toLocaleString()}
              </span>
            )}
            {showPriceN && (
              <span
                className={cn(
                  "px-1 rounded border italic",
                  highlighted
                    ? "bg-primary-foreground/15 border-primary-foreground/30"
                    : "bg-emerald-50 border-emerald-100",
                )}
              >
                N: {Number(part.priceN).toLocaleString()}
              </span>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "text-[10px] font-medium",
              highlighted
                ? "text-primary-foreground/60"
                : "text-muted-foreground",
            )}
          >
            No price
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Part picker list for invoice/quotation lines.
 * No virtualization — variable-height rows (desc/app/brand/prices) must never clip.
 * Large catalogs are capped; type to search for the rest.
 */
export function InvoicePartDropdownList({
  inlineRowId,
  filteredParts,
  highlightIndex,
  emptyHint,
  onHighlightIndex,
  onPickPart,
  markDropdownMouseDown,
}: InvoicePartDropdownListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const skipScrollOnHighlightRef = useRef(false);
  const didInitialScrollRef = useRef(false);

  const visibleParts = filteredParts.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = Math.max(0, filteredParts.length - visibleParts.length);

  useLayoutEffect(() => {
    didInitialScrollRef.current = false;
  }, [filteredParts.length]);

  useLayoutEffect(() => {
    if (visibleParts.length === 0) return;
    const parent = parentRef.current;
    if (!parent) return;
    const hi = Math.min(
      Math.max(highlightIndex, 0),
      visibleParts.length - 1,
    );
    const el = parent.querySelector(
      `[data-invoice-part-dd-idx="${hi}"]`,
    ) as HTMLElement | null;
    if (!el) return;

    if (!didInitialScrollRef.current) {
      el.scrollIntoView({ block: "nearest" });
      didInitialScrollRef.current = true;
      skipScrollOnHighlightRef.current = false;
      return;
    }
    if (skipScrollOnHighlightRef.current) {
      skipScrollOnHighlightRef.current = false;
      return;
    }
    el.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, visibleParts.length]);

  if (filteredParts.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">{emptyHint}</div>
    );
  }

  const safeHighlight = Math.min(
    Math.max(highlightIndex, 0),
    visibleParts.length - 1,
  );

  return (
    <div
      ref={parentRef}
      className="max-h-80 w-full overflow-auto overscroll-contain bg-popover"
      style={{ backgroundColor: "hsl(var(--popover))" }}
      onMouseDown={() => {
        markDropdownMouseDown();
      }}
    >
      {visibleParts.map((p, idx) => (
        <PartDropdownRow
          key={p.id || `${p.partNo}-${idx}`}
          inlineRowId={inlineRowId}
          part={p}
          idx={idx}
          highlighted={idx === safeHighlight}
          onHighlightIndex={(i) => {
            skipScrollOnHighlightRef.current = true;
            onHighlightIndex(i);
          }}
          onPickPart={onPickPart}
          markDropdownMouseDown={markDropdownMouseDown}
        />
      ))}
      {hiddenCount > 0 ? (
        <div className="px-3 py-2 text-xs text-muted-foreground border-t border-border">
          +{hiddenCount} more — type to narrow results
        </div>
      ) : null}
    </div>
  );
}
