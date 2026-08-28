import { useState, useEffect } from "react";
import { Users, Plus, Search, Trash2, X, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { usePageActions } from "@/permissions/pageActions";

interface Customer {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  cnic: string | null;
  contactNo: string | null;
  openingBalance: number;
  balance?: number;
  date: string | null;
  creditLimit: number;
  status: "active" | "closed" | "deferred";
  category?: "Reseller" | "EndUser" | null;
  accountOpeningDate?: string | null;
  accountClosingDate?: string | null;
  canDelete?: boolean;
  priceType?: "A" | "B" | "M" | null;
  accountId?: string | null; // Account ID for this customer
  code?: string | null;
  accountHead?: string | null;
  shortTitle?: string | null;
  referenceName?: string | null;
  area?: string | null;
  cellNumber?: string | null;
  contactPersons?: any[];
  gstNumber?: string | null;
  pstNumber?: string | null;
  ntn?: string | null;
  remarks?: string | null;
}

const emptyCustomer: Omit<Customer, "id"> = {
  name: "",
  address: "",
  email: "",
  cnic: "",
  contactNo: "",
  openingBalance: 0,
  date: null,
  creditLimit: 0,
  status: "active",
  priceType: null,
  accountId: null,
  code: "",
  accountHead: "",
  shortTitle: "",
  referenceName: "",
  area: "",
  cellNumber: "",
  contactPersons: [],
  gstNumber: "",
  pstNumber: "",
  ntn: "",
  remarks: "",
  category: null,
  accountOpeningDate: null,
  accountClosingDate: null,
};

export const CustomerManagement = () => {
  const { toast } = useToast();
  const {
    canCreate,
    canEdit,
    canDelete,
    canStatus,
  } = usePageActions("manage.customers");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchByField, setSearchByField] = useState<string>("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Omit<Customer, "id">>(emptyCustomer);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [areas, setAreas] = useState<string[]>([]);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(
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

  const fetchAllCustomers = async () => {
    try {
      const response = await apiClient.getCustomers({
        status: "all", // Fetch all customers regardless of status
        page: 1,
        limit: 10000, // Large limit to get all customers
      });

      if ((response as any).data) {
        setAllCustomers((response as any).data);
      }
    } catch (error) {
      console.error("Error fetching all customers:", error);
    }
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const response = await apiClient.getCustomers({
        search: searchTerm || undefined,
        searchBy: searchByField !== "name" ? searchByField : undefined,
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
        setCustomers((response as any).data || []);
        setTotalRecords((response as any).pagination?.total || 0);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch customers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
    fetchAreas();
    fetchAllCustomers();
  }, [currentPage, rowsPerPage, statusFilter]);

  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(customers.map((c) => c.id));
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
    field: keyof Omit<Customer, "id">,
    value: string | number | null,
  ) => {
    let updatedData = { ...formData, [field]: value === "" ? null : value };

    // Auto-generate Short Title when Name changes
    if (field === "name" && typeof value === "string") {
      const initials = value
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .map((word) => word[0].toUpperCase())
        .join("")
        .slice(0, 3);
      updatedData.shortTitle = initials;
    }

    setFormData(updatedData);
  };

  const formatDateForInput = (date: string | null | undefined): string => {
    if (!date) return "";
    try {
      // Handle both ISO string and already formatted date strings
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return "";
      return dateObj.toISOString().split("T")[0];
    } catch {
      return "";
    }
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
    field: string,
    value: string,
  ) => {
    setFormData((prev) => {
      const updated = [...(prev.contactPersons || [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, contactPersons: updated };
    });
  };

  const handleRemoveContactPerson = (index: number) => {
    setFormData((prev) => {
      const updated = [...(prev.contactPersons || [])];
      updated.splice(index, 1);
      return { ...prev, contactPersons: updated };
    });
  };

  const handleOpenDialog = (customer?: Customer) => {
    if (customer) {
      setFormData({
        name: customer.name,
        address: customer.address,
        email: customer.email,
        cnic: customer.cnic,
        contactNo: customer.contactNo,
        openingBalance: customer.openingBalance,
        date: formatDateForInput(customer.date),
        creditLimit: customer.creditLimit,
        status: customer.status,
        priceType: customer.priceType || null,
        accountId: customer.accountId || null, // Pass accountId for voucher creation
        code: customer.code,
        accountHead: customer.accountHead,
        shortTitle: customer.shortTitle,
        referenceName: customer.referenceName,
        area: customer.area,
        cellNumber: customer.cellNumber,
        contactPersons: customer.contactPersons || [],
        gstNumber: customer.gstNumber,
        pstNumber: customer.pstNumber,
        ntn: customer.ntn,
        remarks: customer.remarks,
        category: customer.category as any,
        accountOpeningDate: formatDateForInput(customer.accountOpeningDate),
        accountClosingDate: formatDateForInput(customer.accountClosingDate),
      });
      setEditingId(customer.id);
    } else {
      setFormData(emptyCustomer);
      setEditingId(null);
    }
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setFormData(emptyCustomer);
    setEditingId(null);
  };

  const handleSubmit = async () => {
    if (!formData.name) {
      toast({
        title: "Validation Error",
        description: "Customer name is required.",
        variant: "destructive",
      });
      return;
    }

    // Validate Date if Opening Balance is provided and not 0
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
        const response = (await apiClient.updateCustomer(editingId, {
          name: formData.name,
          address: formData.address || undefined,
          email: formData.email || undefined,
          cnic: formData.cnic || undefined,
          contactNo: formData.contactNo || undefined,
          openingBalance: formData.openingBalance,
          date: formData.date || undefined,
          creditLimit: formData.creditLimit,
          status: formData.status,
          priceType: formData.priceType || undefined,
          accountId: formData.accountId || undefined, // Pass accountId for voucher creation
          code: formData.code || undefined,
          shortTitle: formData.shortTitle || undefined,
          referenceName: formData.referenceName || undefined,
          area: formData.area || undefined,
          cellNumber: formData.cellNumber || undefined,
          contactPersons: formData.contactPersons || [],
          gstNumber: formData.gstNumber || undefined,
          pstNumber: formData.pstNumber || undefined,
          ntn: formData.ntn || undefined,
          remarks: formData.remarks || undefined,
          category: formData.category || undefined,
          accountOpeningDate: formData.accountOpeningDate || undefined,
          accountClosingDate: formData.accountClosingDate || undefined,
        })) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Customer Updated",
            description: "Customer has been updated successfully.",
          });
          handleCloseDialog();
          fetchCustomers();
        }
      } else {
        const response = (await apiClient.createCustomer({
          name: formData.name,
          address: formData.address || undefined,
          email: formData.email || undefined,
          cnic: formData.cnic || undefined,
          contactNo: formData.contactNo || undefined,
          openingBalance: formData.openingBalance,
          date: formData.date || undefined,
          creditLimit: formData.creditLimit,
          status: formData.status,
          priceType: formData.priceType || undefined,
          code: formData.code || undefined,
          shortTitle: formData.shortTitle || undefined,
          referenceName: formData.referenceName || undefined,
          area: formData.area || undefined,
          cellNumber: formData.cellNumber || undefined,
          contactPersons: formData.contactPersons || [],
          gstNumber: formData.gstNumber || undefined,
          pstNumber: formData.pstNumber || undefined,
          ntn: formData.ntn || undefined,
          remarks: formData.remarks || undefined,
          category: formData.category || undefined,
          accountOpeningDate: formData.accountOpeningDate || undefined,
          accountClosingDate: formData.accountClosingDate || undefined,
        })) as any;

        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
        } else {
          toast({
            title: "Customer Created",
            description: "New customer has been added successfully.",
          });
          handleCloseDialog();
          fetchCustomers();
        }
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save customer",
        variant: "destructive",
      });
    }
  };

  const handleStatusChange = async (
    id: string,
    newStatus: "active" | "inactive",
  ) => {
    try {
      const customer = customers.find((c) => c.id === id);
      if (!customer) return;

      const response = (await apiClient.updateCustomer(id, {
        status: newStatus,
      })) as any;

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else {
        fetchCustomers();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!customerToDelete) return;
    try {
      setDeleting(true);
      await apiClient.deleteCustomer(customerToDelete.id);
      toast({
        title: "Customer Deleted",
        description: `${customerToDelete.name} has been deleted successfully.`,
      });
      setCustomerToDelete(null);
      await Promise.all([fetchCustomers(), fetchAllCustomers()]);
    } catch (error: any) {
      toast({
        title: "Cannot Delete Customer",
        description:
          error?.error ||
          error?.message ||
          "Customer cannot be deleted because transactions exist against it.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleSearch = () => {
    setCurrentPage(1);
    fetchCustomers();
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="w-4 h-4 text-primary" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Customers</h1>
        </div>
        {canCreate && (
          <Button
            onClick={() => handleOpenDialog()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />
            Add New
          </Button>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="deferred">Deferred</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search By</Label>
              <Select value={searchByField} onValueChange={setSearchByField}>
                <SelectTrigger className="w-32 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Title</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="cnic">CNIC</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <SearchableSelect
                placeholder="Type to search customers..."
                options={allCustomers.map((c) => ({
                  value: c.id,
                  label: c.name,
                  description: `${c.email || "No email"} • ${c.contactNo || "No contact"}`,
                }))}
                value={
                  allCustomers.find((c) => c.name === searchTerm)?.id || ""
                }
                onValueChange={(value) => {
                  if (!value) {
                    setSearchTerm("");
                    return;
                  }
                  const customer = allCustomers.find((c) => c.id === value);
                  if (customer) {
                    setSearchTerm(customer.name);
                  }
                }}
                className="w-64"
              />
            </div>
            <Button
              type="button"
              className="bg-primary text-primary-foreground h-8 text-xs px-6"
              onClick={handleSearch}
            >
              <Search className="w-3 h-3 mr-1" />
              Search
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-4">
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <ListNumberHeader />
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        customers.length > 0 &&
                        customers.every((c) => selectedIds.includes(c.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium">Title</TableHead>
                  <TableHead className="text-xs font-medium">Address</TableHead>
                  <TableHead className="text-xs font-medium">Email</TableHead>
                  <TableHead className="text-xs font-medium">CNIC</TableHead>
                  <TableHead className="text-xs font-medium">
                    Contact No
                  </TableHead>
                  <TableHead className="text-xs font-medium text-right">
                    Balance
                  </TableHead>
                  <TableHead className="text-xs font-medium text-right">
                    Credit Limit
                  </TableHead>
                  <TableHead className="text-xs font-medium">Status</TableHead>
                  <TableHead className="text-xs font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-8 text-xs text-muted-foreground"
                    >
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="text-center py-8 text-xs text-muted-foreground"
                    >
                      No customers found
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer, index) => (
                    <TableRow key={customer.id} className="hover:bg-muted/20">
                      <ListNumberCell
                        index={index}
                        page={currentPage}
                        pageSize={rowsPerPage}
                        total={totalRecords}
                      />
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(customer.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(customer.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {customer.name}
                      </TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">
                        {customer.address || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-primary">
                        {customer.email || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {customer.cnic || "-"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {customer.contactNo || "-"}
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        Rs{" "}
                        {(
                          customer.balance ?? customer.openingBalance
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium text-red-600">
                        Rs{" "}
                        {customer.creditLimit.toLocaleString(undefined, {
                          minimumFractionDigits: 0,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        {canStatus ? (
                          <Select
                            value={customer.status}
                            onValueChange={(v) =>
                              handleStatusChange(
                                customer.id,
                                v as "active" | "inactive",
                              )
                            }
                          >
                            <SelectTrigger
                              className={`h-6 w-20 text-xs ${
                                customer.status === "active"
                                  ? "bg-green-100 text-green-700 border-green-200"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={
                              customer.status === "active"
                                ? "default"
                                : "secondary"
                            }
                            className={`text-xs ${
                              customer.status === "active"
                                ? "bg-green-100 text-green-700"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {customer.status === "active"
                              ? "Active"
                              : "Inactive"}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-primary"
                              onClick={() => handleOpenDialog(customer)}
                              title="Edit"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canDelete && customer.canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => setCustomerToDelete(customer)}
                              title="Delete customer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
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
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">
              Showing{" "}
              {Math.min((currentPage - 1) * rowsPerPage + 1, totalRecords)} to{" "}
              {Math.min(currentPage * rowsPerPage, totalRecords)} of{" "}
              {totalRecords} Records
            </p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                Rows per page:
              </span>
              <Select
                value={rowsPerPage.toString()}
                onValueChange={(v) => {
                  // The useEffect on [currentPage, rowsPerPage, statusFilter]
                  // refetches with the new values; calling fetchCustomers here
                  // would race with a stale closure.
                  setRowsPerPage(Number(v));
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-16 h-7 text-xs">
                  <SelectValue placeholder={rowsPerPage} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Prev
                </Button>
                <span className="h-7 px-2 flex items-center text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages || 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || totalPages === 0}
                >
                  Last
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
            <DialogTitle className="text-sm font-semibold">
              {editingId ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <Input
                  placeholder="Auto-generated"
                  value={formData.code || ""}
                  onChange={(e) => handleInputChange("code", e.target.value)}
                  className="h-8 text-xs"
                  readOnly={!editingId}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title *</Label>
                <Input
                  placeholder="Customer title"
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Address</Label>
                <Input
                  placeholder="Full address"
                  value={formData.address || ""}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
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
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Contact No</Label>
                <Input
                  placeholder="Contact number"
                  value={formData.contactNo || ""}
                  onChange={(e) =>
                    handleInputChange("contactNo", e.target.value)
                  }
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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
                <Label className="text-xs">PST Number</Label>
                <Input
                  placeholder="PST Number"
                  value={formData.pstNumber || ""}
                  onChange={(e) =>
                    handleInputChange("pstNumber", e.target.value)
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
                    value={cp.name || ""}
                    onChange={(e) =>
                      handleUpdateContactPerson(idx, "name", e.target.value)
                    }
                    className="h-8 text-xs flex-1"
                  />
                  <Input
                    placeholder="Designation"
                    value={cp.designation || ""}
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
                    value={cp.contactNumber || ""}
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={formData.category ? formData.category : "none"}
                  onValueChange={(v) =>
                    handleInputChange("category", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="Reseller">Reseller</SelectItem>
                    <SelectItem value="EndUser">End User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opening Date</Label>
                <Input
                  type="date"
                  value={formData.accountOpeningDate || ""}
                  onChange={(e) =>
                    handleInputChange("accountOpeningDate", e.target.value)
                  }
                  className="h-8 text-xs px-2 min-w-[120px] block w-full uppercase [&::-webkit-calendar-picker-indicator]:opacity-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Closing Date</Label>
                <Input
                  type="date"
                  value={formData.accountClosingDate || ""}
                  onChange={(e) =>
                    handleInputChange("accountClosingDate", e.target.value)
                  }
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
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="deferred">Deferred</SelectItem>
                  </SelectContent>
                </Select>
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
                <Label className="text-xs">OB Date</Label>
                <Input
                  type="date"
                  value={formData.date || ""}
                  onChange={(e) => handleInputChange("date", e.target.value)}
                  className="h-8 text-xs px-2 min-w-[120px] block w-full uppercase [&::-webkit-calendar-picker-indicator]:opacity-100"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Credit Limit</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.creditLimit}
                  onChange={(e) =>
                    handleInputChange("creditLimit", Number(e.target.value))
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Price Type</Label>
                <Select
                  value={formData.priceType ? formData.priceType : "none"}
                  onValueChange={(v) =>
                    handleInputChange("priceType", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Price Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="A">Price A</SelectItem>
                    <SelectItem value="B">Price B</SelectItem>
                    <SelectItem value="M">Price M</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
              >
                {editingId ? "Update" : "Save"}
              </Button>
              <Button
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

      <AlertDialog
        open={!!customerToDelete}
        onOpenChange={(open) => {
          if (!open && !deleting) setCustomerToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Delete "{customerToDelete?.name}"? This option is available
              because no transactions exist against this customer.
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
