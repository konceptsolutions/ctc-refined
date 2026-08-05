import { useState, useEffect } from "react";
import { Plus, Search, Edit, MoreVertical, Trash2, X } from "lucide-react";
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
  ListNumberHeader,
  ListNumberCell,
} from "@/components/ui/list-table-number";
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
import { SearchableSelect } from "@/components/ui/searchable-select";

export interface ContactPersonInfo {
  name: string;
  designation: string;
  contactNumber: string;
}

interface Supplier {
  id: string;
  code: string;
  type: "local" | "international";
  currencyName?: string | null;
  name: string | null;
  companyName?: string | null;
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
  accountHead?: string | null;
  shortTitle?: string | null;
  referenceName?: string | null;
  area?: string | null;
  cellNumber?: string | null;
  contactPersons?: ContactPersonInfo[];
  gstNumber?: string | null;
  ntn?: string | null;
  remarks?: string | null;
  canDelete?: boolean;
}

const emptySupplier: Omit<Supplier, "id"> = {
  code: "",
  type: "local",
  currencyName: "",
  name: "",
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
  accountHead: "",
  shortTitle: "",
  referenceName: "",
  area: "",
  cellNumber: "",
  contactPersons: [],
  gstNumber: "",
  ntn: "",
  remarks: "",
};

export const SupplierManagement = () => {
  const { toast } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
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
  const [areas, setAreas] = useState<string[]>([]);
  const [supplierToDelete, setSupplierToDelete] = useState<Supplier | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const fetchAreas = async () => {
    try {
      const response = await apiClient.getAreas();
      if (response && Array.isArray(response)) {
        setAreas(response);
      } else if ((response as any).data) {
        setAreas((response as any).data);
      }
    } catch (error) {
      console.error("Error fetching areas:", error);
    }
  };

  const fetchAllSuppliers = async () => {
    try {
      const response = await apiClient.getSuppliers({
        status: "all",
        page: 1,
        limit: 10000,
      });

      if ((response as any).data) {
        setAllSuppliers((response as any).data);
      }
    } catch (error) {
      console.error("Error fetching all suppliers:", error);
    }
  };

  const fetchSuppliers = async (pageOverride?: number) => {
    setLoading(true);
    try {
      const response = await apiClient.getSuppliers({
        search: searchTerm || undefined,
        fieldFilter: fieldFilter !== "all" ? fieldFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        type: typeFilter !== "all" ? typeFilter : undefined,
        page: pageOverride ?? currentPage,
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
    fetchAreas();
    fetchAllSuppliers();
  }, [currentPage, rowsPerPage, statusFilter, typeFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [statusFilter, typeFilter]);

  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  const handleSearch = () => {
    setCurrentPage(1);
    fetchSuppliers(1);
  };

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

  const handleInputChange = (field: keyof Omit<Supplier, "id">, value: any) => {
    setFormData((prev) => {
      let updated = { ...prev };

      (updated as any)[field] = value;

      if (field === "type") {
        const nextType = value as "local" | "international";
        if (nextType !== "international") {
          updated.currencyName = "";
        } else {
          updated.cnic = "";
          updated.gstNumber = "";
          updated.ntn = "";
        }
      }

      // Auto-generate Short Title when Name changes
      if (field === "name" && typeof value === "string") {
        const initials = value
          .trim()
          .split(/\s+/)
          .filter((word) => word.length > 0)
          .map((word) => word[0].toUpperCase())
          .join("")
          .slice(0, 3);
        updated.shortTitle = initials;
      }

      return updated;
    });
  };

  const handleAddContactPerson = () => {
    setFormData((prev) => ({
      ...prev,
      contactPersons: [
        ...(prev.contactPersons || []),
        { name: "", designation: "", contactNumber: "" },
      ],
    }));
  };

  const handleUpdateContactPerson = (
    index: number,
    f: keyof ContactPersonInfo,
    v: string,
  ) => {
    setFormData((prev) => {
      const arr = [...(prev.contactPersons || [])];
      arr[index] = { ...arr[index], [f]: v };
      return { ...prev, contactPersons: arr };
    });
  };

  const handleRemoveContactPerson = (index: number) => {
    setFormData((prev) => {
      const arr = [...(prev.contactPersons || [])];
      arr.splice(index, 1);
      return { ...prev, contactPersons: arr };
    });
  };

  const handleSubmit = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    try {
      if (editingId) {
        const response = (await apiClient.updateSupplier(editingId, {
          code: formData.code,
          type: formData.type,
          currencyName:
            formData.type === "international"
              ? formData.currencyName || undefined
              : "",
          name: formData.name || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          country: formData.country || undefined,
          zipCode: formData.zipCode || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          cnic:
            formData.type === "international"
              ? ""
              : formData.cnic || undefined,
          contactPerson: formData.contactPerson || undefined,
          taxId: formData.taxId || undefined,
          paymentTerms: formData.paymentTerms || undefined,
          openingBalance: formData.openingBalance || 0,
          date: formData.date || undefined,
          status: formData.status,
          notes: formData.notes || undefined,
          accountId: formData.accountId || undefined, // Pass accountId for voucher creation
          accountHead: formData.accountHead || undefined,
          shortTitle: formData.shortTitle || undefined,
          referenceName: formData.referenceName || undefined,
          area: formData.area || undefined,
          cellNumber: formData.cellNumber || undefined,
          contactPersons: formData.contactPersons || [],
          gstNumber:
            formData.type === "international"
              ? ""
              : formData.gstNumber || undefined,
          ntn:
            formData.type === "international"
              ? ""
              : formData.ntn || undefined,
          remarks: formData.remarks || undefined,
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
          type: formData.type,
          currencyName:
            formData.type === "international"
              ? formData.currencyName || undefined
              : undefined,
          name: formData.name || undefined,
          address: formData.address || undefined,
          city: formData.city || undefined,
          state: formData.state || undefined,
          country: formData.country || undefined,
          zipCode: formData.zipCode || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          cnic:
            formData.type === "international"
              ? undefined
              : formData.cnic || undefined,
          contactPerson: formData.contactPerson || undefined,
          taxId: formData.taxId || undefined,
          paymentTerms: formData.paymentTerms || undefined,
          openingBalance: formData.openingBalance || 0,
          date: formData.date || undefined,
          status: formData.status,
          notes: formData.notes || undefined,
          accountHead: formData.accountHead || undefined,
          shortTitle: formData.shortTitle || undefined,
          referenceName: formData.referenceName || undefined,
          area: formData.area || undefined,
          cellNumber: formData.cellNumber || undefined,
          contactPersons: formData.contactPersons || [],
          gstNumber:
            formData.type === "international"
              ? undefined
              : formData.gstNumber || undefined,
          ntn:
            formData.type === "international"
              ? undefined
              : formData.ntn || undefined,
          remarks: formData.remarks || undefined,
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
            description: `New supplier "${createdSupplier?.name}" has been added with code "${createdSupplier?.code}".`,
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
      type: supplier.type || "local",
      currencyName: supplier.currencyName || "",
      name: supplier.name || supplier.companyName || "",
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
      accountHead: supplier.accountHead || "",
      shortTitle: supplier.shortTitle || "",
      referenceName: supplier.referenceName || "",
      area: supplier.area || "",
      cellNumber: supplier.cellNumber || "",
      contactPersons: supplier.contactPersons || [],
      gstNumber: supplier.gstNumber || "",
      ntn: supplier.ntn || "",
      remarks: supplier.remarks || "",
    });
    setEditingId(supplier.id);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setFormData({ ...emptySupplier });
    setEditingId(null);
    setIsDialogOpen(false);
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
            description: `${supplierToToggle.name} is now ${newStatus === "active" ? "Active" : "Inactive"}.`,
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

  const handleDelete = async () => {
    if (!supplierToDelete) return;
    try {
      setDeleting(true);
      await apiClient.deleteSupplier(supplierToDelete.id);
      toast({
        title: "Supplier Deleted",
        description: `${supplierToDelete.name || supplierToDelete.companyName || "Supplier"} has been deleted successfully.`,
      });
      setSupplierToDelete(null);
      await Promise.all([fetchSuppliers(), fetchAllSuppliers()]);
    } catch (error: any) {
      toast({
        title: "Cannot Delete Supplier",
        description:
          error?.error ||
          error?.message ||
          "Supplier cannot be deleted because transactions exist against it.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
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
                Supplier Type
              </Label>
              <Select
                value={typeFilter}
                onValueChange={(value) => {
                  setTypeFilter(value);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-36 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="local">Local</SelectItem>
                  <SelectItem value="international">International</SelectItem>
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
                  <SelectItem value="type">Type</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <SearchableSelect
                placeholder="Type to search suppliers..."
                options={allSuppliers.map((supplier) => ({
                  value: supplier.id,
                  label:
                    supplier.name ||
                    supplier.companyName ||
                    supplier.code ||
                    "Unnamed Supplier",
                  description: `${supplier.email || "No email"} • ${supplier.phone || "No contact"}`,
                }))}
                value={selectedSupplierId}
                onValueChange={(value) => {
                  if (!value) {
                    setSelectedSupplierId("");
                    setSearchTerm("");
                    return;
                  }
                  const supplier = allSuppliers.find((s) => s.id === value);
                  setSelectedSupplierId(value);
                  if (!supplier) return;
                  setSearchTerm(
                    supplier.name ||
                      supplier.companyName ||
                      supplier.code ||
                      "",
                  );
                }}
                className="w-64"
              />
            </div>
            <Button
              type="button"
              className="bg-primary text-primary-foreground h-8 text-xs px-4"
              onClick={handleSearch}
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
                  <ListNumberHeader />
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        suppliers.length > 0 &&
                        suppliers.every((s) => selectedIds.includes(s.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium">NAME</TableHead>
                  <TableHead className="text-xs font-medium">ADDRESS</TableHead>
                  <TableHead className="text-xs font-medium">EMAIL</TableHead>
                  <TableHead className="text-xs font-medium">
                    CONTACT NO
                  </TableHead>
                  <TableHead className="text-xs font-medium">TYPE</TableHead>
                  <TableHead className="text-xs font-medium">
                    CURRENCY
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
                      <ListNumberCell
                        index={index}
                        page={currentPage}
                        pageSize={rowsPerPage}
                        total={totalRecords}
                      />
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(supplier.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(supplier.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">
                        {supplier.name || supplier.companyName || "-"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {supplier.address || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-primary">
                        {supplier.email || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {supplier.phone || "-"}
                      </TableCell>
                      <TableCell className="text-xs capitalize">
                        {supplier.type || "local"}
                      </TableCell>
                      <TableCell className="text-xs uppercase">
                        {supplier.currencyName || "-"}
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
                            className={`text-xs cursor-pointer transition-colors ${
                              supplier.status === "active"
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
                          {supplier.canDelete && (
                            <ActionButtonTooltip
                              label="Delete"
                              variant="delete"
                            >
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => setSupplierToDelete(supplier)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </ActionButtonTooltip>
                          )}
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
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
            <DialogTitle className="text-sm font-semibold">
              {editingId ? "Edit Supplier" : "Add New Supplier"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Supplier Type</Label>
                <Select
                  value={formData.type}
                  onValueChange={(v) =>
                    handleInputChange("type", v as "local" | "international")
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select supplier type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="international">International</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "international" && (
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Currency Name</Label>
                  <Input
                    placeholder="e.g. USD"
                    value={formData.currencyName || ""}
                    onChange={(e) =>
                      handleInputChange("currencyName", e.target.value)
                    }
                    className="h-8 text-xs uppercase"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input
                  placeholder="Supplier title"
                  value={formData.name || ""}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Short Title</Label>
                <Input
                  placeholder="Short title"
                  value={formData.shortTitle || ""}
                  onChange={(e) =>
                    handleInputChange("shortTitle", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Reference Name</Label>
                <Input
                  placeholder="Reference"
                  value={formData.referenceName || ""}
                  onChange={(e) =>
                    handleInputChange("referenceName", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
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

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Area</Label>
                <SearchableSelect
                  placeholder="Search or add area..."
                  options={areas.map((area) => ({
                    value: area,
                    label: area,
                  }))}
                  value={formData.area || ""}
                  onValueChange={(val) => handleInputChange("area", val)}
                  allowCustom={true}
                  onCreate={async (newArea) => {
                    try {
                      await apiClient.createArea(newArea);
                      fetchAreas();
                    } catch (error) {
                      console.error("Error creating area:", error);
                    }
                  }}
                  createLabel="area"
                  className="h-8"
                />
              </div>
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
                  placeholder="State"
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Phone No</Label>
                <Input
                  placeholder="Phone number"
                  value={formData.phone || ""}
                  onChange={(e) => handleInputChange("phone", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Cell No</Label>
                <Input
                  placeholder="Cell number"
                  value={formData.cellNumber || ""}
                  onChange={(e) =>
                    handleInputChange("cellNumber", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1 lg:col-span-2">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={formData.email || ""}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            {formData.type !== "international" && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">CNIC</Label>
                  <Input
                    placeholder="CNIC number"
                    value={formData.cnic || ""}
                    onChange={(e) => handleInputChange("cnic", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">GST Number</Label>
                  <Input
                    placeholder="GST Number"
                    value={formData.gstNumber || ""}
                    onChange={(e) =>
                      handleInputChange("gstNumber", e.target.value)
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">NTN</Label>
                  <Input
                    placeholder="NTN"
                    value={formData.ntn || ""}
                    onChange={(e) => handleInputChange("ntn", e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            <div className="border border-border p-3 rounded-lg space-y-3 bg-muted/10">
              <div className="flex justify-between items-center">
                <Label className="text-xs font-semibold">Contact Persons</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddContactPerson}
                  className="h-6 text-xs px-2 bg-background"
                >
                  <Plus className="w-3 h-3 mr-1" /> Add
                </Button>
              </div>
              {(formData.contactPersons || []).map((cp, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input
                    placeholder="Person Name"
                    value={cp.name}
                    onChange={(e) =>
                      handleUpdateContactPerson(idx, "name", e.target.value)
                    }
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="Designation"
                    value={cp.designation}
                    onChange={(e) =>
                      handleUpdateContactPerson(
                        idx,
                        "designation",
                        e.target.value,
                      )
                    }
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="Contact number"
                    value={cp.contactNumber}
                    onChange={(e) =>
                      handleUpdateContactPerson(
                        idx,
                        "contactNumber",
                        e.target.value,
                      )
                    }
                    className="h-8 text-xs flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveContactPerson(idx)}
                    className="h-6 w-6"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              ))}
              {(!formData.contactPersons ||
                formData.contactPersons.length === 0) && (
                <p className="text-xs text-muted-foreground italic">
                  No contact persons added.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                <Label className="text-xs">Account Opening Balance Date</Label>
                <Input
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  className="h-8 text-xs px-2 min-w-[120px] block w-full uppercase [&::-webkit-calendar-picker-indicator]:opacity-100"
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

            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label className="text-xs">Remarks</Label>
                <Textarea
                  placeholder="Remarks..."
                  value={formData.remarks || ""}
                  onChange={(e) => handleInputChange("remarks", e.target.value)}
                  className="text-xs min-h-[60px]"
                  data-preserve-case="true"
                />
              </div>
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
              "{supplierToToggle?.name}"?
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

      <AlertDialog
        open={!!supplierToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setSupplierToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Supplier</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "
              {supplierToDelete?.name ||
                supplierToDelete?.companyName ||
                "this supplier"}
              "? This option is available because no transactions exist against
              this supplier.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
