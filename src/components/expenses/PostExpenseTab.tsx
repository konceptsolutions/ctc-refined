import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";

interface ExpenseType {
  id: string;
  name: string;
}

interface PostExpenseTabProps {
  onUpdate?: () => void;
}

const paymentModes = ["Cash", "Bank Transfer", "Cheque", "Credit Card", "Online Payment"];

export const PostExpenseTab = ({ onUpdate }: PostExpenseTabProps) => {
  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    expenseType: "",
    amount: "",
    paidTo: "",
    paymentMode: "Cash",
    referenceNumber: "",
    description: "",
  });
  const [attachments, setAttachments] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchExpenseTypes();
  }, []);

  const fetchExpenseTypes = async () => {
    try {
      const response = await apiClient.getExpenseTypes({ status: "Active", limit: 1000 });
      if (response.data) {
        setExpenseTypes(Array.isArray(response.data) ? response.data : []);
      }
    } catch (error) {
    }
  };

  const handleSubmit = async () => {
    if (!formData.expenseType || !formData.amount || !formData.paidTo) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      setLoading(true);
      await apiClient.createPostedExpense({
        date: formData.date,
        expense_type_id: formData.expenseType,
        amount: parseFloat(formData.amount),
        paidTo: formData.paidTo,
        paymentMode: formData.paymentMode,
        referenceNumber: formData.referenceNumber,
        description: formData.description,
      });

      toast.success("Expense posted successfully", {
        description: `Rs ${parseFloat(formData.amount).toLocaleString()} paid to ${formData.paidTo}`,
      });

      // Reset form
      setFormData({
        date: new Date().toISOString().split("T")[0],
        expenseType: "",
        amount: "",
        paidTo: "",
        paymentMode: "Cash",
        referenceNumber: "",
        description: "",
      });
      setAttachments([]);
      onUpdate?.();
    } catch (error: any) {
      toast.error(error.error || "Failed to post expense");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      date: new Date().toISOString().split("T")[0],
      expenseType: "",
      amount: "",
      paidTo: "",
      paymentMode: "Cash",
      referenceNumber: "",
      description: "",
    });
    setAttachments([]);
    toast.info("Form cleared");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className="p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Plus className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-foreground">Post New Expense</h2>
          <p className="text-sm text-muted-foreground">Record a new expense transaction</p>
        </div>
      </div>

      {/* Form */}
      <div className="grid gap-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="expenseType">Expense Type *</Label>
            <Select value={formData.expenseType} onValueChange={(v) => setFormData({ ...formData, expenseType: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select Expense Type" />
              </SelectTrigger>
              <SelectContent>
                {expenseTypes.length > 0 ? (
                  expenseTypes.map((type) => (
                    <SelectItem key={type.id} value={type.id}>{type.name}</SelectItem>
                  ))
                ) : (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No expense types available</div>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paidTo">Paid To *</Label>
            <Input
              id="paidTo"
              value={formData.paidTo}
              onChange={(e) => setFormData({ ...formData, paidTo: e.target.value })}
              placeholder="Payee name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentMode">Payment Mode</Label>
            <Select value={formData.paymentMode} onValueChange={(v) => setFormData({ ...formData, paymentMode: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentModes.map((mode) => (
                  <SelectItem key={mode} value={mode}>{mode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference Number</Label>
            <Input
              id="referenceNumber"
              value={formData.referenceNumber}
              onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
              placeholder="Receipt/Invoice number"
            />
          </div>
          <div className="space-y-2">
            <Label>Attachments</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/50 transition-colors cursor-pointer relative">
              <input
                type="file"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileChange}
              />
              <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Click to upload files</p>
            </div>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-sm">
                    <span className="truncate max-w-[150px]">{file.name}</span>
                    <button onClick={() => removeAttachment(index)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Enter expense details..."
            rows={4}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-4 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSubmit} className="gap-2" disabled={loading}>
            <Plus className="w-4 h-4" />
            {loading ? "Posting..." : "Post Expense"}
          </Button>
        </div>
      </div>
    </Card>
  );
};
