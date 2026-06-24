import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, generateUUID } from "@/lib/api";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Users,
  Store,
  ShoppingCart,
  Truck,
  RefreshCw,
  Download,
  Printer,
  AlertTriangle
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

type CustomerType = "retail" | "wholesale" | "market" | "distributor";

interface PriceStructure {
  id: string;
  customerName: string;
  customerType: CustomerType;
  priceCategory: string;
  standardDiscount: number;
  specialDiscount: number;
  creditLimit: number;
  creditDays: number;
  minOrderValue: number;
  effectiveFrom: string;
  effectiveTo: string;
  status: "active" | "inactive";
  notes: string;
}

const priceCategories = [
  { value: "Price A (Retail)", label: "Price A (Retail)" },
  { value: "Price B (Wholesale)", label: "Price B (Wholesale)" },
  { value: "Price M (Market)", label: "Price M (Market)" },
  { value: "Price D (Distributor)", label: "Price D (Distributor)" },
];

const customerTypes: { value: CustomerType; label: string }[] = [
  { value: "retail", label: "Retail Customer" },
  { value: "wholesale", label: "Wholesale Customer" },
  { value: "market", label: "Market Customer" },
  { value: "distributor", label: "Distributor" },
];

const getTypeColor = (type: CustomerType) => {
  switch (type) {
    case "retail":
      return "bg-info/10 text-info border-info/20";
    case "wholesale":
      return "bg-success/10 text-success border-success/20";
    case "market":
      return "bg-warning/10 text-warning border-warning/20";
    case "distributor":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-muted text-muted-foreground";
  }
};

const getTypeLabel = (type: CustomerType) => {
  return type.charAt(0).toUpperCase() + type.slice(1);
};

export const CustomerPriceStructures = () => {
  const [priceStructures, setPriceStructures] = useState<PriceStructure[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(false);

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isBulkUpdateOpen, setIsBulkUpdateOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedStructure, setSelectedStructure] = useState<PriceStructure | null>(null);

  // Form state for new/edit
  const [formData, setFormData] = useState({
    customerName: "",
    customerType: "retail" as CustomerType,
    priceCategory: "Price A (Retail)",
    standardDiscount: 0,
    specialDiscount: 0,
    creditLimit: 0,
    creditDays: 30,
    minOrderValue: 0,
    effectiveFrom: new Date().toISOString().split("T")[0],
    effectiveTo: "",
    status: "active" as "active" | "inactive",
    notes: "",
  });

  // Bulk update form
  const [bulkForm, setBulkForm] = useState({
    customerType: "retail" as CustomerType,
    priceCategory: "Price A (Retail)",
    discount: 0,
    creditDays: 30,
  });

  // Fetch price structures from database/localStorage
  useEffect(() => {
    const fetchPriceStructures = async () => {
      setLoading(true);
      try {
        // TODO: Replace with API call when endpoint is available
        // const response = await apiClient.getCustomerPriceStructures();
        // if (response.data) {
        //   setPriceStructures(response.data);
        // }

        // For now, use localStorage
        const storedStructures = localStorage.getItem('customerPriceStructures');
        if (storedStructures) {
          setPriceStructures(JSON.parse(storedStructures));
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to load price structures",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchPriceStructures();
  }, []);

  // Save price structures to localStorage (temporary until API is ready)
  useEffect(() => {
    if (priceStructures.length > 0) {
      localStorage.setItem('customerPriceStructures', JSON.stringify(priceStructures));
    } else {
      // Clear localStorage if no structures
      const stored = localStorage.getItem('customerPriceStructures');
      if (stored && JSON.parse(stored).length === 0) {
        localStorage.removeItem('customerPriceStructures');
      }
    }
  }, [priceStructures]);

  // Stats
  const totalCount = priceStructures.length;
  const retailCount = priceStructures.filter(p => p.customerType === "retail").length;
  const wholesaleCount = priceStructures.filter(p => p.customerType === "wholesale").length;
  const marketCount = priceStructures.filter(p => p.customerType === "market").length;
  const distributorCount = priceStructures.filter(p => p.customerType === "distributor").length;

  const filteredStructures = priceStructures.filter((item) => {
    const matchesSearch = item.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || item.customerType === filterType;
    return matchesSearch && matchesFilter;
  });

  const resetForm = () => {
    setFormData({
      customerName: "",
      customerType: "retail",
      priceCategory: "Price A (Retail)",
      standardDiscount: 0,
      specialDiscount: 0,
      creditLimit: 0,
      creditDays: 30,
      minOrderValue: 0,
      effectiveFrom: new Date().toISOString().split("T")[0],
      effectiveTo: "",
      status: "active",
      notes: "",
    });
  };

  const handleCreate = async () => {
    if (!formData.customerName || formData.customerName.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate customer
    const duplicate = priceStructures.find(p =>
      p.customerName.toLowerCase() === formData.customerName.toLowerCase().trim()
    );
    if (duplicate) {
      toast({
        title: "Duplicate Customer",
        description: "A price structure already exists for this customer. Please edit the existing one.",
        variant: "destructive",
      });
      return;
    }

    const newStructure: PriceStructure = {
      id: generateUUID(),
      ...formData,
      customerName: formData.customerName.trim(),
    };

    // TODO: Save to API when endpoint is available
    // try {
    //   const response = await apiClient.createCustomerPriceStructure(newStructure);
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Error",
    //     description: error.message || "Failed to create price structure",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    setPriceStructures([...priceStructures, newStructure]);
    setIsAddDialogOpen(false);
    resetForm();
    toast({
      title: "Price Structure Created",
      description: `Price structure for ${newStructure.customerName} has been created successfully.`,
    });
  };

  const handleEdit = (structure: PriceStructure) => {
    setSelectedStructure(structure);
    setFormData({
      customerName: structure.customerName,
      customerType: structure.customerType,
      priceCategory: structure.priceCategory,
      standardDiscount: structure.standardDiscount,
      specialDiscount: structure.specialDiscount,
      creditLimit: structure.creditLimit,
      creditDays: structure.creditDays,
      minOrderValue: structure.minOrderValue,
      effectiveFrom: structure.effectiveFrom,
      effectiveTo: structure.effectiveTo,
      status: structure.status,
      notes: structure.notes,
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedStructure) return;

    if (!formData.customerName || formData.customerName.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Customer name is required",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicate customer (excluding current one)
    const duplicate = priceStructures.find(p =>
      p.id !== selectedStructure.id &&
      p.customerName.toLowerCase() === formData.customerName.toLowerCase().trim()
    );
    if (duplicate) {
      toast({
        title: "Duplicate Customer",
        description: "A price structure already exists for this customer name.",
        variant: "destructive",
      });
      return;
    }

    // TODO: Update via API when endpoint is available
    // try {
    //   const response = await apiClient.updateCustomerPriceStructure(selectedStructure.id, formData);
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Error",
    //     description: error.message || "Failed to update price structure",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    setPriceStructures(priceStructures.map(p =>
      p.id === selectedStructure.id
        ? { ...p, ...formData, customerName: formData.customerName.trim() }
        : p
    ));
    setIsEditDialogOpen(false);
    setSelectedStructure(null);
    resetForm();
    toast({
      title: "Price Structure Updated",
      description: "The price structure has been updated successfully.",
    });
  };

  const handleDeleteClick = (structure: PriceStructure) => {
    setSelectedStructure(structure);
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedStructure) return;

    // TODO: Delete via API when endpoint is available
    // try {
    //   const response = await apiClient.deleteCustomerPriceStructure(selectedStructure.id);
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Error",
    //     description: error.message || "Failed to delete price structure",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    setPriceStructures(priceStructures.filter((item) => item.id !== selectedStructure.id));
    setIsDeleteDialogOpen(false);
    setSelectedStructure(null);
    toast({
      title: "Price Structure Deleted",
      description: "The price structure has been removed successfully.",
    });
  };

  const handleBulkUpdate = async () => {
    const affectedCount = priceStructures.filter(p => p.customerType === bulkForm.customerType).length;

    if (affectedCount === 0) {
      toast({
        title: "No Customers Found",
        description: `No ${bulkForm.customerType} customers found to update.`,
        variant: "default",
      });
      return;
    }

    // TODO: Bulk update via API when endpoint is available
    // try {
    //   const response = await apiClient.bulkUpdateCustomerPriceStructures({
    //     customerType: bulkForm.customerType,
    //     priceCategory: bulkForm.priceCategory,
    //     standardDiscount: bulkForm.discount,
    //     creditDays: bulkForm.creditDays,
    //   });
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Error",
    //     description: error.message || "Failed to bulk update price structures",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    setPriceStructures(priceStructures.map(p => {
      if (p.customerType === bulkForm.customerType) {
        return {
          ...p,
          priceCategory: bulkForm.priceCategory,
          standardDiscount: bulkForm.discount,
          creditDays: bulkForm.creditDays,
        };
      }
      return p;
    }));
    setIsBulkUpdateOpen(false);
    setBulkForm({
      customerType: "retail",
      priceCategory: "Price A (Retail)",
      discount: 0,
      creditDays: 30,
    });
    toast({
      title: "Bulk Update Complete",
      description: `${affectedCount} ${bulkForm.customerType} customer${affectedCount !== 1 ? 's' : ''} have been updated.`,
    });
  };

  const handleExport = () => {
    if (filteredStructures.length === 0) {
      toast({
        title: "No Data to Export",
        description: "There are no price structures to export. Please add some price structures first.",
        variant: "default",
      });
      return;
    }

    try {
      // Escape CSV values that contain commas or quotes
      const escapeCSV = (value: any): string => {
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        ["Customer", "Type", "Price Category", "Discount %", "Credit Limit", "Credit Days", "Min Order", "Status", "Effective From", "Effective To"].join(","),
        ...filteredStructures.map(p => [
          escapeCSV(p.customerName),
          escapeCSV(p.customerType),
          escapeCSV(p.priceCategory),
          escapeCSV(`${p.standardDiscount}${p.specialDiscount > 0 ? `+${p.specialDiscount}` : ''}`),
          escapeCSV(p.creditLimit),
          escapeCSV(p.creditDays),
          escapeCSV(p.minOrderValue),
          escapeCSV(p.status),
          escapeCSV(p.effectiveFrom),
          escapeCSV(p.effectiveTo || 'N/A')
        ].join(","))
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      a.download = `price-structures-${dateStr}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `${filteredStructures.length} price structure${filteredStructures.length !== 1 ? 's' : ''} exported to CSV.`,
      });
    } catch (error: any) {
      toast({
        title: "Export Error",
        description: error.message || "Failed to export price structures",
        variant: "destructive",
      });
    }
  };

  const handlePrint = () => {
    if (filteredStructures.length === 0) {
      toast({
        title: "No Data to Print",
        description: "There are no price structures to print. Please add some price structures first.",
        variant: "default",
      });
      return;
    }

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast({
        title: "Print Error",
        description: "Unable to open print window. Please check your browser settings.",
        variant: "destructive",
      });
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Customer Price Structures Report</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1664da; padding-bottom: 20px; }
          .header h1 { color: #1664da; margin: 0; }
          .header p { color: #666; margin: 5px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th { background: #1664da; color: white; padding: 12px; text-align: left; }
          td { padding: 10px; border-bottom: 1px solid #ddd; }
          tr:nth-child(even) { background: #f9f9f9; }
          .badge { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          .badge-retail { background: #0ea5e9; color: white; }
          .badge-wholesale { background: #22c55e; color: white; }
          .badge-market { background: #eab308; color: white; }
          .badge-distributor { background: #ef4444; color: white; }
          .footer { margin-top: 30px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LUCKY HYDRAULIC PARTS</h1>
          <p>Customer Price Structures Report</p>
          <p>Generated: ${new Date().toLocaleDateString()}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Customer</th>
              <th>Type</th>
              <th>Price Category</th>
              <th>Discount %</th>
              <th>Credit Limit</th>
              <th>Credit Days</th>
              <th>Min Order</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${filteredStructures.map(p => `
              <tr>
                <td>${p.customerName}</td>
                <td><span class="badge badge-${p.customerType}">${getTypeLabel(p.customerType)}</span></td>
                <td>${p.priceCategory}</td>
                <td>${p.standardDiscount}%${p.specialDiscount > 0 ? ` (+${p.specialDiscount}%)` : ''}</td>
                <td>Rs. ${p.creditLimit.toLocaleString()}</td>
                <td>${p.creditDays} days</td>
                <td>Rs. ${p.minOrderValue.toLocaleString()}</td>
                <td>${p.status}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <div class="footer">
          <p>Total Records: ${filteredStructures.length}</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 250);

    toast({
      title: "Print Initiated",
      description: "Price structures report sent to printer.",
    });
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-muted rounded-xl">
                <Users className="w-5 h-5 text-muted-foreground" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-2xl font-bold text-foreground">{totalCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-info/20 rounded-xl">
                <Store className="w-5 h-5 text-info" />
              </div>
              <div>
                <p className="text-xs text-info">Retail</p>
                <p className="text-2xl font-bold text-info">{retailCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-success/20 rounded-xl">
                <ShoppingCart className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-success">Wholesale</p>
                <p className="text-2xl font-bold text-success">{wholesaleCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-warning/20 rounded-xl">
                <ShoppingCart className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-warning">Market</p>
                <p className="text-2xl font-bold text-warning">{marketCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-destructive/20 rounded-xl">
                <Truck className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-xs text-destructive">Distributor</p>
                <p className="text-2xl font-bold text-destructive">{distributorCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search, Filter & Actions */}
      <div className="flex flex-col lg:flex-row gap-4 justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search customer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="retail">Retail</SelectItem>
              <SelectItem value="wholesale">Wholesale</SelectItem>
              <SelectItem value="market">Market</SelectItem>
              <SelectItem value="distributor">Distributor</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsBulkUpdateOpen(true)} className="gap-2">
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Bulk Update</span>
          </Button>
          <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Price Structure
          </Button>
        </div>
      </div>

      {/* Table Card */}
      <Card>
        <CardHeader className="pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <CardTitle className="text-base">Customer Price Structures ({filteredStructures.length})</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-2">
              <Printer className="w-4 h-4" />
              Print
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Price Category</TableHead>
                  <TableHead className="text-center">Discount %</TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead className="text-center">Credit Days</TableHead>
                  <TableHead className="text-right">Min Order</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      Loading price structures...
                    </TableCell>
                  </TableRow>
                ) : filteredStructures.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {searchTerm || filterType !== "all"
                        ? "No price structures found matching your search criteria"
                        : "No price structures found. Click 'Add Price Structure' to create one."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredStructures.map((item, index) => (
                    <TableRow key={item.id}>
                      <ListNumberCell index={index} />
                      <TableCell className="font-medium">{item.customerName}</TableCell>
                      <TableCell>
                        <Badge className={`${getTypeColor(item.customerType)} border`}>
                          {getTypeLabel(item.customerType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.priceCategory}</TableCell>
                      <TableCell className="text-center">
                        <span className="text-primary font-medium">{item.standardDiscount}%</span>
                        {item.specialDiscount > 0 && (
                          <span className="text-success text-xs ml-1">(+{item.specialDiscount}%)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">Rs. {item.creditLimit.toLocaleString()}</TableCell>
                      <TableCell className="text-center text-info">{item.creditDays} days</TableCell>
                      <TableCell className="text-right">Rs. {item.minOrderValue.toLocaleString()}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={item.status === "active" ? "default" : "secondary"} className="text-xs">
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center gap-1">
                          <ActionButtonTooltip label="Edit" variant="edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => handleEdit(item)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                          <ActionButtonTooltip label="Delete" variant="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteClick(item)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Price Structure Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-primary/20 pb-4">
            <DialogTitle className="text-xl">New Customer Price Structure</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name or select from list"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Type *</Label>
                <Select
                  value={formData.customerType}
                  onValueChange={(value: CustomerType) => setFormData({ ...formData, customerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Price Category *</Label>
                <Select
                  value={formData.priceCategory}
                  onValueChange={(value) => setFormData({ ...formData, priceCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priceCategories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Standard Discount %</Label>
                <Input
                  type="number"
                  value={formData.standardDiscount}
                  onChange={(e) => setFormData({ ...formData, standardDiscount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Special Discount %</Label>
                <Input
                  type="number"
                  value={formData.specialDiscount}
                  onChange={(e) => setFormData({ ...formData, specialDiscount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Credit Limit</Label>
                <Input
                  type="number"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Credit Days</Label>
                <Input
                  type="number"
                  value={formData.creditDays}
                  onChange={(e) => setFormData({ ...formData, creditDays: parseInt(e.target.value) || 0 })}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order Value</Label>
                <Input
                  type="number"
                  value={formData.minOrderValue}
                  onChange={(e) => setFormData({ ...formData, minOrderValue: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Effective From *</Label>
                <Input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="date"
                  value={formData.effectiveTo}
                  onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "active" | "inactive") => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or special terms..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleCreate} disabled={!formData.customerName}>
                Create Price Structure
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Price Structure Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="border-b border-primary/20 pb-4">
            <DialogTitle className="text-xl">Edit Price Structure</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Name *</Label>
                <Input
                  value={formData.customerName}
                  onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                  placeholder="Enter customer name or select from list"
                />
              </div>
              <div className="space-y-2">
                <Label>Customer Type *</Label>
                <Select
                  value={formData.customerType}
                  onValueChange={(value: CustomerType) => setFormData({ ...formData, customerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Price Category *</Label>
                <Select
                  value={formData.priceCategory}
                  onValueChange={(value) => setFormData({ ...formData, priceCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priceCategories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Standard Discount %</Label>
                <Input
                  type="number"
                  value={formData.standardDiscount}
                  onChange={(e) => setFormData({ ...formData, standardDiscount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Special Discount %</Label>
                <Input
                  type="number"
                  value={formData.specialDiscount}
                  onChange={(e) => setFormData({ ...formData, specialDiscount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Credit Limit</Label>
                <Input
                  type="number"
                  value={formData.creditLimit}
                  onChange={(e) => setFormData({ ...formData, creditLimit: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Credit Days</Label>
                <Input
                  type="number"
                  value={formData.creditDays}
                  onChange={(e) => setFormData({ ...formData, creditDays: parseInt(e.target.value) || 0 })}
                  placeholder="30"
                />
              </div>
              <div className="space-y-2">
                <Label>Min Order Value</Label>
                <Input
                  type="number"
                  value={formData.minOrderValue}
                  onChange={(e) => setFormData({ ...formData, minOrderValue: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Effective From *</Label>
                <Input
                  type="date"
                  value={formData.effectiveFrom}
                  onChange={(e) => setFormData({ ...formData, effectiveFrom: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input
                  type="date"
                  value={formData.effectiveTo}
                  onChange={(e) => setFormData({ ...formData, effectiveTo: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value: "active" | "inactive") => setFormData({ ...formData, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes or special terms..."
                rows={3}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleUpdate} disabled={!formData.customerName}>
                Update Price Structure
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false);
                  setSelectedStructure(null);
                  resetForm();
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={isBulkUpdateOpen} onOpenChange={setIsBulkUpdateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="border-b border-primary/20 pb-4">
            <DialogTitle className="text-xl">Bulk Update Price Structure</DialogTitle>
          </DialogHeader>

          <Alert className="bg-warning/10 border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Bulk Update Warning</AlertTitle>
            <AlertDescription className="text-warning/80">
              This will update all customers of the selected type with the new settings.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Customer Type</Label>
                <Select
                  value={bulkForm.customerType}
                  onValueChange={(value: CustomerType) => setBulkForm({ ...bulkForm, customerType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {customerTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Price Category</Label>
                <Select
                  value={bulkForm.priceCategory}
                  onValueChange={(value) => setBulkForm({ ...bulkForm, priceCategory: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priceCategories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Discount %</Label>
                <Input
                  type="number"
                  value={bulkForm.discount}
                  onChange={(e) => setBulkForm({ ...bulkForm, discount: parseFloat(e.target.value) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Credit Days</Label>
                <Input
                  type="number"
                  value={bulkForm.creditDays}
                  onChange={(e) => setBulkForm({ ...bulkForm, creditDays: parseInt(e.target.value) || 0 })}
                  placeholder="30"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button onClick={handleBulkUpdate}>
                Apply to All
              </Button>
              <Button variant="outline" onClick={() => setIsBulkUpdateOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Price Structure?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the price structure for <strong>{selectedStructure?.customerName}</strong>?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
