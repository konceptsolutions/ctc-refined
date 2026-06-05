// Prefer explicit env, otherwise use current origin. API is at /api (proxied) or host:3001.
export function getApiBaseUrl(): string {
  if (import.meta.env.VITE_API_URL && import.meta.env.VITE_API_URL.trim()) {
    return import.meta.env.VITE_API_URL.trim();
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin.replace(/\/$/, "");
    const hostname = window.location.hostname;

    // In development with Vite proxy, use the proxied /api route
    if (import.meta.env.DEV) {
      return `${origin}/api`;
    }

    // In production, use same origin /api (nginx, or vite preview proxy)
    return `${origin}/api`;
  }

  return "http://155.94.150.168:5000/api";
}

const API_BASE_URL = getApiBaseUrl();

interface ApiResponse<T> {
  data?: T;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  error?: string;
  token?: string;
  user?: any;
}

/**
 * Generate a UUID v4 string.
 * Uses crypto.randomUUID if available, otherwise falls back to Math.random.
 */
export const generateUUID = (): string => {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  // Fallback for non-secure contexts or older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<ApiResponse<T>> {
    // Fresh data: fetch(..., { cache: "no-store" }) below (no per-URL _cb — avoids extra bytes and proxy work).

    // Merge headers: start from caller headers only
    const mergedHeaders = new Headers((options.headers as HeadersInit) || {});

    // Add Authorization header if token exists
    const token = localStorage.getItem("authToken");
    if (token) {
      mergedHeaders.set("Authorization", `Bearer ${token}`);
    }

    // Ensure Content-Type is set for POST/PUT requests with body
    if (
      options.body &&
      (options.method === "POST" ||
        options.method === "PUT" ||
        options.method === "PATCH")
    ) {
      if (!mergedHeaders.has("Content-Type")) {
        mergedHeaders.set("Content-Type", "application/json");
      }
    }

    options.headers = mergedHeaders;
    try {
      // Ensure endpoint doesn't have leading slash if baseUrl already ends with one
      const cleanEndpoint = endpoint.startsWith("/")
        ? endpoint
        : `/${endpoint}`;
      const url = `${this.baseUrl}${cleanEndpoint}`;

      // Build fetch options - ensure body is preserved
      const fetchOptions: RequestInit = {
        method: options.method || "GET",
        cache: "no-store", // Force no cache
        headers: mergedHeaders,
        redirect: "follow", // Follow redirects but we'll detect them
      };

      // Only include body if it exists (for POST/PUT/PATCH)
      if (options.body) {
        fetchOptions.body = options.body;
      }

      // Include any other options (like signal for abort)
      if (options.signal) {
        fetchOptions.signal = options.signal;
      }

      const response = await fetch(url, fetchOptions);

      // Check for redirect status codes (301, 302, 307, 308)
      if (
        response.status === 301 ||
        response.status === 302 ||
        response.status === 307 ||
        response.status === 308
      ) {
        const location = response.headers.get("location");
        return {
          error: `API endpoint redirected (${response.status}). This may indicate a configuration issue. Please check the API base URL and server configuration.`,
        };
      }

      // Followed redirects surface as 200 with response.redirected (not 301/302)
      if (response.redirected && response.url !== url) {
        return {
          error:
            "API endpoint redirected to a different URL. This may indicate a configuration issue. Please check the API base URL and server configuration.",
        };
      }

      // Check if response is actually JSON before trying to parse
      const contentType = response.headers.get("content-type");
      const isJson = contentType && contentType.includes("application/json");

      if (!response.ok) {
        // Handle specific error codes
        if (response.status === 413) {
          const err = new Error(
            "Request Entity Too Large: The image or data you are trying to upload is too large. Please compress images before uploading or reduce the data size.",
          );
          (err as any).response = { status: response.status };
          throw err;
        }

        if (isJson) {
          const errorData = await response
            .json()
            .catch(() => ({ error: response.statusText }));
          // Create error object that preserves all error details
          const error = new Error(
            errorData.error ||
              errorData.message ||
              `HTTP error! status: ${response.status}`,
          );
          (error as any).response = {
            data: errorData,
            status: response.status,
          };
          (error as any).error = errorData.error;
          (error as any).details = errorData.details;
          throw error;
        } else {
          // If not JSON, it's probably an HTML error page
          const text = await response.text();
          const err = new Error(
            `HTTP error! status: ${response.status}. Server returned HTML instead of JSON. This usually means the backend is not running or the API endpoint is incorrect.`,
          );
          (err as any).response = { status: response.status };
          throw err;
        }
      }

      if (!isJson) {
        // If response is not JSON, it's probably an HTML page (404, etc.)
        const text = await response.text();
        if (text.trim().startsWith("<!")) {
          const err = new Error(
            "Server returned HTML instead of JSON. The backend API may not be running or the endpoint is incorrect.",
          );
          (err as any).response = { status: response.status };
          throw err;
        }
        const err = new Error(
          "Invalid response format: expected JSON but received " + contentType,
        );
        (err as any).response = { status: response.status };
        throw err;
      }

      const data = await response.json();
      return data;
    } catch (error: any) {
      // HTTP error path above attaches .response so callers using try/catch see failures
      if (error?.response != null) {
        throw error;
      }
      const msg = error.message || "";
      if (msg.includes("redirect")) {
        return { error: msg };
      }
      if (msg.includes("HTML")) {
        if (msg.includes("404")) {
          return {
            error:
              "Request returned 404. Ensure the backend server is running on port 5000 and the proxy configuration is correct.",
          };
        }
        return {
          error:
            "Backend API is not responding. Please ensure the backend server is running on port 5000.",
        };
      }
      return { error: msg || "Network error occurred" };
    }
  }

  // Public GET method for direct API calls
  async get<T>(endpoint: string, options: any = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "GET", ...options });
  }

  // Public POST method
  async post<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Public PUT method
  async put<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Public PATCH method
  async patch<T>(endpoint: string, data: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  // Public DELETE method
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  // Auth API
  async login(data: any) {
    return this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async forgotPassword(data: {
    identifier: string;
    newPassword: string;
    role?: "admin" | "store";
  }) {
    return this.request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Parts API
  async getPartEntryList(params?: {
    search?: string;
    part_no?: string;
    page?: number;
    limit?: number | string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/parts/part-entry-list${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPartsDropdown(search?: string) {
    const query = search ? `?search=${search}` : "";
    return this.request(`/parts-dropdown/dropdown${query}`);
  }

  async getParts(params?: {
    search?: string;
    category_id?: string;
    category_name?: string;
    subcategory_id?: string;
    subcategory_name?: string;
    brand_id?: string;
    brand_name?: string;
    application_id?: string;
    application_name?: string;
    status?: string;
    master_part_no?: string;
    part_no?: string;
    description?: string;
    page?: number;
    limit?: number | string;
    _t?: number; // Cache-busting timestamp
    [key: string]: any; // Allow any additional params for flexibility
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    // Always add cache-busting timestamp to prevent stale data
    const separator = queryString ? "&" : "?";
    const cacheBuster = `_t=${Date.now()}`;
    return this.request(
      `/parts${queryString ? `?${queryString}` : ""}${separator}${cacheBuster}`,
    );
  }

  async getPart(id: string) {
    return this.request(`/parts/${id}`);
  }

  async getPartByPartNo(partNo: string, masterPartNo?: string) {
    const params = new URLSearchParams();
    params.set("part_no", partNo.trim());
    if (masterPartNo?.trim()) params.set("master_part_no", masterPartNo.trim());
    return this.request(`/parts/by-part-no?${params.toString()}`);
  }

  async getPartsByModelAssociation(modelName: string, application?: string) {
    const params = new URLSearchParams();
    if (application?.trim()) params.set("application", application.trim());
    const query = params.toString();
    return this.request(
      `/parts/model-associations/${encodeURIComponent(modelName)}${
        query ? `?${query}` : ""
      }`,
    );
  }

  async createPart(data: any) {
    return this.request("/parts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePart(id: string, data: any) {
    return this.request(`/parts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getKitOperationDetails(partId: string) {
    return this.request(`/parts/${partId}/kit-operation-details`);
  }

  async makeKit(partId: string, data: { quantity: number }) {
    return this.request(`/parts/${partId}/make-kit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async breakKit(partId: string, data: { quantity: number }) {
    return this.request(`/parts/${partId}/break-kit`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async deletePart(id: string) {
    return this.request(`/parts/${id}`, {
      method: "DELETE",
    });
  }

  // Price Management API
  async getPartsForPriceManagement(params?: {
    search?: string;
    category?: string;
    page?: number;
    limit?: number | string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/parts/price-management${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getDetailsPartSearch(params?: any) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/parts/details-search${queryString ? `?${queryString}` : ""}`,
    );
  }

  async bulkUpdatePrices(data: {
    part_ids: string[];
    price_field: "cost" | "priceA" | "priceB" | "all";
    update_type: "percentage" | "fixed";
    update_value: number;
    reason: string;
    updated_by?: string;
  }) {
    return this.request("/parts/bulk-update-prices", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updatePartPrices(
    id: string,
    data: {
      cost?: number;
      priceA?: number;
      priceB?: number;
      reason?: string;
      updated_by?: string;
    },
  ) {
    return this.request(`/parts/${id}/prices`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getPriceHistory(params?: {
    page?: number;
    limit?: number;
    partId?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== "") {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/parts/price-history${queryString ? `?${queryString}` : ""}`,
    );
  }

  // Dropdowns API
  async getMasterParts(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request(`/dropdowns/master-parts${query}`);
  }

  async getBrands(search?: string, limit?: number) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (limit) params.append("limit", limit.toString());
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/brands${query}`);
  }

  async getCategories(search?: string) {
    const query = search ? `?search=${encodeURIComponent(search)}` : "";
    return this.request(`/dropdowns/categories${query}`);
  }

  async getSubcategories(categoryId?: string, search?: string) {
    const params = new URLSearchParams();
    if (categoryId) params.append("category_id", categoryId);
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/subcategories${query}`);
  }

  async getApplications(
    subcategoryId?: string,
    master_part_no?: string,
    search?: string,
  ) {
    const params = new URLSearchParams();
    if (subcategoryId) params.append("subcategory_id", subcategoryId);
    if (master_part_no) params.append("master_part_no", master_part_no);
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/applications${query}`);
  }

  async getPartsForDropdown(masterPartNo?: string, search?: string) {
    const params = new URLSearchParams();
    if (masterPartNo) params.append("master_part_no", masterPartNo);
    if (search) params.append("search", search);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/parts${query}`);
  }

  // Attributes Management API
  async getAllCategories(search?: string, status?: string) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status !== "all") params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/categories/all${query}`);
  }

  async createCategory(data: { name: string; status?: string }) {
    return this.request("/dropdowns/categories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCategory(id: string, data: { name: string; status?: string }) {
    return this.request(`/dropdowns/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: string) {
    return this.request(`/dropdowns/categories/${id}`, {
      method: "DELETE",
    });
  }

  async getAllSubcategories(
    search?: string,
    status?: string,
    category_id?: string,
  ) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status !== "all") params.append("status", status);
    if (category_id && category_id !== "all")
      params.append("category_id", category_id);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/subcategories/all${query}`);
  }

  async createSubcategory(data: {
    name: string;
    category_id: string;
    status?: string;
  }) {
    return this.request("/dropdowns/subcategories", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSubcategory(
    id: string,
    data: { name: string; category_id: string; status?: string },
  ) {
    return this.request(`/dropdowns/subcategories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSubcategory(id: string) {
    return this.request(`/dropdowns/subcategories/${id}`, {
      method: "DELETE",
    });
  }

  async getAllBrands(search?: string, status?: string) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status !== "all") params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/brands/all${query}`);
  }

  async createBrand(data: { name: string; longName?: string; status?: string }) {
    return this.request("/dropdowns/brands", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateBrand(
    id: string,
    data: { name: string; longName?: string; status?: string },
  ) {
    return this.request(`/dropdowns/brands/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteBrand(id: string) {
    return this.request(`/dropdowns/brands/${id}`, {
      method: "DELETE",
    });
  }

  async getAllApplications(
    search?: string,
    status?: string,
    subcategory_id?: string,
    master_part_no?: string,
  ) {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    if (status && status !== "all") params.append("status", status);
    if (subcategory_id && subcategory_id !== "all")
      params.append("subcategory_id", subcategory_id);
    if (master_part_no && master_part_no !== "all")
      params.append("master_part_no", master_part_no);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/dropdowns/applications/all${query}`);
  }

  async createApplication(data: {
    name: string;
    subcategory_id?: string;
    master_part_no?: string;
    status?: string;
  }) {
    return this.request("/dropdowns/applications", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateApplication(
    id: string,
    data: {
      name: string;
      subcategory_id?: string;
      master_part_no?: string;
      status?: string;
    },
  ) {
    return this.request(`/dropdowns/applications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteApplication(id: string) {
    return this.request(`/dropdowns/applications/${id}`, {
      method: "DELETE",
    });
  }

  async removeApplicationDuplicates(): Promise<{
    removed?: number;
    message?: string;
    error?: string;
  }> {
    return this.request("/dropdowns/applications/remove-duplicates", {
      method: "POST",
    });
  }

  // DPO Returns
  async getDpoReturns(params?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    dpo_id?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(`/dpo-returns${queryString ? `?${queryString}` : ""}`);
  }

  async getDpoReturn(id: string) {
    return this.request(`/dpo-returns/${id}`);
  }

  async createDpoReturn(data: {
    dpo_id: string;
    return_date: string;
    reason?: string;
    items: Array<{
      part_id: string;
      return_quantity: number;
    }>;
  }) {
    return this.request("/dpo-returns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async approveDpoReturn(id: string) {
    return this.request(`/dpo-returns/${id}/approve`, {
      method: "POST",
    });
  }

  async rejectDpoReturn(id: string, rejection_reason?: string) {
    return this.request(`/dpo-returns/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ rejection_reason }),
    });
  }

  async deleteDpoReturn(id: string) {
    return this.request(`/dpo-returns/${id}`, {
      method: "DELETE",
    });
  }

  // Inventory Adjustments
  async getInventoryDashboard() {
    return this.request("/inventory/dashboard");
  }

  async getStockMovements(params?: {
    part_id?: string;
    type?: string;
    from_date?: string;
    to_date?: string;
    store_id?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/movements${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createStockMovement(data: {
    part_id: string;
    type: "in" | "out";
    quantity: number;
    store_id?: string;
    rack_id?: string;
    shelf_id?: string;
    reference_type?: string;
    reference_id?: string;
    notes?: string;
  }) {
    return this.request("/inventory/movements", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateStockLocation(data: {
    part_id: string;
    type: "in" | "out";
    quantity: number;
    store_id?: string | null;
    rack_id?: string | null;
    shelf_id?: string | null;
  }) {
    return this.request("/inventory/update-location", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateStockMovement(
    id: string,
    data: {
      store_id?: string | null;
      rack_id?: string | null;
      shelf_id?: string | null;
    },
  ) {
    return this.request(`/inventory/movements/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getRackShelfBalances() {
    return this.request("/inventory/rack-shelf-balances");
  }

  async getStockBalance(partId: string) {
    return this.request(`/inventory/balance/${partId}`);
  }

  async getPartCostLookup(partId: string) {
    return this.request(`/inventory/cost-lookup/${partId}`);
  }

  async getPartLocations(partId: string) {
    return this.request<any[]>(
      `/inventory/part-locations/${partId}?t=${Date.now()}`,
    );
  }

  async transferStockLocation(data: {
    part_id: string;
    quantity: number;
    source: {
      store_id: string | null;
      rack_id: string | null;
      shelf_id: string | null;
    };
    target: {
      store_id: string;
      rack_id: string | null;
      shelf_id: string | null;
    };
  }) {
    return this.request("/inventory/transfer-location", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPartRackShelfSummary(params?: {
    search?: string;
    category_id?: string;
    store_id?: string;
    stock_as_of_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/part-rack-shelf${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getStockBalances(params?: {
    search?: string;
    category_id?: string;
    store_id?: string;
    part_id?: string;
    part_ids?: string[] | string;
    low_stock?: boolean;
    out_of_stock?: boolean;
    in_stock?: boolean;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          // Convert boolean to string 'true' or 'false'
          if (typeof value === "boolean") {
            queryParams.append(key, value ? "true" : "false");
          } else {
            queryParams.append(key, String(value));
          }
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/balances${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getStockBalanceValuation(params?: {
    search?: string;
    category?: string;
    store?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/stock-balance-valuation${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getStockAnalysis(params?: {
    fast_moving_days?: number;
    slow_moving_days?: number;
    dead_stock_days?: number;
    analysis_period?: number;
    search?: string;
    category?: string;
    classification?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/stock-analysis${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getTransfers(params?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/transfers${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getTransfer(id: string) {
    return this.request(`/inventory/transfers/${id}`);
  }

  async createTransfer(data: {
    transfer_number: string;
    date: string;
    from_store_id?: string;
    to_store_id?: string;
    notes?: string;
    items: Array<{
      part_id: string;
      from_store_id?: string;
      from_rack_id?: string;
      from_shelf_id?: string;
      to_store_id?: string;
      to_rack_id?: string;
      to_shelf_id?: string;
      quantity: number;
    }>;
  }) {
    return this.request("/inventory/transfers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateTransfer(
    id: string,
    data: {
      transfer_number?: string;
      date?: string;
      from_store_id?: string;
      to_store_id?: string;
      notes?: string;
      status?: string;
      items?: Array<{
        part_id: string;
        from_store_id?: string;
        from_rack_id?: string;
        from_shelf_id?: string;
        to_store_id?: string;
        to_rack_id?: string;
        to_shelf_id?: string;
        quantity: number;
      }>;
    },
  ) {
    return this.request(`/inventory/transfers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteTransfer(id: string) {
    return this.request(`/inventory/transfers/${id}`, {
      method: "DELETE",
    });
  }

  async getAdjustments(params?: {
    from_date?: string;
    to_date?: string;
    status?: string;
    search?: string;
    part_id?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/adjustments${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getAdjustmentParts() {
    return this.request("/inventory/adjustment-parts");
  }

  async getStockDetails(partId: string, storeId?: string) {
    const query = storeId ? `?store_id=${storeId}` : "";
    return this.request(`/stock-details/${partId}${query}`);
  }

  async createAdjustment(data: {
    date: string;
    subject?: string;
    store_id?: string;
    add_inventory?: boolean;
    notes?: string;
    items: Array<{
      part_id: string;
      quantity: number;
      cost?: number;
      priceA?: number;
      priceB?: number;
      priceM?: number;
      notes?: string;
    }>;
  }) {
    return this.request("/inventory/adjustments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getAdjustment(id: string) {
    return this.request(`/inventory/adjustments/${id}`);
  }

  async updateAdjustment(
    id: string,
    data: {
      date?: string;
      subject?: string;
      store_id?: string;
      add_inventory?: boolean;
      notes?: string;
      items?: Array<{
        part_id: string;
        quantity: number;
        cost?: number;
        notes?: string;
      }>;
    },
  ) {
    return this.request(`/inventory/adjustments/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteAdjustment(id: string) {
    return this.request(`/inventory/adjustments/${id}`, {
      method: "DELETE",
    });
  }

  async getAdjustmentsByStore(params: {
    store_id: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        queryParams.append(key, String(value));
      }
    });
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/adjustments/by-store${queryString ? `?${queryString}` : ""}`,
    );
  }

  async approveAdjustment(
    id: string,
    data: {
      items: Array<{
        id: string;
        rack_id?: string;
        shelf_id?: string;
      }>;
    },
  ) {
    return this.request(`/inventory/adjustments/${id}/approve`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getPurchaseOrders(params?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/purchase-orders${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createPurchaseOrder(data: {
    po_number?: string; // Optional - backend will auto-generate if not provided
    date: string;
    supplier_id?: string;
    expected_date?: string;
    notes?: string;
    items: Array<{
      part_id: string;
      quantity: number;
      unit_cost: number;
      total_cost?: number;
      received_qty?: number;
      notes?: string;
    }>;
  }) {
    return this.request("/inventory/purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPurchaseOrder(id: string) {
    return this.request(`/inventory/purchase-orders/${id}`);
  }

  async getPurchaseOrdersByPart(
    partId: string,
    params?: {
      page?: number;
      limit?: number;
    },
  ) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== "") {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/purchase-orders/by-part/${partId}${queryString ? `?${queryString}` : ""}`,
    );
  }

  async updatePurchaseOrder(
    id: string,
    data: {
      po_number?: string;
      date?: string;
      supplier_id?: string;
      expected_date?: string;
      notes?: string;
      status?: string;
      store_id?: string;
      items?: Array<{
        part_id: string;
        quantity: number;
        unit_cost: number;
        total_cost?: number;
        received_qty?: number;
        notes?: string;
      }>;
      expenses?: Array<{
        type: string;
        payableAccount: string;
        amount: number;
      }>;
    },
  ) {
    return this.request(`/inventory/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deletePurchaseOrder(id: string) {
    return this.request(`/inventory/purchase-orders/${id}`, {
      method: "DELETE",
    });
  }

  async getStores(status?: string) {
    const query = status && status !== "all" ? `?status=${status}` : "";
    return this.request(`/inventory/stores${query}`);
  }

  async createStore(data: {
    name: string;
    type: string;
    status?: string;
    description?: string;
  }) {
    return this.request("/inventory/stores", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateStore(
    id: string,
    data: {
      name: string;
      type: string;
      status?: string;
      description?: string;
    },
  ) {
    return this.request(`/inventory/stores/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteStore(id: string) {
    return this.request(`/inventory/stores/${id}`, {
      method: "DELETE",
    });
  }

  async getRacks(storeId?: string, status?: string) {
    const params = new URLSearchParams();
    if (storeId) params.append("store_id", storeId);
    if (status && status !== "all") params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/inventory/racks${query}`);
  }

  async createRack(data: {
    codeNo: string;
    storeId: string;
    description?: string;
    status?: string;
  }) {
    return this.request("/inventory/racks", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateRack(
    id: string,
    data: {
      codeNo: string;
      storeId?: string;
      description?: string;
      status?: string;
    },
  ) {
    return this.request(`/inventory/racks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteRack(id: string) {
    return this.request(`/inventory/racks/${id}`, {
      method: "DELETE",
    });
  }

  async getShelves(rackId?: string, status?: string) {
    const params = new URLSearchParams();
    if (rackId) params.append("rack_id", rackId);
    if (status && status !== "all") params.append("status", status);
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/inventory/shelves${query}`);
  }

  async createShelf(data: {
    shelfNo: string;
    rackId: string;
    description?: string;
    status?: string;
  }) {
    // Generate ID on frontend as workaround for backend issue
    const id = generateUUID();
    return this.request("/inventory/shelves", {
      method: "POST",
      body: JSON.stringify({
        ...data,
        id,
        updatedAt: new Date().toISOString(),
      }),
    });
  }

  async updateShelf(
    id: string,
    data: {
      shelfNo: string;
      description?: string;
      status?: string;
    },
  ) {
    return this.request(`/inventory/shelves/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteShelf(id: string) {
    return this.request(`/inventory/shelves/${id}`, {
      method: "DELETE",
    });
  }

  async getMultiDimensionalReport(params?: {
    primary_dimension?: string;
    secondary_dimension?: string;
    tertiary_dimension?: string;
    category_filter?: string;
    brand_filter?: string;
    sort_by?: string;
    sort_direction?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/multi-dimensional-report${queryString ? `?${queryString}` : ""}`,
    );
  }

  // Direct Purchase Orders
  async getDirectPurchaseOrders(params?: {
    status?: string;
    from_date?: string;
    to_date?: string;
    store_id?: string;
    part_id?: string;
    order_type?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/inventory/direct-purchase-orders${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getDirectPurchaseOrdersByPart(
    partId: string,
    params?: {
      page?: number;
      limit?: number;
      order_type?: string;
    },
  ) {
    return this.getDirectPurchaseOrders({
      ...params,
      part_id: partId,
      order_type: params?.order_type ?? "local_purchase",
    });
  }

  async getDirectPurchaseOrder(id: string) {
    return this.request(`/inventory/direct-purchase-orders/${id}`);
  }

  async createDirectPurchaseOrder(data: {
    dpo_number: string;
    date: string;
    invoice_no?: string;
    invoice_date?: string;
    store_id?: string;
    supplier_id?: string;
    branch_account_id?: string;
    order_type?: string;
    account?: string;
    description?: string;
    status?: string;
    /** Discount on items subtotal only (not applied to expense lines) */
    discount?: number;
    items: Array<{
      part_id: string;
      quantity: number;
      purchase_price: number;
      price_a?: number;
      price_b?: number;
      price_m?: number;
      amount?: number;
      rack_id?: string;
      shelf_id?: string;
    }>;
    expenses?: Array<{
      expense_type: string;
      payable_account: string;
      description?: string;
      amount: number;
    }>;
  }) {
    // Debug logging
    return this.request("/inventory/direct-purchase-orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateDirectPurchaseOrder(
    id: string,
    data: {
      dpo_number?: string;
      date?: string;
      invoice_no?: string;
      invoice_date?: string;
      store_id?: string;
      supplier_id?: string;
      branch_account_id?: string;
      order_type?: string;
      account?: string;
      description?: string;
      status?: string;
      discount?: number;
      items?: Array<{
        part_id: string;
        quantity: number;
        purchase_price: number;
        price_a?: number;
        price_b?: number;
        price_m?: number;
        amount?: number;
        rack_id?: string;
        shelf_id?: string;
      }>;
      expenses?: Array<{
        expense_type: string;
        payable_account: string;
        description?: string;
        amount: number;
      }>;
    },
  ) {
    return this.request(`/inventory/direct-purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteDirectPurchaseOrder(id: string) {
    return this.request(`/inventory/direct-purchase-orders/${id}`, {
      method: "DELETE",
    });
  }

  // Expenses API
  async getExpenseStatistics() {
    return this.request("/expenses/statistics");
  }

  async getExpenseTypes(params?: {
    search?: string;
    category?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/expenses/expense-types${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createExpenseType(data: {
    name: string;
    description?: string;
    category: string;
    budget: number;
    status?: string;
  }) {
    return this.request("/expenses/expense-types", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateExpenseType(
    id: string,
    data: {
      name?: string;
      description?: string;
      category?: string;
      budget?: number;
      status?: string;
    },
  ) {
    return this.request(`/expenses/expense-types/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteExpenseType(id: string) {
    return this.request(`/expenses/expense-types/${id}`, {
      method: "DELETE",
    });
  }

  async getPostedExpenses(params?: {
    search?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/expenses/posted-expenses${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createPostedExpense(data: {
    date: string;
    expense_type_id: string;
    amount: number;
    paidTo: string;
    paymentMode?: string;
    referenceNumber?: string;
    description?: string;
  }) {
    return this.request("/expenses/posted-expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOperationalExpenses(params?: {
    search?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/expenses/operational-expenses${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createOperationalExpense(data: {
    date: string;
    expenseType: string;
    paidTo: string;
    amount: number;
    description?: string;
  }) {
    return this.request("/expenses/operational-expenses", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getOperationalExpense(id: string) {
    return this.request(`/expenses/operational-expenses/${id}`);
  }

  // Financial Statements API
  async getGeneralJournal(params?: {
    search_by?: string;
    search?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/accounting/general-journal${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getTrialBalance(params?: { from_date?: string; to_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/financial/trial-balance${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getBalanceSheet(params?: { date?: string; as_of_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      // Use as_of_date if provided, otherwise use date
      const dateValue = params.as_of_date || params.date;
      if (dateValue) {
        queryParams.append("as_of_date", String(dateValue));
      }
    }
    const queryString = queryParams.toString();
    return this.request(
      `/accounting/balance-sheet${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getIncomeStatement(params?: { from_date?: string; to_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/financial/income-statement${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getLedgers(params?: {
    main_group?: string;
    sub_group?: string;
    account?: string;
    from_date?: string;
    to_date?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/financial/ledgers${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getAccountGroups() {
    return this.request("/financial/account-groups");
  }

  async getAccounts(params?: {
    subgroupId?: string;
    status?: string;
    mainGroupId?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/accounting/accounts${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getMainGroups() {
    return this.request("/accounting/main-groups");
  }

  async seedMainGroups() {
    return this.request("/accounting/seed-main-groups", { method: "POST" });
  }

  async seedSubgroups() {
    return this.request("/accounting/seed-subgroups", { method: "POST" });
  }

  async seedRequiredAccounts() {
    return this.request("/accounting/seed-required-accounts", {
      method: "POST",
    });
  }

  async createMainGroup(data: {
    code: string;
    name: string;
    type?: string;
    displayOrder?: number;
  }) {
    return this.request("/accounting/main-groups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getSubgroups(params?: { mainGroupId?: string; isActive?: boolean }) {
    const queryParams = new URLSearchParams();
    if (params) {
      if (params.mainGroupId)
        queryParams.append("mainGroupId", params.mainGroupId);
      if (params.isActive !== undefined)
        queryParams.append("isActive", String(params.isActive));
    }
    const queryString = queryParams.toString();
    return this.request(
      `/accounting/subgroups${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createSubgroup(data: {
    mainGroupId: string;
    code: string;
    name: string;
    isActive?: boolean;
  }) {
    return this.request("/accounting/subgroups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async createAccount(data: {
    subgroupId: string;
    code: string;
    name: string;
    description?: string;
    openingBalance?: number;
    accountType?: string;
    status?: string;
  }) {
    return this.request("/accounting/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Customers API
  async getCustomers(params?: {
    search?: string;
    searchBy?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(`/customers${queryString ? `?${queryString}` : ""}`);
  }

  async getCustomer(id: string) {
    return this.request(`/customers/${id}`);
  }

  async createCustomer(data: {
    name: string;
    address?: string;
    email?: string;
    cnic?: string;
    contactNo?: string;
    openingBalance?: number;
    date?: string;
    creditLimit?: number;
    status?: string;
    priceType?: "A" | "B" | "M";
    code?: string;
    accountHead?: string;
    shortTitle?: string;
    referenceName?: string;
    area?: string;
    cellNumber?: string;
    contactPersons?: any[];
    gstNumber?: string;
    pstNumber?: string;
    ntn?: string;
    remarks?: string;
    category?: string;
    accountOpeningDate?: string;
    accountClosingDate?: string;
  }) {
    return this.request("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateCustomer(
    id: string,
    data: {
      name?: string;
      address?: string;
      email?: string;
      cnic?: string;
      contactNo?: string;
      openingBalance?: number;
      date?: string;
      creditLimit?: number;
      status?: string;
      priceType?: "A" | "B" | "M";
      accountId?: string; // Account ID for voucher creation
      code?: string;
      accountHead?: string;
      title?: string;
      shortTitle?: string;
      referenceName?: string;
      area?: string;
      cellNumber?: string;
      contactPersons?: any[];
      gstNumber?: string;
      pstNumber?: string;
      ntn?: string;
      remarks?: string;
      category?: string;
      accountOpeningDate?: string;
      accountClosingDate?: string;
    },
  ) {
    return this.request(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteCustomer(id: string) {
    return this.request(`/customers/${id}`, {
      method: "DELETE",
    });
  }

  async getAreas() {
    return this.request("/dropdowns/areas");
  }

  async createArea(name: string) {
    return this.request("/dropdowns/areas", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  // Suppliers API
  async getSuppliers(params?: {
    search?: string;
    fieldFilter?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(`/suppliers${queryString ? `?${queryString}` : ""}`);
  }

  async getSupplier(id: string) {
    return this.request(`/suppliers/${id}`);
  }

  async createSupplier(data: {
    code?: string; // Optional - will be auto-generated if not provided
    type?: "local" | "international";
    currencyName?: string;
    name?: string;
    companyName: string;
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
    email?: string;
    phone?: string;
    cnic?: string;
    contactPerson?: string;
    taxId?: string;
    paymentTerms?: string;
    openingBalance?: number;
    date?: string;
    status?: string;
    notes?: string;
    accountId?: string;
    accountHead?: string;
    title?: string;
    shortTitle?: string;
    referenceName?: string;
    area?: string;
    cellNumber?: string;
    contactPersons?: any[];
    gstNumber?: string;
    ntn?: string;
    remarks?: string;
  }) {
    return this.request("/suppliers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSupplier(
    id: string,
    data: {
      code?: string;
      type?: "local" | "international";
      currencyName?: string;
      name?: string;
      companyName?: string;
      address?: string;
      city?: string;
      state?: string;
      country?: string;
      zipCode?: string;
      email?: string;
      phone?: string;
      cnic?: string;
      contactPerson?: string;
      taxId?: string;
      paymentTerms?: string;
      openingBalance?: number;
      date?: string;
      status?: string;
      notes?: string;
      accountId?: string;
      accountHead?: string;
      title?: string;
      shortTitle?: string;
      referenceName?: string;
      area?: string;
      cellNumber?: string;
      contactPersons?: any[];
      gstNumber?: string;
      ntn?: string;
      remarks?: string; // Account ID for voucher creation
    },
  ) {
    return this.request(`/suppliers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSupplier(id: string) {
    return this.request(`/suppliers/${id}`, {
      method: "DELETE",
    });
  }

  // Purchase Import API
  async getPurchaseImportPartDetails(partId: string) {
    return this.request(`/purchase-import/part-details/${partId}`);
  }

  async getPurchaseImportAlternateParts(partId: string) {
    return this.request(`/purchase-import/alternate-parts/${partId}`);
  }

  async createPurchaseImportRequest(data: {
    supplierIds: string[];
    partReference?: string;
    consignee?: "ISB" | "KHI" | "Other";
    notes?: string;
    items: Array<{
      partId: string;
      demandQuantity: number;
      khiQuantity?: number;
      isbQuantity?: number;
      otherQuantity?: number;
      weight: number;
    }>;
  }) {
    return this.request("/purchase-import/requests", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPurchaseImportRequests(params?: { page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/purchase-import/requests${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPurchaseImportRequestById(requestId: string) {
    return this.request(`/purchase-import/requests/${requestId}`);
  }

  async updatePurchaseImportRequest(
    requestId: string,
    data: {
      supplierIds: string[];
      partReference?: string;
      consignee?: "ISB" | "KHI" | "Other";
      notes?: string;
      items: Array<{
        partId: string;
        demandQuantity: number;
        khiQuantity?: number;
        isbQuantity?: number;
        otherQuantity?: number;
        weight: number;
      }>;
    },
  ) {
    return this.request(`/purchase-import/requests/${requestId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async updatePurchaseImportRequestStatus(
    requestId: string,
    status: "pending" | "confirm",
  ) {
    return this.request(`/purchase-import/requests/${requestId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  async getPurchaseQuotationContext(requestId: string) {
    return this.request(`/purchase-import/requests/${requestId}/quotation-context`);
  }

  async createPurchaseQuotation(
    requestId: string,
    data: {
      quotationDate: string;
      revisedQuotationDate?: string;
      quotationType?: "original" | "revised";
      status?: string;
      currency: string;
      conversionRate: number;
      terms?: string;
      items: Array<{
        partId: string;
        demandQuantity: number;
        quotationQuantity: number;
        shipDays: number;
        fcRate: number;
        weight: number;
      }>;
    },
  ) {
    return this.request(`/purchase-import/requests/${requestId}/quotations`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getPurchaseQuotations(params?: { page?: number; limit?: number }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/purchase-import/quotations${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPurchaseQuotationById(quotationId: string) {
    return this.request(`/purchase-import/quotations/${quotationId}`);
  }

  async updatePurchaseQuotation(
    quotationId: string,
    data: {
      quotationDate: string;
      currency: string;
      conversionRate: number;
      terms?: string;
      items: Array<{
        partId: string;
        demandQuantity: number;
        quotationQuantity: number;
        shipDays: number;
        fcRate: number;
        revisedFcRate?: number;
        weight: number;
      }>;
    },
  ) {
    return this.request(`/purchase-import/quotations/${quotationId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async updatePurchaseQuotationStatus(
    quotationId: string,
    status: "pending" | "confirm" | "revise",
  ) {
    return this.request(`/purchase-import/quotations/${quotationId}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    });
  }

  async revisePurchaseQuotation(
    quotationId: string,
    data: {
      quotationDate: string;
      revisedQuotationDate: string;
      status?: "pending" | "confirm" | "revise";
      currency: string;
      conversionRate: number;
      terms?: string;
      items: Array<{
        partId: string;
        demandQuantity: number;
        quotationQuantity: number;
        shipDays: number;
        fcRate: number;
        revisedFcRate: number;
        weight: number;
      }>;
    },
  ) {
    return this.request(`/purchase-import/quotations/${quotationId}/revise`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // Reports API
  async getDashboardMetrics() {
    return this.request("/reports/dashboard/metrics");
  }

  async getHourlySales() {
    return this.request("/reports/dashboard/hourly-sales");
  }

  async getTopSelling(limit?: number) {
    const queryParams = limit ? `?limit=${limit}` : "";
    return this.request(`/reports/dashboard/top-selling${queryParams}`);
  }

  async getRecentActivity(limit?: number) {
    const queryParams = limit ? `?limit=${limit}` : "";
    return this.request(`/reports/dashboard/recent-activity${queryParams}`);
  }

  async getSalesReport(params?: {
    from_date?: string;
    to_date?: string;
    customer_id?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/sales${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPeriodicSales(params?: { period_type?: string; year?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/sales/periodic${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getSalesByType(params?: { from_date?: string; to_date?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/sales/by-type${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getTargetAchievement(params?: { period?: string; month?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/sales/target-achievement${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getStockMovement(params?: {
    period?: string;
    category?: string;
    brand?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/inventory/stock-movement${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getBrandWise(params?: {
    from_date?: string;
    to_date?: string;
    brand?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/inventory/brand-wise${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPurchasesReport(params?: {
    from_date?: string;
    to_date?: string;
    supplier_id?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/financial/purchases${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getPurchaseComparison(params?: {
    period1_start?: string;
    period1_end?: string;
    period2_start?: string;
    period2_end?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/financial/purchase-comparison${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getImportCostSummary(params?: {
    from_date?: string;
    to_date?: string;
    country?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/financial/import-cost${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getExpensesReport(params?: {
    from_date?: string;
    to_date?: string;
    category?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/financial/expenses${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getCustomerAnalysis(params?: {
    from_date?: string;
    to_date?: string;
    customer_id?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/analytics/customers${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getCustomerAging(params?: {
    customer_type?: string;
    sort_by?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/analytics/customer-aging${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getCustomerAgingOverdueInvoices(params?: {
    from_date?: string;
    to_date?: string;
    search?: string;
    sort_by?: "due_date" | "due_amount" | "invoice_date";
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/analytics/customer-aging-overdue${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getSupplierPerformance(params?: {
    from_date?: string;
    to_date?: string;
    supplier_id?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/reports/analytics/supplier-performance${queryString ? `?${queryString}` : ""}`,
    );
  }

  // Users Management API
  async getUsers(params?: {
    search?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(`/users${queryString ? `?${queryString}` : ""}`);
  }

  async getUser(id: string) {
    return this.request(`/users/${id}`);
  }

  async createUser(data: {
    name: string;
    email: string;
    role: string;
    status: "active" | "inactive";
    password?: string;
  }) {
    return this.request("/users", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateUser(
    id: string,
    data: {
      name?: string;
      email?: string;
      role?: string;
      status?: "active" | "inactive";
      password?: string;
    },
  ) {
    return this.request(`/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string) {
    return this.request(`/users/${id}`, {
      method: "DELETE",
    });
  }

  // Roles & Permissions API
  async getRoles() {
    return this.request("/roles");
  }

  async getRole(id: string) {
    return this.request(`/roles/${id}`);
  }

  async createRole(data: {
    name: string;
    description?: string;
    permissions: string[];
  }) {
    return this.request("/roles", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateRole(
    id: string,
    data: {
      name?: string;
      description?: string;
      permissions?: string[];
    },
  ) {
    return this.request(`/roles/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteRole(id: string) {
    return this.request(`/roles/${id}`, {
      method: "DELETE",
    });
  }

  // Activity Logs API
  async getActivityLogs(params?: {
    search?: string;
    module?: string;
    actionType?: string;
    page?: number;
    limit?: number;
    fromDate?: string;
    toDate?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/activity-logs${queryString ? `?${queryString}` : ""}`,
    );
  }

  // Approval Flows API
  async getApprovalFlows() {
    return this.request("/approval-flows");
  }

  async getApprovalFlow(id: string) {
    return this.request(`/approval-flows/${id}`);
  }

  async createApprovalFlow(data: {
    name: string;
    description?: string;
    module: string;
    trigger: string;
    condition?: string;
    steps: Array<{ role: string; action: string }>;
    status?: "active" | "inactive";
  }) {
    return this.request("/approval-flows", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateApprovalFlow(
    id: string,
    data: {
      name?: string;
      description?: string;
      module?: string;
      trigger?: string;
      condition?: string;
      steps?: Array<{ role: string; action: string }>;
      status?: "active" | "inactive";
    },
  ) {
    return this.request(`/approval-flows/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteApprovalFlow(id: string) {
    return this.request(`/approval-flows/${id}`, {
      method: "DELETE",
    });
  }

  async getPendingApprovals() {
    return this.request("/approval-flows/pending");
  }

  // Backup & Restore API
  async getBackups() {
    return this.request("/backups");
  }

  async getBackup(id: string) {
    return this.request(`/backups/${id}`);
  }

  async createBackup(data: {
    name: string;
    type: "full" | "incremental";
    tables?: string[];
  }) {
    return this.request("/backups", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async restoreBackup(id: string) {
    return this.request(`/backups/${id}/restore`, {
      method: "POST",
    });
  }

  async downloadBackup(id: string) {
    const response = await fetch(`${this.baseUrl}/backups/${id}/download`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const contentDisposition = response.headers.get("Content-Disposition");
    const filename = contentDisposition
      ? contentDisposition.split("filename=")[1]?.replace(/"/g, "")
      : `backup_${id}.json`;

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    return { success: true };
  }

  async deleteBackup(id: string) {
    return this.request(`/backups/${id}`, {
      method: "DELETE",
    });
  }

  async importBackup(backupData: any) {
    return this.request("/backups/import", {
      method: "POST",
      body: JSON.stringify(backupData),
    });
  }

  async getBackupSchedules() {
    return this.request("/backups/schedules");
  }

  // Company Profile API
  async getCompanyProfile() {
    return this.request("/company-profile");
  }

  async updateCompanyProfile(data: any) {
    return this.request("/company-profile", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  // WhatsApp Settings API
  async getWhatsAppSettings() {
    return this.request("/whatsapp-settings");
  }

  async updateWhatsAppSettings(data: {
    appKey?: string;
    authKey?: string;
    administratorPhoneNumber?: string;
  }) {
    return this.request("/whatsapp-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async sendWhatsAppMessage(data: {
    to: string;
    message?: string;
    file?: string;
    template_id?: string;
    variables?: Record<string, string>;
  }) {
    return this.request("/whatsapp-settings/send-message", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // LongCat Settings API
  async getLongCatSettings() {
    return this.request("/longcat-settings");
  }

  async updateLongCatSettings(data: {
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  }) {
    return this.request("/longcat-settings", {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async sendLongCatChat(data: {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    enable_thinking?: boolean;
    thinking_budget?: number;
  }) {
    return this.request("/longcat-settings/chat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async sendLongCatMessage(data: {
    messages: Array<{ role: string; content: string }>;
    system?: string;
    model?: string;
    max_tokens?: number;
    temperature?: number;
    stream?: boolean;
    enable_thinking?: boolean;
    thinking_budget?: number;
  }) {
    return this.request("/longcat-settings/messages", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Kits API
  async getKits(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(`/kits${queryString ? `?${queryString}` : ""}`);
  }

  async getKit(id: string) {
    return this.request(`/kits/${id}`);
  }

  async createKit(data: {
    badge: string;
    name: string;
    description?: string;
    sellingPrice: number;
    status?: string;
    items: Array<{
      partId: string;
      partNo: string;
      partName: string;
      quantity: number;
      costPerUnit: number;
    }>;
  }) {
    return this.request("/kits", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateKit(
    id: string,
    data: {
      badge?: string;
      name?: string;
      description?: string;
      sellingPrice?: number;
      status?: string;
      items?: Array<{
        partId: string;
        partNo: string;
        partName: string;
        quantity: number;
        costPerUnit: number;
      }>;
    },
  ) {
    return this.request(`/kits/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteKit(id: string) {
    return this.request(`/kits/${id}`, {
      method: "DELETE",
    });
  }

  // Vouchers API
  async getVouchers(params?: {
    type?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
    search?: string;
    search_by?: string;
    account_id?: string;
    subgroup_id?: string;
    maingroup_id?: string;
    amount?: number;
    is_post_dated?: string;
    page?: number;
    limit?: number;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    queryParams.set("_t", Date.now().toString());
    const queryString = queryParams.toString();
    return this.request(`/vouchers${queryString ? `?${queryString}` : ""}`);
  }

  async getVoucher(id: string) {
    return this.request(`/vouchers/${id}`);
  }

  async createVoucher(data: {
    voucherNumber: string;
    type: string;
    date: string;
    narration?: string;
    cashBankAccount?: string;
    chequeNumber?: string;
    chequeDate?: string;
    entries: Array<{
      accountId?: string;
      account?: string;
      accountName?: string;
      description?: string;
      debit: number;
      credit: number;
      sortOrder?: number;
    }>;
    totalDebit?: number;
    totalCredit?: number;
    status?: string;
    createdBy?: string;
  }) {
    return this.request("/vouchers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateVoucher(
    id: string,
    data: {
      type?: string;
      date?: string;
      narration?: string;
      cashBankAccount?: string;
      chequeNumber?: string;
      chequeDate?: string;
      entries?: Array<{
        accountId?: string;
        account?: string;
        accountName?: string;
        description?: string;
        debit: number;
        credit: number;
        sortOrder?: number;
      }>;
      status?: string;
      approvedBy?: string;
    },
  ) {
    return this.request(`/vouchers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteVoucher(id: string) {
    return this.request(`/vouchers/${id}`, {
      method: "DELETE",
    });
  }

  // Sales API
  // Sales Inquiry
  async getSalesInquiries(params?: { status?: string; search?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/sales/inquiries${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getSalesInquiry(id: string) {
    return this.request(`/sales/inquiries/${id}`);
  }

  async createSalesInquiry(data: {
    inquiryDate: string;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    subject: string;
    description?: string;
    status?: string;
    items: Array<{
      partId: string;
      quantity: number;
      purchasePrice?: number;
      priceA?: number;
      priceB?: number;
      priceM?: number;
      location?: string;
    }>;
  }) {
    return this.request("/sales/inquiries", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSalesInquiry(
    id: string,
    data: {
      inquiryDate?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      subject?: string;
      description?: string;
      status?: string;
      items?: Array<{
        partId: string;
        quantity: number;
        purchasePrice?: number;
        priceA?: number;
        priceB?: number;
        priceM?: number;
        location?: string;
      }>;
    },
  ) {
    return this.request(`/sales/inquiries/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSalesInquiry(id: string) {
    return this.request(`/sales/inquiries/${id}`, {
      method: "DELETE",
    });
  }

  async convertInquiryToQuotation(
    id: string,
    data: {
      validUntil?: string;
      customerAddress?: string;
      notes?: string;
    },
  ) {
    return this.request(`/sales/inquiries/${id}/convert-to-quotation`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Sales Quotation
  async getSalesQuotations(params?: { status?: string; search?: string }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/sales/quotations${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getSalesQuotation(id: string) {
    return this.request(`/sales/quotations/${id}`);
  }

  async createSalesQuotation(data: {
    quotationDate: string;
    validUntil: string;
    customerName: string;
    customerType?: string;
    customerId?: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    status?: string;
    notes?: string;
    subtotal?: number;
    overallDiscount?: number;
    freightCharges?: number;
    tax?: number;
    taxPercentage?: number;
    totalAmount?: number;
    items: Array<{
      partId: string;
      partNo: string;
      description?: string;
      quantity: number;
      unitPrice: number;
    }>;
  }) {
    return this.request("/sales/quotations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateSalesQuotation(
    id: string,
    data: {
      quotationDate?: string;
      validUntil?: string;
      customerName?: string;
      customerType?: string;
      customerId?: string;
      customerEmail?: string;
      customerPhone?: string;
      customerAddress?: string;
      status?: string;
      notes?: string;
      subtotal?: number;
      overallDiscount?: number;
      freightCharges?: number;
      tax?: number;
      taxPercentage?: number;
      totalAmount?: number;
      items?: Array<{
        partId: string;
        partNo: string;
        description?: string;
        quantity: number;
        unitPrice: number;
      }>;
    },
  ) {
    return this.request(`/sales/quotations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteSalesQuotation(id: string) {
    return this.request(`/sales/quotations/${id}`, {
      method: "DELETE",
    });
  }

  async convertQuotationToInvoice(
    id: string,
    data: {
      invoiceDate?: string;
      customerId?: string;
      customerType?: string;
      term?: string;
      salesPerson?: string;
      accountId?: string;
      deliveredTo?: string;
      remarks?: string;
      discount?: number;
      tax?: number;
      paidAmount?: number;
    },
  ) {
    return this.request(`/sales/quotations/${id}/convert-to-invoice`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Sales Invoice
  async generateInvoiceNumber() {
    return this.request("/sales/invoices/generate-number");
  }

  async getSalesInvoices(params?: {
    status?: string;
    paymentStatus?: string;
    customerType?: string;
    search?: string;
    /** Only invoices that include a line for this part */
    partId?: string;
    /** Only invoices that include a line whose part belongs to this brand */
    brandId?: string;
  }) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (
          value !== undefined &&
          value !== null &&
          (typeof value !== "string" || value !== "")
        ) {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/sales/invoices${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getSalesInvoice(id: string) {
    return this.request(`/sales/invoices/${id}`);
  }

  async getSalesInvoicesByPart(
    partId: string,
    params?: {
      page?: number;
      limit?: number;
    },
  ) {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && String(value) !== "") {
          queryParams.append(key, String(value));
        }
      });
    }
    const queryString = queryParams.toString();
    return this.request(
      `/sales/invoices/by-part/${partId}${queryString ? `?${queryString}` : ""}`,
    );
  }

  async createSalesInvoice(data: {
    invoiceDate: string;
    term?: string;
    customerId?: string;
    customerName: string;
    customerType?: string;
    salesPerson?: string;
    accountId?: string;
    bankAccountId?: string;
    cashAccountId?: string;
    bankAmount?: number; // NEW
    cashAmount?: number; // NEW
    deliveredTo?: string;
    remarks?: string;
    items: Array<{
      partId: string;
      partNo: string;
      description?: string;
      orderedQty: number;
      unitPrice: number;
      discount?: number;
      lineTotal: number;
      grade?: string;
      brand?: string;
      selectedLocationId?: string;
      selectedLocationIds?: string[];
      useUnlocatedStock?: boolean;
    }>;
    subtotal: number;
    overallDiscount?: number;
    freightCharges?: number;
    tax?: number;
    taxPercentage?: number;
    grandTotal: number;
    paidAmount?: number;
  }) {
    return this.request("/sales/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async approveSalesInvoice(id: string, approvedBy?: string) {
    return this.request(`/sales/invoices/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ approvedBy }),
    });
  }

  async recordDelivery(
    id: string,
    data: {
      challanNo: string;
      deliveryDate: string;
      deliveredBy?: string;
      items: Array<{
        invoiceItemId: string;
        quantity: number;
        partRackShelfId?: string;
      }>;
    },
  ) {
    return this.request(`/sales/invoices/${id}/delivery`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async recordPayment(
    id: string,
    data: {
      amount: number;
      accountId?: string;
      paymentDate?: string;
    },
  ) {
    return this.request(`/sales/invoices/${id}/payment`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async holdInvoice(
    id: string,
    data: {
      holdReason: string;
    },
  ) {
    return this.request(`/sales/invoices/${id}/hold`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async releaseHold(id: string) {
    return this.request(`/sales/invoices/${id}/release-hold`, {
      method: "POST",
    });
  }

  async cancelInvoice(id: string) {
    return this.request(`/sales/invoices/${id}/cancel`, {
      method: "POST",
    });
  }

  async deleteInvoice(id: string) {
    const result = await this.request(`/sales/invoices/${id}`, {
      method: "DELETE",
    });
    // If 404 and we use /dev-koncepts/api, retry with /api (common when proxy only forwards /api)
    if (
      (result as any).error?.includes("404") &&
      this.baseUrl.includes("/dev-koncepts/api")
    ) {
      const origin = window.location.origin.replace(/\/$/, "");
      const fallbackUrl = `${origin}/api/sales/invoices/${id}`;
      try {
        const r = await fetch(fallbackUrl, {
          method: "DELETE",
        });
        if (!r.ok) throw new Error(`Fallback failed: ${r.status}`);
        return await r.json();
      } catch (_) {
        /* keep original result */
      }
    }
    return result;
  }

  async softDeleteInvoice(id: string) {
    return this.request(`/sales/invoices/${id}/soft-delete`, {
      method: "DELETE",
    });
  }

  async updateInvoiceStatus(
    id: string,
    status: string,
    deliveredQtys?: Record<string, number>,
    approvedBy?: string,
    holdLocations?: Record<string, any[]>,
  ) {
    return this.request(`/sales/invoices/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({
        status,
        deliveredQtys,
        approvedBy,
        holdLocations,
      }),
    });
  }

  async updateSalesInvoice(
    id: string,
    data: {
      invoiceDate?: string;
      term?: string;
      customerName?: string;
      customerId?: string;
      customerType?: string;
      deliveredTo?: string;
      remarks?: string;
      items?: Array<{
        partId: string;
        partNo: string;
        description?: string;
        orderedQty: number;
        unitPrice: number;
        discount?: number;
        lineTotal: number;
        grade?: string;
        brand?: string;
        selectedLocationId?: string;
        selectedLocationIds?: string[];
        useUnlocatedStock?: boolean;
      }>;
      subtotal?: number;
      overallDiscount?: number;
      freightCharges?: number;
      grandTotal?: number;
      tax?: number;
      taxPercentage?: number;
      accountId?: string;
      bankAccountId?: string;
      cashAccountId?: string;
      bankAmount?: number;
      cashAmount?: number;
      paidAmount?: number;
    },
  ) {
    return this.request(`/sales/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async getUndeliveredStockAlerts() {
    return this.request("/sales/invoices/undelivered-alerts");
  }

  async reverseInvoiceItem(
    itemId: string,
    data: {
      quantity: number;
      reason?: string;
    },
  ) {
    return this.request(`/sales/invoices/items/${itemId}/reverse`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async bulkReverseInvoiceItems(
    invoiceId: string,
    data: {
      items: Array<{
        invoiceItemId: string;
        quantity: number;
      }>;
      reason?: string;
    },
  ) {
    return this.request(`/sales/invoices/bulk-reverse`, {
      method: "POST",
      body: JSON.stringify({
        invoiceId,
        ...data,
      }),
    });
  }

  async getSalesReturns(params?: {
    status?: string;
    page?: number;
    limit?: number;
    invoice_id?: string;
    customer_id?: string;
    from_date?: string;
    to_date?: string;
  }) {
    const q = new URLSearchParams();
    if (params?.status) q.set("status", params.status);
    if (params?.page != null) q.set("page", String(params.page));
    if (params?.limit != null) q.set("limit", String(params.limit));
    if (params?.invoice_id) q.set("invoice_id", params.invoice_id);
    if (params?.customer_id) q.set("customer_id", params.customer_id);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const qs = q.toString();
    return this.request<{
      data?: unknown[];
      pagination?: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
      };
    }>(`/sales-returns${qs ? `?${qs}` : ""}`);
  }

  async deleteSalesReturn(id: string) {
    return this.request<{ message?: string }>(`/sales-returns/${id}`, {
      method: "DELETE",
    });
  }

  async approveSalesReturn(id: string, body?: { approved_by?: string }) {
    return this.request<{ message?: string; salesReturn?: unknown }>(
      `/sales-returns/${id}/approve`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      },
    );
  }

  async rejectSalesReturn(
    id: string,
    body?: { rejected_by?: string; rejection_reason?: string },
  ) {
    return this.request<{ message?: string; salesReturn?: unknown }>(
      `/sales-returns/${id}/reject`,
      {
        method: "POST",
        body: JSON.stringify(body ?? {}),
      },
    );
  }

  async createSalesReturn(data: {
    invoice_id: string;
    return_date: string;
    reason?: string;
    created_by?: string;
    /** Overall-discount deduction applied after tax on the return total (invoice must have discount) */
    deduction?: number;
    /** Cash/bank to refund from. Required for walk-in when net return > 0 (paid amount must equal net). Optional for party sale (<= net). */
    payment_account_id?: string;
    /** Walk-in: must equal net return. Party sale: amount to pay on approve if using payment_account_id. */
    paid_amount?: number;
    items: Array<{ part_id: string; return_quantity: number }>;
  }) {
    return this.request<{
      message?: string;
      salesReturn?: unknown;
    }>("/sales-returns", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Stock Management
  async getReservedStock(partId: string) {
    return this.request(`/sales/stock/reserved/${partId}`);
  }

  async getAvailableStock(partId: string) {
    return this.request(`/sales/stock/available/${partId}`);
  }

  async reserveStock(data: { partId: string; quantity: number }) {
    return this.request("/inventory/stock/reserve", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getReservedQuantity(partId: string) {
    return this.request(`/sales/stock/reserved/${partId}`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
