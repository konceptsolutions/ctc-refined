import { useState, useEffect } from "react";
import { Plus, X } from "lucide-react";
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
    DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

interface CustomerFormData {
    name: string;
    code: string;
    shortTitle: string;
    referenceName: string;
    address: string;
    area: string;
    contactNo: string;
    cellNumber: string;
    email: string;
    cnic: string;
    gstNumber: string;
    pstNumber: string;
    ntn: string;
    contactPersons: { name: string; designation: string; contactNumber: string }[];
    category: "Reseller" | "EndUser" | "";
    accountOpeningDate: string;
    accountClosingDate: string;
    status: "active" | "inactive";
    openingBalance: number;
    date: string;
    creditLimit: number;
    priceType: "A" | "B" | "M" | "";
    remarks: string;
}

const emptyForm: CustomerFormData = {
    name: "",
    code: "",
    shortTitle: "",
    referenceName: "",
    address: "",
    area: "",
    contactNo: "",
    cellNumber: "",
    email: "",
    cnic: "",
    gstNumber: "",
    pstNumber: "",
    ntn: "",
    contactPersons: [],
    category: "",
    accountOpeningDate: "",
    accountClosingDate: "",
    status: "active",
    openingBalance: 0,
    date: "",
    creditLimit: 0,
    priceType: "",
    remarks: "",
};

export type CustomerFormSavedCustomer = {
    id: string;
    name: string;
    priceType: string | null;
    category?: string | null;
};

interface CustomerFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    customerId?: string | null;
    onCreated?: (customer: CustomerFormSavedCustomer) => void;
    onUpdated?: (customer: CustomerFormSavedCustomer) => void;
}

const formatDateForInput = (value?: string | null) => {
    if (!value) return "";
    const dateObj = new Date(value);
    if (Number.isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0];
};

const mapCustomerToForm = (customer: any): CustomerFormData => ({
    name: customer.name || "",
    code: customer.code || "",
    shortTitle: customer.shortTitle || "",
    referenceName: customer.referenceName || "",
    address: customer.address || "",
    area: customer.area || "",
    contactNo: customer.contactNo || "",
    cellNumber: customer.cellNumber || "",
    email: customer.email || "",
    cnic: customer.cnic || "",
    gstNumber: customer.gstNumber || "",
    pstNumber: customer.pstNumber || "",
    ntn: customer.ntn || "",
    contactPersons: Array.isArray(customer.contactPersons)
        ? customer.contactPersons
        : [],
    category: customer.category === "Reseller" || customer.category === "EndUser"
        ? customer.category
        : "",
    accountOpeningDate: formatDateForInput(customer.accountOpeningDate),
    accountClosingDate: formatDateForInput(customer.accountClosingDate),
    status: customer.status === "inactive" ? "inactive" : "active",
    openingBalance: Number(customer.openingBalance || 0),
    date: formatDateForInput(customer.date),
    creditLimit: Number(customer.creditLimit || 0),
    priceType:
        customer.priceType === "A" ||
        customer.priceType === "B" ||
        customer.priceType === "M"
            ? customer.priceType
            : "",
    remarks: customer.remarks || "",
});

export const CustomerFormDialog = ({
    open,
    onOpenChange,
    customerId = null,
    onCreated,
    onUpdated,
}: CustomerFormDialogProps) => {
    const [form, setForm] = useState<CustomerFormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [loadingCustomer, setLoadingCustomer] = useState(false);
    const [areas, setAreas] = useState<string[]>([]);
    const isEditMode = Boolean(customerId);

    useEffect(() => {
        if (!open) return;

        apiClient.getAreas().then((res: any) => {
            const list = Array.isArray(res) ? res : res?.data || [];
            setAreas(list);
        }).catch(() => { });

        if (!customerId) {
            setForm(emptyForm);
            return;
        }

        const loadCustomer = async () => {
            setLoadingCustomer(true);
            try {
                const response = await apiClient.getCustomer(customerId);
                const customer = (response as any)?.data || response;
                if (!customer?.id) {
                    throw new Error("Customer not found");
                }
                setForm(mapCustomerToForm(customer));
            } catch (err: any) {
                toast({
                    title: "Error",
                    description: err.message || "Failed to load customer details",
                    variant: "destructive",
                });
                onOpenChange(false);
            } finally {
                setLoadingCustomer(false);
            }
        };

        void loadCustomer();
    }, [open, customerId, onOpenChange]);

    const set = (field: keyof CustomerFormData, value: any) => {
        setForm((prev) => {
            const updated = { ...prev, [field]: value };
            // Auto-generate short title from name
            if (field === "name" && typeof value === "string") {
                const initials = value.trim().split(/\s+/).filter(Boolean).map((w: string) => w[0].toUpperCase()).join("").slice(0, 3);
                updated.shortTitle = initials;
            }
            return updated;
        });
    };

    const addContactPerson = () => {
        setForm((prev) => ({
            ...prev,
            contactPersons: [...prev.contactPersons, { name: "", designation: "", contactNumber: "" }],
        }));
    };

    const updateContactPerson = (idx: number, field: string, value: string) => {
        setForm((prev) => {
            const updated = [...prev.contactPersons];
            updated[idx] = { ...updated[idx], [field]: value };
            return { ...prev, contactPersons: updated };
        });
    };

    const removeContactPerson = (idx: number) => {
        setForm((prev) => {
            const updated = [...prev.contactPersons];
            updated.splice(idx, 1);
            return { ...prev, contactPersons: updated };
        });
    };

    const handleSave = async () => {
        if (!form.name.trim()) {
            toast({ title: "Error", description: "Customer name is required", variant: "destructive" });
            return;
        }
        if (form.openingBalance !== 0 && !form.date) {
            toast({ title: "Error", description: "Date is required when Opening Balance is set", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const payload = {
                name: form.name.trim(),
                code: form.code || undefined,
                shortTitle: form.shortTitle || undefined,
                referenceName: form.referenceName || undefined,
                address: form.address || undefined,
                area: form.area || undefined,
                contactNo: form.contactNo || undefined,
                cellNumber: form.cellNumber || undefined,
                email: form.email || undefined,
                cnic: form.cnic || undefined,
                gstNumber: form.gstNumber || undefined,
                pstNumber: form.pstNumber || undefined,
                ntn: form.ntn || undefined,
                contactPersons: form.contactPersons.length > 0 ? form.contactPersons : [],
                category: form.category || undefined,
                accountOpeningDate: form.accountOpeningDate || undefined,
                accountClosingDate: form.accountClosingDate || undefined,
                status: form.status,
                openingBalance: form.openingBalance || 0,
                date: form.date || undefined,
                creditLimit: form.creditLimit || 0,
                priceType: form.priceType || undefined,
                remarks: form.remarks || undefined,
            } as any;

            const response = isEditMode
                ? await apiClient.updateCustomer(customerId!, payload)
                : await apiClient.createCustomer(payload);

            if ((response as any).error) {
                toast({ title: "Error", description: (response as any).error, variant: "destructive" });
                return;
            }

            const saved = (response as any).data || response;
            const savedCustomer: CustomerFormSavedCustomer = {
                id: saved.id || customerId!,
                name: saved.name || form.name.trim(),
                priceType: form.priceType || null,
                category: form.category || null,
            };

            if (isEditMode) {
                toast({
                    title: "Customer Updated",
                    description: `"${savedCustomer.name}" has been updated successfully.`,
                });
                onUpdated?.(savedCustomer);
            } else {
                toast({
                    title: "Customer Created",
                    description: `"${savedCustomer.name}" has been added successfully.`,
                });
                onCreated?.(savedCustomer);
            }
            onOpenChange(false);
        } catch (err: any) {
            toast({
                title: "Error",
                description:
                    err.message ||
                    (isEditMode ? "Failed to update customer" : "Failed to create customer"),
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="bg-primary text-primary-foreground -m-6 mb-4 p-4 rounded-t-lg">
                    <DialogTitle className="text-sm font-semibold">
                        {isEditMode ? "Edit Customer" : "Add New Customer"}
                    </DialogTitle>
                </DialogHeader>

                {loadingCustomer ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                        Loading customer details...
                    </p>
                ) : (
                <div className="space-y-4 pt-2">
                    {/* Row 1: Code, Title, Short Title, Reference Name */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Code</Label>
                            <Input
                                placeholder="Auto-generated"
                                value={form.code}
                                onChange={(e) => set("code", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Title *</Label>
                            <Input
                                placeholder="Customer name"
                                value={form.name}
                                onChange={(e) => set("name", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Short Title</Label>
                            <Input
                                placeholder="Short title"
                                value={form.shortTitle}
                                onChange={(e) => set("shortTitle", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Reference Name</Label>
                            <Input
                                placeholder="Reference"
                                value={form.referenceName}
                                onChange={(e) => set("referenceName", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Row 2: Address, Area */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Address</Label>
                            <Input
                                placeholder="Full address"
                                value={form.address}
                                onChange={(e) => set("address", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Area</Label>
                            <Select
                                value={form.area || "none"}
                                onValueChange={(v) => set("area", v === "none" ? "" : v)}
                            >
                                <SelectTrigger className="h-8 text-xs">
                                    <SelectValue placeholder="Select area..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">-- None --</SelectItem>
                                    {areas.map((a) => (
                                        <SelectItem key={a} value={a}>{a}</SelectItem>
                                    ))}
                                    {form.area && !areas.includes(form.area) && (
                                        <SelectItem value={form.area}>{form.area}</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Row 3: Contact No, Cell No, Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Contact No</Label>
                            <Input
                                placeholder="Contact number"
                                value={form.contactNo}
                                onChange={(e) => set("contactNo", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Cell No</Label>
                            <Input
                                placeholder="Cell number"
                                value={form.cellNumber}
                                onChange={(e) => set("cellNumber", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1 lg:col-span-2">
                            <Label className="text-xs">Email</Label>
                            <Input
                                type="email"
                                placeholder="Email address"
                                value={form.email}
                                onChange={(e) => set("email", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Row 4: CNIC, GST, PST, NTN */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">CNIC</Label>
                            <Input
                                placeholder="CNIC number"
                                value={form.cnic}
                                onChange={(e) => set("cnic", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">GST Number</Label>
                            <Input
                                placeholder="GST Number"
                                value={form.gstNumber}
                                onChange={(e) => set("gstNumber", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">PST Number</Label>
                            <Input
                                placeholder="PST Number"
                                value={form.pstNumber}
                                onChange={(e) => set("pstNumber", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">NTN</Label>
                            <Input
                                placeholder="NTN"
                                value={form.ntn}
                                onChange={(e) => set("ntn", e.target.value)}
                                className="h-8 text-xs"
                            />
                        </div>
                    </div>

                    {/* Contact Persons */}
                    <div className="border border-border p-3 rounded-lg space-y-3 bg-muted/10">
                        <div className="flex justify-between items-center">
                            <Label className="text-xs font-semibold">Contact Persons</Label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addContactPerson}
                                className="h-6 text-xs px-2 bg-background"
                            >
                                <Plus className="w-3 h-3 mr-1" /> Add
                            </Button>
                        </div>
                        {form.contactPersons.map((cp, idx) => (
                            <div key={idx} className="flex flex-col sm:flex-row gap-2 items-start sm:items-center border-b sm:border-0 pb-3 sm:pb-0">
                                <Input
                                    placeholder="Person Name"
                                    value={cp.name}
                                    onChange={(e) => updateContactPerson(idx, "name", e.target.value)}
                                    className="h-8 text-xs w-full sm:flex-1"
                                />
                                <Input
                                    placeholder="Designation"
                                    value={cp.designation}
                                    onChange={(e) => updateContactPerson(idx, "designation", e.target.value)}
                                    className="h-8 text-xs w-full sm:flex-1"
                                />
                                <div className="flex gap-2 w-full sm:flex-1">
                                    <Input
                                        placeholder="Contact number"
                                        value={cp.contactNumber}
                                        onChange={(e) => updateContactPerson(idx, "contactNumber", e.target.value)}
                                        className="h-8 text-xs flex-1"
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => removeContactPerson(idx)}
                                        className="h-8 w-8 text-red-500 hover:bg-red-50"
                                    >
                                        <Trash className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {form.contactPersons.length === 0 && (
                            <p className="text-xs text-muted-foreground italic">No contact persons added.</p>
                        )}
                    </div>

                    {/* Row 5: Category, Opening Date, Closing Date, Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Category</Label>
                            <Select
                                value={form.category || "none"}
                                onValueChange={(v) => set("category", v === "none" ? "" : v)}
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
                                value={form.accountOpeningDate}
                                onChange={(e) => set("accountOpeningDate", e.target.value)}
                                className="h-8 text-xs px-2 block w-full uppercase"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Closing Date</Label>
                            <Input
                                type="date"
                                value={form.accountClosingDate}
                                onChange={(e) => set("accountClosingDate", e.target.value)}
                                className="h-8 text-xs px-2 block w-full uppercase"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Status</Label>
                            <Select
                                value={form.status}
                                onValueChange={(v) => set("status", v as "active" | "inactive")}
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

                    {/* Row 6: Opening Balance, OB Date, Credit Limit, Price Type */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                            <Label className="text-xs">Opening Balance</Label>
                            <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                value={form.openingBalance === 0 ? "" : form.openingBalance}
                                onChange={(e) => set("openingBalance", parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">OB Date</Label>
                            <Input
                                type="date"
                                value={form.date}
                                onChange={(e) => set("date", e.target.value)}
                                className="h-8 text-xs px-2 block w-full uppercase"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Credit Limit</Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={form.creditLimit}
                                onChange={(e) => set("creditLimit", parseFloat(e.target.value) || 0)}
                                className="h-8 text-xs"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">Price Type</Label>
                            <Select
                                value={form.priceType || "none"}
                                onValueChange={(v) => set("priceType", v === "none" ? "" : v)}
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

                    {/* Remarks */}
                    <div className="space-y-1">
                        <Label className="text-xs">Remarks</Label>
                        <Textarea
                            placeholder="Remarks..."
                            value={form.remarks}
                            onChange={(e) => set("remarks", e.target.value)}
                            className="text-xs min-h-[60px]"
                        />
                    </div>
                </div>
                )}

                <DialogFooter className="mt-4">
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="text-xs"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving || loadingCustomer}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs"
                    >
                        {saving
                            ? isEditMode
                                ? "Saving..."
                                : "Creating..."
                            : isEditMode
                              ? "Save Changes"
                              : "Add Customer"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
