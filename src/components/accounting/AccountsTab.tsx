import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Users, Plus, Pencil, Trash2, MoreVertical, Save, RotateCcw, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { apiClient } from "@/lib/api";

interface Account {
  id: string;
  group: string;
  subGroup: string;
  code: string;
  name: string;
  status: "Active" | "Inactive";
  canDelete: boolean;
}

const mainGroupOptions = [
  "Current Assets",
  "Long Term Assets",
  "Current Liabilities",
  "Long Term Liabilities",
  "Capital",
  "Drawings",
  "Revenues",
  "Expenses",
  "Cost",
];

const subGroupMapping: Record<string, string[]> = {
  "Current Assets": ["101-Inventory", "102-Cash", "103-Bank", "104-Sales Customer Receivables", "108-BANK ACCOUNT"],
  "Long Term Assets": ["206-SHOP INVESTMENT"],
  "Current Liabilities": ["301-Purchase Orders Payables", "302-Purchase expenses Payables", "303-Salirys"],
  "Long Term Liabilities": ["304-Other Payables"],
  "Capital": ["501-Owner's Equity"],
  "Drawings": ["601-Owner Drawings"],
  "Revenues": ["701-Sales Revenue"],
  "Expenses": ["801-Operating Expenses"],
  "Cost": ["901-Cost of Goods Sold"],
};

// Local API URL detection is replaced by apiClient from @/lib/api


export const AccountsTab = () => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [filterMainGroup, setFilterMainGroup] = useState<string>("all");
  const [filterSubGroup, setFilterSubGroup] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [pageSize, setPageSize] = useState("10");
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamic data from API
  const [mainGroups, setMainGroups] = useState<{ id: string; code: string; name: string }[]>([]);
  const [subGroups, setSubGroups] = useState<{ id: string; code: string; name: string; mainGroupId: string }[]>([]);

  const [isAddAccountDialogOpen, setIsAddAccountDialogOpen] = useState(false);
  const [isAddPersonDialogOpen, setIsAddPersonDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);

  // Ref to prevent useEffect from fetching when we manually fetch
  const isManualFetchRef = useRef(false);

  const [formData, setFormData] = useState({
    mainGroup: "",
    subGroup: "",
    name: "",
    description: "",
    accountName: "",
  });

  // Since we're fetching filtered data from API, use accounts directly
  // But also apply client-side filtering for status if needed (for case-insensitive matching)
  const filteredAccounts = accounts.filter((acc) => {
    // API already filters by mainGroup and subGroup, but we check status client-side for case-insensitive matching
    const matchesStatus = filterStatus === "all" || acc.status.toLowerCase() === filterStatus.toLowerCase();
    const normalizedSearch = searchTerm.trim().toLowerCase();
    const matchesSearch =
      normalizedSearch === "" ||
      acc.name.toLowerCase().includes(normalizedSearch) ||
      acc.code.toLowerCase().includes(normalizedSearch);
    return matchesStatus && matchesSearch;
  });

  const totalPages = Math.ceil(filteredAccounts.length / parseInt(pageSize)) || 1;
  const paginatedAccounts = filteredAccounts.slice(
    (currentPage - 1) * parseInt(pageSize),
    currentPage * parseInt(pageSize)
  );

  // Get available subgroups based on selected main group in form
  const availableSubGroups = formData.mainGroup
    ? subGroups.filter(sg => {
      const mainGroup = mainGroups.find(mg => mg.name === formData.mainGroup || mg.id === formData.mainGroup);
      return mainGroup && sg.mainGroupId === mainGroup.id;
    })
    : [];

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMainGroup, filterSubGroup, filterStatus, searchTerm, pageSize]);

  // Fetch main groups and subgroups on mount
  useEffect(() => {
    const fetchMainGroups = async () => {
      try {
        const result = await apiClient.get<any>("/accounting/main-groups");
        if (result.data) {
          setMainGroups(result.data || []);
        }
      } catch (error) {
      }
    };

    const fetchSubGroups = async () => {
      try {
        const result = await apiClient.get<any>("/accounting/subgroups");
        if (result.data) {
          setSubGroups(result.data || []);
        }
      } catch (error) {
      }
    };

    fetchMainGroups();
    fetchSubGroups();
  }, []);

  // Reset subgroup when main group changes
  useEffect(() => {
    if (formData.mainGroup) {
      setFormData(prev => ({ ...prev, subGroup: "" }));
    }
  }, [formData.mainGroup]);

  // Fetch accounts when filters change, but only after mainGroups and subGroups are loaded
  useEffect(() => {
    // Skip if this is a manual fetch
    if (isManualFetchRef.current) {
      isManualFetchRef.current = false;
      return;
    }
    // Wait for both mainGroups and subGroups to be loaded before fetching
    // If filtering by subgroup, we need subGroups to be loaded
    if (filterSubGroup !== "all" && subGroups.length === 0) {
      return; // Wait for subGroups to load
    }
    // If filtering by mainGroup, we need mainGroups to be loaded
    if (filterMainGroup !== "all" && mainGroups.length === 0) {
      return; // Wait for mainGroups to load
    }
    // If all filters are "all", we can fetch immediately (but still wait for at least mainGroups)
    if (filterMainGroup === "all" && filterSubGroup === "all" && mainGroups.length === 0) {
      return; // Wait for mainGroups to load for initial fetch
    }
    fetchAccounts();
  }, [filterMainGroup, filterSubGroup, filterStatus, mainGroups.length, subGroups.length]);

  const fetchAccounts = async (overrideFilters?: { mainGroup?: string; subGroup?: string; status?: string }) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();

      // Use override filters if provided, otherwise use state filters
      const mainGroupFilter = overrideFilters?.mainGroup ?? filterMainGroup;
      const subGroupFilter = overrideFilters?.subGroup ?? filterSubGroup;
      const statusFilter = overrideFilters?.status ?? filterStatus;

      // If a specific subgroup is selected, only filter by subgroup (not mainGroup)
      // This ensures we get all accounts for that subgroup
      if (subGroupFilter !== "all") {
        // Try to find subgroup by name or ID
        const subGroup = subGroups.find(sg =>
          sg.name === subGroupFilter ||
          sg.id === subGroupFilter ||
          sg.name.toLowerCase() === subGroupFilter.toLowerCase()
        );
        if (subGroup) {
          params.append("subgroupId", subGroup.id);
        } else {
          // Don't fetch if subgroup filter is set but not found - might cause wrong results
          setLoading(false);
          return;
        }
      } else if (mainGroupFilter !== "all" && mainGroups.length > 0) {
        // Only filter by mainGroup if no specific subgroup is selected
        const mainGroup = mainGroups.find(mg => mg.name === mainGroupFilter);
        if (mainGroup) {
          params.append("mainGroupId", mainGroup.id);
        }
      }
      if (statusFilter !== "all") {
        // Normalize status to match backend (capitalize first letter)
        const normalizedStatus = statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1).toLowerCase();
        params.append("status", normalizedStatus);
      }

      const result = await apiClient.get<any>(`/accounting/accounts?${params}`);
      if (result.data) {
        const data = result.data || [];

        // Log all subgroups in the response for debugging
        const allSubgroupsInResponse = [...new Set(data.map((acc: any) =>
          `${(acc.Subgroup || acc.subgroup)?.code || 'N/A'}-${(acc.Subgroup || acc.subgroup)?.name || 'N/A'}`
        ))];

        const transformed = data.map((acc: any) => {
          const sg = acc.Subgroup || acc.subgroup;
          const mg = sg?.MainGroup || sg?.mainGroup;

          return {
            id: acc.id,
            group: mg ? `${mg.code || ''}-${mg.name || ''}` : '',
            subGroup: sg?.name || '',
            code: acc.code,
            name: acc.name,
            status: acc.status || 'Active',
            balance: acc.currentBalance || 0,
            canDelete: acc.canDelete !== undefined ? acc.canDelete : true,
          };
        });

        // Log unique subgroups after transformation
        const uniqueSubgroups = [...new Set(transformed.map(acc => acc.subGroup).filter(Boolean))];
        console.log('Unique subgroups in accounts list:', uniqueSubgroups);

        // Check specifically for bank subgroups
        const bankAccounts = transformed.filter(acc =>
          acc.subGroup?.toLowerCase().includes('bank') ||
          acc.code?.startsWith('103') ||
          acc.code?.startsWith('108')
        );
        if (bankAccounts.length > 0) {
        }

        setAccounts(transformed);
      } else if (result.error) {
        console.error("Accounts load failure:", result.error);
        toast.error(`Failed to load accounts: ${result.error}`);
      }
    } catch (error: any) {
      console.error("Error fetching accounts:", error);
      toast.error(`Error loading accounts: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(paginatedAccounts.map((a) => a.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleSelectItem = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id]);
    } else {
      setSelectedItems(selectedItems.filter((item) => item !== id));
    }
  };

  const handleAddAccount = async () => {
    if (!formData.mainGroup || !formData.subGroup || !formData.name) {
      toast.error("Please fill all required fields (Main Group, Sub Group, and Account Name)");
      return;
    }
    try {
      // Find subgroup ID from state or API
      let subgroup = subGroups.find((sg: any) => sg.name === formData.subGroup || sg.id === formData.subGroup);

      if (!subgroup) {
        // Try to fetch from API if not in state
        try {
          const result = await apiClient.get<any>("/accounting/subgroups");
          if (result.data) {
            const subgroups = result.data || [];
            subgroup = subgroups.find((sg: any) => sg.name === formData.subGroup || sg.id === formData.subGroup);
          }
        } catch (fetchError) {
        }
      }

      if (!subgroup) {
        toast.error(`Subgroup "${formData.subGroup}" not found. Please select a valid subgroup.`);
        return;
      }

      // Get the subgroup code (can be any format)
      const subgroupCode = subgroup.code;

      if (!subgroupCode || String(subgroupCode).trim() === '') {
        toast.error(`Subgroup "${formData.subGroup}" does not have a code. Please add a code to this subgroup first.`);
        return;
      }

      // Generate accounting code: [SubgroupCode][sequential number]
      // Format: Can be any length based on subgroup code
      // Fetch all accounts to find the next sequential number for this subgroup
      const resultAllAccounts = await apiClient.get<any>("/accounting/accounts");
      const subgroupCodeStr = String(subgroupCode).trim();
      let accountCode = `${subgroupCodeStr}001`; // Default: first account in subgroup

      if (resultAllAccounts.data) {
        const allAccounts = resultAllAccounts.data || [];

        // Filter accounts that belong to this subgroup
        const subgroupAccounts = allAccounts.filter((acc: any) => {
          // Check if account code starts with subgroup code
          return acc.code && String(acc.code).startsWith(subgroupCodeStr);
        });

        if (subgroupAccounts.length > 0) {
          // Extract sequence numbers from codes
          // Pattern: [subgroupCode][sequenceNumber]
          const sequenceNumbers = subgroupAccounts
            .map((acc: any) => {
              const accCodeStr = String(acc.code);
              if (accCodeStr.startsWith(subgroupCodeStr)) {
                const sequencePart = accCodeStr.substring(subgroupCodeStr.length);
                const num = parseInt(sequencePart, 10);
                return !isNaN(num) && num > 0 ? num : 0;
              }
              return 0;
            })
            .filter((num: number) => num > 0);

          if (sequenceNumbers.length > 0) {
            const maxSequence = Math.max(...sequenceNumbers);
            const nextSequence = maxSequence + 1;
            // Format sequence number with at least 3 digits (001, 002, ... 999, 1000, etc.)
            const sequenceStr = String(nextSequence).padStart(3, '0');
            accountCode = `${subgroupCodeStr}${sequenceStr}`;
          }
        }
      }

      const code = accountCode;

      const nextResult = await apiClient.post<any>("/accounting/accounts", {
        subgroupId: subgroup.id,
        code,
        name: formData.name,
        description: formData.description || formData.name,
        accountType: 'regular',
        status: 'Active',
      });

      if (nextResult.data) {
        toast.success(`Account "${nextResult.data.name}" added successfully!`);
        setIsAddAccountDialogOpen(false);
        resetForm();
        // Mark as manual fetch to prevent useEffect from interfering
        isManualFetchRef.current = true;
        // Reset filters first
        setFilterMainGroup("all");
        setFilterSubGroup("all");
        setFilterStatus("all");
        // Fetch accounts with "all" filters immediately
        await fetchAccounts({ mainGroup: "all", subGroup: "all", status: "all" });
      } else {
        toast.error(nextResult.error || "Failed to add account");
      }
    } catch (error: any) {
      toast.error(error.message || "Error adding account");
    }
  };

  const handleAddPersonAccount = async () => {
    if (!formData.mainGroup || !formData.subGroup || !formData.accountName) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      // Find subgroup ID from state or API
      let subgroup = subGroups.find((sg: any) => sg.name === formData.subGroup || sg.id === formData.subGroup);

      if (!subgroup) {
        // Try to fetch from API if not in state
        try {
          const result = await apiClient.get<any>("/accounting/subgroups");
          if (result.data) {
            const subgroups = result.data || [];
            subgroup = subgroups.find((sg: any) => sg.name === formData.subGroup || sg.id === formData.subGroup);
          }
        } catch (fetchError) {
        }
      }

      if (!subgroup) {
        toast.error(`Subgroup "${formData.subGroup}" not found. Please select a valid subgroup.`);
        return;
      }

      // Get the subgroup code (can be any format)
      const subgroupCode = subgroup.code;

      if (!subgroupCode || String(subgroupCode).trim() === '') {
        toast.error(`Subgroup "${formData.subGroup}" does not have a code. Please add a code to this subgroup first.`);
        return;
      }

      // Generate accounting code: [SubgroupCode][sequential number]
      // Format: Can be any length based on subgroup code
      // Fetch all accounts to find the next sequential number for this subgroup
      const resultAllAccounts = await apiClient.get<any>("/accounting/accounts");
      const subgroupCodeStr = String(subgroupCode).trim();
      let accountCode = `${subgroupCodeStr}001`; // Default: first account in subgroup

      if (resultAllAccounts.data) {
        const allAccounts = resultAllAccounts.data || [];

        // Filter accounts that belong to this subgroup
        const subgroupAccounts = allAccounts.filter((acc: any) => {
          // Check if account code starts with subgroup code
          return acc.code && String(acc.code).startsWith(subgroupCodeStr);
        });

        if (subgroupAccounts.length > 0) {
          // Extract sequence numbers from codes
          // Pattern: [subgroupCode][sequenceNumber]
          const sequenceNumbers = subgroupAccounts
            .map((acc: any) => {
              const accCodeStr = String(acc.code);
              if (accCodeStr.startsWith(subgroupCodeStr)) {
                const sequencePart = accCodeStr.substring(subgroupCodeStr.length);
                const num = parseInt(sequencePart, 10);
                return !isNaN(num) && num > 0 ? num : 0;
              }
              return 0;
            })
            .filter((num: number) => num > 0);

          if (sequenceNumbers.length > 0) {
            const maxSequence = Math.max(...sequenceNumbers);
            const nextSequence = maxSequence + 1;
            // Format sequence number with at least 3 digits (001, 002, ... 999, 1000, etc.)
            const sequenceStr = String(nextSequence).padStart(3, '0');
            accountCode = `${subgroupCodeStr}${sequenceStr}`;
          }
        }
      }

      const code = accountCode;

      const nextResult = await apiClient.post<any>("/accounting/accounts", {
        subgroupId: subgroup.id,
        code,
        name: formData.accountName,
        description: formData.description || formData.accountName,
        accountType: 'person',
        status: 'Active',
      });

      if (nextResult.data) {
        toast.success(`Person's account "${nextResult.data.name}" added successfully!`);
        setIsAddPersonDialogOpen(false);
        resetForm();
        // Mark as manual fetch to prevent useEffect from interfering
        isManualFetchRef.current = true;
        // Reset filters first
        setFilterMainGroup("all");
        setFilterSubGroup("all");
        setFilterStatus("all");
        // Fetch accounts with "all" filters immediately
        await fetchAccounts({ mainGroup: "all", subGroup: "all", status: "all" });
      } else {
        toast.error(nextResult.error || "Failed to add person's account");
      }
    } catch (error: any) {
      toast.error(error.message || "Error adding person's account");
    }
  };

  const handleEditAccount = (account: Account) => {
    setEditingAccount(account);
    const groupName = account.group.split("-").slice(1).join("-");
    setFormData({
      mainGroup: groupName,
      subGroup: account.subGroup,
      name: account.name,
      description: account.name,
      accountName: "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateAccount = async () => {
    if (!editingAccount) return;
    if (!formData.mainGroup || !formData.subGroup || !formData.name) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      // Find subgroup ID from state or API
      let subgroup = subGroups.find((sg: any) => sg.name === formData.subGroup || sg.id === formData.subGroup);

      if (!subgroup) {
        // Try to fetch from API if not in state
        const result = await apiClient.get<any>("/accounting/subgroups");
        const subgroups = result.data || [];
        subgroup = subgroups.find((sg: any) => sg.name === formData.subGroup);
      }

      if (!subgroup) {
        toast.error("Subgroup not found");
        return;
      }

      const result = await apiClient.put<any>(`/accounting/accounts/${editingAccount.id}`, {
        subgroupId: subgroup.id,
        name: formData.name,
        description: formData.description || formData.name,
        status: editingAccount.status,
      });

      if (result.data) {
        await fetchAccounts();
        setIsEditDialogOpen(false);
        setEditingAccount(null);
        resetForm();
        toast.success("Account updated successfully!");
      } else if (result.error) {
        toast.error(result.error || "Failed to update account");
      }
    } catch (error: any) {
      toast.error(error.message || "Error updating account");
    }
  };

  const handleDeleteAccount = async (id: string) => {
    try {
      const result = await apiClient.delete<any>(`/accounting/accounts/${id}`);

      if (result.data) {
        await fetchAccounts();
        toast.success("Account deleted successfully!");
      } else if (result.error) {
        toast.error(result.error || "Failed to delete account");
      }
    } catch (error) {
      toast.error("Error deleting account");
    }
  };

  const resetForm = () => {
    setFormData({
      mainGroup: "",
      subGroup: "",
      name: "",
      description: "",
      accountName: "",
    });
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Group", "Sub Group", "Code", "Name", "Status"].join(","),
      ...filteredAccounts.map(acc => [
        acc.group,
        acc.subGroup,
        acc.code,
        acc.name,
        acc.status
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `accounts_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Accounts exported to CSV successfully!");
  };

  const handlePrintList = () => {
    const printHTML = `
      <html>
        <head>
          <title>Accounts List</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { text-align: center; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <h1>Accounts List</h1>
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th>Sub Group</th>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${filteredAccounts.map(acc => `
                <tr>
                  <td>${acc.group}</td>
                  <td>${acc.subGroup}</td>
                  <td>${acc.code}</td>
                  <td>${acc.name}</td>
                  <td>${acc.status}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <button onclick="window.print()">Print</button>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printHTML);
      printWindow.document.close();
      printWindow.print();
    }
    toast.success("Accounts list opened for printing");
  };

  const handleViewDetails = (account: Account) => {
    toast.info(`Viewing details for account: ${account.name}`);
    // Could open a dialog with account details
  };

  const handleViewTransactions = (account: Account) => {
    toast.info(`Viewing transactions for account: ${account.name}`);
    // Could navigate to general ledger filtered by this account
  };

  return (
    <>
      <Card className="border-border/50 shadow-sm transition-all duration-300 hover:shadow-md">
        <CardHeader className="flex flex-row items-center justify-between pb-4 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg font-semibold">Accounts</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={() => {
                resetForm();
                setIsAddAccountDialogOpen(true);
              }}
              variant="outline"
              size="sm"
              className="transition-all duration-200 hover:scale-105"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add New Account
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setIsAddPersonDialogOpen(true);
              }}
              variant="outline"
              size="sm"
              className="transition-all duration-200 hover:scale-105"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              Add New Person's Account
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-card border-border z-50">
                <DropdownMenuItem onClick={handleExportCSV} className="cursor-pointer">
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePrintList} className="cursor-pointer">
                  Print List
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Main Group</Label>
              <Select value={filterMainGroup} onValueChange={setFilterMainGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Groups</SelectItem>
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Sub Group</Label>
              <Select value={filterSubGroup} onValueChange={setFilterSubGroup}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All Subgroups</SelectItem>
                  {subGroups
                    .filter(sg => filterMainGroup === "all" || sg.mainGroupId === mainGroups.find(mg => mg.name === filterMainGroup)?.id)
                    .map((sg) => (
                      <SelectItem key={sg.id} value={sg.name}>
                        {sg.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">Search (Name / Code)</Label>
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Type account name or code"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 text-left w-12">
                    <Checkbox
                      checked={selectedItems.length === paginatedAccounts.length && paginatedAccounts.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="p-3 text-left w-12"></th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Group
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Sub Group
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Code
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Status
                  </th>
                  <th className="p-3 text-left font-medium text-primary underline cursor-pointer hover:text-primary/80 transition-colors">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      Loading accounts...
                    </td>
                  </tr>
                ) : paginatedAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-muted-foreground">
                      No accounts found. Click "Add New Account" to create one.
                    </td>
                  </tr>
                ) : (
                  paginatedAccounts.map((account, index) => (
                    <tr
                      key={account.id}
                      className={`border-b border-border/50 transition-colors duration-200 hover:bg-muted/30 ${index % 2 === 0 ? "bg-muted/10" : ""
                        }`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedItems.includes(account.id)}
                          onCheckedChange={(checked) =>
                            handleSelectItem(account.id, checked as boolean)
                          }
                        />
                      </td>
                      <td className="p-3">
                        <div className="w-3 h-3 rounded-full bg-success"></div>
                      </td>
                      <td className="p-3 text-primary font-medium">{account.group}</td>
                      <td className="p-3 text-primary font-medium">{account.subGroup}</td>
                      <td className="p-3 font-medium">{account.code}</td>
                      <td className="p-3 text-primary font-medium">{account.name}</td>
                      <td className="p-3">
                        <Badge
                          variant="outline"
                          className={`${account.status === "Active"
                            ? "text-success border-success/30 bg-success/10"
                            : "text-muted-foreground border-border"
                            } transition-all duration-200`}
                        >
                          {account.status}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1">
                          <ActionButtonTooltip label="Edit" variant="edit">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAccount(account)}
                              className="text-primary hover:text-primary/80 transition-colors"
                            >
                              <Pencil className="h-4 w-4 mr-1" />
                              Edit
                            </Button>
                          </ActionButtonTooltip>
                          {account.canDelete && (
                            <ActionButtonTooltip label="Delete" variant="delete">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteAccount(account.id)}
                                className="text-destructive hover:text-destructive/80 transition-colors"
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                Delete
                              </Button>
                            </ActionButtonTooltip>
                          )}
                          <DropdownMenu>
                            <ActionButtonTooltip label="More Actions" variant="more">
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                            </ActionButtonTooltip>
                            <DropdownMenuContent align="end" className="bg-card border-border z-50">
                              <DropdownMenuItem onClick={() => handleViewDetails(account)} className="cursor-pointer">
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleViewTransactions(account)} className="cursor-pointer">
                                View Transactions
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between mt-4 gap-4">
            <p className="text-sm text-muted-foreground">
              Showing <span className="text-primary">{filteredAccounts.length > 0 ? (currentPage - 1) * parseInt(pageSize) + 1 : 0}</span> to{" "}
              <span className="text-primary">{Math.min(currentPage * parseInt(pageSize), filteredAccounts.length)}</span> of{" "}
              <span className="text-primary">{filteredAccounts.length}</span> items
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="transition-all duration-200"
                >
                  {"<<"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(currentPage - 1)}
                  className="transition-all duration-200"
                >
                  {"<"}
                </Button>
                {Array.from({ length: Math.min(totalPages, 3) }, (_, i) => i + 1).map((page) => (
                  <Button
                    key={page}
                    variant={currentPage === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(page)}
                    className="transition-all duration-200"
                  >
                    {page}
                  </Button>
                ))}
                {totalPages > 3 && <span className="px-2">...</span>}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(currentPage + 1)}
                  className="transition-all duration-200"
                >
                  {">"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="transition-all duration-200"
                >
                  {">>"}
                </Button>
              </div>
              <Select value={pageSize} onValueChange={setPageSize}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Account Dialog */}
      <Dialog open={isAddAccountDialogOpen} onOpenChange={setIsAddAccountDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main group</Label>
              <Select
                value={formData.mainGroup}
                onValueChange={(value) => setFormData({ ...formData, mainGroup: value, subGroup: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub group</Label>
              <Select
                value={formData.subGroup}
                onValueChange={(value) => setFormData({ ...formData, subGroup: value })}
                disabled={!formData.mainGroup}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {availableSubGroups.map((sg) => (
                    <SelectItem key={sg.id} value={sg.name}>
                      {sg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter account name"
              />
            </div>
            <div className="space-y-2">
              <Label>description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddAccountDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddAccount}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Person's Account Dialog */}
      <Dialog open={isAddPersonDialogOpen} onOpenChange={setIsAddPersonDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Person's Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main group</Label>
              <Select
                value={formData.mainGroup}
                onValueChange={(value) => setFormData({ ...formData, mainGroup: value, subGroup: "", accountName: "" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {mainGroups.map((group) => (
                    <SelectItem key={group.id} value={group.name}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sub group</Label>
              <Select
                value={formData.subGroup}
                onValueChange={(value) => setFormData({ ...formData, subGroup: value })}
                disabled={!formData.mainGroup}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {availableSubGroups.map((sg) => (
                    <SelectItem key={sg.id} value={sg.name}>
                      {sg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account name</Label>
              <Select
                value={formData.accountName}
                onValueChange={(value) => setFormData({ ...formData, accountName: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  <SelectItem value="Customer A">Customer A</SelectItem>
                  <SelectItem value="Supplier B">Supplier B</SelectItem>
                  <SelectItem value="Employee C">Employee C</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddPersonDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddPersonAccount}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              <div>
                <DialogTitle>Editing Account: {editingAccount?.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">Account Code: {editingAccount?.code}</p>
              </div>
            </div>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Main group</Label>
              <div className="flex gap-2">
                <Select
                  value={formData.mainGroup}
                  onValueChange={(value) => setFormData({ ...formData, mainGroup: value, subGroup: "" })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border z-50">
                    {mainGroupOptions.map((group) => (
                      <SelectItem key={group} value={group}>
                        {group}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setFormData({ ...formData, mainGroup: "" })}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Sub group</Label>
              <Select
                value={formData.subGroup}
                onValueChange={(value) => setFormData({ ...formData, subGroup: value })}
                disabled={!formData.mainGroup}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent className="bg-card border-border z-50">
                  {availableSubGroups.map((sg) => (
                    <SelectItem key={sg.id} value={sg.name}>
                      {sg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter account name"
              />
            </div>
            <div className="space-y-2">
              <Label>description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter description"
              />
            </div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={resetForm}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            <Button onClick={handleUpdateAccount}>
              <Save className="h-4 w-4 mr-1" />
              Update
            </Button>
          </DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setIsEditDialogOpen(false)}
            className="text-muted-foreground mt-2"
          >
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
};
