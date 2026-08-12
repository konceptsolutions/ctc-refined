import { useVirtualizer } from "@tanstack/react-virtual";
import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { formatPartIdentityFromUi } from "@/lib/part-identity";

export type InquiryDropdownPart = {
  id?: string;
  partNo: string;
  masterPart: string;
  brand: string;
  description: string;
  quantity?: number;
  reservedQty?: number;
};

export type InquiryPartDropdownListProps = {
  rowId: string;
  filteredParts: InquiryDropdownPart[];
  highlightIndex: number;
  selectedPartId?: string;
  emptyHint: string;
  getAvailableQty: (part: InquiryDropdownPart) => number;
  onHighlightIndex: (idx: number) => void;
  onPickPart: (part: InquiryDropdownPart) => void;
};

/**
 * Virtualized part picker for Sales Inquiry. Rendering every catalog row as a
 * DOM node blocked the main thread for seconds each time a new item dropdown opened.
 */
export function InquiryPartDropdownList({
  rowId,
  filteredParts,
  highlightIndex,
  selectedPartId,
  emptyHint,
  getAvailableQty,
  onHighlightIndex,
  onPickPart,
}: InquiryPartDropdownListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: filteredParts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 12,
    initialRect: { width: 460, height: 420 },
  });

  useLayoutEffect(() => {
    if (filteredParts.length === 0) return;
    const hi = Math.min(Math.max(highlightIndex, 0), filteredParts.length - 1);
    rowVirtualizer.scrollToIndex(hi, { align: "auto" });
  }, [highlightIndex, filteredParts.length, rowVirtualizer]);

  if (filteredParts.length === 0) {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground">{emptyHint}</div>
    );
  }

  const safeHighlight = Math.min(
    Math.max(highlightIndex, 0),
    filteredParts.length - 1,
  );

  return (
    <div
      ref={parentRef}
      className="h-[420px] w-full overflow-auto overscroll-contain"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((vi) => {
          const part = filteredParts[vi.index];
          if (!part) return null;
          const idx = vi.index;
          const availablePcs = getAvailableQty(part);
          const brandLabel =
            part.brand && part.brand !== "N/A" ? part.brand : "";
          const partIdentifiers = formatPartIdentityFromUi({
            partNo: part.partNo,
            masterPart: part.masterPart,
          });
          return (
            <button
              key={String(vi.key)}
              type="button"
              data-lookup-item-key={rowId}
              data-lookup-item-idx={idx}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${vi.size}px`,
                transform: `translateY(${vi.start}px)`,
              }}
              onMouseEnter={() => onHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPickPart(part);
              }}
              className={cn(
                "w-full text-left px-3 py-2.5 hover:bg-accent hover:text-accent-foreground transition-colors border-b border-border",
                idx === safeHighlight && "bg-accent text-accent-foreground",
                selectedPartId &&
                  selectedPartId === part.id &&
                  idx !== safeHighlight &&
                  "bg-muted",
              )}
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <div className="font-semibold text-sm truncate">
                  {partIdentifiers}
                </div>
                <span
                  className={cn(
                    "text-[11px] font-semibold px-2 py-0.5 rounded-full tabular-nums shrink-0",
                    availablePcs > 0
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-600",
                  )}
                >
                  {availablePcs} pcs
                </span>
              </div>
              <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {part.description || "No description available"}
              </div>
              {brandLabel ? (
                <div className="text-[11px] text-muted-foreground/80 mt-1">
                  {brandLabel}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
