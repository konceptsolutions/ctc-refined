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
                "px-3 py-2 text-sm cursor-pointer border-b border-border transition-colors",
                idx === safeHighlight
                  ? "bg-accent text-accent-foreground"
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
                    ? `${p.masterPartNo} | ${p.partNo}`
                    : p.partNo}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums",
                      (p.availableQty ?? p.stockQty ?? 0) > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600",
                    )}
                  >
                    {p.availableQty ?? p.stockQty ?? 0} pcs
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                {p.description || "No description available"}
              </div>
              {p.category ? (
                <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                  {p.category}
                </div>
              ) : null}
              {p.application ? (
                <div className="text-[11px] text-muted-foreground/80 mt-0.5">
                  App: {p.application}
                </div>
              ) : null}
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                {p.brands && p.brands.length > 0 ? (
                  <div className="text-[10px] uppercase font-semibold text-black tracking-wider">
                    {p.brands.map((b) => b.name).join(", ")}
                  </div>
                ) : null}
                {(p.priceA !== null || p.priceB !== null) && (
                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-600">
                    {p.priceA !== null && (
                      <span className="bg-blue-50 px-1 rounded border border-blue-100 italic">
                        A: {Number(p.priceA).toLocaleString()}
                      </span>
                    )}
                    {p.priceB !== null && (
                      <span className="bg-indigo-50 px-1 rounded border border-indigo-100 italic">
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
