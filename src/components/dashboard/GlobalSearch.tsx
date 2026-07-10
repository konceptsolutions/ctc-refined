import { useState, useEffect, useRef } from "react";
import { Search, Trash, FileText, Package, Users, Settings, BarChart3, Receipt, DollarSign, Layers, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  icon: React.ElementType;
  keywords: string[];
}

const searchData: SearchResult[] = [
  // Dashboard
  { id: "1", title: "Dashboard", description: "View main dashboard with statistics", category: "Navigation", path: "/", icon: BarChart3, keywords: ["home", "overview", "stats", "analytics"] },
  
  // Inventory
  { id: "2", title: "Inventory Dashboard", description: "Manage inventory overview", category: "Inventory", path: "/inventory", icon: Package, keywords: ["stock", "items", "products", "warehouse"] },
  { id: "3", title: "Stock Balance", description: "View current stock levels", category: "Inventory", path: "/inventory", icon: Package, keywords: ["quantity", "available", "balance"] },
  { id: "4", title: "Stock Transfer", description: "Transfer stock between locations", category: "Inventory", path: "/inventory", icon: Package, keywords: ["move", "transfer", "relocate"] },
  { id: "5", title: "Stock Verification", description: "Verify and audit stock", category: "Inventory", path: "/inventory", icon: Package, keywords: ["audit", "verify", "count", "check"] },
  
  // Parts
  { id: "6", title: "Parts Management", description: "Manage parts and components", category: "Parts", path: "/parts", icon: Layers, keywords: ["components", "spare", "items", "catalog"] },
  { id: "7", title: "Kits Assembly", description: "Create and manage kit assemblies", category: "Parts", path: "/parts", icon: Layers, keywords: ["bundle", "package", "assembly", "kit"] },
  
  // Sales
  { id: "8", title: "Sales Invoice", description: "Create and manage sales invoices", category: "Sales", path: "/sales", icon: Receipt, keywords: ["bill", "invoice", "customer", "sale"] },
  { id: "9", title: "Sales Quotation", description: "Generate sales quotations", category: "Sales", path: "/sales", icon: Receipt, keywords: ["quote", "estimate", "proposal"] },
  { id: "10", title: "Sales Returns", description: "Process sales returns", category: "Sales", path: "/sales", icon: Receipt, keywords: ["return", "refund", "credit"] },
  { id: "11", title: "Customer Price Structures", description: "Manage customer pricing", category: "Sales", path: "/sales", icon: Receipt, keywords: ["pricing", "discount", "customer"] },
  
  // Manage
  { id: "12", title: "Customer Management", description: "Manage customer information", category: "Manage", path: "/manage", icon: Users, keywords: ["customer", "client", "buyer", "contact"] },
  { id: "13", title: "Supplier Management", description: "Manage supplier information", category: "Manage", path: "/manage", icon: Users, keywords: ["supplier", "vendor", "manufacturer"] },
  
  // Vouchers
  { id: "14", title: "Vouchers", description: "Manage payment and receipt vouchers", category: "Accounting", path: "/vouchers", icon: FileText, keywords: ["payment", "receipt", "journal", "voucher"] },
  { id: "15", title: "Payment Voucher", description: "Create payment vouchers", category: "Accounting", path: "/vouchers", icon: FileText, keywords: ["pay", "expense", "outflow"] },
  { id: "16", title: "Receipt Voucher", description: "Create receipt vouchers", category: "Accounting", path: "/vouchers", icon: FileText, keywords: ["receive", "income", "inflow"] },
  
  // Accounting
  { id: "17", title: "Chart of Accounts", description: "Manage chart of accounts", category: "Accounting", path: "/accounting", icon: FileText, keywords: ["accounts", "ledger", "chart"] },
  { id: "18", title: "Journal Entries", description: "View and create journal entries", category: "Accounting", path: "/accounting", icon: FileText, keywords: ["journal", "entry", "transaction"] },
  
  // Financial Statements
  { id: "19", title: "Financial Statements", description: "View financial reports", category: "Financial", path: "/financial-statements", icon: BarChart3, keywords: ["income", "profit", "loss", "trial balance"] },
  { id: "20", title: "General Journal", description: "View general journal entries", category: "Financial", path: "/financial-statements", icon: BarChart3, keywords: ["journal", "ledger", "entries"] },
  { id: "21", title: "Trial Balance", description: "View trial balance report", category: "Financial", path: "/financial-statements", icon: BarChart3, keywords: ["trial", "balance", "debit", "credit"] },
  
  // Reports
  { id: "22", title: "Reports & Analytics", description: "View business reports", category: "Reports", path: "/reports", icon: BarChart3, keywords: ["report", "analytics", "statistics", "data"] },
  { id: "23", title: "Sales Reports", description: "View sales performance reports", category: "Reports", path: "/reports", icon: BarChart3, keywords: ["sales", "revenue", "performance"] },
  { id: "24", title: "Inventory Reports", description: "View inventory analysis reports", category: "Reports", path: "/reports", icon: BarChart3, keywords: ["stock", "inventory", "aging"] },
  
  // Expenses
  { id: "25", title: "Expense Management", description: "Manage expenses and costs", category: "Expenses", path: "/expenses", icon: DollarSign, keywords: ["expense", "cost", "spending", "budget"] },
  { id: "26", title: "Post Expense", description: "Record new expenses", category: "Expenses", path: "/expenses", icon: DollarSign, keywords: ["add", "record", "expense"] },
  
  // Settings
  { id: "27", title: "Settings", description: "Configure system settings", category: "Settings", path: "/settings", icon: Settings, keywords: ["config", "preferences", "setup"] },
  { id: "28", title: "User Management", description: "Manage users and roles", category: "Settings", path: "/settings", icon: Settings, keywords: ["users", "roles", "permissions", "access"] },
  { id: "29", title: "Company Profile", description: "Configure company information", category: "Settings", path: "/settings", icon: Settings, keywords: ["company", "business", "profile"] },

  // Documentation
  { id: "30", title: "Developer Documentation", description: "API, database, frontend & backend reference", category: "Navigation", path: "/docs", icon: FileText, keywords: ["docs", "documentation", "api", "developer", "backend", "frontend", "database"] },
];

// Simple fuzzy search algorithm
const fuzzySearch = (query: string, items: SearchResult[]): SearchResult[] => {
  if (!query.trim()) return [];
  
  const searchTerms = query.toLowerCase().split(" ").filter(t => t.length > 0);
  
  const scored = items.map(item => {
    let score = 0;
    const titleLower = item.title.toLowerCase();
    const descLower = item.description.toLowerCase();
    const categoryLower = item.category.toLowerCase();
    
    for (const term of searchTerms) {
      // Exact title match (highest priority)
      if (titleLower === term) score += 100;
      // Title starts with term
      else if (titleLower.startsWith(term)) score += 50;
      // Title contains term
      else if (titleLower.includes(term)) score += 30;
      // Description contains term
      if (descLower.includes(term)) score += 15;
      // Category contains term
      if (categoryLower.includes(term)) score += 10;
      // Keywords match
      for (const keyword of item.keywords) {
        if (keyword.includes(term) || term.includes(keyword)) {
          score += 20;
          break;
        }
      }
    }
    
    return { item, score };
  });
  
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(s => s.item);
};

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const GlobalSearch = ({ open, onOpenChange }: GlobalSearchProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    const searchResults = fuzzySearch(query, searchData);
    setResults(searchResults);
    setSelectedIndex(0);
  }, [query]);

  const handleSelect = (result: SearchResult) => {
    onOpenChange(false);
    navigate(result.path);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      handleSelect(results[selectedIndex]);
    }
  };

  // Keyboard shortcut to open search
  useEffect(() => {
    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(true);
      }
    };
    
    document.addEventListener("keydown", handleGlobalKeydown);
    return () => document.removeEventListener("keydown", handleGlobalKeydown);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden rounded-xl shadow-2xl border-border/50">
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
        </DialogHeader>
        
        {/* Search Input Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border bg-muted/30">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <Search className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 relative">
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search pages, features, settings..."
              className="border-0 shadow-none focus-visible:ring-0 px-0 text-base h-10 bg-transparent placeholder:text-muted-foreground/60"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {query && (
              <button 
                onClick={() => setQuery("")} 
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
              >
                <Trash className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground bg-background border border-border rounded-md shadow-sm">
              ESC
            </kbd>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {query && results.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-muted-foreground/50" />
              </div>
              <p className="font-semibold text-foreground mb-1">No results found</p>
              <p className="text-sm text-muted-foreground">Try different keywords or browse quick actions below</p>
            </div>
          )}

          {results.length > 0 && (
            <div className="py-2 px-2">
              <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Results
              </p>
              {results.map((result, index) => {
                const Icon = result.icon;
                return (
                  <button
                    key={result.id}
                    onClick={() => handleSelect(result)}
                    className={cn(
                      "w-full flex items-center gap-4 px-3 py-3 text-left transition-all rounded-lg mb-1",
                      selectedIndex === index
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "hover:bg-muted/80"
                    )}
                  >
                    <div className={cn(
                      "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      selectedIndex === index ? "bg-primary-foreground/20" : "bg-muted"
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{result.title}</p>
                      <p className={cn(
                        "text-sm truncate",
                        selectedIndex === index ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {result.description}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[11px] font-medium px-2.5 py-1 rounded-full shrink-0 transition-colors",
                      selectedIndex === index 
                        ? "bg-primary-foreground/20 text-primary-foreground" 
                        : "bg-muted text-muted-foreground"
                    )}>
                      {result.category}
                    </span>
                    <ArrowRight className={cn(
                      "w-4 h-4 shrink-0 transition-all",
                      selectedIndex === index ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"
                    )} />
                  </button>
                );
              })}
            </div>
          )}

          {!query && (
            <div className="px-5 py-6">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { title: "New Invoice", path: "/sales", icon: Receipt, color: "text-emerald-500" },
                  { title: "Add Stock", path: "/inventory", icon: Package, color: "text-blue-500" },
                  { title: "View Reports", path: "/reports", icon: BarChart3, color: "text-purple-500" },
                  { title: "Settings", path: "/settings", icon: Settings, color: "text-primary" },
                ].map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.title}
                      onClick={() => {
                        onOpenChange(false);
                        navigate(action.path);
                      }}
                      className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/50 hover:border-primary/30 transition-all text-left group shadow-sm"
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                        <Icon className={cn("w-5 h-5 transition-colors", action.color)} />
                      </div>
                      <span className="text-sm font-semibold text-foreground">{action.title}</span>
                    </button>
                  );
                })}
              </div>
              
              {/* Footer hint */}
              <div className="mt-6 pt-4 border-t border-border/50 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>Press</span>
                <kbd className="px-2 py-1 bg-muted border border-border rounded-md font-mono text-[10px] shadow-sm">Ctrl</kbd>
                <span>+</span>
                <kbd className="px-2 py-1 bg-muted border border-border rounded-md font-mono text-[10px] shadow-sm">K</kbd>
                <span>anywhere to search</span>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
