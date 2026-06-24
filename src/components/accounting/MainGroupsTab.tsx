import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Users, MoreVertical, Eye, Download, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  getListRowNumber,
  LIST_NUMBER_HEAD_CLASS,
  LIST_NUMBER_CELL_CLASS,
} from "@/components/ui/list-table-number";

interface MainGroup {
  id: string;
  code: string;
  name: string;
  type?: string;
  displayOrder?: number;
}

export const MainGroupsTab = () => {
  const [mainGroups, setMainGroups] = useState<MainGroup[]>([]);
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [formData, setFormData] = useState({ code: "", name: "", type: "" });

  const hasAutoSeededRef = useRef(false);

  useEffect(() => {
    fetchMainGroups();
  }, []);

  // When the list is empty after first load, auto-restore the 9 default main groups once
  useEffect(() => {
    if (loading || mainGroups.length > 0 || hasAutoSeededRef.current) return;
    hasAutoSeededRef.current = true;
    handleRestoreDefaults();
  }, [loading, mainGroups.length]);

  const fetchMainGroups = async () => {
    try {
      setLoading(true);
      const res = await apiClient.getMainGroups() as any;
      if (res?.error) {
        throw new Error(res.error);
      }
      const data = Array.isArray(res) ? res : res?.data;
      setMainGroups(Array.isArray(data) ? data : []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to load main groups. Please check if the backend is running.",
        variant: "destructive",
      });
      setMainGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      setLoading(true);
      const res = await apiClient.seedMainGroups() as any;
      if (res?.error) {
        throw new Error(res.error);
      }
      // Also seed subgroups (101, 104, 501, 801) and required accounts (104005 Inventory, 501003, 801014) so inventory adjustments work
      await apiClient.seedSubgroups().catch(() => null);
      await apiClient.seedRequiredAccounts().catch(() => null);
      toast({
        title: "Restored",
        description: res?.count ? `Default ${res.count} main groups restored. Subgroups and required accounts (e.g. Inventory 104005) updated.` : "Default main groups and accounting structure restored.",
      });
      await fetchMainGroups();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to restore default main groups",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMainGroup = async () => {
    try {
      if (!formData.code || !formData.name) {
        toast({
          title: "Validation Error",
          description: "Code and Name are required",
          variant: "destructive",
        });
        return;
      }

      const res = await apiClient.createMainGroup({
        code: formData.code,
        name: formData.name,
        type: formData.type || undefined,
      }) as any;
      if (res?.error) {
        throw new Error(res.error);
      }

      toast({
        title: "Success",
        description: "Main group created successfully",
      });
      setIsAddDialogOpen(false);
      setFormData({ code: "", name: "", type: "" });
      await fetchMainGroups();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message ?? "Failed to create main group",
        variant: "destructive",
      });
    }
  };

  // Pagination
  const totalPages = Math.ceil(mainGroups.length / parseInt(pageSize)) || 1;
  const paginatedGroups = mainGroups.slice(
    (currentPage - 1) * parseInt(pageSize),
    currentPage * parseInt(pageSize)
  );

  // Reset to page 1 when page size changes
  useEffect(() => {
    setCurrentPage(1);
  }, [pageSize]);

  const handleViewChartOfAccounts = () => {
    // Generate HTML for chart of accounts
    const chartHTML = `
      <html>
        <head>
          <title>Chart of Accounts</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
          </style>
        </head>
        <body>
          <h1>Chart of Accounts</h1>
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Main Group Name</th>
              </tr>
            </thead>
            <tbody>
              ${mainGroups.map(g => `
                <tr>
                  <td>${g.code}</td>
                  <td>${g.name}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(chartHTML);
      printWindow.document.close();
      printWindow.print();
    }
    toast({
      title: "Success",
      description: "Chart of Accounts opened in new window",
    });
  };

  const handleSavePdf = () => {
    // Generate CSV export
    const csvContent = [
      ["Code", "Main Group Name"].join(","),
      ...mainGroups.map(g => [g.code, g.name].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `chart_of_accounts_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast({
      title: "Success",
      description: "Chart of Accounts exported successfully!",
    });
  };

  return (
    <Card className="border-border/50 shadow-sm transition-all duration-300 hover:shadow-md">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-destructive" />
          <CardTitle className="text-lg font-semibold">Main Groups</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="default"
            size="sm"
            onClick={() => setIsAddDialogOpen(true)}
            className="gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Main Group
          </Button>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="bg-primary text-primary-foreground hover:bg-primary/90">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-card border-border z-50">
            <DropdownMenuItem onClick={handleViewChartOfAccounts} className="cursor-pointer">
              <Eye className="h-4 w-4 mr-2" />
              View Chart of Accounts
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSavePdf} className="cursor-pointer">
              <Download className="h-4 w-4 mr-2" />
              Save pdf Chart of Accounts
            </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className={LIST_NUMBER_HEAD_CLASS}>#</th>
                <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                  Code
                </th>
                <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                  Main Group Name
                </th>
                <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                  Type
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-muted-foreground">
                    Loading main groups...
                  </td>
                </tr>
              ) : paginatedGroups.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center">
                    <p className="text-muted-foreground mb-4">No main groups found.</p>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleRestoreDefaults}
                      disabled={loading}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Restore default main groups
                    </Button>
                  </td>
                </tr>
              ) : (
                paginatedGroups.map((group, index) => (
                <tr
                  key={group.id}
                  className={`border-b border-border/50 transition-colors duration-200 hover:bg-muted/30 ${
                    index % 2 === 0 ? "bg-muted/10" : ""
                  }`}
                >
                  <td className={`p-3 ${LIST_NUMBER_CELL_CLASS}`}>
                    {getListRowNumber(index, currentPage, parseInt(pageSize))}
                  </td>
                  <td className="p-3 text-primary font-medium">{group.code}</td>
                  <td className="p-3 text-primary font-medium">{group.name}</td>
                  <td className="p-3 text-muted-foreground">{group.type || "N/A"}</td>
                </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
          <p className="text-sm text-muted-foreground">
            Showing <span className="text-primary">{mainGroups.length > 0 ? (currentPage - 1) * parseInt(pageSize) + 1 : 0}</span> to{" "}
            <span className="text-primary">{Math.min(currentPage * parseInt(pageSize), mainGroups.length)}</span> of{" "}
            <span className="text-primary">{mainGroups.length}</span> items
          </p>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="transition-all duration-200"
              >
                {"<<"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(currentPage - 1)}
                className="transition-all duration-200"
              >
                {"<"}
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <Button
                    key={pageNum}
                    variant={currentPage === pageNum ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(pageNum)}
                    className="transition-all duration-200"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              {totalPages > 5 && <span className="px-2">...</span>}
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(currentPage + 1)}
                className="transition-all duration-200"
              >
                {">"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="transition-all duration-200"
              >
                {">>"}
              </Button>
            </div>
            <Select value={pageSize} onValueChange={setPageSize}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border z-50">
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>

      {/* Add Main Group Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Main Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="code">Code *</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="Enter code"
              />
            </div>
            <div>
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter main group name"
              />
            </div>
            <div>
              <Label htmlFor="type">Type</Label>
              <Input
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                placeholder="Enter type (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddMainGroup}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
