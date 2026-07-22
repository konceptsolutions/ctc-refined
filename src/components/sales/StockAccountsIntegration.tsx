import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Link2, Package, DollarSign, RefreshCw, CheckCircle, AlertTriangle, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface IntegrationLog {
  id: string;
  timestamp: string;
  type: "stock" | "accounts";
  action: string;
  reference: string;
  status: "success" | "failed" | "pending";
  details: string;
}

interface IntegrationSetting {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: "stock" | "accounts";
}

const mockLogs: IntegrationLog[] = [
  {
    id: "L001",
    timestamp: "2024-01-15 14:32:15",
    type: "stock",
    action: "Stock Deduction",
    reference: "SO-2024-001",
    status: "success",
    details: "5 items deducted from inventory",
  },
  {
    id: "L002",
    timestamp: "2024-01-15 14:32:16",
    type: "accounts",
    action: "Invoice Created",
    reference: "INV-2024-001",
    status: "success",
    details: "Accounts receivable updated: $2,450.00",
  },
  {
    id: "L003",
    timestamp: "2024-01-15 13:45:22",
    type: "stock",
    action: "Stock Return",
    reference: "SR-2024-001",
    status: "success",
    details: "2 items returned to inventory",
  },
  {
    id: "L004",
    timestamp: "2024-01-15 12:18:45",
    type: "accounts",
    action: "Payment Recorded",
    reference: "PAY-2024-015",
    status: "success",
    details: "Payment of $1,200.00 recorded",
  },
  {
    id: "L005",
    timestamp: "2024-01-15 11:05:33",
    type: "stock",
    action: "Stock Deduction",
    reference: "SO-2024-004",
    status: "failed",
    details: "Insufficient stock for item PRD-005",
  },
];

const mockSettings: IntegrationSetting[] = [
  {
    id: "S001",
    name: "Auto Stock Deduction",
    description: "Automatically deduct stock when sales order is confirmed",
    enabled: true,
    category: "stock",
  },
  {
    id: "S002",
    name: "Auto Stock Return",
    description: "Automatically add stock when return is processed",
    enabled: true,
    category: "stock",
  },
  {
    id: "S003",
    name: "Real-time Stock Sync",
    description: "Sync stock levels in real-time with inventory module",
    enabled: true,
    category: "stock",
  },
  {
    id: "S004",
    name: "Auto Invoice Generation",
    description: "Automatically create invoice when order is shipped",
    enabled: true,
    category: "accounts",
  },
  {
    id: "S005",
    name: "Auto Receivable Update",
    description: "Update accounts receivable on invoice creation",
    enabled: true,
    category: "accounts",
  },
  {
    id: "S006",
    name: "Payment Auto-Reconciliation",
    description: "Automatically reconcile payments with invoices",
    enabled: false,
    category: "accounts",
  },
];

export const StockAccountsIntegration = () => {
  const [logs] = useState<IntegrationLog[]>(mockLogs);
  const [settings, setSettings] = useState<IntegrationSetting[]>(mockSettings);

  const handleToggleSetting = (id: string) => {
    setSettings(
      settings.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
    toast({
      title: "Setting Updated",
      description: "Integration setting has been updated.",
    });
  };

  const handleSync = () => {
    toast({
      title: "Sync Started",
      description: "Manual sync with stock and accounts has been initiated.",
    });
  };

  const getStatusColor = (status: IntegrationLog["status"]) => {
    switch (status) {
      case "success":
        return "default";
      case "failed":
        return "destructive";
      case "pending":
        return "secondary";
      default:
        return "secondary";
    }
  };

  const successCount = logs.filter((l) => l.status === "success").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Stock & Accounts Integration</h2>
          <p className="text-sm text-muted-foreground">Auto integration with inventory and accounts</p>
        </div>
        <Button onClick={handleSync} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Manual Sync
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Link2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{logs.length}</p>
                <p className="text-xs text-muted-foreground">Total Syncs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{successCount}</p>
                <p className="text-xs text-muted-foreground">Successful</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{failedCount}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Settings className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {settings.filter((s) => s.enabled).length}/{settings.length}
                </p>
                <p className="text-xs text-muted-foreground">Active Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Integration Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="w-4 h-4" />
              Stock Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings
              .filter((s) => s.category === "stock")
              .map((setting) => (
                <div
                  key={setting.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="space-y-0.5">
                    <Label className="font-medium">{setting.name}</Label>
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={() => handleToggleSetting(setting.id)}
                  />
                </div>
              ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Accounts Integration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {settings
              .filter((s) => s.category === "accounts")
              .map((setting) => (
                <div
                  key={setting.id}
                  className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                >
                  <div className="space-y-0.5">
                    <Label className="font-medium">{setting.name}</Label>
                    <p className="text-xs text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch
                    checked={setting.enabled}
                    onCheckedChange={() => handleToggleSetting(setting.id)}
                  />
                </div>
              ))}
          </CardContent>
        </Card>
      </div>

      {/* Integration Logs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Integration Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <ListNumberHeader />
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log, index) => (
                  <TableRow key={log.id}>
                    <ListNumberCell index={index} total={logs.length} />
                    <TableCell className="text-sm">{log.timestamp}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {log.type === "stock" ? (
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            Stock
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            Accounts
                          </span>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{log.action}</TableCell>
                    <TableCell>{log.reference}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{log.details}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusColor(log.status)}>{log.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
