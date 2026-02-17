import { useState, useMemo } from "react";
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

export interface Part {
  id: string;
  partNo: string;
  brand: string;
  uom: string;
  weight: string;
  cost: number | null;
  purchasePrice: number | null;
  avgCost: number | null;
  price: number | null;
  stock: number;
  reservedStock?: number;
  masterPartNo?: string;
}

const initialParts: Part[] = [];

const ITEMS_PER_PAGE = 20;

interface PartsListProps {
  parts?: Part[];
  onSelectPart?: (part: Part) => void;
}

export const PartsList = ({
  parts = initialParts,
  onSelectPart,
}: PartsListProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredParts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return parts.filter((part) => {
      const mp = part.masterPartNo
        ? String(part.masterPartNo).toLowerCase()
        : "";
      return (
        part.partNo.toLowerCase().includes(query) ||
        mp.includes(query) ||
        part.brand.toLowerCase().includes(query)
      );
    });
  }, [parts, searchQuery]);

  const totalPages = Math.ceil(filteredParts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedParts = filteredParts.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE,
  );

  const formatCurrency = (value: number | null) => {
    if (value === null) return "-";
    return `Rs ${value.toFixed(2)}`;
  };

  return (
    <div className="bg-card rounded-lg border border-border flex flex-col h-full">
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-end">
          <Input
            placeholder="Search parts..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-36 h-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="font-bold text-foreground text-xs py-2">
                Part No
              </TableHead>
              <TableHead className="font-bold text-foreground text-xs py-2">
                Brand
              </TableHead>
              <TableHead className="font-bold text-foreground text-xs py-2">
                UOM
              </TableHead>
              <TableHead className="font-bold text-foreground text-xs py-2">
                Weight
              </TableHead>
              {/* <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                Cost
              </TableHead>
              <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                Price
              </TableHead> */}
              <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                Reserve Stock
              </TableHead>
              <TableHead className="font-bold text-foreground text-xs py-2 text-right">
                Stock
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedParts.map((part) => (
              <TableRow
                key={part.id}
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => onSelectPart?.(part)}
              >
                <TableCell className="font-medium text-foreground text-xs py-1.5">
                  {part.partNo}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs py-1.5">
                  {part.brand}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs py-1.5">
                  {part.uom}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs py-1.5">
                  {part.weight}
                </TableCell>
                {/* <TableCell className="text-right text-primary font-medium text-xs py-1.5">
                  {formatCurrency(part.cost)}
                </TableCell>
                <TableCell className="text-right text-primary font-medium text-xs py-1.5">
                  {formatCurrency(part.price)}
                </TableCell> */}
                <TableCell className="text-right text-foreground text-xs py-1.5 font-bold text-orange-600">
                  {part.reservedStock || 0}
                </TableCell>
                <TableCell className="text-right text-foreground text-xs py-1.5 font-bold">
                  {part.stock}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      <div className="p-2 border-t border-border flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Showing {startIndex + 1} to{" "}
          {Math.min(startIndex + ITEMS_PER_PAGE, filteredParts.length)} of{" "}
          {filteredParts.length} parts
        </span>
        <div className="flex gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => prev - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            disabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
