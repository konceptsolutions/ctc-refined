import type { ComponentProps } from "react";
import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const LIST_NUMBER_HEAD_CLASS =
  "w-12 min-w-[3rem] text-center text-xs font-medium whitespace-nowrap";
export const LIST_NUMBER_CELL_CLASS =
  "text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap";

/**
 * Descending list/serial number (highest first).
 * Pass `total` for correct numbering across pages.
 * Example: total=100, page=1, pageSize=50, index=0 → 100
 */
export function getListRowNumber(
  index: number,
  page = 1,
  pageSize?: number,
  total?: number,
): number {
  const safePage = Math.max(1, Number(page) || 1);
  const size = pageSize && pageSize > 0 ? Number(pageSize) : 0;
  const positionFromStart = (size > 0 ? (safePage - 1) * size : 0) + index + 1;

  const effectiveTotal = Number(total);
  if (Number.isFinite(effectiveTotal) && effectiveTotal > 0) {
    return Math.max(1, effectiveTotal - positionFromStart + 1);
  }

  // No total provided: still show descending for the current slice using index only
  // when pageSize is the visible row count (non-paginated or single page).
  if (size > 0 && safePage === 1) {
    return Math.max(1, size - index);
  }

  return positionFromStart;
}

export function ListNumberHeader({
  label = "#",
  className,
  ...props
}: {
  label?: string;
  className?: string;
} & ComponentProps<typeof TableHead>) {
  return (
    <TableHead className={cn(LIST_NUMBER_HEAD_CLASS, className)} {...props}>
      {label}
    </TableHead>
  );
}

export function ListNumberCell({
  index,
  page = 1,
  pageSize,
  total,
  className,
}: {
  index: number;
  page?: number;
  pageSize?: number;
  /** Total records in the full list (needed for correct multi-page descending #). */
  total?: number;
  className?: string;
}) {
  return (
    <TableCell className={cn(LIST_NUMBER_CELL_CLASS, className)}>
      {getListRowNumber(index, page, pageSize, total)}
    </TableCell>
  );
}
