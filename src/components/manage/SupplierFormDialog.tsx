import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { apiClient } from "@/lib/api";
import { toast } from "sonner";

export interface ContactPersonInfo {
  name: string;
  designation: string;
  contactNumber: string;
}

export interface SupplierFormValues {
  code: string;
  type: "local" | "international";
  currencyName: string;
  name: string;
  companyName: string;
  address: string;
  city: string;
  state: string;
  country: string;
  zipCode: string;
  email: string;
  phone: string;
  cnic: string;
  contactPerson: string;
  taxId: string;
  paymentTerms: string;
  openingBalance: number;
  date: string;
  status: "active" | "inactive";
  notes: string;
  accountHead: string;
  shortTitle: string;
  referenceName: string;
  area: string;
  cellNumber: string;
  contactPersons: ContactPersonInfo[];
  gstNumber: string;
  ntn: string;
  remarks: string;
}

export type SupplierFormSavedSupplier = {
  id: string;
  name?: string | null;
  companyName?: string | null;
  code?: string | null;
};

const emptyForm = (
  type: "local" | "international" = "local",
): SupplierFormValues => ({
  code: "",
  type,
  currencyName: "",
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
  accountHead: "",
  shortTitle: "",
  referenceName: "",
  area: "",
  cellNumber: "",
  contactPersons: [],
  gstNumber: "",
  ntn: "",
  remarks: "",
});

interface SupplierFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (supplier: SupplierFormSavedSupplier) => void;
  title?: string;
  /** Initial supplier type when the dialog opens. */
  defaultType?: "local" | "international";
  /** When true, supplier type cannot be changed. */
  typeLocked?: boolean;
}

export function SupplierFormDialog({
  open,
  onOpenChange,
  onSaved,
  title = "Add New Supplier",
  defaultType = "local",
  typeLocked = false,
}: SupplierFormDialogProps) {
  const [formData, setFormData] = useState<SupplierFormValues>(() =>
    emptyForm(defaultType),
  );
  const [areas, setAreas] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (open) {
      setFormData(emptyForm(defaultType));
      fetchAreas();
    }
  }, [open, defaultType]);

  const handleInputChange = (field: keyof SupplierFormValues, value: any) => {
    setFormData((prev) => {
      const updated: SupplierFormValues = { ...prev, [field]: value };

      if (field === "name" && typeof value === "string") {
        const words = value.trim().split(/\s+/).filter(Boolean);
        const initials = words
          .map((w) => w[0]?.toUpperCase() || "")
          .join("")
          .slice(0, 3);
        updated.shortTitle = initials;
      }

      if (field === "type" && value !== "international") {
        updated.currencyName = "";
      }
      if (field === "type" && value === "international") {
        updated.cnic = "";
        updated.gstNumber = "";
        updated.ntn = "";
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

  const handleSubmit = async () => {
    const titleName = formData.name.trim() || formData.companyName.trim();
    if (!titleName) {
      toast.error("Please enter supplier title or company name");
      return;
    }

    const balanceValue = Number(formData.openingBalance);
    if (!isNaN(balanceValue) && balanceValue !== 0) {
      if (!formData.date || formData.date.trim() === "") {
        toast.error("Date is required when an Opening Balance is provided.");
        return;
      }
    }

    try {
      setSaving(true);
      const supplierData: any = {
        type: formData.type,
        currencyName:
          formData.type === "international"
            ? formData.currencyName || undefined
            : undefined,
        companyName: formData.companyName.trim() || titleName,
        name: formData.name.trim() || titleName,
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

      if (formData.code && formData.code.trim() !== "") {
        supplierData.code = formData.code.trim();
      }

      const response = (await apiClient.createSupplier(supplierData)) as any;
      if (response.error) {
        toast.error(response.error);
        return;
      }

      const created = response.data as SupplierFormSavedSupplier;
      toast.success(
        `Supplier "${created?.name || created?.companyName || titleName}" added${
          created?.code ? ` (${created.code})` : ""
        }`,
      );
      onOpenChange(false);
      onSaved?.(created);
    } catch (error: any) {
      toast.error(error.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
          <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
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
                disabled={typeLocked}
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
                onChange={(e) => handleInputChange("shortTitle", e.target.value)}
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Company Name</Label>
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
              <Label className="text-xs">Code (optional)</Label>
              <Input
                placeholder="Auto-generated if empty"
                value={formData.code || ""}
                onChange={(e) => handleInputChange("code", e.target.value)}
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
                  onChange={(e) => handleInputChange("gstNumber", e.target.value)}
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
                  handleInputChange(
                    "openingBalance",
                    e.target.value === "" ? 0 : Number(e.target.value),
                  )
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
              disabled={saving}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
