import { TableCell, TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const LIST_NUMBER_HEAD_CLASS =
  "w-12 min-w-[3rem] text-center text-xs font-medium whitespace-nowrap";
export const LIST_NUMBER_CELL_CLASS =
  "text-center text-xs text-muted-foreground tabular-nums whitespace-nowrap";

export function getListRowNumber(
  index: number,
  page = 1,
  pageSize?: number,
): number {
  const safePage = Math.max(1, Number(page) || 1);
  if (!pageSize || pageSize <= 0) return index + 1;
  return (safePage - 1) * pageSize + index + 1;
}

export function ListNumberHeader({
  label = "#",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <TableHead className={cn(LIST_NUMBER_HEAD_CLASS, className)}>{label}</TableHead>
  );
}

export function ListNumberCell({
  index,
  page = 1,
  pageSize,
  className,
}: {
  index: number;
  page?: number;
  pageSize?: number;
  className?: string;
}) {
  return (
    <TableCell className={cn(LIST_NUMBER_CELL_CLASS, className)}>
      {getListRowNumber(index, page, pageSize)}
    </TableCell>
  );
}
