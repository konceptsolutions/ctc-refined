import { useState, useEffect, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { 
  Database,
  CheckCircle,
  HardDrive,
  Clock,
  Plus,
  Download,
  Trash2,
  RotateCcw,
  Archive,
  Loader2,
  RefreshCw,
  Upload
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import apiClient from "@/lib/api";

interface Backup {
  id: string;
  name: string;
  tables: string;
  type: "full" | "incremental";
  size: string;
  status: "completed" | "failed" | "in_progress";
  createdAt: string;
  createdBy: string;
}

interface Schedule {
  id: string;
  name: string;
  frequency: string;
  tables: string[];
  time: string;
  status: "active" | "inactive";
  lastRun: string;
  nextRun: string;
}

const allTables = ["parts", "inventory", "sales", "customers", "suppliers", "expenses", "users", "settings"];

export const BackupRestoreTab = () => {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"backups" | "schedules" | "restore">("backups");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    type: "full" as "full" | "incremental",
    tables: [] as string[],
  });

  const fetchBackups = async () => {
    try {
      setLoading(true);
      const response = await apiClient.getBackups();
      if (response.error) {
        toast.error(response.error);
      } else {
        setBackups(response.data || []);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch backups");
    } finally {
      setLoading(false);
    }
  };

  const fetchSchedules = async () => {
    try {
      const response = await apiClient.getBackupSchedules();
      if (response.error) {
        toast.error(response.error);
      } else {
        setSchedules(response.data || []);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch schedules");
    }
  };

  useEffect(() => {
    fetchBackups();
    if (activeSubTab === "schedules") {
      fetchSchedules();
    }
  }, [activeSubTab]);

  const backupsRef = useRef<Backup[]>([]);
  backupsRef.current = backups;

  // Real-time polling for in-progress backups
  useEffect(() => {
    const checkAndPoll = () => {
      const hasInProgress = backupsRef.current.some(b => b.status === "in_progress");
      return hasInProgress;
    };

    if (!checkAndPoll()) return;
    
    const interval = setInterval(async () => {
      if (!checkAndPoll()) {
        clearInterval(interval);
        return;
      }
      
      try {
        const response = await apiClient.getBackups();
        if (response.data) {
          const updatedBackups = response.data as Backup[];
          const previousBackups = backupsRef.current;
          
          // Check for newly completed backups
          const newlyCompleted = updatedBackups.filter(
            b => {
              const prev = previousBackups.find(pb => pb.id === b.id);
              return b.status === "completed" && prev && prev.status === "in_progress";
            }
          );
          
          setBackups(updatedBackups);
          backupsRef.current = updatedBackups;
          
          if (newlyCompleted.length > 0) {
            newlyCompleted.forEach(backup => {
              toast.success(`Backup "${backup.name}" completed successfully!`);
            });
          }
        }
      } catch (error) {
        // Ignore errors during polling
      }
    }, 500); // Poll every 500ms for faster updates
    
    return () => clearInterval(interval);
  }, [backups.length]);

  // Calculate storage used from completed backups
  const calculateStorageUsed = () => {
    const completedBackups = backups.filter(b => b.status === "completed");
    const totalBytes = completedBackups.reduce((sum, backup) => {
      const sizeStr = backup.size || "0 MB";
      const sizeMatch = sizeStr.match(/(\d+)\s*MB/i);
      if (sizeMatch) {
        return sum + parseInt(sizeMatch[1], 10);
      }
      return sum;
    }, 0);
    return totalBytes > 0 ? `${totalBytes} MB` : "0 MB";
  };

  const stats = {
    total: backups.length,
    successful: backups.filter(b => b.status === "completed").length,
    storageUsed: calculateStorageUsed(),
    activeSchedules: schedules.filter(s => s.status === "active").length,
  };

  const handleCreateBackup = async () => {
    if (!formData.name) {
      toast.error("Please enter backup name");
      return;
    }

    try {
      const response = await apiClient.createBackup({
        name: formData.name,
        type: formData.type,
        tables: formData.type === "incremental" ? formData.tables : undefined,
      });
      if (response.error) {
        toast.error(response.error);
      } else {
        toast.success("Backup started - monitoring progress...");
        setIsDialogOpen(false);
        setFormData({ name: "", type: "full", tables: [] });
        fetchBackups();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to create backup");
    }
  };

  const [restoringId, setRestoringId] = useState<string | null>(null);

  const handleRestore = async (backup: Backup) => {
    if (!confirm(`⚠️ WARNING: Are you sure you want to restore from "${backup.name}"?\n\nThis will overwrite all current data with the backup data. This action cannot be undone.`)) return;
    
    try {
      setRestoringId(backup.id);
      toast.loading(`Restoring from backup: ${backup.name}...`, { id: 'restore' });
      
      const response = await apiClient.restoreBackup(backup.id);
      if (response.error) {
        toast.error(response.error, { id: 'restore' });
        setRestoringId(null);
      } else {
        toast.success(`✅ Successfully restored from: ${backup.name}`, { id: 'restore' });
        setRestoringId(null);
        // Refresh backups after restore
        setTimeout(() => fetchBackups(), 1000);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to restore backup", { id: 'restore' });
      setRestoringId(null);
    }
  };

  const handleDownload = async (backup: Backup) => {
    try {
      toast.loading(`Preparing download for: ${backup.name}...`, { id: 'download' });
      
      const response = await apiClient.downloadBackup(backup.id);
      if (response.error) {
        toast.error(response.error, { id: 'download' });
      } else {
        toast.success(`✅ Backup "${backup.name}" downloaded successfully`, { id: 'download' });
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to download backup", { id: 'download' });
    }
  };

  const handleDelete = async (id: string) => {
    const backup = backups.find(b => b.id === id);
    if (!confirm(`⚠️ Are you sure you want to delete "${backup?.name || 'this backup'}"?\n\nThis action cannot be undone.`)) return;
    
    try {
      toast.loading("Deleting backup...", { id: 'delete' });
      const response = await apiClient.deleteBackup(id);
      if (response.error) {
        toast.error(response.error, { id: 'delete' });
      } else {
        toast.success("✅ Backup deleted successfully", { id: 'delete' });
        fetchBackups();
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to delete backup", { id: 'delete' });
    }
  };

  const toggleTable = (table: string) => {
    setFormData(prev => ({
      ...prev,
      tables: prev.tables.includes(table)
        ? prev.tables.filter(t => t !== table)
        : [...prev.tables, table]
    }));
  };

  const handleExportCSV = () => {
    const csvContent = [
      ["Backup Name", "Type", "Tables", "Size", "Status", "Created At", "Created By"],
      ...backups.map(backup => [
        backup.name, backup.type, backup.tables, backup.size, backup.status, backup.createdAt, backup.createdBy
      ])
    ].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "backups_export.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backups exported successfully");
  };

  const handleImportBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.json')) {
      toast.error("Please select a valid backup JSON file");
      return;
    }

    try {
      toast.loading("Reading backup file...", { id: 'import' });
      
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      // Validate backup data structure
      if (!backupData.name || !backupData.type) {
        toast.error("Invalid backup file format", { id: 'import' });
        return;
      }

      // Show confirmation dialog
      if (!confirm(`⚠️ WARNING: Are you sure you want to import and restore from "${backupData.name}"?\n\nThis will overwrite all current data with the backup data. This action cannot be undone.`)) {
        toast.dismiss('import');
        return;
      }

      toast.loading(`Importing and restoring from: ${backupData.name}...`, { id: 'import' });

      // Call import endpoint
      const response = await apiClient.importBackup(backupData);
      
      if (response.error) {
        toast.error(response.error, { id: 'import' });
      } else {
        toast.success(`✅ Successfully imported and restored from: ${backupData.name}`, { id: 'import' });
        // Refresh backups after import
        setTimeout(() => fetchBackups(), 1000);
      }
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        toast.error("Invalid JSON file format", { id: 'import' });
      } else {
        toast.error(error.message || "Failed to import backup", { id: 'import' });
      }
    } finally {
      // Reset file input
      event.target.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Total Backups</p>
              <p className="text-2xl font-bold">{stats.total}</p>
            </div>
            <Database className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Successful</p>
              <p className="text-2xl font-bold">{stats.successful}</p>
            </div>
            <CheckCircle className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-purple-500 to-purple-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Storage Used</p>
              <p className="text-2xl font-bold">{stats.storageUsed}</p>
            </div>
            <HardDrive className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-orange-500 to-orange-600 text-white border-0">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs opacity-80">Active Schedules</p>
              <p className="text-2xl font-bold">{stats.activeSchedules}</p>
            </div>
            <Clock className="w-8 h-8 opacity-80" />
          </CardContent>
        </Card>
      </div>

      {/* Sub Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {["backups", "schedules", "restore"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab as typeof activeSubTab)}
              className={cn(
                "px-4 py-2 text-sm font-medium rounded-lg transition-colors capitalize",
                activeSubTab === tab
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
        {activeSubTab === "backups" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={handleExportCSV}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            <div className="relative">
              <input
                id="import-backup-file"
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportBackup}
              />
              <Button 
                variant="outline" 
                className="gap-2" 
                onClick={() => document.getElementById('import-backup-file')?.click()}
              >
                <Upload className="w-4 h-4" />
                Import Backup
              </Button>
            </div>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Backup
                </Button>
              </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Backup</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Backup Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter backup name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Backup Type</Label>
                  <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as "full" | "incremental" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">Full Backup</SelectItem>
                      <SelectItem value="incremental">Incremental</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.type === "incremental" && (
                  <div className="space-y-2">
                    <Label>Select Tables</Label>
                    <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg bg-muted/30">
                      {allTables.map((table) => (
                        <div key={table} className="flex items-center space-x-2">
                          <Checkbox
                            id={table}
                            checked={formData.tables.includes(table)}
                            onCheckedChange={() => toggleTable(table)}
                          />
                          <label htmlFor={table} className="text-sm capitalize cursor-pointer">
                            {table}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleCreateBackup}>Create Backup</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          </div>
        )}
      </div>

      {/* Content */}
      {activeSubTab === "backups" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>BACKUP NAME</TableHead>
                  <TableHead>TYPE</TableHead>
                  <TableHead>SIZE</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>CREATED</TableHead>
                  <TableHead>CREATED BY</TableHead>
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
                ) : backups.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No backups found
                    </TableCell>
                  </TableRow>
                ) : (
                  backups.map((backup) => (
                  <TableRow key={backup.id} className={backup.status === "in_progress" ? "bg-amber-50/30" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {backup.status === "in_progress" ? (
                          <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                        ) : (
                          <Archive className="w-4 h-4 text-muted-foreground" />
                        )}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{backup.name}</p>
                          <p className="text-xs text-muted-foreground">{backup.tables}</p>
                          {backup.status === "in_progress" && (
                            <div className="mt-1.5 w-48">
                              <Progress 
                                value={
                                  backup.size && backup.size.includes("MB") && backup.size !== "0 MB"
                                    ? Math.min((parseInt(backup.size.replace(" MB", "")) / 150) * 100, 95)
                                    : 10
                                } 
                                className="h-1.5" 
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={backup.type === "full" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"}>
                        {backup.type === "full" ? "Full" : "Incremental"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {backup.status === "in_progress" ? (
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
                          <span className="font-medium">{backup.size}</span>
                        </div>
                      ) : (
                        backup.size
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="outline" 
                        className={cn(
                          backup.status === "completed" && "bg-emerald-50 text-emerald-700",
                          backup.status === "failed" && "bg-red-50 text-red-700",
                          backup.status === "in_progress" && "bg-amber-50 text-amber-700 flex items-center gap-1.5"
                        )}
                      >
                        {backup.status === "in_progress" && <Loader2 className="w-3 h-3 animate-spin" />}
                        <span className="capitalize">{backup.status.replace("_", " ")}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{backup.createdAt}</TableCell>
                    <TableCell className="text-sm">{backup.createdBy}</TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {backup.status === "completed" && (
                          <>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => handleRestore(backup)}
                              disabled={restoringId !== null}
                              title="Restore from this backup"
                            >
                              {restoringId === backup.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  Restoring...
                                </>
                              ) : (
                                "Restore"
                              )}
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handleDownload(backup)}
                              disabled={restoringId !== null}
                              title="Download backup"
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                        {backup.status === "in_progress" && (
                          <div className="text-xs text-amber-600 font-medium">Processing...</div>
                        )}
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="text-destructive" 
                          onClick={() => handleDelete(backup.id)}
                          disabled={backup.status === "in_progress"}
                          title="Delete backup"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeSubTab === "schedules" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SCHEDULE NAME</TableHead>
                  <TableHead>FREQUENCY</TableHead>
                  <TableHead>TIME</TableHead>
                  <TableHead>TABLES</TableHead>
                  <TableHead>STATUS</TableHead>
                  <TableHead>LAST RUN</TableHead>
                  <TableHead>NEXT RUN</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedules.map((schedule) => (
                  <TableRow key={schedule.id}>
                    <TableCell className="font-medium text-sm">{schedule.name}</TableCell>
                    <TableCell className="text-sm">{schedule.frequency}</TableCell>
                    <TableCell className="text-sm">{schedule.time}</TableCell>
                    <TableCell className="text-sm">{schedule.tables.join(", ")}</TableCell>
                    <TableCell>
                      <Badge variant={schedule.status === "active" ? "default" : "secondary"}>
                        {schedule.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{schedule.lastRun}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{schedule.nextRun}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeSubTab === "restore" && (
        <Card>
          <CardContent className="p-6">
            <div className="text-center py-8">
              <RotateCcw className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Restore from Backup</h3>
              <p className="text-muted-foreground mb-4">Select a backup from the Backups tab and click "Restore" to restore your data.</p>
              <Button variant="outline" onClick={() => setActiveSubTab("backups")}>
                Go to Backups
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
