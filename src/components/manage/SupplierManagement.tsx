import { useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, MoreVertical, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface Supplier {
  id: string;
  code: string;
  name: string | null;
  companyName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  zipCode: string | null;
  email: string | null;
  phone: string | null;
  cnic: string | null;
  contactPerson: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  openingBalance: number;
  date: string | null;
  status: "active" | "inactive";
  notes: string | null;
  accountId?: string | null; // Account ID for this supplier
}

const emptySupplier: Omit<Supplier, "id"> = {
  code: "",
  name: "",
  companyName: "",
  address: "",
  city: "",
  state: "",
  country: "",
  zipCode: "",
  email: "",
  phone: "",
  cnic: "",
  contactPerson: "",
  taxId: "",
  paymentTerms: "",
  openingBalance: 0,
  date: "",
  status: "active",
  notes: "",
  accountId: null,
};

export const SupplierManagement = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [fieldFilter, setFieldFilter] = useState<string>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formData, setFormData] = useState<Omit<Supplier, "id">>(emptySupplier);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [supplierToToggle, setSupplierToToggle] = useState<Supplier | null>(
    null,
  );

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getSuppliers({
        search: searchTerm || undefined,
        fieldFilter: fieldFilter !== "all" ? fieldFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        page: currentPage,
        limit: rowsPerPage,
      });

      if ((response as any).error) {
        toast({
          title: "Error",
          description: (response as any).error,
          variant: "destructive",
        });
      } else {
        setSuppliers((response as any).data || []);
        setTotalRecords((response as any).pagination?.total || 0);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch suppliers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, [currentPage, rowsPerPage, statusFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [statusFilter]);

  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(suppliers.map((s) => s.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id]);
    } else {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    }
  };

  const handleInputChange = (
    field: keyof Omit<Supplier, "id">,
    value: string | number,
  ) => {
    setFormData((prev) => {
      // If field is companyName, ensure it's not undefined/null if that's passed
      if (field === "companyName" && (value === undefined || value === null)) {
        return { ...prev, [field]: "" };
      }
      return { ...prev, [field]: value };
    });
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    // Validate Company Name - ensure it's not empty or just whitespace
    if (!formData.companyName || formData.companyName.trim() === "") {
      toast({
        title: "Validation Error",
        description: "Company Name is required.",
        variant: "destructive",
      });
      return;
    }

    // Validate Date if Opening Balance is provided and not 0
    // Check for both number 0 and string "0" (or empty string which usually means 0 in this context validation)
    const balanceValue = Number(formData.openingBalance);
    if (!isNaN(balanceValue) && balanceValue !== 0) {
      if (!formData.date || formData.date.trim() === "") {
        toast({
          title: "Validation Error",
          description: "Date is required when an Opening Balance is provided.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      if (editingId) {
        const response = (await apiClient.updateSupplier(editingId, {
          code: formData.code,
          name: formData.name || undefined,
          companyName: formData.companyName,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          country: formData.country || undefined,
          zipCode: formData.zipCode || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          cnic: formData.cnic || undefined,
          contactPerson: formData.contactPerson || undefined,
          taxId: formData.taxId || undefined,
          paymentTerms: formData.paymentTerms || undefined,
          openingBalance: formData.openingBalance || 0,
          date: formData.date || undefined,
          status: formData.status,
          notes: formData.notes || undefined,
          accountId: formData.accountId || undefined, // Pass accountId for voucher creation
        })) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Supplier Updated",
            description: "Supplier has been updated successfully.",
          });
          setFormData(emptySupplier);
          setEditingId(null);
          setIsDialogOpen(false);
          fetchSuppliers();
        }
      } else {
        // Don't send code field if it's empty - let backend auto-generate
        const supplierData: any = {
          name: formData.name || undefined,
          companyName: formData.companyName,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          country: formData.country || undefined,
          zipCode: formData.zipCode || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          cnic: formData.cnic || undefined,
          contactPerson: formData.contactPerson || undefined,
          taxId: formData.taxId || undefined,
          paymentTerms: formData.paymentTerms || undefined,
          openingBalance: formData.openingBalance || 0,
          date: formData.date || undefined,
          status: formData.status,
          notes: formData.notes || undefined,
        };

        // Only include code if it's provided and not empty
        if (formData.code && formData.code.trim() !== "") {
          supplierData.code = formData.code.trim();
        }

        const response = (await apiClient.createSupplier(supplierData)) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          const createdSupplier = (response as any).data;
          toast({
            title: "Supplier Created",
            description: `New supplier "${createdSupplier?.companyName}" has been added with code "${createdSupplier?.code}".`,
          });
          setFormData(emptySupplier);
          setEditingId(null);
          setIsDialogOpen(false);
          fetchSuppliers();
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save supplier",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (supplier: Supplier) => {
    setFormData({
      code: supplier.code,
      name: supplier.name || "",
      companyName: supplier.companyName || "", // Ensure string
      address: supplier.address || "",
      city: supplier.city || "",
      state: supplier.state || "",
      country: supplier.country || "",
      zipCode: supplier.zipCode || "",
      email: supplier.email || "",
      phone: supplier.phone || "",
      cnic: supplier.cnic || "",
      contactPerson: supplier.contactPerson || "",
      taxId: supplier.taxId || "",
      paymentTerms: supplier.paymentTerms || "",
      openingBalance: supplier.openingBalance || 0,
      date: supplier.date
        ? new Date(supplier.date).toISOString().split("T")[0]
        : "",
      status: supplier.status,
      notes: supplier.notes || "",
      accountId: supplier.accountId || null, // Pass accountId for voucher creation
    });
    setEditingId(supplier.id);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setFormData({ ...emptySupplier });
    setEditingId(null);
    setIsDialogOpen(false);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = (await apiClient.deleteSupplier(id)) as any;
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Supplier Deleted",
          description: "Supplier has been removed.",
        });
        fetchSuppliers();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete supplier",
        variant: "destructive",
      });
    }
  };

  const handleToggleStatusClick = (supplier: Supplier) => {
    setSupplierToToggle(supplier);
    setStatusConfirmOpen(true);
  };

  const handleToggleStatusConfirm = async () => {
    if (supplierToToggle) {
      const newStatus =
        supplierToToggle.status === "active" ? "inactive" : "active";
      try {
        const response = (await apiClient.updateSupplier(supplierToToggle.id, {
          status: newStatus,
        })) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Status Updated",
            description: `${supplierToToggle.companyName} is now ${newStatus === "active" ? "Active" : "Inactive"}.`,
          });
          fetchSuppliers();
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to update status",
          variant: "destructive",
        });
      }
    }
    setStatusConfirmOpen(false);
    setSupplierToToggle(null);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">
            Supplier Management
          </h1>
          <p className="text-xs text-muted-foreground">
            Manage your suppliers for purchase orders
          </p>
        </div>
        <Button
          onClick={() => {
            console.log("New Supplier Button Clicked - Resetting form");
            setFormData({ ...emptySupplier });
            setEditingId(null);
            setIsDialogOpen(true);
          }}
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          New Supplier
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <h2 className="text-sm font-semibold text-foreground">Suppliers</h2>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Active/Inactive
              </Label>
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                All Fields
              </Label>
              <Select
                value={fieldFilter}
                onValueChange={(value) => {
                  setFieldFilter(value);
                }}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Fields</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
            <Button
              className="bg-primary text-primary-foreground h-8 text-xs px-4"
              onClick={() => {
                setCurrentPage(1);
                fetchSuppliers();
              }}
            >
              <Search className="w-3 h-3 mr-1" />
              Search
            </Button>
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        suppliers.length > 0 &&
                        suppliers.every((s) => selectedIds.includes(s.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium">SR. NO</TableHead>
                  <TableHead className="text-xs font-medium">NAME</TableHead>
                  <TableHead className="text-xs font-medium">
                    COMPANY NAME
                  </TableHead>
                  <TableHead className="text-xs font-medium">ADDRESS</TableHead>
                  <TableHead className="text-xs font-medium">EMAIL</TableHead>
                  <TableHead className="text-xs font-medium">CNIC</TableHead>
                  <TableHead className="text-xs font-medium">
                    CONTACT NO
                  </TableHead>
                  <TableHead className="text-xs font-medium">STATUS</TableHead>
                  <TableHead className="text-xs font-medium">ACTIONS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-8 text-xs text-muted-foreground"
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : suppliers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={10}
                      className="text-center py-8 text-xs text-muted-foreground"
                    >
                      No suppliers found
                    </TableCell>
                  </TableRow>
                ) : (
                  suppliers.map((supplier, index) => (
                    <TableRow key={supplier.id} className="hover:bg-muted/20">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(supplier.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(supplier.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {(currentPage - 1) * rowsPerPage + index + 1}
                      </TableCell>
                      <TableCell className="text-xs">
                        {supplier.name || "-"}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {supplier.companyName}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {supplier.address || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-primary">
                        {supplier.email || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {supplier.cnic || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {supplier.phone || "-"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleStatusClick(supplier)}
                          title="Click to toggle status"
                        >
                          <Badge
                            variant={
                              supplier.status === "active"
                                ? "default"
                                : "secondary"
                            }
                            className={`text-xs cursor-pointer transition-colors ${supplier.status === "active"
                              ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700"
                              : "bg-muted text-muted-foreground hover:bg-green-100 hover:text-green-700"
                              }`}
                          >
                            •{" "}
                            {supplier.status === "active"
                              ? "Active"
                              : "Inactive"}
                          </Badge>
                        </button>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <ActionButtonTooltip label="Edit" variant="edit">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-primary hover:text-primary/80"
                              onClick={() => handleEdit(supplier)}
                            >
                              <Edit className="w-3 h-3" />
                            </Button>
                          </ActionButtonTooltip>
                          <ActionButtonTooltip label="Delete" variant="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-destructive hover:text-destructive/80"
                              onClick={() => handleDelete(supplier.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </ActionButtonTooltip>
                          <ActionButtonTooltip
                            label="More Actions"
                            variant="more"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                            >
                              <MoreVertical className="w-3 h-3" />
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

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {totalRecords === 0 ? (
                <>Showing 0 to 0 of 0 Records</>
              ) : (
                <>
                  Showing{" "}
                  {Math.min((currentPage - 1) * rowsPerPage + 1, totalRecords)}{" "}
                  to {Math.min(currentPage * rowsPerPage, totalRecords)} of{" "}
                  {totalRecords} Records
                </>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Select
                value={rowsPerPage.toString()}
                onValueChange={(v) => {
                  setRowsPerPage(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-16 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCurrentPage(1);
                  }}
                  disabled={currentPage === 1 || totalPages === 0}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCurrentPage(Math.max(1, currentPage - 1));
                  }}
                  disabled={currentPage === 1 || totalPages === 0}
                >
                  Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCurrentPage(Math.min(totalPages, currentPage + 1));
                  }}
                  disabled={currentPage >= totalPages || totalPages === 0}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setCurrentPage(totalPages);
                  }}
                  disabled={currentPage >= totalPages || totalPages === 0}
                >
                  Last
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          console.log("Dialog Open Change:", open);
          setIsDialogOpen(open);
        }}
      >
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
            <DialogTitle className="text-sm font-semibold">
              {editingId ? "Edit Supplier" : "Add New Supplier"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  placeholder="Supplier name"
                  value={formData.name || ""}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact No</Label>
                <Input
                  placeholder="Contact number"
                  value={formData.phone || ""}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={formData.email || ""}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CNIC</Label>
                <Input
                  placeholder="CNIC number"
                  value={formData.cnic || ""}
                  onChange={(e) => handleInputChange("cnic", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Company Name *</Label>
              <Input
                placeholder="Company name"
                value={formData.companyName || ""}
                onChange={(e) =>
                  handleInputChange("companyName", e.target.value)
                }
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                placeholder="Full address"
                value={formData.address || ""}
                onChange={(e) => handleInputChange("address", e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">City</Label>
                <Input
                  placeholder="City"
                  value={formData.city || ""}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">State</Label>
                <Input
                  placeholder="State/Province"
                  value={formData.state || ""}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Country</Label>
                <Input
                  placeholder="Country"
                  value={formData.country || ""}
                  onChange={(e) => handleInputChange("country", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Zip Code</Label>
                <Input
                  placeholder="Zip/Postal code"
                  value={formData.zipCode || ""}
                  onChange={(e) => handleInputChange("zipCode", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Contact Person</Label>
                <Input
                  placeholder="Contact person"
                  value={formData.contactPerson || ""}
                  onChange={(e) =>
                    handleInputChange("contactPerson", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tax ID</Label>
                <Input
                  placeholder="Tax ID"
                  value={formData.taxId || ""}
                  onChange={(e) => handleInputChange("taxId", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Payment Terms</Label>
                <Input
                  placeholder="Payment terms"
                  value={formData.paymentTerms || ""}
                  onChange={(e) =>
                    handleInputChange("paymentTerms", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => handleInputChange("status", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Opening Balance</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={
                    formData.openingBalance === 0 ? "" : formData.openingBalance
                  }
                  onChange={(e) =>
                    handleInputChange("openingBalance", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea
                placeholder="Additional notes..."
                value={formData.notes || ""}
                onChange={(e) => handleInputChange("notes", e.target.value)}
                className="text-xs min-h-[60px]"
                data-preserve-case="true"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={handleSubmit}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                {editingId ? "Update" : "Save"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseDialog}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Status Toggle Confirmation Dialog */}
      <AlertDialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change Supplier Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to{" "}
              {supplierToToggle?.status === "active"
                ? "deactivate"
                : "activate"}{" "}
              "{supplierToToggle?.companyName}"?
              {supplierToToggle?.status === "active"
                ? " This supplier will no longer appear in active supplier lists."
                : " This supplier will be available for new purchase orders."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleStatusConfirm}
              className={
                supplierToToggle?.status === "active"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-green-600 text-white hover:bg-green-700"
              }
            >
              {supplierToToggle?.status === "active"
                ? "Deactivate"
                : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
