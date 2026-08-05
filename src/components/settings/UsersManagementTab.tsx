import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Users,
  UserCheck,
  Shield,
  UserX,
  Plus,
  Search,
  Edit,
  Trash,
  KeyRound,
  Clock,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import apiClient from "@/lib/api";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "active" | "inactive";
  lastLogin: string;
  loginStartTime?: string | null;
  loginEndTime?: string | null;
  createdAt: string;
}

interface RoleOption {
  id: string;
  name: string;
}

const roleColors: Record<string, string> = {
  Admin: "bg-violet-100 text-violet-700 border-violet-200",
  Manager: "bg-blue-100 text-blue-700 border-blue-200",
  Staff: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Accountant: "bg-primary/15 text-primary border-primary/20",
  Sales: "bg-amber-100 text-amber-700 border-amber-200",
  "Store User": "bg-cyan-100 text-cyan-700 border-cyan-200",
  Viewer: "bg-gray-100 text-gray-700 border-gray-200",
};

const isAdminRole = (role: string) => role.trim().toLowerCase() === "admin";

const emptyForm = (defaultRole = "Manager") => ({
  name: "",
  email: "",
  role: defaultRole,
  status: "active" as "active" | "inactive",
  password: "",
});

export const UsersManagementTab = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState(emptyForm());
  const [passwordUser, setPasswordUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [hoursUser, setHoursUser] = useState<User | null>(null);
  const [loginStartTime, setLoginStartTime] = useState("");
  const [loginEndTime, setLoginEndTime] = useState("");
  const [savingHours, setSavingHours] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const assignableRoles = useMemo(
    () => roles.filter((r) => !isAdminRole(r.name)),
    [roles],
  );

  const defaultAssignableRole = assignableRoles[0]?.name || "Manager";

  const fetchRoles = async () => {
    try {
      const response = await apiClient.getRoles();
      if (!response.error && Array.isArray(response.data)) {
        setRoles(
          response.data.map((r: any) => ({
            id: r.id,
            name: r.name,
          })),
        );
      }
    } catch {
      // Keep empty; form will fall back to seeded names if needed
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params: any = {
        page,
        limit,
      };
      if (searchQuery) params.search = searchQuery;
      if (roleFilter !== "all") params.role = roleFilter;
      if (statusFilter !== "all") params.status = statusFilter;

      const response = await apiClient.getUsers(params);
      if (response.error) {
        toast.error(response.error);
      } else {
        setUsers(response.data || []);
        if (response.pagination) {
          setTotal(response.pagination.total);
          setTotalPages(response.pagination.totalPages);
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [page, roleFilter, statusFilter]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 1) {
        fetchUsers();
      } else {
        setPage(1);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const stats = {
    total: total,
    active: users.filter((u) => u.status === "active").length,
    admins: users.filter((u) => isAdminRole(u.role)).length,
    inactive: users.filter((u) => u.status === "inactive").length,
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Name", "Email", "Role", "Status", "Last Login", "Created At"],
      ...users.map((user) => [
        user.name,
        user.email,
        user.role,
        user.status,
        user.lastLogin,
        user.createdAt,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users_export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Users exported successfully");
  };

  const openAddDialog = () => {
    setEditingUser(null);
    setFormData(emptyForm(defaultAssignableRole));
    setIsDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.name || !formData.email) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!editingUser && isAdminRole(formData.role)) {
      toast.error("Admin accounts cannot be created here. Choose another role.");
      return;
    }

    try {
      if (editingUser) {
        const payload: any = {
          name: formData.name,
          email: formData.email,
          status: formData.status,
        };
        // Do not send Admin role assignment for non-admin users
        if (!isAdminRole(editingUser.role)) {
          if (isAdminRole(formData.role)) {
            toast.error("Users cannot be promoted to Admin.");
            return;
          }
          payload.role = formData.role;
        }

        const response = await apiClient.updateUser(editingUser.id, payload);
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("User updated successfully");
          setIsDialogOpen(false);
          setEditingUser(null);
          setFormData(emptyForm(defaultAssignableRole));
          fetchUsers();
        }
      } else {
        if (!formData.password) {
          toast.error("Password is required for new users");
          return;
        }
        if (formData.password.length < 6) {
          toast.error("Password must be at least 6 characters");
          return;
        }
        const response = await apiClient.createUser({
          name: formData.name,
          email: formData.email,
          role: formData.role,
          status: formData.status,
          password: formData.password,
        });
        if (response.error) {
          toast.error(response.error);
        } else {
          toast.success("User added successfully");
          setIsDialogOpen(false);
          setFormData(emptyForm(defaultAssignableRole));
          fetchUsers();
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save user");
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      password: "",
    });
    setIsDialogOpen(true);
  };

  const openChangePassword = (user: User) => {
    setPasswordUser(user);
    setNewPassword("");
    setConfirmPassword("");
  };

  const openLoginHours = (user: User) => {
    setHoursUser(user);
    setLoginStartTime(user.loginStartTime || "");
    setLoginEndTime(user.loginEndTime || "");
  };

  const handleSaveLoginHours = async () => {
    if (!hoursUser) return;
    const start = loginStartTime.trim();
    const end = loginEndTime.trim();
    if ((start && !end) || (!start && end)) {
      toast.error("Enter both start and end time, or clear both.");
      return;
    }
    if (start && end && start === end) {
      toast.error("Start and end time cannot be the same.");
      return;
    }

    try {
      setSavingHours(true);
      const response = await apiClient.updateUser(hoursUser.id, {
        loginStartTime: start || null,
        loginEndTime: end || null,
      });
      if (response.error) {
        toast.error(response.error);
        return;
      }
      toast.success(
        start && end
          ? `Login hours set to ${start} – ${end}`
          : "Login hours cleared",
      );
      setHoursUser(null);
      fetchUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to update login hours");
    } finally {
      setSavingHours(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordUser) return;
    if (!newPassword || newPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    try {
      setSavingPassword(true);
      const response = await apiClient.updateUser(passwordUser.id, {
        password: newPassword,
      });
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success(`Password updated for ${passwordUser.name}`);
        setPasswordUser(null);
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to change password");
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this user?")) return;

    try {
      const response = await apiClient.deleteUser(id);
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success("User deleted successfully");
        fetchUsers();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  const roleOptionsForForm = editingUser && isAdminRole(editingUser.role)
    ? roles.filter((r) => isAdminRole(r.name))
    : assignableRoles.length > 0
      ? assignableRoles
      : [
          { id: "Manager", name: "Manager" },
          { id: "Accountant", name: "Accountant" },
          { id: "Sales", name: "Sales" },
          { id: "Store User", name: "Store User" },
          { id: "Staff", name: "Staff" },
          { id: "Viewer", name: "Viewer" },
        ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Total Users</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Users className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Active Users</p>
              <p className="text-2xl font-bold">{stats.active}</p>
            </div>
            <UserCheck className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Admins</p>
              <p className="text-2xl font-bold">{stats.admins}</p>
            </div>
            <Shield className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-red-500 to-red-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Inactive</p>
              <p className="text-2xl font-bold">{stats.inactive}</p>
            </div>
            <UserX className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {roles.map((role) => (
                <SelectItem key={role.id} value={role.name}>
                  {role.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
            <Download className="w-4 h-4" />
            Export CSV
          </Button>
          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingUser(null);
                setFormData(emptyForm(defaultAssignableRole));
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={openAddDialog}>
                <Plus className="w-4 h-4" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingUser ? "Edit User" : "Add New User"}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Enter name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) =>
                      setFormData({ ...formData, email: e.target.value })
                    }
                    placeholder="Enter email"
                  />
                </div>
                {!editingUser && (
                  <div className="space-y-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, password: e.target.value })
                      }
                      placeholder="Min. 6 characters"
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select
                      value={formData.role}
                      onValueChange={(v) =>
                        setFormData({ ...formData, role: v })
                      }
                      disabled={
                        !!(editingUser && isAdminRole(editingUser.role))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptionsForForm.map((role) => (
                          <SelectItem key={role.id} value={role.name}>
                            {role.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!editingUser && (
                      <p className="text-xs text-muted-foreground">
                        Admin role is not available when creating users.
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={formData.status}
                      onValueChange={(v) =>
                        setFormData({
                          ...formData,
                          status: v as "active" | "inactive",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit}>
                    {editingUser ? "Update" : "Add"} User
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Dialog
        open={!!passwordUser}
        onOpenChange={(open) => {
          if (!open) {
            setPasswordUser(null);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Set a new password for{" "}
              <span className="font-medium text-foreground">
                {passwordUser?.name}
              </span>{" "}
              ({passwordUser?.role}).
            </p>
            <div className="space-y-2">
              <Label htmlFor="new-password">New Password *</Label>
              <Input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password *</Label>
              <Input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setPasswordUser(null)}
                disabled={savingPassword}
              >
                Cancel
              </Button>
              <Button onClick={handleChangePassword} disabled={savingPassword}>
                {savingPassword ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <KeyRound className="w-4 h-4 mr-2" />
                )}
                Update Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!hoursUser}
        onOpenChange={(open) => {
          if (!open) {
            setHoursUser(null);
            setLoginStartTime("");
            setLoginEndTime("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Login Hours</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <p className="text-sm text-muted-foreground">
              Restrict{" "}
              <span className="font-medium text-foreground">
                {hoursUser?.name}
              </span>{" "}
              to sign in only during these hours (Pakistan time). Leave both
              empty to allow login at any time. The user will be logged out
              automatically when the end time is reached.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="login-start-time">Start Time</Label>
                <Input
                  id="login-start-time"
                  type="time"
                  value={loginStartTime}
                  onChange={(e) => setLoginStartTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-end-time">End Time</Label>
                <Input
                  id="login-end-time"
                  type="time"
                  value={loginEndTime}
                  onChange={(e) => setLoginEndTime(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setLoginStartTime("");
                  setLoginEndTime("");
                }}
                disabled={savingHours}
              >
                Clear
              </Button>
              <Button
                variant="outline"
                onClick={() => setHoursUser(null)}
                disabled={savingHours}
              >
                Cancel
              </Button>
              <Button onClick={handleSaveLoginHours} disabled={savingHours}>
                {savingHours ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Clock className="w-4 h-4 mr-2" />
                )}
                Save Hours
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <ListNumberHeader />
                <TableHead>USER</TableHead>
                <TableHead>EMAIL</TableHead>
                <TableHead>ROLE</TableHead>
                <TableHead>STATUS</TableHead>
                <TableHead>LAST LOGIN</TableHead>
                <TableHead className="text-right">ACTIONS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user, index) => (
                  <TableRow key={user.id}>
                    <ListNumberCell
                      index={index}
                      page={page}
                      pageSize={limit}
                      total={total}
                    />
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9">
                          <AvatarFallback
                            className={`text-xs ${roleColors[user.role] || "bg-gray-100"}`}
                          >
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{user.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Created: {user.createdAt}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{user.email}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={roleColors[user.role] || ""}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div
                          className={`w-2 h-2 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-gray-400"}`}
                        />
                        <span className="text-sm capitalize">{user.status}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{user.lastLogin}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <ActionButtonTooltip label="Change Password" variant="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openChangePassword(user)}
                          >
                            <KeyRound className="w-4 h-4" />
                          </Button>
                        </ActionButtonTooltip>
                        {!isAdminRole(user.role) && (
                          <ActionButtonTooltip
                            label={
                              user.loginStartTime && user.loginEndTime
                                ? `Login Hours (${user.loginStartTime} – ${user.loginEndTime})`
                                : "Set Login Hours"
                            }
                            variant="edit"
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openLoginHours(user)}
                            >
                              <Clock className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                        )}
                        <ActionButtonTooltip label="Edit" variant="edit">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEdit(user)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                        </ActionButtonTooltip>
                        {!isAdminRole(user.role) && (
                          <ActionButtonTooltip label="Delete" variant="delete">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive"
                              onClick={() => handleDelete(user.id)}
                            >
                              <Trash className="w-4 h-4" />
                            </Button>
                          </ActionButtonTooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of{" "}
          {total} users
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="px-3">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
