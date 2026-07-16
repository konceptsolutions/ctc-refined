import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { printBackOrderSummary } from "@/utils/printBackOrderSummaryPdf";
import { FileBarChart2, Search } from "lucide-react";

type SummaryLine = {
  partId: string;
  partNo: string;
  masterPartNo: string;
  brand: string;
  description: string;
  orderQty: number;
  receivedQty: number;
  fromBackQty: number;
  backQty: number;
};

type ReportData = {
  supplier: { id: string; code?: string; name: string };
  fromDate: string;
  toDate: string;
  sections: {
    ISB: SummaryLine[];
    KHI: SummaryLine[];
  };
};

const formatQty = (value: number) => {
  const n = Number(value) || 0;
  return n > 0 ? String(n) : "-";
};

const SectionTable = ({
  title,
  rows,
}: {
  title: string;
  rows: SummaryLine[];
}) => {
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
      <h3 className="text-base font-semibold text-primary">{title} Report</h3>
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="border-b border-border">
              <th className="p-2 text-left font-medium w-10">#</th>
              <th className="p-2 text-left font-medium">Item</th>
              <th className="p-2 text-left font-medium">Brand</th>
              <th className="p-2 text-left font-medium">Description</th>
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
                  colSpan={8}
                  className="p-4 text-center text-muted-foreground"
                >
                  No back order items for {title}
                </td>
              </tr>
            ) : (
              rows.map((row, index) => (
                <tr
                  key={`${title}-${row.partId}`}
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
                <td className="p-2" colSpan={4}>
                  Totals
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

export const BackOrderSummaryTab = () => {
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
      const data = response?.data as ReportData | undefined;
      if (!data) {
        throw new Error("No report data returned.");
      }
      setReport(data);
      const totalRows =
        (data.sections?.ISB?.length || 0) + (data.sections?.KHI?.length || 0);
      toast({
        title: "Report generated",
        description:
          totalRows > 0
            ? `Found ${totalRows} back order item(s).`
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
        { title: "ISB", rows: report.sections?.ISB || [] },
        { title: "KHI", rows: report.sections?.KHI || [] },
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
                then KHI).
              </p>
            </div>
          </div>
          <PrintPdfButton
            onPrint={handlePrintPdf}
            disabled={!report || loading}
            label="PDF"
          />
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

          <SectionTable title="ISB" rows={report.sections?.ISB || []} />
          <SectionTable title="KHI" rows={report.sections?.KHI || []} />
        </div>
      ) : null}
    </div>
  );
};
