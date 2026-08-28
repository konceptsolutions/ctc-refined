import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tag, Search, Plus, Edit, Trash } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface ExpenseType {
  id: string;
  code: string;
  name: string;
  description: string;
  category: string;
  budget: number;
  spent: number;
  status: "Active" | "Inactive";
}

const categories = ["Import", "Operational", "Administrative", "Marketing", "Finance"];

interface ExpenseTypesTabProps {
  onUpdate?: () => void;
}

export const ExpenseTypesTab = ({ onUpdate }: ExpenseTypesTabProps) => {
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<ExpenseType | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingType, setDeletingType] = useState<ExpenseType | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    category: "",
    status: "Active" as "Active" | "Inactive",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchExpenseTypes();
  }, [searchQuery, categoryFilter, statusFilter]);

  const fetchExpenseTypes = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getExpenseTypes({
        search: searchQuery || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        limit: 1000,
      });
      if (response.data) {
        setExpenseTypes(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
      toast.error("Failed to fetch expense types");
    } finally {
      setLoading(false);
    }
  };

  const filteredTypes = expenseTypes.filter((type) => {
    const matchesSearch = 
      type.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      type.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === "all" || type.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || type.status === statusFilter;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleAddNew = () => {
    setEditingType(null);
    setFormData({ name: "", description: "", category: "General", status: "Active" });
    setIsDialogOpen(true);
  };

  const handleEdit = (type: ExpenseType) => {
    setEditingType(type);
    setFormData({
      name: type.name,
      description: type.description,
      category: type.category,
      status: type.status,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);
      if (editingType) {
        await apiClient.updateExpenseType(editingType.id, {
          name: formData.name,
          description: formData.description,
          category: formData.category || 'General',
          budget: 0,
          status: formData.status,
        });
        toast.success("Expense type updated successfully");
      } else {
        await apiClient.createExpenseType({
          name: formData.name,
          description: formData.description,
          category: formData.category || 'General',
          budget: 0,
          status: formData.status,
        });
        toast.success("Expense type added successfully");
      }
      setIsDialogOpen(false);
      await fetchExpenseTypes();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.error || "Failed to save expense type");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (type: ExpenseType) => {
    setDeletingType(type);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingType) return;

    try {
      setLoading(true);
      await apiClient.deleteExpenseType(deletingType.id);
      toast.success("Expense type deleted successfully");
      setDeleteDialogOpen(false);
      setDeletingType(null);
      await fetchExpenseTypes();
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.error || "Failed to delete expense type");
    } finally {
      setLoading(false);
    }
  };

  const getCategoryBadgeColor = (category: string) => {
    switch (category) {
      case "Import": return "bg-violet-100 text-violet-700 hover:bg-violet-100";
      case "Operational": return "bg-emerald-100 text-emerald-700 hover:bg-emerald-100";
      case "Administrative": return "bg-blue-100 text-blue-700 hover:bg-blue-100";
      case "Marketing": return "bg-pink-100 text-pink-700 hover:bg-pink-100";
      case "Finance": return "bg-amber-100 text-amber-700 hover:bg-amber-100";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <>
      <Card className="p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Tag className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Expense Types</h2>
              <p className="text-sm text-muted-foreground">Manage expense categories</p>
            </div>
          </div>
          <Button onClick={handleAddNew} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Expense Type
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search expense types..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <ListNumberHeader />
                <TableHead className="w-[100px]">CODE</TableHead>
                <TableHead>NAME</TableHead>
                <TableHead>CATEGORY</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead className="w-[80px]">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTypes.map((type, index) => {
                return (
                  <TableRow key={type.id} className="hover:bg-muted/30 transition-colors">
                    <ListNumberCell index={index} total={filteredTypes.length} />
                    <TableCell className="font-medium text-primary">{type.code}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{type.name}</p>
                        <p className="text-xs text-muted-foreground">{type.description}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getCategoryBadgeColor(type.category)}>{type.category}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-emerald-600 border-emerald-200 bg-emerald-50">
                        {type.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ActionButtonTooltip label="Edit" variant="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            onClick={() => handleEdit(type)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </ActionButtonTooltip>
                        <ActionButtonTooltip label="Delete" variant="delete">
                          <Button 
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteClick(type)}
                          >
                            <Trash className="w-4 h-4" />
                          </Button>
                        </ActionButtonTooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingType ? "Edit Expense Type" : "Add New Expense Type"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter expense type name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select value={formData.status} onValueChange={(v: "Active" | "Inactive") => setFormData({ ...formData, status: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingType ? "Update" : "Add"} Expense Type</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the expense type "{deletingType?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingType(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={loading}
            >
              {loading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
