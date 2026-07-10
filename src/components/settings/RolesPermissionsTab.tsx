import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Shield,
  Plus,
  Edit,
  Trash,
  Users,
  Key,
  Download,
  Loader2
} from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface Role {
  id: string;
  name: string;
  type: string;
  description: string;
  usersCount: number;
  permissions: string[];
}

const allPermissions = [
  "users.view", "users.create", "users.edit", "users.delete",
  "inventory.view", "inventory.create", "inventory.edit", "inventory.delete",
  "sales.view", "sales.create", "sales.edit", "sales.delete",
  "reports.view", "reports.export",
  "settings.view", "settings.edit",
];

const roleColors = [
  "bg-primary/15 text-primary border-primary/20",
  "bg-emerald-100 text-emerald-600 border-emerald-200",
  "bg-blue-100 text-blue-600 border-blue-200",
  "bg-purple-100 text-purple-600 border-purple-200",
  "bg-pink-100 text-pink-600 border-pink-200",
  "bg-gray-100 text-gray-600 border-gray-200",
];

export const RolesPermissionsTab = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [formData, setFormData] = useState({ 
    name: "", 
    description: "", 
    permissions: [] as string[] 
  });

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getRoles();
      if (response.error) {
        toast.error(response.error);
      } else {
        setRoles(response.data || []);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  const handleSubmit = async () => {
    if (!formData.name) {
      toast.error("Please enter role name");
      return;
    }

    try {
      if (editingRole) {
        const response = await apiClient.updateRole(editingRole.id, {
          name: formData.name,
          description: formData.description,
          permissions: formData.permissions,
        });
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("Role updated successfully");
          setIsDialogOpen(false);
          setEditingRole(null);
          setFormData({ name: "", description: "", permissions: [] });
          fetchRoles();
        }
      } else {
        const response = await apiClient.createRole({
          name: formData.name,
          description: formData.description,
          permissions: formData.permissions,
        });
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("Role created successfully");
          setIsDialogOpen(false);
          setFormData({ name: "", description: "", permissions: [] });
          fetchRoles();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save role");
    }
  };

  const handleEdit = (role: Role) => {
    setEditingRole(role);
    setFormData({ name: role.name, description: role.description, permissions: role.permissions });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    
    try {
      const response = await apiClient.deleteRole(id);
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success("Role deleted successfully");
        fetchRoles();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete role");
    }
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Role Name", "Type", "Description", "Users Count", "Permissions Count", "Permissions"],
      ...roles.map(role => [
        role.name, role.type, role.description, role.usersCount.toString(), role.permissions.length.toString(), role.permissions.join("; ")
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roles_export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Roles exported successfully");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">System Roles</h2>
          <p className="text-sm text-muted-foreground">Manage user roles and their permissions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => { setEditingRole(null); setFormData({ name: "", description: "", permissions: [] }); }}>
                <Plus className="w-4 h-4" />
                Create Role
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? "Edit Role" : "Create New Role"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Role Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter role name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the role"
                />
              </div>
              <div className="space-y-2">
                <Label>Permissions</Label>
                <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg bg-muted/30">
                  {allPermissions.map((permission) => (
                    <div key={permission} className="flex items-center space-x-2">
                      <Checkbox
                        id={permission}
                        checked={formData.permissions.includes(permission)}
                        onCheckedChange={() => togglePermission(permission)}
                      />
                      <label htmlFor={permission} className="text-sm cursor-pointer">
                        {permission}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSubmit}>{editingRole ? "Update" : "Create"} Role</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Role Cards */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.length === 0 ? (
            <div className="col-span-full text-center py-8 text-muted-foreground">
              No roles found. Create your first role to get started.
            </div>
          ) : (
            roles.map((role, index) => (
          <Card key={role.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${roleColors[index % roleColors.length]}`}>
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{role.name}</h3>
                    <p className="text-xs text-muted-foreground">{role.type}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <ActionButtonTooltip label="Edit" variant="edit">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(role)}>
                      <Edit className="w-4 h-4" />
                    </Button>
                  </ActionButtonTooltip>
                  <ActionButtonTooltip label="Delete" variant="delete">
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(role.id)}>
                      <Trash className="w-4 h-4" />
                    </Button>
                  </ActionButtonTooltip>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mb-4">{role.description}</p>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Users className="w-4 h-4" />
                  <span>{role.usersCount} users</span>
                </div>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Key className="w-4 h-4" />
                  <span>{role.permissions.length} permissions</span>
                </div>
              </div>
            </CardContent>
          </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
};
