import { useState, useMemo, useEffect } from "react";
import { ClipboardCheck, Search, Download, Plus, Check, Trash, AlertCircle, Printer, Save, RotateCcw, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PrintPdfButton } from "@/components/ui/PrintPdfButton";
import { printCurrentPage } from "@/utils/printUtils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getApiBaseUrl } from "@/lib/api";

interface VerificationItem {
  id: string;
  partNo: string;
  description: string;
  location: string;
  systemQty: number;
  physicalQty: number | null;
  variance: number | null;
  status: "Pending" | "Verified" | "Discrepancy";
  remarks: string;
}

interface VerificationSession {
  id: string;
  name: string;
  startDate: string;
  status: "Active" | "Completed" | "Cancelled";
  totalItems: number;
  verifiedItems: number;
  discrepancies: number;
}

const API_BASE_URL = getApiBaseUrl();

export const StockVerification = () => {
  const { toast } = useToast();
  
  // Session state
  const [activeSession, setActiveSession] = useState<VerificationSession | null>(null);
  const [showNewSessionDialog, setShowNewSessionDialog] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

  // Items state
  const [items, setItems] = useState<VerificationItem[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Load active session on mount
  useEffect(() => {
    loadActiveSession();
  }, []);

  const loadActiveSession = async () => {
    try {
      setLoadingSession(true);
      const response = await fetch(`${API_BASE_URL}/inventory/verifications/active`);
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setActiveSession({
            id: data.id,
            name: data.name,
            startDate: new Date(data.startDate).toISOString().split("T")[0],
            status: data.status,
            totalItems: data.totalItems,
            verifiedItems: data.verifiedItems,
            discrepancies: data.discrepancies,
          });
          setItems(data.items || []);
        } else {
          setActiveSession(null);
          setItems([]);
        }
      } else {
        setActiveSession(null);
        setItems([]);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load active verification session",
        variant: "destructive",
      });
    } finally {
      setLoadingSession(false);
    }
  };

  // Get unique locations
  const locations = useMemo(() => {
    const locs = [...new Set(items.map((i) => i.location))];
    return locs.sort();
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === "all" || item.status === filterStatus;
      const matchesLocation = filterLocation === "all" || item.location === filterLocation;
      return matchesSearch && matchesStatus && matchesLocation;
    });
  }, [items, searchTerm, filterStatus, filterLocation]);

  // Pagination
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  // Stats
  const pendingCount = items.filter((i) => i.status === "Pending").length;
  const verifiedCount = items.filter((i) => i.status === "Verified").length;
  const discrepancyCount = items.filter((i) => i.status === "Discrepancy").length;

  // Handle count change
  const handleCountChange = async (id: string, value: string) => {
    if (!activeSession) return;
    
    const numValue = value === "" ? null : parseInt(value);
    
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const variance = numValue !== null ? numValue - item.systemQty : null;
          return {
            ...item,
            physicalQty: numValue,
            variance,
            status: numValue === null ? "Pending" : variance === 0 ? "Verified" : "Discrepancy",
          };
        }
        return item;
      })
    );

    // Update backend
    try {
      const response = await fetch(
        `${API_BASE_URL}/inventory/verifications/${activeSession.id}/items/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            physicalQty: numValue,
            remarks: items.find(i => i.id === id)?.remarks || '',
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update item');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update item count",
        variant: "destructive",
      });
      // Reload to get correct state
      loadActiveSession();
    }
  };

  // Handle remarks change
  const handleRemarksChange = async (id: string, value: string) => {
    if (!activeSession) return;
    
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, remarks: value } : item))
    );

    // Update backend
    try {
      const item = items.find(i => i.id === id);
      const response = await fetch(
        `${API_BASE_URL}/inventory/verifications/${activeSession.id}/items/${id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            physicalQty: item?.physicalQty ?? null,
            remarks: value,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to update remarks');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update remarks",
        variant: "destructive",
      });
    }
  };

  // Start new verification session
  const handleStartSession = async () => {
    if (!sessionName.trim()) return;
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/inventory/verifications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: sessionName,
          notes: sessionNotes || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create session');
      }

      const data = await response.json();
      
      // Reload the active session to get all items
      await loadActiveSession();
      
      setShowNewSessionDialog(false);
      setSessionName("");
      setSessionNotes("");
      
      toast({
        title: "Success",
        description: "Verification session started successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to start verification session",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Complete session
  const handleCompleteSession = async () => {
    if (!activeSession) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/inventory/verifications/${activeSession.id}/complete`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to complete session');
      }

      const data = await response.json();
      setActiveSession({
        ...activeSession,
        status: "Completed",
        verifiedItems: data.verifiedItems,
        discrepancies: data.discrepancies,
      });
      
      toast({
        title: "Success",
        description: "Verification session completed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to complete verification session",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Cancel session
  const handleCancelSession = async () => {
    if (!activeSession) return;
    
    try {
      setLoading(true);
      const response = await fetch(
        `${API_BASE_URL}/inventory/verifications/${activeSession.id}/cancel`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to cancel session');
      }

      setActiveSession(null);
      setItems([]);
      
      toast({
        title: "Success",
        description: "Verification session cancelled",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to cancel verification session",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Export functions
  const handleExportCSV = () => {
    const headers = ["Part No", "Description", "Location", "System Qty", "Physical Qty", "Variance", "Status", "Remarks"];
    const csvContent = [
      headers.join(","),
      ...filteredItems.map((item) =>
        [
          item.partNo,
          `"${item.description}"`,
          `"${item.location}"`,
          item.systemQty,
          item.physicalQty ?? "",
          item.variance ?? "",
          item.status,
          `"${item.remarks}"`,
        ].join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock-verification-${activeSession?.name || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPDF = () => {
    printCurrentPage();
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearchTerm("");
    setFilterStatus("all");
    setFilterLocation("all");
    setCurrentPage(1);
  };

  const statusColors = {
    Pending: "bg-blue-50 text-blue-600 border-blue-200",
    Verified: "bg-green-50 text-green-600 border-green-200",
    Discrepancy: "bg-red-50 text-red-600 border-red-200",
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Stock Verification Report</h2>
            <p className="text-sm text-muted-foreground">Verify physical stock against system records</p>
          </div>
        </div>
        <Button
          size="sm"
          className="gap-1.5 bg-primary hover:bg-primary/90"
          onClick={() => setShowNewSessionDialog(true)}
        >
          <Plus className="w-4 h-4" />
          Start New Verification
        </Button>
      </div>

      {/* Loading State */}
      {loadingSession && (
        <div className="bg-card border border-border rounded-lg p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-4" />
            <p className="text-sm text-muted-foreground">Loading verification session...</p>
          </div>
        </div>
      )}

      {/* No Active Session State */}
      {!loadingSession && !activeSession && (
        <div className="bg-card border border-border rounded-lg p-12">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-lg bg-muted flex items-center justify-center mb-4">
              <ClipboardCheck className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">No Active Verification Session</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Start a new verification session to count and verify your stock
            </p>
            <Button
              className="gap-1.5 bg-primary hover:bg-primary/90"
              onClick={() => setShowNewSessionDialog(true)}
            >
              <Plus className="w-4 h-4" />
              Start New Verification
            </Button>
          </div>
        </div>
      )}

      {/* Active Session Content */}
      {activeSession && (
        <>
          {/* Session Info & Actions */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-green-800">Active Session: {activeSession.name}</h3>
                  <p className="text-xs text-green-600">Started on {activeSession.startDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCSV} disabled={loading}>
                  <Download className="w-4 h-4" />
                  Export CSV
                </Button>
                <PrintPdfButton onPrint={handlePrintPDF} disabled={loading} label="Print" />
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 text-green-600 border-green-300 hover:bg-green-100" 
                  onClick={handleCompleteSession}
                  disabled={loading || activeSession?.status !== 'Active'}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Complete
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-1.5 text-red-600 border-red-300 hover:bg-red-50" 
                  onClick={handleCancelSession}
                  disabled={loading || activeSession?.status !== 'Active'}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash className="w-4 h-4" />}
                  Cancel
                </Button>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ClipboardCheck className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-xl font-semibold text-foreground">{items.length}</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-xl font-semibold text-blue-600">{pendingCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Check className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Verified</p>
                  <p className="text-xl font-semibold text-green-600">{verifiedCount}</p>
                </div>
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Trash className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Discrepancies</p>
                  <p className="text-xl font-semibold text-red-600">{discrepancyCount}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col lg:flex-row items-start lg:items-center gap-3">
            <div className="relative flex-1 w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                placeholder="Search parts..."
                className="pl-9 h-9"
              />
            </div>
            <SearchableSelect
              options={[
                { value: "all", label: "All Status" },
                { value: "Pending", label: "Pending" },
                { value: "Verified", label: "Verified" },
                { value: "Discrepancy", label: "Discrepancy" },
              ]}
              value={filterStatus}
              onValueChange={(v) => { setFilterStatus(v); setCurrentPage(1); }}
              placeholder="Status"
            />
            <SearchableSelect
              options={[{ value: "all", label: "All Locations" }, ...locations.map(loc => ({ value: loc, label: loc }))]}
              value={filterLocation}
              onValueChange={(v) => { setFilterLocation(v); setCurrentPage(1); }}
              placeholder="Location"
            />
            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleResetFilters}>
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>

          {/* Table */}
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <ListNumberHeader />
                    <TableHead className="text-xs font-medium w-20">PART NO</TableHead>
                    <TableHead className="text-xs font-medium">DESCRIPTION</TableHead>
                    <TableHead className="text-xs font-medium">LOCATION</TableHead>
                    <TableHead className="text-xs font-medium text-right w-24">SYSTEM QTY</TableHead>
                    <TableHead className="text-xs font-medium text-center w-28">COUNT</TableHead>
                    <TableHead className="text-xs font-medium text-center w-20">VARIANCE</TableHead>
                    <TableHead className="text-xs font-medium text-center w-24">STATUS</TableHead>
                    <TableHead className="text-xs font-medium w-40">REMARKS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedItems.map((item, index) => (
                    <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                      <ListNumberCell index={index} page={currentPage} pageSize={itemsPerPage} />
                      <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.description}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.location}</TableCell>
                      <TableCell className="text-sm font-medium text-foreground text-right">{item.systemQty}</TableCell>
                      <TableCell className="text-center">
                        <Input
                          type="number"
                          placeholder="Count"
                          value={item.physicalQty ?? ""}
                          onChange={(e) => handleCountChange(item.id, e.target.value)}
                          className="h-8 w-24 text-center mx-auto"
                        />
                      </TableCell>
                      <TableCell className={cn(
                        "text-sm font-medium text-center",
                        item.variance === null
                          ? "text-muted-foreground"
                          : item.variance === 0
                          ? "text-green-600"
                          : item.variance > 0
                          ? "text-blue-600"
                          : "text-red-600"
                      )}>
                        {item.variance === null ? "-" : item.variance > 0 ? `+${item.variance}` : item.variance}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className={cn("text-xs", statusColors[item.status])}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Remarks"
                          value={item.remarks}
                          onChange={(e) => handleRemarksChange(item.id, e.target.value)}
                          className="h-8"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {paginatedItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                        No items found matching your criteria
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="p-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredItems.length)} of {filteredItems.length} items
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <span className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded">
                  {currentPage} / {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Last
                </Button>
                <Select value={String(itemsPerPage)} onValueChange={(v) => { setItemsPerPage(Number(v)); setCurrentPage(1); }}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </>
      )}

      {/* New Session Dialog */}
      <Dialog open={showNewSessionDialog} onOpenChange={setShowNewSessionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Start New Verification Session</DialogTitle>
            <DialogDescription>
              Create a new stock verification session to begin counting and verifying your inventory.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="sessionName">Session Name</Label>
              <Input
                id="sessionName"
                placeholder="e.g., Monthly Stock Count - January 2025"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sessionNotes">Notes (Optional)</Label>
              <Textarea
                id="sessionNotes"
                placeholder="Add any notes for this verification session..."
                value={sessionNotes}
                onChange={(e) => setSessionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewSessionDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartSession} disabled={!sessionName.trim() || loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Verification'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
