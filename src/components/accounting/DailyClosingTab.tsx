import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentDatePakistan } from "@/utils/dateUtils";
import { apiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ListNumberHeader, ListNumberCell } from "@/components/ui/list-table-number";

// Local API URL detection is replaced by apiClient from @/lib/api


const DailyClosingTab = () => {
  const [closingDate, setClosingDate] = useState(getCurrentDatePakistan());
  const [selectedAccount, setSelectedAccount] = useState("");
  const [isGeneratingClosing, setIsGeneratingClosing] = useState(false);
  const [accountBalances, setAccountBalances] = useState<any[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ id: string; name: string; code: string }>>([]);

  // Brand Wise Sales Report state
  const [shop, setShop] = useState("");
  const [saleType, setSaleType] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [brand, setBrand] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [isGeneratingBrand, setIsGeneratingBrand] = useState(false);

  // Fetch accounts from API
  useEffect(() => {
    const fetchActiveAccounts = async () => {
      try {
        const result = await apiClient.get<any>("/accounting/accounts?status=Active");
        if (result.data) {
          const data = result.data || [];
          const accountList = data.map((acc: any) => ({
            id: acc.id,
            code: acc.code,
            name: `${acc.code} - ${acc.name}`,
          }));
          setAccounts(accountList);
        }
      } catch (error) {
      }
    };
    fetchActiveAccounts();
  }, []);

  // Fetch account balances for the selected date
  const fetchAccountBalances = async () => {
    if (!closingDate) {
      toast.error("Please select a date");
      return;
    }

    try {
      setLoadingBalances(true);
      const result = await apiClient.get<any>(`/accounting/general-ledger?dateTo=${closingDate}`);
      if (result.data) {
        // Filter by selected account if provided
        let filteredData = result.data;
        if (selectedAccount) {
          filteredData = result.data.filter((acc: any) => acc.code === selectedAccount);
        }
        setAccountBalances(filteredData);
      } else {
        toast.error(result.error || "Failed to fetch account balances");
      }
    } catch (error) {
      toast.error("Error loading account balances");
    } finally {
      setLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (closingDate) {
      fetchAccountBalances();
    }
  }, [closingDate, selectedAccount]);

  const shops = [
    { id: "1", name: "Shop 1" },
    { id: "2", name: "Shop 2" },
    { id: "3", name: "Main Store" },
  ];

  const saleTypes = [
    { id: "walk-in", name: "Walk-in Customer" },
    { id: "regular", name: "Regular Customer" },
    { id: "wholesale", name: "Wholesale" },
  ];

  const brands = [
    { id: "denso", name: "Denso" },
    { id: "toyota", name: "Toyota" },
    { id: "honda", name: "Honda" },
    { id: "suzuki", name: "Suzuki" },
  ];

  const handleViewClosingPDF = () => {
    if (!closingDate) {
      toast.error("Please select a date");
      return;
    }
    setIsGeneratingClosing(true);
    fetchAccountBalances();
    setTimeout(() => {
      setIsGeneratingClosing(false);
      toast.success("Daily Closing Report generated successfully");
    }, 1500);
  };

  const handleGenerateBrandPDF = () => {
    if (!fromDate || !toDate) {
      toast.error("Please select date range");
      return;
    }
    setIsGeneratingBrand(true);
    setTimeout(() => {
      setIsGeneratingBrand(false);
      toast.success("Brand Wise Sales Report generated successfully");
    }, 1500);
  };

  return (
    <div className="space-y-6">
      {/* Daily Closing Report */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Daily Closing Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <p className="text-sm font-medium text-muted-foreground">Filter</p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="closingDate">Date</Label>
                <Input
                  id="closingDate"
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="account">Account</Label>
                <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleViewClosingPDF} disabled={isGeneratingClosing}>
                {isGeneratingClosing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <FileText className="mr-2 h-4 w-4" />
                    View PDF
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Account Balances Table */}
          {accountBalances.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-4">Account Balances as of {closingDate}</h3>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <ListNumberHeader />
                      <TableHead>Account Code</TableHead>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Opening Balance</TableHead>
                      <TableHead className="text-right">Current Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingBalances ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : accountBalances.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          No account balances found
                        </TableCell>
                      </TableRow>
                    ) : (
                      accountBalances.map((account, index) => (
                        <TableRow key={account.code}>
                          <ListNumberCell index={index} />
                          <TableCell className="font-medium">{account.code}</TableCell>
                          <TableCell>{account.name}</TableCell>
                          <TableCell className="capitalize">{account.type || 'N/A'}</TableCell>
                          <TableCell className="text-right">
                            {account.openingBalance.toLocaleString('en-PK', {
                              style: 'currency',
                              currency: 'PKR',
                              minimumFractionDigits: 2
                            })}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {account.currentBalance.toLocaleString('en-PK', {
                              style: 'currency',
                              currency: 'PKR',
                              minimumFractionDigits: 2
                            })}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Wise Sales Report */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-5 w-5" />
            Brand Wise Sales Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shop">Shop</Label>
                <Select value={shop} onValueChange={setShop}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shop" />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="saleType">Sale Type</Label>
                <Select value={saleType} onValueChange={setSaleType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {saleTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Enter customer name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Select value={brand} onValueChange={setBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {brands.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fromDate">From</Label>
                <Input
                  id="fromDate"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="toDate">To</Label>
                <Input
                  id="toDate"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-40"
                />
              </div>
              <Button onClick={handleGenerateBrandPDF} disabled={isGeneratingBrand}>
                {isGeneratingBrand ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  "Generating PDF..."
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DailyClosingTab;
