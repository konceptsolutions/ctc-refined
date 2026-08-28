import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { printBackOrderSummary } from "@/utils/printBackOrderSummaryPdf";
import { fcHeaderClass, fcValueClass } from "@/utils/accountingColors";
import { FileBarChart2, Search } from "lucide-react";
import { usePageActions } from "@/permissions/pageActions";

type SummaryLine = {
  partId: string;
  partNo: string;
  masterPartNo: string;
  brand: string;
  description: string;
  fcRate: number;
  orderQty: number;
  receivedQty: number;
  fromBackQty: number;
  backQty: number;
  poNumber?: string;
  poDate?: string | null;
};

type PoGroup = {
  poId: string;
  poNumber: string;
  poDate?: string | null;
  items: SummaryLine[];
};

type ReportData = {
  supplier: { id: string; code?: string; name: string };
  fromDate: string;
  toDate: string;
  sections: {
    ISB: PoGroup[];
    KHI: PoGroup[];
  };
};

const mapSummaryLine = (line: any, index: number): SummaryLine => ({
  partId: String(line?.partId || line?.part_id || `line-${index}`),
  partNo: line?.partNo || line?.part_no || "-",
  masterPartNo: line?.masterPartNo || line?.master_part_no || "-",
  brand: line?.brand || "-",
  description: line?.description || "-",
  fcRate: Number(line?.fcRate ?? line?.fc_rate ?? 0) || 0,
  orderQty: Number(line?.orderQty ?? line?.order_qty ?? line?.quantity ?? 0) || 0,
  receivedQty:
    Number(line?.receivedQty ?? line?.received_qty ?? 0) || 0,
  fromBackQty:
    Number(line?.fromBackQty ?? line?.from_back_qty ?? line?.additionalQty ?? 0) ||
    0,
  backQty: Number(line?.backQty ?? line?.back_qty ?? 0) || 0,
  poNumber: line?.poNumber || line?.po_number || undefined,
  poDate: line?.poDate ?? line?.po_date ?? null,
});

/** Normalize API section: prefer PO groups; fall back from flat item rows. */
const normalizePoGroups = (section: unknown): PoGroup[] => {
  if (!Array.isArray(section) || section.length === 0) return [];
  const first = section[0] as any;

  // Group shape: has items[] and is not itself a part line (no partNo at top level)
  const looksLikePoGroup =
    first &&
    typeof first === "object" &&
    Array.isArray(first.items) &&
    !first.partNo &&
    !first.part_no;

  if (looksLikePoGroup) {
    return section
      .map((group: any, index: number) => {
        const items = (Array.isArray(group.items) ? group.items : []).map(
          (line: any, lineIndex: number) => mapSummaryLine(line, lineIndex),
        );
        const poNumber =
          String(group.poNumber || group.po_number || "").trim() ||
          String(items[0]?.poNumber || "").trim() ||
          "-";
        const poDate =
          group.poDate ?? group.po_date ?? items[0]?.poDate ?? null;
        return {
          poId: String(group.poId || group.po_id || poNumber || `po-${index}`),
          poNumber,
          poDate,
          items,
        };
      })
      .filter((group) => group.items.length > 0);
  }

  // Flat item rows — group by poNumber when present, else one combined group
  const byPo = new Map<string, PoGroup>();
  section.forEach((line: any, index: number) => {
    const mapped = mapSummaryLine(line, index);
    const key = String(line?.poNumber || line?.po_number || line?.poId || "_all");
    if (!byPo.has(key)) {
      byPo.set(key, {
        poId: key === "_all" ? "all" : key,
        poNumber: String(
          line?.poNumber || line?.po_number || (key === "_all" ? "-" : key),
        ),
        poDate: line?.poDate ?? line?.po_date ?? null,
        items: [],
      });
    }
    byPo.get(key)!.items.push(mapped);
  });
  return Array.from(byPo.values()).filter((group) => group.items.length > 0);
};

const formatQty = (value: number) => {
  const n = Number(value) || 0;
  return n > 0 ? String(n) : "-";
};

const formatRate = (value: number) => {
  const n = Number(value) || 0;
  if (!Number.isFinite(n) || n <= 0) return "-";
  return n.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
};

const formatDisplayDate = (value?: string | null) => {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US');
};

const PoItemsTable = ({ group }: { group: PoGroup }) => {
  const rows = group.items || [];
  const totals = rows.reduce(
    (acc, row) => ({
      orderQty: acc.orderQty + (Number(row.orderQty) || 0),
      receivedQty: acc.receivedQty + (Number(row.receivedQty) || 0),
      fromBackQty: acc.fromBackQty + (Number(row.fromBackQty) || 0),
      backQty: acc.backQty + (Number(row.backQty) || 0),
    }),
    { orderQty: 0, receivedQty: 0, fromBackQty: 0, backQty: 0 },
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-semibold">PO: {group.poNumber || "-"}</span>
        <span className="text-muted-foreground">
          Date: {formatDisplayDate(group.poDate)}
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th className="p-2 text-left font-medium w-10">#</th>
              <th className="p-2 text-left font-medium">Item</th>
              <th className="p-2 text-left font-medium">Brand</th>
              <th className="p-2 text-left font-medium">Description</th>
              <th className={`p-2 text-right font-medium ${fcHeaderClass}`}>FC Rate</th>
              <th className="p-2 text-right font-medium">Order Qty</th>
              <th className="p-2 text-right font-medium">Received Qty</th>
              <th className="p-2 text-right font-medium">From Back Qty</th>
              <th className="p-2 text-right font-medium">Back Qty</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="p-4 text-center text-muted-foreground"
                >
                  No back order items
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${group.poId}-${row.partId}-${index}`}
                  className="border-b border-border last:border-0"
                >
                  <td className="p-2 text-muted-foreground">{index + 1}</td>
                  <td className="p-2">
                    <div className="font-medium">{row.partNo || "-"}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.masterPartNo || "-"}
                    </div>
                  </td>
                  <td className="p-2">{row.brand || "-"}</td>
                  <td className="p-2">{row.description || "-"}</td>
                  <td className={`p-2 text-right tabular-nums ${fcValueClass()}`}>
                    {formatRate(row.fcRate)}
                  </td>
                  <td className="p-2 text-right tabular-nums">{row.orderQty}</td>
                  <td className="p-2 text-right tabular-nums">
                    {row.receivedQty}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {formatQty(row.fromBackQty)}
                  </td>
                  <td className="p-2 text-right tabular-nums font-medium">
                    {formatQty(row.backQty)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td className="p-2" colSpan={5}>
                  PO Totals
                </td>
                <td className="p-2 text-right tabular-nums">{totals.orderQty}</td>
                <td className="p-2 text-right tabular-nums">
                  {totals.receivedQty}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatQty(totals.fromBackQty)}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {formatQty(totals.backQty)}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
};

const ConsigneeSection = ({
  title,
  groups,
}: {
  title: string;
  groups: PoGroup[];
}) => (
  <div className="space-y-4">
    <h3 className="text-base font-semibold text-primary">{title} Report</h3>
    {groups.length === 0 ? (
      <p className="text-sm text-muted-foreground rounded-md border border-border p-4">
        No back order items for {title}
      </p>
    ) : (
      groups.map((group) => <PoItemsTable key={group.poId} group={group} />)
    )}
  </div>
);

export const BackOrderSummaryTab = () => {
  const { canPrint } = usePageActions("purchase-import.back-order-summary");
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [supplierOptions, setSupplierOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    const loadSuppliers = async () => {
      try {
        const suppliersRes = await apiClient.getSuppliers({
          status: "active",
          page: 1,
          limit: 1000,
        });
        const suppliersData = ((suppliersRes as any)?.data || []).filter(
          (supplier: any) =>
            String(supplier?.type || "")
              .trim()
              .toLowerCase() === "international",
        );
        setSupplierOptions(
          suppliersData.map((supplier: any) => ({
            value: supplier.id,
            label:
              supplier.companyName ||
              supplier.name ||
              supplier.code ||
              "Unnamed Supplier",
          })),
        );
      } catch {
        setSupplierOptions([]);
      }
    };
    void loadSuppliers();
  }, []);

  const handleGenerate = async () => {
    if (!supplierId) {
      toast({
        title: "Supplier required",
        description: "Please select a supplier.",
        variant: "destructive",
      });
      return;
    }
    if (!fromDate || !toDate) {
      toast({
        title: "Date range required",
        description: "Please select both from and to dates.",
        variant: "destructive",
      });
      return;
    }
    if (fromDate > toDate) {
      toast({
        title: "Invalid date range",
        description: "From date cannot be after to date.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = (await apiClient.getBackOrderSummaryReport({
        supplierId,
        fromDate,
        toDate,
      })) as any;
      if (response?.error) {
        throw new Error(response.error);
      }
      const raw = response?.data as any;
      if (!raw) {
        throw new Error("No report data returned.");
      }
      const data: ReportData = {
        supplier: raw.supplier,
        fromDate: raw.fromDate,
        toDate: raw.toDate,
        sections: {
          ISB: normalizePoGroups(raw.sections?.ISB),
          KHI: normalizePoGroups(raw.sections?.KHI),
        },
      };
      setReport(data);
      const totalPos =
        (data.sections?.ISB?.length || 0) + (data.sections?.KHI?.length || 0);
      const totalRows =
        [...(data.sections?.ISB || []), ...(data.sections?.KHI || [])].reduce(
          (sum, group) => sum + (group.items?.length || 0),
          0,
        );
      toast({
        title: "Report generated",
        description:
          totalRows > 0
            ? `Found ${totalRows} item(s) across ${totalPos} purchase order(s).`
            : "No back order items found for the selected filters.",
      });
    } catch (error: any) {
      setReport(null);
      toast({
        title: "Failed to generate report",
        description: error?.message || "Could not load back order summary.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintPdf = () => {
    if (!report) {
      toast({
        title: "Generate report first",
        description: "Select filters and generate the report before printing.",
        variant: "destructive",
      });
      return;
    }
    const opened = printBackOrderSummary({
      supplierName: report.supplier?.name || "-",
      fromDate: report.fromDate,
      toDate: report.toDate,
      sections: [
        {
          title: "ISB",
          groups: (report.sections?.ISB || []).map((group) => ({
            poNumber: group.poNumber,
            poDate: group.poDate,
            items: group.items || [],
          })),
        },
        {
          title: "KHI",
          groups: (report.sections?.KHI || []).map((group) => ({
            poNumber: group.poNumber,
            poDate: group.poDate,
            items: group.items || [],
          })),
        },
      ],
    });
    if (!opened) {
      toast({
        title: "Popup blocked",
        description: "Allow popups to print the PDF.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-md bg-primary/10 p-2">
              <FileBarChart2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Back Order Summary Report</h2>
              <p className="text-sm text-muted-foreground">
                Select supplier and date range, then generate or print PDF (ISB
                then KHI, grouped by PO).
              </p>
            </div>
          </div>
          {canPrint && (
            <PrintPdfButton
              onPrint={handlePrintPdf}
              disabled={!report || loading}
              label="PDF"
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="space-y-2 md:col-span-2">
            <Label>Supplier</Label>
            <SearchableSelect
              options={supplierOptions}
              value={supplierId}
              onValueChange={setSupplierId}
              placeholder="Select international supplier..."
            />
          </div>
          <div className="space-y-2">
            <Label>From Date</Label>
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>To Date</Label>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => void handleGenerate()}
            disabled={loading}
            className="gap-2"
          >
            <Search className="h-4 w-4" />
            {loading ? "Generating..." : "Generate Report"}
          </Button>
        </div>
      </div>

      {report ? (
        <div className="space-y-6 rounded-lg border border-border bg-card p-4">
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
            <div>
              <span className="text-muted-foreground">Supplier: </span>
              <span className="font-medium">{report.supplier?.name || "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">From: </span>
              <span className="font-medium">{report.fromDate || "-"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">To: </span>
              <span className="font-medium">{report.toDate || "-"}</span>
            </div>
          </div>

          <ConsigneeSection title="ISB" groups={report.sections?.ISB || []} />
          <ConsigneeSection title="KHI" groups={report.sections?.KHI || []} />
        </div>
      ) : null}
    </div>
  );
};
