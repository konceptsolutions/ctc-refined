import { useState, useEffect } from "react";
import {
  getListRowNumber,
  LIST_NUMBER_HEAD_CLASS,
  LIST_NUMBER_CELL_CLASS,
} from "@/components/ui/list-table-number";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  Pencil,
  Trash2,
  MoreVertical,
  Save,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { apiClient } from "@/lib/api";

interface Subgroup {
  id: string;
  mainGroup: string;
  mainGroupId: string;
  code: string;
  name: string;
  isActive: boolean;
  canDelete: boolean;
}

// Local API URL detection is replaced by apiClient from @/lib/api


export const SubgroupsTab = () => {
  const [subgroups, setSubgroups] = useState<Subgroup[]>([]);
  const [mainGroups, setMainGroups] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filterMainGroup, setFilterMainGroup] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [editingSubgroup, setEditingSubgroup] = useState<Subgroup | null>(null);
  const [deletingSubgroup, setDeletingSubgroup] = useState<Subgroup | null>(
    null,
  );
  const [formData, setFormData] = useState({
    mainGroup: "",
    name: "",
    code: "",
  });

  useEffect(() => {
    fetchMainGroups();
    fetchSubgroups();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMainGroup, filterStatus, pageSize]);

  const fetchMainGroups = async () => {
    try {
      const result = await apiClient.get<any>("/accounting/main-groups");
      if (result.data) {
        setMainGroups(result.data || []);
      }
    } catch (error) { }
  };

  const fetchSubgroups = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterMainGroup !== "all") {
        const mainGroup = mainGroups.find(
          (mg) => mg.name === filterMainGroup || mg.id === filterMainGroup,
        );
        if (mainGroup) {
          params.append("mainGroupId", mainGroup.id);
        }
      }
      if (filterStatus !== "all") {
        params.append("isActive", filterStatus === "active" ? "true" : "false");
      }

      const queryString = params.toString();
      const result = await apiClient.get<any>(`/accounting/subgroups${queryString ? `?${queryString}` : ""}`);

      if (result.data) {
        const data = result.data || [];
        // Transform API data to match component interface
        const transformed = data.map((sg: any) => ({
          id: sg.id,
          mainGroup: sg.MainGroup?.name || sg.mainGroup?.name || "",
          mainGroupId: sg.mainGroupId || "",
          code: sg.code,
          name: sg.name,
          isActive: sg.isActive !== undefined ? sg.isActive : true,
          canDelete: sg.canDelete !== undefined ? sg.canDelete : true,
        }));
        setSubgroups(transformed);
      } else if (result.error) {
        console.error("Subgroups load failure:", result.error);
        toast.error(`Failed to load subgroups: ${result.error}`);
      }
    } catch (error: any) {
      toast.error(`Error loading subgroups: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Refetch when filters change
  useEffect(() => {
    if (mainGroups.length > 0) {
      fetchSubgroups();
    }
  }, [filterMainGroup, filterStatus]);

  const filteredSubgroups = subgroups.filter((sg) => {
    const matchesGroup =
      filterMainGroup === "all" || sg.mainGroup === filterMainGroup;
    const matchesStatus =
      filterStatus === "all" ||
      (filterStatus === "active" ? sg.isActive : !sg.isActive);
    return matchesGroup && matchesStatus;
  });

  const totalPages =
    Math.ceil(filteredSubgroups.length / parseInt(pageSize)) || 1;
  const paginatedSubgroups = filteredSubgroups.slice(
    (currentPage - 1) * parseInt(pageSize),
    currentPage * parseInt(pageSize),
  );

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(paginatedSubgroups.map((g) => g.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter((item) => item !== id));
    }
  };

  const handleAddSubgroup = async () => {
    if (!formData.mainGroup || !formData.name.trim()) {
      toast.error("Please fill all required fields (Main Group and Name)");
      return;
    }

    try {
      // Find main group ID
      const mainGroup = mainGroups.find(
        (mg: any) =>
          mg.name === formData.mainGroup || mg.id === formData.mainGroup,
      );

      if (!mainGroup) {
        toast.error("Main group not found");
        return;
      }

      // Generate code - use provided code or auto-generate
      let code = formData.code.trim();
      if (!code) {
        // Auto-generate code based on main group code and existing subgroups
        const mainGroupSubgroups = subgroups.filter(
          (sg) => sg.mainGroupId === mainGroup.id,
        );
        const existingCodes = mainGroupSubgroups.map((s) => {
          const num = parseInt(s.code.replace(/\D/g, ""));
          return isNaN(num) ? 0 : num;
        });
        const nextNum =
          existingCodes.length > 0 ? Math.max(...existingCodes) + 1 : 1;
        code = `${mainGroup.code}${String(nextNum).padStart(2, "0")}`;
      }

      const result = await apiClient.post<any>("/accounting/subgroups", {
        mainGroupId: mainGroup.id,
        code: code.trim(),
        name: formData.name.trim(),
        isActive: true,
        canDelete: true,
      });

      if (result.data) {
        toast.success(`Subgroup "${result.data.name}" added successfully!`);
        await fetchSubgroups();
        setIsAddDialogOpen(false);
        resetForm();
      } else if (result.error) {
        toast.error(result.error || "Failed to add subgroup");
      }
    } catch (error: any) {
      toast.error(error.message || "Error adding subgroup");
    }
  };

  const handleEditSubgroup = (subgroup: Subgroup) => {
    setEditingSubgroup(subgroup);
    setFormData({
      mainGroup: subgroup.mainGroup,
      name: subgroup.name,
      code: subgroup.code,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateSubgroup = async () => {
    if (!editingSubgroup) return;
    if (!formData.mainGroup || !formData.name.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const mainGroup = mainGroups.find(
        (mg: any) =>
          mg.name === formData.mainGroup || mg.id === formData.mainGroup,
      );

      if (!mainGroup) {
        toast.error("Main group not found");
        return;
      }

      const result = await apiClient.put<any>(`/accounting/subgroups/${editingSubgroup.id}`, {
        mainGroupId: mainGroup.id,
        name: formData.name.trim(),
        isActive: editingSubgroup.isActive,
      });

      if (result.data) {
        await fetchSubgroups();
        setIsEditDialogOpen(false);
        setEditingSubgroup(null);
        resetForm();
        toast.success("Subgroup updated successfully!");
      } else if (result.error) {
        toast.error(result.error || "Failed to update subgroup");
      }
    } catch (error: any) {
      toast.error(error.message || "Error updating subgroup");
    }
  };

  const handleOpenDeleteDialog = (subgroup: Subgroup) => {
    setDeletingSubgroup(subgroup);
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteSubgroup = async () => {
    if (!deletingSubgroup) return;

    try {
      const result = await apiClient.delete<any>(`/accounting/subgroups/${deletingSubgroup.id}`);

      if (result.data) {
        await fetchSubgroups();
        setIsDeleteDialogOpen(false);
        setDeletingSubgroup(null);
        toast.success("Subgroup deleted successfully!");
      } else if (result.error) {
        toast.error(result.error || "Failed to delete subgroup");
      }
    } catch (error: any) {
      toast.error(error.message || "Error deleting subgroup");
    }
  };

  const resetForm = () => {
    setFormData({ mainGroup: "", name: "", code: "" });
  };

  const handleReset = () => {
    resetForm();
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Main Group", "Code", "Sub Group", "Status"].join(","),
      ...filteredSubgroups.map((sg) =>
        [
          sg.mainGroup,
          sg.code,
          sg.name,
          sg.isActive ? "Active" : "Inactive",
        ].join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `subgroups_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Subgroups exported to CSV successfully!");
  };

  const handlePrintList = () => {
    const printHTML = `
      <html>
        <head>
          <title>Subgroups List</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>Subgroups List</h1>
          <table>
            <thead>
              <tr>
                <th>Main Group</th>
                <th>Code</th>
                <th>Sub Group</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSubgroups
        .map(
          (sg) => `
                <tr>
                  <td>${sg.mainGroup}</td>
                  <td>${sg.code}</td>
                  <td>${sg.name}</td>
                  <td>${sg.isActive ? "Active" : "Inactive"}</td>
                </tr>
              `,
        )
        .join("")}
            </tbody>
          </table>
          <button onclick="window.print()">Print</button>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success("Subgroups list opened for printing");
  };

  return (
    <>
      <Card className="border-border/50 shadow-sm transition-all duration-300 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg font-semibold">Subgroups</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                resetForm();
                setIsAddDialogOpen(true);
              }}
              variant="outline"
              size="sm"
              className="transition-all duration-200 hover:scale-105"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add New Subgroup
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-card border-border z-50"
              >
                <DropdownMenuItem
                  onClick={handleExportCSV}
                  className="cursor-pointer"
                >
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handlePrintList}
                  className="cursor-pointer"
                >
                  Print List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">
                Main Group
              </Label>
              <Select
                value={filterMainGroup}
                onValueChange={setFilterMainGroup}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Groups</SelectItem>
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className={LIST_NUMBER_HEAD_CLASS}>#</th>
                  <th className="p-3 text-left w-12">
                    <Checkbox
                      checked={
                        selectedItems.length === paginatedSubgroups.length &&
                        paginatedSubgroups.length > 0
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left w-12"></th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Main Group
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Code
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Sub Group
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      Loading subgroups...
                    </td>
                  </tr>
                ) : paginatedSubgroups.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="p-8 text-center text-muted-foreground"
                    >
                      No subgroups found. Click "Add New Subgroup" to create
                      one.
                    </td>
                  </tr>
                ) : (
                  paginatedSubgroups.map((subgroup, index) => {
                    const isFixedSubgroup = [
                      "101",
                      "102",
                      "103",
                      "104",
                      "301",
                      "302",
                      "304",
                      "501",
                      "701",
                      "801",
                      "901",
                    ].includes(subgroup.code);
                    return (
                      <tr
                        key={subgroup.id}
                        className={`border-b border-border/50 transition-colors duration-200 hover:bg-muted/30 ${index % 2 === 0 ? "bg-muted/10" : ""
                          }`}
                      >
                        <td className={LIST_NUMBER_CELL_CLASS}>
                          {getListRowNumber(
                            index,
                            currentPage,
                            parseInt(pageSize),
                          )}
                        </td>
                        <td className="p-3">
                          <Checkbox
                            checked={selectedItems.includes(subgroup.id)}
                            onCheckedChange={(checked) =>
                              handleSelectItem(subgroup.id, checked as boolean)
                            }
                          />
                        </td>
                        <td className="p-3">
                          <div
                            className={`w-3 h-3 rounded-full ${subgroup.isActive ? "bg-success" : "bg-muted"}`}
                          ></div>
                        </td>
                        <td className="p-3 text-primary font-medium">
                          {subgroup.mainGroup}
                        </td>
                        <td className="p-3 font-medium">{subgroup.code}</td>
                        <td className="p-3 text-primary font-medium">
                          {subgroup.name}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <ActionButtonTooltip label="Edit" variant="edit">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSubgroup(subgroup)}
                                className="text-primary hover:text-primary/80 transition-colors"
                              >
                                <Pencil className="h-4 w-4 mr-1" />
                                Edit
                              </Button>
                            </ActionButtonTooltip>
                            {subgroup.canDelete && !isFixedSubgroup && (
                              <ActionButtonTooltip
                                label="Delete"
                                variant="delete"
                              >
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    handleOpenDeleteDialog(subgroup)
                                  }
                                  className="text-destructive hover:text-destructive/80 transition-colors"
                                >
                                  <Trash2 className="h-4 w-4 mr-1" />
                                  Delete
                                </Button>
                              </ActionButtonTooltip>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
            <p className="text-sm text-muted-foreground">
              Showing{" "}
              <span className="text-primary">
                {filteredSubgroups.length > 0
                  ? (currentPage - 1) * parseInt(pageSize) + 1
                  : 0}
              </span>{" "}
              to{" "}
              <span className="text-primary">
                {Math.min(
                  currentPage * parseInt(pageSize),
                  filteredSubgroups.length,
                )}
              </span>{" "}
              of{" "}
              <span className="text-primary">{filteredSubgroups.length}</span>{" "}
              items
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
      </Card>

      {/* Add Subgroup Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Subgroup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main Group</Label>
              <Select
                value={formData.mainGroup}
                onValueChange={(value) =>
                  setFormData({ ...formData, mainGroup: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subgroup Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter subgroup name"
                className={!formData.name.trim() ? "border-destructive" : ""}
              />
              {!formData.name.trim() && (
                <p className="text-sm text-destructive">name</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddSubgroup}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-1" />
              Add Subgroup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Subgroup Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Subgroup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main Group</Label>
              <Select
                value={formData.mainGroup}
                onValueChange={(value) =>
                  setFormData({ ...formData, mainGroup: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Subgroup Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Enter subgroup name"
                className={!formData.name.trim() ? "border-destructive" : ""}
              />
              {!formData.name.trim() && (
                <p className="text-sm text-destructive">name</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Code (Optional - Auto-generated if empty)</Label>
              <Input
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value })
                }
                placeholder="e.g., 101, 201 (leave empty to auto-generate)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setEditingSubgroup(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateSubgroup}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-1" />
              Update Subgroup
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete the subgroup "{deletingSubgroup?.name}". This
              action cannot be undone. If this subgroup has accounts, they will
              also be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setIsDeleteDialogOpen(false);
                setDeletingSubgroup(null);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteSubgroup}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
