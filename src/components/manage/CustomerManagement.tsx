import { useState, useEffect } from "react";
import { Users, Plus, Search } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface Customer {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  cnic: string | null;
  contactNo: string | null;
  openingBalance: number;
  date: string | null;
  creditLimit: number;
  status: "active" | "inactive";
  priceType?: "A" | "B" | "M" | null;
  accountId?: string | null; // Account ID for this customer
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
};

export const CustomerManagement = () => {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
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
    setFormData({ ...formData, [field]: value === "" ? null : value });
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

  const handleDelete = async (id: string) => {
    try {
      const response = (await apiClient.deleteCustomer(id)) as any;
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Customer Deleted",
          description: "Customer has been removed.",
        });
        fetchCustomers();
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
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
        <Button
          onClick={() => handleOpenDialog()}
          className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add New
        </Button>
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
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
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
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="cnic">CNIC</SelectItem>
                  <SelectItem value="contact">Contact</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Search</Label>
              <Input
                placeholder="Enter search term..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-48 h-8 text-xs"
              />
            </div>
            <Button
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        customers.length > 0 &&
                        customers.every((c) => selectedIds.includes(c.id))
                      }
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="text-xs font-medium">Sr. No</TableHead>
                  <TableHead className="text-xs font-medium">Name</TableHead>
                  <TableHead className="text-xs font-medium">Address</TableHead>
                  <TableHead className="text-xs font-medium">Email</TableHead>
                  <TableHead className="text-xs font-medium">CNIC</TableHead>
                  <TableHead className="text-xs font-medium">
                    Contact No
                  </TableHead>
                  <TableHead className="text-xs font-medium text-right">
                    Opening Balance
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
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.includes(customer.id)}
                          onCheckedChange={(checked) =>
                            handleSelectOne(customer.id, checked as boolean)
                          }
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {(currentPage - 1) * rowsPerPage + index + 1}
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
                        Rs {customer.openingBalance.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-xs text-right font-medium">
                        Rs {customer.creditLimit.toFixed(2)}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs text-primary"
                            onClick={() => handleOpenDialog(customer)}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs text-destructive"
                            onClick={() => handleDelete(customer.id)}
                          >
                            Delete
                          </Button>
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
                  setRowsPerPage(Number(v));
                  setCurrentPage(1);
                  setTimeout(() => fetchCustomers(), 0);
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
        <DialogContent className="max-w-md">
          <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
            <DialogTitle className="text-sm font-semibold">
              {editingId ? "Edit Customer" : "Add New Customer"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input
                  placeholder="Customer name"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact No</Label>
                <Input
                  placeholder="Contact number"
                  value={formData.contactNo}
                  onChange={(e) =>
                    handleInputChange("contactNo", e.target.value)
                  }
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input
                  type="email"
                  placeholder="Email address"
                  value={formData.email}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">CNIC</Label>
                <Input
                  placeholder="CNIC number"
                  value={formData.cnic}
                  onChange={(e) => handleInputChange("cnic", e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                placeholder="Full address"
                value={formData.address}
                onChange={(e) => handleInputChange("address", e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
              <div className="space-y-1">
                <Label className="text-xs">Price Type</Label>
                <Select
                  value={formData.priceType ? formData.priceType : "none"}
                  onValueChange={(v) =>
                    handleInputChange("priceType", v === "none" ? null : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Price Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="A">Price A (Retail)</SelectItem>
                    <SelectItem value="B">Price B (Wholesale)</SelectItem>
                    <SelectItem value="M">Price M (Market)</SelectItem>
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
    </div>
  );
};
