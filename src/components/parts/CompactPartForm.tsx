import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Image as ImageIcon, X, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Item } from "./ItemsListView";
import { apiClient } from "@/lib/api";
import { compressImage } from "@/utils/imageCompression";

interface PartFormData {
  masterPartNo: string;
  partNo: string;
  brand: string;
  description: string;
  category: string;
  categoryId: string;
  subCategory: string;
  subCategoryId: string;
  application: string;
  applicationId: string;
  hsCode: string;
  uom: string;
  weight: string;
  reOrderLevel: string;
  cost: string;
  purchasePrice: string;
  avgCost: string;
  priceA: string;
  priceB: string;
  priceM: string;
  rackNo: string;
  origin: string;
  grade: string;
  status: string;
  smc: string;
  size: string;
  remarks: string;
}

const initialFormData: PartFormData = {
  masterPartNo: "",
  partNo: "",
  brand: "",
  description: "",
  category: "",
  categoryId: "",
  subCategory: "",
  subCategoryId: "",
  application: "",
  applicationId: "",
  hsCode: "",
  uom: "NOS",
  weight: "",
  reOrderLevel: "0",
  cost: "0.00",
  purchasePrice: "0.00",
  avgCost: "0.00",
  priceA: "0.00",
  priceB: "0.00",
  priceM: "0.00",
  rackNo: "",
  origin: "",
  grade: "B",
  status: "A",
  smc: "",
  size: "",
  remarks: "",
};

interface CompactPartFormProps {
  onSave: (
    part: PartFormData & { imageP1?: string | null; imageP2?: string | null },
    isEdit: boolean,
    editItemId?: string,
  ) => void;
  onCancel: () => void;
  editItem?: Item | null;
}

export const CompactPartForm = ({
  onSave,
  onCancel,
  editItem,
}: CompactPartFormProps) => {
  const [formData, setFormData] = useState<PartFormData>(initialFormData);
  const [imageP1, setImageP1] = useState<string | null>(null);
  const [imageP2, setImageP2] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isEditing = !!editItem;

  // Track if we're in "new mode" (creating new item, not editing)
  const [isNewMode, setIsNewMode] = useState(!editItem);

  // Items screen requirement: do not show searchable dropdown popups
  const disableDropdowns = true;

  // Dropdown data
  const [categories, setCategories] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [subcategories, setSubcategories] = useState<
    { id: string; name: string; categoryId: string }[]
  >([]);
  const [applications, setApplications] = useState<
    { id: string; name: string; subcategoryId: string }[]
  >([]);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [masterParts, setMasterParts] = useState<string[]>([]);
  const [partsForMasterPartSearch, setPartsForMasterPartSearch] = useState<
    { partNo: string; description: string; masterPartNo: string }[]
  >([]);
  const [masterPartSearchLoading, setMasterPartSearchLoading] = useState(false);
  const [showMasterPartDropdown, setShowMasterPartDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSubcategoryDropdown, setShowSubcategoryDropdown] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");
  const [masterPartSearch, setMasterPartSearch] = useState("");

  const masterPartDropdownRef = useRef<HTMLDivElement>(null);
  const masterPartInputRef = useRef<HTMLInputElement>(null);
  const brandDropdownRef = useRef<HTMLDivElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const subcategoryDropdownRef = useRef<HTMLDivElement>(null);

  const fileInputP1Ref = useRef<HTMLInputElement>(null);
  const fileInputP2Ref = useRef<HTMLInputElement>(null);

  // Fetch dropdown data
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [catsRes, brandsRes, masterPartsRes] = await Promise.all([
          apiClient.getCategories(),
          apiClient.getBrands(),
          apiClient.getMasterParts(),
        ]);

        // Handle categories
        let categoriesData: any[] = [];
        const catsResponse = catsRes as any;
        if (catsResponse?.error) {
        } else if (Array.isArray(catsResponse)) {
          categoriesData = catsResponse;
        } else if (catsResponse?.data && Array.isArray(catsResponse.data)) {
          categoriesData = catsResponse.data;
        }
        setCategories(categoriesData);

        // Handle brands - Extract from API response
        let brandsData: any[] = [];
        const brandsResponse = brandsRes as any;

        if (Array.isArray(brandsResponse) && brandsResponse.length > 0) {
        }

        try {
          // Check for error first
          if (brandsResponse?.error) {
            toast({
              title: "Error",
              description: `Failed to load brands: ${brandsResponse.error}`,
              variant: "destructive",
            });
            setBrands([]);
          }
          // Check if response is null or undefined
          else if (brandsResponse === null || brandsResponse === undefined) {
            setBrands([]);
          }
          // Check if response is directly an array (most likely case from backend)
          else if (Array.isArray(brandsResponse)) {
            // Process ALL brands - accept any object with id and name (exactly as API returns)
            brandsData = brandsResponse
              .map((b: any) => ({
                id: b?.id || b?._id || `brand-${Math.random()}`,
                name: b?.name || b?.brand_name || String(b || "").trim(),
              }))
              .filter((b: any) => b.name && b.name.trim() !== "");

            // ALWAYS set brands if we have any data
            if (brandsData.length > 0) {
              setBrands(brandsData);
            } else {
              setBrands([]);
            }
          }
          // Check if response is wrapped in data property (from ApiResponse<T>)
          else if (brandsResponse?.data !== undefined) {
            if (Array.isArray(brandsResponse.data)) {
              brandsData = brandsResponse.data
                .filter((b: any) => {
                  const hasId = !!(b?.id || b?._id);
                  const hasName = !!b?.name;
                  return hasId && hasName;
                })
                .map((b: any) => ({
                  id: b.id || b._id,
                  name: b.name,
                }));
            } else {
              setBrands([]);
            }
          }
          // If response is an object, try to find array in it
          else if (
            brandsResponse &&
            typeof brandsResponse === "object" &&
            !Array.isArray(brandsResponse)
          ) {
            // Try to extract array from various possible structures
            const possibleArray = Object.values(brandsResponse).find((v: any) =>
              Array.isArray(v),
            );
            if (possibleArray) {
              brandsData = (possibleArray as any[])
                .filter((b: any) => {
                  const hasId = !!(b?.id || b?._id);
                  const hasName = !!b?.name;
                  return hasId && hasName;
                })
                .map((b: any) => ({
                  id: b.id || b._id,
                  name: b.name,
                }));
            } else {
              setBrands([]);
            }
          } else {
          }

          // Set brands if we found any
          if (brandsData.length > 0) {
            setBrands(brandsData);
          } else {
            // Only run fallback if brandsData is still empty
            if (brandsData.length === 0) {
              try {
                const partsResponse = (await apiClient.getParts({
                  limit: 2000,
                })) as any;

                let partsData: any[] = [];
                if (Array.isArray(partsResponse)) {
                  partsData = partsResponse;
                } else if (
                  partsResponse?.data &&
                  Array.isArray(partsResponse.data)
                ) {
                  partsData = partsResponse.data;
                } else if (
                  partsResponse?.data?.data &&
                  Array.isArray(partsResponse.data.data)
                ) {
                  partsData = partsResponse.data.data;
                }

                // Extract unique brand names from parts
                const uniqueBrands = new Map<
                  string,
                  { id: string; name: string }
                >();
                let fallbackIndex = 0;

                partsData.forEach((part: any) => {
                  const brandName =
                    part.brand_name || part.brand?.name || part.brand;
                  if (
                    brandName &&
                    typeof brandName === "string" &&
                    brandName.trim()
                  ) {
                    const trimmedName = brandName.trim().toUpperCase();
                    if (!uniqueBrands.has(trimmedName)) {
                      uniqueBrands.set(trimmedName, {
                        id: part.brand_id || `fallback-${fallbackIndex++}`,
                        name: brandName.trim(),
                      });
                    }
                  }
                });

                if (uniqueBrands.size > 0) {
                  brandsData = Array.from(uniqueBrands.values());
                  setBrands(brandsData);
                } else {
                  setBrands([]);
                }
              } catch (fallbackError: any) {
                setBrands([]);
              }
            } else {
              setBrands([]);
            }
          }
        } catch (error: any) {
          setBrands([]);
        }

        // Handle master parts
        let masterPartsData: any[] = [];
        if ((masterPartsRes as any).error) {
        } else if (Array.isArray(masterPartsRes)) {
          masterPartsData = masterPartsRes;
        } else if (
          (masterPartsRes as any).data &&
          Array.isArray((masterPartsRes as any).data)
        ) {
          masterPartsData = (masterPartsRes as any).data;
        }
        setMasterParts(masterPartsData);
      } catch (error: any) {
        toast({
          title: "Error",
          description: `Failed to load dropdown data: ${error.message || "Unknown error"}`,
          variant: "destructive",
        });
      }
    };

    fetchDropdownData();
  }, []);

  // Fetch subcategories when category changes
  useEffect(() => {
    if (formData.categoryId) {
      const fetchSubcategories = async () => {
        try {
          const res = await apiClient.getSubcategories(formData.categoryId);
          if (res.data) {
            setSubcategories(Array.isArray(res.data) ? res.data : []);
          }
        } catch (error) {}
      };
      fetchSubcategories();
    } else {
      setSubcategories([]);
      setFormData((prev) => ({
        ...prev,
        subCategory: "",
        subCategoryId: "",
        application: "",
        applicationId: "",
      }));
    }
  }, [formData.categoryId]);

  // Fetch applications when subcategory changes
  useEffect(() => {
    if (formData.subCategoryId) {
      const fetchApplications = async () => {
        try {
          const res = await apiClient.getApplications(formData.subCategoryId);
          if (res.data) {
            setApplications(Array.isArray(res.data) ? res.data : []);
          }
        } catch (error) {}
      };
      fetchApplications();
    } else {
      setApplications([]);
      setFormData((prev) => ({ ...prev, application: "", applicationId: "" }));
    }
  }, [formData.subCategoryId]);

  // Sync isNewMode with editItem prop
  useEffect(() => {
    setIsNewMode(!editItem);
  }, [editItem]);

  // Load full part data when editing - Step by step field mapping
  useEffect(() => {
    const loadPartData = async () => {
      if (editItem?.id) {
        setLoading(true);
        setIsNewMode(false);
        try {
          const response = await apiClient.getPart(editItem.id);
          // Handle both wrapped and direct response formats
          const part = (response.data || response) as any;

          if (part && part.id) {
            // Step 1: Master Part No - Map correctly
            const masterPartNo = part.master_part_no || "";

            // Step 2: Part Number - Map correctly
            const partNo = part.part_no || "";

            // Step 3: Brand - Map correctly
            const brandName = part.brand_name || "";

            // Step 4: Description - Map correctly
            const description = part.description || "";

            // Step 5: Category - Find ID by name if needed
            let categoryId = part.category_id || "";
            const categoryName = part.category_name || "";
            if (!categoryId && categoryName) {
              const categoryMatch = categories.find(
                (cat) => cat.name === categoryName,
              );
              if (categoryMatch) {
                categoryId = categoryMatch.id;
              }
            }

            // Step 6: Subcategory - Find ID by name if needed
            let subCategoryId = part.subcategory_id || "";
            const subCategoryName = part.subcategory_name || "";
            if (!subCategoryId && subCategoryName) {
              const subcategoryMatch = subcategories.find(
                (sub) => sub.name === subCategoryName,
              );
              if (subcategoryMatch) {
                subCategoryId = subcategoryMatch.id;
              }
            }

            // Step 7: Application - Find ID by name if needed
            let applicationId = part.application_id || "";
            const applicationName = part.application_name || "";
            if (!applicationId && applicationName) {
              const applicationMatch = applications.find(
                (app) => app.name === applicationName,
              );
              if (applicationMatch) {
                applicationId = applicationMatch.id;
              }
            }

            // Step 8: Prices - Map correctly (handle null/undefined)
            const cost =
              part.cost !== null && part.cost !== undefined
                ? part.cost.toString()
                : "0.00";
            const priceA =
              part.price_a !== null && part.price_a !== undefined
                ? part.price_a.toString()
                : "0.00";
            const priceB =
              part.price_b !== null && part.price_b !== undefined
                ? part.price_b.toString()
                : "0.00";
            const priceM =
              part.price_m !== null && part.price_m !== undefined
                ? part.price_m.toString()
                : "0.00";
            const purchasePrice =
              part.purchasePrice !== null && part.purchasePrice !== undefined
                ? part.purchasePrice.toString()
                : "0.00";
            const avgCost =
              part.avgCost !== null && part.avgCost !== undefined
                ? part.avgCost.toString()
                : "0.00";

            // Step 9: Other fields - Map correctly
            const hsCode = part.hs_code || "";
            const uom = part.uom || "NOS";
            const weight =
              part.weight !== null && part.weight !== undefined
                ? part.weight.toString()
                : "";
            const reOrderLevel =
              part.reorder_level !== null && part.reorder_level !== undefined
                ? part.reorder_level.toString()
                : "0";
            const smc = part.smc || "";
            const size = part.size || "";
            const origin = part.origin ? String(part.origin).trim() : "";
            const status = part.status === "active" ? "A" : "N";
            const remarks = part.remarks || "";

            // Set form data step by step
            setFormData({
              // Step 1
              masterPartNo: masterPartNo,
              // Step 2
              partNo: partNo,
              // Step 3
              brand: brandName,
              // Step 4
              description: description,
              // Step 5
              category: categoryName,
              categoryId: categoryId,
              // Step 6
              subCategory: subCategoryName,
              subCategoryId: subCategoryId,
              // Step 7
              application: applicationName,
              applicationId: applicationId,
              // Step 8 - Prices
              cost: cost,
              purchasePrice: purchasePrice,
              avgCost: avgCost,
              priceA: priceA,
              priceB: priceB,
              priceM: priceM,
              // Step 9 - Other fields
              hsCode: hsCode,
              uom: uom,
              weight: weight,
              reOrderLevel: reOrderLevel,
              rackNo: "",
              origin: origin,
              grade: part.grade || "B",
              status: status,
              smc: smc,
              size: size,
              remarks: remarks,
            });

            // Set master part search to show the value in the input
            setMasterPartSearch(masterPartNo);

            // Images
            setImageP1(part.image_p1 || null);
            setImageP2(part.image_p2 || null);
          }
        } catch (error: any) {
          toast({
            title: "Error",
            description:
              error.error || error.message || "Failed to load part details",
            variant: "destructive",
          });
        } finally {
          setLoading(false);
        }
      } else {
        setFormData(initialFormData);
        setImageP1(null);
        setImageP2(null);
        setIsNewMode(true);
      }
    };

    loadPartData();
  }, [editItem?.id, categories, subcategories, applications]);

  // Helper function to check if form has any meaningful data entered
  // Ignores default/empty values to properly detect if form is truly empty
  const hasFormData = (
    data: PartFormData,
    img1: string | null,
    img2: string | null,
  ): boolean => {
    // Check for non-default text values (ignore empty strings and defaults)
    if (data.partNo?.trim()) return true;
    if (data.masterPartNo?.trim()) return true;
    if (data.brand?.trim()) return true;
    if (data.description?.trim()) return true;
    if (data.category?.trim()) return true;
    if (data.subCategory?.trim()) return true;
    if (data.application?.trim()) return true;
    if (data.hsCode?.trim()) return true;
    // Ignore default numeric values
    const weightNum = data.weight?.trim() ? parseFloat(data.weight) : 0;
    if (weightNum > 0) return true;
    const reOrderNum = data.reOrderLevel?.trim()
      ? parseFloat(data.reOrderLevel)
      : 0;
    if (reOrderNum > 0) return true;
    const costNum = data.cost?.trim() ? parseFloat(data.cost) : 0;
    if (costNum > 0) return true;
    const priceANum = data.priceA?.trim() ? parseFloat(data.priceA) : 0;
    if (priceANum > 0) return true;
    const priceBNum = data.priceB?.trim() ? parseFloat(data.priceB) : 0;
    if (priceBNum > 0) return true;
    const priceMNum = data.priceM?.trim() ? parseFloat(data.priceM) : 0;
    if (priceMNum > 0) return true;
    // Only check origin if it's not empty (empty string is default)
    if (data.origin?.trim()) return true;
    if (data.smc?.trim()) return true;
    if (data.size?.trim()) return true;
    if (data.remarks?.trim()) return true;
    // Check for images
    if (img1) return true;
    if (img2) return true;

    // Ignore default dropdown values: uom "NOS", grade "B", status "A" are defaults
    // These don't count as "data entered by user"

    return false;
  };

  const handleInputChange = (field: keyof PartFormData, value: string) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
  };

  const handleCategorySelect = (categoryId: string, categoryName: string) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        category: categoryName,
        categoryId: categoryId,
        subCategory: "",
        subCategoryId: "",
        application: "",
        applicationId: "",
      };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
    setCategorySearch("");
    setShowCategoryDropdown(false);
  };

  const handleSubcategorySelect = (
    subcategoryId: string,
    subcategoryName: string,
  ) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        subCategory: subcategoryName,
        subCategoryId: subcategoryId,
        application: "",
        applicationId: "",
      };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
    setSubcategorySearch("");
    setShowSubcategoryDropdown(false);
  };

  const handleApplicationSelect = (
    applicationId: string,
    applicationName: string,
  ) => {
    setFormData((prev) => {
      const updated = {
        ...prev,
        application: applicationName,
        applicationId: applicationId,
      };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
  };

  const handleBrandSelect = (brandName: string) => {
    setFormData((prev) => {
      const updated = { ...prev, brand: brandName };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
    setBrandSearch("");
    setShowBrandDropdown(false);
  };

  const handleCreateBrand = async () => {
    const newBrandName = brandSearch.trim();
    if (!newBrandName) {
      toast({
        title: "Error",
        description: "Brand name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createBrand({ name: newBrandName });
      const responseData = response as any;
      if (responseData.data || responseData.id) {
        const newBrand = responseData.data || responseData;
        // Refresh brands list
        const brandsRes = await apiClient.getBrands();
        if (brandsRes.data) {
          setBrands(Array.isArray(brandsRes.data) ? brandsRes.data : []);
        }
        // Select the newly created brand
        handleBrandSelect(newBrand.name);
        toast({
          title: "Success",
          description: "Brand created successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.error || error.message || "Failed to create brand",
        variant: "destructive",
      });
    }
  };

  const handleCreateCategory = async () => {
    const newCategoryName = categorySearch.trim();
    if (!newCategoryName) {
      toast({
        title: "Error",
        description: "Category name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createCategory({
        name: newCategoryName,
      });
      const responseData = response as any;
      if (responseData.data || responseData.id) {
        const newCategory = responseData.data || responseData;
        // Refresh categories list
        const catsRes = await apiClient.getCategories();
        if (catsRes.data) {
          setCategories(Array.isArray(catsRes.data) ? catsRes.data : []);
        }
        // Select the newly created category
        handleCategorySelect(newCategory.id, newCategory.name);
        toast({
          title: "Success",
          description: "Category created successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.error || error.message || "Failed to create category",
        variant: "destructive",
      });
    }
  };

  const handleCreateSubcategory = async () => {
    const newSubcategoryName = subcategorySearch.trim();
    if (!newSubcategoryName) {
      toast({
        title: "Error",
        description: "Subcategory name is required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.categoryId) {
      toast({
        title: "Error",
        description: "Please select a category first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createSubcategory({
        name: newSubcategoryName,
        category_id: formData.categoryId,
      });
      const responseData = response as any;
      if (responseData.data || responseData.id) {
        const newSubcategory = responseData.data || responseData;
        // Refresh subcategories list
        const res = await apiClient.getSubcategories(formData.categoryId);
        if (res.data) {
          setSubcategories(Array.isArray(res.data) ? res.data : []);
        }
        // Select the newly created subcategory
        handleSubcategorySelect(newSubcategory.id, newSubcategory.name);
        toast({
          title: "Success",
          description: "Subcategory created successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.error || error.message || "Failed to create subcategory",
        variant: "destructive",
      });
    }
  };

  const handleCreateApplication = async () => {
    const newApplicationName = formData.application.trim();
    if (!newApplicationName) {
      toast({
        title: "Error",
        description: "Application name is required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.subCategoryId) {
      toast({
        title: "Error",
        description: "Please select a subcategory first",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiClient.createApplication({
        name: newApplicationName,
        subcategory_id: formData.subCategoryId,
      });
      const responseData = response as any;
      if (responseData.data || responseData.id) {
        const newApplication = responseData.data || responseData;
        // Refresh applications list
        const res = await apiClient.getApplications(formData.subCategoryId);
        if (res.data) {
          setApplications(Array.isArray(res.data) ? res.data : []);
        }
        // Select the newly created application
        handleApplicationSelect(newApplication.id, newApplication.name);
        toast({
          title: "Success",
          description: "Application created successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description:
          error.error || error.message || "Failed to create application",
        variant: "destructive",
      });
    }
  };

  // Handle click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Brand dropdown
      if (
        brandDropdownRef.current &&
        !brandDropdownRef.current.contains(event.target as Node)
      ) {
        setShowBrandDropdown(false);
      }
      // Category dropdown
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
      // Subcategory dropdown
      if (
        subcategoryDropdownRef.current &&
        !subcategoryDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSubcategoryDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Search parts by master part number when typing in Part No field
  // DISABLE SEARCH WHEN IN NEW MODE
  useEffect(() => {
    // Skip search functionality when in new mode
    if (isNewMode) {
      setPartsForMasterPartSearch([]);
      setShowMasterPartDropdown(false);
      setMasterPartSearchLoading(false);
      return;
    }

    const searchParts = async () => {
      if (masterPartSearch && masterPartSearch.trim().length >= 2) {
        setMasterPartSearchLoading(true);
        // Dropdown disabled for Part No field
        // setShowMasterPartDropdown(true);
        try {
          const response = await apiClient.getParts({
            master_part_no: masterPartSearch.trim(), // Search ONLY in master part number field
            limit: 50,
            page: 1,
            status: "active",
          });

          // Handle different response structures
          let partsData: any[] = [];
          const responseAny = response as any;
          if (Array.isArray(responseAny)) {
            partsData = responseAny;
          } else if (responseAny.data) {
            if (Array.isArray(responseAny.data)) {
              partsData = responseAny.data;
            } else if (
              responseAny.data.data &&
              Array.isArray(responseAny.data.data)
            ) {
              partsData = responseAny.data.data;
            }
          }

          // Map parts and filter out duplicates by masterPartNo
          const allParts = partsData
            .map((p: any) => ({
              partNo: p.part_no || p.partNo || "",
              description: p.description || "",
              masterPartNo: (p.master_part_no || p.masterPartNo || "").trim(),
            }))
            .filter((p: any) => p.masterPartNo); // Only show parts that have a master part number

          // Group by masterPartNo (case-insensitive and whitespace-insensitive) and keep only unique master parts
          const masterPartMap = new Map();
          allParts.forEach((part: any) => {
            // Use trimmed and uppercased master part number as key for robust uniqueness
            const key = part.masterPartNo.trim().toUpperCase();
            if (!masterPartMap.has(key)) {
              // Store with the original casing from the first occurrence
              masterPartMap.set(key, {
                ...part,
                masterPartNo: part.masterPartNo.trim(), // Ensure trimmed
              });
            }
          });

          // Convert map back to array
          const uniqueMasterParts = Array.from(masterPartMap.values());

          setPartsForMasterPartSearch(uniqueMasterParts);
        } catch (error) {
          setPartsForMasterPartSearch([]);
        } finally {
          setMasterPartSearchLoading(false);
        }
      } else {
        setPartsForMasterPartSearch([]);
        setShowMasterPartDropdown(false);
      }
    };

    // Debounce the search
    const timeoutId = setTimeout(() => {
      searchParts();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [masterPartSearch, isNewMode]);

  const handleMasterPartSelect = (masterPartNo: string) => {
    setFormData((prev) => {
      const updated = { ...prev, masterPartNo: masterPartNo };
      // If form now has data, exit new mode (enable search)
      if (isNewMode && hasFormData(updated, imageP1, imageP2)) {
        setIsNewMode(false);
      }
      return updated;
    });
    setMasterPartSearch(masterPartNo);
    setShowMasterPartDropdown(false);
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    setImage: React.Dispatch<React.SetStateAction<string | null>>,
    imageType: "P1" | "P2",
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Check file size before compression
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "Error",
            description: "Image size must be less than 10MB",
            variant: "destructive",
          });
          return;
        }

        // Show loading toast
        const loadingToast = toast({
          title: "Processing image...",
          description: "Compressing image for upload",
        });

        // Compress and convert to base64
        const compressedBase64 = await compressImage(file, 1920, 1920, 0.8, 10);
        setImage(compressedBase64);
        // If image is added, check if we should exit new mode
        const updatedImageP1 = imageType === "P1" ? compressedBase64 : imageP1;
        const updatedImageP2 = imageType === "P2" ? compressedBase64 : imageP2;
        if (
          isNewMode &&
          hasFormData(formData, updatedImageP1, updatedImageP2)
        ) {
          setIsNewMode(false);
        }

        // Dismiss loading toast
        loadingToast.dismiss();
      } catch (error: any) {
        toast({
          title: "Error",
          description: error.message || "Failed to process image",
          variant: "destructive",
        });
      }
    }
  };

  const handleSave = () => {
    if (!formData.partNo.trim()) {
      toast({
        title: "Validation Error",
        description: "Master Part No is required",
        variant: "destructive",
      });
      return;
    }

    // Ensure master part number is saved from search field if it exists
    // Use masterPartSearch if it has a value, otherwise use formData.masterPartNo
    const finalMasterPartNo =
      masterPartSearch && masterPartSearch.trim()
        ? masterPartSearch.trim()
        : formData.masterPartNo && formData.masterPartNo.trim()
          ? formData.masterPartNo.trim()
          : "";

    const finalFormData = {
      ...formData,
      masterPartNo: finalMasterPartNo,
      imageP1,
      imageP2,
    };

    onSave(finalFormData, isEditing, editItem?.id);
  };

  const handleReset = () => {
    // Close all dropdowns first
    setShowMasterPartDropdown(false);
    setShowBrandDropdown(false);
    setShowCategoryDropdown(false);
    setShowSubcategoryDropdown(false);

    // Set new mode when resetting
    setIsNewMode(true);

    if (editItem?.id) {
      // Reload original data
      const loadPartData = async () => {
        setLoading(true);
        try {
          const response = await apiClient.getPart(editItem.id);
          if (response.data) {
            const part = response.data as any;
            setFormData({
              masterPartNo: part.master_part_no || "",
              partNo: part.part_no || "",
              brand: part.brand_name || "",
              description: part.description || "",
              category: part.category_name || "",
              categoryId: part.category_id || "",
              subCategory: part.subcategory_name || "",
              subCategoryId: part.subcategory_id || "",
              application: part.application_name || "",
              applicationId: part.application_id || "",
              hsCode: part.hs_code || "",
              uom: part.uom || "NOS",
              weight: part.weight?.toString() || "",
              reOrderLevel: part.reorder_level?.toString() || "0",
              cost: part.cost?.toString() || "0.00",
              purchasePrice: part.purchasePrice?.toString() || "0.00",
              avgCost: part.avgCost?.toString() || "0.00",
              priceA: part.price_a?.toString() || "0.00",
              priceB: part.price_b?.toString() || "0.00",
              priceM: part.price_m?.toString() || "0.00",
              rackNo: "",
              origin: part.origin ? String(part.origin).trim() : "",
              grade: part.grade || "B",
              status: part.status === "active" ? "A" : "N",
              smc: part.smc || "",
              size: part.size || "",
              remarks: "",
            });
            setImageP1(part.image_p1 || null);
            setImageP2(part.image_p2 || null);
          }
        } catch (error) {
        } finally {
          setLoading(false);
        }
      };
      loadPartData();
    } else {
      // Reset ALL fields and states - use a fresh copy of initialFormData
      setIsNewMode(true);
      setFormData({
        masterPartNo: "",
        partNo: "",
        brand: "",
        description: "",
        category: "",
        categoryId: "",
        subCategory: "",
        subCategoryId: "",
        application: "",
        applicationId: "",
        hsCode: "",
        uom: "NOS",
        weight: "",
        reOrderLevel: "0",
        cost: "0.00",
        purchasePrice: "0.00",
        avgCost: "0.00",
        priceA: "0.00",
        priceB: "0.00",
        priceM: "0.00",
        rackNo: "",
        origin: "",
        grade: "B",
        status: "A",
        smc: "",
        size: "",
        remarks: "",
      });
      setImageP1(null);
      setImageP2(null);

      // Reset all search states
      setMasterPartSearch("");
      setBrandSearch("");
      setCategorySearch("");
      setSubcategorySearch("");

      // Reset all dropdown visibility states
      setShowMasterPartDropdown(false);
      setShowBrandDropdown(false);
      setShowCategoryDropdown(false);
      setShowSubcategoryDropdown(false);

      // Reset master part search related states
      setPartsForMasterPartSearch([]);
      setMasterPartSearchLoading(false);

      // Reset dependent dropdowns (subcategories and applications depend on parent selections)
      setSubcategories([]);
      setApplications([]);

      // Clear input refs if they exist (force immediate UI update)
      if (masterPartInputRef.current) {
        masterPartInputRef.current.value = "";
      }
    }
  };

  // Filter categories
  const filteredCategories = useMemo(() => {
    if (!categorySearch || categorySearch.trim() === "") {
      return categories;
    }
    const searchLower = categorySearch.toLowerCase();
    return categories.filter(
      (cat) => cat.name && cat.name.toLowerCase().includes(searchLower),
    );
  }, [categories, categorySearch]);

  // Filter subcategories
  const filteredSubcategories = useMemo(() => {
    if (!subcategorySearch || subcategorySearch.trim() === "") {
      return subcategories;
    }
    const searchLower = subcategorySearch.toLowerCase();
    return subcategories.filter(
      (sub) => sub.name && sub.name.toLowerCase().includes(searchLower),
    );
  }, [subcategories, subcategorySearch]);

  // Filter brands
  const filteredBrands = useMemo(() => {
    if (!brandSearch || brandSearch.trim() === "") {
      return brands;
    }
    const searchLower = brandSearch.toLowerCase();
    return brands.filter(
      (b) => b.name && b.name.toLowerCase().includes(searchLower),
    );
  }, [brands, brandSearch]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">
          Loading part data...
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-card rounded-lg border border-border overflow-hidden">
      {/* Scrollable Form Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Part Information Section */}
        <div className="flex items-center gap-1.5 mb-3">
          <span className="text-primary text-xs">•</span>
          <span className="text-[10px] font-medium text-foreground uppercase tracking-wide">
            PART INFORMATION
          </span>
        </div>

        {/* Row 1: Part No, Master Part, Brand */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Master Part No <span className="text-destructive">*</span>
            </label>
            <Input
              placeholder="Enter master part no"
              value={formData.partNo}
              onChange={(e) => handleInputChange("partNo", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div ref={masterPartDropdownRef} className="relative">
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Part No
            </label>
            <div className="relative">
              {/* In new mode, show simple input. In edit mode, show searchable input */}
              {isNewMode ? (
                <Input
                  placeholder="Enter part no"
                  value={formData.masterPartNo}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData((prev) => {
                      const updated = { ...prev, masterPartNo: value };
                      // If form now has data, exit new mode (enable search)
                      if (hasFormData(updated, imageP1, imageP2)) {
                        setIsNewMode(false);
                      }
                      return updated;
                    });
                    setMasterPartSearch(value);
                  }}
                  className="h-7 text-xs"
                />
              ) : (
                <Input
                  ref={masterPartInputRef}
                  placeholder="Type part no or press Enter to add new"
                  value={
                    masterPartSearch !== null && masterPartSearch !== ""
                      ? masterPartSearch
                      : formData.masterPartNo
                  }
                  onChange={(e) => {
                    const value = e.target.value;
                    setMasterPartSearch(value);
                    // Also update formData immediately when typing
                    setFormData((prev) => ({ ...prev, masterPartNo: value }));
                    // Dropdown disabled for Part No field
                    // if (!disableDropdowns) setShowMasterPartDropdown(true);
                  }}
                  onKeyDown={(e) => {
                    // Save value when Enter is pressed
                    if (e.key === "Enter" && masterPartSearch) {
                      e.preventDefault();
                      const finalValue = masterPartSearch.trim();
                      setFormData((prev) => ({
                        ...prev,
                        masterPartNo: finalValue,
                      }));
                      setMasterPartSearch(finalValue);
                      setShowMasterPartDropdown(false);
                    }
                  }}
                  onBlur={(e) => {
                    // Don't close dropdown on blur if clicking within the dropdown area
                    setTimeout(() => {
                      const isClickInDropdown =
                        masterPartDropdownRef.current?.contains(
                          document.activeElement,
                        );
                      if (!isClickInDropdown) {
                        // Save typed value when field loses focus
                        if (masterPartSearch && masterPartSearch.trim()) {
                          setFormData((prev) => ({
                            ...prev,
                            masterPartNo: masterPartSearch.trim(),
                          }));
                          setMasterPartSearch(masterPartSearch.trim());
                        } else if (!masterPartSearch) {
                          setMasterPartSearch(formData.masterPartNo || "");
                        }
                        setShowMasterPartDropdown(false);
                      }
                    }, 200);
                  }}
                  onFocus={() => {
                    // Show current value when focusing
                    if (formData.masterPartNo) {
                      setMasterPartSearch(formData.masterPartNo);
                    }
                    // Dropdown disabled for Part No field
                    // if (!disableDropdowns) setShowMasterPartDropdown(true);
                  }}
                  className="h-7 text-xs"
                />
              )}
              {/* Only show dropdown when NOT in new mode and search conditions are met */}
              {!disableDropdowns &&
                !isNewMode &&
                showMasterPartDropdown &&
                masterPartSearch &&
                masterPartSearch.trim().length >= 2 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {masterPartSearchLoading && (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Searching...
                      </div>
                    )}
                    {!masterPartSearchLoading &&
                      partsForMasterPartSearch.length > 0 && (
                        <>
                          {(() => {
                            // Get unique master part numbers with their first part info
                            const masterPartMap = new Map<
                              string,
                              { partNo: string; description: string }
                            >();
                            partsForMasterPartSearch.forEach((part) => {
                              if (!masterPartMap.has(part.masterPartNo)) {
                                masterPartMap.set(part.masterPartNo, {
                                  partNo: part.partNo,
                                  description: part.description,
                                });
                              }
                            });

                            return Array.from(masterPartMap.entries()).map(
                              ([masterPartNo, info]) => (
                                <button
                                  key={masterPartNo}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleMasterPartSelect(masterPartNo);
                                  }}
                                  className="w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0"
                                >
                                  <p className="font-medium text-foreground text-xs">
                                    {masterPartNo}
                                  </p>
                                  {info.description && (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {info.description}
                                    </p>
                                  )}
                                  <p className="text-xs text-primary mt-0.5">
                                    Part: {info.partNo}
                                  </p>
                                </button>
                              ),
                            );
                          })()}
                        </>
                      )}
                    {!masterPartSearchLoading &&
                      partsForMasterPartSearch.length === 0 &&
                      masterPartSearch.trim().length >= 2 && (
                        <div className="px-4 py-3 text-sm text-muted-foreground">
                          No parts found matching "{masterPartSearch}"
                        </div>
                      )}
                  </div>
                )}
            </div>
          </div>
          <div ref={brandDropdownRef} className="relative">
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Brand
            </label>
            <div className="relative">
              <Input
                placeholder="Search brand..."
                value={
                  showBrandDropdown && brandSearch !== null
                    ? brandSearch
                    : formData.brand || ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setBrandSearch(value);
                  setFormData((prev) => ({ ...prev, brand: value }));
                  if (!disableDropdowns) setShowBrandDropdown(true);
                }}
                onFocus={async (e) => {
                  if (disableDropdowns) return;
                  // When focusing, clear search to show all brands initially
                  // User can then type to filter
                  setBrandSearch("");

                  // If brands are empty, try to refetch them
                  if (brands.length === 0) {
                    try {
                      const brandsRes = await apiClient.getBrands();
                      const brandsResponse = brandsRes as any;

                      let brandsData: any[] = [];
                      if (Array.isArray(brandsResponse)) {
                        brandsData = brandsResponse.filter(
                          (b: any) => b && (b.id || b._id) && b.name,
                        );
                      } else if (
                        brandsResponse?.data &&
                        Array.isArray(brandsResponse.data)
                      ) {
                        brandsData = brandsResponse.data.filter(
                          (b: any) => b && (b.id || b._id) && b.name,
                        );
                      }

                      brandsData = brandsData.map((b: any) => ({
                        id: b.id || b._id || String(Math.random()),
                        name: b.name || b.brand_name || String(b),
                      }));

                      setBrands(brandsData);
                    } catch (error) {}
                  }

                  setShowBrandDropdown(true);
                }}
                onClick={async (e) => {
                  if (disableDropdowns) return;
                  // When clicking, clear search to show all brands initially
                  // User can then type to filter
                  setBrandSearch("");

                  // If brands are empty, try to refetch them
                  if (brands.length === 0) {
                    try {
                      const brandsRes = await apiClient.getBrands();
                      const brandsResponse = brandsRes as any;

                      let brandsData: any[] = [];
                      if (Array.isArray(brandsResponse)) {
                        brandsData = brandsResponse.filter(
                          (b: any) => b && (b.id || b._id) && b.name,
                        );
                      } else if (
                        brandsResponse?.data &&
                        Array.isArray(brandsResponse.data)
                      ) {
                        brandsData = brandsResponse.data.filter(
                          (b: any) => b && (b.id || b._id) && b.name,
                        );
                      }

                      brandsData = brandsData.map((b: any) => ({
                        id: b.id || b._id || String(Math.random()),
                        name: b.name || b.brand_name || String(b),
                      }));

                      setBrands(brandsData);
                    } catch (error) {}
                  }

                  setShowBrandDropdown(true);
                  e.currentTarget.focus();
                }}
                className="h-7 text-xs"
              />
              {!disableDropdowns && showBrandDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                  {/* Debug info */}
                  {(() => {
                    return null;
                  })()}

                  {(() => {
                    // Debug: Force render brands
                    return null;
                  })()}

                  {brands.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      No brands available. Click "+ Add New" below to create
                      one.
                    </div>
                  ) : filteredBrands && filteredBrands.length > 0 ? (
                    <>
                      {filteredBrands.map((b, idx) => {
                        if (!b || !b.name) {
                          return null;
                        }
                        return (
                          <div
                            key={b.id || b.name || `brand-${idx}`}
                            className="px-3 py-2 text-xs hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBrandSelect(b.name);
                            }}
                          >
                            {b.name}
                          </div>
                        );
                      })}
                      <div className="border-t border-border" />
                    </>
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {brandSearch && brandSearch.trim()
                        ? `No brands match "${brandSearch}" (${brands.length} total available)`
                        : `No brands available (${brands.length} loaded)`}
                    </div>
                  )}
                  <div
                    className="px-3 py-2 text-xs hover:bg-primary hover:text-primary-foreground cursor-pointer font-medium flex items-center gap-2 border-t border-border"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateBrand();
                    }}
                  >
                    <Plus className="w-3 h-3" />
                    Add New: "{brandSearch || "New Brand"}"
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        <div className="mb-2">
          <label className="block text-[10px] text-foreground mb-0.5 font-bold">
            Description
          </label>
          <Textarea
            placeholder="Enter part description"
            value={formData.description}
            onChange={(e) => handleInputChange("description", e.target.value)}
            rows={2}
            className="text-xs min-h-[50px] resize-none"
          />
        </div>

        {/* Row 2: Category, Sub Category, Application */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <div ref={categoryDropdownRef} className="relative">
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Category
            </label>
            <div className="relative">
              <Input
                placeholder="Click to select or add new"
                value={
                  categorySearch !== null && categorySearch !== ""
                    ? categorySearch
                    : formData.category || ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setCategorySearch(value);
                  if (!value) {
                    setFormData((prev) => ({
                      ...prev,
                      category: "",
                      categoryId: "",
                    }));
                  }
                  if (!disableDropdowns) setShowCategoryDropdown(true);
                }}
                onFocus={(e) => {
                  if (disableDropdowns) return;
                  // Keep the current value visible but clear search to show all items
                  e.target.select();
                  if (!categorySearch || categorySearch === formData.category) {
                    setCategorySearch("");
                  }
                  setShowCategoryDropdown(true);
                }}
                onClick={(e) => {
                  if (disableDropdowns) return;
                  // Keep the current value visible but clear search to show all items
                  e.currentTarget.focus();
                  if (!categorySearch || categorySearch === formData.category) {
                    setCategorySearch("");
                  }
                  setShowCategoryDropdown(true);
                }}
                className="h-7 text-xs"
              />
              {!disableDropdowns && showCategoryDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                  {filteredCategories.length > 0 ? (
                    <>
                      {filteredCategories.map((cat) => (
                        <div
                          key={cat.id}
                          className="px-3 py-2 text-xs hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
                          onClick={() => handleCategorySelect(cat.id, cat.name)}
                        >
                          {cat.name}
                        </div>
                      ))}
                      <div className="border-t border-border" />
                    </>
                  ) : (
                    <div className="px-3 py-2 text-xs text-muted-foreground">
                      {categories.length === 0
                        ? "No categories available"
                        : "No matching categories"}
                    </div>
                  )}
                  <div
                    className="px-3 py-2 text-xs hover:bg-primary hover:text-primary-foreground cursor-pointer font-medium flex items-center gap-2 border-t border-border"
                    onClick={handleCreateCategory}
                  >
                    <Plus className="w-3 h-3" />
                    Add New: "{categorySearch || "New Category"}"
                  </div>
                </div>
              )}
            </div>
          </div>
          <div ref={subcategoryDropdownRef} className="relative">
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Sub Category
            </label>
            <div className="relative">
              <Input
                placeholder={
                  formData.categoryId
                    ? "Click to select or add new"
                    : "Select category first"
                }
                value={
                  subcategorySearch !== null && subcategorySearch !== ""
                    ? subcategorySearch
                    : formData.subCategory || ""
                }
                onChange={(e) => {
                  const value = e.target.value;
                  setSubcategorySearch(value);
                  if (!value) {
                    setFormData((prev) => ({
                      ...prev,
                      subCategory: "",
                      subCategoryId: "",
                    }));
                  }
                  if (!disableDropdowns) setShowSubcategoryDropdown(true);
                }}
                onFocus={(e) => {
                  if (disableDropdowns) return;
                  if (formData.categoryId) {
                    // Keep the current value visible but clear search to show all items
                    e.target.select();
                    if (
                      !subcategorySearch ||
                      subcategorySearch === formData.subCategory
                    ) {
                      setSubcategorySearch("");
                    }
                    setShowSubcategoryDropdown(true);
                  }
                }}
                onClick={(e) => {
                  if (disableDropdowns) return;
                  if (formData.categoryId) {
                    // Keep the current value visible but clear search to show all items
                    e.currentTarget.focus();
                    if (
                      !subcategorySearch ||
                      subcategorySearch === formData.subCategory
                    ) {
                      setSubcategorySearch("");
                    }
                    setShowSubcategoryDropdown(true);
                  }
                }}
                disabled={!formData.categoryId}
                className="h-7 text-xs"
              />
              {!disableDropdowns &&
                showSubcategoryDropdown &&
                formData.categoryId && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredSubcategories.length > 0 ? (
                      <>
                        {filteredSubcategories.map((sub) => (
                          <div
                            key={sub.id}
                            className="px-3 py-2 text-xs hover:bg-muted cursor-pointer border-b border-border last:border-b-0"
                            onClick={() =>
                              handleSubcategorySelect(sub.id, sub.name)
                            }
                          >
                            {sub.name}
                          </div>
                        ))}
                        <div className="border-t border-border" />
                      </>
                    ) : (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {subcategories.length === 0
                          ? "No subcategories available"
                          : "No matching subcategories"}
                      </div>
                    )}
                    <div
                      className="px-3 py-2 text-xs hover:bg-primary hover:text-primary-foreground cursor-pointer font-medium flex items-center gap-2 border-t border-border"
                      onClick={handleCreateSubcategory}
                    >
                      <Plus className="w-3 h-3" />
                      Add New: "{subcategorySearch || "New Subcategory"}"
                    </div>
                  </div>
                )}
            </div>
          </div>
          <div className="relative">
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Application
            </label>
            <div className="flex items-center gap-1">
              <Input
                placeholder={
                  formData.subCategoryId
                    ? "Type application"
                    : "Please select a sub-category first"
                }
                value={formData.application || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  handleInputChange("application", value);
                  // If user is typing, clear any previously-selected applicationId
                  if (formData.applicationId) {
                    handleInputChange("applicationId", "");
                  }
                  if (!value) {
                    handleInputChange("applicationId", "");
                  }
                }}
                onBlur={() => {
                  const name = (formData.application || "").trim();
                  if (!name) {
                    if (formData.applicationId)
                      handleInputChange("applicationId", "");
                    return;
                  }
                  const match = applications.find(
                    (a) =>
                      (a.name || "").trim().toLowerCase() ===
                      name.toLowerCase(),
                  );
                  if (match) {
                    handleApplicationSelect(match.id, match.name);
                  } else if (formData.applicationId) {
                    handleInputChange("applicationId", "");
                  }
                }}
                disabled={!formData.subCategoryId}
                className="h-7 text-xs flex-1"
              />
            </div>
          </div>
        </div>

        {/* Row 3: HS Code, UOM, Weight */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              HS Code
            </label>
            <Input
              placeholder="Enter HS code"
              value={formData.hsCode}
              onChange={(e) => handleInputChange("hsCode", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              UOM (A-Z)
            </label>
            <Select
              value={formData.uom}
              onValueChange={(v) => handleInputChange("uom", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select UOM" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NOS" className="text-xs">
                  NOS
                </SelectItem>
                <SelectItem value="SET" className="text-xs">
                  SET
                </SelectItem>
                <SelectItem value="KG" className="text-xs">
                  KG
                </SelectItem>
                <SelectItem value="LTR" className="text-xs">
                  LTR
                </SelectItem>
                <SelectItem value="MTR" className="text-xs">
                  MTR
                </SelectItem>
                <SelectItem value="PCS" className="text-xs">
                  PCS
                </SelectItem>
                <SelectItem value="BOX" className="text-xs">
                  BOX
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Weight (Kg)
            </label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.weight}
              onChange={(e) => handleInputChange("weight", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Row 4: Re-Order Level, Cost */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Re-Order Level
            </label>
            <Input
              type="number"
              value={formData.reOrderLevel}
              onChange={(e) =>
                handleInputChange("reOrderLevel", e.target.value)
              }
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Cost
            </label>
            <Input
              type="number"
              step="0.01"
              value={formData.cost}
              onChange={(e) => handleInputChange("cost", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          {/* <div className="bg-muted/30 p-1 rounded-sm">
            <label className="block text-[10px] text-muted-foreground mb-0.5 font-bold">
              Purchase Price
            </label>
            <Input
              type="number"
              readOnly
              value={formData.purchasePrice}
              className="h-6 text-[10px] bg-background/50"
            />
          </div> */}
          {/* <div className="bg-muted/30 p-1 rounded-sm">
            <label className="block text-[10px] text-muted-foreground mb-0.5 font-bold">
              Avg Cost
            </label>
            <Input
              type="number"
              readOnly
              value={formData.avgCost}
              className="h-6 text-[10px] bg-background/50"
            />
          </div> */}
        </div>

        {/* Row 5: Price-A, Price-B, Price-M */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Price-A
            </label>
            <Input
              type="number"
              step="0.01"
              value={formData.priceA}
              onChange={(e) => handleInputChange("priceA", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Price-B
            </label>
            <Input
              type="number"
              step="0.01"
              value={formData.priceB}
              onChange={(e) => handleInputChange("priceB", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Price-M
            </label>
            <Input
              type="number"
              step="0.01"
              value={formData.priceM}
              onChange={(e) => handleInputChange("priceM", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Row 6: Origin, Grade */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Origin
            </label>
            <Select
              value={formData.origin || undefined}
              onValueChange={(v) => handleInputChange("origin", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select Origin" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PRC" className="text-xs">
                  PRC
                </SelectItem>
                <SelectItem value="ITAL" className="text-xs">
                  ITAL
                </SelectItem>
                <SelectItem value="USA" className="text-xs">
                  USA
                </SelectItem>
                <SelectItem value="TURK" className="text-xs">
                  TURK
                </SelectItem>
                <SelectItem value="IND" className="text-xs">
                  IND
                </SelectItem>
                <SelectItem value="UK" className="text-xs">
                  UK
                </SelectItem>
                <SelectItem value="CHN" className="text-xs">
                  CHN
                </SelectItem>
                <SelectItem value="SAM" className="text-xs">
                  SAM
                </SelectItem>
                <SelectItem value="TAIW" className="text-xs">
                  TAIW
                </SelectItem>
                <SelectItem value="KOR" className="text-xs">
                  KOR
                </SelectItem>
                <SelectItem value="GER" className="text-xs">
                  GER
                </SelectItem>
                <SelectItem value="JAP" className="text-xs">
                  JAP
                </SelectItem>
                <SelectItem value="AFR" className="text-xs">
                  AFR
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Grade (A/B/C/D)
            </label>
            <Select
              value={formData.grade}
              onValueChange={(v) => handleInputChange("grade", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select Grade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A" className="text-xs">
                  A
                </SelectItem>
                <SelectItem value="B" className="text-xs">
                  B
                </SelectItem>
                <SelectItem value="C" className="text-xs">
                  C
                </SelectItem>
                <SelectItem value="D" className="text-xs">
                  D
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 7: Status, SMC, Size */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Status (A/N)
            </label>
            <Select
              value={formData.status}
              onValueChange={(v) => handleInputChange("status", v)}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue placeholder="Select Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="A" className="text-xs">
                  Active (A)
                </SelectItem>
                <SelectItem value="N" className="text-xs">
                  Inactive (N)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              SMC
            </label>
            <Input
              placeholder="Enter SMC"
              value={formData.smc}
              onChange={(e) => handleInputChange("smc", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Size
            </label>
            <Input
              placeholder="LxHxW"
              value={formData.size}
              onChange={(e) => handleInputChange("size", e.target.value)}
              className="h-7 text-xs"
            />
          </div>
        </div>

        {/* Image Upload Section */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Image P1
            </label>
            {imageP1 ? (
              <div className="relative border border-border rounded p-1 h-16">
                <img
                  src={imageP1}
                  alt="Image P1"
                  className="w-full h-full object-cover rounded"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 h-4 w-4 p-0"
                  onClick={() => setImageP1(null)}
                >
                  <X className="w-2.5 h-2.5" />
                </Button>
              </div>
            ) : (
              <div
                className="border border-dashed border-border rounded p-1 flex flex-col items-center justify-center hover:border-primary transition-colors cursor-pointer h-16"
                onClick={() => fileInputP1Ref.current?.click()}
              >
                <ImageIcon className="w-3 h-3 text-muted-foreground mb-0.5" />
                <span className="text-[8px] text-muted-foreground">
                  Upload P1
                </span>
                <input
                  ref={fileInputP1Ref}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, setImageP1, "P1")}
                />
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] text-foreground mb-0.5 font-bold">
              Image P2
            </label>
            {imageP2 ? (
              <div className="relative border border-border rounded p-1 h-16">
                <img
                  src={imageP2}
                  alt="Image P2"
                  className="w-full h-full object-cover rounded"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute top-1 right-1 h-4 w-4 p-0"
                  onClick={() => setImageP2(null)}
                >
                  <X className="w-2.5 h-2.5" />
                </Button>
              </div>
            ) : (
              <div
                className="border border-dashed border-border rounded p-1 flex flex-col items-center justify-center hover:border-primary transition-colors cursor-pointer h-16"
                onClick={() => fileInputP2Ref.current?.click()}
              >
                <ImageIcon className="w-3 h-3 text-muted-foreground mb-0.5" />
                <span className="text-[8px] text-muted-foreground">
                  Upload P2
                </span>
                <input
                  ref={fileInputP2Ref}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, setImageP2, "P2")}
                />
              </div>
            )}
          </div>
        </div>

        {/* Remarks */}
        <div className="mb-3">
          <label className="block text-[10px] text-foreground mb-0.5 font-bold">
            Remarks
          </label>
          <Textarea
            placeholder="Enter any additional remarks or notes..."
            value={formData.remarks}
            onChange={(e) => handleInputChange("remarks", e.target.value)}
            rows={2}
            className="text-xs min-h-[40px] resize-none"
          />
        </div>
      </div>

      {/* Fixed Save Button */}
      <div className="p-4 border-t border-border bg-card">
        <div className="flex justify-center gap-2">
          <Button className="gap-1.5 h-8 text-xs px-6" onClick={handleSave}>
            {isEditing ? (
              <Save className="w-3.5 h-3.5" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            {isEditing ? "Update Part" : "Save Part"}
          </Button>
          {isEditing && (
            <Button
              variant="outline"
              className="h-8 text-xs px-4"
              onClick={handleReset}
            >
              Reset
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
