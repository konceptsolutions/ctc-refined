import { useState, useMemo, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { cn } from "@/lib/utils";
import { filterPartsWithFamilyExpansion } from "@/lib/part-family-search";
import { Loader2 } from "lucide-react";

export interface Part {
  id: string;
  partNo: string;
  brand: string;
  type?: string;
  uom: string;
  weight: string;
  cost: number | null;
  purchasePrice: number | null;
  avgCost: number | null;
  price: number | null;
  priceA?: number | null;
  priceB?: number | null;
  stock: number;
  reservedStock?: number;
  masterPartNo?: string;
  modelTotalQty?: number;
}

const initialParts: Part[] = [];

const DEFAULT_ITEMS_PER_PAGE = 20;

interface PartsListProps {
  parts?: Part[];
  onSelectPart?: (part: Part) => void;
  selectedPartId?: string | null;
  loading?: boolean;
  /** When set, pagination/search are server-driven (parts = current page). */
  totalCount?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export const PartsList = ({
  parts = initialParts,
  onSelectPart,
  selectedPartId = null,
  loading = false,
  totalCount,
  page,
  pageSize = DEFAULT_ITEMS_PER_PAGE,
  onPageChange,
  searchQuery: controlledSearch,
  onSearchChange,
}: PartsListProps) => {
  const serverMode = typeof totalCount === "number";
  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [localPage, setLocalPage] = useState(1);

  const searchQuery = controlledSearch !== undefined ? controlledSearch : localSearchQuery;
  const currentPage = serverMode ? page || 1 : localPage;

  useEffect(() => {
    if (!serverMode) setLocalPage(1);
  }, [parts, serverMode]);

  const filteredParts = useMemo(() => {
    if (serverMode) return parts;
    return filterPartsWithFamilyExpansion(
      parts.map((part) => ({
        ...part,
        master_part_no: part.masterPartNo,
        part_no: part.partNo,
      })),
      searchQuery,
    );
  }, [parts, searchQuery, serverMode]);

  const effectiveTotal = serverMode ? totalCount : filteredParts.length;
  const totalPages = Math.max(1, Math.ceil(effectiveTotal / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedParts = serverMode
    ? parts
    : filteredParts.slice(startIndex, startIndex + pageSize);

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return `Rs ${value.toFixed(2)}`;
  };

  const setPage = (next: number) => {
    if (serverMode) onPageChange?.(next);
    else setLocalPage(next);
  };

  const handleSearchChange = (value: string) => {
    if (onSearchChange) onSearchChange(value);
    else {
      setLocalSearchQuery(value);
      setLocalPage(1);
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-end">
          <Input
            placeholder="Search parts..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-36 h-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {loading && parts.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading parts...
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <ListNumberHeader />
                <TableHead className="font-bold text-foreground text-xs py-2">
                  Part No
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2">
                  Brand
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2">
                  UOM
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                  Price A
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                  Price B
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2">
                  Weight
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                  Reserve Stock
                </TableHead>
                <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                  Stock
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedParts.map((part, index) => {
                const isSelected = selectedPartId === part.id;
                return (
                  <TableRow
                    key={part.id}
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected
                        ? "bg-primary/10 hover:bg-primary/15 border-l-2 border-l-primary"
                        : "hover:bg-muted/50",
                    )}
                    onClick={() => onSelectPart?.(part)}
                  >
                    <ListNumberCell
                      index={index}
                      page={currentPage}
                      pageSize={pageSize}
                      total={effectiveTotal}
                    />
                    <TableCell
                      className={cn(
                        "font-medium text-xs py-1.5 part-code-font font-mono",
                        isSelected ? "text-primary" : "text-foreground",
                      )}
                    >
                      {part.partNo}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs py-1.5">
                      {part.brand}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs py-1.5">
                      {part.uom}
                    </TableCell>
                    <TableCell className="text-right text-foreground text-xs py-1.5">
                      {formatCurrency(part.priceA ?? null)}
                    </TableCell>
                    <TableCell className="text-right text-foreground text-xs py-1.5">
                      {formatCurrency(part.priceB ?? null)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs py-1.5">
                      {part.weight}
                    </TableCell>
                    <TableCell className="text-right text-foreground text-xs py-1.5 font-bold text-primary">
                      {part.reservedStock || 0}
                    </TableCell>
                    <TableCell className="text-right text-foreground text-xs py-1.5 font-bold">
                      {part.stock}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!loading && paginatedParts.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-xs text-muted-foreground py-8"
                  >
                    No parts found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </ScrollArea>

      <div className="p-2 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {loading && parts.length > 0 ? "Updating… " : ""}
          Showing {effectiveTotal === 0 ? 0 : startIndex + 1} to{" "}
          {Math.min(startIndex + pageSize, effectiveTotal)} of {effectiveTotal}{" "}
          parts
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            disabled={currentPage === 1 || loading}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            disabled={currentPage >= totalPages || loading}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
