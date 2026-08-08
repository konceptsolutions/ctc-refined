import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Mail, Store, User, ArrowRight, ShieldCheck } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { saveAuth, isAuthenticated, getUserRole } from "@/utils/auth";
import { canAccessPath, getFirstAllowedPath, parsePermissions } from "@/permissions/can";
import { getPresetPermissions, looksLikeCatalogPermissions, ensurePageKeysForGrants } from "@/permissions/catalog";

const Login = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [adminEmail, setAdminEmail] = useState("");
    const [adminPassword, setAdminPassword] = useState("");
    const [storeEmail, setStoreEmail] = useState("");
    const [storePassword, setStorePassword] = useState("");
    const [activeRoleTab, setActiveRoleTab] = useState<"admin" | "store">("admin");
    const [forgotDialogOpen, setForgotDialogOpen] = useState(false);
    const [forgotIdentifier, setForgotIdentifier] = useState("");
    const [forgotNewPassword, setForgotNewPassword] = useState("");
    const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
    const [forgotRole, setForgotRole] = useState<"admin" | "store">("admin");
    const [forgotLoading, setForgotLoading] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();

    // Redirect if already authenticated
    useEffect(() => {
        if (isAuthenticated()) {
            const userRole = getUserRole();
            const from = (location.state as any)?.from?.pathname as string | undefined;

            if (userRole === 'store') {
                navigate("/inventory/current-stock", { replace: true });
                return;
            }

            const target =
                from && from !== "/login" && canAccessPath(from)
                    ? from
                    : getFirstAllowedPath();

            if (target && target !== "/login") {
                navigate(target, { replace: true });
            }
        }
    }, [navigate, location]);

    const handleLogin = async (role: 'admin' | 'store') => {
        setIsLoading(true);

        try {
            const email = role === 'admin' ? adminEmail : storeEmail;
            const password = role === 'admin' ? adminPassword : storePassword;

            if (!email || !password) {
                toast.error("Please enter both email and password");
                setIsLoading(false);
                return;
            }

            const response: any = await apiClient.login({ email, password });

            if (response.error) {
                throw new Error(response.error);
            }

            // Save authentication with the token from backend
            if (response.token) {
                const backendRoleName = (response.user?.role || "").toString().trim();
                const roleKey = backendRoleName.toLowerCase();
                const effectiveRole: 'admin' | 'store' = roleKey === "store user" ? "store" : "admin";

                let permissions = parsePermissions(response.user?.permissions);
                const catalogKeys = permissions.filter(
                    (k) =>
                        k === "*" ||
                        k.startsWith("module.") ||
                        k.startsWith("page.") ||
                        k.startsWith("action.") ||
                        k.startsWith("field.") ||
                        k.startsWith("section."),
                );
                if (catalogKeys.length > 0) {
                    permissions = ensurePageKeysForGrants(catalogKeys);
                } else if (!permissions.length || !looksLikeCatalogPermissions(permissions)) {
                    const presets = getPresetPermissions(backendRoleName);
                    if (presets.length) permissions = presets;
                }

                saveAuth(effectiveRole, response.token, {
                    loginStartTime: response.user?.loginStartTime ?? null,
                    loginEndTime: response.user?.loginEndTime ?? null,
                }, permissions);

                const roleLabel =
                    roleKey === "admin"
                        ? "Administrator"
                        : roleKey === "store user"
                          ? "Store"
                          : backendRoleName || "User";
                toast.success(`Login Successful - ${roleLabel} Access Granted`);

                // Prefer previous page only when this role can actually open it
                const from = (location.state as any)?.from?.pathname as string | undefined;
                let target =
                    from && from !== "/login" && canAccessPath(from, permissions)
                        ? from
                        : getFirstAllowedPath(permissions);

                if (effectiveRole === "store") {
                    target = "/inventory/current-stock";
                }

                if (!target || target === "/login") {
                    toast.error(
                        "Your account has no page access configured. Ask an admin to set role permissions.",
                    );
                    return;
                }

                navigate(target, { replace: true });
            } else {
                throw new Error("Login failed: No token received");
            }
        } catch (error: any) {
            console.error("Login catch error:", error);
            toast.error(error.message || "Invalid credentials. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const openForgotPasswordDialog = (role: "admin" | "store") => {
        setForgotRole(role);
        setForgotIdentifier(role === "admin" ? adminEmail : storeEmail);
        setForgotNewPassword("");
        setForgotConfirmPassword("");
        setForgotDialogOpen(true);
    };

    const handleForgotPassword = async () => {
        const identifier = String(forgotIdentifier || "").trim();
        const newPassword = String(forgotNewPassword || "");
        const confirmPassword = String(forgotConfirmPassword || "");

        if (!identifier || !newPassword || !confirmPassword) {
            toast.error("Please fill all fields");
            return;
        }
        if (newPassword.length < 6) {
            toast.error("New password must be at least 6 characters");
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error("New password and confirm password do not match");
            return;
        }

        setForgotLoading(true);
        try {
            const response: any = await apiClient.forgotPassword({
                identifier,
                newPassword,
                role: forgotRole,
            });
            if (response?.error) {
                throw new Error(response.error);
            }

            toast.success("Password updated successfully");
            setForgotDialogOpen(false);

            if (forgotRole === "admin") {
                setAdminEmail(identifier);
                setAdminPassword("");
            } else {
                setStoreEmail(identifier);
                setStorePassword("");
            }
        } catch (error: any) {
            toast.error(error?.message || "Failed to update password");
        } finally {
            setForgotLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center relative overflow-hidden font-sans">
            {/* Background Image with Overlay */}
            <div
                className="absolute inset-0 z-0 scale-105 animate-pulse-slow"
                style={{
                    backgroundImage: 'url("/login-bg.png")',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                }}
            />
            <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-950/90 via-slate-900/70 to-primary/20 backdrop-blur-[2px]" />

            {/* Animated Background Shapes */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] animate-float" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/10 blur-[120px] animate-float-delayed" />

            <div className="z-10 w-full max-w-[440px] px-6 py-12">
                <div className="text-center mb-10 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-primary mb-6 shadow-2xl shadow-primary/40 ring-4 ring-white/10 group hover:scale-110 transition-transform duration-500">
                        <ShieldCheck className="w-10 h-10 text-white" />
                    </div>
                </div>

                <Card className="border-white/10 shadow-3xl bg-slate-900/40 backdrop-blur-2xl backdrop-saturate-150 animate-slide-up overflow-hidden">
                    <Tabs
                        value={activeRoleTab}
                        onValueChange={(value) => setActiveRoleTab(value as "admin" | "store")}
                        className="w-full"
                    >
                        <CardHeader className="pb-0 text-center">
                            <TabsList className="grid w-full grid-cols-2 mb-6 p-1 bg-slate-800/50 border border-white/5 rounded-xl">
                                <TabsTrigger
                                    value="admin"
                                    className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all duration-300"
                                >
                                    <User className="w-4 h-4 mr-2" />
                                    Admin
                                </TabsTrigger>
                                <TabsTrigger
                                    value="store"
                                    className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-white transition-all duration-300"
                                >
                                    <Store className="w-4 h-4 mr-2" />
                                    Store
                                </TabsTrigger>
                            </TabsList>
                            <CardTitle className="text-2xl font-bold text-white mb-1">Welcome back</CardTitle>
                            <CardDescription className="text-slate-400">
                                Please enter your details to continue
                            </CardDescription>
                        </CardHeader>

                        <TabsContent value="admin" className="mt-0">
                            <form onSubmit={(e) => { e.preventDefault(); handleLogin('admin'); }}>
                                <CardContent className="space-y-5 pt-8">
                                    <div className="space-y-2.5">
                                        <Label htmlFor="admin-email" className="text-slate-200 ml-1">Email or Username</Label>
                                        <div className="relative group">
                                            <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
                                            <Input
                                                id="admin-email"
                                                type="email"
                                                placeholder="Enter email"
                                                value={adminEmail}
                                                onChange={(e) => setAdminEmail(e.target.value)}
                                                className="pl-11 h-12 bg-slate-800/40 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary focus-visible:bg-slate-800/60 transition-all rounded-xl"
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between ml-1">
                                            <Label htmlFor="admin-password" title="Password" className="text-slate-200">Password</Label>
                                            <button
                                                type="button"
                                                onClick={() => openForgotPasswordDialog("admin")}
                                                className="text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
                                            >
                                                Forgot password?
                                            </button>
                                        </div>
                                        <div className="relative group">
                                            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
                                            <Input
                                                id="admin-password"
                                                type="password"
                                                placeholder="••••••••"
                                                value={adminPassword}
                                                onChange={(e) => setAdminPassword(e.target.value)}
                                                className="pl-11 h-12 bg-slate-800/40 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary focus-visible:bg-slate-800/60 transition-all rounded-xl"
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex flex-col pt-4 pb-10">
                                    <Button
                                        type="submit"
                                        className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Authenticating...
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                Sign In <ArrowRight className="w-5 h-5" />
                                            </div>
                                        )}
                                    </Button>
                                </CardFooter>
                            </form>
                        </TabsContent>

                        <TabsContent value="store" className="mt-0">
                            <form onSubmit={(e) => { e.preventDefault(); handleLogin('store'); }}>
                                <CardContent className="space-y-5 pt-8">
                                    <div className="space-y-2.5">
                                        <Label htmlFor="store-email" className="text-slate-200 ml-1">Store Email</Label>
                                        <div className="relative group">
                                            <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
                                            <Input
                                                id="store-email"
                                                type="email"
                                                placeholder="store@koncepts.com"
                                                value={storeEmail}
                                                onChange={(e) => setStoreEmail(e.target.value)}
                                                className="pl-11 h-12 bg-slate-800/40 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary focus-visible:bg-slate-800/60 transition-all rounded-xl"
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-2.5">
                                        <div className="flex items-center justify-between ml-1">
                                            <Label htmlFor="store-password" title="Access PIN" className="text-slate-200">Access PIN</Label>
                                            <button
                                                type="button"
                                                onClick={() => openForgotPasswordDialog("store")}
                                                className="text-xs text-primary hover:text-primary/80 transition-colors font-semibold"
                                            >
                                                Forgot password?
                                            </button>
                                        </div>
                                        <div className="relative group">
                                            <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400 transition-colors group-focus-within:text-primary" />
                                            <Input
                                                id="store-password"
                                                type="password"
                                                placeholder="••••••••"
                                                value={storePassword}
                                                onChange={(e) => setStorePassword(e.target.value)}
                                                className="pl-11 h-12 bg-slate-800/40 border-white/10 text-white placeholder:text-slate-500 focus-visible:ring-primary focus-visible:bg-slate-800/60 transition-all rounded-xl"
                                                required
                                                disabled={isLoading}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="flex flex-col pt-4 pb-10">
                                    <Button
                                        type="submit"
                                        className="w-full h-12 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-xl shadow-primary/20 rounded-xl transition-all duration-300 transform hover:scale-[1.02] active:scale-95"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <div className="flex items-center gap-3">
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Authenticating...
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                Access Store <ArrowRight className="w-5 h-5" />
                                            </div>
                                        )}
                                    </Button>
                                </CardFooter>
                            </form>
                        </TabsContent>
                    </Tabs>
                </Card>
            </div>

            <Dialog open={forgotDialogOpen} onOpenChange={setForgotDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Change password</DialogTitle>
                        <DialogDescription>
                            Enter your email/username and set a new password for{" "}
                            {forgotRole === "admin" ? "Admin" : "Store"} login.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="forgot-identifier">Email or Username</Label>
                            <Input
                                id="forgot-identifier"
                                value={forgotIdentifier}
                                onChange={(e) => setForgotIdentifier(e.target.value)}
                                placeholder="Enter email or username"
                                disabled={forgotLoading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="forgot-new-password">New Password</Label>
                            <Input
                                id="forgot-new-password"
                                type="password"
                                value={forgotNewPassword}
                                onChange={(e) => setForgotNewPassword(e.target.value)}
                                placeholder="Enter new password"
                                disabled={forgotLoading}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="forgot-confirm-password">Confirm Password</Label>
                            <Input
                                id="forgot-confirm-password"
                                type="password"
                                value={forgotConfirmPassword}
                                onChange={(e) => setForgotConfirmPassword(e.target.value)}
                                placeholder="Confirm new password"
                                disabled={forgotLoading}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setForgotDialogOpen(false)}
                            disabled={forgotLoading}
                        >
                            Cancel
                        </Button>
                        <Button onClick={handleForgotPassword} disabled={forgotLoading}>
                            {forgotLoading ? "Updating..." : "Update Password"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <div className="absolute bottom-4 left-0 right-0 z-10 text-center text-xs text-white/70 px-4">
                <span className="font-medium text-white/90">CTC Crystal Trading Platform</span>
                <span className="mx-1.5">·</span>
                Powered by <span className="font-medium text-white/90">Knocept Solutions</span>
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1.05); opacity: 0.9; }
          50% { transform: scale(1.0); opacity: 1; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-30px) scale(1.05); }
        }
        @keyframes float-delayed {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(30px) scale(0.95); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-up {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-pulse-slow { animation: pulse-slow 20s ease-in-out infinite; }
        .animate-float { animation: float 15s ease-in-out infinite; }
        .animate-float-delayed { animation: float-delayed 18s ease-in-out infinite; }
        .animate-fade-in { animation: fade-in 1s ease-out forwards; }
        .animate-slide-up { animation: slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .shadow-glow-primary { box-shadow: 0 0 15px 2px hsl(var(--primary) / 40%); }
      `}} />
        </div>
    );
};

export default Login;
