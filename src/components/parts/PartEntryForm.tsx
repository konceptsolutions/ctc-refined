import { useState, useEffect, useRef, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Image as ImageIcon, Trash, Search, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Part } from "./PartsList";
import { compressImage } from "@/utils/imageCompression";
import { apiClient } from "@/lib/api";
import { fetchFamilyPartImages } from "@/lib/part-images";
import { cn } from "@/lib/utils";
import { usePageActions } from "@/permissions/pageActions";

interface ModelQuantity {
  id: string;
  model: string;
  qty: number;
}

interface KitItemRow {
  id: string;
  itemPartId: string;
  itemPartNo: string;
  itemDescription: string;
  quantity: number | "";
}

interface PartFormData {
  masterPartNo: string;
  partNo: string;
  brand: string;
  description: string;
  category: string;
  subCategory: string;
  application: string;
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
  origin: string;
  grade: string;
  status: string;
  smc: string;
  size: string;
  remarks: string;
  type: string;
}

const initialFormData: PartFormData = {
  masterPartNo: "",
  partNo: "",
  brand: "",
  description: "",
  category: "",
  subCategory: "",
  application: "",
  hsCode: "",
  uom: "NOS",
  weight: "",
  reOrderLevel: "",
  cost: "",
  purchasePrice: "",
  avgCost: "",
  priceA: "",
  priceB: "",
  priceM: "",
  origin: "",
  grade: "B",
  status: "A",
  smc: "",
  size: "",
  remarks: "",
  type: "single",
};

const normalizeUomValue = (value: string | null | undefined): string => {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || "NOS";
};

const normalizeAvgPriceValue = (source: any): string => {
  const raw =
    source?.avgCost ??
    source?.avg_cost ??
    source?.avgPrice ??
    source?.avg_price ??
    "";
  if (raw === null || raw === undefined || raw === "") return "0.00";
  const value = Number(raw);
  return Number.isFinite(value) ? value.toFixed(2) : String(raw);
};

const resolveCostPriceValue = (source: any): string => {
  const direct = source?.cost ?? source?.cost_price;
  if (
    direct !== null &&
    direct !== undefined &&
    direct !== "" &&
    Number(direct) !== 0
  ) {
    return String(direct);
  }
  const avg = normalizeAvgPriceValue(source);
  return avg !== "0.00" ? avg : "";
};

interface PartEntryFormProps {
  onSave: (
    part: PartFormData & {
      modelQuantities: ModelQuantity[];
      kitItems: KitItemRow[];
      imageP1?: string | null;
      imageP2?: string | null;
      editingPartId?: string | null;
      saveMode: "create" | "update";
    },
  ) => void | boolean | Promise<void | boolean>;
  selectedPart?: Part | null;
  onClearSelection?: () => void;
  onPartSelected?: (masterPartNo: string | null) => void;
  onPartNoSelected?: (partNo: string | null) => void;
}

export const PartEntryForm = ({
  onSave,
  selectedPart,
  onClearSelection,
  onPartSelected,
  onPartNoSelected,
}: PartEntryFormProps) => {
  const { canCreate, canEdit } = usePageActions("partentry.entry");
  const [formData, setFormData] = useState<PartFormData>(initialFormData);
  const [modelQuantities, setModelQuantities] = useState<ModelQuantity[]>([
    { id: "1", model: "", qty: 0 },
  ]);
  const [kitItems, setKitItems] = useState<KitItemRow[]>([]);
  const [singlePartOptions, setSinglePartOptions] = useState<
    {
      id: string;
      masterPartNo: string;
      partNo: string;
      description: string;
      brandName: string;
    }[]
  >([]);
  const [imageP1, setImageP1] = useState<string | null>(null);
  const [imageP2, setImageP2] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingNew, setIsAddingNew] = useState(false); // Track if user clicked "New" button
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [masterPartAutoFilled, setMasterPartAutoFilled] = useState(false); // Track if master part was auto-filled from part number
  const prevSelectedPartId = useRef<string | null>(null);
  const fileInputP1Ref = useRef<HTMLInputElement>(null);
  const fileInputP2Ref = useRef<HTMLInputElement>(null);

  // Validation errors for prices
  const [priceAError, setPriceAError] = useState<string>("");
  const [priceBError, setPriceBError] = useState<string>("");
  const [costError, setCostError] = useState<string>("");
  const [priceMError, setPriceMError] = useState<string>("");

  // Maximum limit: 10 lakhs (10,00,000 = 1,000,000)
  const MAX_PRICE_LIMIT = 1000000;

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
  const [applicationsLoading, setApplicationsLoading] = useState(false);
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [modelNames, setModelNames] = useState<string[]>([]);
  const [modelNamesLoading, setModelNamesLoading] = useState(false);

  // Search results for dropdowns - CORRECTLY TYPED
  // masterPartNoOptions: unique master_part_no values for Master Part No dropdown
  const [masterPartNoOptions, setMasterPartNoOptions] = useState<
    { value: string; description?: string; application?: string }[]
  >([]);
  // partNoOptions: unique part_no values for Part No dropdown
  const [partNoOptions, setPartNoOptions] = useState<
    { id: string; value: string; description?: string; masterPartNo?: string }[]
  >([]);
  // Family parts - parts that belong to the selected Master Part No
  const [familyPartNoOptions, setFamilyPartNoOptions] = useState<
    { id: string; value: string; description?: string; brand?: string }[]
  >([]);
  const [familyPartsLoading, setFamilyPartsLoading] = useState(false);

  const [masterPartSearchLoading, setMasterPartSearchLoading] = useState(false);
  const [partNoSearchLoading, setPartNoSearchLoading] = useState(false);

  // Dropdown visibility and search
  const [showMasterPartDropdown, setShowMasterPartDropdown] = useState(false);
  const [showPartDropdown, setShowPartDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showSubcategoryDropdown, setShowSubcategoryDropdown] = useState(false);
  const [showApplicationDropdown, setShowApplicationDropdown] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);

  useEffect(() => {
    if (editingPartId || (selectedPart?.id && !isAddingNew)) return;
    // Never auto-load images while the user is still searching/typing.
    if (showMasterPartDropdown || showPartDropdown) return;

    const dbPartNo = String(formData.masterPartNo || "").trim();
    const dbMasterPartNo = String(formData.partNo || "").trim();
    if (!dbPartNo && !dbMasterPartNo) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const shared = await fetchFamilyPartImages(dbPartNo, dbMasterPartNo);
        if (cancelled || !shared) return;
        setImageP1((prev) => prev || shared.imageP1);
        setImageP2((prev) => prev || shared.imageP2);
      } catch {
        // Family image is optional while creating a new item.
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    editingPartId,
    selectedPart?.id,
    isAddingNew,
    showMasterPartDropdown,
    showPartDropdown,
    formData.partNo,
    formData.masterPartNo,
  ]);

  // Flags to prevent closing dropdowns when typing
  const [keepPartDropdownOpen, setKeepPartDropdownOpen] = useState(false);
  const [keepSubcategoryDropdownOpen, setKeepSubcategoryDropdownOpen] =
    useState(false);

  const [masterPartSearch, setMasterPartSearch] = useState("");
  const [partSearch, setPartSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [brandSearch, setBrandSearch] = useState("");

  // Refs for dropdowns
  const masterPartDropdownRef = useRef<HTMLDivElement>(null);
  const masterPartInputRef = useRef<HTMLInputElement>(null);
  const partDropdownRef = useRef<HTMLDivElement>(null);
  const partInputRef = useRef<HTMLInputElement>(null);

  // Keyboard navigation state
  const [masterPartHighlightedIndex, setMasterPartHighlightedIndex] =
    useState(-1);
  const [partHighlightedIndex, setPartHighlightedIndex] = useState(-1);
  const [categoryHighlightedIndex, setCategoryHighlightedIndex] = useState(-1);
  const [subcategoryHighlightedIndex, setSubcategoryHighlightedIndex] =
    useState(-1);
  const [applicationHighlightedIndex, setApplicationHighlightedIndex] =
    useState(-1);
  const [brandHighlightedIndex, setBrandHighlightedIndex] = useState(-1);
  const masterPartOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const partOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const categoryOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const subcategoryOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const applicationOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const brandOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const categoryInputRef = useRef<HTMLInputElement>(null);
  const brandInputRef = useRef<HTMLInputElement>(null);
  const categoryDropdownRef = useRef<HTMLDivElement>(null);
  const subcategoryDropdownRef = useRef<HTMLDivElement>(null);
  const subcategoryInputRef = useRef<HTMLInputElement>(null);
  const applicationInputRef = useRef<HTMLInputElement>(null);
  const applicationDropdownRef = useRef<HTMLDivElement>(null);
  const brandDropdownRef = useRef<HTMLDivElement>(null);

  // Store IDs for category, subcategory, application, brand
  const [categoryId, setCategoryId] = useState<string>("");
  const [subCategoryId, setSubCategoryId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");

  const fetchApplications = async (subcategoryId?: string, search?: string) => {
    setApplicationsLoading(true);
    try {
      const res: any = await apiClient.getApplications(
        subcategoryId,
        undefined,
        search,
      );
      const raw = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : Array.isArray(res?.data?.data)
            ? res.data.data
            : [];

      const normalized = (raw as any[])
        .map((a: any, idx: number) => {
          const id = a?.id || a?._id || `application-${idx}`;
          const name = a?.name || a?.label || (typeof a === "string" ? a : "");
          const sid =
            a?.subcategoryId || a?.subcategory_id || a?.subCategoryId || "";
          const trimmedName = String(name ?? "").trim();
          // Drop invalid "dot" and empty entries
          if (!trimmedName || /^\.+$/.test(trimmedName)) return null;
          return {
            id: String(id),
            name: trimmedName,
            subcategoryId: String(sid),
          };
        })
        .filter(Boolean) as {
          id: string;
          name: string;
          subcategoryId: string;
        }[];

      setApplications(normalized);
    } catch (e) {
      setApplications([]);
    } finally {
      setApplicationsLoading(false);
    }
  };

  // Function to fetch brands (can be called to refresh brands list)
  const fetchBrands = async () => {
    setBrandsLoading(true);
    try {
      // Use getAllBrands to fetch all brands from attributes page
      const brandsRes = await apiClient.getAllBrands();
      let brandsData: { id: string; name: string }[] = [];
      const brandsResponse = brandsRes as any;

      const normalizeBrands = (items: any[]) =>
        items
          .map((b: any, idx: number) => {
            const name =
              b?.name ||
              b?.brand_name ||
              b?.label ||
              (typeof b === "string" ? b : "");
            const id = b?.id || b?._id || b?.value || `brand-${idx}`;
            return name && String(name).trim()
              ? { id, name: String(name).trim() }
              : null;
          })
          .filter(Boolean) as { id: string; name: string }[];

      // Try multiple response structures
      if ((brandsResponse as any)?.error) {
        // Ignore malformed brand response; fallback logic handles recovery.
      } else if (Array.isArray(brandsResponse)) {
        brandsData = normalizeBrands(brandsResponse);
      } else if (Array.isArray((brandsResponse as any)?.data)) {
        brandsData = normalizeBrands((brandsResponse as any).data);
      } else if (Array.isArray((brandsResponse as any)?.data?.data)) {
        brandsData = normalizeBrands((brandsResponse as any).data.data);
      } else if (brandsResponse && typeof brandsResponse === "object") {
        // Try to find any array in the response object
        const possibleArray = Object.values(brandsResponse).find((v) =>
          Array.isArray(v),
        ) as any[] | undefined;
        if (possibleArray) {
          brandsData = normalizeBrands(possibleArray);
        } else {
          // No usable array payload in response object.
        }
      }

      // Fallback: derive unique brands from parts if API returned nothing usable
      if (brandsData.length === 0) {
        try {
          const partsResponse = (await apiClient.getParts({
            limit: 2000,
          })) as any;
          const partsData = Array.isArray(partsResponse)
            ? partsResponse
            : partsResponse?.data?.data || partsResponse?.data || [];

          const unique = new Map<string, { id: string; name: string }>();
          partsData.forEach((part: any, idx: number) => {
            const name = part?.brand_name || part?.brand?.name || part?.brand;
            if (name && typeof name === "string" && name.trim()) {
              const key = name.trim().toUpperCase();
              if (!unique.has(key)) {
                unique.set(key, {
                  id: part?.brand_id || `fallback-${idx}`,
                  name: name.trim(),
                });
              }
            }
          });
          brandsData = Array.from(unique.values());
        } catch (fallbackErr) {
          // Ignore fallback parsing errors; brand list remains empty.
        }
      }

      setBrands(brandsData);
    } catch (error) {
      // Keep UI responsive on dropdown fetch failures.
    } finally {
      setBrandsLoading(false);
    }
  };

  const fetchModelNames = async (search?: string) => {
    setModelNamesLoading(true);
    try {
      const res = (await apiClient.getModelNames(search)) as
        | string[]
        | { data?: string[]; error?: string };
      if (Array.isArray(res)) {
        setModelNames(
          res.map((name) => String(name || "").trim()).filter(Boolean),
        );
        return;
      }
      if (Array.isArray(res?.data)) {
        setModelNames(
          res.data.map((name) => String(name || "").trim()).filter(Boolean),
        );
      }
    } catch {
      setModelNames([]);
    } finally {
      setModelNamesLoading(false);
    }
  };

  const modelSelectOptions = useMemo(() => {
    const names = new Set(modelNames);
    modelQuantities.forEach((mq) => {
      const trimmed = String(mq.model || "").trim();
      if (trimmed) names.add(trimmed);
    });
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({ value: name, label: name }));
  }, [modelNames, modelQuantities]);

  // Fetch dropdown data on mount (categories, brands, subcategories)
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const [catsRes, allSubsRes] = await Promise.all([
          apiClient.getCategories(),
          apiClient.getAllSubcategories?.(),
        ]);

        // Handle categories
        let categoriesData: any[] = [];
        if (Array.isArray(catsRes)) {
          categoriesData = catsRes;
        } else if (
          (catsRes as any)?.data &&
          Array.isArray((catsRes as any).data)
        ) {
          categoriesData = (catsRes as any).data;
        }
        setCategories(categoriesData);

        // Fetch brands
        await fetchBrands();
        await fetchModelNames();

        // Handle subcategories (unrestricted)
        const subsData = Array.isArray((allSubsRes as any)?.data)
          ? (allSubsRes as any).data
          : Array.isArray(allSubsRes)
            ? allSubsRes
            : [];
        setSubcategories(subsData);
      } catch (error) {
        // Ignore dropdown bootstrap failures; fields can be loaded later.
      }
    };

    fetchDropdownData();
  }, []);

  const selectableSinglePartOptions = useMemo(
    () => singlePartOptions.filter((option) => option.id !== selectedPart?.id),
    [singlePartOptions, selectedPart?.id],
  );

  // Refresh brands when dropdown is open and user is typing (to get newly added brands)
  useEffect(() => {
    if (showBrandDropdown && brandSearch.trim().length > 0) {
      const timeoutId = setTimeout(() => {
        fetchBrands();
      }, 300); // Debounce to avoid too many API calls
      return () => clearTimeout(timeoutId);
    }
  }, [showBrandDropdown, brandSearch]);

  useEffect(() => {
    const fetchSingleTypeParts = async () => {
      try {
        const response: any = await apiClient.getPartEntryList({
          limit: "all",
          page: 1,
        });
        const rows = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];

        const singles = rows
          .filter((row: any) => (row?.type || "single") === "single")
          .map((row: any) => ({
            id: String(row.id || ""),
            masterPartNo: String(row.master_part_no || "").trim(),
            partNo: String(row.part_no || "").trim(),
            description: String(row.description || "").trim(),
            brandName: String(row.brand_name || "").trim(),
          }))
          .filter((row: { id: string; partNo: string }) => row.id && row.partNo);

        setSinglePartOptions(singles);
      } catch {
        setSinglePartOptions([]);
      }
    };

    fetchSingleTypeParts();
  }, []);

  useEffect(() => {
    if (formData.type === "kit") {
      setKitItems((prev) =>
        prev.length > 0
          ? prev
          : [
              {
                id: `kit-row-${Date.now()}`,
                itemPartId: "",
                itemPartNo: "",
                itemDescription: "",
                quantity: 1,
              },
            ],
      );
    }
  }, [formData.type]);

  // Fetch applications when application dropdown is open (independent of subcategory/master part)
  useEffect(() => {
    if (!showApplicationDropdown) return;

    const query = formData.application?.trim() || "";
    const timeoutId = setTimeout(() => {
      fetchApplications(undefined, query.length > 0 ? query : undefined);
    }, 200);

    return () => clearTimeout(timeoutId);
  }, [showApplicationDropdown, formData.application]);

  // ============================================
  // MASTER PART NO SEARCH
  // NOTE: Due to database column naming convention matching ItemsListView,
  // "Master Part No" UI field searches/displays values from part_no column
  // ============================================
  useEffect(() => {
    let cancelled = false;
    const searchMasterPartNo = async () => {
      const searchTerm = masterPartSearch?.trim() || "";
      if (searchTerm.length > 0) {
        setMasterPartSearchLoading(true);
        try {
          // Lightweight dropdown endpoint (no stock joins) keeps autocomplete fast.
          const response: any = await apiClient.getPartsDropdown({
            search: searchTerm,
            limit: 80,
          });

          if (cancelled) return;

          let partsData: any[] = [];
          if (Array.isArray(response)) {
            partsData = response;
          } else if (Array.isArray(response?.data)) {
            partsData = response.data;
          } else if (Array.isArray(response?.data?.data)) {
            partsData = response.data.data;
          }

          // Extract UNIQUE part_no values with PARTIAL matching (like Google search)
          // Show parts where part_no starts with or contains the search term
          const searchLower = searchTerm.toLowerCase();
          const uniqueMap = new Map<
            string,
            { value: string; description?: string; application?: string }
          >();
          partsData.forEach((p: any) => {
            // Use part_no / partNo field - ItemsListView "Master Part No" column
            const value = String(p.partNo || p.part_no || "").trim();
            if (value) {
              const valueLower = value.toLowerCase();
              // Partial match: value starts with or contains search term (like Google autocomplete)
              if (
                valueLower.startsWith(searchLower) ||
                valueLower.includes(searchLower)
              ) {
                const key = value.toUpperCase();
                if (!uniqueMap.has(key)) {
                  uniqueMap.set(key, {
                    value: value,
                    description: p.description || "",
                    application: p.application_name || p.application || "",
                  });
                }
              }
            }
          });

          const options = Array.from(uniqueMap.values());
          // Sort: exact matches first, then starts-with matches, then contains matches
          options.sort((a, b) => {
            const aLower = a.value.toLowerCase();
            const bLower = b.value.toLowerCase();
            const aExact = aLower === searchLower;
            const bExact = bLower === searchLower;
            const aStarts = aLower.startsWith(searchLower);
            const bStarts = bLower.startsWith(searchLower);

            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.value.localeCompare(b.value);
          });

          if (!cancelled) setMasterPartNoOptions(options);
        } catch (error) {
          if (!cancelled) setMasterPartNoOptions([]);
        } finally {
          if (!cancelled) setMasterPartSearchLoading(false);
        }
      } else {
        setMasterPartNoOptions([]);
        setMasterPartSearchLoading(false);
      }
    };

    const timeoutId = setTimeout(searchMasterPartNo, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [masterPartSearch]);

  // ============================================
  // FETCH FAMILY PARTS when Master Part No is selected
  // This shows all parts that belong to the selected Master Part No family
  // ============================================
  useEffect(() => {
    let cancelled = false;
    const fetchFamilyParts = async () => {
      if (formData.masterPartNo && formData.masterPartNo.trim().length > 0) {
        setFamilyPartsLoading(true);
        try {
          // Master Part No UI = part_no column; use lightweight dropdown API
          const response: any = await apiClient.getPartsDropdown({
            search: formData.masterPartNo.trim(),
            limit: 200,
          });

          if (cancelled) return;

          let partsData: any[] = [];
          if (Array.isArray(response)) {
            partsData = response;
          } else if (Array.isArray(response?.data)) {
            partsData = response.data;
          } else if (Array.isArray(response?.data?.data)) {
            partsData = response.data.data;
          }

          const masterKey = formData.masterPartNo.trim().toLowerCase();
          // Extract all parts in this family - show master_part_no as "Part No" dropdown options
          const familyParts = partsData
            .filter(
              (p: any) =>
                String(p.partNo || p.part_no || "")
                  .trim()
                  .toLowerCase() === masterKey,
            )
            .map((p: any) => ({
              id: p.id || "",
              value: String(p.masterPartNo || p.master_part_no || "").trim(),
              description: p.description || "",
              brand: p.brand || p.brand_name || "",
            }))
            .filter((p) => p.value); // Only include parts with a value

          if (cancelled) return;
          setFamilyPartNoOptions(familyParts);

          // Auto-fill description from first family part (all family parts share same description)
          if (familyParts.length > 0 && familyParts[0].description) {
            const familyDescription = familyParts[0].description.trim();
            // Only auto-fill if description is currently empty or if user hasn't manually changed it
            // We'll auto-fill it to help user, but they can still edit it
            setFormData((prev) => {
              // If description is empty, auto-fill it
              if (!prev.description || prev.description.trim() === "") {
                return { ...prev, description: familyDescription };
              }
              // If description matches what we would set, it's safe to update (user might have cleared it)
              // Otherwise, keep user's manual entry
              return prev;
            });
          }
        } catch (error) {
          if (!cancelled) setFamilyPartNoOptions([]);
        } finally {
          if (!cancelled) setFamilyPartsLoading(false);
        }
      } else {
        setFamilyPartNoOptions([]);
      }
    };

    fetchFamilyParts();
    return () => {
      cancelled = true;
    };
  }, [formData.masterPartNo]);

  // ============================================
  // PART NO SEARCH
  // NOTE: Due to database column naming convention matching ItemsListView,
  // "Part No" UI field searches/displays values from master_part_no column
  // ============================================
  useEffect(() => {
    let cancelled = false;
    const searchPartNo = async () => {
      const searchTerm = partSearch?.trim() || "";
      if (searchTerm.length > 0) {
        if (searchTerm === formData.partNo && !keepPartDropdownOpen) {
          return;
        }

        setPartNoSearchLoading(true);
        try {
          // Lightweight dropdown endpoint (no stock joins) keeps autocomplete fast.
          const response: any = await apiClient.getPartsDropdown({
            search: searchTerm,
            limit: 80,
          });

          if (cancelled) return;

          let partsData: any[] = [];
          if (Array.isArray(response)) {
            partsData = response;
          } else if (Array.isArray(response?.data)) {
            partsData = response.data;
          } else if (Array.isArray(response?.data?.data)) {
            partsData = response.data.data;
          }

          // Extract UNIQUE master_part_no values with PARTIAL matching (like Google search)
          // Show parts where master_part_no starts with or contains the search term
          const searchLower = searchTerm.toLowerCase();
          const uniqueMap = new Map<
            string,
            { id: string; value: string; description?: string; partNo?: string }
          >();
          partsData.forEach((p: any) => {
            // Use master_part_no / masterPartNo - ItemsListView "Part No" column
            const value = String(p.masterPartNo || p.master_part_no || "").trim();
            if (value) {
              const valueLower = value.toLowerCase();
              // Partial match: value starts with or contains search term (like Google autocomplete)
              if (
                valueLower.startsWith(searchLower) ||
                valueLower.includes(searchLower)
              ) {
                const key = value.toUpperCase();
                if (!uniqueMap.has(key)) {
                  uniqueMap.set(key, {
                    id: p.id || "",
                    value: value,
                    description: p.description || "",
                    partNo: String(p.partNo || p.part_no || "").trim(),
                  });
                }
              }
            }
          });

          const options = Array.from(uniqueMap.values());
          // Sort: exact matches first, then starts-with matches, then contains matches
          options.sort((a, b) => {
            const aLower = a.value.toLowerCase();
            const bLower = b.value.toLowerCase();
            const aExact = aLower === searchLower;
            const bExact = bLower === searchLower;
            const aStarts = aLower.startsWith(searchLower);
            const bStarts = bLower.startsWith(searchLower);

            if (aExact && !bExact) return -1;
            if (!aExact && bExact) return 1;
            if (aStarts && !bStarts) return -1;
            if (!aStarts && bStarts) return 1;
            return a.value.localeCompare(b.value);
          });

          if (!cancelled) {
            setPartNoOptions(options);
            // Only show dropdown if it's already open (user clicked on the field)
            if (showPartDropdown || keepPartDropdownOpen) {
              setShowPartDropdown(true);
            }
          }
        } catch (error) {
          if (!cancelled) setPartNoOptions([]);
        } finally {
          if (!cancelled) setPartNoSearchLoading(false);
        }
      } else {
        setPartNoOptions([]);
        setPartNoSearchLoading(false);
        if (!keepPartDropdownOpen && !formData.masterPartNo) {
          setShowPartDropdown(false);
        }
      }
    };

    const timeoutId = setTimeout(searchPartNo, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [
    partSearch,
    formData.partNo,
    formData.masterPartNo,
    keepPartDropdownOpen,
    showPartDropdown,
  ]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;

      if (
        masterPartDropdownRef.current &&
        !masterPartDropdownRef.current.contains(target)
      ) {
        setShowMasterPartDropdown(false);
      }

      if (
        partDropdownRef.current &&
        !partDropdownRef.current.contains(target)
      ) {
        const isClickOnInput =
          partInputRef.current && partInputRef.current.contains(target);
        if (!isClickOnInput && !keepPartDropdownOpen) {
          setShowPartDropdown(false);
        }
      }
      if (
        categoryDropdownRef.current &&
        !categoryDropdownRef.current.contains(event.target as Node)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        subcategoryDropdownRef.current &&
        !subcategoryDropdownRef.current.contains(target)
      ) {
        const isClickOnInput =
          subcategoryInputRef.current &&
          subcategoryInputRef.current.contains(target);
        if (!isClickOnInput && !keepSubcategoryDropdownOpen) {
          setShowSubcategoryDropdown(false);
        }
      }
      if (
        applicationDropdownRef.current &&
        !applicationDropdownRef.current.contains(target)
      ) {
        const isClickOnInput =
          applicationInputRef.current &&
          applicationInputRef.current.contains(target);
        if (!isClickOnInput) {
          setShowApplicationDropdown(false);
          setApplicationHighlightedIndex(-1);
        }
      }
      if (
        brandDropdownRef.current &&
        !brandDropdownRef.current.contains(event.target as Node)
      ) {
        setShowBrandDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [keepPartDropdownOpen, keepSubcategoryDropdownOpen]);

  // Populate form when a part is selected from list (only on new selection)
  useEffect(() => {
    if (selectedPart && selectedPart.id !== prevSelectedPartId.current) {
      const loadPartData = async () => {
        try {
          const { apiClient } = await import("@/lib/api");
          const responseAny = await (apiClient as any).getPart(selectedPart.id);
          const part: any = responseAny?.data || responseAny;
          if (part && part.id) {
            // SWAPPED mapping to match ItemsListView display convention:
            // - "Master Part No" UI field shows part_no data
            // - "Part No" UI field shows master_part_no data
            const costValue = resolveCostPriceValue(part) || resolveCostPriceValue(selectedPart);
            const priceAValue =
              part.price_a && part.price_a !== 0
                ? part.price_a.toString()
                : selectedPart.price && selectedPart.price !== 0
                  ? selectedPart.price.toString()
                  : "";
            const priceBValue =
              part.price_b && part.price_b !== 0 ? part.price_b.toString() : "";

            setFormData({
              ...initialFormData,
              masterPartNo: part.master_part_no || "",
              partNo: part.part_no || "",
              brand: part.brand_name || selectedPart.brand || "",
              uom: normalizeUomValue(part.uom || selectedPart.uom),
              cost: costValue,
              purchasePrice: part.purchasePrice
                ? part.purchasePrice.toString()
                : "",
              avgCost:
                normalizeAvgPriceValue(part) ||
                normalizeAvgPriceValue(selectedPart),
              priceA: priceAValue,
              priceB: priceBValue,
              priceM:
                part.price_m && part.price_m !== 0
                  ? part.price_m.toString()
                  : "",
              description: part.description || "",
              category: part.category_name || "",
              subCategory: part.subcategory_name || "",
              application: part.application_name || "",
              hsCode: part.hs_code || "",
              weight:
                part.weight !== null && part.weight !== undefined
                  ? formatWeightValue(part.weight.toString())
                  : "",
              reOrderLevel:
                part.reorder_level && part.reorder_level !== 0
                  ? part.reorder_level.toString()
                  : "",
              smc: part.smc || "",
              size: part.size || "",
              status: part.status === "active" ? "A" : "N",
              origin: part.origin ? String(part.origin).trim() : "",
              grade: part.grade || "B",
              remarks: part.remarks || "",
              type: part.type || "single",
            });

            // Validate prices after loading
            const costLimitErr = validateMaxLimit(costValue, "Cost");
            const priceALimitErr = validateMaxLimit(priceAValue, "Price A");
            const priceBLimitErr = validateMaxLimit(priceBValue, "Price B");
            const priceMLimitErr = validateMaxLimit(
              part.price_m && part.price_m !== 0 ? part.price_m.toString() : "",
              "Price M",
            );
            const priceAErr = validatePrice(priceAValue, costValue, "A");
            const priceBErr = validatePrice(priceBValue, costValue, "B");

            setCostError(costLimitErr);
            setPriceAError(priceALimitErr || priceAErr);
            setPriceBError(priceBLimitErr || priceBErr);
            setPriceMError(priceMLimitErr);
            // Update search inputs to match form data (swapped)
            setMasterPartSearch(part.part_no || "");
            setPartSearch(part.master_part_no || "");

            setImageP1(part.image_p1 || null);
            setImageP2(part.image_p2 || null);
            if (
              part.models &&
              Array.isArray(part.models) &&
              part.models.length > 0
            ) {
              setModelQuantities(
                part.models.map((m: any, index: number) => ({
                  id: m.id || `model-${index}`,
                  model: m.name || "",
                  qty: m.qty_used || m.qtyUsed || 0,
                })),
              );
            } else {
              setModelQuantities([{ id: "1", model: "", qty: 0 }]);
            }
            if (Array.isArray(part.kit_items)) {
              setKitItems(
                part.kit_items.map((row: any, index: number) => ({
                  id: `kit-item-${index}-${Date.now()}`,
                  itemPartId: String(row.item_part_id || "").trim(),
                  itemPartNo: String(row.item_part_no || "").trim(),
                  itemDescription: String(row.item_description || "").trim(),
                  quantity: Math.max(1, Number(row.quantity || 1)),
                })),
              );
            } else {
              setKitItems([]);
            }
            setIsEditing(true);
            setIsAddingNew(false); // Clear adding new mode when editing existing part
            setEditingPartId(part.id);
            prevSelectedPartId.current = selectedPart.id;
            toast({
              title: "Part Selected",
              description: `Loaded details for part "${part.part_no || selectedPart.partNo}"`,
            });
          } else {
            throw new Error("Invalid part data received");
          }
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to load part details. Please try again.",
            variant: "destructive",
          });
          setFormData({
            ...initialFormData,
            partNo: selectedPart.partNo,
            brand: selectedPart.brand || "",
            uom: normalizeUomValue(selectedPart.uom),
            avgCost:
              normalizeAvgPriceValue(selectedPart),
            cost:
              resolveCostPriceValue(selectedPart) ||
              (selectedPart.cost && selectedPart.cost !== 0
                ? selectedPart.cost.toString()
                : ""),
            priceA:
              selectedPart.price && selectedPart.price !== 0
                ? selectedPart.price.toString()
                : "",
          });
          setImageP1(null);
          setImageP2(null);
          setModelQuantities([{ id: "1", model: "", qty: 0 }]);
          setKitItems([]);
          setIsEditing(true);
          setIsAddingNew(false); // Clear adding new mode when editing existing part
          setEditingPartId(selectedPart.id);
          prevSelectedPartId.current = selectedPart.id;
        }
      };
      loadPartData();
    } else if (!selectedPart) {
      prevSelectedPartId.current = null;
      setEditingPartId(null);
      setImageP1(null);
      setImageP2(null);
      setIsEditing(false);
      setKitItems([]);
    }
  }, [selectedPart]);

  // When Part No and Master Part No are set, load part by part no to get models (including sibling models)
  useEffect(() => {
    const partNo = formData.partNo?.trim() || "";
    const masterPartNo = formData.masterPartNo?.trim() || "";
    if (!partNo || !masterPartNo) return;

    const timer = setTimeout(async () => {
      try {
        const response: any = await apiClient.getPartByPartNo(partNo, masterPartNo);
        const part = response?.data || response;
        if (part?.models && Array.isArray(part.models) && part.models.length > 0) {
          setModelQuantities(
            part.models.map((m: any, index: number) => ({
              id: m.id || `model-${index}`,
              model: m.name || "",
              qty: m.qty_used ?? m.qtyUsed ?? 0,
            })),
          );
        }
      } catch {
        // Ignore: part may not exist or network error
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [formData.partNo, formData.masterPartNo]);

  // Validate maximum limit (10 lakhs)
  const validateMaxLimit = (value: string, fieldName: string): string => {
    if (!value || value.trim() === "") {
      return ""; // No error if empty
    }

    const num = parseFloat(value);

    if (isNaN(num)) {
      return ""; // No error if invalid number
    }

    if (num > MAX_PRICE_LIMIT) {
      return `${fieldName} cannot exceed 10,00,000 (10 Lakhs)`;
    }

    return "";
  };

  // Validate price against cost
  const validatePrice = (
    price: string,
    cost: string,
    priceType: "A" | "B",
  ): string => {
    if (!price || price.trim() === "" || !cost || cost.trim() === "") {
      return ""; // No error if either is empty
    }

    const priceNum = parseFloat(price);
    const costNum = parseFloat(cost);

    if (isNaN(priceNum) || isNaN(costNum)) {
      return ""; // No error if invalid numbers
    }

    if (priceNum < costNum) {
      return `Price ${priceType} will not less than Cost Price`;
    }

    return "";
  };

  // Format and limit numeric value to max 10 lakhs
  const formatPriceValue = (
    value: string,
    fieldName: string,
  ): { value: string; error: string } => {
    if (!value || value.trim() === "") {
      return { value: "", error: "" };
    }

    // Remove any non-numeric characters except decimal point
    let cleaned = value.replace(/[^\d.]/g, "");

    // Handle multiple decimal points - keep only the first one
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }

    // Limit to 2 decimal places for prices
    if (parts.length === 2 && parts[1].length > 2) {
      cleaned = parts[0] + "." + parts[1].substring(0, 2);
    }

    // Check if value exceeds maximum limit
    const num = parseFloat(cleaned);
    if (!isNaN(num) && num > MAX_PRICE_LIMIT) {
      // Limit to maximum value
      cleaned = MAX_PRICE_LIMIT.toString();
      return {
        value: cleaned,
        error: `${fieldName} cannot exceed 10,00,000 (10 Lakhs)`,
      };
    }

    const error = validateMaxLimit(cleaned, fieldName);
    return { value: cleaned, error };
  };

  const handleInputChange = (field: keyof PartFormData, value: string) => {
    setFormData((prev) => {
      let finalValue = field === "uom" ? normalizeUomValue(value) : value;

      // Apply limit and formatting for cost and price fields
      if (field === "cost") {
        const formatted = formatPriceValue(value, "Cost");
        finalValue = formatted.value;
        setCostError(formatted.error);
      } else if (field === "priceA") {
        const formatted = formatPriceValue(value, "Price A");
        finalValue = formatted.value;
        const limitError = formatted.error;
        const updated = { ...prev, [field]: finalValue };
        const cost = updated.cost;
        const priceError = validatePrice(finalValue, cost, "A");
        setPriceAError(limitError || priceError);
      } else if (field === "priceB") {
        const formatted = formatPriceValue(value, "Price B");
        finalValue = formatted.value;
        const limitError = formatted.error;
        const updated = { ...prev, [field]: finalValue };
        const cost = updated.cost;
        const priceError = validatePrice(finalValue, cost, "B");
        setPriceBError(limitError || priceError);
      } else if (field === "priceM") {
        const formatted = formatPriceValue(value, "Price M");
        finalValue = formatted.value;
        setPriceMError(formatted.error);
      }

      const updated = { ...prev, [field]: finalValue };

      // Auto-fill Master Part No when adding new item (after clicking "New" button) and Part No is entered
      if (field === "partNo" && isAddingNew && finalValue.trim() !== "") {
        // If master part is empty or was previously auto-filled, keep it in sync with part number
        if (
          !prev.masterPartNo ||
          prev.masterPartNo.trim() === "" ||
          masterPartAutoFilled
        ) {
          updated.masterPartNo = finalValue;
          setMasterPartSearch(finalValue);
          setMasterPartAutoFilled(true);
        }
      }

      // Reset auto-fill flag if master part is manually changed
      if (
        field === "masterPartNo" &&
        masterPartAutoFilled &&
        finalValue !== prev.partNo
      ) {
        setMasterPartAutoFilled(false);
      }

      // Re-validate prices against cost when cost changes
      if (field === "cost") {
        const cost = finalValue;
        const priceA = updated.priceA;
        const priceB = updated.priceB;
        const priceAErr = validatePrice(priceA, cost, "A");
        const priceBErr = validatePrice(priceB, cost, "B");
        const priceALimitErr = validateMaxLimit(priceA, "Price A");
        const priceBLimitErr = validateMaxLimit(priceB, "Price B");
        setPriceAError(priceALimitErr || priceAErr);
        setPriceBError(priceBLimitErr || priceBErr);
      }

      return updated;
    });
  };

  const selectBrand = (brand: { id: string; name: string }) => {
    const previousBrand = String(formData.brand || "").trim().toLowerCase();
    const nextBrand = String(brand.name || "").trim();
    const brandChanged =
      previousBrand !== nextBrand.toLowerCase();

    handleInputChange("brand", nextBrand);
    setBrandId(brand.id);
    setBrandSearch(nextBrand);
    setShowBrandDropdown(false);
    setBrandHighlightedIndex(-1);

    // Changing brand on a selected/edited part resets sell/cost prices.
    if (brandChanged && (editingPartId || selectedPart || isEditing)) {
      setFormData((prev) => ({
        ...prev,
        brand: nextBrand,
        cost: "0",
        priceA: "0",
        priceB: "0",
      }));
      setCostError("");
      setPriceAError("");
      setPriceBError("");
    }
  };

  // Format weight to max 3 decimal places
  const formatWeightValue = (value: string): string => {
    if (!value || value.trim() === "") {
      return "";
    }

    // Remove any non-numeric characters except decimal point
    let cleaned = value.replace(/[^\d.]/g, "");

    // Handle multiple decimal points - keep only the first one
    const parts = cleaned.split(".");
    if (parts.length > 2) {
      cleaned = parts[0] + "." + parts.slice(1).join("");
    }

    // Limit to 3 decimal places
    if (parts.length === 2 && parts[1].length > 3) {
      cleaned = parts[0] + "." + parts[1].substring(0, 3);
    }

    return cleaned;
  };

  // Populate form from a full part object (when selecting from dropdown)
  const populateFormFromFullPart = async (
    partId: string,
    fallback: { masterPartNo: string; partNo: string; description?: string },
  ) => {
    try {
      const response: any = await apiClient.getPart(partId);
      const fullPart = response?.data || response;

      if (fullPart && fullPart.id) {
        setEditingPartId(fullPart.id);
        // SWAPPED: part_no -> masterPartNo UI, master_part_no -> partNo UI
        const masterPartNoValue = (
          fullPart.part_no ||
          fallback.masterPartNo ||
          ""
        ).trim();
        const partNoValue = (
          fullPart.master_part_no ||
          fallback.partNo ||
          ""
        ).trim();

        setFormData((prev) => ({
          ...prev,
          masterPartNo: masterPartNoValue,
          partNo: partNoValue,
          brand: fullPart.brand_name || prev.brand || "",
          description: fullPart.description || prev.description || "",
          category: fullPart.category_name || prev.category || "",
          subCategory: fullPart.subcategory_name || prev.subCategory || "",
          application: fullPart.application_name || prev.application || "",
          hsCode: fullPart.hs_code || prev.hsCode || "",
          uom: normalizeUomValue(fullPart.uom || prev.uom),
          weight: fullPart.weight !== null && fullPart.weight !== undefined
            ? formatWeightValue(fullPart.weight.toString())
            : prev.weight || "",
          reOrderLevel:
            fullPart.reorder_level && fullPart.reorder_level !== 0
              ? fullPart.reorder_level.toString()
              : prev.reOrderLevel,
          avgCost:
            normalizeAvgPriceValue(fullPart),
          cost: resolveCostPriceValue(fullPart) || prev.cost,
          priceA:
            fullPart.price_a && fullPart.price_a !== 0
              ? fullPart.price_a.toString()
              : prev.priceA,
          priceB:
            fullPart.price_b && fullPart.price_b !== 0
              ? fullPart.price_b.toString()
              : prev.priceB,
          priceM:
            fullPart.price_m && fullPart.price_m !== 0
              ? fullPart.price_m.toString()
              : prev.priceM,
          origin: fullPart.origin
            ? String(fullPart.origin).trim()
            : prev.origin,
          grade: fullPart.grade || prev.grade || "B",
          status:
            fullPart.status === "active"
              ? "A"
              : fullPart.status === "inactive"
                ? "N"
                : prev.status,
          smc: fullPart.smc || prev.smc || "",
          size: fullPart.size || prev.size || "",
          remarks: fullPart.remarks || prev.remarks || "",
          type: fullPart.type || prev.type || "single",
        }));

        setMasterPartSearch(masterPartNoValue);
        setPartSearch(partNoValue);

        if (fullPart.brand_id) setBrandId(fullPart.brand_id);
        if (fullPart.category_id) setCategoryId(fullPart.category_id);
        if (fullPart.subcategory_id) setSubCategoryId(fullPart.subcategory_id);

        // Validate prices after populating form
        const costVal = resolveCostPriceValue(fullPart);
        const priceAVal =
          fullPart.price_a && fullPart.price_a !== 0
            ? fullPart.price_a.toString()
            : "";
        const priceBVal =
          fullPart.price_b && fullPart.price_b !== 0
            ? fullPart.price_b.toString()
            : "";
        const priceMVal =
          fullPart.price_m && fullPart.price_m !== 0
            ? fullPart.price_m.toString()
            : "";

        const costLimitErr = validateMaxLimit(costVal, "Cost");
        const priceALimitErr = validateMaxLimit(priceAVal, "Price A");
        const priceBLimitErr = validateMaxLimit(priceBVal, "Price B");
        const priceMLimitErr = validateMaxLimit(priceMVal, "Price M");
        const priceAErr = validatePrice(priceAVal, costVal, "A");
        const priceBErr = validatePrice(priceBVal, costVal, "B");

        setCostError(costLimitErr);
        setPriceAError(priceALimitErr || priceAErr);
        setPriceBError(priceBLimitErr || priceBErr);
        setPriceMError(priceMLimitErr);

        setImageP1(fullPart.image_p1 || null);
        setImageP2(fullPart.image_p2 || null);

        // Load models and quantity used
        if (
          fullPart.models &&
          Array.isArray(fullPart.models) &&
          fullPart.models.length > 0
        ) {
          setModelQuantities(
            fullPart.models.map((m: any, index: number) => ({
              id: m.id || `model-${index}`,
              model: m.name || "",
              qty: m.qty_used || m.qtyUsed || 0,
            })),
          );
        } else {
          setModelQuantities([{ id: "1", model: "", qty: 0 }]);
        }
        if (Array.isArray(fullPart.kit_items)) {
          setKitItems(
            fullPart.kit_items.map((row: any, index: number) => ({
              id: `kit-item-${index}-${Date.now()}`,
              itemPartId: String(row.item_part_id || "").trim(),
              itemPartNo: String(row.item_part_no || "").trim(),
              itemDescription: String(row.item_description || "").trim(),
              quantity: Math.max(1, Number(row.quantity || 1)),
            })),
          );
        } else {
          setKitItems([]);
        }

        setIsEditing(true);

        return { masterPartNo: masterPartNoValue, partNo: partNoValue };
      }
    } catch (e) {
      // Fall back to lightweight option data when full part load fails.
    }

    // Fallback
    setFormData((prev) => ({
      ...prev,
      masterPartNo: fallback.masterPartNo,
      partNo: fallback.partNo,
      description: fallback.description || prev.description,
    }));
    setMasterPartSearch(fallback.masterPartNo);
    setPartSearch(fallback.partNo);
    setModelQuantities([{ id: "1", model: "", qty: 0 }]);
    setKitItems([]);

    return fallback;
  };

  const handleAddModel = () => {
    setModelQuantities((prev) => [
      ...prev,
      { id: Date.now().toString(), model: "", qty: 0 },
    ]);
  };

  const handleRemoveModel = (id: string) => {
    setModelQuantities((prev) => prev.filter((m) => m.id !== id));
  };

  const handleModelChange = (
    id: string,
    field: "model" | "qty",
    value: string | number,
  ) => {
    setModelQuantities((prev) =>
      prev.map((m) => (m.id === id ? { ...m, [field]: value } : m)),
    );
  };

  const handleAddKitItem = () => {
    setKitItems((prev) => [
      ...prev,
      {
        id: `kit-row-${Date.now()}`,
        itemPartId: "",
        itemPartNo: "",
        itemDescription: "",
        quantity: 1,
      },
    ]);
  };

  const handleRemoveKitItem = (id: string) => {
    setKitItems((prev) => prev.filter((row) => row.id !== id));
  };

  const handleKitItemPartChange = (id: string, itemPartId: string) => {
    const part = singlePartOptions.find((row) => row.id === itemPartId);
    setKitItems((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
            ...row,
            itemPartId,
            itemPartNo: part?.partNo || "",
            itemDescription: part?.description || "",
          }
          : row,
      ),
    );
  };

  const handleKitItemQtyChange = (id: string, qty: number | "") => {
    setKitItems((prev) =>
      prev.map((row) =>
        row.id === id
          ? {
              ...row,
              quantity: qty === "" ? "" : Math.max(1, Number(qty)),
            }
          : row,
      ),
    );
  };

  const handleSaveWithMode = async (saveMode: "create" | "update") => {
    if (!formData.partNo.trim()) {
      toast({
        title: "Validation Error",
        description: "Part No is required",
        variant: "destructive",
      });
      return;
    }

    if (
      saveMode === "update" &&
      !(editingPartId || selectedPart?.id)
    ) {
      toast({
        title: "Validation Error",
        description: "No existing part selected to update",
        variant: "destructive",
      });
      return;
    }

    // Validate prices before saving
    const cost = formData.cost.trim();
    const priceA = formData.priceA.trim();
    const priceB = formData.priceB.trim();
    const priceM = formData.priceM.trim();

    // Check maximum limits
    const costLimitErr = validateMaxLimit(cost, "Cost");
    const priceALimitErr = validateMaxLimit(priceA, "Price A");
    const priceBLimitErr = validateMaxLimit(priceB, "Price B");
    const priceMLimitErr = validateMaxLimit(priceM, "Price M");

    // Check price comparison
    const priceAErr = validatePrice(priceA, cost, "A");
    const priceBErr = validatePrice(priceB, cost, "B");

    setCostError(costLimitErr);
    setPriceAError(priceALimitErr || priceAErr);
    setPriceBError(priceBLimitErr || priceBErr);
    setPriceMError(priceMLimitErr);

    if (
      costLimitErr ||
      priceALimitErr ||
      priceBLimitErr ||
      priceMLimitErr ||
      priceAErr ||
      priceBErr
    ) {
      const errors = [];
      if (costLimitErr) errors.push("Cost exceeds 10 Lakhs");
      if (priceALimitErr) errors.push("Price A exceeds 10 Lakhs");
      if (priceBLimitErr) errors.push("Price B exceeds 10 Lakhs");
      if (priceMLimitErr) errors.push("Price M exceeds 10 Lakhs");
      if (priceAErr) errors.push("Price A cannot be less than Cost");
      if (priceBErr) errors.push("Price B cannot be less than Cost");

      toast({
        title: "Validation Error",
        description: errors.join(", "),
        variant: "destructive",
      });
      return;
    }

    const preparedKitItems =
      formData.type === "kit"
        ? kitItems
          .filter((row) => row.itemPartId)
          .map((row) => ({
            ...row,
            quantity: Math.max(1, Number(row.quantity || 1)),
          }))
        : [];

    if (saveMode === "create") {
      const uiPartNo = formData.partNo.trim().toLowerCase();
      const uiMasterPartNo = String(
        masterPartSearch || formData.masterPartNo || "",
      )
        .trim()
        .toLowerCase();
      const uiBrand = String(brandSearch || formData.brand || "")
        .trim()
        .toLowerCase();
      const familyDuplicate = familyPartNoOptions.some(
        (p) =>
          String(p.value || "").trim().toLowerCase() === uiPartNo &&
          String(p.brand || "").trim().toLowerCase() === uiBrand,
      );
      if (familyDuplicate && uiMasterPartNo) {
        toast({
          title: "Error",
          description: "This item already exists",
          variant: "destructive",
        });
        return;
      }

      try {
        const response: any = await apiClient.getPartEntryList({
          part_no: uiMasterPartNo || undefined,
          search: uiPartNo || undefined,
          limit: 200,
        });
        const partsData = Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : [];
        const exists = partsData.some((p: any) => {
          const existingPartNo = String(p.master_part_no || "")
            .trim()
            .toLowerCase();
          const existingMasterPartNo = String(p.part_no || "")
            .trim()
            .toLowerCase();
          const existingBrand = String(p.brand_name || p.brand || "")
            .trim()
            .toLowerCase();
          return (
            existingPartNo === uiPartNo &&
            existingMasterPartNo === uiMasterPartNo &&
            existingBrand === uiBrand
          );
        });
        if (exists) {
          toast({
            title: "Error",
            description: "This item already exists",
            variant: "destructive",
          });
          return;
        }
      } catch {
        // Backend create will still reject a duplicate if this lookup fails.
      }
    }

    const saved = await Promise.resolve(
      onSave({
        ...formData,
        modelQuantities,
        kitItems: preparedKitItems,
        imageP1,
        imageP2,
        saveMode,
        editingPartId:
          saveMode === "update"
            ? editingPartId || selectedPart?.id || null
            : null,
      }),
    );
    if (saved === false) {
      return;
    }

    // Notify parent component about selected part number
    const partNo = formData.partNo.trim();
    if (onPartNoSelected && partNo) {
      onPartNoSelected(partNo);
    }

    setFormData(initialFormData);
    setModelQuantities([{ id: "1", model: "", qty: 0 }]);
    setKitItems([]);
    setEditingPartId(null);
    setImageP1(null);
    setImageP2(null);
    setIsEditing(false);
    setIsAddingNew(true);
    setMasterPartAutoFilled(false);
    prevSelectedPartId.current = null;
    setMasterPartSearch("");
    setPartSearch("");
    setPartNoOptions([]);
    setShowPartDropdown(false);
    setKeepPartDropdownOpen(false);
    setMasterPartNoOptions([]);
    setShowMasterPartDropdown(false);
    setCategorySearch("");
    setSubcategorySearch("");
    setCategoryId("");
    setSubCategoryId("");
    setShowCategoryDropdown(false);
    setShowSubcategoryDropdown(false);
    setShowApplicationDropdown(false);
    setShowBrandDropdown(false);
    setFamilyPartNoOptions([]);
    setMasterPartHighlightedIndex(-1);
    setPartHighlightedIndex(-1);
    setCategoryHighlightedIndex(-1);
    setSubcategoryHighlightedIndex(-1);
    setApplicationHighlightedIndex(-1);
    setBrandHighlightedIndex(-1);
    setBrandSearch("");
    setBrandId("");
    if (fileInputP1Ref.current) fileInputP1Ref.current.value = "";
    if (fileInputP2Ref.current) fileInputP2Ref.current.value = "";

    // Clear validation errors
    setPriceAError("");
    setPriceBError("");
    setCostError("");
    setPriceMError("");

    toast({
      title: "Success",
      description:
        saveMode === "update"
          ? "Part updated successfully"
          : "Part created successfully",
    });
  };

  const formatNumericValue = (value: string): string => {
    if (!value || value === "0" || value === "0.00" || value === "0.0") {
      return "";
    }
    return value;
  };

  const handleReset = () => {
    // Reset form data
    setFormData(initialFormData);

    // Reset Models section
    setModelQuantities([{ id: "1", model: "", qty: 0 }]);
    setKitItems([]);

    // Reset images
    setImageP1(null);
    setImageP2(null);

    // Reset editing state
    setIsEditing(false);
    setEditingPartId(null);

    // Reset adding new mode when Reset is clicked
    setIsAddingNew(false);

    // Reset all search states
    setPartSearch("");
    setPartNoOptions([]);
    setShowPartDropdown(false);
    setKeepPartDropdownOpen(false);
    setMasterPartSearch("");
    setMasterPartNoOptions([]);
    setShowMasterPartDropdown(false);
    setCategorySearch("");
    setSubcategorySearch("");
    setBrandSearch("");
    setCategoryId("");
    setSubCategoryId("");
    setBrandId("");

    // Reset dropdowns
    setShowCategoryDropdown(false);
    setShowSubcategoryDropdown(false);
    setShowBrandDropdown(false);

    // Reset family parts
    setFamilyPartNoOptions([]);

    // Reset highlighted indices
    setMasterPartHighlightedIndex(-1);
    setPartHighlightedIndex(-1);
    setCategoryHighlightedIndex(-1);
    setSubcategoryHighlightedIndex(-1);
    setBrandHighlightedIndex(-1);

    // Clear file inputs if they exist
    if (fileInputP1Ref.current) {
      fileInputP1Ref.current.value = "";
    }
    if (fileInputP2Ref.current) {
      fileInputP2Ref.current.value = "";
    }

    // Clear selection and reset Parts List (via onClearSelection callback)
    onClearSelection?.();

    // Notify parent components
    if (onPartSelected) {
      onPartSelected(null);
    }
    if (onPartNoSelected) {
      onPartNoSelected(null);
    }

    toast({
      title: "Reset Complete",
      description: "Part entry form, Models, and Parts List have been reset",
    });
  };

  const handleImageUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
    setImage: React.Dispatch<React.SetStateAction<string | null>>,
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        if (file.size > 10 * 1024 * 1024) {
          toast({
            title: "Error",
            description: "Image size must be less than 10MB",
            variant: "destructive",
          });
          return;
        }

        const loadingToast = toast({
          title: "Processing image...",
          description: "Compressing image for upload",
        });

        const compressedBase64 = await compressImage(file, 1920, 1920, 0.8, 10);
        setImage(compressedBase64);
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

  // Handle New button click
  const handleNew = () => {
    // Reset form data
    setFormData(initialFormData);

    // Reset Models section
    setModelQuantities([{ id: "1", model: "", qty: 0 }]);
    setKitItems([]);

    // Reset auto-fill flag
    setMasterPartAutoFilled(false);

    // Reset images
    setImageP1(null);
    setImageP2(null);

    // Reset editing state
    setIsEditing(false);
    setEditingPartId(null);

    // Set adding new mode when New is clicked
    setIsAddingNew(true);

    // Reset all search states
    setPartSearch("");
    setPartNoOptions([]);
    setShowPartDropdown(false);
    setKeepPartDropdownOpen(false);
    setMasterPartSearch("");
    setMasterPartNoOptions([]);
    setShowMasterPartDropdown(false);
    setCategorySearch("");
    setSubcategorySearch("");
    setBrandSearch("");
    setCategoryId("");
    setSubCategoryId("");
    setBrandId("");

    // Reset dropdowns
    setShowCategoryDropdown(false);
    setShowSubcategoryDropdown(false);
    setShowBrandDropdown(false);

    // Reset highlighted indices
    setMasterPartHighlightedIndex(-1);
    setPartHighlightedIndex(-1);
    setCategoryHighlightedIndex(-1);
    setSubcategoryHighlightedIndex(-1);
    setBrandHighlightedIndex(-1);

    // Reset family parts
    setFamilyPartNoOptions([]);

    // Clear file inputs if they exist
    if (fileInputP1Ref.current) {
      fileInputP1Ref.current.value = "";
    }
    if (fileInputP2Ref.current) {
      fileInputP2Ref.current.value = "";
    }

    // Clear selection and reset Parts List (via onClearSelection callback)
    onClearSelection?.();

    // Notify parent components
    if (onPartSelected) {
      onPartSelected(null);
    }
    if (onPartNoSelected) {
      onPartNoSelected(null);
    }

    toast({
      title: "New Part",
      description: "Form cleared. Ready for new part entry.",
    });
  };

  return (
    <div className="flex gap-3 h-full">
      {/* Left Panel - Part Form */}
      <div className="flex-1 bg-card rounded-lg border border-border overflow-auto">
        <div className="p-4">
          {/* Part Information Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span className="text-primary text-xs">•</span>
                <span className="text-xs font-medium text-foreground">
                  PART INFORMATION
                </span>
              </div>
              <div className="flex items-center gap-2">
                {canCreate && (
                  <Button
                    type="button"
                    onClick={handleNew}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs px-3"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    New
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={handleReset}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs px-3"
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Reset
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              {/* ============================================ */}
              {/* MASTER PART NO DROPDOWN - shows master_part_no values ONLY */}
              {/* ============================================ */}
              <div ref={masterPartDropdownRef} className="relative order-2">
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Master Part No
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={masterPartInputRef}
                    placeholder=""
                    value={masterPartSearch || formData.masterPartNo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setShowMasterPartDropdown(true);
                      setMasterPartSearch(value);
                      handleInputChange("masterPartNo", value);
                      // Searching is not a selection — don't keep previous/family images.
                      if (!editingPartId) {
                        setImageP1(null);
                        setImageP2(null);
                      }
                    }}
                    onFocus={() => {
                      // Close other dropdowns
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowMasterPartDropdown(true);
                    }}
                    onClick={() => {
                      // Close other dropdowns
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowMasterPartDropdown(true);
                    }}
                    onKeyDown={(e) => {
                      const searchTerm = masterPartSearch.trim();
                      const hasOptions = masterPartNoOptions.length > 0;
                      const showAddNew =
                        isAddingNew && !hasOptions && searchTerm.length >= 2;
                      const totalOptions = hasOptions
                        ? masterPartNoOptions.length + (showAddNew ? 1 : 0)
                        : 0;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showMasterPartDropdown && totalOptions > 0) {
                          setMasterPartHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < totalOptions - 1 ? prev + 1 : 0;
                            // Scroll into view
                            setTimeout(() => {
                              masterPartOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showMasterPartDropdown && totalOptions > 0) {
                          setMasterPartHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : totalOptions - 1;
                            // Scroll into view
                            setTimeout(() => {
                              masterPartOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (searchTerm.length >= 2) {
                          // If an option is highlighted, select it
                          if (
                            masterPartHighlightedIndex >= 0 &&
                            masterPartHighlightedIndex <
                            masterPartNoOptions.length
                          ) {
                            const selectedOption =
                              masterPartNoOptions[masterPartHighlightedIndex];
                            handleInputChange(
                              "masterPartNo",
                              selectedOption.value,
                            );
                            setMasterPartSearch(selectedOption.value);
                            setShowMasterPartDropdown(false);
                            setIsAddingNew(false);
                            setMasterPartHighlightedIndex(-1);

                            setFormData((prev) => ({ ...prev, partNo: "" }));
                            setPartSearch("");
                            // Don't auto-show dropdown after selecting master part
                            setTimeout(() => partInputRef.current?.focus(), 50);

                            if (onPartSelected)
                              onPartSelected(selectedOption.value);

                            toast({
                              title: "Master Part Selected",
                              description: `Existing master part number "${selectedOption.value}" is selected`,
                            });
                          } else if (
                            masterPartHighlightedIndex ===
                            masterPartNoOptions.length &&
                            showAddNew
                          ) {
                            // Select "Add new" option
                            handleInputChange("masterPartNo", searchTerm);
                            setMasterPartSearch(searchTerm);
                            setShowMasterPartDropdown(false);
                            setIsAddingNew(false);
                            setMasterPartHighlightedIndex(-1);

                            setFormData((prev) => ({ ...prev, partNo: "" }));
                            setPartSearch("");
                            // Don't auto-show dropdown after selecting master part
                            setTimeout(() => partInputRef.current?.focus(), 50);

                            toast({
                              title: "Master Part Selected",
                              description: `New master part number "${searchTerm}" is selected`,
                            });
                          } else {
                            // Original Enter key logic
                            const exactMatch = masterPartNoOptions.find(
                              (opt) =>
                                opt.value.toLowerCase() ===
                                searchTerm.toLowerCase(),
                            );

                            if (exactMatch) {
                              handleInputChange(
                                "masterPartNo",
                                exactMatch.value,
                              );
                              setMasterPartSearch(exactMatch.value);
                              setShowMasterPartDropdown(false);
                              setIsAddingNew(false);

                              setFormData((prev) => ({ ...prev, partNo: "" }));
                              setPartSearch("");
                              setKeepPartDropdownOpen(true);
                              setShowPartDropdown(true);
                              setTimeout(
                                () => partInputRef.current?.focus(),
                                50,
                              );

                              if (onPartSelected)
                                onPartSelected(exactMatch.value);

                              toast({
                                title: "Master Part Selected",
                                description: `Existing master part number "${exactMatch.value}" is selected`,
                              });
                            } else if (isAddingNew) {
                              handleInputChange("masterPartNo", searchTerm);
                              setMasterPartSearch(searchTerm);
                              setShowMasterPartDropdown(false);
                              setIsAddingNew(false);

                              setFormData((prev) => ({ ...prev, partNo: "" }));
                              setPartSearch("");
                              // Don't auto-show dropdown after selecting master part
                              setTimeout(
                                () => partInputRef.current?.focus(),
                                50,
                              );

                              toast({
                                title: "Master Part Selected",
                                description: `New master part number "${searchTerm}" is selected`,
                              });
                            }
                          }
                        }
                      } else if (e.key === "Escape") {
                        setShowMasterPartDropdown(false);
                        setMasterPartHighlightedIndex(-1);
                      } else {
                        // Reset highlighted index when typing
                        setMasterPartHighlightedIndex(-1);
                      }
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          masterPartDropdownRef.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowMasterPartDropdown(false);
                        }
                      }, 200);
                    }}
                    className={cn(
                      "h-8 text-xs pl-10 border-input part-code-font font-mono",
                      !showMasterPartDropdown && "border-2",
                      showMasterPartDropdown &&
                      "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>
                {showMasterPartDropdown &&
                  (masterPartNoOptions.length > 0 ||
                    (isAddingNew &&
                      masterPartSearch &&
                      masterPartSearch.trim().length >= 2)) && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                      {(() => {
                        // Show search results - these are ONLY master_part_no values
                        if (
                          masterPartSearch &&
                          masterPartSearch.trim().length >= 2
                        ) {
                          if (masterPartSearchLoading) {
                            return (
                              <div className="px-4 py-3 text-sm text-muted-foreground">
                                Searching...
                              </div>
                            );
                          }

                          // Check if current search matches any existing option
                          const searchTerm = masterPartSearch
                            .trim()
                            .toLowerCase();
                          const exactMatch = masterPartNoOptions.some(
                            (opt) => opt.value.toLowerCase() === searchTerm,
                          );
                          const showAddNew =
                            isAddingNew &&
                            !exactMatch &&
                            masterPartSearch.trim().length >= 2;

                          return (
                            <>
                              {masterPartNoOptions.length > 0 &&
                                masterPartNoOptions.map((opt, idx) => (
                                  <button
                                    key={`${opt.value}-${idx}`}
                                    ref={(el) => {
                                      masterPartOptionRefs.current[idx] = el;
                                    }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      handleInputChange(
                                        "masterPartNo",
                                        opt.value,
                                      );
                                      setMasterPartSearch(opt.value);
                                      setShowMasterPartDropdown(false);
                                      setIsAddingNew(false); // Clear adding new mode after selection

                                      // Clear Part No and focus it - keep dropdown open to show family parts
                                      setFormData((prev) => ({
                                        ...prev,
                                        partNo: "",
                                      }));
                                      setPartSearch("");
                                      setKeepPartDropdownOpen(true);
                                      setShowPartDropdown(true);
                                      setTimeout(
                                        () => partInputRef.current?.focus(),
                                        50,
                                      );

                                      // Auto-fill description from the selected option if available
                                      if (
                                        opt.description &&
                                        opt.description.trim()
                                      ) {
                                        setFormData((prev) => {
                                          // Auto-fill if description is empty, otherwise keep user's entry
                                          if (
                                            !prev.description ||
                                            prev.description.trim() === ""
                                          ) {
                                            return {
                                              ...prev,
                                              description:
                                                opt.description.trim(),
                                            };
                                          }
                                          return prev;
                                        });
                                      }

                                      // Trigger filter in parent
                                      if (onPartSelected)
                                        onPartSelected(opt.value);

                                      // Show notification
                                      toast({
                                        title: "Master Part Selected",
                                        description: `Existing master part number "${opt.value}" is selected`,
                                      });
                                    }}
                                    className={cn(
                                      "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                      formData.masterPartNo === opt.value &&
                                      "bg-muted",
                                      masterPartHighlightedIndex === idx &&
                                      "bg-primary/10 ring-2 ring-primary",
                                    )}
                                  >
                                    <p className="font-medium text-foreground font-mono">
                                      {opt.value}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {/* Remove Grade from description and show Application instead */}
                                      {opt.description
                                        ?.replace(/\s*\(Grade:\s*[A-Z]\)/gi, "")
                                        .trim() || ""}
                                      {opt.application &&
                                        ` (${opt.application})`}
                                    </p>
                                  </button>
                                ))}

                              {showAddNew && (
                                <button
                                  ref={(el) => {
                                    masterPartOptionRefs.current[
                                      masterPartNoOptions.length
                                    ] = el;
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const newValue = masterPartSearch.trim();
                                    handleInputChange("masterPartNo", newValue);
                                    setMasterPartSearch(newValue);
                                    setShowMasterPartDropdown(false);
                                    setIsAddingNew(false); // Clear adding new mode after selection

                                    // Clear Part No and focus it
                                    setFormData((prev) => ({
                                      ...prev,
                                      partNo: "",
                                    }));
                                    setPartSearch("");
                                    // Don't auto-show dropdown after selecting master part
                                    setTimeout(
                                      () => partInputRef.current?.focus(),
                                      50,
                                    );

                                    // Show notification
                                    toast({
                                      title: "Master Part Selected",
                                      description: `New master part number "${newValue}" is selected`,
                                    });
                                  }}
                                  className={cn(
                                    "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30",
                                    masterPartHighlightedIndex ===
                                    masterPartNoOptions.length &&
                                    "bg-primary/10 ring-2 ring-primary",
                                  )}
                                >
                                  <span className="text-primary font-medium">
                                    Add new:{" "}
                                  </span>
                                  <span>{masterPartSearch.trim()}</span>
                                </button>
                              )}
                            </>
                          );
                        }

                        return (
                          <div className="px-4 py-3 text-sm text-muted-foreground">
                            Type at least 2 characters to search master part
                            numbers...
                          </div>
                        );
                      })()}
                    </div>
                  )}
              </div>

              {/* ============================================ */}
              {/* PART NO DROPDOWN - shows part_no values ONLY */}
              {/* ============================================ */}
              <div ref={partDropdownRef} className="relative order-1">
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Part No <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={partInputRef}
                    placeholder=""
                    value={partSearch || formData.partNo}
                    onChange={(e) => {
                      const value = e.target.value;
                      setPartSearch(value);
                      handleInputChange("partNo", value);
                      // Searching is not a selection — don't keep previous/family images.
                      if (!editingPartId) {
                        setImageP1(null);
                        setImageP2(null);
                      }
                      // Don't auto-show dropdown on change - only show on click
                    }}
                    onKeyDown={(e) => {
                      const searchTerm = partSearch.trim();
                      const hasFamilyParts =
                        formData.masterPartNo &&
                        formData.masterPartNo.trim().length > 0;
                      const isSearching = searchTerm.length >= 2;

                      // Determine which options to show based on context
                      let optionsToShow: any[] = [];
                      if (hasFamilyParts && !isSearching) {
                        // Show all family parts when master part is selected and not searching
                        optionsToShow = familyPartNoOptions;
                      } else if (hasFamilyParts && isSearching) {
                        // Show filtered family parts when searching
                        optionsToShow = familyPartNoOptions.filter((fp) =>
                          fp.value
                            .toLowerCase()
                            .includes(searchTerm.toLowerCase()),
                        );
                      } else if (!hasFamilyParts && isSearching) {
                        // Show search results when no master part selected
                        optionsToShow = partNoOptions;
                      }

                      const showAddNew =
                        isAddingNew &&
                        searchTerm.length >= 2 &&
                        !optionsToShow.some(
                          (opt) =>
                            opt.value.toLowerCase() ===
                            searchTerm.toLowerCase(),
                        );
                      const totalOptions =
                        optionsToShow.length + (showAddNew ? 1 : 0);

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showPartDropdown && totalOptions > 0) {
                          setPartHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < totalOptions - 1 ? prev + 1 : 0;
                            // Scroll into view
                            setTimeout(() => {
                              partOptionRefs.current[nextIndex]?.scrollIntoView(
                                { block: "nearest", behavior: "smooth" },
                              );
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showPartDropdown && totalOptions > 0) {
                          setPartHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : totalOptions - 1;
                            // Scroll into view
                            setTimeout(() => {
                              partOptionRefs.current[nextIndex]?.scrollIntoView(
                                { block: "nearest", behavior: "smooth" },
                              );
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        // If an option is highlighted, select it
                        if (
                          partHighlightedIndex >= 0 &&
                          partHighlightedIndex < optionsToShow.length
                        ) {
                          const selectedOption =
                            optionsToShow[partHighlightedIndex];
                          if (hasFamilyParts && selectedOption.id) {
                            populateFormFromFullPart(selectedOption.id, {
                              masterPartNo: formData.masterPartNo,
                              partNo: selectedOption.value,
                              description: selectedOption.description,
                            }).then((result) => {
                              if (onPartNoSelected && result.partNo) {
                                onPartNoSelected(result.partNo);
                              }
                            });
                          } else if (selectedOption.id) {
                            populateFormFromFullPart(selectedOption.id, {
                              masterPartNo:
                                (selectedOption as any).masterPartNo || "",
                              partNo: selectedOption.value,
                              description: selectedOption.description,
                            }).then((result) => {
                              // Auto-fill description if available and form description is empty
                              if (
                                selectedOption.description &&
                                selectedOption.description.trim()
                              ) {
                                setFormData((prev) => {
                                  if (
                                    !prev.description ||
                                    prev.description.trim() === ""
                                  ) {
                                    return {
                                      ...prev,
                                      description:
                                        selectedOption.description.trim(),
                                    };
                                  }
                                  return prev;
                                });
                              }
                              if (onPartSelected && result.masterPartNo) {
                                onPartSelected(result.masterPartNo);
                              }
                              if (onPartNoSelected && result.partNo) {
                                onPartNoSelected(result.partNo);
                              }
                            });
                          } else {
                            handleInputChange("partNo", selectedOption.value);
                            setPartSearch(selectedOption.value);
                            if ((selectedOption as any).masterPartNo) {
                              handleInputChange(
                                "masterPartNo",
                                (selectedOption as any).masterPartNo,
                              );
                              setMasterPartSearch(
                                (selectedOption as any).masterPartNo,
                              );
                            }
                            if (
                              onPartSelected &&
                              (selectedOption as any).masterPartNo
                            ) {
                              onPartSelected(
                                (selectedOption as any).masterPartNo,
                              );
                            }
                            if (onPartNoSelected) {
                              onPartNoSelected(selectedOption.value);
                            }
                          }
                          setShowPartDropdown(false);
                          setKeepPartDropdownOpen(false);
                          setIsAddingNew(false);
                          setPartHighlightedIndex(-1);
                        } else if (
                          partHighlightedIndex === optionsToShow.length &&
                          showAddNew
                        ) {
                          // Select "Add new" option
                          handleInputChange("partNo", searchTerm);
                          setPartSearch(searchTerm);
                          setShowPartDropdown(false);
                          setKeepPartDropdownOpen(false);
                          setIsAddingNew(false);
                          setPartHighlightedIndex(-1);

                          if (onPartNoSelected) {
                            onPartNoSelected(searchTerm);
                          }
                        } else if (searchTerm.length >= 2) {
                          // Check if master part is selected (family parts)
                          if (
                            formData.masterPartNo &&
                            formData.masterPartNo.trim().length > 0
                          ) {
                            // Check if part exists in family
                            const exactMatchInFamily = familyPartNoOptions.find(
                              (fp) =>
                                fp.value.toLowerCase() ===
                                searchTerm.toLowerCase(),
                            );

                            if (exactMatchInFamily) {
                              // Select existing family part
                              if (exactMatchInFamily.id) {
                                populateFormFromFullPart(
                                  exactMatchInFamily.id,
                                  {
                                    masterPartNo: formData.masterPartNo,
                                    partNo: exactMatchInFamily.value,
                                    description: exactMatchInFamily.description,
                                  },
                                ).then((result) => {
                                  if (onPartNoSelected && result.partNo) {
                                    onPartNoSelected(result.partNo);
                                  }
                                });
                              } else {
                                handleInputChange(
                                  "partNo",
                                  exactMatchInFamily.value,
                                );
                                setPartSearch(exactMatchInFamily.value);
                                if (onPartNoSelected) {
                                  onPartNoSelected(exactMatchInFamily.value);
                                }
                              }
                              setShowPartDropdown(false);
                              setKeepPartDropdownOpen(false);
                              setIsAddingNew(false);

                              toast({
                                title: "Part Number Selected",
                                description: `Existing part number "${exactMatchInFamily.value}" from family "${formData.masterPartNo}" is selected`,
                              });
                            } else if (isAddingNew) {
                              // Select new family part
                              handleInputChange("partNo", searchTerm);
                              setPartSearch(searchTerm);
                              setShowPartDropdown(false);
                              setKeepPartDropdownOpen(false);
                              setIsAddingNew(false);

                              if (onPartNoSelected) {
                                onPartNoSelected(searchTerm);
                              }

                              toast({
                                title: "Part Number Selected",
                                description: `New part number "${searchTerm}" for family "${formData.masterPartNo}" is selected`,
                              });
                            }
                          } else {
                            // No master part selected, check search results
                            const exactMatchInSearch = partNoOptions.find(
                              (opt) =>
                                opt.value.toLowerCase() ===
                                searchTerm.toLowerCase(),
                            );

                            if (exactMatchInSearch) {
                              // Select existing part from search
                              if (exactMatchInSearch.id) {
                                populateFormFromFullPart(
                                  exactMatchInSearch.id,
                                  {
                                    masterPartNo:
                                      exactMatchInSearch.masterPartNo || "",
                                    partNo: exactMatchInSearch.value,
                                    description: exactMatchInSearch.description,
                                  },
                                ).then((result) => {
                                  if (onPartSelected && result.masterPartNo) {
                                    onPartSelected(result.masterPartNo);
                                  }
                                  if (onPartNoSelected && result.partNo) {
                                    onPartNoSelected(result.partNo);
                                  }
                                });
                              } else {
                                handleInputChange(
                                  "partNo",
                                  exactMatchInSearch.value,
                                );
                                handleInputChange(
                                  "masterPartNo",
                                  exactMatchInSearch.masterPartNo || "",
                                );
                                setPartSearch(exactMatchInSearch.value);
                                setMasterPartSearch(
                                  exactMatchInSearch.masterPartNo || "",
                                );

                                if (
                                  onPartSelected &&
                                  exactMatchInSearch.masterPartNo
                                ) {
                                  onPartSelected(
                                    exactMatchInSearch.masterPartNo,
                                  );
                                }
                                if (onPartNoSelected) {
                                  onPartNoSelected(exactMatchInSearch.value);
                                }
                              }
                              setShowPartDropdown(false);
                              setKeepPartDropdownOpen(false);
                              setIsAddingNew(false);

                              toast({
                                title: "Part Number Selected",
                                description: `Existing part number "${exactMatchInSearch.value}" is selected`,
                              });
                            } else if (isAddingNew) {
                              // Select new part
                              handleInputChange("partNo", searchTerm);
                              setPartSearch(searchTerm);
                              setShowPartDropdown(false);
                              setKeepPartDropdownOpen(false);
                              setIsAddingNew(false);

                              if (onPartNoSelected) {
                                onPartNoSelected(searchTerm);
                              }

                              toast({
                                title: "Part Number Selected",
                                description: `New part number "${searchTerm}" is selected`,
                              });
                            }
                          }
                        }
                      } else if (e.key === "Escape") {
                        setShowPartDropdown(false);
                        setPartHighlightedIndex(-1);
                      } else {
                        // Reset highlighted index when typing
                        setPartHighlightedIndex(-1);
                      }
                    }}
                    onFocus={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowPartDropdown(true);
                      setKeepPartDropdownOpen(true);
                    }}
                    onClick={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowPartDropdown(true);
                      setKeepPartDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          partDropdownRef?.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowPartDropdown(false);
                          setKeepPartDropdownOpen(false);
                        }
                      }, 200);
                    }}
                    className={cn(
                      "h-8 text-xs pl-10 border-input part-code-font font-mono",
                      !showPartDropdown && "border-2",
                      showPartDropdown && "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>
                {showPartDropdown &&
                  (() => {
                    // Check if we have search results
                    const hasSearchResults =
                      partSearch &&
                      partSearch.trim().length >= 2 &&
                      partNoOptions.length > 0;

                    // Check if we have family parts (when master part is selected)
                    const filteredFamily =
                      formData.masterPartNo &&
                        formData.masterPartNo.trim().length > 0 &&
                        partSearch &&
                        partSearch.trim().length > 0
                        ? familyPartNoOptions.filter((fp) =>
                          fp.value
                            .toLowerCase()
                            .includes(partSearch.trim().toLowerCase()),
                        )
                        : formData.masterPartNo &&
                          formData.masterPartNo.trim().length > 0
                          ? familyPartNoOptions
                          : [];
                    const hasFamilyParts = filteredFamily.length > 0;

                    // Check if part number exists in family or search results
                    const partSearchTerm = partSearch?.trim() || "";
                    const existsInFamily =
                      formData.masterPartNo && partSearchTerm.length >= 2
                        ? familyPartNoOptions.some(
                          (fp) =>
                            fp.value.toLowerCase() ===
                            partSearchTerm.toLowerCase(),
                        )
                        : false;
                    const existsInSearch =
                      partSearchTerm.length >= 2
                        ? partNoOptions.some(
                          (opt) =>
                            opt.value.toLowerCase() ===
                            partSearchTerm.toLowerCase(),
                        )
                        : false;
                    const showAddNew =
                      isAddingNew &&
                      partSearchTerm.length >= 2 &&
                      !existsInFamily &&
                      !existsInSearch;

                    // Only show dropdown if there are search results OR family parts OR "Add new" option
                    if (!hasSearchResults && !hasFamilyParts && !showAddNew) {
                      return null;
                    }

                    return (
                      <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {(() => {
                          // Show search results when user is typing - only show if there are matches
                          if (partSearch && partSearch.trim().length >= 2) {
                            if (partNoSearchLoading) {
                              return (
                                <div className="px-4 py-3 text-sm text-muted-foreground">
                                  Searching...
                                </div>
                              );
                            }

                            // Only show dropdown if there are matching results
                            if (partNoOptions.length === 0) {
                              return null;
                            }

                            // Check if current search matches any existing option
                            const partSearchTerm = partSearch
                              .trim()
                              .toLowerCase();
                            const exactMatchInSearch = partNoOptions.some(
                              (opt) =>
                                opt.value.toLowerCase() === partSearchTerm,
                            );
                            const showAddNewInSearch =
                              isAddingNew &&
                              !exactMatchInSearch &&
                              partSearch.trim().length >= 2;

                            return (
                              <>
                                {partNoOptions.map((opt, idx) => (
                                  <button
                                    key={`${opt.id || opt.value}-${idx}`}
                                    ref={(el) => {
                                      partOptionRefs.current[idx] = el;
                                    }}
                                    onClick={async (e) => {
                                      e.stopPropagation();

                                      // Populate form with full part data
                                      if (opt.id) {
                                        const result =
                                          await populateFormFromFullPart(
                                            opt.id,
                                            {
                                              masterPartNo:
                                                opt.masterPartNo || "",
                                              partNo: opt.value,
                                              description: opt.description,
                                            },
                                          );

                                        // Trigger filters
                                        if (
                                          onPartSelected &&
                                          result.masterPartNo
                                        ) {
                                          onPartSelected(result.masterPartNo);
                                        }
                                        if (onPartNoSelected && result.partNo) {
                                          onPartNoSelected(result.partNo);
                                        }
                                      } else {
                                        // No ID, just set values
                                        handleInputChange("partNo", opt.value);
                                        handleInputChange(
                                          "masterPartNo",
                                          opt.masterPartNo || "",
                                        );
                                        setPartSearch(opt.value);
                                        setMasterPartSearch(
                                          opt.masterPartNo || "",
                                        );

                                        // Auto-fill description if available and form description is empty
                                        if (
                                          opt.description &&
                                          opt.description.trim()
                                        ) {
                                          setFormData((prev) => {
                                            if (
                                              !prev.description ||
                                              prev.description.trim() === ""
                                            ) {
                                              return {
                                                ...prev,
                                                description:
                                                  opt.description.trim(),
                                              };
                                            }
                                            return prev;
                                          });
                                        }

                                        if (
                                          onPartSelected &&
                                          opt.masterPartNo
                                        ) {
                                          onPartSelected(opt.masterPartNo);
                                        }
                                        if (onPartNoSelected) {
                                          onPartNoSelected(opt.value);
                                        }
                                      }

                                      setShowPartDropdown(false);
                                      setKeepPartDropdownOpen(false);
                                      setIsAddingNew(false); // Clear adding new mode after selection

                                      // Show notification
                                      toast({
                                        title: "Part Number Selected",
                                        description: `Existing part number "${opt.value}" is selected`,
                                      });
                                    }}
                                    className={cn(
                                      "w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                      partHighlightedIndex === idx &&
                                      "bg-primary/10 ring-2 ring-primary",
                                    )}
                                  >
                                    <p className="font-medium text-foreground text-sm font-mono">
                                      {opt.value}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {opt.description || "No description"}
                                    </p>
                                  </button>
                                ))}

                                {showAddNewInSearch && (
                                  <button
                                    ref={(el) => {
                                      partOptionRefs.current[
                                        partNoOptions.length
                                      ] = el;
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newValue = partSearch.trim();
                                      handleInputChange("partNo", newValue);
                                      setPartSearch(newValue);
                                      setShowPartDropdown(false);
                                      setKeepPartDropdownOpen(false);
                                      setIsAddingNew(false); // Clear adding new mode after selection

                                      if (onPartNoSelected) {
                                        onPartNoSelected(newValue);
                                      }

                                      // Show notification
                                      toast({
                                        title: "Part Number Selected",
                                        description: `New part number "${newValue}" is selected`,
                                      });
                                    }}
                                    className={cn(
                                      "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30",
                                      partHighlightedIndex ===
                                      partNoOptions.length &&
                                      "bg-primary/10 ring-2 ring-primary",
                                    )}
                                  >
                                    <span className="text-primary font-medium">
                                      Add new:{" "}
                                    </span>
                                    <span>{partSearch.trim()}</span>
                                  </button>
                                )}
                              </>
                            );
                          }

                          // Show FAMILY PARTS when Master Part No is selected
                          if (
                            formData.masterPartNo &&
                            formData.masterPartNo.trim().length > 0
                          ) {
                            if (familyPartsLoading) {
                              return (
                                <div className="px-4 py-3 text-sm text-muted-foreground">
                                  Loading family parts...
                                </div>
                              );
                            }

                            // Check if current part number exists in family
                            const partSearchTermForFamily =
                              partSearch?.trim() || "";
                            const exactMatchInFamily =
                              partSearchTermForFamily.length >= 2
                                ? familyPartNoOptions.some(
                                  (fp) =>
                                    fp.value.toLowerCase() ===
                                    partSearchTermForFamily.toLowerCase(),
                                )
                                : false;
                            const showAddNewInFamily =
                              isAddingNew &&
                              partSearchTermForFamily.length >= 2 &&
                              !exactMatchInFamily;

                            // Show dropdown if there are family parts OR "Add new" option
                            if (
                              filteredFamily.length > 0 ||
                              showAddNewInFamily
                            ) {
                              return (
                                <>
                                  {filteredFamily.length > 0 && (
                                    <div className="px-4 py-2 text-xs font-semibold text-primary bg-muted/50 border-b border-border">
                                      Family Parts for "{formData.masterPartNo}"
                                      ({filteredFamily.length})
                                    </div>
                                  )}
                                  {filteredFamily.map((fp, idx) => (
                                    <button
                                      key={`family-${fp.id || fp.value}-${idx}`}
                                      ref={(el) => {
                                        partOptionRefs.current[idx] = el;
                                      }}
                                      onClick={async (e) => {
                                        e.stopPropagation();

                                        // Populate form with full part data
                                        if (fp.id) {
                                          const result =
                                            await populateFormFromFullPart(
                                              fp.id,
                                              {
                                                masterPartNo:
                                                  formData.masterPartNo,
                                                partNo: fp.value,
                                                description: fp.description,
                                              },
                                            );

                                          // Auto-fill description if available and form description is empty
                                          if (
                                            fp.description &&
                                            fp.description.trim()
                                          ) {
                                            setFormData((prev) => {
                                              if (
                                                !prev.description ||
                                                prev.description.trim() === ""
                                              ) {
                                                return {
                                                  ...prev,
                                                  description:
                                                    fp.description.trim(),
                                                };
                                              }
                                              return prev;
                                            });
                                          }

                                          if (
                                            onPartNoSelected &&
                                            result.partNo
                                          ) {
                                            onPartNoSelected(result.partNo);
                                          }
                                        } else {
                                          handleInputChange("partNo", fp.value);
                                          setPartSearch(fp.value);

                                          // Auto-fill description from family part if available and form description is empty
                                          if (
                                            fp.description &&
                                            fp.description.trim()
                                          ) {
                                            setFormData((prev) => {
                                              if (
                                                !prev.description ||
                                                prev.description.trim() === ""
                                              ) {
                                                return {
                                                  ...prev,
                                                  description:
                                                    fp.description.trim(),
                                                };
                                              }
                                              return prev;
                                            });
                                          }

                                          if (onPartNoSelected) {
                                            onPartNoSelected(fp.value);
                                          }
                                        }

                                        setShowPartDropdown(false);
                                        setKeepPartDropdownOpen(false);
                                        setIsAddingNew(false); // Clear adding new mode after selection

                                        // Show notification
                                        toast({
                                          title: "Part Number Selected",
                                          description: `Existing part number "${fp.value}" from family "${formData.masterPartNo}" is selected`,
                                        });
                                      }}
                                      className={cn(
                                        "w-full text-left px-4 py-3 hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                        partHighlightedIndex === idx &&
                                        "bg-primary/10 ring-2 ring-primary",
                                      )}
                                    >
                                      <p className="font-medium text-foreground text-sm">
                                        {fp.value}
                                      </p>
                                      <p className="text-xs text-muted-foreground truncate">
                                        {fp.brand && (
                                          <span className="text-primary">
                                            [{fp.brand}]
                                          </span>
                                        )}{" "}
                                        {fp.description || "No description"}
                                      </p>
                                    </button>
                                  ))}

                                  {showAddNewInFamily && (
                                    <button
                                      ref={(el) => {
                                        partOptionRefs.current[
                                          filteredFamily.length
                                        ] = el;
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const newValue = partSearch.trim();
                                        handleInputChange("partNo", newValue);
                                        setPartSearch(newValue);
                                        setShowPartDropdown(false);
                                        setKeepPartDropdownOpen(false);
                                        setIsAddingNew(false); // Clear adding new mode after selection

                                        if (onPartNoSelected) {
                                          onPartNoSelected(newValue);
                                        }

                                        // Show notification
                                        toast({
                                          title: "Part Number Selected",
                                          description: `New part number "${newValue}" for family "${formData.masterPartNo}" is selected`,
                                        });
                                      }}
                                      className={cn(
                                        "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30",
                                        partHighlightedIndex ===
                                        filteredFamily.length &&
                                        "bg-primary/10 ring-2 ring-primary",
                                      )}
                                    >
                                      <span className="text-primary font-medium">
                                        Add new:{" "}
                                      </span>
                                      <span>{partSearch.trim()}</span>
                                      <span className="text-xs text-muted-foreground ml-2">
                                        (for family "{formData.masterPartNo}")
                                      </span>
                                    </button>
                                  )}
                                </>
                              );
                            }
                          }

                          return null;
                        })()}
                      </div>
                    );
                  })()}
              </div>

              {/* Brand Dropdown */}
              <div ref={brandDropdownRef} className="relative order-3">
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Brand
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-4 text-muted-foreground" />
                  <Input
                    ref={brandInputRef}
                    placeholder=""
                    value={brandSearch || formData.brand}
                    onChange={(e) => {
                      setBrandSearch(e.target.value);
                      setShowBrandDropdown(true);
                      setBrandHighlightedIndex(-1);
                      if (e.target.value !== formData.brand) {
                        handleInputChange("brand", "");
                      }
                    }}
                    onKeyDown={(e) => {
                      const filtered = brands.filter(
                        (b) =>
                          !brandSearch ||
                          b.name
                            .toLowerCase()
                            .includes(brandSearch.toLowerCase()),
                      );
                      const totalOptions = filtered.length;

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showBrandDropdown && totalOptions > 0) {
                          setBrandHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < totalOptions - 1 ? prev + 1 : 0;
                            setTimeout(() => {
                              brandOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showBrandDropdown && totalOptions > 0) {
                          setBrandHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : totalOptions - 1;
                            setTimeout(() => {
                              brandOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (
                          brandHighlightedIndex >= 0 &&
                          brandHighlightedIndex < filtered.length
                        ) {
                          selectBrand(filtered[brandHighlightedIndex]);
                        }
                      } else if (e.key === "Escape") {
                        setShowBrandDropdown(false);
                        setBrandHighlightedIndex(-1);
                      } else {
                        setBrandHighlightedIndex(-1);
                      }
                    }}
                    onFocus={async () => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setBrandSearch("");
                      setShowBrandDropdown(true);
                      // Refresh brands when dropdown opens to get newly added brands
                      await fetchBrands();
                    }}
                    onClick={async () => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowBrandDropdown(true);
                      // Refresh brands when dropdown opens to get newly added brands
                      await fetchBrands();
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          brandDropdownRef.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowBrandDropdown(false);
                        }
                      }, 200);
                    }}
                    className={cn(
                      "h-8 max-w-24 text-xs pl-9 border-input",
                      !showBrandDropdown && "border-2",
                      showBrandDropdown && "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>
                {showBrandDropdown &&
                  (() => {
                    const filtered = brands.filter(
                      (b) =>
                        !brandSearch ||
                        b.name
                          .toLowerCase()
                          .includes(brandSearch.toLowerCase()),
                    );

                    // Only show dropdown if there are matching brands
                    if (brandsLoading) {
                      return (
                        <div className="absolute z-50 left-0 w-full max-w-24 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                          <div className="px-4 py-3 text-sm text-muted-foreground">
                            Loading brands...
                          </div>
                        </div>
                      );
                    }

                    if (filtered.length === 0) {
                      return null; // Don't show dropdown if no matches
                    }

                    return (
                      <div className="absolute z-50 left-0 w-full max-w-24 mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                        {filtered.map((brand, idx) => (
                          <button
                            key={brand.id}
                            type="button"
                            ref={(el) => {
                              brandOptionRefs.current[idx] = el;
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectBrand(brand);
                            }}
                            className={cn(
                              "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0 truncate",
                              formData.brand === brand.name && "bg-muted",
                              brandHighlightedIndex === idx &&
                              "bg-primary/10 ring-2 ring-primary",
                            )}
                          >
                            {brand.name}
                          </button>
                        ))}
                      </div>
                    );
                  })()}
              </div>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-foreground mb-1 font-bold">
                Description
              </label>
              <Textarea
                placeholder=""
                value={formData.description}
                onChange={(e) =>
                  handleInputChange("description", e.target.value)
                }
                onFocus={() => {
                  // Close all dropdowns when Description is focused
                  setShowMasterPartDropdown(false);
                  setShowPartDropdown(false);
                  setShowBrandDropdown(false);
                  setShowCategoryDropdown(false);
                  setShowSubcategoryDropdown(false);
                  setShowApplicationDropdown(false);
                }}
                rows={2}
                className="text-xs min-h-[60px] border-2 border-input focus-visible:border"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
              <div ref={categoryDropdownRef} className="relative">
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Category
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={categoryInputRef}
                    placeholder=""
                    value={categorySearch || formData.category}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setShowCategoryDropdown(true);
                      setCategoryHighlightedIndex(-1);
                      if (e.target.value !== formData.category) {
                        handleInputChange("category", "");
                      }
                    }}
                    onKeyDown={(e) => {
                      const filtered = categories.filter(
                        (c) =>
                          !categorySearch ||
                          c.name
                            .toLowerCase()
                            .includes(categorySearch.toLowerCase()),
                      );
                      const exactMatch =
                        categorySearch &&
                        categories.some(
                          (c) =>
                            c.name.toLowerCase() ===
                            categorySearch.toLowerCase(),
                        );
                      const showAddNew =
                        categorySearch &&
                        !exactMatch &&
                        categorySearch.trim() !== "";
                      const totalOptions =
                        filtered.length + (showAddNew ? 1 : 0);

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showCategoryDropdown && totalOptions > 0) {
                          setCategoryHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < totalOptions - 1 ? prev + 1 : 0;
                            setTimeout(() => {
                              categoryOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showCategoryDropdown && totalOptions > 0) {
                          setCategoryHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : totalOptions - 1;
                            setTimeout(() => {
                              categoryOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (
                          categoryHighlightedIndex >= 0 &&
                          categoryHighlightedIndex < filtered.length
                        ) {
                          const selectedCategory =
                            filtered[categoryHighlightedIndex];
                          handleInputChange("category", selectedCategory.name);
                          setCategoryId(selectedCategory.id);
                          setCategorySearch(selectedCategory.name);
                          setShowCategoryDropdown(false);
                          setCategoryHighlightedIndex(-1);
                          setFormData((prev) => ({
                            ...prev,
                            subCategory: "",
                          }));
                        } else if (
                          categoryHighlightedIndex === filtered.length &&
                          showAddNew
                        ) {
                          const newValue = categorySearch.trim();
                          handleInputChange("category", newValue);
                          setCategoryId("");
                          setCategorySearch(newValue);
                          setShowCategoryDropdown(false);
                          setCategoryHighlightedIndex(-1);
                          setFormData((prev) => ({
                            ...prev,
                            subCategory: "",
                          }));
                        }
                      } else if (e.key === "Escape") {
                        setShowCategoryDropdown(false);
                        setCategoryHighlightedIndex(-1);
                      } else {
                        setCategoryHighlightedIndex(-1);
                      }
                    }}
                    onFocus={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setCategorySearch("");
                      setShowCategoryDropdown(true);
                    }}
                    onClick={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowSubcategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowCategoryDropdown(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          categoryDropdownRef.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowCategoryDropdown(false);
                        }
                      }, 200);
                    }}
                    className={cn(
                      "h-8 text-xs pl-10 border-input",
                      !showCategoryDropdown && "border-2",
                      showCategoryDropdown &&
                      "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>
                {showCategoryDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {(() => {
                      const filtered = categories.filter(
                        (c) =>
                          !categorySearch ||
                          c.name
                            .toLowerCase()
                            .includes(categorySearch.toLowerCase()),
                      );
                      const exactMatch =
                        categorySearch &&
                        categories.some(
                          (c) =>
                            c.name.toLowerCase() ===
                            categorySearch.toLowerCase(),
                        );
                      const showAddNew =
                        categorySearch &&
                        !exactMatch &&
                        categorySearch.trim() !== "";

                      return (
                        <>
                          {filtered.length > 0 &&
                            filtered.map((category, idx) => (
                              <button
                                key={category.id}
                                ref={(el) => {
                                  categoryOptionRefs.current[idx] = el;
                                }}
                                onClick={() => {
                                  handleInputChange("category", category.name);
                                  setCategoryId(category.id);
                                  setCategorySearch(category.name);
                                  setShowCategoryDropdown(false);
                                  setCategoryHighlightedIndex(-1);
                                  setFormData((prev) => ({
                                    ...prev,
                                    subCategory: "",
                                  }));
                                }}
                                className={cn(
                                  "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                  formData.category === category.name &&
                                  "bg-muted",
                                  categoryHighlightedIndex === idx &&
                                  "bg-primary/10 ring-2 ring-primary",
                                )}
                              >
                                {category.name}
                              </button>
                            ))}
                          {showAddNew && (
                            <button
                              ref={(el) => {
                                categoryOptionRefs.current[filtered.length] =
                                  el;
                              }}
                              onClick={() => {
                                const newValue = categorySearch.trim();
                                handleInputChange("category", newValue);
                                setCategoryId("");
                                setCategorySearch(newValue);
                                setShowCategoryDropdown(false);
                                setCategoryHighlightedIndex(-1);
                                setFormData((prev) => ({
                                  ...prev,
                                  subCategory: "",
                                }));
                              }}
                              className={cn(
                                "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30",
                                categoryHighlightedIndex === filtered.length &&
                                "bg-primary/10 ring-2 ring-primary",
                              )}
                            >
                              <span className="text-primary font-medium">
                                Add new:{" "}
                              </span>
                              <span>{categorySearch.trim()}</span>
                            </button>
                          )}
                          {filtered.length === 0 && !showAddNew && (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              {categorySearch
                                ? "No categories found matching your search"
                                : "No categories available"}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div ref={subcategoryDropdownRef} className="relative">
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Sub Category
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={subcategoryInputRef}
                    placeholder=""
                    value={subcategorySearch || formData.subCategory}
                    onChange={(e) => {
                      setSubcategorySearch(e.target.value);
                      setShowSubcategoryDropdown(true);
                      setKeepSubcategoryDropdownOpen(true);
                      setSubcategoryHighlightedIndex(-1);
                      if (e.target.value !== formData.subCategory) {
                        handleInputChange("subCategory", "");
                      }
                    }}
                    onKeyDown={(e) => {
                      const subcategoriesForCategory = categoryId
                        ? subcategories.filter(
                          (s) => s.categoryId === categoryId,
                        )
                        : subcategories;
                      const filtered = subcategoriesForCategory.filter(
                        (s) =>
                          !subcategorySearch ||
                          s.name
                            .toLowerCase()
                            .includes(subcategorySearch.toLowerCase()),
                      );
                      const exactMatch =
                        subcategorySearch &&
                        subcategoriesForCategory.some(
                          (s) =>
                            s.name.toLowerCase() ===
                            subcategorySearch.toLowerCase(),
                        );
                      const showAddNew =
                        subcategorySearch &&
                        !exactMatch &&
                        subcategorySearch.trim() !== "";
                      const totalOptions =
                        filtered.length + (showAddNew ? 1 : 0);

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showSubcategoryDropdown && totalOptions > 0) {
                          setSubcategoryHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < totalOptions - 1 ? prev + 1 : 0;
                            setTimeout(() => {
                              subcategoryOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showSubcategoryDropdown && totalOptions > 0) {
                          setSubcategoryHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : totalOptions - 1;
                            setTimeout(() => {
                              subcategoryOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        if (
                          subcategoryHighlightedIndex >= 0 &&
                          subcategoryHighlightedIndex < filtered.length
                        ) {
                          const selectedSubcategory =
                            filtered[subcategoryHighlightedIndex];
                          handleInputChange(
                            "subCategory",
                            selectedSubcategory.name,
                          );
                          setSubCategoryId(selectedSubcategory.id);
                          setSubcategorySearch(selectedSubcategory.name);
                          setShowSubcategoryDropdown(false);
                          setSubcategoryHighlightedIndex(-1);
                          setTimeout(() => {
                            applicationInputRef.current?.focus();
                          }, 50);
                        } else if (
                          subcategoryHighlightedIndex === filtered.length &&
                          showAddNew
                        ) {
                          const newValue = subcategorySearch.trim();
                          handleInputChange("subCategory", newValue);
                          setSubCategoryId("");
                          setSubcategorySearch(newValue);
                          setShowSubcategoryDropdown(false);
                          setSubcategoryHighlightedIndex(-1);
                          setTimeout(() => {
                            applicationInputRef.current?.focus();
                          }, 50);
                        }
                      } else if (e.key === "Escape") {
                        setShowSubcategoryDropdown(false);
                        setSubcategoryHighlightedIndex(-1);
                      } else {
                        setSubcategoryHighlightedIndex(-1);
                      }
                    }}
                    onFocus={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setSubcategorySearch("");
                      setShowSubcategoryDropdown(true);
                      setKeepSubcategoryDropdownOpen(true);
                    }}
                    onClick={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowApplicationDropdown(false);
                      // Open this dropdown
                      setShowSubcategoryDropdown(true);
                      setKeepSubcategoryDropdownOpen(true);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          subcategoryDropdownRef.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowSubcategoryDropdown(false);
                          setKeepSubcategoryDropdownOpen(false);
                        }
                      }, 200);
                    }}
                    className={cn(
                      "h-8 text-xs pl-10 border-input",
                      !showSubcategoryDropdown && "border-2",
                      showSubcategoryDropdown &&
                      "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>
                {showSubcategoryDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {(() => {
                      const subcategoriesForCategory = categoryId
                        ? subcategories.filter(
                          (s) => s.categoryId === categoryId,
                        )
                        : subcategories;

                      const filtered = subcategoriesForCategory.filter(
                        (s) =>
                          !subcategorySearch ||
                          s.name
                            .toLowerCase()
                            .includes(subcategorySearch.toLowerCase()),
                      );
                      const exactMatch =
                        subcategorySearch &&
                        subcategoriesForCategory.some(
                          (s) =>
                            s.name.toLowerCase() ===
                            subcategorySearch.toLowerCase(),
                        );
                      const showAddNew =
                        subcategorySearch &&
                        !exactMatch &&
                        subcategorySearch.trim() !== "";

                      return (
                        <>
                          {filtered.length > 0 &&
                            filtered.map((subcategory, idx) => (
                              <button
                                key={subcategory.id}
                                ref={(el) => {
                                  subcategoryOptionRefs.current[idx] = el;
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInputChange(
                                    "subCategory",
                                    subcategory.name,
                                  );
                                  setSubCategoryId(subcategory.id);
                                  setSubcategorySearch(subcategory.name);
                                  setShowSubcategoryDropdown(false);
                                  setSubcategoryHighlightedIndex(-1);
                                  setTimeout(() => {
                                    applicationInputRef.current?.focus();
                                  }, 50);
                                }}
                                className={cn(
                                  "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                  formData.subCategory === subcategory.name &&
                                  "bg-muted",
                                  subcategoryHighlightedIndex === idx &&
                                  "bg-primary/10 ring-2 ring-primary",
                                )}
                              >
                                {subcategory.name}
                              </button>
                            ))}
                          {showAddNew && (
                            <button
                              ref={(el) => {
                                subcategoryOptionRefs.current[filtered.length] =
                                  el;
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                const newValue = subcategorySearch.trim();
                                handleInputChange("subCategory", newValue);
                                setSubCategoryId("");
                                setSubcategorySearch(newValue);
                                setShowSubcategoryDropdown(false);
                                setSubcategoryHighlightedIndex(-1);
                                setTimeout(() => {
                                  applicationInputRef.current?.focus();
                                }, 50);
                              }}
                              className={cn(
                                "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30",
                                subcategoryHighlightedIndex ===
                                filtered.length &&
                                "bg-primary/10 ring-2 ring-primary",
                              )}
                            >
                              <span className="text-primary font-medium">
                                Add new:{" "}
                              </span>
                              <span>{subcategorySearch.trim()}</span>
                            </button>
                          )}
                          {filtered.length === 0 && !showAddNew && (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              {subcategorySearch
                                ? "No subcategories found matching your search"
                                : "No subcategories available"}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div
                ref={applicationDropdownRef}
                className="relative md:col-span-2"
              >
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Application
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={applicationInputRef}
                    placeholder=""
                    value={formData.application}
                    onChange={(e) => {
                      handleInputChange("application", e.target.value);
                      setShowApplicationDropdown(true);
                      setApplicationHighlightedIndex(-1);
                    }}
                    onFocus={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      // Open this dropdown
                      setShowApplicationDropdown(true);
                      setApplicationHighlightedIndex(-1);
                    }}
                    onClick={() => {
                      // Close other dropdowns
                      setShowMasterPartDropdown(false);
                      setShowPartDropdown(false);
                      setShowBrandDropdown(false);
                      setShowCategoryDropdown(false);
                      setShowSubcategoryDropdown(false);
                      // Open this dropdown
                      setShowApplicationDropdown(true);
                      setApplicationHighlightedIndex(-1);
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        const isClickInDropdown =
                          applicationDropdownRef?.current?.contains(
                            document.activeElement,
                          );
                        if (!isClickInDropdown) {
                          setShowApplicationDropdown(false);
                        }
                      }, 200);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setShowApplicationDropdown(false);
                        setApplicationHighlightedIndex(-1);
                        return;
                      }

                      const query =
                        formData.application?.trim().toLowerCase() || "";
                      const filtered = applications.filter(
                        (a) => !query || a.name.toLowerCase().includes(query),
                      );

                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        if (showApplicationDropdown && filtered.length > 0) {
                          setApplicationHighlightedIndex((prev) => {
                            const nextIndex =
                              prev < filtered.length - 1 ? prev + 1 : 0;
                            setTimeout(() => {
                              applicationOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        if (showApplicationDropdown && filtered.length > 0) {
                          setApplicationHighlightedIndex((prev) => {
                            const nextIndex =
                              prev > 0 ? prev - 1 : filtered.length - 1;
                            setTimeout(() => {
                              applicationOptionRefs.current[
                                nextIndex
                              ]?.scrollIntoView({
                                block: "nearest",
                                behavior: "smooth",
                              });
                            }, 0);
                            return nextIndex;
                          });
                        }
                      } else if (e.key === "Enter") {
                        if (
                          showApplicationDropdown &&
                          applicationHighlightedIndex >= 0 &&
                          applicationHighlightedIndex < filtered.length
                        ) {
                          e.preventDefault();
                          const selected =
                            filtered[applicationHighlightedIndex];
                          handleInputChange("application", selected.name);
                          setShowApplicationDropdown(false);
                          setApplicationHighlightedIndex(-1);
                        } else if (showApplicationDropdown) {
                          // keep typed value, just close suggestions
                          setShowApplicationDropdown(false);
                          setApplicationHighlightedIndex(-1);
                        }
                      } else {
                        setApplicationHighlightedIndex(-1);
                      }
                    }}
                    className={cn(
                      "h-10 text-xs pl-10 border-input",
                      !showApplicationDropdown && "border-2",
                      showApplicationDropdown &&
                      "ring-2 ring-primary border-primary",
                    )}
                  />
                </div>

                {showApplicationDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-lg shadow-lg max-h-60 overflow-auto">
                    {applicationsLoading ? (
                      <div className="px-4 py-3 text-sm text-muted-foreground">
                        Loading applications...
                      </div>
                    ) : (
                      (() => {
                        const query =
                          formData.application?.trim().toLowerCase() || "";
                        const filtered = applications.filter(
                          (a) => !query || a.name.toLowerCase().includes(query),
                        );
                        const rawTyped = formData.application?.trim() || "";
                        const exactMatch = filtered.some(
                          (a) => a.name.toLowerCase() === rawTyped.toLowerCase(),
                        );
                        const showAddNew = rawTyped.length > 0 && !exactMatch;

                        if (filtered.length === 0) {
                          if (!showAddNew) {
                            return (
                              <div className="px-4 py-3 text-sm text-muted-foreground">
                                {query
                                  ? "No applications found matching your search"
                                  : "No applications available"}
                              </div>
                            );
                          }
                        }

                        return (
                          <>
                            {filtered.map((app, idx) => (
                              <button
                                key={app.id}
                                type="button"
                                ref={(el) => {
                                  applicationOptionRefs.current[idx] = el;
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleInputChange("application", app.name);
                                  setShowApplicationDropdown(false);
                                  setApplicationHighlightedIndex(-1);
                                }}
                                className={cn(
                                  "w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-b border-border last:border-b-0",
                                  formData.application === app.name &&
                                  "bg-muted",
                                  applicationHighlightedIndex === idx &&
                                  "bg-primary/10 ring-2 ring-primary",
                                )}
                              >
                                {app.name}
                              </button>
                            ))}
                            {showAddNew && (
                              <button
                                type="button"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const newName = rawTyped;
                                  if (!newName) return;
                                  try {
                                    const resp: any =
                                      await apiClient.createApplication({
                                        name: newName,
                                      });
                                    const created =
                                      resp?.data?.data || resp?.data || resp;
                                    if (created?.name) {
                                      handleInputChange(
                                        "application",
                                        String(created.name),
                                      );
                                    } else {
                                      handleInputChange("application", newName);
                                    }
                                    await fetchApplications(
                                      undefined,
                                      String(created?.name || newName),
                                    );
                                    setShowApplicationDropdown(false);
                                    setApplicationHighlightedIndex(-1);
                                    toast({
                                      title: "Application added",
                                      description: `"${created?.name || newName}" created successfully.`,
                                    });
                                  } catch (error: any) {
                                    toast({
                                      title: "Error",
                                      description:
                                        error?.error ||
                                        error?.message ||
                                        "Failed to create application",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                className="w-full text-left px-4 py-3 text-sm hover:bg-muted transition-colors border-t border-border bg-muted/30"
                              >
                                <span className="text-primary font-medium">
                                  Add new:{" "}
                                </span>
                                <span>{rawTyped}</span>
                              </button>
                            )}
                          </>
                        );
                      })()
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  HS Code
                </label>
                <Input
                  placeholder=""
                  value={formData.hsCode}
                  onChange={(e) => handleInputChange("hsCode", e.target.value)}
                  onFocus={() => {
                    // Close all dropdowns when HS Code is focused
                    setShowMasterPartDropdown(false);
                    setShowPartDropdown(false);
                    setShowBrandDropdown(false);
                    setShowCategoryDropdown(false);
                    setShowSubcategoryDropdown(false);
                    setShowApplicationDropdown(false);
                  }}
                  className="h-8 text-xs border-2 border-input focus-visible:border"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  UOM 
                </label>
                <Select
                  value={formData.uom}
                  onValueChange={(v) => handleInputChange("uom", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select UOM" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NOS" className="text-xs">
                      NOS
                    </SelectItem>
                    <SelectItem value="SET" className="text-xs">
                      SET
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
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Weight (Kg)
                </label>
                <Input
                  type="number"
                  step="0.001"
                  placeholder=""
                  value={formData.weight}
                  onChange={(e) => {
                    const formatted = formatWeightValue(e.target.value);
                    handleInputChange("weight", formatted);
                  }}
                  onBlur={(e) => {
                    // Format on blur to ensure proper decimal places
                    const value = e.target.value.trim();
                    if (value && !isNaN(parseFloat(value))) {
                      const num = parseFloat(value);
                      const formatted = num.toFixed(3).replace(/\.?0+$/, "");
                      handleInputChange("weight", formatted);
                    }
                  }}
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Cost Price
                </label>
                <Input
                  type="number"
                  step="0.01"
                  max={MAX_PRICE_LIMIT}
                  value={formatNumericValue(formData.cost)}
                  onChange={(e) => handleInputChange("cost", e.target.value)}
                  className={cn(
                    "h-8 text-xs",
                    costError &&
                      "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {costError && (
                  <p className="text-xs text-destructive mt-1">{costError}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
              {/* <div className="bg-muted/30 p-1 rounded-sm">
                <label className="block text-[10px] text-muted-foreground mb-0.5 font-bold">
                  Purchase Price
                </label>
                <Input
                  type="number"
                  readOnly
                  value={formatNumericValue(formData.purchasePrice)}
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
                  value={formatNumericValue(formData.avgCost)}
                  className="h-6 text-[10px] bg-background/50"
                />
              </div> */}
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Price-A
                </label>
                <Input
                  type="number"
                  step="0.01"
                  max={MAX_PRICE_LIMIT}
                  value={formatNumericValue(formData.priceA)}
                  onChange={(e) => handleInputChange("priceA", e.target.value)}
                  className={cn(
                    "h-8 text-xs",
                    priceAError &&
                    "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {priceAError && (
                  <p className="text-xs text-destructive mt-1">{priceAError}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Price-B
                </label>
                <Input
                  type="number"
                  step="0.01"
                  max={MAX_PRICE_LIMIT}
                  value={formatNumericValue(formData.priceB)}
                  onChange={(e) => handleInputChange("priceB", e.target.value)}
                  className={cn(
                    "h-8 text-xs",
                    priceBError &&
                    "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {priceBError && (
                  <p className="text-xs text-destructive mt-1">{priceBError}</p>
                )}
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Price-M
                </label>
                <Input
                  type="number"
                  step="0.01"
                  max={MAX_PRICE_LIMIT}
                  value={formatNumericValue(formData.priceM)}
                  onChange={(e) => handleInputChange("priceM", e.target.value)}
                  className={cn(
                    "h-8 text-xs",
                    priceMError &&
                    "border-destructive focus-visible:ring-destructive",
                  )}
                />
                {priceMError && (
                  <p className="text-xs text-destructive mt-1">{priceMError}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-3">
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Origin
                </label>
                <Select
                  value={formData.origin || undefined}
                  onValueChange={(v) => handleInputChange("origin", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Grade (A/B/C/D)
                </label>
                <Select
                  value={formData.grade}
                  onValueChange={(v) => handleInputChange("grade", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Status (A/N)
                </label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => handleInputChange("status", v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A" className="text-xs">
                      A
                    </SelectItem>
                    <SelectItem value="N" className="text-xs">
                      N
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  SMC
                </label>
                <Input
                  placeholder=""
                  value={formData.smc}
                  onChange={(e) => handleInputChange("smc", e.target.value)}
                  onFocus={() => {
                    // Close all dropdowns when SMC is focused
                    setShowMasterPartDropdown(false);
                    setShowPartDropdown(false);
                    setShowBrandDropdown(false);
                    setShowCategoryDropdown(false);
                    setShowSubcategoryDropdown(false);
                    setShowApplicationDropdown(false);
                  }}
                  className="h-8 text-xs border-2 border-input focus-visible:border"
                />
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Size
                </label>
                <Input
                  placeholder=""
                  value={formData.size}
                  onChange={(e) => handleInputChange("size", e.target.value)}
                  onFocus={() => {
                    // Close all dropdowns when Size is focused
                    setShowMasterPartDropdown(false);
                    setShowPartDropdown(false);
                    setShowBrandDropdown(false);
                    setShowCategoryDropdown(false);
                    setShowSubcategoryDropdown(false);
                    setShowApplicationDropdown(false);
                  }}
                  className="h-8 text-xs border-2 border-input focus-visible:border"
                />
              </div>
            </div>

            {/* Image Upload Section */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Image P1
                </label>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputP1Ref}
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, setImageP1)}
                />
                <div
                  className="relative border border-dashed border-border rounded p-2 flex flex-col items-center justify-center hover:border-primary transition-colors cursor-pointer h-16 overflow-hidden"
                  onClick={() => !imageP1 && fileInputP1Ref.current?.click()}
                >
                  {imageP1 ? (
                    <>
                      <img
                        src={imageP1}
                        alt="P1"
                        className="w-full h-full object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageP1(null);
                        }}
                        className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center hover:bg-destructive/80"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-muted-foreground mb-0.5" />
                      <span className="text-[9px] text-muted-foreground">
                        Upload P1
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs text-foreground mb-1 font-bold">
                  Image P2
                </label>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputP2Ref}
                  className="hidden"
                  onChange={(e) => handleImageUpload(e, setImageP2)}
                />
                <div
                  className="relative border border-dashed border-border rounded p-2 flex flex-col items-center justify-center hover:border-primary transition-colors cursor-pointer h-16 overflow-hidden"
                  onClick={() => !imageP2 && fileInputP2Ref.current?.click()}
                >
                  {imageP2 ? (
                    <>
                      <img
                        src={imageP2}
                        alt="P2"
                        className="w-full h-full object-cover rounded"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageP2(null);
                        }}
                        className="absolute top-0.5 right-0.5 bg-destructive text-destructive-foreground rounded-full w-4 h-4 flex items-center justify-center hover:bg-destructive/80"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-4 h-4 text-muted-foreground mb-0.5" />
                      <span className="text-[9px] text-muted-foreground">
                        Upload P2
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-xs text-foreground mb-1 font-bold">
                Remarks
              </label>
              <Textarea
                placeholder=""
                value={formData.remarks}
                onChange={(e) => handleInputChange("remarks", e.target.value)}
                onFocus={() => {
                  // Close all dropdowns when Remarks is focused
                  setShowMasterPartDropdown(false);
                  setShowPartDropdown(false);
                  setShowBrandDropdown(false);
                  setShowCategoryDropdown(false);
                  setShowSubcategoryDropdown(false);
                  setShowApplicationDropdown(false);
                }}
                rows={2}
                className="text-xs min-h-[50px] border-2 border-input focus-visible:border"
              />
            </div>

            <div className="mb-4">
              <label className="block text-xs text-foreground mb-1 font-bold">
                Type
              </label>
              <Select
                value={formData.type || "single"}
                onValueChange={(value) => handleInputChange("type", value)}
              >
                <SelectTrigger className="h-8 text-xs border-2 border-input focus-visible:border">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single</SelectItem>
                  <SelectItem value="kit">Kit</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.type === "kit" && (
              <div className="mb-4 border border-border rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-foreground">Kit Items</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs px-2"
                    onClick={handleAddKitItem}
                  >
                    Add Item
                  </Button>
                </div>

                <div className="space-y-2">
                  {kitItems.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground border border-dashed rounded p-2">
                      No single items selected for this kit.
                    </div>
                  ) : (
                    kitItems.map((row) => (
                      <div key={row.id} className="space-y-1 border rounded p-2">
                        {(() => {
                          const selectedOption = selectableSinglePartOptions.find(
                            (option) => option.id === row.itemPartId,
                          );
                          const optionsToRender =
                            selectedOption &&
                            !selectableSinglePartOptions.some(
                              (option) => option.id === selectedOption.id,
                            )
                              ? [selectedOption, ...selectableSinglePartOptions]
                              : selectableSinglePartOptions;

                          return (
                            <SearchableSelect
                              options={optionsToRender.map((option) => ({
                                value: option.id,
                                label: `Part: ${option.partNo} | MP: ${option.masterPartNo || "-"}`,
                                description: `Desc: ${option.description || "-"} | Brand: ${option.brandName || "-"}`,
                              }))}
                              value={row.itemPartId}
                              onValueChange={(value) =>
                                handleKitItemPartChange(row.id, value)
                              }
                              placeholder="Search single type item"
                              className="h-8 text-xs"
                            />
                          );
                        })()}
                        <div className="flex gap-2 items-center">
                          {(() => {
                            const selectedOption = selectableSinglePartOptions.find(
                              (option) => option.id === row.itemPartId,
                            );
                            const selectedDescription =
                              selectedOption?.description || row.itemDescription || "-";
                            const selectedBrand = selectedOption?.brandName || "-";

                            return (
                              <div className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                                <span className="font-medium text-foreground/90">
                                  {selectedDescription}
                                </span>
                                <span className="ml-2">| Brand: {selectedBrand}</span>
                              </div>
                            );
                          })()}
                          <Input
                            type="number"
                            min={1}
                            value={row.quantity}
                            onChange={(e) =>
                              handleKitItemQtyChange(
                                row.id,
                                e.target.value === "" ? "" : parseInt(e.target.value, 10),
                              )
                            }
                            onBlur={() =>
                              handleKitItemQtyChange(
                                row.id,
                                row.quantity === "" ? 1 : Number(row.quantity),
                              )
                            }
                            className="h-8 text-xs w-20"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs text-destructive border-destructive"
                            onClick={() => handleRemoveKitItem(row.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 w-full">
              <div className="flex flex-wrap gap-3">
                {isEditing ? (
                  canEdit && (
                    <Button
                      className="gap-1.5 h-7 text-xs px-4 min-w-[140px]"
                      onClick={() => handleSaveWithMode("update")}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Update Part
                    </Button>
                  )
                ) : (
                  canCreate && (
                    <Button
                      className="gap-1.5 h-7 text-xs px-4 min-w-[140px]"
                      onClick={() => handleSaveWithMode("create")}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Save Part
                    </Button>
                  )
                )}
                <Button
                  variant="outline"
                  className="h-8 text-xs px-4"
                  onClick={handleReset}
                >
                  Reset
                </Button>
              </div>
              {isEditing && canCreate && (
                <Button
                  variant="secondary"
                  className="gap-1.5 h-7 text-xs px-4 min-w-[140px] shrink-0"
                  onClick={() => handleSaveWithMode("create")}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Part
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Model and Quantity / Kit Items */}
      <div className="w-fit bg-card rounded-lg border border-border p-2">
        <div className="flex items-center justify-end mb-3">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleAddModel}
          >
            Add More
          </Button>
        </div>

        <div className="border-t border-border pt-2">
          <div className="flex items-center gap-1 mb-1.5 text-xs text-foreground font-bold">
            <span className="w-20 ml-1">Model</span>
            <span className="w-12 ml-1">Qty.</span>
            <span className="w-8 ml-1" aria-hidden="true" />
          </div>

          {modelQuantities.map((mq) => (
            <div
              key={mq.id}
              className="flex items-center gap-0.5 mb-1.5"
            >
              <SearchableSelect
                options={modelSelectOptions}
                value={mq.model}
                onValueChange={(value) =>
                  handleModelChange(mq.id, "model", value)
                }
                onSearchChange={(query) => {
                  void fetchModelNames(query);
                }}
                placeholder={modelNamesLoading ? "Loading..." : "Select model"}
                allowCustom
                createLabel="model"
                disabled={modelNamesLoading && modelSelectOptions.length === 0}
                className="w-20 ml-1 [&>div]:w-full [&_input]:h-8 [&_input]:text-sm [&_input]:w-full"
                aria-label="Model"
              />
              <Input
                type="number"
                value={mq.qty || ""}
                onChange={(e) =>
                  handleModelChange(mq.id, "qty", parseInt(e.target.value) || 0)
                }
                className="h-8 w-12 ml-1 text-sm px-1.5"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 ml-1 text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={() => handleRemoveModel(mq.id)}
              >
                <Trash className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
