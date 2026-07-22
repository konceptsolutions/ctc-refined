import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { apiClient, generateUUID } from "@/lib/api";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Search,
  Truck,
  CheckCircle,
  Package,
  Printer,
  X,
  Trash,
  List,
  LayoutGrid,
  Clock,
  Send,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ChallanItem {
  id: string;
  partNo: string;
  description: string;
  quantity: number;
  remarks: string;
}

interface DeliveryChallanType {
  id: string;
  challanNo: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryDate: string;
  createdDate: string;
  dispatchedDate: string | null;
  deliveredDate: string | null;
  totalPackages: number;
  totalWeight: number;
  items: ChallanItem[];
  notes: string;
  status: "draft" | "ready" | "dispatched" | "delivered" | "pending";
  vehicleNo: string;
  vehicleType: string;
  driverName: string;
  driverPhone: string;
  transporter: string;
  dispatchedBy: string;
  receiverName: string;
  confirmedBy: string;
  deliveryNotes: string;
}

export const DeliveryChallan = () => {
  const [challans, setChallans] = useState<DeliveryChallanType[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"list" | "card">("list");
  const [loadingChallans, setLoadingChallans] = useState(false);
  const [loadingParts, setLoadingParts] = useState(false);
  const [availableParts, setAvailableParts] = useState<{ partNo: string; description: string; id: string }[]>([]);

  // Dialog states
  const [isNewChallanOpen, setIsNewChallanOpen] = useState(false);
  const [isDispatchOpen, setIsDispatchOpen] = useState(false);
  const [isDeliverOpen, setIsDeliverOpen] = useState(false);
  const [selectedChallan, setSelectedChallan] = useState<DeliveryChallanType | null>(null);

  // Generate challan number
  const generateChallanNo = () => {
    const year = new Date().getFullYear();
    const nextNum = challans.length + 1;
    return `DC-${year}-${String(nextNum).padStart(3, "0")}`;
  };

  // New challan form
  const [newChallanForm, setNewChallanForm] = useState({
    challanNo: generateChallanNo(),
    deliveryDate: new Date().toISOString().split("T")[0],
    status: "draft",
    customerName: "",
    customerPhone: "",
    deliveryAddress: "",
    totalPackages: 0,
    totalWeight: 0,
    notes: "",
  });
  const [challanItems, setChallanItems] = useState<ChallanItem[]>([]);

  // Dispatch form
  const [dispatchForm, setDispatchForm] = useState({
    dispatchDate: new Date().toISOString().split("T")[0],
    vehicleType: "Truck",
    vehicleNo: "",
    driverName: "",
    driverPhone: "",
    transporter: "",
    dispatchedBy: "",
    dispatchNotes: "",
  });

  // Delivery form
  const [deliveryForm, setDeliveryForm] = useState({
    actualDeliveryDate: new Date().toISOString().split("T")[0],
    receiverName: "",
    confirmedBy: "",
    deliveryNotes: "",
  });
  const [deliveredItems, setDeliveredItems] = useState<{ partNo: string; deliveredQty: number; remarks: string }[]>([]);

  // Fetch challans from database
  useEffect(() => {
    const fetchChallans = async () => {
      setLoadingChallans(true);
      try {
        // Note: This assumes there's an API endpoint for delivery challans
        // If not available, we'll create a local storage solution for now
        // For now, we'll keep the state-based approach but make it ready for API integration
        const storedChallans = localStorage.getItem('deliveryChallans');
        if (storedChallans) {
          setChallans(JSON.parse(storedChallans));
        }
      } catch (error: any) {
        toast({
          title: "Error",
          description: "Failed to load delivery challans",
          variant: "destructive",
        });
      } finally {
        setLoadingChallans(false);
      }
    };

    fetchChallans();
  }, []);

  // Fetch parts from database
  useEffect(() => {
    const fetchParts = async () => {
      setLoadingParts(true);
      try {
        const response = await apiClient.getParts({
          status: 'active',
          limit: 1000,
          page: 1
        });

        if (response.error) {
          return;
        }

        let partsDataArray: any[] = [];
        if (Array.isArray(response)) {
          partsDataArray = response;
        } else if (response.data && Array.isArray(response.data)) {
          partsDataArray = response.data;
        } else if (response.pagination && response.data) {
          partsDataArray = response.data as any[];
        }

        const transformedParts = partsDataArray
          .filter((p: any) => p.status === 'active' || !p.status)
          .map((p: any) => ({
            id: p.id,
            partNo: String(p.part_no || p.partNo || '').trim(),
            description: String(p.description || p.part_no || '').trim() || 'No description',
          }))
          .filter((p: any) => p.partNo && p.partNo.trim() !== '');

        setAvailableParts(transformedParts);
      } catch (error: any) {
        console.error('Failed to load parts for delivery challan', error);
      } finally {
        setLoadingParts(false);
      }
    };

    fetchParts();
  }, []);

  // Save challans to localStorage (temporary until API is ready)
  useEffect(() => {
    if (challans.length > 0) {
      localStorage.setItem('deliveryChallans', JSON.stringify(challans));
    }
  }, [challans]);

  const filteredChallans = challans.filter((item) => {
    const matchesSearch =
      item.challanNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.customerName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterStatus === "all" || item.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  // Stats
  const totalChallans = challans.length;
  const readyToDispatch = challans.filter((c) => c.status === "ready").length;
  const inTransit = challans.filter((c) => c.status === "dispatched").length;
  const delivered = challans.filter((c) => c.status === "delivered").length;
  const pending = challans.filter((c) => c.status === "pending" || c.status === "draft").length;

  const handleAddItem = () => {
    setChallanItems([
      ...challanItems,
      { id: String(challanItems.length + 1), partNo: "", description: "", quantity: 1, remarks: "" },
    ]);
  };

  const handleRemoveItem = (id: string) => {
    setChallanItems(challanItems.filter((item) => item.id !== id));
  };

  const handleItemChange = (id: string, field: keyof ChallanItem, value: string | number) => {
    setChallanItems(
      challanItems.map((item) =>
        item.id === id ? { ...item, [field]: value } : item
      )
    );
  };

  const handleCreateChallan = async () => {
    if (!newChallanForm.customerName || !newChallanForm.deliveryAddress) {
      toast({
        title: "Validation Error",
        description: "Please fill in required fields (Customer Name and Delivery Address).",
        variant: "destructive",
      });
      return;
    }

    if (challanItems.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one item to the challan.",
        variant: "destructive",
      });
      return;
    }

    const newChallan: DeliveryChallanType = {
      id: generateUUID(),
      challanNo: newChallanForm.challanNo,
      orderNo: `SO-2025-${String(challans.length + 1).padStart(3, "0")}`,
      customerName: newChallanForm.customerName,
      customerPhone: newChallanForm.customerPhone,
      deliveryAddress: newChallanForm.deliveryAddress,
      deliveryDate: newChallanForm.deliveryDate,
      createdDate: new Date().toISOString().split("T")[0],
      dispatchedDate: null,
      deliveredDate: null,
      totalPackages: newChallanForm.totalPackages || challanItems.length,
      totalWeight: newChallanForm.totalWeight,
      items: challanItems,
      notes: newChallanForm.notes,
      status: newChallanForm.status as DeliveryChallanType["status"],
      vehicleNo: "",
      vehicleType: "",
      driverName: "",
      driverPhone: "",
      transporter: "",
      dispatchedBy: "",
      receiverName: "",
      confirmedBy: "",
      deliveryNotes: "",
    };

    // TODO: Save to API when endpoint is available
    // try {
    //   const response = await apiClient.createDeliveryChallan(newChallan);
    //   if (response.error) {
    //     throw new Error(response.error);
    //   }
    // } catch (error: any) {
    //   toast({
    //     title: "Error",
    //     description: error.message || "Failed to create challan",
    //     variant: "destructive",
    //   });
    //   return;
    // }

    setChallans([newChallan, ...challans]);
    setIsNewChallanOpen(false);
    resetNewChallanForm();
    toast({
      title: "Challan Created",
      description: `Delivery Challan ${newChallan.challanNo} has been created successfully.`,
    });
  };

  const resetNewChallanForm = () => {
    setNewChallanForm({
      challanNo: generateChallanNo(),
      deliveryDate: new Date().toISOString().split("T")[0],
      status: "draft",
      customerName: "",
      customerPhone: "",
      deliveryAddress: "",
      totalPackages: 0,
      totalWeight: 0,
      notes: "",
    });
    setChallanItems([]);
  };

  const handleOpenDispatch = (challan: DeliveryChallanType) => {
    setSelectedChallan(challan);
    setDispatchForm({
      dispatchDate: new Date().toISOString().split("T")[0],
      vehicleType: "Truck",
      vehicleNo: "",
      driverName: "",
      driverPhone: "",
      transporter: "",
      dispatchedBy: "",
      dispatchNotes: "",
    });
    setIsDispatchOpen(true);
  };

  const handleConfirmDispatch = () => {
    if (!selectedChallan || !dispatchForm.vehicleNo || !dispatchForm.driverName) {
      toast({
        title: "Error",
        description: "Please fill in required fields.",
        variant: "destructive",
      });
      return;
    }

    setChallans(
      challans.map((c) =>
        c.id === selectedChallan.id
          ? {
            ...c,
            status: "dispatched" as const,
            dispatchedDate: dispatchForm.dispatchDate,
            vehicleNo: dispatchForm.vehicleNo,
            vehicleType: dispatchForm.vehicleType,
            driverName: dispatchForm.driverName,
            driverPhone: dispatchForm.driverPhone,
            transporter: dispatchForm.transporter,
            dispatchedBy: dispatchForm.dispatchedBy,
          }
          : c
      )
    );
    setIsDispatchOpen(false);
    setSelectedChallan(null);
    toast({
      title: "Challan Dispatched",
      description: `${selectedChallan.challanNo} has been dispatched.`,
    });
  };

  const handleOpenDeliver = (challan: DeliveryChallanType) => {
    setSelectedChallan(challan);
    setDeliveryForm({
      actualDeliveryDate: new Date().toISOString().split("T")[0],
      receiverName: "",
      confirmedBy: "",
      deliveryNotes: "",
    });
    setDeliveredItems(
      challan.items.map((item) => ({
        partNo: item.partNo,
        deliveredQty: item.quantity,
        remarks: "",
      }))
    );
    setIsDeliverOpen(true);
  };

  const handleConfirmDelivery = () => {
    if (!selectedChallan || !deliveryForm.receiverName || !deliveryForm.confirmedBy) {
      toast({
        title: "Error",
        description: "Please fill in required fields.",
        variant: "destructive",
      });
      return;
    }

    setChallans(
      challans.map((c) =>
        c.id === selectedChallan.id
          ? {
            ...c,
            status: "delivered" as const,
            deliveredDate: deliveryForm.actualDeliveryDate,
            receiverName: deliveryForm.receiverName,
            confirmedBy: deliveryForm.confirmedBy,
            deliveryNotes: deliveryForm.deliveryNotes,
          }
          : c
      )
    );
    setIsDeliverOpen(false);
    setSelectedChallan(null);
    toast({
      title: "Delivery Confirmed",
      description: `${selectedChallan.challanNo} has been delivered.`,
    });
  };

  const handlePrint = (challan: DeliveryChallanType) => {
    const itemsRows = challan.items.map((item, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${item.partNo}</td>
        <td>${item.description}</td>
        <td style="text-align: center;">${item.quantity}</td>
        <td>${item.remarks || '-'}</td>
      </tr>
    `).join('');

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Delivery Challan - ${challan.challanNo}</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; color: #333; }
              .container { max-width: 800px; margin: 0 auto; }
              .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
              .shop-info p { margin: 3px 0; font-size: 12px; }
              .shop-name { font-weight: bold; font-size: 14px; }
              .title { text-align: right; }
              .title h1 { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
              .customer-section { background-color: #1664da; color: white; padding: 6px 12px; font-weight: bold; font-size: 12px; }
              .customer-details { padding: 10px 12px; border: 1px solid #ddd; border-top: none; margin-bottom: 15px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th { background-color: #1664da; color: white; padding: 8px; text-align: left; font-size: 11px; }
              td { border: 1px solid #ddd; padding: 8px; font-size: 11px; }
              .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
              .signature { margin-top: 60px; text-align: right; }
              .signature-line { border-top: 1px solid #333; width: 200px; display: inline-block; margin-bottom: 5px; }
              @media print { body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="shop-info">
                  <p class="shop-name">Shop: LUCKY HYDRAULIC PARTS</p>
                  <p>Address: Shop#8, Adeel Market, Beside Ithihad Plaza, Tarnol, Islamabad</p>
                  <p>Tel: 03120576487</p>
                  <p>Email: daniyalarshad881996@gmail.com</p>
                </div>
                <div class="title">
                  <h1>DELIVERY CHALLAN</h1>
                  <p>Challan No: ${challan.challanNo}</p>
                  <p>Date: ${challan.deliveryDate}</p>
                  <p>Status: ${challan.status.toUpperCase()}</p>
                </div>
              </div>

              <div class="customer-section">Customer Details</div>
              <div class="customer-details">
                <p><strong>Name:</strong> ${challan.customerName}</p>
                <p><strong>Phone:</strong> ${challan.customerPhone}</p>
                <p><strong>Delivery Address:</strong> ${challan.deliveryAddress}</p>
              </div>

              ${challan.vehicleNo ? `
              <div class="info-grid">
                <p><strong>Vehicle:</strong> ${challan.vehicleNo}</p>
                <p><strong>Driver:</strong> ${challan.driverName}</p>
                <p><strong>Packages:</strong> ${challan.totalPackages}</p>
                <p><strong>Weight:</strong> ${challan.totalWeight} kg</p>
              </div>
              ` : ''}

              <table>
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Part No</th>
                    <th>Description</th>
                    <th>Quantity</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsRows.length > 0 ? itemsRows : '<tr><td colspan="5" style="text-align: center;">No items</td></tr>'}
                </tbody>
              </table>

              ${challan.notes ? `<p><strong>Notes:</strong> ${challan.notes}</p>` : ''}

              <div class="signature">
                <div class="signature-line"></div>
                <p><strong>Authorised Signature</strong></p>
              </div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }
    toast({
      title: "Printing",
      description: `${challan.challanNo} sent to printer.`,
    });
  };

  const getStatusBadge = (status: DeliveryChallanType["status"]) => {
    switch (status) {
      case "ready":
        return <Badge className="bg-green-500 text-white hover:bg-green-600"><Package className="w-3 h-3 mr-1" />ready</Badge>;
      case "dispatched":
        return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600"><Send className="w-3 h-3 mr-1" />dispatched</Badge>;
      case "delivered":
        return <Badge className="bg-green-600 text-white hover:bg-green-700"><CheckCircle className="w-3 h-3 mr-1" />delivered</Badge>;
      case "pending":
      case "draft":
        return <Badge className="bg-primary text-white hover:bg-primary/90"><Clock className="w-3 h-3 mr-1" />pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">Total Challans</p>
              <p className="text-2xl font-bold">{totalChallans}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">Ready to Dispatch</p>
              <p className="text-2xl font-bold">{readyToDispatch}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-yellow-500 to-yellow-600 text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">In Transit</p>
              <p className="text-2xl font-bold">{inTransit}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-green-500 to-green-600 text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">Delivered</p>
              <p className="text-2xl font-bold">{delivered}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-r from-primary to-primary text-white">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs opacity-80">Pending</p>
              <p className="text-2xl font-bold">{pending}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-1">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search challans..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 h-9 text-sm"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full sm:w-32 h-9 text-sm">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="dispatched">Dispatched</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-lg overflow-hidden">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("list")}
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              className="h-9 w-9 rounded-none"
              onClick={() => setViewMode("card")}
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
          </div>
          <Button
            onClick={() => {
              resetNewChallanForm();
              setIsNewChallanOpen(true);
            }}
            className="gap-2 bg-primary text-primary-foreground h-9"
          >
            <Plus className="w-4 h-4" />
            New Challan
          </Button>
        </div>
      </div>

      {/* New Challan Inline Form - Shows when creating new challan */}
      {isNewChallanOpen ? (
        <Card className="shadow-sm border-primary/20">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-foreground">New Delivery Challan</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setIsNewChallanOpen(false);
                  resetNewChallanForm();
                }}
                className="h-8 w-8"
              >
                <Trash className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Challan No</Label>
                  <Input value={newChallanForm.challanNo} disabled className="h-9 text-sm bg-muted/50" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Delivery Date *</Label>
                  <Input
                    type="date"
                    value={newChallanForm.deliveryDate}
                    onChange={(e) => setNewChallanForm({ ...newChallanForm, deliveryDate: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={newChallanForm.status}
                    onValueChange={(v) => setNewChallanForm({ ...newChallanForm, status: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="ready">Ready</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Customer Name *</Label>
                  <Input
                    value={newChallanForm.customerName}
                    onChange={(e) => setNewChallanForm({ ...newChallanForm, customerName: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Customer Phone</Label>
                  <Input
                    value={newChallanForm.customerPhone}
                    onChange={(e) => setNewChallanForm({ ...newChallanForm, customerPhone: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Delivery Address *</Label>
                <Input
                  value={newChallanForm.deliveryAddress}
                  onChange={(e) => setNewChallanForm({ ...newChallanForm, deliveryAddress: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Total Packages</Label>
                  <Input
                    type="number"
                    value={newChallanForm.totalPackages}
                    onChange={(e) => setNewChallanForm({ ...newChallanForm, totalPackages: Number(e.target.value) })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total Weight (kg)</Label>
                  <Input
                    type="number"
                    value={newChallanForm.totalWeight}
                    onChange={(e) => setNewChallanForm({ ...newChallanForm, totalWeight: Number(e.target.value) })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-semibold">Challan Items</Label>
                  <Button onClick={handleAddItem} size="sm" className="gap-1 bg-primary text-primary-foreground h-8 text-xs">
                    <Plus className="w-3 h-3" />
                    Add Item
                  </Button>
                </div>

                {challanItems.length > 0 && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-xs">Part No</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs text-center">Quantity</TableHead>
                          <TableHead className="text-xs">Remarks</TableHead>
                          <TableHead className="w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {challanItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Select
                                value={item.partNo}
                                onValueChange={(value) => {
                                  const selectedPart = availableParts.find(p => p.partNo === value);
                                  handleItemChange(item.id, "partNo", value);
                                  if (selectedPart) {
                                    handleItemChange(item.id, "description", selectedPart.description);
                                  }
                                }}
                                disabled={loadingParts}
                              >
                                <SelectTrigger className="h-8 text-xs w-32 bg-background">
                                  <SelectValue placeholder={loadingParts ? "Loading..." : "Select Part"} />
                                </SelectTrigger>
                                <SelectContent className="bg-popover z-50 max-h-60">
                                  {availableParts.length === 0 ? (
                                    <div className="px-2 py-1.5 text-xs text-muted-foreground text-center">
                                      {loadingParts ? "Loading parts..." : "No parts available"}
                                    </div>
                                  ) : (
                                    availableParts.map((part) => (
                                      <SelectItem key={part.id} value={part.partNo} className="text-xs">
                                        <div className="flex flex-col">
                                          <span className="font-medium">{part.partNo}</span>
                                          <span className="text-muted-foreground text-[10px] line-clamp-1">{part.description}</span>
                                        </div>
                                      </SelectItem>
                                    ))
                                  )}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.description}
                                onChange={(e) => handleItemChange(item.id, "description", e.target.value)}
                                placeholder="Description"
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(item.id, "quantity", Number(e.target.value))}
                                className="h-8 text-xs text-center w-20"
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={item.remarks}
                                onChange={(e) => handleItemChange(item.id, "remarks", e.target.value)}
                                placeholder="Remarks"
                                className="h-8 text-xs"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => handleRemoveItem(item.id)}
                              >
                                <Trash className="w-4 h-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={newChallanForm.notes}
                  onChange={(e) => setNewChallanForm({ ...newChallanForm, notes: e.target.value })}
                  className="text-sm"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button onClick={handleCreateChallan} className="bg-primary text-primary-foreground">
                  Create Challan
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsNewChallanOpen(false);
                    resetNewChallanForm();
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Challans List/Card View */}
          {viewMode === "list" ? (
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <h3 className="font-semibold text-foreground mb-4">Delivery Challans ({filteredChallans.length})</h3>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <ListNumberHeader />
                        <TableHead className="text-xs font-semibold">Challan No</TableHead>
                        <TableHead className="text-xs font-semibold">Customer</TableHead>
                        <TableHead className="text-xs font-semibold">Delivery Date</TableHead>
                        <TableHead className="text-xs font-semibold">Vehicle</TableHead>
                        <TableHead className="text-xs font-semibold">Driver</TableHead>
                        <TableHead className="text-xs font-semibold text-center">Items</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredChallans.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                            {loadingChallans ? "Loading challans..." : "No delivery challans found. Create a new challan to get started."}
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredChallans.map((challan, index) => (
                          <TableRow key={challan.id}>
                            <ListNumberCell index={index} total={filteredChallans.length} />
                            <TableCell>
                              <div>
                                <p className="font-medium text-primary text-sm">{challan.challanNo}</p>
                                <p className="text-xs text-muted-foreground">Order: {challan.orderNo}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{challan.customerName}</p>
                                <p className="text-xs text-muted-foreground">{challan.customerPhone}</p>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="text-sm">{challan.deliveryDate}</p>
                                {challan.deliveredDate && (
                                  <p className="text-xs text-green-600">Delivered: {challan.deliveredDate}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-sm">{challan.vehicleNo || "-"}</TableCell>
                            <TableCell className="text-sm">{challan.driverName || "-"}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant="outline" className="text-xs">{challan.items.length} items</Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(challan.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                {challan.status === "dispatched" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-green-600 hover:text-green-700"
                                    onClick={() => handleOpenDeliver(challan)}
                                  >
                                    Deliver
                                  </Button>
                                )}
                                {challan.status === "ready" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs text-primary hover:text-primary/80"
                                    onClick={() => handleOpenDispatch(challan)}
                                  >
                                    Dispatch
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => handlePrint(challan)}
                                >
                                  Print
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredChallans.length === 0 ? (
                <Card className="col-span-full">
                  <CardContent className="p-8 text-center">
                    <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                    <p className="text-muted-foreground">
                      {loadingChallans ? "Loading challans..." : "No delivery challans found. Create a new challan to get started."}
                    </p>
                  </CardContent>
                </Card>
              ) : (
                filteredChallans.map((challan) => (
                  <Card key={challan.id} className="shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <p className="font-bold text-foreground">{challan.challanNo}</p>
                          <p className="text-sm text-muted-foreground">{challan.customerName}</p>
                        </div>
                        {getStatusBadge(challan.status)}
                      </div>

                      {/* Timeline */}
                      <div className="space-y-3 mb-4">
                        <div className="flex items-start gap-3">
                          <div className={cn("w-3 h-3 rounded-full mt-1", challan.createdDate || challan.id ? "bg-green-500" : "bg-muted")} />
                          <div>
                            <p className={cn("text-sm font-medium", challan.createdDate || challan.id ? "text-green-600" : "text-muted-foreground")}>Created</p>
                            <p className="text-xs text-muted-foreground">{challan.createdDate || "-"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className={cn("w-3 h-3 rounded-full mt-1", challan.dispatchedDate ? "bg-green-500" : "bg-muted")} />
                          <div>
                            <p className={cn("text-sm font-medium", challan.dispatchedDate ? "text-green-600" : "text-muted-foreground")}>Dispatched</p>
                            <p className="text-xs text-muted-foreground">{challan.dispatchedDate || "-"}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <div className={cn("w-3 h-3 rounded-full mt-1", challan.deliveredDate ? "bg-green-500" : "bg-muted")} />
                          <div>
                            <p className={cn("text-sm font-medium", challan.deliveredDate ? "text-green-600" : "text-muted-foreground")}>Delivered</p>
                            <p className="text-xs text-muted-foreground">{challan.deliveredDate || "Pending"}</p>
                          </div>
                        </div>
                      </div>

                      {challan.vehicleNo && (
                        <div className="p-3 bg-muted/30 rounded-lg mb-4 text-sm">
                          <p>Vehicle: {challan.vehicleNo}</p>
                          <p>Driver: {challan.driverName}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        {challan.status === "dispatched" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs border-green-500 text-green-600 hover:bg-green-50"
                            onClick={() => handleOpenDeliver(challan)}
                          >
                            Confirm Delivery
                          </Button>
                        )}
                        {challan.status === "ready" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 text-xs border-primary text-primary hover:bg-primary/10"
                            onClick={() => handleOpenDispatch(challan)}
                          >
                            Dispatch
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="text-xs" onClick={() => handlePrint(challan)}>
                          Print
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Dispatch Dialog */}
      <Dialog open={isDispatchOpen} onOpenChange={setIsDispatchOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Dispatch Challan - {selectedChallan?.challanNo}</DialogTitle>
          </DialogHeader>

          {selectedChallan && (
            <div className="space-y-4">
              <div className="p-3 bg-yellow-50 rounded-lg text-sm">
                <p><strong>Customer:</strong> {selectedChallan.customerName}</p>
                <p><strong>Delivery Address:</strong> {selectedChallan.deliveryAddress}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Dispatch Date *</Label>
                  <Input
                    type="date"
                    value={dispatchForm.dispatchDate}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchDate: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vehicle Type</Label>
                  <Select
                    value={dispatchForm.vehicleType}
                    onValueChange={(v) => setDispatchForm({ ...dispatchForm, vehicleType: v })}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Truck">Truck</SelectItem>
                      <SelectItem value="Van">Van</SelectItem>
                      <SelectItem value="Bike">Bike</SelectItem>
                      <SelectItem value="Car">Car</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Vehicle No *</Label>
                  <Input
                    value={dispatchForm.vehicleNo}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, vehicleNo: e.target.value })}
                    placeholder="ABC-123"
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Driver Name *</Label>
                  <Input
                    value={dispatchForm.driverName}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, driverName: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Driver Phone</Label>
                  <Input
                    value={dispatchForm.driverPhone}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, driverPhone: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Transporter</Label>
                  <Input
                    value={dispatchForm.transporter}
                    onChange={(e) => setDispatchForm({ ...dispatchForm, transporter: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dispatched By *</Label>
                <Input
                  value={dispatchForm.dispatchedBy}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchedBy: e.target.value })}
                  className="h-9 text-sm w-full md:w-1/2"
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-semibold mb-3 block">Items to Dispatch</Label>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Part No</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-center">Ordered</TableHead>
                      <TableHead className="text-xs text-center">Dispatch Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedChallan.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{item.partNo}</TableCell>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            defaultValue={item.quantity}
                            className="h-8 text-xs text-center w-20 mx-auto"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Dispatch Notes</Label>
                <Textarea
                  value={dispatchForm.dispatchNotes}
                  onChange={(e) => setDispatchForm({ ...dispatchForm, dispatchNotes: e.target.value })}
                  className="text-sm"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button onClick={handleConfirmDispatch} className="flex-1 gap-2 bg-yellow-500 hover:bg-yellow-600 text-white">
                  <Send className="w-4 h-4" />
                  Confirm Dispatch
                </Button>
                <Button variant="outline" onClick={() => setIsDispatchOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Delivery Dialog */}
      <Dialog open={isDeliverOpen} onOpenChange={setIsDeliverOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">Confirm Delivery - {selectedChallan?.challanNo}</DialogTitle>
          </DialogHeader>

          {selectedChallan && (
            <div className="space-y-4">
              <div className="p-3 bg-muted/30 rounded-lg text-sm">
                <p><strong>Customer:</strong> {selectedChallan.customerName}</p>
                <p><strong>Delivery Address:</strong> {selectedChallan.deliveryAddress}</p>
                <p><strong>Dispatched:</strong> {selectedChallan.dispatchedDate}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Actual Delivery Date *</Label>
                  <Input
                    type="date"
                    value={deliveryForm.actualDeliveryDate}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, actualDeliveryDate: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Receiver Name *</Label>
                  <Input
                    value={deliveryForm.receiverName}
                    onChange={(e) => setDeliveryForm({ ...deliveryForm, receiverName: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Confirmed By *</Label>
                <Input
                  value={deliveryForm.confirmedBy}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, confirmedBy: e.target.value })}
                  className="h-9 text-sm w-full md:w-1/2"
                />
              </div>

              <div className="border-t pt-4">
                <Label className="text-sm font-semibold mb-3 block">Delivered Items</Label>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs">Part No</TableHead>
                      <TableHead className="text-xs">Description</TableHead>
                      <TableHead className="text-xs text-center">Dispatched</TableHead>
                      <TableHead className="text-xs text-center">Delivered Qty</TableHead>
                      <TableHead className="text-xs">Remarks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedChallan.items.map((item, idx) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{item.partNo}</TableCell>
                        <TableCell className="text-sm">{item.description}</TableCell>
                        <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            value={deliveredItems[idx]?.deliveredQty || item.quantity}
                            onChange={(e) => {
                              const updated = [...deliveredItems];
                              if (updated[idx]) {
                                updated[idx].deliveredQty = Number(e.target.value);
                              }
                              setDeliveredItems(updated);
                            }}
                            className="h-8 text-xs text-center w-20 mx-auto"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="If any issue..."
                            value={deliveredItems[idx]?.remarks || ""}
                            onChange={(e) => {
                              const updated = [...deliveredItems];
                              if (updated[idx]) {
                                updated[idx].remarks = e.target.value;
                              }
                              setDeliveredItems(updated);
                            }}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Delivery Notes</Label>
                <Textarea
                  value={deliveryForm.deliveryNotes}
                  onChange={(e) => setDeliveryForm({ ...deliveryForm, deliveryNotes: e.target.value })}
                  placeholder="Any delivery remarks..."
                  className="text-sm"
                  rows={3}
                />
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Button onClick={handleConfirmDelivery} className="flex-1 gap-2 bg-green-500 hover:bg-green-600 text-white">
                  <CheckCircle className="w-4 h-4" />
                  Confirm Delivery
                </Button>
                <Button variant="outline" onClick={() => setIsDeliverOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
