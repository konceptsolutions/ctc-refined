import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { apiClient } from "@/lib/api";
import { formatUiDate } from "@/utils/dateUtils";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Search,
    Eye,
    Trash,
    X,
    RotateCcw,
    Check,
    Ban,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { usePageActions } from "@/permissions/pageActions";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DPOReturnItem {
    id: string;
    partId: string;
    partNo: string;
    description: string;
    brand: string;
    returnQuantity: number;
    originalPurchasePrice: number;
    amount: number;
    availableToReturn?: number;
}

interface DPOReturn {
    id: string;
    returnNumber: string;
    directPurchaseOrderId: string;
    dpoNumber: string;
    supplierName: string;
    returnDate: string;
    reason: string;
    totalAmount: number;
    status: "pending" | "approved" | "completed" | "rejected";
    items: DPOReturnItem[];
}

type ViewMode = "list" | "create";

export const DPOReturn = () => {
    const { canApprove, canStatus, canDelete } = usePageActions(
        "inventory.dpo-return",
    );
    // Returns state
    const [returns, setReturns] = useState<DPOReturn[]>([]);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [loading, setLoading] = useState(false);
    const [totalRecords, setTotalRecords] = useState(0);

    // View mode state
    const [selectedReturn, setSelectedReturn] = useState<DPOReturn | null>(null);

    // View dialogs state
    const [showViewDialog, setShowViewDialog] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [returnToDelete, setReturnToDelete] = useState<string | null>(null);
    const [approveDialogOpen, setApproveDialogOpen] = useState(false);
    const [returnToApprove, setReturnToApprove] = useState<string | null>(null);
    const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
    const [returnToReject, setReturnToReject] = useState<string | null>(null);
    const [rejectionReason, setRejectionReason] = useState("");

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(25);

    // Fetch returns
    const fetchReturns = async () => {
        try {
            setLoading(true);
            const response = await apiClient.getDpoReturns({
                status: statusFilter !== "all" ? statusFilter : undefined,
                page: currentPage,
                limit: itemsPerPage,
            }) as any;

            if (response.error) {
                toast.error(response.error);
                return;
            }

            const data = response.data || [];
            const pagination = response.pagination || { total: 0 };

            setReturns(data.map((r: any) => ({
                id: r.id,
                returnNumber: r.returnNumber,
                directPurchaseOrderId: r.directPurchaseOrderId,
                dpoNumber: r.DirectPurchaseOrder?.dpoNumber || "N/A",
                supplierName: r.DirectPurchaseOrder?.Supplier?.companyName || r.DirectPurchaseOrder?.Supplier?.name || "N/A",
                returnDate: formatUiDate(r.returnDate) || "-",
                reason: r.reason || "",
                totalAmount: r.totalAmount || 0,
                status: r.status,
                items: (r.DirectPurchaseOrderReturnItem || []).map((item: any) => ({
                    id: item.id,
                    partId: item.partId,
                    partNo: item.Part?.partNo || "N/A",
                    description: item.Part?.description || "",
                    brand: item.Part?.Brand?.name || "",
                    returnQuantity: item.returnQuantity,
                    originalPurchasePrice: item.originalPurchasePrice,
                    amount: item.amount,
                })),
            })));
            setTotalRecords(pagination.total || 0);
        } catch (error: any) {
            toast.error(`Error fetching returns: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReturns();
    }, [currentPage, itemsPerPage, statusFilter]);

    const handleApprove = async (id: string) => {
        try {
            setLoading(true);
            const response = await apiClient.approveDpoReturn(id) as any;
            if (response.error) {
                toast.error(response.error);
                return;
            }
            toast.success("DPO Return approved and completed. Inventory and accounting updated.");
            fetchReturns();
            setApproveDialogOpen(false);
        } catch (error: any) {
            toast.error(`Error approving return: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleReject = async (id: string) => {
        try {
            setLoading(true);
            const response = await apiClient.rejectDpoReturn(id, rejectionReason) as any;
            if (response.error) {
                toast.error(response.error);
                return;
            }
            toast.success("DPO Return rejected");
            fetchReturns();
            setRejectDialogOpen(false);
            setRejectionReason("");
        } catch (error: any) {
            toast.error(`Error rejecting return: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            setLoading(true);
            const response = await apiClient.deleteDpoReturn(id) as any;
            if (response.error) {
                toast.error(response.error);
                return;
            }
            toast.success("DPO Return deleted");
            fetchReturns();
            setDeleteDialogOpen(false);
        } catch (error: any) {
            toast.error(`Error deleting return: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };


    const getStatusBadge = (status: string) => {
        switch (status) {
            case "pending": return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
            case "approved": return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Approved</Badge>;
            case "completed": return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Completed</Badge>;
            case "rejected": return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">DPO Returns</h2>
                    <p className="text-muted-foreground">Manage and track items returned to suppliers from Local Purchase Orders</p>
                </div>
            </div>

            <Card className="border-none shadow-premium bg-card/50 backdrop-blur-sm overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search returns or DPOs..."
                                className="pl-9 bg-background/50 border-muted focus-visible:ring-primary"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[150px] bg-background/50 border-muted">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="pending">Pending</SelectItem>
                                <SelectItem value="approved">Approved</SelectItem>
                                <SelectItem value="completed">Completed</SelectItem>
                                <SelectItem value="rejected">Rejected</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="text-sm text-muted-foreground">
                        Total {totalRecords} Records
                    </div>
                </div>

                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <ListNumberHeader />
                            <TableHead className="w-[150px]">Return No.</TableHead>
                            <TableHead className="w-[150px]">DPO No.</TableHead>
                            <TableHead>Supplier</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <RotateCcw className="w-8 h-8 animate-spin opacity-20" />
                                        <span>Loading returns...</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : returns.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={8} className="h-48 text-center text-muted-foreground">
                                    <div className="flex flex-col items-center justify-center gap-2">
                                        <Search className="w-12 h-12 opacity-10" />
                                        <p>No returns found</p>
                                    </div>
                                </TableCell>
                            </TableRow>
                        ) : (
                            returns.map((ret, index) => (
                                <TableRow key={ret.id} className="group hover:bg-muted/30 transition-colors">
                                    <ListNumberCell index={index} page={currentPage} pageSize={itemsPerPage} total={totalRecords} />
                                    <TableCell className="font-mono font-medium">{ret.returnNumber}</TableCell>
                                    <TableCell>{ret.dpoNumber}</TableCell>
                                    <TableCell className="max-w-[200px] truncate">{ret.supplierName}</TableCell>
                                    <TableCell>{ret.returnDate}</TableCell>
                                    <TableCell className="text-right font-semibold">Rs. {ret.totalAmount.toLocaleString()}</TableCell>
                                    <TableCell>{getStatusBadge(ret.status)}</TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <ActionButtonTooltip label="View Details">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8"
                                                    onClick={() => {
                                                        setSelectedReturn(ret);
                                                        setShowViewDialog(true);
                                                    }}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                            </ActionButtonTooltip>

                                            {ret.status === "pending" && (
                                                <>
                                                    {canApprove && (
                                                        <ActionButtonTooltip label="Approve">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 bg-green-50 text-green-600 hover:bg-green-100 hover:text-green-700"
                                                                onClick={() => {
                                                                    setReturnToApprove(ret.id);
                                                                    setApproveDialogOpen(true);
                                                                }}
                                                            >
                                                                <Check className="w-4 h-4" />
                                                            </Button>
                                                        </ActionButtonTooltip>
                                                    )}

                                                    {canStatus && (
                                                        <ActionButtonTooltip label="Reject">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                                                                onClick={() => {
                                                                    setReturnToReject(ret.id);
                                                                    setRejectDialogOpen(true);
                                                                }}
                                                            >
                                                                <Ban className="w-4 h-4" />
                                                            </Button>
                                                        </ActionButtonTooltip>
                                                    )}

                                                    {canDelete && (
                                                        <ActionButtonTooltip label="Delete">
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                className="h-8 w-8 bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-600"
                                                                onClick={() => {
                                                                    setReturnToDelete(ret.id);
                                                                    setDeleteDialogOpen(true);
                                                                }}
                                                            >
                                                                <Trash className="w-4 h-4" />
                                                            </Button>
                                                        </ActionButtonTooltip>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </Card>

            {/* View Details Dialog */}
            <Dialog open={showViewDialog} onOpenChange={setShowViewDialog}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0 border-none shadow-premium">
                    {selectedReturn && (
                        <>
                            <DialogHeader className="p-6 bg-muted/30 border-b border-border">
                                <div className="flex items-center justify-between pr-8">
                                    <div>
                                        <div className="flex items-center gap-3">
                                            <DialogTitle className="text-2xl font-bold tracking-tight">{selectedReturn.returnNumber}</DialogTitle>
                                            {getStatusBadge(selectedReturn.status)}
                                        </div>
                                        <DialogDescription className="mt-1">
                                            Return for DPO: <span className="text-foreground font-medium">{selectedReturn.dpoNumber}</span>
                                        </DialogDescription>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm text-muted-foreground">Return Date</div>
                                        <div className="font-medium">{selectedReturn.returnDate}</div>
                                    </div>
                                </div>
                            </DialogHeader>

                            <ScrollArea className="flex-1 p-6">
                                <div className="grid grid-cols-2 gap-8 mb-8">
                                    <div className="space-y-4">
                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Supplier</h4>
                                            <p className="font-medium text-lg">{selectedReturn.supplierName}</p>
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reason</h4>
                                            <p className="text-sm bg-muted/30 p-3 rounded-lg border border-border italic whitespace-pre-wrap">
                                                {selectedReturn.reason || "No reason provided"}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="space-y-4 text-right">
                                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/10">
                                            <h4 className="text-xs font-semibold uppercase tracking-wider text-primary mb-1">Total Return Amount</h4>
                                            <p className="text-3xl font-bold text-primary">Rs. {selectedReturn.totalAmount.toLocaleString()}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-sm font-semibold tracking-tight">Returned Items</h4>
                                    <div className="border rounded-xl overflow-hidden">
                                        <Table>
                                            <TableHeader className="bg-muted/50">
                                                <TableRow>
                                                    <TableHead>Part Details</TableHead>
                                                    <TableHead className="text-center">Qty</TableHead>
                                                    <TableHead className="text-right">Price</TableHead>
                                                    <TableHead className="text-right">Amount</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {selectedReturn.items.map((item) => (
                                                    <TableRow key={item.id}>
                                                        <TableCell>
                                                            <div className="font-medium">{item.partNo}</div>
                                                            <div className="text-xs text-muted-foreground">{item.brand} - {item.description}</div>
                                                        </TableCell>
                                                        <TableCell className="text-center font-medium">{item.returnQuantity}</TableCell>
                                                        <TableCell className="text-right">Rs. {item.originalPurchasePrice.toLocaleString()}</TableCell>
                                                        <TableCell className="text-right font-semibold">Rs. {item.amount.toLocaleString()}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </div>
                            </ScrollArea>

                            {selectedReturn.status === "pending" && (canApprove || canStatus) && (
                                <DialogFooter className="p-4 bg-muted/30 border-t border-border gap-2">
                                    {canStatus && (
                                        <Button variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => {
                                            setReturnToReject(selectedReturn.id);
                                            setRejectDialogOpen(true);
                                        }}>
                                            Reject Return
                                        </Button>
                                    )}
                                    {canApprove && (
                                        <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                                            setReturnToApprove(selectedReturn.id);
                                            setApproveDialogOpen(true);
                                        }}>
                                            Approve & Complete
                                        </Button>
                                    )}
                                </DialogFooter>
                            )}
                        </>
                    )}
                </DialogContent>
            </Dialog>

            {/* Approval Confirmation */}
            <AlertDialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
                <AlertDialogContent className="shadow-premium border-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold">Approve DPO Return?</AlertDialogTitle>
                        <AlertDialogDescription className="text-base">
                            Approving this return will:
                            <ul className="list-disc list-inside mt-2 space-y-1">
                                <li>Release items back to inventory (OUT movement)</li>
                                <li>Create an accounting reversal entry (JV)</li>
                                <li>Update supplier balance</li>
                            </ul>
                            <p className="mt-4 font-semibold text-primary">This action cannot be undone.</p>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => returnToApprove && handleApprove(returnToApprove)}
                            disabled={loading}
                        >
                            {loading ? "Approving..." : "Confirm Approval"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Rejection Dialog */}
            <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
                <DialogContent className="shadow-premium border-none">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Reject DPO Return</DialogTitle>
                        <DialogDescription>
                            Please provide a reason for rejecting this return.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <Label>Rejection Reason</Label>
                        <Textarea
                            placeholder="Enter reason for rejection..."
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            className="mt-2"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={loading}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={() => returnToReject && handleReject(returnToReject)}
                            disabled={loading || !rejectionReason.trim()}
                        >
                            {loading ? "Rejecting..." : "Reject Return"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent className="shadow-premium border-none">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-xl font-bold text-red-600">Delete DPO Return?</AlertDialogTitle>
                        <AlertDialogDescription className="text-base text-foreground/80">
                            Are you sure you want to delete this pending return? All entered data will be permanently removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-red-600 hover:bg-red-700"
                            onClick={() => returnToDelete && handleDelete(returnToDelete)}
                            disabled={loading}
                        >
                            {loading ? "Deleting..." : "Delete Permanently"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
