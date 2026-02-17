import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BookOpen, ArrowUpDown, Search, Calendar, Filter, Download, Printer } from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

interface JournalEntry {
  id: number;
  tId: number;
  VoucherNo: string;
  date: string;
  account: string;
  description: string;
  debit: number;
  credit: number;
}

export const GeneralJournalTab = () => {
  const { toast } = useToast();
  const [searchType, setSearchType] = useState("voucher");
  const [searchValue, setSearchValue] = useState("");
  // Set default date range to current month
  const getDefaultFromDate = () => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString().split('T')[0];
  };
  const getDefaultToDate = () => {
    return new Date().toISOString().split('T')[0];
  };
  const [fromDate, setFromDate] = useState(getDefaultFromDate());
  const [toDate, setToDate] = useState(getDefaultToDate());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [sortField, setSortField] = useState<keyof JournalEntry | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalEntries, setTotalEntries] = useState(0);
  const [loading, setLoading] = useState(false);

  const formatNumber = (num: number) => {
    return num.toLocaleString('en-PK');
  };

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getGeneralJournal({
        search_by: searchType,
        search: searchValue || undefined,
        from_date: fromDate,
        to_date: toDate,
        page,
        limit
      });

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive"
        });
        return;
      }

      if (response.data) {
        setEntries(response.data as JournalEntry[]);
        setTotalEntries(response.pagination?.total || 0);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch journal entries",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, [page, limit, fromDate, toDate]);

  const handleSearch = () => {
    setPage(1);
    fetchEntries();
  };

  const handleSort = (field: keyof JournalEntry) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }

    // Sort entries
    const sorted = [...entries].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
    setEntries(sorted);
  };

  const handleExportCSV = () => {
    const headers = ["T_Id", "Voucher No", "Date", "Account", "Description", "Debit", "Credit"];
    const csvContent = [
      headers.join(","),
      ...entries.map(entry => [
        entry.tId,
        entry.VoucherNo,
        entry.date,
        entry.account,
        `"${entry.description.replace(/"/g, '""')}"`,
        entry.debit,
        entry.credit
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `general_journal_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Export Complete",
      description: "General Journal exported to CSV successfully."
    });
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({
        title: "Error",
        description: "Please allow popups to print the report",
        variant: "destructive"
      });
      return;
    }

    const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);

    printWindow.document.write(`
      <html>
        <head>
          <title>General Journal</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            .text-right { text-align: right; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
          </style>
        </head>
        <body>
          <h1>General Journal</h1>
          <p>Period: ${fromDate} to ${toDate}</p>
          <table>
            <thead>
              <tr>
                <th>T_Id</th>
                <th>Voucher No</th>
                <th>Date</th>
                <th>Account</th>
                <th>Description</th>
                <th class="text-right">Debit</th>
                <th class="text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${entries.map(entry => `
                <tr>
                  <td>${entry.tId}</td>
                  <td>${entry.VoucherNo}</td>
                  <td>${entry.date}</td>
                  <td>${entry.account}</td>
                  <td>${entry.description}</td>
                  <td class="text-right">${formatNumber(entry.debit)}</td>
                  <td class="text-right">${formatNumber(entry.credit)}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="5" class="text-right">Total</td>
                <td class="text-right">${formatNumber(totalDebit)}</td>
                <td class="text-right">${formatNumber(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const totalDebit = entries.reduce((sum, entry) => sum + entry.debit, 0);
  const totalCredit = entries.reduce((sum, entry) => sum + entry.credit, 0);

  const SortableHeader = ({ field, children }: { field: keyof JournalEntry; children: React.ReactNode }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 font-semibold text-primary hover:text-primary/80 transition-colors border-b-2 border-primary/30 hover:border-primary pb-1"
    >
      {children}
      <ArrowUpDown className="h-3 w-3 opacity-50" />
    </button>
  );

  return (
    <Card className="shadow-lg border-0 bg-card">
      <CardHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-3 text-xl font-bold">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            General Journal
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" />
              Print
            </Button>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="px-3 py-1 bg-muted rounded-full">
                {totalEntries} entries
              </span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Enhanced Filters */}
        <div className="bg-muted/30 p-4 rounded-xl space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-2">
            <Filter className="h-4 w-4" />
            Filters
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search By</Label>
              <Select value={searchType} onValueChange={setSearchType}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue placeholder="Search by" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="voucher">Voucher No</SelectItem>
                  <SelectItem value="account">Account</SelectItem>
                  <SelectItem value="description">Description</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px] space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  placeholder="Search entries..."
                  className="pl-10 bg-background"
                />
              </div>
            </div>
            <Button className="gap-2" onClick={handleSearch} disabled={loading}>
              <Search className="h-4 w-4" />
              Search
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-4 pt-2 border-t border-border/30">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Date Range
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">From</Label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44 bg-background"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">To</Label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44 bg-background"
              />
            </div>
          </div>
        </div>

        {/* Enhanced Table */}
        <div className="border border-border/50 rounded-xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-20">
                  <SortableHeader field="tId">T_Id</SortableHeader>
                </TableHead>
                <TableHead className="w-28">
                  <SortableHeader field="VoucherNo">Voucher No</SortableHeader>
                </TableHead>
                <TableHead className="w-28">
                  <SortableHeader field="date">Date</SortableHeader>
                </TableHead>
                <TableHead className="w-48">
                  <SortableHeader field="account">Account</SortableHeader>
                </TableHead>
                <TableHead>
                  <SortableHeader field="description">Description</SortableHeader>
                </TableHead>
                <TableHead className="w-32 text-right">
                  <SortableHeader field="debit">Debit</SortableHeader>
                </TableHead>
                <TableHead className="w-32 text-right">
                  <SortableHeader field="credit">Credit</SortableHeader>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : entries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No entries found
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry, index) => (
                <TableRow 
                  key={entry.id} 
                  className={`
                    transition-colors hover:bg-muted/40
                    ${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'}
                  `}
                >
                  <TableCell className="font-medium text-foreground">{entry.tId}</TableCell>
                  <TableCell>
                    <span className="px-2 py-1 bg-primary/10 text-primary rounded-md text-sm font-medium">
                      {entry.VoucherNo}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{entry.date}</TableCell>
                  <TableCell className="font-medium text-foreground">{entry.account}</TableCell>
                  <TableCell className="max-w-md text-muted-foreground">
                    <span className="line-clamp-2">{entry.description}</span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    <span className={entry.debit > 0 ? "text-orange-500" : "text-muted-foreground/50"}>
                      {entry.debit > 0 ? formatNumber(entry.debit) : "0"}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    <span className={entry.credit > 0 ? "text-blue-500" : "text-muted-foreground/50"}>
                      {entry.credit > 0 ? formatNumber(entry.credit) : "0"}
                    </span>
                  </TableCell>
                </TableRow>
              )))}
              {/* Total Row */}
              <TableRow className="bg-muted/60 border-t-2 border-border font-bold hover:bg-muted/60">
                <TableCell colSpan={5} className="text-right text-base py-4">
                  Total
                </TableCell>
                <TableCell className="text-right font-mono text-base py-4">
                  <span className="text-orange-500">{formatNumber(totalDebit)}</span>
                </TableCell>
                <TableCell className="text-right font-mono text-base py-4">
                  <span className="text-blue-500">{formatNumber(totalCredit)}</span>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        {/* Enhanced Pagination */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            Showing <span className="font-medium text-foreground">{entries.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{" "}
            <span className="font-medium text-foreground">{Math.min(page * limit, totalEntries)}</span> of{" "}
            <span className="font-medium text-foreground">{totalEntries}</span> entries
          </span>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Rows per page:</span>
            <Select value={limit.toString()} onValueChange={(val) => {
              setLimit(parseInt(val));
              setPage(1);
            }}>
              <SelectTrigger className="w-20 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1 || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={page * limit >= totalEntries || loading}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};