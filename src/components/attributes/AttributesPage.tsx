import {
  useState,
  useMemo,
  useEffect,
  useRef,
  startTransition,
  useDeferredValue,
} from "react";

import {
  Loader2,
  Plus,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  ChevronDown,
  CopyMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { toast } from "@/components/ui/use-toast";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

// Types
interface Category {
  id: string;
  name: string;
  status: "Active" | "Inactive";
  createdAt?: string;
}

interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
  categoryName?: string;
  status: "Active" | "Inactive";
  createdAt?: string;
}

interface Brand {
  id: string;
  name: string;
  longName?: string;
  status: "Active" | "Inactive";
  createdAt?: string;
}

interface Application {
  id: string;
  name: string;
  master_part_no?: string;
  masterPartNo?: string;
  status: "Active" | "Inactive";
  createdAt?: string;
}

const MAX_MASTER_PART_OPTIONS_RENDERED = 50;

// Isolated form components to prevent slow re-renders of the entire 1800+ line page
function CategoryDialogForm({
  open,
  onClose,
  onSubmit,
  editingCategory,
  initialName = "",
  initialStatus = "Active",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, status: "Active" | "Inactive") => void;
  editingCategory: Category | null;
  initialName?: string;
  initialStatus?: "Active" | "Inactive";
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"Active" | "Inactive">(initialStatus);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setStatus(initialStatus);
    }
  }, [initialName, initialStatus, open]);

  if (!open) return null;

  return (
    <div className="space-y-4 py-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Category Name *
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter category name"
          autoFocus
          data-preserve-case="true"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Status
        </label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as "Active" | "Inactive")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onSubmit(name, status)}>
          {editingCategory ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function SubcategoryDialogForm({
  open,
  categories,
  onClose,
  onSubmit,
  editingSubcategory,
  initialName = "",
  initialCategoryId = "",
  initialStatus = "Active",
}: {
  open: boolean;
  categories: Category[];
  onClose: () => void;
  onSubmit: (
    name: string,
    categoryId: string,
    status: "Active" | "Inactive",
  ) => void;
  editingSubcategory: Subcategory | null;
  initialName?: string;
  initialCategoryId?: string;
  initialStatus?: "Active" | "Inactive";
}) {
  const [name, setName] = useState(initialName);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [status, setStatus] = useState<"Active" | "Inactive">(initialStatus);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setCategoryId(initialCategoryId);
      setStatus(initialStatus);
    }
  }, [initialName, initialCategoryId, initialStatus, open]);

  if (!open) return null;

  return (
    <div className="space-y-4 py-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Subcategory Name *
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter subcategory name"
          autoFocus
          data-preserve-case="true"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Parent Category *
        </label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Select category" />
          </SelectTrigger>
          <SelectContent>
            {categories.length === 0 ? (
              <div className="p-2 text-xs text-muted-foreground text-center">
                No categories found
              </div>
            ) : (
              categories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Status
        </label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as "Active" | "Inactive")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          onClick={() => onSubmit(name, categoryId, status)}
        >
          {editingSubcategory ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}

function BrandDialogForm({
  open,
  onClose,
  onSubmit,
  editingBrand,
  initialName = "",
  initialLongName = "",
  initialStatus = "Active",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (
    name: string,
    longName: string,
    status: "Active" | "Inactive",
  ) => void;
  editingBrand: Brand | null;
  initialName?: string;
  initialLongName?: string;
  initialStatus?: "Active" | "Inactive";
}) {
  const [name, setName] = useState(initialName);
  const [longName, setLongName] = useState(initialLongName);
  const [status, setStatus] = useState<"Active" | "Inactive">(initialStatus);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setLongName(initialLongName);
      setStatus(initialStatus);
    }
  }, [initialName, initialLongName, initialStatus, open]);

  if (!open) return null;

  return (
    <div className="space-y-4 py-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Brand Name *
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter brand name"
          autoFocus
          data-preserve-case="true"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Company Name
        </label>
        <Input
          value={longName}
          onChange={(e) => setLongName(e.target.value)}
          placeholder="Enter company name"
          data-preserve-case="true"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Status
        </label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as "Active" | "Inactive")}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(name, longName, status)}>
          {editingBrand ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}

// Isolated form so typing/selecting does not re-render the whole Attributes page
function ApplicationDialogForm({
  open,
  onClose,
  onSubmit,
  editingApplication,
  initialName = "",
  initialStatus = "Active",
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, status: "Active" | "Inactive") => void;
  editingApplication: Application | null;
  initialName?: string;
  initialStatus?: "Active" | "Inactive";
}) {
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState<"Active" | "Inactive">(initialStatus);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setStatus(initialStatus);
    }
  }, [initialName, initialStatus, open]);

  if (!open) return null;

  return (
    <div className="space-y-4 py-4">
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Application Name *
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter application name"
          className="h-9"
          autoFocus
          data-preserve-case="true"
        />
      </div>
      <div>
        <label className="block text-sm text-muted-foreground mb-1.5">
          Status
        </label>
        <Select
          value={status}
          onValueChange={(v) => setStatus(v as "Active" | "Inactive")}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => onSubmit(name, status)}>
          {editingApplication ? "Update" : "Add"}
        </Button>
      </div>
    </div>
  );
}

export const AttributesPage = () => {
  // State
  const [categories, setCategories] = useState<Category[]>([]);
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and filter states
  const [categorySearch, setCategorySearch] = useState("");
  const deferredCategorySearch = useDeferredValue(categorySearch);
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [subcategorySearch, setSubcategorySearch] = useState("");
  const deferredSubcategorySearch = useDeferredValue(subcategorySearch);
  const [subcategoryCategoryFilter, setSubcategoryCategoryFilter] =
    useState("all");

  const [brandSearch, setBrandSearch] = useState("");
  const deferredBrandSearch = useDeferredValue(brandSearch);
  const [brandFilter, setBrandFilter] = useState("all");

  const [applicationSearch, setApplicationSearch] = useState("");
  const deferredApplicationSearch = useDeferredValue(applicationSearch);
  const [applicationFilter, setApplicationFilter] = useState("all");

  // Dialog states
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [subcategoryDialogOpen, setSubcategoryDialogOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [applicationDialogOpen, setApplicationDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteType, setDeleteType] = useState<
    "category" | "subcategory" | "brand" | "application"
  >("category");
  const [deleteId, setDeleteId] = useState<string>("");
  const [removeDuplicatesDialogOpen, setRemoveDuplicatesDialogOpen] =
    useState(false);
  const [removeDuplicatesLoading, setRemoveDuplicatesLoading] = useState(false);

  // Edit states
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingSubcategory, setEditingSubcategory] =
    useState<Subcategory | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [editingApplication, setEditingApplication] =
    useState<Application | null>(null);

  // Form states
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryStatus, setNewCategoryStatus] = useState<
    "Active" | "Inactive"
  >("Active");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [newSubcategoryCategoryId, setNewSubcategoryCategoryId] = useState("");
  const [newSubcategoryStatus, setNewSubcategoryStatus] = useState<
    "Active" | "Inactive"
  >("Active");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandLongName, setNewBrandLongName] = useState("");
  const [newBrandStatus, setNewBrandStatus] = useState<"Active" | "Inactive">(
    "Active",
  );
  const [newApplicationName, setNewApplicationName] = useState("");
  const [newApplicationMasterPartNo, setNewApplicationMasterPartNo] =
    useState("");
  const [newApplicationStatus, setNewApplicationStatus] = useState<
    "Active" | "Inactive"
  >("Active");
  const [masterParts, setMasterParts] = useState<string[]>([]);
  const [masterPartsLoading, setMasterPartsLoading] = useState(false);

  // Filtered data
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch = cat.name
        .toLowerCase()
        .includes(deferredCategorySearch.toLowerCase());
      const matchesFilter =
        categoryFilter === "all" || cat.id === categoryFilter;
      return matchesSearch && matchesFilter;
    });
  }, [categories, deferredCategorySearch, categoryFilter]);

  const filteredSubcategories = useMemo(() => {
    return subcategories.filter((sub) => {
      const matchesSearch = sub.name
        .toLowerCase()
        .includes(deferredSubcategorySearch.toLowerCase());
      const matchesCategory =
        subcategoryCategoryFilter === "all" ||
        sub.categoryId === subcategoryCategoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [subcategories, deferredSubcategorySearch, subcategoryCategoryFilter]);

  const filteredBrands = useMemo(() => {
    return brands.filter((brand) => {
      const matchesSearch = `${brand.name} ${brand.longName || ""}`
        .toLowerCase()
        .includes(deferredBrandSearch.toLowerCase());
      const matchesFilter = brandFilter === "all" || brand.id === brandFilter;
      return matchesSearch && matchesFilter;
    });
  }, [brands, deferredBrandSearch, brandFilter]);

  const filteredApplications = useMemo(() => {
    return applications.filter((app) => {
      const matchesSearch = app.name
        .toLowerCase()
        .includes(deferredApplicationSearch.toLowerCase());
      const matchesFilter =
        applicationFilter === "all" || app.id === applicationFilter;
      return matchesSearch && matchesFilter;
    });
  }, [applications, deferredApplicationSearch, applicationFilter]);

  // Fetch data on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  // Lazy-load master parts only when Add New Application dialog is opened (avoids lag on click)
  useEffect(() => {
    if (!applicationDialogOpen) return;

    // Reset form state if creating new application
    if (!editingApplication) {
      setNewApplicationName("");
      setNewApplicationMasterPartNo("");
      setNewApplicationStatus("Active");
    }

    let cancelled = false;
    setMasterPartsLoading(true);
    apiClient
      .getMasterParts()
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setMasterParts([]);
          return;
        }
        const arr = Array.isArray(res)
          ? res
          : res?.data && Array.isArray(res.data)
            ? res.data
            : [];
        // Keep UI responsive when list is large — defer state update so dialog stays fast
        startTransition(() => setMasterParts(arr));
      })
      .catch(() => {
        if (!cancelled) setMasterParts([]);
      })
      .finally(() => {
        if (!cancelled) setMasterPartsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationDialogOpen, editingApplication]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [categoriesRes, subcategoriesRes, brandsRes, applicationsRes] =
        await Promise.all([
          apiClient.getAllCategories(),
          apiClient.getAllSubcategories(),
          apiClient.getAllBrands(),
          apiClient.getAllApplications(),
        ]);

      // API client returns data directly (not wrapped in data property)
      // Handle categories
      if (categoriesRes.error) {
        toast({
          title: "Error",
          description: "Failed to load categories: " + categoriesRes.error,
          variant: "destructive",
        });
      } else if (Array.isArray(categoriesRes)) {
        setCategories(categoriesRes);
      } else if (categoriesRes.data && Array.isArray(categoriesRes.data)) {
        setCategories(categoriesRes.data);
      }

      // Handle subcategories
      if (subcategoriesRes.error) {
        toast({
          title: "Error",
          description:
            "Failed to load subcategories: " + subcategoriesRes.error,
          variant: "destructive",
        });
      } else if (Array.isArray(subcategoriesRes)) {
        setSubcategories(subcategoriesRes);
      } else if (
        subcategoriesRes.data &&
        Array.isArray(subcategoriesRes.data)
      ) {
        setSubcategories(subcategoriesRes.data);
      }

      // Handle brands
      if (brandsRes.error) {
        toast({
          title: "Error",
          description: "Failed to load brands: " + brandsRes.error,
          variant: "destructive",
        });
      } else {
        const brandsArray = Array.isArray(brandsRes)
          ? brandsRes
          : brandsRes.data && Array.isArray(brandsRes.data)
            ? brandsRes.data
            : [];
        setBrands(
          brandsArray.map((b: any) => ({
            ...b,
            createdAt: b.createdAt
              ? new Date(b.createdAt).toLocaleDateString("en-GB")
              : new Date().toLocaleDateString("en-GB"),
          })),
        );
      }

      // Handle applications — deduplicate by id so we never show duplicate applications
      if (applicationsRes.error) {
        toast({
          title: "Error",
          description: "Failed to load applications: " + applicationsRes.error,
          variant: "destructive",
        });
      } else {
        const applicationsArray = Array.isArray(applicationsRes)
          ? applicationsRes
          : applicationsRes.data && Array.isArray(applicationsRes.data)
            ? applicationsRes.data
            : [];
        const seen = new Set<string>();
        const deduplicated = applicationsArray
          .filter((a: any) => {
            const id = a?.id ?? a?._id;
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
          })
          .map((a: any) => ({
            ...a,
            createdAt: a.createdAt
              ? new Date(a.createdAt).toLocaleDateString("en-GB")
              : new Date().toLocaleDateString("en-GB"),
          }));
        setApplications(deduplicated);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load attributes data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handlers
  const handleAddCategory = async (
    name: string,
    status: "Active" | "Inactive",
  ) => {
    const trimmedName = name.trim();
    console.log("Adding category - Name:", trimmedName, "Status:", status);

    if (!trimmedName) {
      console.warn("Category validation failed: Name is empty");
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingCategory) {
        const response = await apiClient.updateCategory(editingCategory.id, {
          name: trimmedName,
          status: status,
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        // API returns data directly
        if (!response.error) {
          const categoryData = (response.data || response) as Category;
          setCategories((prev) =>
            prev.map((c) => (c.id === editingCategory.id ? categoryData : c)),
          );
          toast({
            title: "Success",
            description: "Category updated successfully",
          });
        }
      } else {
        console.log("Calling apiClient.createCategory with:", {
          name: trimmedName,
          status: status,
        });
        const response = await apiClient.createCategory({
          name: trimmedName,
          status: status,
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const categoryData = (response.data || response) as Category;
          setCategories((prev) => [categoryData, ...prev]);
          toast({
            title: "Success",
            description: "Category added successfully",
          });
        }
      }
      resetCategoryForm();
      await fetchAllData();
    } catch (error: any) {
      console.error("Error in handleAddCategory:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save category",
        variant: "destructive",
      });
    }
  };

  const handleAddSubcategory = async (
    name: string,
    categoryId: string,
    status: "Active" | "Inactive",
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName || !categoryId) {
      toast({
        title: "Error",
        description: "Subcategory name and category are required",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingSubcategory) {
        const response = await apiClient.updateSubcategory(
          editingSubcategory.id,
          {
            name: trimmedName,
            category_id: categoryId,
            status: status,
          },
        );
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const subcategoryData = (response.data || response) as Subcategory;
          setSubcategories((prev) =>
            prev.map((s) =>
              s.id === editingSubcategory.id ? subcategoryData : s,
            ),
          );
          toast({
            title: "Success",
            description: "Subcategory updated successfully",
          });
        }
      } else {
        const response = await apiClient.createSubcategory({
          name: trimmedName,
          category_id: categoryId,
          status: status,
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const subcategoryData = (response.data || response) as Subcategory;
          setSubcategories((prev) => [subcategoryData, ...prev]);
          toast({
            title: "Success",
            description: "Subcategory added successfully",
          });
        }
      }
      resetSubcategoryForm();
      await fetchAllData();
    } catch (error: any) {
      console.error("Error in handleAddSubcategory:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save subcategory",
        variant: "destructive",
      });
    }
  };

  const handleAddBrand = async (
    name: string,
    longName: string,
    status: "Active" | "Inactive",
  ) => {
    const trimmedName = name.trim();
    const trimmedLongName = longName.trim();
    if (!trimmedName) {
      toast({
        title: "Error",
        description: "Brand name is required",
        variant: "destructive",
      });
      return;
    }
    try {
      if (editingBrand) {
        const response = await apiClient.updateBrand(editingBrand.id, {
          name: trimmedName,
          longName: trimmedLongName,
          status: status,
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const brandData = (response.data || response) as Brand;
          setBrands((prev) =>
            prev.map((b) =>
              b.id === editingBrand.id
                ? {
                    ...brandData,
                    createdAt: brandData.createdAt
                      ? new Date(brandData.createdAt).toLocaleDateString(
                          "en-GB",
                        )
                      : b.createdAt,
                  }
                : b,
            ),
          );
          toast({
            title: "Success",
            description: "Brand updated successfully",
          });
        }
      } else {
        const response = await apiClient.createBrand({
          name: trimmedName,
          longName: trimmedLongName,
          status: status,
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const brandData = (response.data || response) as Brand;
          setBrands((prev) => [
            {
              ...brandData,
              createdAt: brandData.createdAt
                ? new Date(brandData.createdAt).toLocaleDateString("en-GB")
                : new Date().toLocaleDateString("en-GB"),
            },
            ...prev,
          ]);
          toast({ title: "Success", description: "Brand added successfully" });
        }
      }
      resetBrandForm();
      await fetchAllData();
    } catch (error: any) {
      console.error("Error in handleAddBrand:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save brand",
        variant: "destructive",
      });
    }
  };

  const handleAddApplication = async (
    name: string,
    status: "Active" | "Inactive",
  ) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      toast({
        title: "Error",
        description: "Application name is required",
        variant: "destructive",
      });
      return;
    }
    // Prevent duplicate by application name
    if (!editingApplication) {
      const existing = applications.find(
        (a) => a.name.toLowerCase() === trimmedName.toLowerCase(),
      );
      if (existing) {
        toast({
          title: "Duplicate application",
          description: "An application with this name already exists.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      if (editingApplication) {
        const response = await apiClient.updateApplication(
          editingApplication.id,
          {
            name: trimmedName,
            status: status,
            subcategory_id: "",
          },
        );
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const applicationData = (response.data || response) as Application;
          setApplications((prev) =>
            prev.map((a) =>
              a.id === editingApplication.id
                ? {
                    ...applicationData,
                    createdAt: applicationData.createdAt
                      ? new Date(applicationData.createdAt).toLocaleDateString(
                          "en-GB",
                        )
                      : a.createdAt,
                  }
                : a,
            ),
          );
          toast({
            title: "Success",
            description: "Application updated successfully",
          });
        }
      } else {
        const response = await apiClient.createApplication({
          name: trimmedName,
          status: status,
          subcategory_id: "",
        });
        if (response.error) {
          toast({
            title: "Error",
            description: response.error,
            variant: "destructive",
          });
          return;
        }
        if (!response.error) {
          const applicationData = (response.data || response) as Application;
          setApplications((prev) => [
            {
              ...applicationData,
              createdAt: applicationData.createdAt
                ? new Date(applicationData.createdAt).toLocaleDateString(
                    "en-GB",
                  )
                : new Date().toLocaleDateString("en-GB"),
            },
            ...prev,
          ]);
          toast({
            title: "Success",
            description: "Application added successfully",
          });
        }
      }
      resetApplicationForm();
      await fetchAllData();
    } catch (error: any) {
      console.error("Error in handleAddApplication:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save application",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    try {
      let response;
      if (deleteType === "category") {
        response = await apiClient.deleteCategory(deleteId);
      } else if (deleteType === "subcategory") {
        response = await apiClient.deleteSubcategory(deleteId);
      } else if (deleteType === "brand") {
        response = await apiClient.deleteBrand(deleteId);
      } else {
        response = await apiClient.deleteApplication(deleteId);
      }

      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        setDeleteDialogOpen(false);
        return;
      }

      // Remove from local state
      if (deleteType === "category") {
        setCategories((prev) => prev.filter((c) => c.id !== deleteId));
        toast({
          title: "Success",
          description: "Category deleted successfully",
        });
      } else if (deleteType === "subcategory") {
        setSubcategories((prev) => prev.filter((s) => s.id !== deleteId));
        toast({
          title: "Success",
          description: "Subcategory deleted successfully",
        });
      } else if (deleteType === "brand") {
        setBrands((prev) => prev.filter((b) => b.id !== deleteId));
        toast({ title: "Success", description: "Brand deleted successfully" });
      } else {
        setApplications((prev) => prev.filter((a) => a.id !== deleteId));
        toast({
          title: "Success",
          description: "Application deleted successfully",
        });
      }
      setDeleteDialogOpen(false);
      await fetchAllData();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
    }
  };

  const resetCategoryForm = () => {
    setNewCategoryName("");
    setNewCategoryStatus("Active");
    setEditingCategory(null);
    setCategoryDialogOpen(false);
  };

  const resetSubcategoryForm = () => {
    setNewSubcategoryName("");
    setNewSubcategoryCategoryId("");
    setNewSubcategoryStatus("Active");
    setEditingSubcategory(null);
    setSubcategoryDialogOpen(false);
  };

  const resetBrandForm = () => {
    setNewBrandName("");
    setNewBrandLongName("");
    setNewBrandStatus("Active");
    setEditingBrand(null);
    setBrandDialogOpen(false);
  };

  const resetApplicationForm = () => {
    setNewApplicationName("");
    setNewApplicationMasterPartNo("");
    setNewApplicationStatus("Active");
    setEditingApplication(null);
    setApplicationDialogOpen(false);
  };

  const openEditCategory = (category: Category) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    setNewCategoryStatus(category.status);
    setCategoryDialogOpen(true);
  };

  const openEditSubcategory = (subcategory: Subcategory) => {
    setEditingSubcategory(subcategory);
    setNewSubcategoryName(subcategory.name);
    setNewSubcategoryCategoryId(subcategory.categoryId);
    setNewSubcategoryStatus(subcategory.status);
    setSubcategoryDialogOpen(true);
  };

  const openEditBrand = (brand: Brand) => {
    setEditingBrand(brand);
    setNewBrandName(brand.name);
    setNewBrandLongName(brand.longName || "");
    setNewBrandStatus(brand.status);
    setBrandDialogOpen(true);
  };

  const openEditApplication = (application: Application) => {
    setEditingApplication(application);
    setNewApplicationName(application.name);
    setNewApplicationMasterPartNo(application.masterPartNo ?? "");
    setNewApplicationStatus(application.status);
    setApplicationDialogOpen(true);
  };

  const openDeleteDialog = (
    type: "category" | "subcategory" | "brand" | "application",
    id: string,
  ) => {
    setDeleteType(type);
    setDeleteId(id);
    setDeleteDialogOpen(true);
  };

  const handleRemoveApplicationDuplicates = async () => {
    setRemoveDuplicatesLoading(true);
    try {
      const res = await apiClient.removeApplicationDuplicates();
      if ((res as any)?.error) {
        toast({
          title: "Error",
          description: (res as any).error,
          variant: "destructive",
        });
        return;
      }
      const removed = (res as any)?.removed ?? 0;
      const msg =
        (res as any)?.message ??
        (removed
          ? `Removed ${removed} duplicate application(s) from the database.`
          : "No duplicate applications found.");
      toast({
        title: removed ? "Duplicates removed" : "No duplicates",
        description: msg,
      });
      setRemoveDuplicatesDialogOpen(false);
      await fetchAllData();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message ?? "Failed to remove duplicates",
        variant: "destructive",
      });
    } finally {
      setRemoveDuplicatesLoading(false);
    }
  };

  // Status toggle handlers
  const toggleCategoryStatus = async (category: Category) => {
    const newStatus = category.status === "Active" ? "Inactive" : "Active";

    // If trying to set inactive, check for active subcategories
    if (newStatus === "Inactive") {
      const activeSubcategories = subcategories.filter(
        (s) => s.categoryId === category.id && s.status === "Active",
      );
      if (activeSubcategories.length > 0) {
        toast({
          title: "Cannot Deactivate Category",
          description: `This category has ${activeSubcategories.length} active subcategorie(s). Please deactivate all subcategories first before deactivating this category.`,
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const response = await apiClient.updateCategory(category.id, {
        name: category.name,
        status: newStatus,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }
      if (!response.error) {
        const categoryData = (response.data || response) as Category;
        setCategories((prev) =>
          prev.map((c) => (c.id === category.id ? categoryData : c)),
        );
        toast({
          title: "Status Updated",
          description: `Category "${category.name}" is now ${newStatus}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const toggleSubcategoryStatus = async (subcategory: Subcategory) => {
    const newStatus = subcategory.status === "Active" ? "Inactive" : "Active";

    try {
      const response = await apiClient.updateSubcategory(subcategory.id, {
        name: subcategory.name,
        category_id: subcategory.categoryId,
        status: newStatus,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }
      if (!response.error) {
        const subcategoryData = (response.data || response) as Subcategory;
        setSubcategories((prev) =>
          prev.map((s) => (s.id === subcategory.id ? subcategoryData : s)),
        );
        toast({
          title: "Status Updated",
          description: `Subcategory "${subcategory.name}" is now ${newStatus}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const toggleBrandStatus = async (brand: Brand) => {
    const newStatus = brand.status === "Active" ? "Inactive" : "Active";
    try {
      const response = await apiClient.updateBrand(brand.id, {
        name: brand.name,
        status: newStatus,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }
      if (!response.error) {
        const brandData = (response.data || response) as Brand;
        setBrands((prev) =>
          prev.map((b) =>
            b.id === brand.id
              ? {
                  ...brandData,
                  createdAt: brandData.createdAt
                    ? new Date(brandData.createdAt).toLocaleDateString("en-GB")
                    : b.createdAt,
                }
              : b,
          ),
        );
        toast({
          title: "Status Updated",
          description: `Brand "${brand.name}" is now ${newStatus}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  const toggleApplicationStatus = async (application: Application) => {
    const newStatus = application.status === "Active" ? "Inactive" : "Active";
    try {
      const response = await apiClient.updateApplication(application.id, {
        name: application.name,
        status: newStatus,
      });
      if (response.error) {
        toast({
          title: "Error",
          description: response.error,
          variant: "destructive",
        });
        return;
      }
      if (!response.error) {
        const applicationData = (response.data || response) as Application;
        setApplications((prev) =>
          prev.map((a) =>
            a.id === application.id
              ? {
                  ...applicationData,
                  createdAt: applicationData.createdAt
                    ? new Date(applicationData.createdAt).toLocaleDateString(
                        "en-GB",
                      )
                    : a.createdAt,
                }
              : a,
          ),
        );
        toast({
          title: "Status Updated",
          description: `Application "${application.name}" is now ${newStatus}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading attributes...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-xl font-bold text-foreground">Attributes</h1>
      </div>

      {/* Four Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Categories List */}
        <div className="bg-card rounded-xl border border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between mb-3 min-h-[40px]">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Categories List
                </h3>
              </div>
              <Button
                size="sm"
                className="gap-1 h-8 text-xs shrink-0"
                onClick={() => setCategoryDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New
              </Button>
            </div>
            <div className="flex gap-2">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-32 h-8 text-xs border-border">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search categories..."
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                className="h-8 text-xs flex-1"
                data-preserve-case="true"
              />
            </div>
          </div>
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm text-muted-foreground">
              All ({filteredCategories.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {filteredCategories.map((category) => (
              <div
                key={category.id}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {category.name}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => openEditCategory(category)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => openDeleteDialog("category", category.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sub Category List */}
        <div className="bg-card rounded-xl border border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between mb-3 min-h-[40px]">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Sub Category List
                </h3>
              </div>
              <Button
                size="sm"
                className="gap-1 h-8 text-xs shrink-0"
                onClick={() => setSubcategoryDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New
              </Button>
            </div>
            <div className="flex gap-2">
              <Select
                value={subcategoryCategoryFilter}
                onValueChange={setSubcategoryCategoryFilter}
              >
                <SelectTrigger className="w-32 h-8 text-xs border-border">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search sub categories..."
                value={subcategorySearch}
                onChange={(e) => setSubcategorySearch(e.target.value)}
                className="h-8 text-xs flex-1"
                data-preserve-case="true"
              />
            </div>
          </div>
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm text-muted-foreground">
              All ({filteredSubcategories.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {filteredSubcategories.map((subcategory) => (
              <div
                key={subcategory.id}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {subcategory.name}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {subcategory.categoryName}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => openEditSubcategory(subcategory)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() =>
                        openDeleteDialog("subcategory", subcategory.id)
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Brands List */}
        <div className="bg-card rounded-xl border border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between mb-3 min-h-[40px]">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Brands List
                </h3>
              </div>
              <Button
                size="sm"
                className="gap-1 h-8 text-xs shrink-0"
                onClick={() => setBrandDialogOpen(true)}
              >
                <Plus className="w-3.5 h-3.5" />
                Add New
              </Button>
            </div>
            <div className="flex gap-2">
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="w-32 h-8 text-xs border-border">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search brands..."
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                className="h-8 text-xs flex-1"
                data-preserve-case="true"
              />
            </div>
          </div>
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm text-muted-foreground">
              All ({filteredBrands.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {filteredBrands.map((brand) => (
              <div
                key={brand.id}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {brand.name}
                    </p>
                    {brand.longName && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Company Name: {brand.longName}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => openEditBrand(brand)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() => openDeleteDialog("brand", brand.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Applications List */}
        <div className="bg-card rounded-xl border border-border flex flex-col">
          <div className="p-4 border-b border-border">
            <div className="flex items-start justify-between mb-3 min-h-[40px]">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Applications List
                </h3>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 h-8 text-xs hidden"
                  onClick={() => setRemoveDuplicatesDialogOpen(true)}
                  title="Remove duplicate applications from the database"
                >
                  <CopyMinus className="w-3.5 h-3.5" />
                  Remove duplicates
                </Button>
                <Button
                  size="sm"
                  className="gap-1 h-8 text-xs"
                  onClick={() => setApplicationDialogOpen(true)}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add New
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Search applications..."
                value={applicationSearch}
                onChange={(e) => setApplicationSearch(e.target.value)}
                className="h-8 text-xs flex-1"
                data-preserve-case="true"
              />
            </div>
          </div>
          <div className="px-4 py-2 border-b border-border">
            <p className="text-sm text-muted-foreground">
              All ({filteredApplications.length})
            </p>
          </div>
          <div className="p-3 space-y-2">
            {filteredApplications.map((application) => (
              <div
                key={application.id}
                className="border border-border rounded-lg p-3 bg-background"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground text-sm">
                      {application.name}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2"
                      onClick={() => openEditApplication(application)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={() =>
                        openDeleteDialog("application", application.id)
                      }
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Category Dialog */}
      <Dialog
        open={categoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetCategoryForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? "Edit Category" : "Add New Category"}
            </DialogTitle>
          </DialogHeader>
          <CategoryDialogForm
            open={categoryDialogOpen}
            onClose={resetCategoryForm}
            onSubmit={handleAddCategory}
            editingCategory={editingCategory}
            initialName={newCategoryName}
            initialStatus={newCategoryStatus}
          />
        </DialogContent>
      </Dialog>

      {/* Subcategory Dialog */}
      <Dialog
        open={subcategoryDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetSubcategoryForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSubcategory ? "Edit Subcategory" : "Add New Subcategory"}
            </DialogTitle>
          </DialogHeader>
          <SubcategoryDialogForm
            open={subcategoryDialogOpen}
            categories={categories}
            onClose={resetSubcategoryForm}
            onSubmit={handleAddSubcategory}
            editingSubcategory={editingSubcategory}
            initialName={newSubcategoryName}
            initialCategoryId={newSubcategoryCategoryId}
            initialStatus={newSubcategoryStatus}
          />
        </DialogContent>
      </Dialog>

      {/* Brand Dialog */}
      <Dialog
        open={brandDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetBrandForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBrand ? "Edit Brand" : "Add New Brand"}
            </DialogTitle>
          </DialogHeader>
          <BrandDialogForm
            open={brandDialogOpen}
            onClose={resetBrandForm}
            onSubmit={handleAddBrand}
            editingBrand={editingBrand}
            initialName={newBrandName}
            initialLongName={newBrandLongName}
            initialStatus={newBrandStatus}
          />
        </DialogContent>
      </Dialog>

      {/* Application Dialog — isolated form so typing/selecting does not re-render whole page */}
      <Dialog
        open={applicationDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetApplicationForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingApplication ? "Edit Application" : "Add New Application"}
            </DialogTitle>
          </DialogHeader>
          <ApplicationDialogForm
            open={applicationDialogOpen}
            onClose={resetApplicationForm}
            onSubmit={handleAddApplication}
            editingApplication={editingApplication}
            initialName={newApplicationName}
            initialStatus={newApplicationStatus}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteType}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this {deleteType}? This action
              cannot be undone.
              {deleteType === "category" &&
                " All subcategories under this category will also be deleted."}
              {deleteType === "application" &&
                " This application will be removed from all parts using it."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={removeDuplicatesDialogOpen}
        onOpenChange={(open) =>
          !removeDuplicatesLoading && setRemoveDuplicatesDialogOpen(open)
        }
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove duplicate applications from database
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will find applications with the same master part and name,
              keep one per group, reassign any parts to that one, and delete the
              duplicate rows from the database. This cannot be undone for the
              removed rows.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeDuplicatesLoading}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemoveApplicationDuplicates}
              disabled={removeDuplicatesLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeDuplicatesLoading ? "Removing…" : "Remove duplicates"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
