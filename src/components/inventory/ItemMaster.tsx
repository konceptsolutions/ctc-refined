import { useState } from "react";
import { Search, Plus, Filter, Download, Upload, Edit2, Trash2, Eye } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ItemMasterData {
  id: string;
  partNo: string;
  brand: string;
  origin: string;
  category: string;
  make: string;
  model: string;
  description: string;
  uom: string;
  status: "Active" | "Inactive";
}

const sampleData: ItemMasterData[] = [
  { id: "1", partNo: "ENG-001", brand: "Bosch", origin: "Germany", category: "Engine", make: "Toyota", model: "Camry 2020", description: "Engine oil filter", uom: "NOS", status: "Active" },
  { id: "2", partNo: "BRK-002", brand: "Brembo", origin: "Italy", category: "Brakes", make: "Honda", model: "Civic 2021", description: "Front brake pads", uom: "SET", status: "Active" },
  { id: "3", partNo: "SUS-003", brand: "KYB", origin: "Japan", category: "Suspension", make: "Nissan", model: "Altima 2019", description: "Shock absorber front", uom: "NOS", status: "Active" },
  { id: "4", partNo: "ELC-004", brand: "Denso", origin: "Japan", category: "Electrical", make: "Ford", model: "Focus 2020", description: "Alternator assembly", uom: "NOS", status: "Inactive" },
  { id: "5", partNo: "FLT-005", brand: "Mann", origin: "Germany", category: "Filters", make: "BMW", model: "320i 2021", description: "Air filter element", uom: "NOS", status: "Active" },
];

export const ItemMaster = () => {
  const [items, setItems] = useState<ItemMasterData[]>(sampleData);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMasterData | null>(null);

  const [formData, setFormData] = useState({
    partNo: "",
    brand: "",
    origin: "",
    category: "",
    make: "",
    model: "",
    description: "",
    uom: "NOS",
  });

  const categories = [...new Set(items.map((i) => i.category))];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.brand.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === "all" || item.category === filterCategory;
    const matchesStatus = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleSave = () => {
    if (editingItem) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingItem.id
            ? { ...item, ...formData, status: "Active" as const }
            : item
        )
      );
    } else {
      const newItem: ItemMasterData = {
        id: Date.now().toString(),
        ...formData,
        status: "Active",
      };
      setItems((prev) => [newItem, ...prev]);
    }
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      partNo: "",
      brand: "",
      origin: "",
      category: "",
      make: "",
      model: "",
      description: "",
      uom: "NOS",
    });
    setShowAddForm(false);
    setEditingItem(null);
  };

  const handleEdit = (item: ItemMasterData) => {
    setFormData({
      partNo: item.partNo,
      brand: item.brand,
      origin: item.origin,
      category: item.category,
      make: item.make,
      model: item.model,
      description: item.description,
      uom: item.uom,
    });
    setEditingItem(item);
    setShowAddForm(true);
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Item Master</h2>
          <p className="text-sm text-muted-foreground">
            Manage parts with Part #, Brand, Origin, Category, Make, Model
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Upload className="w-4 h-4" />
            Import
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowAddForm(true)}>
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Add/Edit Form */}
      {showAddForm && (
        <div className="bg-card border border-border rounded-lg p-4 animate-fade-in">
          <h3 className="text-sm font-medium text-foreground mb-4">
            {editingItem ? "Edit Item" : "Add New Item"}
          </h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Part No *</label>
              <Input
                value={formData.partNo}
                onChange={(e) => setFormData({ ...formData, partNo: e.target.value })}
                placeholder="Enter part number"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Brand</label>
              <Input
                value={formData.brand}
                onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                placeholder="Enter brand"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Origin</label>
              <Input
                value={formData.origin}
                onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                placeholder="Country of origin"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Category"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Make</label>
              <Input
                value={formData.make}
                onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                placeholder="Vehicle make"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Model</label>
              <Input
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                placeholder="Vehicle model"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Description"
                className="h-9"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">UOM</label>
              <Select value={formData.uom} onValueChange={(v) => setFormData({ ...formData, uom: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NOS">NOS</SelectItem>
                  <SelectItem value="SET">SET</SelectItem>
                  <SelectItem value="KG">KG</SelectItem>
                  <SelectItem value="LTR">LTR</SelectItem>
                  <SelectItem value="MTR">MTR</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              {editingItem ? "Update" : "Save"}
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search parts..."
            className="pl-9 h-9"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40 h-9">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <ListNumberHeader />
              <TableHead className="text-xs font-medium">Part No</TableHead>
              <TableHead className="text-xs font-medium">Brand</TableHead>
              <TableHead className="text-xs font-medium">Origin</TableHead>
              <TableHead className="text-xs font-medium">Category</TableHead>
              <TableHead className="text-xs font-medium">Make</TableHead>
              <TableHead className="text-xs font-medium">Model</TableHead>
              <TableHead className="text-xs font-medium">Description</TableHead>
              <TableHead className="text-xs font-medium">UOM</TableHead>
              <TableHead className="text-xs font-medium">Status</TableHead>
              <TableHead className="text-xs font-medium text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredItems.map((item, index) => (
              <TableRow key={item.id} className="hover:bg-muted/20 transition-colors">
                <ListNumberCell index={index} />
                <TableCell className="text-sm font-medium text-foreground">{item.partNo}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.brand}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.origin}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.make}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.model}</TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate">
                  {item.description}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{item.uom}</TableCell>
                <TableCell>
                  <Badge
                    variant={item.status === "Active" ? "default" : "secondary"}
                    className={cn(
                      "text-xs",
                      item.status === "Active"
                        ? "bg-chart-green/20 text-chart-green border-chart-green/30"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {item.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ActionButtonTooltip label="View" variant="view">
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </ActionButtonTooltip>
                    <ActionButtonTooltip label="Edit" variant="edit">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(item)}>
                        <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                    </ActionButtonTooltip>
                    <ActionButtonTooltip label="Delete" variant="delete">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </ActionButtonTooltip>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredItems.length === 0 && (
          <div className="py-12 text-center text-muted-foreground text-sm">
            No items found
          </div>
        )}
      </div>

      {/* Footer Stats */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {filteredItems.length} of {items.length} items</span>
        <span>Total Active: {items.filter((i) => i.status === "Active").length}</span>
      </div>
    </div>
  );
};
