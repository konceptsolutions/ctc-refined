import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Building2,
  Settings,
  FileText,
  Bell,
  Upload,
  ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api";

type SubTab = "company" | "system" | "invoice" | "notifications";

interface CompanyInfo {
  name: string;
  legalName: string;
  email: string;
  phone: string;
  fax: string;
  website: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
  taxId: string;
  registrationNo: string;
}

interface SystemSettings {
  dateFormat: string;
  timeFormat: string;
  currency: string;
  timezone: string;
  language: string;
  fiscalYearStart: string;
}

interface InvoiceSettings {
  prefix: string;
  startingNumber: number;
  footer: string;
  termsConditions: string;
  showLogo: boolean;
  showTaxBreakdown: boolean;
}

interface NotificationSettings {
  emailNotifications: boolean;
  lowStockAlerts: boolean;
  orderUpdates: boolean;
  paymentReminders: boolean;
  dailyReports: boolean;
  weeklyReports: boolean;
}

export const CompanyProfileTab = () => {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>("company");

  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "",
    legalName: "",
    email: "",
    phone: "",
    fax: "",
    website: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    taxId: "",
    registrationNo: "",
  });

  const [systemSettings, setSystemSettings] = useState<SystemSettings>({
    dateFormat: "DD-MM-YYYY",
    timeFormat: "24h",
    currency: "PKR",
    timezone: "Asia/Karachi",
    language: "English",
    fiscalYearStart: "January",
  });

  const [invoiceSettings, setInvoiceSettings] = useState<InvoiceSettings>({
    prefix: "",
    startingNumber: 1001,
    footer: "Thank you for your business!",
    termsConditions: "Payment is due within 30 days. Late payments may incur additional charges.",
    showLogo: true,
    showTaxBreakdown: true,
  });

  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>({
    emailNotifications: true,
    lowStockAlerts: true,
    orderUpdates: true,
    paymentReminders: true,
    dailyReports: false,
    weeklyReports: true,
  });

  const subTabs = [
    { id: "company" as const, label: "Company Info", icon: Building2 },
    { id: "system" as const, label: "System Settings", icon: Settings },
    { id: "invoice" as const, label: "Invoice Settings", icon: FileText },
    { id: "notifications" as const, label: "Notifications", icon: Bell },
  ];

  useEffect(() => {
    const fetchCompanyProfile = async () => {
      try {
        const response = await apiClient.getCompanyProfile() as any;
        if (response.error) {
        } else if (response.data) {
          const data = response.data;

          // Safely merge companyInfo with defaults, ensuring all string fields are never undefined
          if (data.companyInfo) {
            setCompanyInfo({
              name: data.companyInfo.name || "",
              legalName: data.companyInfo.legalName || "",
              email: data.companyInfo.email || "",
              phone: data.companyInfo.phone || "",
              fax: data.companyInfo.fax || "",
              website: data.companyInfo.website || "",
              address: data.companyInfo.address || "",
              city: data.companyInfo.city || "",
              state: data.companyInfo.state || "",
              country: data.companyInfo.country || "",
              postalCode: data.companyInfo.postalCode || "",
              taxId: data.companyInfo.taxId || "",
              registrationNo: data.companyInfo.registrationNo || "",
            });
          }

          // Safely merge systemSettings with defaults
          if (data.systemSettings) {
            setSystemSettings({
              dateFormat: data.systemSettings.dateFormat || "DD-MM-YYYY",
              timeFormat: data.systemSettings.timeFormat || "24h",
              currency: data.systemSettings.currency || "PKR",
              timezone: data.systemSettings.timezone || "Asia/Karachi",
              language: data.systemSettings.language || "English",
              fiscalYearStart: data.systemSettings.fiscalYearStart || "January",
            });
          }

          // Safely merge invoiceSettings with defaults
          if (data.invoiceSettings) {
            setInvoiceSettings({
              prefix: data.invoiceSettings.prefix ?? "",
              startingNumber: data.invoiceSettings.startingNumber ?? 1001,
              footer: data.invoiceSettings.footer || "",
              termsConditions: data.invoiceSettings.termsConditions || "",
              showLogo: data.invoiceSettings.showLogo ?? true,
              showTaxBreakdown: data.invoiceSettings.showTaxBreakdown ?? true,
            });
          }

          // Safely merge notificationSettings with defaults
          if (data.notificationSettings) {
            setNotificationSettings({
              emailNotifications: data.notificationSettings.emailNotifications ?? true,
              lowStockAlerts: data.notificationSettings.lowStockAlerts ?? true,
              orderUpdates: data.notificationSettings.orderUpdates ?? true,
              paymentReminders: data.notificationSettings.paymentReminders ?? true,
              dailyReports: data.notificationSettings.dailyReports ?? false,
              weeklyReports: data.notificationSettings.weeklyReports ?? true,
            });
          }
        }
      } catch (error: any) {
      }
    };
    fetchCompanyProfile();
  }, []);

  const handleSave = async () => {
    try {
      const response = await apiClient.updateCompanyProfile({
        companyInfo,
        systemSettings,
        invoiceSettings,
        notificationSettings,
      }) as any;
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success("Settings saved successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save settings");
    }
  };

  return (
    <div className="flex gap-6">
      {/* Sidebar */}
      <Card className="w-64 shrink-0 h-fit">
        <CardContent className="p-2">
          {subTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                activeSubTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </CardContent>
      </Card>

      {/* Content */}
      <Card className="flex-1">
        <CardContent className="p-6">
          {activeSubTab === "company" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Company Information</h2>
                <p className="text-sm text-muted-foreground">Manage your company's basic information and branding</p>
              </div>

              {/* Logo Upload */}
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 border-2 border-dashed border-muted-foreground/25 rounded-lg flex items-center justify-center bg-muted/30">
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="font-medium">Company Logo</h3>
                  <p className="text-sm text-muted-foreground mb-2">PNG, JPG up to 2MB. Recommended: 200x200px</p>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Logo
                  </Button>
                </div>
              </div>

              {/* Form Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Company Name *</Label>
                  <Input
                    value={companyInfo.name}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Legal Name</Label>
                  <Input
                    value={companyInfo.legalName}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, legalName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email Address *</Label>
                  <Input
                    type="email"
                    value={companyInfo.email}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone Number *</Label>
                  <Input
                    value={companyInfo.phone}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fax Number</Label>
                  <Input
                    value={companyInfo.fax}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, fax: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Website</Label>
                  <Input
                    value={companyInfo.website}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, website: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address *</Label>
                  <Input
                    value={companyInfo.address}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>City *</Label>
                  <Input
                    value={companyInfo.city}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, city: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>State/Province</Label>
                  <Input
                    value={companyInfo.state}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, state: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Country</Label>
                  <Input
                    value={companyInfo.country}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, country: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Postal Code</Label>
                  <Input
                    value={companyInfo.postalCode}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, postalCode: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tax ID / NTN</Label>
                  <Input
                    value={companyInfo.taxId}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, taxId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Registration No.</Label>
                  <Input
                    value={companyInfo.registrationNo}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, registrationNo: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeSubTab === "system" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">System Settings</h2>
                <p className="text-sm text-muted-foreground">Configure regional and display preferences</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date Format</Label>
                  <Select value={systemSettings.dateFormat} onValueChange={(v) => setSystemSettings({ ...systemSettings, dateFormat: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DD-MM-YYYY">DD-MM-YYYY</SelectItem>
                      <SelectItem value="MM-DD-YYYY">MM-DD-YYYY</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Time Format</Label>
                  <Select value={systemSettings.timeFormat} onValueChange={(v) => setSystemSettings({ ...systemSettings, timeFormat: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="12h">12 Hour</SelectItem>
                      <SelectItem value="24h">24 Hour</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select value={systemSettings.currency} onValueChange={(v) => setSystemSettings({ ...systemSettings, currency: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PKR">PKR - Pakistani Rupee</SelectItem>
                      <SelectItem value="USD">USD - US Dollar</SelectItem>
                      <SelectItem value="EUR">EUR - Euro</SelectItem>
                      <SelectItem value="GBP">GBP - British Pound</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={systemSettings.timezone} onValueChange={(v) => setSystemSettings({ ...systemSettings, timezone: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Karachi">Asia/Karachi (PKT)</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                      <SelectItem value="America/New_York">America/New_York (EST)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Language</Label>
                  <Select value={systemSettings.language} onValueChange={(v) => setSystemSettings({ ...systemSettings, language: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Urdu">Urdu</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Fiscal Year Starts</Label>
                  <Select value={systemSettings.fiscalYearStart} onValueChange={(v) => setSystemSettings({ ...systemSettings, fiscalYearStart: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="January">January</SelectItem>
                      <SelectItem value="April">April</SelectItem>
                      <SelectItem value="July">July</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeSubTab === "invoice" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Invoice Settings</h2>
                <p className="text-sm text-muted-foreground">Configure invoice numbering and appearance</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Invoice Prefix</Label>
                  <Input
                    placeholder="Optional — leave blank for number-only invoices"
                    value={invoiceSettings.prefix}
                    onChange={(e) => setInvoiceSettings({ ...invoiceSettings, prefix: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Starting Number</Label>
                  <Input
                    type="number"
                    value={invoiceSettings.startingNumber ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      setInvoiceSettings({
                        ...invoiceSettings,
                        startingNumber: value === "" ? 1001 : (parseInt(value) || 1001)
                      });
                    }}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Invoice Footer</Label>
                  <Input
                    value={invoiceSettings.footer}
                    onChange={(e) => setInvoiceSettings({ ...invoiceSettings, footer: e.target.value })}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Terms & Conditions</Label>
                  <Textarea
                    value={invoiceSettings.termsConditions}
                    onChange={(e) => setInvoiceSettings({ ...invoiceSettings, termsConditions: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Company Logo</p>
                    <p className="text-sm text-muted-foreground">Display logo on invoices</p>
                  </div>
                  <Switch
                    checked={invoiceSettings.showLogo}
                    onCheckedChange={(checked) => setInvoiceSettings({ ...invoiceSettings, showLogo: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Show Tax Breakdown</p>
                    <p className="text-sm text-muted-foreground">Display itemized tax details</p>
                  </div>
                  <Switch
                    checked={invoiceSettings.showTaxBreakdown}
                    onCheckedChange={(checked) => setInvoiceSettings({ ...invoiceSettings, showTaxBreakdown: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {activeSubTab === "notifications" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Notification Settings</h2>
                <p className="text-sm text-muted-foreground">Configure email and system notifications</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Receive notifications via email</p>
                  </div>
                  <Switch
                    checked={notificationSettings.emailNotifications}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, emailNotifications: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Low Stock Alerts</p>
                    <p className="text-sm text-muted-foreground">Get notified when stock is low</p>
                  </div>
                  <Switch
                    checked={notificationSettings.lowStockAlerts}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, lowStockAlerts: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Order Updates</p>
                    <p className="text-sm text-muted-foreground">Notifications for order status changes</p>
                  </div>
                  <Switch
                    checked={notificationSettings.orderUpdates}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, orderUpdates: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Payment Reminders</p>
                    <p className="text-sm text-muted-foreground">Reminders for pending payments</p>
                  </div>
                  <Switch
                    checked={notificationSettings.paymentReminders}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, paymentReminders: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Daily Reports</p>
                    <p className="text-sm text-muted-foreground">Receive daily summary reports</p>
                  </div>
                  <Switch
                    checked={notificationSettings.dailyReports}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, dailyReports: checked })}
                  />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">Weekly Reports</p>
                    <p className="text-sm text-muted-foreground">Receive weekly summary reports</p>
                  </div>
                  <Switch
                    checked={notificationSettings.weeklyReports}
                    onCheckedChange={(checked) => setNotificationSettings({ ...notificationSettings, weeklyReports: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
