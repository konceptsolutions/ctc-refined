import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  FileText,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Search,
  Download,
  LogIn,
  Plus,
  Edit, 
  Trash2,
  Eye,
  Clock,
  Loader2,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";

interface ActivityLog {
  id: string;
  timestamp: string;
  user: string;
  userRole: string;
  action: string;
  actionType: "login" | "create" | "update" | "delete" | "export" | "approve" | "login_failed";
  module: string;
  description: string;
  ipAddress: string;
  status: "success" | "warning" | "error";
  details?: Record<string, string>;
}


const actionIcons: Record<string, React.ReactNode> = {
  login: <LogIn className="w-4 h-4" />,
  create: <Plus className="w-4 h-4" />,
  update: <Edit className="w-4 h-4" />,
  delete: <Trash2 className="w-4 h-4" />,
  export: <Download className="w-4 h-4" />,
  approve: <CheckCircle className="w-4 h-4" />,
  login_failed: <XCircle className="w-4 h-4" />,
};

const actionColors: Record<string, string> = {
  login: "bg-blue-100 text-blue-700",
  create: "bg-emerald-100 text-emerald-700",
  update: "bg-amber-100 text-amber-700",
  delete: "bg-red-100 text-red-700",
  export: "bg-purple-100 text-purple-700",
  approve: "bg-emerald-100 text-emerald-700",
  login_failed: "bg-red-100 text-red-700",
};

const statusColors: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  error: "bg-red-100 text-red-700 border-red-200",
};

const roleColors: Record<string, string> = {
  Admin: "bg-violet-100 text-violet-700",
  Manager: "bg-blue-100 text-blue-700",
  Staff: "bg-emerald-100 text-emerald-700",
  Accountant: "bg-orange-100 text-orange-700",
  Viewer: "bg-gray-100 text-gray-700",
};

export const ActivityLogsTab = () => {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    warning: 0,
    error: 0,
  });

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
      };
      if (searchQuery) params.search = searchQuery;
      if (moduleFilter !== "all") params.module = moduleFilter;
      if (actionFilter !== "all") params.actionType = actionFilter;

      const response = await apiClient.getActivityLogs(params);
      if (response.error) {
        toast.error(response.error);
      } else {
        setLogs(response.data || []);
        if (response.pagination) {
          setTotal(response.pagination.total);
        }
        // Update stats from backend if available
        if (response.stats) {
          setStats(response.stats);
        } else {
          // Fallback: calculate from current page if stats not available
          setStats({
            total: response.pagination?.total || 0,
            success: (response.data || []).filter((l: ActivityLog) => l.status === "success").length,
            warning: (response.data || []).filter((l: ActivityLog) => l.status === "warning").length,
            error: (response.data || []).filter((l: ActivityLog) => l.status === "error").length,
          });
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch activity logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, moduleFilter, actionFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchLogs();
      } else {
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Stats are now fetched from backend and stored in state

  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase();

  const handleExport = () => {
    const csvContent = [
      ["Timestamp", "User", "Action", "Module", "Description", "IP Address", "Status"],
      ...logs.map(log => [
        log.timestamp, log.user, log.action, log.module, log.description, log.ipAddress, log.status
      ])
    ].map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "activity_logs.csv";
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Total Activities</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <FileText className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Successful</p>
              <p className="text-2xl font-bold">{stats.success}</p>
            </div>
            <CheckCircle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Warnings</p>
              <p className="text-2xl font-bold">{stats.warning}</p>
            </div>
            <AlertTriangle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Errors</p>
              <p className="text-2xl font-bold">{stats.error}</p>
            </div>
            <XCircle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Modules" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Modules</SelectItem>
              <SelectItem value="Auth">Auth</SelectItem>
              <SelectItem value="Sales">Sales</SelectItem>
              <SelectItem value="Inventory">Inventory</SelectItem>
              <SelectItem value="Users">Users</SelectItem>
              <SelectItem value="Reports">Reports</SelectItem>
              <SelectItem value="Purchase">Purchase</SelectItem>
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Actions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="export">Export</SelectItem>
              <SelectItem value="approve">Approve</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExport}>
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      {/* Logs Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>TIMESTAMP</TableHead>
                <TableHead>USER</TableHead>
                <TableHead>ACTION</TableHead>
                <TableHead>MODULE</TableHead>
                <TableHead>DESCRIPTION</TableHead>
                <TableHead>IP ADDRESS</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>DETAILS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No activity logs found
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : 'N/A'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="w-7 h-7">
                        <AvatarFallback className={`text-xs ${roleColors[log.userRole] || 'bg-gray-100'}`}>
                          {getInitials(log.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium">{log.user}</p>
                        <p className="text-xs text-muted-foreground">{log.userRole}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={`gap-1 ${actionColors[log.actionType] || ''}`}>
                      {actionIcons[log.actionType]}
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{log.module}</Badge>
                  </TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{log.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{log.ipAddress}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusColors[log.status]}>
                      {log.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {log.details && (
                      <Button variant="ghost" size="sm" className="text-primary" onClick={() => setSelectedLog(log)}>
                        View
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} logs
          </span>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="px-3">Page {page} of {Math.ceil(total / limit)}</span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setPage(p => Math.min(Math.ceil(total / limit), p + 1))}
              disabled={page >= Math.ceil(total / limit) || loading}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Activity Details
            </DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">User</p>
                  <p className="font-medium">{selectedLog.user}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Action</p>
                  <p className="font-medium capitalize">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Module</p>
                  <p className="font-medium">{selectedLog.module}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Timestamp</p>
                  <p className="font-medium">{selectedLog.timestamp ? new Date(selectedLog.timestamp).toLocaleString() : 'N/A'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{selectedLog.description}</p>
              </div>
              {selectedLog.details && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Additional Details</p>
                  <div className="bg-muted/50 rounded-lg p-3 space-y-1">
                    {Object.entries(selectedLog.details).map(([key, value]) => (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
