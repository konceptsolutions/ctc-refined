import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { PartItem } from "@/types/invoice";

export type InvoicePartDropdownListProps = {
  inlineRowId: string;
  filteredParts: PartItem[];
  highlightIndex: number;
  emptyHint: string;
  onHighlightIndex: (idx: number) => void;
  onPickPart: (part: PartItem) => void;
  markDropdownMouseDown: () => void;
};

/**
 * Virtualized part picker — rendering every active part as a DOM node made the
 * invoice line dropdown block the main thread for seconds on open/reopen.
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

  const rowVirtualizer = useVirtualizer({
    count: filteredParts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 120,
    overscan: 12,
    // Before ResizeObserver runs (portal/fixed layout), a 0×0 rect yields no virtual rows — dropdown appears empty.
    initialRect: { width: 320, height: 320 },
  });

  useLayoutEffect(() => {
    if (filteredParts.length === 0) return;
    const hi = Math.min(
      Math.max(highlightIndex, 0),
      filteredParts.length - 1,
    );
    rowVirtualizer.scrollToIndex(hi, { align: "auto" });
  }, [highlightIndex, filteredParts.length, rowVirtualizer]);

  if (filteredParts.length === 0) {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">{emptyHint}</div>
    );
  }

  const safeHighlight = Math.min(
    Math.max(highlightIndex, 0),
    filteredParts.length - 1,
  );

  return (
    <div
      ref={parentRef}
      className="h-80 w-full overflow-auto overscroll-contain"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const p = filteredParts[vi.index];
          if (!p) return null;
          const idx = vi.index;
          return (
            <div
              key={vi.key}
              data-dropdown-item
              data-invoice-part-dd-row={inlineRowId}
              data-invoice-part-dd-idx={idx}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${vi.size}px`,
                transform: `translateY(${vi.start}px)`,
              }}
              className={cn(
                "group px-3 py-2 text-sm cursor-pointer border-b border-border transition-colors",
                idx === safeHighlight
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent hover:text-accent-foreground",
              )}
              onMouseEnter={() => onHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                markDropdownMouseDown();
                onPickPart(p);
              }}
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="font-medium min-w-0 truncate">
                  {p.masterPartNo && p.masterPartNo !== p.partNo
                    ? `${p.partNo} | ${p.masterPartNo}`
                    : p.partNo}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
                      (p.availableQty ?? p.stockQty ?? 0) > 0
                        ? idx === safeHighlight
                          ? "bg-green-500/25 text-primary-foreground"
                          : "bg-green-100 text-green-700"
                        : idx === safeHighlight
                          ? "bg-red-500/25 text-primary-foreground"
                          : "bg-red-100 text-red-600",
                    )}
                  >
                    {p.availableQty ?? p.stockQty ?? 0} pcs
                  </span>
                </div>
              </div>
              <div
                className={cn(
                  "text-xs line-clamp-2 mt-0.5",
                  idx === safeHighlight
                    ? "text-primary-foreground/90"
                    : "text-muted-foreground",
                )}
              >
                {p.description || "No description available"}
              </div>
              {p.category ? (
                <div
                  className={cn(
                    "text-[11px] mt-0.5",
                    idx === safeHighlight
                      ? "text-primary-foreground/85"
                      : "text-muted-foreground/80",
                  )}
                >
                  {p.category}
                </div>
              ) : null}
              {p.application ? (
                <div
                  className={cn(
                    "text-[11px] mt-0.5",
                    idx === safeHighlight
                      ? "text-primary-foreground/85"
                      : "text-muted-foreground/80",
                  )}
                >
                  App: {p.application}
                </div>
              ) : null}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {p.brands && p.brands.length > 0 ? (
                  <div
                    className={cn(
                      "text-[10px] uppercase font-semibold tracking-wider",
                      idx === safeHighlight
                        ? "text-primary-foreground"
                        : "text-foreground",
                    )}
                  >
                    {p.brands.map((b) => b.name).join(", ")}
                  </div>
                ) : null}
                {(p.priceA !== null || p.priceB !== null) && (
                  <div
                    className={cn(
                      "flex items-center gap-2 text-[10px] font-bold",
                      idx === safeHighlight
                        ? "text-primary-foreground"
                        : "text-blue-600",
                    )}
                  >
                    {p.priceA !== null && (
                      <span
                        className={cn(
                          "px-1 rounded border italic",
                          idx === safeHighlight
                            ? "bg-primary-foreground/15 border-primary-foreground/30"
                            : "bg-blue-50 border-blue-100",
                        )}
                      >
                        A: {Number(p.priceA).toLocaleString()}
                      </span>
                    )}
                    {p.priceB !== null && (
                      <span
                        className={cn(
                          "px-1 rounded border italic",
                          idx === safeHighlight
                            ? "bg-primary-foreground/15 border-primary-foreground/30"
                            : "bg-indigo-50 border-indigo-100",
                        )}
                      >
                        B: {Number(p.priceB).toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
