import { useEffect, useMemo, useState } from "react";
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
import {
  Shield,
  Plus,
  Edit,
  Trash,
  Users,
  Key,
  Download,
  Loader2,
  ChevronDown,
  ChevronRight,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import {
  PERMISSION_CATALOG,
  PermissionNode,
  collectKeys,
  getValidPermissionSet,
  expandPermissionAncestors,
} from "@/permissions/catalog";
import { cn } from "@/lib/utils";

interface Role {
  id: string;
  name: string;
  type: string;
  description: string;
  usersCount: number;
  permissions: string[];
}

const roleColors = [
  "bg-primary/15 text-primary border-primary/20",
  "bg-emerald-100 text-emerald-600 border-emerald-200",
  "bg-blue-100 text-blue-600 border-blue-200",
  "bg-purple-100 text-purple-600 border-purple-200",
  "bg-pink-100 text-pink-600 border-pink-200",
  "bg-gray-100 text-gray-600 border-gray-200",
];

function nodeMatchesSearch(node: PermissionNode, q: string): boolean {
  if (!q) return true;
  if (node.label.toLowerCase().includes(q) || node.key.toLowerCase().includes(q)) {
    return true;
  }
  return (node.children || []).some((c) => nodeMatchesSearch(c, q));
}

function PermissionTreeNode({
  node,
  selected,
  onToggle,
  search,
  depth = 0,
}: {
  node: PermissionNode;
  selected: Set<string>;
  onToggle: (keys: string[], checked: boolean) => void;
  search: string;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 1);
  const childKeys = useMemo(() => collectKeys(node), [node]);
  const allSelected = childKeys.every((k) => selected.has(k));
  const someSelected = !allSelected && childKeys.some((k) => selected.has(k));
  const hasChildren = (node.children || []).length > 0;

  if (!nodeMatchesSearch(node, search)) return null;

  return (
    <div className={cn("border-l border-border/60", depth > 0 && "ml-3")}>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/40 rounded-md"
        style={{ paddingLeft: 8 + depth * 4 }}
      >
        {hasChildren ? (
          <button
            type="button"
            className="p-0.5 text-muted-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        <Checkbox
          checked={allSelected ? true : someSelected ? "indeterminate" : false}
          onCheckedChange={(v) => onToggle(childKeys, v === true)}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{node.label}</div>
          <div className="text-[10px] text-muted-foreground truncate">{node.key}</div>
        </div>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {node.kind}
        </span>
      </div>
      {open &&
        hasChildren &&
        (node.children || []).map((child) => (
          <PermissionTreeNode
            key={child.key}
            node={child}
            selected={selected}
            onToggle={onToggle}
            search={search}
            depth={depth + 1}
          />
        ))}
    </div>
  );
}

export const RolesPermissionsTab = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [permSearch, setPermSearch] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });

  const selectedSet = useMemo(() => new Set(formData.permissions), [formData.permissions]);
  const isAdminRole = (editingRole?.name || formData.name).trim().toLowerCase() === "admin";
  const validKeys = useMemo(() => getValidPermissionSet(), []);

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

  const openCreate = () => {
    setEditingRole(null);
    setFormData({ name: "", description: "", permissions: [] });
    setPermSearch("");
    setIsDialogOpen(true);
  };

  const openEdit = (role: Role) => {
    setEditingRole(role);
    const perms = role.permissions?.includes("*")
      ? ["*"]
      : (role.permissions || []).filter((k) => validKeys.has(k) || k === "*");
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: perms,
    });
    setPermSearch("");
    setIsDialogOpen(true);
  };

  const toggleKeys = (keys: string[], checked: boolean) => {
    setFormData((prev) => {
      if (prev.permissions.includes("*") && prev.name.trim().toLowerCase() === "admin") {
        return prev;
      }
      const next = new Set(prev.permissions.filter((k) => k !== "*"));
      if (checked) {
        expandPermissionAncestors(keys).forEach((k) => next.add(k));
      } else {
        keys.forEach((k) => next.delete(k));
      }
      return { ...prev, permissions: [...next] };
    });
  };

  const selectAllCatalog = () => {
    const all = PERMISSION_CATALOG.flatMap(collectKeys);
    setFormData((prev) => ({ ...prev, permissions: all }));
  };

  const clearAll = () => {
    if (isAdminRole) {
      setFormData((prev) => ({ ...prev, permissions: ["*"] }));
      return;
    }
    setFormData((prev) => ({ ...prev, permissions: [] }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter role name");
      return;
    }

    const permissions =
      formData.name.trim().toLowerCase() === "admin"
        ? ["*"]
        : expandPermissionAncestors(formData.permissions.filter((k) => k !== "*"));

    try {
      if (editingRole) {
        const response = await apiClient.updateRole(editingRole.id, {
          name: formData.name.trim(),
          description: formData.description,
          permissions,
        });
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("Role updated successfully. Affected users will see changes after refresh (or switch tabs).");
          setIsDialogOpen(false);
          setEditingRole(null);
          fetchRoles();
        }
      } else {
        const response = await apiClient.createRole({
          name: formData.name.trim(),
          description: formData.description,
          permissions,
        });
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("Role created successfully");
          setIsDialogOpen(false);
          fetchRoles();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save role");
    }
  };

  const handleDelete = async (role: Role) => {
    if (role.type === "System" || role.name.trim().toLowerCase() === "admin") {
      toast.error("System roles cannot be deleted");
      return;
    }
    if (!confirm(`Delete role "${role.name}"?`)) return;
    try {
      const response = await apiClient.deleteRole(role.id);
      if (response.error) toast.error(response.error);
      else {
        toast.success("Role deleted");
        fetchRoles();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete role");
    }
  };

  const exportCsv = () => {
    const rows = [
      ["Name", "Type", "Users", "Permissions"],
      ...roles.map((r) => [
        r.name,
        r.type,
        String(r.usersCount || 0),
        (r.permissions || []).join("|"),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roles-permissions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Roles & Permissions
          </h2>
          <p className="text-sm text-muted-foreground">
            Control modules, pages, form fields, and actions per role
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" />
                New Role
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle>{editingRole ? "Edit Role" : "Create Role"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Role Name</Label>
                    <Input
                      value={formData.name}
                      disabled={editingRole?.type === "System"}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Branch Manager"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      placeholder="Short description"
                    />
                  </div>
                </div>

                {isAdminRole ? (
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
                    Admin has full access (<code>*</code>). Permission matrix is locked.
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
                        <Input
                          className="pl-7 h-9"
                          placeholder="Search permissions..."
                          value={permSearch}
                          onChange={(e) => setPermSearch(e.target.value.toLowerCase())}
                        />
                      </div>
                      <Button type="button" variant="outline" size="sm" onClick={selectAllCatalog}>
                        Select all
                      </Button>
                      <Button type="button" variant="ghost" size="sm" onClick={clearAll}>
                        Clear
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {formData.permissions.length} selected
                      </span>
                    </div>
                    <div className="border rounded-md max-h-[48vh] overflow-y-auto p-2 bg-background">
                      {PERMISSION_CATALOG.map((mod) => (
                        <PermissionTreeNode
                          key={mod.key}
                          node={mod}
                          selected={selectedSet}
                          onToggle={toggleKeys}
                          search={permSearch}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSubmit}>
                  {editingRole ? "Save Changes" : "Create Role"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {roles.map((role, idx) => {
            const color = roleColors[idx % roleColors.length];
            const permCount = role.permissions?.includes("*")
              ? "All"
              : String(role.permissions?.length || 0);
            return (
              <Card key={role.id} className={cn("border", color)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <Key className="w-4 h-4" />
                        {role.name}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {role.description || "No description"}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase font-medium px-2 py-0.5 rounded bg-background/80">
                      {role.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {role.usersCount || 0} users
                    </span>
                    <span>{permCount} permissions</span>
                  </div>
                  <div className="flex gap-1 justify-end">
                    <ActionButtonTooltip label="Edit">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(role)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                    </ActionButtonTooltip>
                    <ActionButtonTooltip label="Delete">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => handleDelete(role)}
                        disabled={role.type === "System" || role.name.toLowerCase() === "admin"}
                      >
                        <Trash className="w-4 h-4" />
                      </Button>
                    </ActionButtonTooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
