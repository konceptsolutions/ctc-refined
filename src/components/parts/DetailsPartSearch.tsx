import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import {
    Search,
    RefreshCw,
    History,
    Plus,
    Minus,
    ArrowUpRight,
    ArrowDownRight,
    Save,
    FileText,
    Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { usePageActions } from "@/permissions/pageActions";

interface PartPriceItem {
    id: string;
    partNo: string;
    altNo: string;
    brand: string;
    description: string;
    stock: number;
    reserved: number;
    avgCost: number;
    priceRevDate: string;
    priceA: number;
    priceB: number;
    priceM: number;
    selected: boolean;
}

interface PriceHistoryEntry {
    id: string;
    date: string;
    brand: string;
    mainCategory: string;
    subCategory: string;
    percentage: number;
    priceChangeType: "Inc" | "Dec";
    amendedBy: string;
}

export const DetailsPartSearch = () => {
    const { canEdit } = usePageActions("partentry.details-search");
    const [items, setItems] = useState<PartPriceItem[]>([]);
    const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Filters
    const [mainCategory, setMainCategory] = useState("all");
    const [subCategory, setSubCategory] = useState("all");
    const [brand, setBrand] = useState("all");
    const [percentage, setPercentage] = useState<string>("");
    const [password, setPassword] = useState("");
    const [modelNo, setModelNo] = useState("");
    const [generalSearch, setGeneralSearch] = useState("");
    const [updateMode, setUpdateMode] = useState<"group" | "individual">("group");

    // Options for selects
    const [categories, setCategories] = useState<any[]>([]);
    const [subCategories, setSubCategories] = useState<any[]>([]);
    const [brands, setBrands] = useState<any[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState("");
    const itemsPerPage = 50;

    const fetchParts = async () => {
        setLoading(true);
        setCurrentPage(1); // Reset to page 1 on new fetch
        try {
            const params: any = {
                limit: "all",
                page: 1,
            };

            if (mainCategory !== "all") params.category_name = mainCategory;
            if (subCategory !== "all") params.subcategory_name = subCategory;
            if (brand !== "all") params.brand_name = brand;
            if (modelNo) params.model = modelNo;
            if (generalSearch) params.search = generalSearch;
            params.update_mode = updateMode;

            const response = await apiClient.getDetailsPartSearch(params) as any;
            const data = response?.data || [];

            if (Array.isArray(data)) {
                const transformed: PartPriceItem[] = data.map((p: any) => {
                    // Extract date and format it nicely
                    const rawDate = p.price_rev_date || p.updated_at || p.created_at;
                    let formattedDate = "-";
                    if (rawDate && rawDate !== "-") {
                        try {
                            const dateObj = new Date(rawDate);
                            if (!isNaN(dateObj.getTime())) {
                                formattedDate = dateObj.toLocaleDateString('en-GB', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    year: 'numeric'
                                });
                            }
                        } catch (e) {
                            formattedDate = String(rawDate).split('T')[0];
                        }
                    }

                    const mNo = (p.master_part_no || p.masterPartNo || "").trim();
                    const pNo = (p.part_no || p.partNo || "").trim();

                    return {
                        id: p.id,
                        // If master part no exists, show it as Part No and show pNo as Alt No
                        // If no master part no, show pNo as Part No and keep Alt No empty
                        partNo: mNo || pNo,
                        altNo: mNo ? pNo : "",
                        brand: p.brand_name || p.brand || "-",
                        description: p.description || "",
                        stock: Number(p.stock) || 0,
                        reserved: Number(p.reserved_stock || p.reservedStock || 0),
                        avgCost: Number(p.avg_cost || p.avgCost || 0),
                        priceRevDate: formattedDate,
                        // Robust mapping for Prices
                        priceA: Number(p.price_a || p.priceA || 0),
                        priceB: Number(p.price_b || p.priceB || 0),
                        priceM: Number(p.price_m || p.priceM || 0),
                        selected: false,
                    };
                });
                setItems(transformed);
            }
        } catch (error: any) {
            console.error("Failed to fetch parts", error);
            toast({
                title: "Error",
                description: "Failed to load parts",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const filteredItems = items.filter(item =>
        item.partNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.brand.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
    const paginatedItems = filteredItems.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            // Assuming there's an endpoint for price history
            const response = await apiClient.getPriceHistory({ limit: 10 }) as any;
            const data = response?.data || [];

            if (Array.isArray(data)) {
                const transformed: PriceHistoryEntry[] = data.map((h: any) => ({
                    id: h.id,
                    date: new Date(h.created_at).toLocaleDateString(),
                    brand: h.brand || "-",
                    mainCategory: h.category || "-",
                    subCategory: h.subcategory || "-",
                    percentage: h.percentage || 0,
                    priceChangeType: h.change_type === "increase" ? "Inc" : "Dec",
                    amendedBy: h.amended_by || "System",
                }));
                setHistory(transformed);
            }
        } catch (error) {
            console.error("Failed to fetch history", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchPartsRef = useRef(fetchParts);
    fetchPartsRef.current = fetchParts;
    const fetchHistoryRef = useRef(fetchHistory);
    fetchHistoryRef.current = fetchHistory;

    useEffect(() => {
        void (async () => {
            try {
                const [catsRes, subCatsRes, brandsRes] = await Promise.all([
                    apiClient.getCategories(),
                    apiClient.getSubcategories(),
                    apiClient.getBrands(),
                ]);

                setCategories((catsRes as any).data || catsRes || []);
                setSubCategories((subCatsRes as any).data || subCatsRes || []);
                setBrands((brandsRes as any).data || brandsRes || []);

                await fetchPartsRef.current();
                await fetchHistoryRef.current();
            } catch (error) {
                console.error("Failed to fetch initial data", error);
            }
        })();
    }, []);

    const handleApplyGroupUpdate = async () => {
        if (!percentage || isNaN(parseFloat(percentage))) {
            toast({
                title: "Error",
                description: "Please enter a valid percentage",
                variant: "destructive",
            });
            return;
        }

        // Logic for group update
        toast({
            title: "Success",
            description: `Applied ${percentage}% update to filtered items`,
        });
    };

    return (
        <div className="flex flex-col gap-4 h-full">

            <div className="grid grid-cols-12 gap-4 flex-1 overflow-hidden">
                {/* Sidebar Filters */}
                <div className="col-span-3 flex flex-col gap-4 overflow-auto pr-2">
                    <Card className="border-primary/20 shadow-md">
                        <CardHeader className="py-3 px-4 bg-muted/50 border-b">
                            <CardTitle className="text-sm font-semibold flex items-center gap-2">
                                <Search className="w-4 h-4 text-primary" />
                                Price Selection Mode
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-4 flex flex-col gap-4">
                            <div className="grid grid-cols-2 gap-2">
                                <Button
                                    variant={updateMode === "group" ? "default" : "outline"}
                                    className="w-full text-xs h-16 flex flex-col gap-1"
                                    onClick={() => setUpdateMode("group")}
                                >
                                    <Plus className="w-4 h-4" />
                                    Parts Group
                                </Button>
                                <Button
                                    variant={updateMode === "individual" ? "default" : "outline"}
                                    className="w-full text-xs h-16 flex flex-col gap-1"
                                    onClick={() => setUpdateMode("individual")}
                                >
                                    <History className="w-4 h-4" />
                                    Parts Individual
                                </Button>
                            </div>

                            <div className="space-y-4 pt-2">
                                <div className="space-y-2 pb-2 border-b">
                                    <h3 className="text-xs font-bold text-primary uppercase">Prices Increased / Decreased</h3>
                                    <Button variant="outline" size="sm" className="w-full text-xs font-bold text-blue-600">
                                        List {" >>> "} (F9)
                                    </Button>
                                </div>

                                <div className="space-y-3">
                                    <div className="space-y-1 text-blue-600">
                                        <Label className="text-[10px] uppercase font-bold text-blue-600">Search Part / Desc / Master</Label>
                                        <div className="relative">
                                            <Search className="absolute left-2 top-2 h-3.5 w-3.5 opacity-50" />
                                            <Input
                                                value={generalSearch}
                                                onChange={(e) => setGeneralSearch(e.target.value)}
                                                className="h-8 text-xs pl-8 bg-blue-50/50 border-blue-100"
                                                placeholder="Type to search..."
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Main Category</Label>
                                        <div className="flex gap-1">
                                            <Select value={mainCategory} onValueChange={setMainCategory}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Select Category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">ALL CATEGORIES</SelectItem>
                                                    {categories.map((c) => (
                                                        <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Plus className="w-3 h-3" /></Button>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Minus className="w-3 h-3" /></Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Sub Category</Label>
                                        <div className="flex gap-1">
                                            <Select value={subCategory} onValueChange={setSubCategory}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Select Sub Category" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">ALL SUB CATEGORIES</SelectItem>
                                                    {subCategories.map((s) => (
                                                        <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Plus className="w-3 h-3" /></Button>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Minus className="w-3 h-3" /></Button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Brand</Label>
                                        <div className="flex gap-1">
                                            <Select value={brand} onValueChange={setBrand}>
                                                <SelectTrigger className="h-8 text-xs">
                                                    <SelectValue placeholder="Select Brand" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="all">ALL BRANDS</SelectItem>
                                                    {brands.map((b) => (
                                                        <SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Plus className="w-3 h-3" /></Button>
                                            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0"><Minus className="w-3 h-3" /></Button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">%age</Label>
                                            <Input
                                                value={percentage}
                                                onChange={(e) => setPercentage(e.target.value)}
                                                className="h-8 text-xs font-bold"
                                                placeholder="0.00"
                                                disabled={!canEdit}
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Password</Label>
                                            <div className="relative">
                                                <Input
                                                    type="password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    className="h-8 text-xs pr-8"
                                                    disabled={!canEdit}
                                                />
                                                <Lock className="w-3 h-3 absolute right-2 top-2.5 text-muted-foreground" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-[10px] uppercase font-bold text-muted-foreground">Model No.</Label>
                                        <div className="flex gap-1">
                                            <Input
                                                value={modelNo}
                                                onChange={(e) => setModelNo(e.target.value)}
                                                className="h-8 text-xs bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
                                                placeholder="140G"
                                            />
                                        </div>
                                    </div>

                                    <Button className="w-full mt-2" onClick={() => fetchParts()}>
                                        Apply Filters
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Table Area */}
                <div className="col-span-9 flex flex-col gap-4 overflow-hidden">
                    <Card className="flex-1 flex flex-col overflow-hidden shadow-md">
                        <div className="p-2 border-b bg-muted/20 flex items-center gap-2">
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    type="search"
                                    placeholder="Quick search in loaded results..."
                                    className="pl-8 h-9 text-xs"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                            <div className="text-[10px] text-muted-foreground font-medium uppercase ml-auto">
                                Showing {paginatedItems.length} of {filteredItems.length} items
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto border rounded-md">
                            <Table>
                                <TableHeader className="bg-muted/50 sticky top-0">
                                    <TableRow className="hover:bg-transparent">
                                        <ListNumberHeader className="text-[10px] uppercase font-bold px-2 h-10 border-r" />
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r">Part No</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r">Alt. No</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r">Brand</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r">Desc</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-center">Stock</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-center">Reserved</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-right">Avg Cost</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-center">Rev.Date</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-center w-8">V</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-center w-8">Log</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-right bg-blue-50/50 dark:bg-blue-950/20">Price-A</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-right bg-green-50/50 dark:bg-green-950/20">Price-B</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 border-r text-right">Price-M</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-10 text-center w-10">Upd</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={15} className="text-center py-10">
                                                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-primary opacity-50" />
                                                <p className="mt-2 text-muted-foreground">Loading parts...</p>
                                            </TableCell>
                                        </TableRow>
                                    ) : paginatedItems.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={15} className="text-center py-10 text-muted-foreground">
                                                No records found matching your quick search
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        paginatedItems.map((item, index) => (
                                            <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                                                <ListNumberCell
                                                    index={index}
                                                    page={currentPage}
                                                    pageSize={itemsPerPage}
                                                    total={filteredItems.length}
                                                    className="px-2 py-1 text-xs border-r"
                                                />
                                                <TableCell className="px-2 py-1 text-xs font-medium border-r part-code-font font-mono">{item.partNo}</TableCell>
                                                <TableCell className="px-2 py-1 text-xs border-r part-code-font font-mono">{item.altNo}</TableCell>
                                                <TableCell className="px-2 py-1 text-xs border-r">{item.brand}</TableCell>
                                                <TableCell className="px-2 py-1 text-[10px] border-r max-w-[150px] truncate uppercase">{item.description}</TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-center border-r font-bold">{item.stock}</TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-center border-r font-bold text-primary dark:text-primary">{item.reserved}</TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-right border-r font-mono">{item.avgCost.toLocaleString()}</TableCell>
                                                <TableCell className="px-2 py-1 text-[10px] text-center border-r font-bold text-green-600 dark:text-green-400">
                                                    {item.priceRevDate}
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-center border-r">
                                                    <input type="checkbox" className="w-3 h-3 accent-primary" />
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-center border-r">
                                                    <FileText className="w-3.5 h-3.5 mx-auto text-blue-500 cursor-pointer hover:text-blue-700" />
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-right border-r font-mono font-bold bg-blue-50/30 dark:bg-blue-950/10">
                                                    {item.priceA.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-right border-r font-mono font-bold bg-green-50/30 dark:bg-green-950/10">
                                                    {item.priceB.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-xs text-right border-r font-mono font-bold">
                                                    {item.priceM.toLocaleString()}
                                                </TableCell>
                                                <TableCell className="px-2 py-1 text-center">
                                                    {canEdit && (
                                                        <Button variant="ghost" size="icon" className="h-6 w-6">
                                                            <Save className="w-3.5 h-3.5 text-blue-600" />
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="bg-muted/30 p-2 flex justify-between items-center border-t">
                            <div className="text-[10px] font-bold text-muted-foreground">
                                TOTAL RECORDS: <span className="text-primary text-xs ml-1 border px-2 py-0.5 bg-background rounded">{items.length}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] uppercase font-bold"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1 || loading}
                                >
                                    Previous
                                </Button>
                                <span className="text-[10px] font-bold px-2">
                                    PAGE {currentPage} OF {totalPages || 1}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[10px] uppercase font-bold"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages || totalPages === 0 || loading}
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* History Section */}
                    <Card className="h-1/3 flex flex-col overflow-hidden shadow-md">
                        <CardHeader className="py-2 px-4 bg-muted/80 border-b flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">
                                Price Amendment History
                            </CardTitle>
                            <Button variant="outline" size="sm" className="h-7 text-[10px] px-2" onClick={() => fetchHistory()}>
                                Refresh {" > "} History
                            </Button>
                        </CardHeader>
                        <div className="flex-1 overflow-auto">
                            <Table>
                                <TableHeader className="bg-muted/30 sticky top-0">
                                    <TableRow className="hover:bg-transparent">
                                        <ListNumberHeader className="text-[10px] uppercase font-bold px-2 h-8 border-r" />
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r">Date</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r">Brand</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r">Main Ctg</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r">Sub Ctg</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r text-center">%Age</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8 border-r text-center">Price (+/-)</TableHead>
                                        <TableHead className="text-[10px] uppercase font-bold px-2 h-8">Amended By</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {historyLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-4 text-[10px]">Loading history...</TableCell>
                                        </TableRow>
                                    ) : history.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-4 text-[10px] text-muted-foreground">No history records</TableCell>
                                        </TableRow>
                                    ) : (
                                        history.map((h, index) => (
                                            <TableRow key={h.id} className="hover:bg-muted/20">
                                                <ListNumberCell index={index} total={history.length} className="px-2 py-0.5 text-[10px] border-r" />
                                                <TableCell className="px-2 py-0.5 text-[10px] border-r">{h.date}</TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] border-r">{h.brand}</TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] border-r">{h.mainCategory}</TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] border-r">{h.subCategory}</TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] text-center border-r font-bold">{h.percentage}%</TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] text-center border-r font-bold">
                                                    {h.priceChangeType === "Inc" ? (
                                                        <span className="text-green-600 flex items-center justify-center gap-1">
                                                            <ArrowUpRight className="w-2.5 h-2.5" /> Inc
                                                        </span>
                                                    ) : (
                                                        <span className="text-red-600 flex items-center justify-center gap-1">
                                                            <ArrowDownRight className="w-2.5 h-2.5" /> Dec
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="px-2 py-0.5 text-[10px] uppercase font-medium">{h.amendedBy}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
