import { useEffect, useState } from "react";
import { Eye, CheckCircle, Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberCell, ListNumberHeader } from "@/components/ui/list-table-number";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import type { Voucher } from "@/components/vouchers/VoucherManagement";
import {
  crHeaderClass,
  crValueClass,
  drHeaderClass,
  drValueClass,
} from "@/utils/accountingColors";

interface VoucherViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId?: string | null;
  voucherNumber?: string | null;
}

const formatDisplayDate = (dateString?: string | null): string => {
  if (!dateString) return "-";
  try {
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
      const [year, month, day] = dateString.split("-");
      return `${day}/${month}/${year}`;
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateString)) return dateString;
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString('en-US');
  } catch {
    return dateString;
  }
};

const formatAmount = (amount: number): string =>
  amount.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getStatusBadge = (status: string) => {
  if (status === "posted") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600">
        <CheckCircle className="h-4 w-4" />
        Approved
      </span>
    );
  }
  if (status === "draft") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600">
        <Clock className="h-4 w-4" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Clock className="h-4 w-4" />
      {status || "-"}
    </span>
  );
};

const getAccountLabel = (entry: {
  account?: string;
  accountName?: string;
  Account?: { code?: string; name?: string } | null;
}) => {
  if (entry.Account?.code && entry.Account?.name) {
    return `${entry.Account.code} - ${entry.Account.name}`;
  }
  return entry.accountName || entry.account || "-";
};

export function VoucherViewDialog({
  open,
  onOpenChange,
  voucherId,
  voucherNumber,
}: VoucherViewDialogProps) {
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setVoucher(null);
      setError(null);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      setVoucher(null);
      try {
        let id = String(voucherId || "").trim();
        const number = String(voucherNumber || "").trim();

        if (!id && number && number !== "-") {
          const listRes = (await apiClient.getVouchers({
            search: number,
            search_by: "voucher-no",
            page: 1,
            limit: 20,
          })) as any;
          const rows = Array.isArray(listRes?.data)
            ? listRes.data
            : Array.isArray(listRes)
              ? listRes
              : [];
          const exact =
            rows.find(
              (row: any) =>
                String(row.voucherNumber || "").toLowerCase() ===
                number.toLowerCase(),
            ) || rows[0];
          id = String(exact?.id || "").trim();
        }

        if (!id) {
          setError("Voucher not found.");
          return;
        }

        const response = (await apiClient.getVoucher(id)) as any;
        const data = response?.data || response;
        if (!data?.id) {
          setError("Voucher not found.");
          return;
        }
        setVoucher(data as Voucher);
      } catch (err: any) {
        setError(err?.message || "Failed to load voucher.");
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [open, voucherId, voucherNumber]);

  const entries = voucher?.entries || voucher?.VoucherEntry || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            View Voucher {voucher?.voucherNumber || voucherNumber || ""}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading voucher...
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">{error}</p>
        ) : voucher ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground">Type</p>
                <p className="font-medium">
                  {String(voucher.type || "")
                    .charAt(0)
                    .toUpperCase() + String(voucher.type || "").slice(1)}{" "}
                  Voucher
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Date</p>
                <p className="font-medium">{formatDisplayDate(voucher.date)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium">{getStatusBadge(voucher.status)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Voucher No</p>
                <p className="font-medium">{voucher.voucherNumber}</p>
              </div>
              {voucher.chequeNumber ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Cheque No</p>
                  <p className="font-medium">{voucher.chequeNumber}</p>
                </div>
              ) : null}
              {voucher.chequeDate ? (
                <div className="space-y-1">
                  <p className="text-muted-foreground">Cheque Date</p>
                  <p className="font-medium">
                    {formatDisplayDate(voucher.chequeDate)}
                  </p>
                </div>
              ) : null}
            </div>

            {voucher.narration ? (
              <div className="space-y-1">
                <p className="text-muted-foreground text-sm">Narration</p>
                <p className="text-sm bg-muted/50 p-3 rounded-md">
                  {voucher.narration}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-muted-foreground text-sm font-medium">Entries</p>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <ListNumberHeader />
                    <TableHead>Account</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className={`text-right ${drHeaderClass}`}>Debit (Rs)</TableHead>
                    <TableHead className={`text-right ${crHeaderClass}`}>Credit (Rs)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry, idx) => (
                    <TableRow key={entry.id || idx}>
                      <ListNumberCell index={idx} total={entries.length} />
                      <TableCell>{getAccountLabel(entry)}</TableCell>
                      <TableCell>{entry.description || "-"}</TableCell>
                      <TableCell className={`text-right ${drValueClass(entry.debit)}`}>
                        {entry.debit > 0 ? formatAmount(entry.debit) : "-"}
                      </TableCell>
                      <TableCell className={`text-right ${crValueClass(entry.credit)}`}>
                        {entry.credit > 0 ? formatAmount(entry.credit) : "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="bg-muted/50 font-semibold">
                    <TableCell colSpan={3} className="text-right">
                      Total
                    </TableCell>
                    <TableCell className={`text-right ${drValueClass(1, true)}`}>
                      {formatAmount(voucher.totalDebit)}
                    </TableCell>
                    <TableCell className={`text-right ${crValueClass(1, true)}`}>
                      {formatAmount(voucher.totalCredit)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>

            <div className="flex justify-end pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
