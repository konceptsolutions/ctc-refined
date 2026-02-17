import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Wallet, Building2, CreditCard } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { apiClient } from "@/lib/api";

interface PaymentAccount {
  id: string;
  name: string;
  type: "Cash" | "Bank" | "Wallet" | "Other";
  accountNumber?: string;
  description?: string;
  status: "Active" | "Inactive";
}

const accountTypes = ["Cash", "Bank", "Wallet", "Other"];

export const PaymentAccountsTab = () => {
  const [accounts, setAccounts] = useState<PaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingAccount, setEditingAccount] = useState<PaymentAccount | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    type: "Cash" as PaymentAccount["type"],
    accountNumber: "",
    description: "",
    status: "Active" as PaymentAccount["status"],
  });

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      // Load from localStorage first
      const storedAccounts = localStorage.getItem("paymentAccounts");
      if (storedAccounts) {
        const parsed = JSON.parse(storedAccounts);
        setAccounts(parsed);
        setLoading(false);
        return;
      }

      // If no stored accounts, try to fetch from account groups API
      const response = await apiClient.getAccountGroups();
      
      if (response.data && response.data.accounts) {
        // Filter for payment-related accounts (Cash, Bank, Wallet)
        const paymentAccounts = response.data.accounts
          .filter((acc: any) => {
            const name = acc.name?.toLowerCase() || "";
            return (
              name.includes("cash") ||
              name.includes("bank") ||
              name.includes("wallet") ||
              name.includes("payment")
            );
          })
          .map((acc: any) => {
            const name = acc.name || "";
            let type: PaymentAccount["type"] = "Other";
            
            if (name.toLowerCase().includes("cash")) type = "Cash";
            else if (name.toLowerCase().includes("bank")) type = "Bank";
            else if (name.toLowerCase().includes("wallet")) type = "Wallet";
            
            return {
              id: acc.id || `acc-${Date.now()}-${Math.random()}`,
              name: name.split("-").pop()?.trim() || name,
              type,
              accountNumber: "",
              description: "",
              status: "Active" as PaymentAccount["status"],
            };
          });
        
        if (paymentAccounts.length > 0) {
          setAccounts(paymentAccounts);
          localStorage.setItem("paymentAccounts", JSON.stringify(paymentAccounts));
        } else {
          // No accounts found, start with empty array
          setAccounts([]);
        }
      } else {
        // No accounts from API, start with empty array
        setAccounts([]);
      }
    } catch (error) {
      // Load from localStorage on error
      const storedAccounts = localStorage.getItem("paymentAccounts");
      if (storedAccounts) {
        setAccounts(JSON.parse(storedAccounts));
      } else {
        setAccounts([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (account?: PaymentAccount) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        name: account.name,
        type: account.type,
        accountNumber: account.accountNumber || "",
        description: account.description || "",
        status: account.status,
      });
    } else {
      setEditingAccount(null);
      setFormData({
        name: "",
        type: "Cash",
        accountNumber: "",
        description: "",
        status: "Active",
      });
    }
    setShowDialog(true);
  };

  const handleCloseDialog = () => {
    setShowDialog(false);
    setEditingAccount(null);
    setFormData({
      name: "",
      type: "Cash",
      accountNumber: "",
      description: "",
      status: "Active",
    });
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Account name is required",
        variant: "destructive",
      });
      return;
    }

    try {
      let updatedAccounts: PaymentAccount[];
      
      if (editingAccount) {
        // Update existing account
        updatedAccounts = accounts.map((acc) =>
          acc.id === editingAccount.id
            ? {
                ...acc,
                ...formData,
              }
            : acc
        );
        toast({
          title: "Success",
          description: "Account updated successfully",
        });
      } else {
        // Add new account
        const newAccount: PaymentAccount = {
          id: `acc-${Date.now()}-${Math.random()}`,
          ...formData,
        };
        updatedAccounts = [...accounts, newAccount];
        toast({
          title: "Success",
          description: "Account added successfully",
        });
      }
      
      setAccounts(updatedAccounts);
      // Save to localStorage so SalesInvoice can access it
      localStorage.setItem("paymentAccounts", JSON.stringify(updatedAccounts));
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event("paymentAccountsUpdated"));
      handleCloseDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save account",
        variant: "destructive",
      });
    }
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this account?")) {
      const updatedAccounts = accounts.filter((acc) => acc.id !== id);
      setAccounts(updatedAccounts);
      // Update localStorage
      localStorage.setItem("paymentAccounts", JSON.stringify(updatedAccounts));
      // Dispatch custom event to notify other components
      window.dispatchEvent(new Event("paymentAccountsUpdated"));
      toast({
        title: "Success",
        description: "Account deleted successfully",
      });
    }
  };

  const getAccountIcon = (type: PaymentAccount["type"]) => {
    switch (type) {
      case "Cash":
        return <Wallet className="w-4 h-4" />;
      case "Bank":
        return <Building2 className="w-4 h-4" />;
      case "Wallet":
        return <CreditCard className="w-4 h-4" />;
      default:
        return <Wallet className="w-4 h-4" />;
    }
  };

  const getAccountTypeColor = (type: PaymentAccount["type"]) => {
    switch (type) {
      case "Cash":
        return "bg-green-500/10 text-green-700 dark:text-green-400";
      case "Bank":
        return "bg-blue-500/10 text-blue-700 dark:text-blue-400";
      case "Wallet":
        return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
      default:
        return "bg-gray-500/10 text-gray-700 dark:text-gray-400";
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Payment Accounts</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Manage accounts for receiving payments (Cash, Bank, Wallet, etc.)
              </p>
            </div>
            <Button onClick={() => handleOpenDialog()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Account
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading accounts...</div>
          ) : accounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No accounts found. Click "Add Account" to create one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Account Number</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${getAccountTypeColor(account.type)} flex items-center gap-1 w-fit`}
                      >
                        {getAccountIcon(account.type)}
                        {account.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.accountNumber || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {account.description || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={account.status === "Active" ? "default" : "secondary"}
                      >
                        {account.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDialog(account)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(account.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingAccount ? "Edit Account" : "Add New Account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Account Name *</Label>
              <Input
                id="name"
                placeholder="e.g., Cash, Bank Account, Mobile Wallet"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Account Type *</Label>
              <Select
                value={formData.type}
                onValueChange={(value) =>
                  setFormData({ ...formData, type: value as PaymentAccount["type"] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {accountTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                placeholder="Optional: Bank account number, wallet ID, etc."
                value={formData.accountNumber}
                onChange={(e) =>
                  setFormData({ ...formData, accountNumber: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                placeholder="Optional: Additional details about this account"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as PaymentAccount["status"] })
                }
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingAccount ? "Update" : "Add"} Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

