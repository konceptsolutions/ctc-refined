import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionButtonTooltip } from "@/components/ui/action-button-tooltip";
import { apiClient } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Search,
  Filter,
  Calendar,
  FileText,
  Trash,
  Eye,
  CheckCircle,
  Clock,
  ArrowUpDown
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

interface JournalEntry {
  id: string;
  entryNo: string;
  date: string;
  reference: string;
  description: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  status: "draft" | "posted" | "reversed";
  createdBy: string;
  createdAt: string;
}

// mockAccounts is no longer needed as accounts are fetched from API
// const mockAccounts = [
//   { code: "1001", name: "Cash in Hand" },
//   { code: "1002", name: "Bank Account" },
//   { code: "1100", name: "Accounts Receivable" },
//   { code: "1200", name: "Inventory" },
//   { code: "2001", name: "Accounts Payable" },
//   { code: "3001", name: "Owner's Equity" },
//   { code: "4001", name: "Sales Revenue" },
//   { code: "5001", name: "Cost of Goods Sold" },
//   { code: "6001", name: "Salaries Expense" },
//   { code: "6002", name: "Rent Expense" },
//   { code: "6003", name: "Utilities Expense" },
// ];


export const JournalEntriesTab = () => {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<{ code: string, name: string, id: string }[]>([]);

  useEffect(() => {
    fetchJournalEntries();
    fetchAccounts();
  }, [searchTerm, statusFilter]);

  const fetchAccounts = async () => {
    try {
      const result = await apiClient.get<any>("/accounting/accounts");
      if (result.data) {
        setAvailableAccounts(result.data.map((acc: any) => ({
          id: acc.id,
          code: acc.code,
          name: acc.name,
        })));
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to load accounts",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error loading accounts",
        variant: "destructive",
      });
    }
  };

  const fetchJournalEntries = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (searchTerm) params.append("search", searchTerm);

      const result = await apiClient.get<any>(`/accounting/journal-entries?${params}`);
      if (result.data) {
        const transformed = result.data.map((entry: any) => ({
          id: entry.id,
          entryNo: entry.entryNo,
          date: entry.entryDate.split('T')[0],
          reference: entry.reference || '',
          description: entry.description || '',
          lines: entry.lines.map((line: any) => ({
            id: line.id,
            accountCode: line.account.code,
            accountName: line.account.name,
            description: line.description || '',
            debit: line.debit,
            credit: line.credit,
          })),
          totalDebit: entry.totalDebit,
          totalCredit: entry.totalCredit,
          status: entry.status,
          createdBy: entry.createdBy || 'Admin',
          createdAt: entry.createdAt,
        }));
        setEntries(transformed);
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to load journal entries",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error loading journal entries",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // New entry form state
  const [newEntry, setNewEntry] = useState({
    date: new Date().toISOString().split("T")[0],
    reference: "",
    description: "",
  });
  const [journalLines, setJournalLines] = useState<JournalLine[]>([
    { id: "new-1", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
    { id: "new-2", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
  ]);

  const filteredEntries = entries.filter(entry => {
    const matchesSearch = entry.entryNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.reference.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || entry.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalDebit = journalLines.reduce((sum, line) => sum + (line.debit || 0), 0);
  const totalCredit = journalLines.reduce((sum, line) => sum + (line.credit || 0), 0);
  const isBalanced = totalDebit === totalCredit && totalDebit > 0;

  const addJournalLine = () => {
    setJournalLines([
      ...journalLines,
      { id: `new-${Date.now()}`, accountCode: "", accountName: "", description: "", debit: 0, credit: 0 }
    ]);
  };

  const removeJournalLine = (id: string) => {
    if (journalLines.length > 2) {
      setJournalLines(journalLines.filter(line => line.id !== id));
    }
  };

  const updateJournalLine = (id: string, field: keyof JournalLine, value: string | number) => {
    setJournalLines(journalLines.map(line => {
      if (line.id === id) {
        if (field === "accountCode") {
          const account = availableAccounts.find(a => a.code === value);
          return { ...line, accountCode: value as string, accountName: account?.name || "" };
        }
        return { ...line, [field]: value };
      }
      return line;
    }));
  };

  const handleCreateEntry = async () => {
    if (!isBalanced) {
      toast({
        title: "Entry Not Balanced",
        description: "Total debits must equal total credits",
        variant: "destructive",
      });
      return;
    }

    try {
      const lines = journalLines
        .filter(l => l.accountCode)
        .map(line => {
          const account = availableAccounts.find(a => a.code === line.accountCode);
          return {
            accountId: account?.id || '',
            description: line.description,
            debit: line.debit || 0,
            credit: line.credit || 0,
          };
        })
        .filter(line => line.accountId);

      if (lines.length < 2) {
        toast({
          title: "Error",
          description: "At least 2 account lines are required",
          variant: "destructive",
        });
        return;
      }

      const result = await apiClient.post<any>("/accounting/journal-entries", {
        entryDate: newEntry.date,
        reference: newEntry.reference,
        description: newEntry.description,
        lines,
        createdBy: "Admin",
      });

      if (result.data) {
        await fetchJournalEntries();
        setIsDialogOpen(false);
        setNewEntry({ date: new Date().toISOString().split("T")[0], reference: "", description: "" });
        setJournalLines([
          { id: "new-1", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
          { id: "new-2", accountCode: "", accountName: "", description: "", debit: 0, credit: 0 },
        ]);
        toast({
          title: "Journal Entry Created",
          description: "Entry has been created as draft",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to create journal entry",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error creating journal entry",
        variant: "destructive",
      });
    }
  };

  const handlePostEntry = async (entryId: string) => {
    try {
      const result = await apiClient.post<any>(`/accounting/journal-entries/${entryId}/post`, { postedBy: "Admin" });

      if (result.data) {
        await fetchJournalEntries();
        toast({
          title: "Entry Posted",
          description: "Journal entry has been posted to the ledger",
        });
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to post entry",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error posting journal entry",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: JournalEntry["status"]) => {
    switch (status) {
      case "posted":
        return <Badge className="bg-success/10 text-success border-success/20"><CheckCircle className="w-3 h-3 mr-1" /> Posted</Badge>;
      case "draft":
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
      case "reversed":
        return <Badge variant="destructive">Reversed</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Journal Entries
            </CardTitle>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="transition-all duration-200 hover:scale-105">
                  <Plus className="h-4 w-4 mr-2" />
                  New Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Journal Entry</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Date</Label>
                      <Input
                        type="date"
                        value={newEntry.date}
                        onChange={(e) => setNewEntry({ ...newEntry, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label>Reference</Label>
                      <Input
                        placeholder="e.g., INV-001"
                        value={newEntry.reference}
                        onChange={(e) => setNewEntry({ ...newEntry, reference: e.target.value })}
                      />
                    </div>
                    <div className="md:col-span-1">
                      <Label>Description</Label>
                      <Input
                        placeholder="Entry description"
                        value={newEntry.description}
                        onChange={(e) => setNewEntry({ ...newEntry, description: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-[180px]">Account</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-[120px] text-right">Debit</TableHead>
                          <TableHead className="w-[120px] text-right">Credit</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {journalLines.map((line) => (
                          <TableRow key={line.id} className="transition-colors">
                            <TableCell>
                              <Select
                                value={line.accountCode}
                                onValueChange={(value) => updateJournalLine(line.id, "accountCode", value)}
                              >
                                <SelectTrigger className="h-8">
                                  <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableAccounts.map((account) => (
                                    <SelectItem key={account.code} value={account.code}>
                                      {account.code} - {account.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8"
                                placeholder="Line description"
                                value={line.description}
                                onChange={(e) => updateJournalLine(line.id, "description", e.target.value)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 text-right"
                                type="number"
                                placeholder="0.00"
                                value={line.debit || ""}
                                onChange={(e) => updateJournalLine(line.id, "debit", parseFloat(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                className="h-8 text-right"
                                type="number"
                                placeholder="0.00"
                                value={line.credit || ""}
                                onChange={(e) => updateJournalLine(line.id, "credit", parseFloat(e.target.value) || 0)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => removeJournalLine(line.id)}
                                disabled={journalLines.length <= 2}
                              >
                                <Trash className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex justify-between items-center">
                    <Button variant="outline" onClick={addJournalLine}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Line
                    </Button>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground">Total Debit</span>
                        <span className="font-semibold">Rs {totalDebit.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-muted-foreground">Total Credit</span>
                        <span className="font-semibold">Rs {totalCredit.toLocaleString()}</span>
                      </div>
                      <Badge variant={isBalanced ? "default" : "destructive"} className="ml-2">
                        {isBalanced ? "Balanced" : "Unbalanced"}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreateEntry} disabled={!isBalanced}>
                      Create Entry
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by entry no, reference, or description..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
                <SelectItem value="reversed">Reversed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <ListNumberHeader />
                  <TableHead className="w-[120px]">Entry No.</TableHead>
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead className="w-[100px] text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry, index) => (
                  <TableRow
                    key={entry.id}
                    className="transition-colors hover:bg-muted/30"
                  >
                    <ListNumberCell index={index} total={filteredEntries.length} />
                    <TableCell className="font-medium text-primary">{entry.entryNo}</TableCell>
                    <TableCell>{entry.date}</TableCell>
                    <TableCell>{entry.reference}</TableCell>
                    <TableCell>{entry.description}</TableCell>
                    <TableCell className="text-right font-mono">Rs {entry.totalDebit.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">Rs {entry.totalCredit.toLocaleString()}</TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => setViewEntry(entry)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl">
                            <DialogHeader>
                              <DialogTitle>Journal Entry: {entry.entryNo}</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Date:</span>
                                  <p className="font-medium">{entry.date}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Reference:</span>
                                  <p className="font-medium">{entry.reference}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Status:</span>
                                  <p>{getStatusBadge(entry.status)}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">Created By:</span>
                                  <p className="font-medium">{entry.createdBy}</p>
                                </div>
                              </div>
                              <div>
                                <span className="text-muted-foreground text-sm">Description:</span>
                                <p className="font-medium">{entry.description}</p>
                              </div>
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead>Account</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead className="text-right">Debit</TableHead>
                                    <TableHead className="text-right">Credit</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {entry.lines.map((line) => (
                                    <TableRow key={line.id}>
                                      <TableCell>{line.accountCode} - {line.accountName}</TableCell>
                                      <TableCell>{line.description}</TableCell>
                                      <TableCell className="text-right font-mono">
                                        {line.debit > 0 ? `Rs ${line.debit.toLocaleString()}` : "-"}
                                      </TableCell>
                                      <TableCell className="text-right font-mono">
                                        {line.credit > 0 ? `Rs ${line.credit.toLocaleString()}` : "-"}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow className="bg-muted/30 font-semibold">
                                    <TableCell colSpan={2} className="text-right">Totals:</TableCell>
                                    <TableCell className="text-right font-mono">Rs {entry.totalDebit.toLocaleString()}</TableCell>
                                    <TableCell className="text-right font-mono">Rs {entry.totalCredit.toLocaleString()}</TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </div>
                          </DialogContent>
                        </Dialog>
                        {entry.status === "draft" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-success hover:text-success"
                            onClick={() => handlePostEntry(entry.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
            <span>Showing {filteredEntries.length} of {entries.length} entries</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
