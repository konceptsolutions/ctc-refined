import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash } from "lucide-react";
import { Voucher, VoucherEntry } from "./VoucherManagement";
import { useToast } from "@/hooks/use-toast";

interface NewVoucherTabProps {
  onCreateVoucher: (voucher: Omit<Voucher, "id" | "voucherNumber" | "createdAt" | "status">) => void;
}

const accounts = [
  "Cash in Hand",
  "Cash at Bank - HBL",
  "Cash at Bank - MCB",
  "Cash at Bank - UBL",
  "Petty Cash",
  "Sales Revenue",
  "Purchase Account",
  "Accounts Receivable",
  "Accounts Payable",
  "Salary Expense",
  "Rent Expense",
  "Utility Expense",
  "Office Supplies",
  "Furniture & Fixtures",
  "Equipment",
  "Capital Account",
  "Drawings",
  "Interest Income",
  "Interest Expense",
];

export const NewVoucherTab = ({ onCreateVoucher }: NewVoucherTabProps) => {
  const { toast } = useToast();
  const [voucherType, setVoucherType] = useState<Voucher["type"]>("receipt");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [narration, setNarration] = useState("");
  const [cashBankAccount, setCashBankAccount] = useState("");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [entries, setEntries] = useState<VoucherEntry[]>([
    { id: "1", account: "", description: "", debit: 0, credit: 0 },
  ]);

  const addEntry = () => {
    setEntries([
      ...entries,
      { id: Date.now().toString(), account: "", description: "", debit: 0, credit: 0 },
    ]);
  };

  const removeEntry = (id: string) => {
    if (entries.length > 1) {
      setEntries(entries.filter((e) => e.id !== id));
    }
  };

  const updateEntry = (id: string, field: keyof VoucherEntry, value: string | number) => {
    setEntries(
      entries.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const totalDebit = entries.reduce((sum, e) => sum + (Number(e.debit) || 0), 0);
  const totalCredit = entries.reduce((sum, e) => sum + (Number(e.credit) || 0), 0);
  const difference = totalDebit - totalCredit;

  const handleCreateVoucher = () => {
    if (!cashBankAccount) {
      toast({
        title: "Error",
        description: "Please select a Cash/Bank Account",
        variant: "destructive",
      });
      return;
    }

    if (entries.some((e) => !e.account)) {
      toast({
        title: "Error",
        description: "Please select an account for all entries",
        variant: "destructive",
      });
      return;
    }

    if (difference !== 0) {
      toast({
        title: "Error",
        description: "Total Debit must equal Total Credit",
        variant: "destructive",
      });
      return;
    }

    if (totalDebit === 0) {
      toast({
        title: "Error",
        description: "Please enter at least one transaction amount",
        variant: "destructive",
      });
      return;
    }

    onCreateVoucher({
      type: voucherType,
      date,
      narration,
      cashBankAccount,
      chequeNumber: chequeNumber || undefined,
      chequeDate: chequeDate || undefined,
      entries,
      totalDebit,
      totalCredit,
    });

    // Reset form
    setVoucherType("receipt");
    setDate(new Date().toISOString().split("T")[0]);
    setNarration("");
    setCashBankAccount("");
    setChequeNumber("");
    setChequeDate("");
    setEntries([{ id: "1", account: "", description: "", debit: 0, credit: 0 }]);

    toast({
      title: "Success",
      description: "Voucher created successfully",
    });
  };

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>Create New Voucher</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Voucher Type */}
        <div>
          <Label>Voucher Type *</Label>
          <Select value={voucherType} onValueChange={(v) => setVoucherType(v as Voucher["type"])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="receipt">Receipt Voucher (RV) - Money received</SelectItem>
              <SelectItem value="payment">Payment Voucher (PV) - Money paid</SelectItem>
              <SelectItem value="journal">Journal Voucher (JV) - Non-cash entries</SelectItem>
              <SelectItem value="contra">Contra Voucher (CV) - Bank/Cash transfers</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Date and Narration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Date *</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label>Narration</Label>
            <Input
              placeholder="Voucher description"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
            />
          </div>
        </div>

        {/* Cash/Bank Account */}
        <div>
          <Label>Cash/Bank Account *</Label>
          <Select value={cashBankAccount} onValueChange={setCashBankAccount}>
            <SelectTrigger>
              <SelectValue placeholder="Select Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Cash in Hand">Cash in Hand</SelectItem>
              <SelectItem value="Cash at Bank - HBL">Cash at Bank - HBL</SelectItem>
              <SelectItem value="Cash at Bank - MCB">Cash at Bank - MCB</SelectItem>
              <SelectItem value="Cash at Bank - UBL">Cash at Bank - UBL</SelectItem>
              <SelectItem value="Petty Cash">Petty Cash</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cheque Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Cheque Number</Label>
            <Input
              placeholder="Optional"
              value={chequeNumber}
              onChange={(e) => setChequeNumber(e.target.value)}
            />
          </div>
          <div>
            <Label>Cheque Date</Label>
            <Input
              type="date"
              value={chequeDate}
              onChange={(e) => setChequeDate(e.target.value)}
            />
          </div>
        </div>

        {/* Transaction Entries */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <Label className="text-base">Transaction Entries *</Label>
            <Button variant="outline" size="sm" onClick={addEntry}>
              <Plus className="w-4 h-4 mr-2" />
              Add Entry
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">Account</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-[150px]">Debit</TableHead>
                <TableHead className="w-[150px]">Credit</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Select
                      value={entry.account}
                      onValueChange={(v) => updateEntry(entry.id, "account", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select Account" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc} value={acc}>
                            {acc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      placeholder="Description"
                      value={entry.description}
                      onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={entry.debit || ""}
                      onChange={(e) => updateEntry(entry.id, "debit", parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      placeholder="0.00"
                      value={entry.credit || ""}
                      onChange={(e) => updateEntry(entry.id, "credit", parseFloat(e.target.value) || 0)}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry(entry.id)}
                      disabled={entries.length === 1}
                    >
                      <Trash className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Totals */}
        <div className="flex justify-end gap-8 text-sm">
          <div>
            <span className="text-muted-foreground">Total Debit</span>
            <p className="font-semibold text-right">
              {totalDebit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Total Credit</span>
            <p className="font-semibold text-right">
              {totalCredit.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Difference</span>
            <p className={`font-semibold text-right ${difference !== 0 ? "text-destructive" : "text-green-600"}`}>
              {difference.toLocaleString("en-PK", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Create Button */}
        <div className="flex justify-end">
          <Button onClick={handleCreateVoucher} className="bg-primary hover:bg-primary/90">
            Create Voucher
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
