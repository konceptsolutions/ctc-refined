import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { NotificationProvider } from "@/contexts/NotificationContext";
import Index from "./pages/Index";
import Parts from "./pages/Parts";
import ItemsList from "./pages/ItemsList";
import Attributes from "./pages/Attributes";
import Models from "./pages/Models";
import Inventory from "./pages/Inventory";
import Transfer from "./pages/Transfer";
import Sales from "./pages/Sales";
import PurchaseImport from "./pages/PurchaseImport";
import Manage from "./pages/Manage";
import PricingCostingPage from "./pages/PricingCosting";
import Reports from "./pages/Reports";
import Expenses from "./pages/Expenses";
import Settings from "./pages/Settings";
import Accounting from "./pages/Accounting";
import FinancialStatements from "./pages/FinancialStatements";
import Vouchers from "./pages/Vouchers";
import Store from "./pages/Store";
import Login from "./pages/Login";
import DetailsPartSearchPage from "./pages/DetailsPartSearch";
import NotFound from "./pages/NotFound";
import Documentation from "./pages/Documentation";
import ProtectedRoute from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <NotificationProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/">
          <Routes>
            {/* Login route - accessible without authentication */}
            <Route path="/login" element={<Login />} />

            {/* All other routes are protected */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/partentry" element={<ProtectedRoute><Parts /></ProtectedRoute>} />
            <Route path="/partentry/itemslist" element={<ProtectedRoute><ItemsList /></ProtectedRoute>} />
            <Route path="/partentry/attributes" element={<ProtectedRoute><Attributes /></ProtectedRoute>} />
            <Route path="/partentry/models" element={<ProtectedRoute><Models /></ProtectedRoute>} />
            <Route path="/partentry/details-search" element={<ProtectedRoute><DetailsPartSearchPage /></ProtectedRoute>} />
            <Route path="/inventory" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/inventory/:tab" element={<ProtectedRoute><Inventory /></ProtectedRoute>} />
            <Route path="/transfer" element={<ProtectedRoute><Transfer /></ProtectedRoute>} />
            <Route path="/transfer/:tab" element={<ProtectedRoute><Transfer /></ProtectedRoute>} />
            <Route path="/pricing-costing" element={<ProtectedRoute><PricingCostingPage /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
            <Route path="/sales/:tab" element={<ProtectedRoute><Sales /></ProtectedRoute>} />
            <Route path="/sales/purchase-import" element={<ProtectedRoute><Navigate to="/purchase-import" replace /></ProtectedRoute>} />
            <Route path="/purchase-import" element={<ProtectedRoute><PurchaseImport /></ProtectedRoute>} />
            <Route path="/purchase-import/:tab" element={<ProtectedRoute><PurchaseImport /></ProtectedRoute>} />
            <Route path="/manage" element={<ProtectedRoute><Manage /></ProtectedRoute>} />
            <Route path="/manage/:tab" element={<ProtectedRoute><Manage /></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><Expenses /></ProtectedRoute>} />
            <Route path="/accounting" element={<ProtectedRoute><Accounting /></ProtectedRoute>} />
            <Route path="/financial-statements" element={<ProtectedRoute><FinancialStatements /></ProtectedRoute>} />
            <Route path="/vouchers" element={<ProtectedRoute><Vouchers /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/settings/:tab" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/store" element={<ProtectedRoute><Store /></ProtectedRoute>} />
            <Route path="/store/:tab" element={<ProtectedRoute><Store /></ProtectedRoute>} />
            <Route path="/docs" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
            <Route path="/documentation" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<ProtectedRoute><NotFound /></ProtectedRoute>} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </NotificationProvider>
  </QueryClientProvider>
);

export default App;
