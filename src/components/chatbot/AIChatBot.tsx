import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, Send, Minimize2, Maximize2, FileText, Package, BarChart3, Receipt, Users, Settings, DollarSign, BookOpen, Mic, MicOff, ShoppingCart, Truck, CreditCard, Calculator, FileSpreadsheet, Building, Warehouse, Tag, TrendingUp, ClipboardList, UserPlus, RefreshCw, Sparkles, Navigation, Zap, Brain, ArrowRight, Trash, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import apiClient from '@/lib/api';
import {
  ItemDropdown,
  SupplierDropdown,
  StoreDropdown,
  RackDropdown,
  ShelfDropdown,
  QuantityInput,
  PriceInputs,
  ExpenseForm,
  ConfirmationButtons,
  HistoryButton,
  CustomerTypeButtons,
  CustomerDropdown,
  WalkingCustomerNameInput,
  CustomerWiseReportTypeButtons,
} from './InteractiveComponents';
import { HistoryPopup } from './HistoryPopup';
import { getLocalHelpForQuery } from '@/lib/ai/localErpHelp';
import {
  extractCustomerNameFromInvoiceQuery,
  formatInvoiceDate,
  isCustomerInvoiceLookupQuery,
} from '@/lib/ai/customerInvoiceQueryUtils';
import {
  extractPartSearchFromStockQuery,
  isItemStockLookupQuery,
} from '@/lib/ai/itemStockQueryUtils';
import {
  isItemAnalyticsReportQuery,
  parseItemAnalyticsReportQuery,
  printItemAnalyticsPdf,
  isCustomerWiseReportQuery,
  isCustomerWiseItemAnalyticsQuery,
  isCustomerWiseInvoiceReportQuery,
  parseCustomerTypeFromText,
  parseReportDateRange,
  parseItemReportSpecFromQuery,
  hasExplicitItemReportDirection,
  buildItemReportSpec,
  printCustomerWiseSalesPdf,
  printCustomerWiseItemAnalyticsPdf,
  type SalesItemAnalyticsRow,
  type CustomerWiseSalesReport,
  type ItemReportSort,
  type ItemReportOrder,
  ITEM_REPORT_TYPE_OPTIONS,
} from '@/lib/ai/reportQueryUtils';
import { getCurrentPakistanFinancialYearRange } from '@/utils/dateUtils';
 
const CHAT_STORAGE_KEY = 'ai-assistant-chat-history';
const MAX_STORED_MESSAGES = 50;

const resolveNavigationPath = (nav: { path: string; tab?: string }) =>
  nav.tab ? `${nav.path.replace(/\/$/, '')}/${nav.tab}` : nav.path;

// Legacy inline prompt — server-side knowledge base is authoritative via /api/ai-assistant/chat
const SYSTEM_PROMPT = `You are Koncepts AI Assistant for the Inventory ERP system.`;

interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  actions?: ActionButton[];
  isThinking?: boolean;
  interactiveComponent?: string; // Type of interactive component to render
  flowData?: any; // Additional data for interactive components
}

interface ActionButton {
  label: string;
  action: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: React.ReactNode;
}

interface QuickAction {
  label: string;
  icon: React.ReactNode;
  action: string;
  path?: string;
  tab?: string;
}

interface ConversationFlow {
  type:
    | 'purchase_order_creation'
    | 'purchase_order_receiving'
    | 'customer_wise_sales_report'
    | 'customer_last_invoice'
    | 'item_stock_lookup'
    | null;
  step: number;
  data: {
    items?: Array<{ partId: string; partNo: string; description?: string; quantity: number; unitCost?: number }>;
    supplierId?: string;
    supplierName?: string;
    purchaseOrderId?: string;
    storeId?: string;
    storeName?: string;
    rackId?: string;
    rackName?: string;
    shelfId?: string;
    shelfName?: string;
    prices?: { priceA: number; priceB: number; priceM: number };
    expenses?: Array<{ type: string; amount: number; account: string }>;
    receivedQuantities?: Record<string, number>;
    currentItemIndex?: number;
    customerType?: 'walking' | 'registered';
    customerId?: string;
    customerName?: string;
    fromDate?: string;
    toDate?: string;
    rangeLabel?: string;
    reportMode?: 'invoices' | 'items';
    sortBy?: ItemReportSort;
    order?: ItemReportOrder;
    lastReport?: CustomerWiseSalesReport;
    lastItemReport?: SalesItemAnalyticsRow[];
  };
}

// Load messages from localStorage
const loadStoredMessages = (): Message[] => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    if (stored) {
      const parsed: StoredMessage[] = JSON.parse(stored);
      return parsed.map(msg => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    }
  } catch (error) {
  }
  return [];
};

// Save messages to localStorage
const saveMessages = (messages: Message[]) => {
  try {
    const toStore: StoredMessage[] = messages
      .slice(-MAX_STORED_MESSAGES)
      .filter(m => !m.actions) // Don't store action buttons
      .map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp.toISOString(),
      }));
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toStore));
  } catch (error) {
  }
};

const AIChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => loadStoredMessages());
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [conversationContext, setConversationContext] = useState<string[]>([]);
  const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
  const [longCatConfigured, setLongCatConfigured] = useState(false);
  const [conversationFlow, setConversationFlow] = useState<ConversationFlow>({
    type: null,
    step: 0,
    data: {},
  });
  const [historyPopupOpen, setHistoryPopupOpen] = useState(false);
  const [historyPartId, setHistoryPartId] = useState('');
  const [historyPartNo, setHistoryPartNo] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;

  // Check if AI assistant is configured
  useEffect(() => {
    const checkAiConfig = async () => {
      try {
        const response = await apiClient.getAiAssistantStatus();
        const statusData = response.data as { configured?: boolean } | null;
        if (statusData?.configured) {
          setLongCatConfigured(true);
        }
      } catch {
        // Fallback: check LongCat settings directly
        try {
          const response = await apiClient.getLongCatSettings();
          const settingsData = response.data as { apiKey?: string } | null;
          if (settingsData?.apiKey) {
            setLongCatConfigured(true);
          }
        } catch {
          // ignore
        }
      }
    };
    checkAiConfig();
  }, []);

  // Smart navigation mapping with enhanced context
  const navigationMap: Record<string, { path: string; tab?: string; description: string }> = {
    // Dashboard
    'dashboard': { path: '/', description: 'Main dashboard with overview' },
    'home': { path: '/', description: 'Main dashboard' },
    'overview': { path: '/', description: 'Dashboard overview' },
    'docs': { path: '/docs', description: 'Developer documentation' },
    'documentation': { path: '/docs', description: 'Developer documentation (API, database, etc.)' },
    
    // Parts
    'parts': { path: '/partentry', description: 'Parts management' },
    'part entry': { path: '/partentry', description: 'Part entry' },
    'add part': { path: '/partentry', description: 'Add new part' },
    'new part': { path: '/partentry', description: 'Create new part' },
    'create part': { path: '/partentry', description: 'Create new part' },
    'parts list': { path: '/partentry/itemslist', description: 'View all parts' },
    'view parts': { path: '/partentry/itemslist', description: 'View parts list' },
    'attributes': { path: '/partentry/attributes', description: 'Part attributes' },
    'models': { path: '/partentry/models', description: 'Machine models' },
    
    // Sales
    'sales': { path: '/sales', tab: 'inquiry', description: 'Sales module' },
    'sales inquiry': { path: '/sales', tab: 'inquiry', description: 'Sales inquiry' },
    'inquiry': { path: '/sales', tab: 'inquiry', description: 'Sales inquiry' },
    'invoice': { path: '/sales', tab: 'invoice', description: 'Sales invoice' },
    'sales invoice': { path: '/sales', tab: 'invoice', description: 'Create sales invoice' },
    'create invoice': { path: '/sales', tab: 'invoice', description: 'Create sales invoice' },
    'quotation': { path: '/sales', tab: 'quotation', description: 'Sales quotation' },
    'sales quotation': { path: '/sales', tab: 'quotation', description: 'Sales quotation' },
    'sales return': { path: '/sales', tab: 'returns', description: 'Sales returns' },
    'returns': { path: '/sales', tab: 'returns', description: 'Sales returns' },
    'aging': { path: '/sales', tab: 'distributor-aging', description: 'Distributor aging' },
    'receivables': { path: '/sales', tab: 'receivable-reminders', description: 'Receivable reminders' },
    
    // Purchase Import
    'purchase import': { path: '/purchase-import', tab: 'inquiry', description: 'Purchase import inquiry' },
    'import inquiry': { path: '/purchase-import', tab: 'inquiry', description: 'Import purchase inquiry' },
    'import quotation': { path: '/purchase-import', tab: 'quotation', description: 'Import quotation' },
    'import costing': { path: '/purchase-import', tab: 'costing', description: 'Import costing' },
    
    // Inventory
    'inventory': { path: '/inventory', tab: 'current-stock', description: 'Inventory management' },
    'stock': { path: '/inventory', tab: 'current-stock', description: 'Stock management' },
    'current stock': { path: '/inventory', tab: 'current-stock', description: 'View current stock' },
    'stock in out': { path: '/inventory', tab: 'stock-in-out', description: 'Stock in/out' },
    'adjust stock': { path: '/inventory', tab: 'adjust-item', description: 'Adjust stock levels' },
    'adjust item': { path: '/inventory', tab: 'adjust-item', description: 'Adjust item (stock correction)' },
    'local purchase': { path: '/inventory', tab: 'direct-purchase-order', description: 'Local purchase (DPO)' },
    'direct purchase': { path: '/inventory', tab: 'direct-purchase-order', description: 'Direct purchase order' },
    'dpo': { path: '/inventory', tab: 'direct-purchase-order', description: 'Direct purchase order' },
    'dpo return': { path: '/inventory', tab: 'dpo-return', description: 'DPO return' },
    'store management': { path: '/inventory', tab: 'store-management', description: 'Store management' },
    'new invoice': { path: '/sales', tab: 'invoice', description: 'Create sales invoice' },
    'quote': { path: '/sales', tab: 'quotation', description: 'Create quotation' },
    
    // Transfer & Store
    'transfer': { path: '/transfer', description: 'Stock transfer' },
    'store panel': { path: '/store', description: 'Store panel' },
    
    // Vouchers
    'vouchers': { path: '/vouchers', description: 'Voucher management' },
    'voucher': { path: '/vouchers', description: 'Manage vouchers' },
    'payment': { path: '/vouchers', tab: 'payment', description: 'Payment voucher' },
    'payment voucher': { path: '/vouchers', tab: 'payment', description: 'Create payment' },
    'receipt': { path: '/vouchers', tab: 'receipt', description: 'Receipt voucher' },
    'receipt voucher': { path: '/vouchers', tab: 'receipt', description: 'Create receipt' },
    'journal': { path: '/vouchers', tab: 'journal', description: 'Journal voucher' },
    'contra': { path: '/vouchers', tab: 'contra', description: 'Contra voucher' },
    
    // Reports
    'reports': { path: '/reports', description: 'Reports & analytics' },
    'analytics': { path: '/reports', description: 'View analytics' },
    'top selling': { path: '/reports', description: 'Top selling items report' },
    'most selling': { path: '/reports', description: 'Top selling items report' },
    'sales report': { path: '/reports', tab: 'sales', description: 'Sales reports' },
    'expense report': { path: '/reports', tab: 'expenses', description: 'Expense reports' },
    
    // Expenses
    'expenses': { path: '/expenses', description: 'Expense management' },
    'add expense': { path: '/expenses', tab: 'add', description: 'Add new expense' },
    'expense types': { path: '/expenses', tab: 'types', description: 'Manage expense types' },
    
    // Accounting
    'accounting': { path: '/accounting', description: 'Accounting module' },
    'accounts': { path: '/accounting', description: 'Chart of accounts' },
    'ledger': { path: '/accounting', tab: 'ledger', description: 'General ledger' },
    'trial balance': { path: '/accounting', tab: 'trial', description: 'Trial balance' },
    
    // Financial
    'financial': { path: '/financial-statements', description: 'Financial statements' },
    'income statement': { path: '/financial-statements', tab: 'income', description: 'Income statement' },
    'profit loss': { path: '/financial-statements', tab: 'income', description: 'Profit & loss' },
    'p&l': { path: '/financial-statements', tab: 'income', description: 'Profit & loss' },
    
    // Manage
    'manage': { path: '/manage', description: 'Customer & supplier management' },
    'customers': { path: '/manage', tab: 'customers', description: 'Customer management' },
    'customer': { path: '/manage', tab: 'customers', description: 'Manage customers' },
    'add customer': { path: '/manage', tab: 'customers', description: 'Add new customer' },
    'suppliers': { path: '/manage', tab: 'suppliers', description: 'Supplier management' },
    'supplier': { path: '/manage', tab: 'suppliers', description: 'Manage suppliers' },
    'add supplier': { path: '/manage', tab: 'suppliers', description: 'Add new supplier' },
    
    // Settings
    'settings': { path: '/settings', description: 'System settings' },
    'users': { path: '/settings', tab: 'users', description: 'User management' },
    'add user': { path: '/settings', tab: 'users', description: 'Add new user' },
    'roles': { path: '/settings', tab: 'roles', description: 'Roles & permissions' },
    'whatsapp': { path: '/settings', tab: 'whatsapp', description: 'WhatsApp settings' },
    'longcat': { path: '/settings', tab: 'longcat', description: 'LongCat AI settings' },
    'ai settings': { path: '/settings', tab: 'longcat', description: 'AI assistant settings' },
    'company': { path: '/settings', tab: 'company', description: 'Company profile' },
    'backup': { path: '/settings', tab: 'backup', description: 'Backup & restore' },
    
    // Pricing
    'pricing': { path: '/pricing-costing', description: 'Pricing & costing' },
    'costing': { path: '/pricing-costing', description: 'Cost management' },
  };

  // Intelligent message processor
  const processUserIntent = useCallback((message: string): { type: string; data: any; confidence: number } => {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check if we're in an active flow - handle flow responses
    if (conversationFlow.type) {
      return { type: 'flow_response', data: { message, flow: conversationFlow }, confidence: 0.95 };
    }

    // Live data lookups — before help keywords ("tell me", "what is", etc.)
    if (isCustomerInvoiceLookupQuery(message)) {
      return { type: 'customer_last_invoice', data: { query: message }, confidence: 0.98 };
    }

    if (isItemStockLookupQuery(message)) {
      return { type: 'item_stock_lookup', data: { query: message }, confidence: 0.98 };
    }

    if (isCustomerWiseReportQuery(message)) {
      return { type: 'customer_wise_report', data: { query: message }, confidence: 0.98 };
    }
    const poCreationKeywords = [
      'create purchase order', 'create me purchase order', 'create po', 'make purchase order',
      'new purchase order', 'add purchase order', 'purchase order create'
    ];
    for (const keyword of poCreationKeywords) {
      if (lowerMessage.includes(keyword)) {
        return { type: 'purchase_order_creation', data: { message }, confidence: 0.9 };
      }
    }
    
    // Purchase order receiving intent
    const poReceivingKeywords = [
      'receive order', 'receive purchase order', 'complete receiving', 'receive po',
      'complete order receiving', 'receive the order', 'yes receive', 'yes, receive'
    ];
    for (const keyword of poReceivingKeywords) {
      if (lowerMessage.includes(keyword)) {
        return { type: 'purchase_order_receiving', data: { message }, confidence: 0.9 };
      }
    }
    
    // Navigation intent detection
    const navigationKeywords = ['go to', 'open', 'show me', 'take me to', 'navigate to', 'switch to', 'view', 'access'];
    const createKeywords = ['create', 'add', 'new', 'make', 'generate'];
    const helpKeywords = ['help', 'how to', 'how do', 'how does', 'what is', 'explain', 'guide', 'tell me', 'works', 'work'];
    const actionKeywords = ['do', 'perform', 'execute', 'run', 'process'];
    
    // Help / how-it-works — before navigation so "how does adjust item work" gets an answer
    for (const keyword of helpKeywords) {
      if (lowerMessage.includes(keyword)) {
        const localHelp = getLocalHelpForQuery(message);
        if (localHelp) {
          return { type: 'topic_help', data: { query: message, content: localHelp }, confidence: 0.95 };
        }
        return { type: 'help', data: { query: message }, confidence: 0.8 };
      }
    }

    const directHelp = getLocalHelpForQuery(message);
    if (directHelp) {
      return { type: 'topic_help', data: { query: message, content: directHelp }, confidence: 0.85 };
    }

    // Check for navigation intent
    for (const keyword of navigationKeywords) {
      if (lowerMessage.includes(keyword)) {
        for (const [key, value] of Object.entries(navigationMap)) {
          if (lowerMessage.includes(key)) {
            return { type: 'navigate', data: { ...value, key }, confidence: 0.9 };
          }
        }
      }
    }
    
    // Check for create/add intent
    for (const keyword of createKeywords) {
      if (lowerMessage.includes(keyword)) {
        for (const [key, value] of Object.entries(navigationMap)) {
          if (lowerMessage.includes(key.replace('add ', '').replace('create ', '').replace('new ', ''))) {
            return { type: 'create', data: { ...value, key }, confidence: 0.85 };
          }
        }
      }
    }
    
    // Direct module matching (navigation by name only)
    for (const [key, value] of Object.entries(navigationMap)) {
      if (lowerMessage === key || lowerMessage.includes(key)) {
        return { type: 'navigate', data: { ...value, key }, confidence: 0.75 };
      }
    }

    return { type: 'general', data: { message }, confidence: 0.5 };
  }, [conversationFlow]);

  // Smart response generator
  const generateSmartResponse = useCallback((intent: { type: string; data: any; confidence: number }): { content: string; actions?: ActionButton[] } => {
    switch (intent.type) {
      case 'navigate':
        const navData = intent.data;
        return {
          content: `🧭 Taking you to **${navData.description}**...\n\nI'll navigate you there right away.`,
          actions: [
            {
              label: `Go to ${navData.key}`,
              action: () => {
                navigate(resolveNavigationPath(navData));
                toast.success(`Navigated to ${navData.description}`);
              },
              variant: 'default',
              icon: <Navigation className="h-3 w-3" />
            }
          ]
        };
      
      case 'create':
        const createData = intent.data;
        return {
          content: `✨ I'll help you create a new item in **${createData.description}**.\n\nLet me take you to the right place.`,
          actions: [
            {
              label: `Create in ${createData.key}`,
              action: () => {
                navigate(resolveNavigationPath(createData));
                toast.success(`Ready to create in ${createData.description}`);
              },
              variant: 'default',
              icon: <Zap className="h-3 w-3" />
            }
          ]
        };
      
      case 'topic_help':
        return { content: intent.data.content };

      case 'help': {
        const fromQuery = getLocalHelpForQuery(intent.data.query || '');
        return {
          content: fromQuery || getContextualHelp(pathname),
        };
      }
      
      default:
        return {
          content: getIntelligentResponse(intent.data.message, pathname),
        };
    }
  }, [navigate, pathname]);

  // Get contextual help based on current page
  const getContextualHelp = (path: string): string => {
    const helpGuides: Record<string, string> = {
      '/': `🏠 **Dashboard Guide**\n\nYou're on the main dashboard. Here you can:\n• View key statistics and metrics\n• Access quick actions\n• See recent activity\n• Monitor inventory levels\n\n💡 **Pro tip**: Click any quick action button below to get started!`,
      '/partentry': `📦 **Part Entry Guide**\n\n• **Add Part**: Create new inventory items\n• **Parts List**: View and search all parts\n• **Kits**: Create product bundles\n\n💡 Use the search to quickly find parts by code or name.`,
      '/sales': `💰 **Sales Module Guide**\n\n• **Invoice**: Create sales invoices\n• **Quotation**: Generate quotes\n• **Delivery**: Manage deliveries\n• **Returns**: Process returns\n\n💡 Always select customer first before adding items.`,
      '/inventory': `📊 **Inventory Guide**\n\n• **Stock Balance**: View current stock levels\n• **Transfer**: Move stock between locations\n• **Adjust**: Correct stock quantities\n• **Purchase Order**: Order from suppliers\n\n💡 Regularly verify stock to maintain accuracy.`,
      '/vouchers': `📝 **Vouchers Guide**\n\n• **Payment**: Record outgoing payments\n• **Receipt**: Record incoming payments\n• **Journal**: General journal entries\n• **Contra**: Cash/bank transfers\n\n💡 Ensure proper narration for audit trail.`,
      '/settings': `⚙️ **Settings Guide**\n\n• **Users**: Manage user accounts\n• **Roles**: Configure permissions\n• **Company**: Update company profile\n• **WhatsApp**: Configure messaging\n\n💡 Backup regularly to prevent data loss.`,
    };
    
    if (path.startsWith('/partentry')) {
      return helpGuides['/partentry'];
    }

    return helpGuides[path] || `📖 **Help Guide**\n\nI can help you with:\n• Navigating the system\n• Creating records\n• Understanding features\n• Completing tasks\n\nJust tell me what you need!`;
  };

  // Intelligent response based on context
  const getIntelligentResponse = (message: string, path: string): string => {
    const localHelp = getLocalHelpForQuery(message);
    if (localHelp) return localHelp;

    const lowerMessage = message.toLowerCase();
    
    // Greeting responses
    if (['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening'].some(g => lowerMessage.includes(g))) {
      return `👋 Hello! I'm your AI assistant with **enhanced system control**.\n\nI can:\n🧭 Navigate you anywhere instantly\n✨ Help create records\n📊 Provide insights\n🔧 Guide you through tasks\n\nWhat would you like to do?`;
    }
    
    // Thank you responses
    if (['thank', 'thanks', 'appreciate'].some(t => lowerMessage.includes(t))) {
      return `You're welcome! 😊\n\nI'm always here to help. Just ask me to:\n• Go to any module\n• Create new records\n• Explain any feature\n\nAnything else?`;
    }
    
    // Status/overview requests
    if (['status', 'overview', 'summary', 'how is'].some(s => lowerMessage.includes(s))) {
      return `📈 **Quick Overview**\n\nI can show you various reports:\n• Sales performance\n• Inventory status\n• Financial summaries\n• Expense tracking\n\nWhich area interests you? Just say "go to reports" or click a quick action below.`;
    }
    
    // Default intelligent response
    return `🧠 I understand you're asking about "${message}"\n\nI can help you with this! Would you like me to:\n\n1️⃣ Navigate to a specific module\n2️⃣ Guide you through a process\n3️⃣ Explain how something works\n\nJust tell me more specifically what you need!`;
  };

  // Execute navigation with smooth transition
  const executeNavigation = useCallback((nav: { path: string; tab?: string }, description: string) => {
    navigate(resolveNavigationPath(nav));
    toast.success(`Navigated to ${description}`, {
      icon: <Navigation className="h-4 w-4" />,
    });
  }, [navigate]);

  // Quick actions based on current page
  const getQuickActions = (): QuickAction[] => {
    const pageActions: Record<string, QuickAction[]> = {
      '/': [
        { label: 'Invoice', icon: <FileText className="h-3 w-3" />, action: 'create_invoice', path: '/sales' },
        { label: 'Add Part', icon: <Package className="h-3 w-3" />, action: 'add_part', path: '/partentry' },
        { label: 'Reports', icon: <BarChart3 className="h-3 w-3" />, action: 'view_reports', path: '/reports' },
        { label: 'Expenses', icon: <DollarSign className="h-3 w-3" />, action: 'expenses', path: '/expenses' },
        { label: 'Stock', icon: <Warehouse className="h-3 w-3" />, action: 'stock', path: '/inventory' },
        { label: 'Voucher', icon: <Receipt className="h-3 w-3" />, action: 'voucher', path: '/vouchers' },
      ],
      '/partentry': [
        { label: 'New Part', icon: <Package className="h-3 w-3" />, action: 'add_part', path: '/partentry' },
        { label: 'Create Kit', icon: <Sparkles className="h-3 w-3" />, action: 'create_kit', path: '/partentry' },
        { label: 'Parts List', icon: <ClipboardList className="h-3 w-3" />, action: 'parts_list', path: '/partentry/itemslist' },
        { label: 'Inventory', icon: <Warehouse className="h-3 w-3" />, action: 'inventory', path: '/inventory/current-stock' },
      ],
      '/sales': [
        { label: 'Invoice', icon: <FileText className="h-3 w-3" />, action: 'invoice' },
        { label: 'Quotation', icon: <FileSpreadsheet className="h-3 w-3" />, action: 'quotation' },
        { label: 'Delivery', icon: <Truck className="h-3 w-3" />, action: 'delivery' },
        { label: 'Returns', icon: <RefreshCw className="h-3 w-3" />, action: 'returns' },
        { label: 'Customers', icon: <Users className="h-3 w-3" />, action: 'customers', path: '/manage' },
      ],
      '/inventory': [
        { label: 'Balance', icon: <Warehouse className="h-3 w-3" />, action: 'balance' },
        { label: 'Transfer', icon: <Truck className="h-3 w-3" />, action: 'transfer' },
        { label: 'Adjust', icon: <RefreshCw className="h-3 w-3" />, action: 'adjust' },
        { label: 'PO', icon: <ShoppingCart className="h-3 w-3" />, action: 'purchase_order' },
      ],
      '/vouchers': [
        { label: 'Payment', icon: <CreditCard className="h-3 w-3" />, action: 'payment' },
        { label: 'Receipt', icon: <Receipt className="h-3 w-3" />, action: 'receipt' },
        { label: 'Journal', icon: <BookOpen className="h-3 w-3" />, action: 'journal' },
        { label: 'Contra', icon: <RefreshCw className="h-3 w-3" />, action: 'contra' },
      ],
      '/settings': [
        { label: 'Users', icon: <UserPlus className="h-3 w-3" />, action: 'users' },
        { label: 'Roles', icon: <Users className="h-3 w-3" />, action: 'roles' },
        { label: 'Company', icon: <Building className="h-3 w-3" />, action: 'company' },
        { label: 'WhatsApp', icon: <Settings className="h-3 w-3" />, action: 'whatsapp' },
      ],
    };
    
    if (pathname.startsWith('/partentry')) {
      return pageActions['/partentry'];
    }

    return pageActions[pathname] || pageActions['/'];
  };

  // Initialize speech recognition
  useEffect(() => {
    const windowWithSpeech = window as any;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognitionAPI = windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognitionAPI();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const toggleVoiceInput = () => {
    if (!recognitionRef.current) {
      toast.error('Speech recognition not supported');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  // Save messages to localStorage when they change
  useEffect(() => {
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  // Initial greeting or welcome back message
  useEffect(() => {
    if (isOpen && !hasLoadedHistory) {
      setHasLoadedHistory(true);
      
      if (messages.length === 0) {
        // First time user - show greeting
        const aiStatus = longCatConfigured 
          ? '✨ **AI Enabled** — Trained on all Koncepts ERP modules'
          : '⚠️ **Basic Mode** — Add API key in Settings → LongCat AI for full AI answers';
        
        const greeting: Message = {
          id: '1',
          role: 'assistant',
          content: `🤖 **Koncepts AI Assistant**\n\n${aiStatus}\n\nI know this entire ERP system. I can:\n\n🧭 **Navigate** — "Go to sales invoice" or "Open purchase import"\n📖 **Guide** — "How do I create a quotation?" or "Explain vouchers"\n🔧 **Troubleshoot** — Filters, statuses, stock, approvals\n💬 **Answer** — Any module: sales, inventory, accounting, import purchase\n\n*Try: "How does sales inquiry conversion work?" or "Go to vouchers"*`,
          timestamp: new Date(),
        };
        setMessages([greeting]);
      } else {
        // Returning user - show welcome back
        const welcomeBack: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `👋 **Welcome back!**\n\nI've restored your previous conversation (${messages.length} messages). How can I help you today?`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, welcomeBack]);
      }
    }
  }, [isOpen, hasLoadedHistory, messages.length]);

  // Clear chat history
  const clearHistory = useCallback(() => {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    setMessages([]);
    setHasLoadedHistory(false);
    toast.success('Chat history cleared');
    
    // Show fresh greeting
    const aiStatus = longCatConfigured 
      ? '✨ **AI Enabled** — Trained on all Koncepts ERP modules'
      : '⚠️ **Basic Mode** — Configure API key in Settings → LongCat AI';
    
    const greeting: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `🤖 **Koncepts AI Assistant**\n\n${aiStatus}\n\nHow can I help you today?`,
      timestamp: new Date(),
    };
    setMessages([greeting]);
    setHasLoadedHistory(true);
  }, [longCatConfigured]);

  // Smooth auto-scroll to bottom when messages change
  useEffect(() => {
    const performScroll = () => {
      const scrollContainer = scrollRef.current;
      if (!scrollContainer) return;

      // Find the Radix ScrollArea viewport element (the actual scrollable element)
      const viewport = scrollContainer.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      
      if (viewport) {
        // Use both requestAnimationFrame and a small delay to ensure DOM is ready
        requestAnimationFrame(() => {
          setTimeout(() => {
            viewport.scrollTo({
              top: viewport.scrollHeight + 1000, // Add extra to ensure we're at bottom
              behavior: 'smooth'
            });
            // Also set scrollTop directly as backup
            viewport.scrollTop = viewport.scrollHeight;
          }, 50);
        });
      }
    };

    // Multiple attempts to ensure scroll happens
    const timeout1 = setTimeout(performScroll, 100);
    const timeout2 = setTimeout(performScroll, 200);
    const timeout3 = setTimeout(performScroll, 300);
    
    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      clearTimeout(timeout3);
    };
  }, [messages, isTyping]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  // Get system prompt with current context
  const getSystemPrompt = useCallback(() => {
    const recentContext = conversationContext.slice(-3).join('\n');
    return SYSTEM_PROMPT
      .replace('{CURRENT_PATH}', pathname)
      .replace('{CONVERSATION_HISTORY}', recentContext || 'No recent conversation');
  }, [pathname, conversationContext]);

  // Smooth scroll to bottom helper - defined early to avoid hoisting issues
  const scrollToBottom = useCallback((smooth = true) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    const performScroll = () => {
      // Find the Radix ScrollArea viewport element
      const viewport = scrollContainer.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      
      if (viewport) {
        if (smooth) {
          viewport.scrollTo({
            top: viewport.scrollHeight + 1000,
            behavior: 'smooth'
          });
        }
        // Always set scrollTop directly as well (instant scroll)
        viewport.scrollTop = viewport.scrollHeight;
      }
    };

    // Multiple attempts to ensure it scrolls
    requestAnimationFrame(() => {
      performScroll();
      setTimeout(performScroll, 50);
      setTimeout(performScroll, 100);
    });
  }, []);

  // Purchase Order Creation Flow Handler
  const handlePurchaseOrderCreationFlow = useCallback((intent: any) => {
    const flow = conversationFlow;
    
    // Initialize flow if starting
    if (intent.type === 'purchase_order_creation' && !flow.type) {
      setConversationFlow({
        type: 'purchase_order_creation',
        step: 1,
        data: { items: [] },
      });
      
      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '📦 **Creating Purchase Order**\n\nLet\'s start by selecting the items you want to purchase.\n\nPlease select an item from the dropdown below:',
        timestamp: new Date(),
        interactiveComponent: 'item_selection',
      };
      setMessages(prev => [...prev, message]);
      setIsTyping(false);
      return;
    }

    // Handle flow steps
    if (flow.type === 'purchase_order_creation') {
      switch (flow.step) {
        case 1: // Item selection
          // This will be handled by interactive component callback
          break;
        case 2: // Supplier selection
          // This will be handled by interactive component callback
          break;
        case 3: // Quantity input
          // This will be handled by interactive component callback
          break;
        case 4: // Confirmation
          // This will be handled by interactive component callback
          break;
      }
    }
  }, [conversationFlow]);

  // Purchase Order Receiving Flow Handler
  const handlePurchaseOrderReceivingFlow = useCallback(async (intent: any) => {
    const flow = conversationFlow;
    
    // Initialize flow if starting
    if (intent.type === 'purchase_order_receiving' && !flow.type) {
      // Check if we have a purchase order to receive
      const poId = flow.data.purchaseOrderId;
      if (!poId) {
        const message: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '⚠️ No purchase order found to receive. Please create a purchase order first.',
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, message]);
        setIsTyping(false);
        return;
      }

      // Fetch purchase order details
      try {
        setIsTyping(true);
        const poResponse = await apiClient.getPurchaseOrder(poId);
        if (poResponse.error) {
          throw new Error(poResponse.error);
        }

        const poData = (poResponse.data as any)?.data || (poResponse.data as any);
        const items = (poData?.items || []).map((item: any) => ({
          partId: item.part?.id || item.partId,
          partNo: item.part?.partNo || item.partNo || 'Unknown',
          description: item.part?.description,
          quantity: item.quantity || 0,
          unitCost: item.unitCost || 0,
        }));

        setConversationFlow({
          type: 'purchase_order_receiving',
          step: 1,
          data: {
            ...flow.data,
            items,
            currentItemIndex: 0,
            prices: { priceA: 0, priceB: 0, priceM: 0 },
            expenses: [],
          },
        });
        
        const message: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: '📥 **Receiving Purchase Order**\n\nLet\'s start by selecting the store where you want to receive the items.\n\nPlease select a store:',
          timestamp: new Date(),
          interactiveComponent: 'store_selection',
        };
        setMessages(prev => [...prev, message]);
      } catch (error: any) {
        const errorMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `❌ **Error**: ${error.message || 'Failed to load purchase order'}\n\nPlease try again.`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsTyping(false);
      }
      return;
    }

    // Handle flow steps
    if (flow.type === 'purchase_order_receiving') {
      switch (flow.step) {
        case 1: // Store selection
          // This will be handled by interactive component callback
          break;
        case 2: // Rack selection
          // This will be handled by interactive component callback
          break;
        case 3: // Shelf selection
          // This will be handled by interactive component callback
          break;
        case 4: // Price input
          // This will be handled by interactive component callback
          break;
        case 5: // Expense entry
          // This will be handled by interactive component callback
          break;
        case 6: // Received quantity
          // This will be handled by interactive component callback
          break;
        case 7: // Confirmation
          // This will be handled by interactive component callback
          break;
      }
    }
  }, [conversationFlow, setMessages, setIsTyping]);

  // Callback handlers for PO Creation Flow
  const handleItemSelected = useCallback((partId: string, partNo: string, description?: string) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_creation') return;

    const newItems = [...(flow.data.items || []), { partId, partNo, description, quantity: 0 }];
    setConversationFlow({
      ...flow,
      step: 2,
      data: { ...flow.data, items: newItems },
    });

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Item added: **${partNo}**\n\n${newItems.length === 1 ? 'Now, please select a supplier:' : `You've added ${newItems.length} item(s). Add more items or select a supplier to continue.`}`,
      timestamp: new Date(),
      interactiveComponent: newItems.length === 1 ? 'supplier_selection' : 'item_selection',
      flowData: { allowMoreItems: true },
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handleSupplierSelected = useCallback((supplierId: string, supplierName: string) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_creation') return;

    setConversationFlow({
      ...flow,
      step: 3,
      data: { ...flow.data, supplierId, supplierName },
    });

    const items = flow.data.items || [];
    const firstItem = items[0];
    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Supplier selected: **${supplierName}**\n\nNow, please enter the quantity for **${firstItem.partNo}**:`,
      timestamp: new Date(),
      interactiveComponent: 'quantity_input',
      flowData: { itemIndex: 0, partNo: firstItem.partNo },
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handleQuantityEntered = useCallback((quantity: number, itemIndex: number) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_creation') return;

    const items = [...(flow.data.items || [])];
    items[itemIndex].quantity = quantity;

    if (itemIndex < items.length - 1) {
      // More items to process
      setConversationFlow({
        ...flow,
        data: { ...flow.data, items },
      });

      const nextItem = items[itemIndex + 1];
      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Quantity entered: **${quantity}**\n\nNow, please enter the quantity for **${nextItem.partNo}**:`,
        timestamp: new Date(),
        interactiveComponent: 'quantity_input',
        flowData: { itemIndex: itemIndex + 1, partNo: nextItem.partNo },
      };
      setMessages(prev => [...prev, message]);
    } else {
      // All items processed, show confirmation
      setConversationFlow({
        ...flow,
        step: 4,
        data: { ...flow.data, items },
      });

      const itemsList = items.map(item => `- ${item.partNo}: ${item.quantity} units`).join('\n');
      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ All quantities entered!\n\n**Purchase Order Summary:**\n\nSupplier: ${flow.data.supplierName}\n\nItems:\n${itemsList}\n\nPlease review and confirm:`,
        timestamp: new Date(),
        interactiveComponent: 'confirmation',
        flowData: { type: 'purchase_order' },
      };
      setMessages(prev => [...prev, message]);
    }
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handlePOCreationSave = useCallback(async () => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_creation') return;

    try {
      setIsTyping(true);
      const items = flow.data.items || [];
      if (items.length === 0) {
        toast.error('Please add at least one item');
        return;
      }

      // Calculate unit cost from items if not set (use 0 as default)
      const poData = {
        date: new Date().toISOString().split('T')[0],
        supplier_id: flow.data.supplierId || undefined,
        items: items.map(item => ({
          part_id: item.partId,
          quantity: item.quantity,
          unit_cost: item.unitCost || 0,
          total_cost: (item.unitCost || 0) * item.quantity,
        })),
      };

      const response = await apiClient.createPurchaseOrder(poData as any);
      
      if (response.error) {
        throw new Error(response.error);
      }

      // Handle different response structures
      const responseData = (response.data as any) || response;
      const poId = responseData?.id || responseData?.data?.id;
      const poNumber = responseData?.po_number || responseData?.poNumber || responseData?.data?.po_number || responseData?.data?.poNumber;

      if (!poId) {
        throw new Error('Failed to create purchase order: No ID returned');
      }

      setConversationFlow({
        type: 'purchase_order_receiving',
        step: 0,
        data: { ...flow.data, purchaseOrderId: poId },
      });

      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ **Purchase Order Created Successfully!**\n\nPO Number: ${poNumber || 'N/A'}\n\nWould you like to receive this order now?`,
        timestamp: new Date(),
        actions: [
          {
            label: 'Yes, receive order',
            action: async () => {
              try {
                setIsTyping(true);
                const poResponse = await apiClient.getPurchaseOrder(poId);
                if (poResponse.error) {
                  throw new Error(poResponse.error);
                }

                const poData = (poResponse.data as any)?.data || (poResponse.data as any);
                const items = (poData?.items || []).map((item: any) => ({
                  partId: item.part?.id || item.partId,
                  partNo: item.part?.partNo || item.partNo || 'Unknown',
                  description: item.part?.description,
                  quantity: item.quantity || 0,
                  unitCost: item.unitCost || 0,
                }));

                setConversationFlow({
                  type: 'purchase_order_receiving',
                  step: 1,
                  data: {
                    ...flow.data,
                    items,
                    purchaseOrderId: poId,
                    currentItemIndex: 0,
                    prices: { priceA: 0, priceB: 0, priceM: 0 },
                    expenses: [],
                  },
                });
                const receiveMessage: Message = {
                  id: Date.now().toString(),
                  role: 'assistant',
                  content: '📥 **Receiving Purchase Order**\n\nLet\'s start by selecting the store where you want to receive the items.\n\nPlease select a store:',
                  timestamp: new Date(),
                  interactiveComponent: 'store_selection',
                };
                setMessages(prev => [...prev, receiveMessage]);
              } catch (error: any) {
                toast.error(error.message || 'Failed to load purchase order');
              } finally {
                setIsTyping(false);
              }
            },
            variant: 'default',
            icon: <Package className="h-3 w-3" />,
          },
          {
            label: 'No, later',
            action: () => {
              setConversationFlow({ type: null, step: 0, data: {} });
              toast.success('Purchase order saved. You can receive it later from the inventory module.');
            },
            variant: 'outline',
          },
        ],
      };
      setMessages(prev => [...prev, message]);
      toast.success('Purchase order created successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to create purchase order');
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Error**: ${error.message || 'Failed to create purchase order'}\n\nPlease try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [conversationFlow, scrollToBottom]);

  // Callback handlers for PO Receiving Flow
  const handleStoreSelected = useCallback((storeId: string, storeName: string) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    setConversationFlow({
      ...flow,
      step: 2,
      data: { ...flow.data, storeId, storeName },
    });

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Store selected: **${storeName}**\n\nNow, please select a rack in this store:`,
      timestamp: new Date(),
      interactiveComponent: 'rack_selection',
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handleRackSelected = useCallback((rackId: string, rackName: string) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    setConversationFlow({
      ...flow,
      step: 3,
      data: { ...flow.data, rackId, rackName },
    });

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Rack selected: **${rackName}**\n\nNow, please select a shelf:`,
      timestamp: new Date(),
      interactiveComponent: 'shelf_selection',
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handleShelfSelected = useCallback((shelfId: string, shelfName: string) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    setConversationFlow({
      ...flow,
      step: 4,
      data: { ...flow.data, shelfId, shelfName },
    });

    const items = flow.data.items || [];
    const currentItem = items[flow.data.currentItemIndex || 0];
    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Shelf selected: **${shelfName}**\n\nNow, please enter the purchase prices for **${currentItem?.partNo || 'item'}**:\n\nYou can view history to see previous prices.`,
      timestamp: new Date(),
      interactiveComponent: 'price_input',
      flowData: { partId: currentItem?.partId, partNo: currentItem?.partNo },
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom]);

  const handlePricesEntered = useCallback((prices: { priceA: number; priceB: number; priceM: number }) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    setConversationFlow({
      ...flow,
      step: 5,
      data: { ...flow.data, prices },
    });

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Prices entered!\n\nNow, please add any expenses (optional). Click "Add" to add an expense, or click "Continue" to skip:`,
      timestamp: new Date(),
      interactiveComponent: 'expense_form',
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handleExpensesUpdated = useCallback((expenses: Array<{ type: string; amount: number; account: string }>) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    setConversationFlow({
      ...flow,
      step: 6,
      data: { ...flow.data, expenses },
    });

    const items = flow.data.items || [];
    const currentItem = items[flow.data.currentItemIndex || 0];
    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Expenses ${expenses.length > 0 ? 'added' : 'skipped'}!\n\nNow, please enter the received quantity for **${currentItem?.partNo || 'item'}**:`,
      timestamp: new Date(),
      interactiveComponent: 'received_quantity_input',
      flowData: { partNo: currentItem?.partNo },
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom]);

  const handleReceivedQuantityEntered = useCallback((quantity: number) => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving') return;

    const items = flow.data.items || [];
    const currentIndex = flow.data.currentItemIndex || 0;
    const receivedQuantities = { ...(flow.data.receivedQuantities || {}), [items[currentIndex].partId]: quantity };

    setConversationFlow({
      ...flow,
      step: 7,
      data: { ...flow.data, receivedQuantities },
    });

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Received quantity entered: **${quantity}**\n\n**Receiving Summary:**\n\nStore: ${flow.data.storeName}\nRack: ${flow.data.rackName}\nShelf: ${flow.data.shelfName}\n\nPlease review and confirm:`,
      timestamp: new Date(),
      interactiveComponent: 'confirmation',
      flowData: { type: 'purchase_order_receiving' },
    };
    setMessages(prev => [...prev, message]);
    scrollToBottom();
  }, [conversationFlow, scrollToBottom, setMessages, setConversationFlow]);

  const handlePOReceivingSave = useCallback(async () => {
    const flow = conversationFlow;
    if (flow.type !== 'purchase_order_receiving' || !flow.data.purchaseOrderId) return;

    try {
      setIsTyping(true);
      const items = flow.data.items || [];
      const receivedQuantities = flow.data.receivedQuantities || {};
      const prices = flow.data.prices || { priceA: 0, priceB: 0, priceM: 0 };

      const updateData: any = {
        status: 'Received',
        items: items.map(item => ({
          part_id: item.partId,
          quantity: item.quantity,
          received_qty: receivedQuantities[item.partId] || item.quantity,
          unit_cost: item.unitCost || 0,
          total_cost: (item.unitCost || 0) * (receivedQuantities[item.partId] || item.quantity),
        })),
        expenses: flow.data.expenses || [],
        // Note: store_id, rack_id, shelf_id are handled via stock movements
      };

      const response = await apiClient.updatePurchaseOrder(flow.data.purchaseOrderId, updateData);
      
      if (response.error) {
        throw new Error(response.error);
      }

      // Create stock movements for received items
      if (flow.data.storeId) {
        for (const item of items) {
          const receivedQty = receivedQuantities[item.partId] || item.quantity;
          if (receivedQty > 0) {
            try {
              await apiClient.createStockMovement({
                part_id: item.partId,
                type: 'in',
                quantity: receivedQty,
                store_id: flow.data.storeId || null,
                rack_id: flow.data.rackId || null,
                shelf_id: flow.data.shelfId || null,
                reference_type: 'purchase',
                reference_id: flow.data.purchaseOrderId,
                notes: `Purchase Order Received via AI Chatbot`,
              });
            } catch (err: any) {
              // Don't fail the whole operation if stock movement fails
            }
          }
        }
      }

      // Update part prices if provided
      if (prices.priceA > 0 || prices.priceB > 0 || prices.priceM > 0) {
        const firstItem = items[0];
        if (firstItem) {
          try {
            await apiClient.updatePartPrices(firstItem.partId, {
              priceA: prices.priceA,
              priceB: prices.priceB,
              priceM: prices.priceM,
            });
          } catch (err) {
          }
        }
      }

      setConversationFlow({ type: null, step: 0, data: {} });

      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ **Purchase Order Received Successfully!**\n\nThe order has been received and stock has been updated.\n\nStore: ${flow.data.storeName}\nRack: ${flow.data.rackName}\nShelf: ${flow.data.shelfName}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, message]);
      toast.success('Purchase order received successfully!');
    } catch (error: any) {
      toast.error(error.message || 'Failed to receive purchase order');
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌ **Error**: ${error.message || 'Failed to receive purchase order'}\n\nPlease try again.`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      scrollToBottom();
    }
  }, [conversationFlow, scrollToBottom]);

  const handleItemAnalyticsReportRequest = useCallback(
    async (query: string) => {
      const parsed = parseItemAnalyticsReportQuery(query);
      if (!parsed) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📊 **Item Sales Analytics**\n\nI can generate reports for a **month**, the **current Pakistan financial year (1 Jul – 30 Jun)**, or a custom range.\n\nExamples:\n\n• "Most selling items in **May**"\n• "Least revenue items for **current financial year**"\n• "Max profitability PDF for **FY 2025-26**"\n• "Most selling items" *(defaults to current FY)*\n\nPakistan FY runs **1 July to 30 June**. Current FY is used automatically when no month is specified.\n\nOr open **Reports → Sales Reports → Item Sales Analytics**.`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Open Reports',
              action: () => {
                navigate('/reports');
                toast.success('Open Sales Reports → Item Sales Analytics');
              },
              variant: 'outline',
              icon: <BarChart3 className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
        return;
      }

      const { from, to, label, title, sortBy, order, previewMetric } = parsed;

      try {
        const response = await apiClient.getTopSellingItemsReport({
          from_date: from,
          to_date: to,
          limit: 50,
          sort_by: sortBy,
          order,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const items = (response.data || []) as SalesItemAnalyticsRow[];

        if (items.length === 0) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📊 **${title} — ${label}**\n\nNo approved sales invoice items were found for this period (${from} to ${to}).`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setIsTyping(false);
          setTimeout(() => scrollToBottom(true), 200);
          return;
        }

        const preview = items
          .slice(0, 10)
          .map((item) => `${item.rank}. **${item.partNo}** — ${previewMetric(item)}`)
          .join('\n');

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📊 **${title} — ${label}**\n\nTop ${Math.min(items.length, 10)} of **${items.length}** parts sold in period:\n\n${preview}${items.length > 10 ? `\n\n…and ${items.length - 10} more.` : ''}\n\n*Profit = Revenue − Cost (from invoice avg cost). Only items with sales in this period are included.*\n\nUse **Print PDF** for the full report.`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Print PDF',
              action: () => {
                printItemAnalyticsPdf(items, parsed, label, from, to);
              },
              variant: 'default',
              icon: <FileText className="h-3 w-3" />,
            },
            {
              label: 'Open Reports',
              action: () => navigate('/reports'),
              variant: 'outline',
              icon: <BarChart3 className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ Could not generate the report: ${error.message || 'Unknown error'}\n\nTry **Reports → Sales Reports → Item Sales Analytics** manually.`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
      }
    },
    [navigate, scrollToBottom],
  );

  const lookupCustomerLastInvoice = useCallback(
    async (customerName: string, customerId?: string) => {
      try {
        setIsTyping(true);

        let matchedCustomer: { id: string; name: string } | null = null;

        if (customerId) {
          matchedCustomer = { id: customerId, name: customerName };
        } else {
          const customersRes = await apiClient.getCustomers({
            search: customerName,
            limit: 20,
          });
          const customersList = Array.isArray(customersRes)
            ? customersRes
            : (customersRes as { data?: Array<{ id: string; name: string }> }).data;

          const normalized = customerName.toLowerCase();
          if (Array.isArray(customersList) && customersList.length > 0) {
            matchedCustomer =
              customersList.find((c) => c.name.toLowerCase() === normalized) ||
              customersList.find(
                (c) =>
                  c.name.toLowerCase().includes(normalized) ||
                  normalized.includes(c.name.toLowerCase()),
              ) ||
              customersList[0];
          }
        }

        const response = await apiClient.getLatestCustomerInvoice(
          matchedCustomer
            ? {
                customer_id: matchedCustomer.id,
                customer_name: matchedCustomer.name,
              }
            : { customer_name: customerName },
        );

        if (response.error) {
          throw new Error(response.error);
        }

        const invoice = (response as { data?: null | Record<string, unknown> }).data;

        if (!invoice) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📄 No sales invoices found for customer **${matchedCustomer?.name || customerName}**.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        const inv = invoice as {
          id: string;
          invoiceNo: string;
          invoiceDate: string;
          customerName: string;
          status: string;
          paymentStatus: string;
          grandTotal: number;
          paidAmount: number;
          itemCount: number;
        };

        const balance = Math.max(0, inv.grandTotal - inv.paidAmount);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📄 **Latest invoice — ${inv.customerName}**\n\n• **Invoice No:** ${inv.invoiceNo}\n• **Date:** ${formatInvoiceDate(inv.invoiceDate)}\n• **Status:** ${inv.status}\n• **Payment:** ${inv.paymentStatus}\n• **Grand Total:** Rs ${inv.grandTotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n• **Paid:** Rs ${inv.paidAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n• **Balance:** Rs ${balance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n• **Line items:** ${inv.itemCount}`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Open Sales Invoices',
              action: () => navigate('/sales/invoice'),
              variant: 'outline',
              icon: <FileText className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ Could not look up the invoice: ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
      }
    },
    [navigate, scrollToBottom],
  );

  const startCustomerLastInvoiceFlow = useCallback(() => {
    setConversationFlow({
      type: 'customer_last_invoice',
      step: 1,
      data: {},
    });

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content:
        '📄 **Customer last invoice**\n\nWhich customer? **Select from the list below**, or type the customer name in the chat box and press Enter.\n\n_Example: NETCO (PVT) LTD_',
      timestamp: new Date(),
      interactiveComponent: 'customer_last_invoice_selection',
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setIsTyping(false);
    setTimeout(() => scrollToBottom(true), 200);
  }, [scrollToBottom]);

  const handleCustomerLastInvoiceFlowResponse = useCallback(
    async (text: string) => {
      const name = text.trim();
      if (!name) {
        setIsTyping(false);
        return;
      }

      setConversationFlow({ type: null, step: 0, data: {} });
      await lookupCustomerLastInvoice(name);
    },
    [lookupCustomerLastInvoice],
  );

  const handleCustomerSelectedForLastInvoice = useCallback(
    async (customerId: string, customerName: string) => {
      setConversationFlow({ type: null, step: 0, data: {} });

      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Customer: **${customerName}**\n\nLooking up latest invoice…`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      await lookupCustomerLastInvoice(customerName, customerId);
    },
    [lookupCustomerLastInvoice],
  );

  const handleCustomerLastInvoiceQuery = useCallback(
    async (query: string) => {
      const customerName = extractCustomerNameFromInvoiceQuery(query);

      if (!customerName) {
        startCustomerLastInvoiceFlow();
        return;
      }

      setConversationFlow({ type: null, step: 0, data: {} });
      await lookupCustomerLastInvoice(customerName);
    },
    [lookupCustomerLastInvoice, startCustomerLastInvoiceFlow],
  );

  const lookupItemStock = useCallback(
    async (searchTerm: string, partId?: string, partNo?: string) => {
      try {
        setIsTyping(true);

        let matchedPart: { id: string; partNo: string; description?: string } | null = null;

        if (partId) {
          matchedPart = { id: partId, partNo: partNo || searchTerm };
        } else {
          const normalized = searchTerm.toLowerCase().trim();

          try {
            const byPartNoRes: any = await apiClient.getPartByPartNo(searchTerm);
            const byPartNo = byPartNoRes?.data || byPartNoRes;
            if (byPartNo?.id) {
              matchedPart = {
                id: byPartNo.id,
                partNo: byPartNo.partNo || byPartNo.part_no || searchTerm,
                description: byPartNo.description,
              };
            }
          } catch {
            // fall through to search
          }

          if (!matchedPart) {
            const partsRes = await apiClient.getParts({ search: searchTerm, limit: 20 });
            const partsList = Array.isArray(partsRes)
              ? partsRes
              : (partsRes as { data?: Array<{ id: string; part_no?: string; partNo?: string; description?: string }> }).data;

            if (Array.isArray(partsList) && partsList.length > 0) {
              const partNoOf = (p: { part_no?: string; partNo?: string }) =>
                String(p.part_no ?? p.partNo ?? "").trim();
              matchedPart =
                partsList.find((p) => partNoOf(p).toLowerCase() === normalized) ||
                partsList.find(
                  (p) =>
                    partNoOf(p).toLowerCase().includes(normalized) ||
                    (p.description || '').toLowerCase().includes(normalized),
                ) ||
                {
                  id: partsList[0].id,
                  partNo: partNoOf(partsList[0]) || searchTerm,
                  description: partsList[0].description,
                };
            }
          }
        }

        if (!matchedPart) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📦 No item found matching **${searchTerm}**. Try the exact part number or pick from the list.`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        const balanceRes: any = await apiClient.getStockBalance(matchedPart.id);
        const balance = balanceRes?.data || balanceRes;

        if (balanceRes?.error || !balance) {
          throw new Error(balanceRes?.error || 'Could not load stock balance');
        }

        const currentStock = balance.current_stock ?? balance.currentStock ?? 0;
        const availableStock = balance.available_stock ?? balance.availableStock ?? 0;
        const reservedStock = balance.reserved_stock ?? balance.reservedStock ?? 0;
        const reorderLevel = balance.reorder_level ?? balance.reorderLevel ?? 0;
        const description =
          balance.part_description || matchedPart.description || 'No description';
        const partNoLabel = balance.part_no || matchedPart.partNo;
        const stockPageSearch = encodeURIComponent(partNoLabel || matchedPart.partNo || searchTerm);

        let statusLine = '✅ In stock';
        if (balance.is_out_of_stock || currentStock <= 0) {
          statusLine = '🔴 Out of stock';
        } else if (balance.is_low_stock) {
          statusLine = '⚠️ Low stock';
        }

        const brandLine = balance.brand ? `\n• **Brand:** ${balance.brand}` : '';
        const categoryLine = balance.category ? `\n• **Category:** ${balance.category}` : '';

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📦 **Stock — ${partNoLabel}**\n_${description}_\n\n• **Current stock:** ${currentStock.toLocaleString('en-PK')}\n• **Available:** ${availableStock.toLocaleString('en-PK')}\n• **Reserved:** ${reservedStock.toLocaleString('en-PK')}\n• **Reorder level:** ${reorderLevel.toLocaleString('en-PK')}\n• **Status:** ${statusLine}${brandLine}${categoryLine}`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Open Current Stock',
              action: () => navigate(`/inventory/current-stock?search=${stockPageSearch}`),
              variant: 'outline',
              icon: <Package className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ Could not look up stock: ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
      }
    },
    [navigate, scrollToBottom],
  );

  const startItemStockFlow = useCallback(() => {
    setConversationFlow({
      type: 'item_stock_lookup',
      step: 1,
      data: {},
    });

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content:
        '📦 **Item stock lookup**\n\nWhich item? **Search and select from the list below**, or type the part number / description in the chat box and press Enter.\n\n_Example: ABC-123 or oil filter_',
      timestamp: new Date(),
      interactiveComponent: 'item_stock_selection',
    };
    setMessages((prev) => [...prev, assistantMessage]);
    setIsTyping(false);
    setTimeout(() => scrollToBottom(true), 200);
  }, [scrollToBottom]);

  const handleItemStockFlowResponse = useCallback(
    async (text: string) => {
      const term = text.trim();
      if (!term) {
        setIsTyping(false);
        return;
      }

      setConversationFlow({ type: null, step: 0, data: {} });
      await lookupItemStock(term);
    },
    [lookupItemStock],
  );

  const handleItemSelectedForStock = useCallback(
    async (partId: string, partNo: string, description?: string) => {
      setConversationFlow({ type: null, step: 0, data: {} });

      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Item selected: **${partNo}**${description ? `\n_${description}_` : ''}\n\nLooking up stock…`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      await lookupItemStock(partNo, partId, partNo);
    },
    [lookupItemStock],
  );

  const handleItemStockQuery = useCallback(
    async (query: string) => {
      const partTerm = extractPartSearchFromStockQuery(query);

      if (!partTerm) {
        startItemStockFlow();
        return;
      }

      setConversationFlow({ type: null, step: 0, data: {} });
      await lookupItemStock(partTerm);
    },
    [lookupItemStock, startItemStockFlow],
  );

  const generateCustomerWiseItemAnalyticsReport = useCallback(
    async (flow: ConversationFlow) => {
      const {
        customerType,
        customerId,
        customerName,
        fromDate,
        toDate,
        rangeLabel,
        sortBy,
        order,
      } = flow.data;
      if (!customerType || !fromDate || !toDate || !sortBy || !order) return;

      const spec = buildItemReportSpec(sortBy, order);

      try {
        setIsTyping(true);
        const response = await apiClient.getCustomerWiseTopItemsReport({
          from_date: fromDate,
          to_date: toDate,
          customer_type: customerType,
          customer_id: customerType === 'registered' ? customerId : undefined,
          customer_name: customerType === 'walking' ? customerName : undefined,
          limit: 50,
          sort_by: sortBy,
          order,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const items = (response.data || []) as SalesItemAnalyticsRow[];
        const meta = (response as { meta?: { customer_name?: string } }).meta;
        const displayCustomer =
          customerName ||
          (meta?.customer_name && meta.customer_name !== 'Unknown'
            ? meta.customer_name
            : null) ||
          meta?.customer_name ||
          'Customer';

        setConversationFlow({
          type: null,
          step: 0,
          data: { lastItemReport: items },
        });

        if (items.length === 0) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📊 **${spec.title} — ${displayCustomer}**\n\nNo sales items found for **${rangeLabel || 'selected period'}** (${fromDate} to ${toDate}).\n\n_Includes approved, delivered, and return invoices._`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        const preview = items
          .slice(0, 10)
          .map((item) => `${item.rank}. **${item.partNo}** — ${spec.previewMetric(item)}`)
          .join('\n');

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📊 **${spec.title} — ${displayCustomer}**\n**Period:** ${rangeLabel} (${fromDate} to ${toDate})\n\nTop ${Math.min(items.length, 10)} of **${items.length}** parts for this customer:\n\n${preview}${items.length > 10 ? `\n\n…and ${items.length - 10} more.` : ''}\n\nUse **Print PDF** for the full report.`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Print PDF',
              action: () => {
                printCustomerWiseItemAnalyticsPdf(
                  items,
                  spec,
                  displayCustomer,
                  rangeLabel || 'Selected period',
                  fromDate,
                  toDate,
                );
              },
              variant: 'default',
              icon: <FileText className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ Could not generate customer item report: ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
      }
    },
    [scrollToBottom],
  );

  const generateCustomerWiseSalesReport = useCallback(
    async (flow: ConversationFlow) => {
      const { customerType, customerId, customerName, fromDate, toDate, rangeLabel } =
        flow.data;
      if (!customerType || !fromDate || !toDate) return;

      try {
        setIsTyping(true);
        const response = await apiClient.getCustomerWiseSalesReport({
          from_date: fromDate,
          to_date: toDate,
          customer_type: customerType,
          customer_id: customerType === 'registered' ? customerId : undefined,
          customer_name: customerType === 'walking' ? customerName : undefined,
        });

        if (response.error) {
          throw new Error(response.error);
        }

        const report = (response.data || response) as CustomerWiseSalesReport;
        const invoices = report.invoices || [];

        setConversationFlow({ type: null, step: 0, data: { lastReport: report } });

        if (invoices.length === 0) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `📊 **Customer-wise Sales — ${report.customerName || customerName}**\n\nNo approved sales invoices found for **${rangeLabel || 'selected period'}** (${fromDate} to ${toDate}).`,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMessage]);
          return;
        }

        const preview = invoices
          .slice(0, 8)
          .map(
            (inv) =>
              `• **${inv.invoiceNo}** (${inv.invoiceDate}) — Rs ${inv.grandTotal.toLocaleString('en-PK', { minimumFractionDigits: 2 })} | ${inv.itemCount} item(s) | ${inv.paymentStatus}`,
          )
          .join('\n');

        const typeLabel =
          customerType === 'walking' ? 'Walk-in' : 'Party';

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `📊 **Customer-wise Sales Report**\n\n**Customer:** ${report.customerName} (${typeLabel})\n**Period:** ${rangeLabel} (${fromDate} to ${toDate})\n\n**Summary:** ${report.summary.invoiceCount} invoice(s) | Total Rs ${report.summary.totalAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })} | Paid Rs ${report.summary.totalPaid.toLocaleString('en-PK', { minimumFractionDigits: 2 })} | Balance Rs ${report.summary.totalBalance.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n\n**Invoices:**\n${preview}${invoices.length > 8 ? `\n\n…and ${invoices.length - 8} more.` : ''}\n\nUse **Print PDF** for the full report with line items.`,
          timestamp: new Date(),
          actions: [
            {
              label: 'Print PDF',
              action: () => {
                printCustomerWiseSalesPdf(
                  report,
                  rangeLabel || 'Selected period',
                  fromDate,
                  toDate,
                );
              },
              variant: 'default',
              icon: <FileText className="h-3 w-3" />,
            },
            {
              label: 'Open Reports',
              action: () => navigate('/reports'),
              variant: 'outline',
              icon: <BarChart3 className="h-3 w-3" />,
            },
          ],
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error: any) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ Could not generate customer sales report: ${error.message || 'Unknown error'}`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } finally {
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
      }
    },
    [navigate, scrollToBottom],
  );

  const promptReportTypeSelection = useCallback(
    (flow: ConversationFlow, customerName: string) => {
      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Customer: **${customerName}**\n\nChoose the **report type** for this customer:`,
        timestamp: new Date(),
        interactiveComponent: 'customer_item_report_type',
      };
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const finalizeCustomerWiseReport = useCallback(
    (updatedFlow: ConversationFlow) => {
      const { reportMode, sortBy, order, customerName } = updatedFlow.data;

      if (reportMode === 'invoices') {
        const message: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ Customer: **${customerName}**\n\nGenerating sales report…`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, message]);
        generateCustomerWiseSalesReport(updatedFlow);
        return;
      }

      if (reportMode === 'items' && sortBy && order) {
        const message: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: `✅ Customer: **${customerName}**\n\nGenerating item analytics…`,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, message]);
        generateCustomerWiseItemAnalyticsReport(updatedFlow);
        return;
      }

      setConversationFlow({ ...updatedFlow, step: 3 });
      promptReportTypeSelection(updatedFlow, customerName || 'Customer');
    },
    [
      generateCustomerWiseSalesReport,
      generateCustomerWiseItemAnalyticsReport,
      promptReportTypeSelection,
    ],
  );

  const handleReportTypeSelected = useCallback(
    (sortBy: ItemReportSort, order: ItemReportOrder, label: string) => {
      const flow = conversationFlow;
      if (flow.type !== 'customer_wise_sales_report') return;

      const updatedFlow: ConversationFlow = {
        ...flow,
        step: 4,
        data: {
          ...flow.data,
          reportMode: 'items',
          sortBy,
          order,
        },
      };
      setConversationFlow(updatedFlow);

      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `✅ Report type: **${label}**\n\nGenerating report…`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, message]);
      generateCustomerWiseItemAnalyticsReport(updatedFlow);
    },
    [conversationFlow, generateCustomerWiseItemAnalyticsReport],
  );

  const handleInvoiceSummarySelected = useCallback(() => {
    const flow = conversationFlow;
    if (flow.type !== 'customer_wise_sales_report') return;

    const updatedFlow: ConversationFlow = {
      ...flow,
      step: 4,
      data: { ...flow.data, reportMode: 'invoices' },
    };
    setConversationFlow(updatedFlow);

    const message: Message = {
      id: Date.now().toString(),
      role: 'assistant',
      content: `✅ Report type: **Sales invoice summary**\n\nGenerating report…`,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, message]);
    generateCustomerWiseSalesReport(updatedFlow);
  }, [conversationFlow, generateCustomerWiseSalesReport]);

  const promptCustomerSelection = useCallback(
    (flow: ConversationFlow, customerType: 'walking' | 'registered') => {
      const typeLabel = customerType === 'walking' ? 'Walk-in' : 'Party';
      const message: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content:
          customerType === 'walking'
            ? `✅ Customer type: **${typeLabel}**\n\nEnter the walk-in customer name (as recorded on invoices):`
            : `✅ Customer type: **${typeLabel}**\n\nSelect the registered customer from the list:`,
        timestamp: new Date(),
        interactiveComponent:
          customerType === 'walking'
            ? 'walking_customer_name_input'
            : 'registered_customer_selection',
      };
      setMessages((prev) => [...prev, message]);
      scrollToBottom();
    },
    [scrollToBottom],
  );

  const handleCustomerTypeSelected = useCallback(
    (customerType: 'walking' | 'registered') => {
      const flow = conversationFlow;
      if (flow.type !== 'customer_wise_sales_report') return;

      setConversationFlow({
        ...flow,
        step: 2,
        data: { ...flow.data, customerType },
      });
      promptCustomerSelection(flow, customerType);
    },
    [conversationFlow, promptCustomerSelection],
  );

  const handleRegisteredCustomerSelected = useCallback(
    (customerId: string, customerName: string) => {
      const flow = conversationFlow;
      if (flow.type !== 'customer_wise_sales_report') return;

      const updatedFlow: ConversationFlow = {
        ...flow,
        step: 3,
        data: { ...flow.data, customerId, customerName },
      };
      setConversationFlow(updatedFlow);
      finalizeCustomerWiseReport(updatedFlow);
    },
    [conversationFlow, finalizeCustomerWiseReport],
  );

  const handleWalkingCustomerNameSubmitted = useCallback(
    (customerName: string) => {
      const flow = conversationFlow;
      if (flow.type !== 'customer_wise_sales_report') return;

      const updatedFlow: ConversationFlow = {
        ...flow,
        step: 3,
        data: { ...flow.data, customerName },
      };
      setConversationFlow(updatedFlow);
      finalizeCustomerWiseReport(updatedFlow);
    },
    [conversationFlow, finalizeCustomerWiseReport],
  );

  const startCustomerWiseSalesFlow = useCallback(
    (query: string) => {
      const range =
        parseReportDateRange(query) ?? getCurrentPakistanFinancialYearRange();

      const itemMode = isCustomerWiseItemAnalyticsQuery(query);
      const explicitDirection = hasExplicitItemReportDirection(query);
      const itemSpec = itemMode ? parseItemReportSpecFromQuery(query) : null;

      let reportMode: 'invoices' | 'items' | undefined;
      if (itemMode) {
        reportMode = 'items';
      } else if (isCustomerWiseInvoiceReportQuery(query)) {
        reportMode = 'invoices';
      }

      const flowData: ConversationFlow['data'] = {
        fromDate: range.from,
        toDate: range.to,
        rangeLabel: range.label,
        reportMode,
      };

      if (itemMode && explicitDirection && itemSpec) {
        flowData.sortBy = itemSpec.sortBy;
        flowData.order = itemSpec.order;
      }

      setConversationFlow({
        type: 'customer_wise_sales_report',
        step: 1,
        data: flowData,
      });

      const reportHint = itemMode
        ? '\n\n_Item analytics report — you will pick the customer next._'
        : '';

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `📊 **Customer-wise Report**\n\nPeriod: **${range.label}** (${range.from} to ${range.to})${reportHint}\n\nFirst, select the **customer type**:\n\n• **Walk-in** — walk-in customers (name typed on invoice)\n• **Party** — registered credit customers from your customer list`,
        timestamp: new Date(),
        interactiveComponent: 'customer_type_selection',
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setIsTyping(false);
      setTimeout(() => scrollToBottom(true), 200);
    },
    [scrollToBottom],
  );

  const handleCustomerWiseFlowResponse = useCallback(
    async (text: string) => {
      const flow = conversationFlow;
      if (flow.type !== 'customer_wise_sales_report') return;

      if (flow.step === 1) {
        const customerType = parseCustomerTypeFromText(text);
        if (!customerType) {
          const assistantMessage: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content:
              'Please choose **Walk-in** or **Party**, or type "walk-in" / "party".',
            timestamp: new Date(),
            interactiveComponent: 'customer_type_selection',
          };
          setMessages((prev) => [...prev, assistantMessage]);
          setIsTyping(false);
          return;
        }
        handleCustomerTypeSelected(customerType);
        setIsTyping(false);
        return;
      }

      if (flow.step === 2 && flow.data.customerType === 'walking') {
        if (!text.trim()) {
          setIsTyping(false);
          return;
        }
        handleWalkingCustomerNameSubmitted(text.trim());
        return;
      }

      if (flow.step === 2 && flow.data.customerType === 'registered') {
        try {
          setIsTyping(true);
          const response = await apiClient.getCustomers({
            search: text.trim(),
            status: 'active',
            limit: 5,
          });
          const list = Array.isArray(response)
            ? response
            : (response as { data?: Array<{ id: string; name: string }> }).data;
          const match = Array.isArray(list)
            ? list.find((c) => c.name.toLowerCase() === text.trim().toLowerCase()) ||
              list[0]
            : null;
          if (match) {
            handleRegisteredCustomerSelected(match.id, match.name);
          } else {
            const assistantMessage: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              content: `No customer found matching "**${text.trim()}**". Please select from the dropdown or try another name.`,
              timestamp: new Date(),
              interactiveComponent: 'registered_customer_selection',
            };
            setMessages((prev) => [...prev, assistantMessage]);
          }
        } finally {
          setIsTyping(false);
        }
        return;
      }

      if (flow.step === 3) {
        const lower = text.toLowerCase();
        if (lower.includes('invoice') || lower.includes('summary')) {
          handleInvoiceSummarySelected();
          setIsTyping(false);
          return;
        }
        const { sortBy, order } = parseItemReportSpecFromQuery(text);
        const option = ITEM_REPORT_TYPE_OPTIONS.find(
          (o) => o.sort_by === sortBy && o.order === order,
        );
        handleReportTypeSelected(sortBy, order, option?.label || 'Item analytics');
        setIsTyping(false);
      }
    },
    [
      conversationFlow,
      handleCustomerTypeSelected,
      handleWalkingCustomerNameSubmitted,
      handleRegisteredCustomerSelected,
      handleReportTypeSelected,
      handleInvoiceSummarySelected,
    ],
  );

  // Handle message send with LongCat AI integration
  const handleSend = useCallback(async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setConversationContext(prev => [...prev.slice(-5), input.trim()]);
    const currentInput = input.trim();
    setInput('');
    setIsTyping(true);

    // Smooth scroll to show user message immediately
    setTimeout(() => scrollToBottom(true), 100);

    try {
      if (conversationFlow.type === 'customer_last_invoice') {
        await handleCustomerLastInvoiceFlowResponse(currentInput);
        return;
      }

      if (conversationFlow.type === 'item_stock_lookup') {
        await handleItemStockFlowResponse(currentInput);
        return;
      }

      if (conversationFlow.type === 'customer_wise_sales_report') {
        await handleCustomerWiseFlowResponse(currentInput);
        return;
      }

      if (isCustomerWiseReportQuery(currentInput)) {
        startCustomerWiseSalesFlow(currentInput);
        return;
      }

      if (isItemAnalyticsReportQuery(currentInput)) {
        await handleItemAnalyticsReportRequest(currentInput);
        return;
      }

      if (isCustomerInvoiceLookupQuery(currentInput)) {
        await handleCustomerLastInvoiceQuery(currentInput);
        return;
      }

      if (isItemStockLookupQuery(currentInput)) {
        await handleItemStockQuery(currentInput);
        return;
      }

      // First, check if it's a navigation/action command (high confidence)
      const intent = processUserIntent(currentInput);
      
      // Handle purchase order creation flow
      if (intent.type === 'purchase_order_creation') {
        handlePurchaseOrderCreationFlow(intent);
        return;
      }

      // Handle purchase order receiving flow
      if (intent.type === 'purchase_order_receiving') {
        handlePurchaseOrderReceivingFlow(intent);
        return;
      }

      // Handle flow responses (user responding within an active flow)
      if (intent.type === 'flow_response' && conversationFlow.type) {
        // For now, let the flow continue - interactive components handle the responses
        // This allows users to type responses if needed
        setIsTyping(false);
        return;
      }

      if (intent.type === 'customer_last_invoice') {
        await handleCustomerLastInvoiceQuery(currentInput);
        return;
      }

      if (intent.type === 'item_stock_lookup') {
        await handleItemStockQuery(currentInput);
        return;
      }

      if (intent.type === 'customer_wise_report') {
        startCustomerWiseSalesFlow(currentInput);
        return;
      }
      
      // Topic help and other high-confidence non-navigation intents (basic mode + AI fallback)
      if (
        intent.type === 'topic_help' ||
        intent.type === 'help' ||
        (intent.type === 'create' && intent.confidence >= 0.85)
      ) {
        const response = generateSmartResponse(intent);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          actions: response.actions,
        };
        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 200);
        return;
      }

      // High-confidence navigation only when user clearly wants to go somewhere
      if (intent.type === 'navigate' && intent.confidence >= 0.9) {
        const response = generateSmartResponse(intent);
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.content,
          timestamp: new Date(),
          actions: response.actions,
        };
        
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      
      // Smooth scroll to show response
      setTimeout(() => scrollToBottom(true), 200);
      
      // Auto-execute navigation
      if (response.actions?.[0] && intent.data) {
        setTimeout(() => {
          navigate(resolveNavigationPath(intent.data));
          toast.success(`Navigated to ${intent.data.description}`);
        }, 500);
      }
      return;
    }

      // For other queries, use Koncepts AI assistant if configured
      if (!longCatConfigured) {
        const fallbackIntent = processUserIntent(currentInput);
        const response = generateSmartResponse(fallbackIntent);

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content:
            response.content +
            (fallbackIntent.type === 'general'
              ? '\n\n💡 *Tip: Configure your AI API key in Settings → LongCat AI for broader answers beyond built-in guides.*'
              : ''),
          timestamp: new Date(),
          actions: response.actions,
        };

        setMessages(prev => [...prev, assistantMessage]);
        setIsTyping(false);
        setTimeout(() => scrollToBottom(true), 100);
        return;
      }

      const conversationHistory = messages
        .slice(-10)
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        }));

      const response = await apiClient.sendAssistantChat({
        messages: [
          ...conversationHistory,
          { role: 'user', content: currentInput },
        ],
        currentPath: pathname,
        conversationSummary: conversationContext.slice(-3).join('\n'),
        max_tokens: 1200,
        temperature: 0.6,
      });

      if (response.error) {
        throw new Error(response.error);
      }

      const aiResponse =
        (response.data as { content?: string } | null)?.content ||
        'I apologize, but I could not generate a response.';

      // Check if AI response suggests navigation
      const navIntent = processUserIntent(aiResponse);
      let actions: ActionButton[] | undefined;
      
      if (navIntent.type === 'navigate' && navIntent.confidence >= 0.7) {
        const navResponse = generateSmartResponse(navIntent);
        actions = navResponse.actions;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date(),
        actions,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      
      // Smooth scroll to show AI response after a brief delay
      setTimeout(() => scrollToBottom(true), 250);

    } catch (error: any) {
      
      // Fallback to rule-based response
      const intent = processUserIntent(currentInput);
      const response = generateSmartResponse(intent);
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.content + '\n\n⚠️ *Note: AI service unavailable. Using fallback response. Please check LongCat API settings in Settings → LongCat AI.*',
        timestamp: new Date(),
        actions: response.actions,
      };
      
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
      
      // Smooth scroll to show fallback response
      setTimeout(() => scrollToBottom(true), 200);
      
      toast.error('AI service unavailable. Using fallback mode.');
    }
  }, [input, messages, processUserIntent, generateSmartResponse, getSystemPrompt, navigate, longCatConfigured, scrollToBottom, conversationFlow, handlePurchaseOrderCreationFlow, handlePurchaseOrderReceivingFlow, handleItemAnalyticsReportRequest, handleCustomerWiseFlowResponse, startCustomerWiseSalesFlow, handleCustomerLastInvoiceQuery, handleCustomerLastInvoiceFlowResponse, handleCustomerSelectedForLastInvoice, handleItemStockQuery, handleItemStockFlowResponse, handleItemSelectedForStock]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Handle quick action click
  const handleQuickAction = useCallback((action: QuickAction) => {
    if (action.path && action.path !== pathname) {
      navigate(action.path);
      toast.success(`Navigated to ${action.label}`);
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Help me with: ${action.label}`,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setIsTyping(true);

    setTimeout(() => {
      const response = getQuickActionResponse(action.action);
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsTyping(false);
    }, 500);
  }, [navigate, pathname]);

  // Quick action responses
  const getQuickActionResponse = (action: string): string => {
    const responses: Record<string, string> = {
      create_invoice: "📄 **Create Invoice**\n\n1. Select customer\n2. Add line items\n3. Apply discounts\n4. Review & save\n\n💡 Pro tip: Use item search to quickly find products!",
      add_part: "📦 **Add New Part**\n\n1. Enter part code & name\n2. Set category & brand\n3. Configure pricing\n4. Set stock levels\n5. Save\n\n💡 Use unique part codes for easy tracking.",
      view_reports: "📊 **Reports Center**\n\nAvailable reports:\n• Sales analysis\n• Stock movement\n• Customer aging\n• Expense breakdown\n• Financial summaries",
      expenses: "💰 **Expense Management**\n\n• Add operational expenses\n• Categorize by type\n• Import bulk data\n• Post to accounts",
      stock: "📦 **Stock Management**\n\n• View balances\n• Transfer between locations\n• Adjust quantities\n• Track serial numbers",
      voucher: "📝 **Voucher Types**\n\n• **Payment**: Money going out\n• **Receipt**: Money coming in\n• **Journal**: General entries\n• **Contra**: Bank-to-bank",
    };
    
    return responses[action] || `I'll help you with ${action}. What would you like to know?`;
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 h-12 w-12 sm:h-14 sm:w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90 group"
        size="icon"
      >
        <Brain className="h-5 w-5 sm:h-6 sm:w-6 group-hover:scale-110 transition-transform" />
      </Button>
    );
  }

  return (
    <>
      {/* Backdrop for mobile */}
      {isOpen && !isMinimized && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 sm:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      
      <div
        className={cn(
          "fixed z-50 bg-card border-2 border-primary/30 rounded-xl shadow-2xl transition-all duration-300 flex flex-col overflow-hidden",
          // Enhanced shadow and glow effect
          "ring-2 ring-primary/10 shadow-[0_0_20px_rgba(0,0,0,0.1)]",
          // Mobile: Full screen or nearly full screen with proper margins
          "bottom-0 right-0 left-0 sm:bottom-6 sm:right-6 sm:left-auto",
          // Ensure it doesn't overlap with header/sidebar
          "sm:max-w-[calc(100vw-2rem)]",
          isMinimized 
            ? "w-full sm:w-72 h-14 rounded-b-xl sm:rounded-xl" 
            : "w-full sm:w-[400px] md:w-[450px] lg:w-[500px] h-[calc(100vh-60px)] sm:h-[500px] sm:max-h-[calc(100vh-120px)] rounded-t-xl sm:rounded-xl"
        )}
        style={{
          // Ensure it stays within viewport
          maxHeight: 'calc(100vh - 80px)',
          // Add subtle glow
          boxShadow: '0 0 30px rgba(0, 0, 0, 0.15), 0 0 60px rgba(var(--primary), 0.1)',
        }}
      >
      {/* Header */}
      <div className="flex items-center justify-between p-2 sm:p-3 border-b-2 border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-full bg-primary/20 flex items-center justify-center relative shrink-0">
            <Brain className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 sm:h-2.5 sm:w-2.5 bg-green-500 rounded-full border-2 border-card animate-pulse" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-1.5 truncate">
              Koncepts AI
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-primary shrink-0" />
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Intelligent System Assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {!isMinimized && messages.length > 1 && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={clearHistory}
              title="Clear chat history"
            >
              <Trash className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-primary/10 hidden sm:flex"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setIsOpen(false)}
          >
            <Trash className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* Messages */}
          <ScrollArea className="flex-1 min-h-0 p-3 sm:p-4 bg-background/50" ref={scrollRef}>
            <div className="space-y-3 sm:space-y-4 pb-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex animate-in fade-in slide-in-from-bottom-2 duration-300",
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  <div className="max-w-[85%] sm:max-w-[90%] space-y-1.5 sm:space-y-2">
                    <div
                      className={cn(
                        "rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm leading-relaxed transition-all",
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md shadow-sm'
                          : 'bg-muted text-foreground rounded-bl-md shadow-sm'
                      )}
                    >
                      <div className="whitespace-pre-wrap break-words">{message.content.replace(/\*\*(.*?)\*\*/g, '$1')}</div>
                    </div>

                    {/* Interactive Components */}
                    {message.interactiveComponent && message.role === 'assistant' && (
                      <div className="mt-2 space-y-2 p-3 bg-background/50 rounded-lg border border-border/50">
                        {message.interactiveComponent === 'item_selection' && (
                          <ItemDropdown
                            onSelect={handleItemSelected}
                            selectedItems={conversationFlow.data.items}
                          />
                        )}
                        {message.interactiveComponent === 'supplier_selection' && (
                          <SupplierDropdown onSelect={handleSupplierSelected} />
                        )}
                        {message.interactiveComponent === 'quantity_input' && message.flowData && (
                          <QuantityInput
                            value={conversationFlow.data.items?.[message.flowData.itemIndex]?.quantity || 0}
                            onChange={(qty) => handleQuantityEntered(qty, message.flowData.itemIndex)}
                          />
                        )}
                        {message.interactiveComponent === 'store_selection' && (
                          <StoreDropdown onSelect={handleStoreSelected} />
                        )}
                        {message.interactiveComponent === 'rack_selection' && (
                          <RackDropdown
                            storeId={conversationFlow.data.storeId}
                            onSelect={handleRackSelected}
                          />
                        )}
                        {message.interactiveComponent === 'shelf_selection' && (
                          <ShelfDropdown
                            rackId={conversationFlow.data.rackId}
                            onSelect={handleShelfSelected}
                          />
                        )}
                        {message.interactiveComponent === 'price_input' && message.flowData && (
                          <div className="space-y-2">
                            <PriceInputs
                              priceA={conversationFlow.data.prices?.priceA || 0}
                              priceB={conversationFlow.data.prices?.priceB || 0}
                              priceM={conversationFlow.data.prices?.priceM || 0}
                              onPriceChange={(field, value) => {
                                const prices = { ...(conversationFlow.data.prices || { priceA: 0, priceB: 0, priceM: 0 }), [field]: value };
                                setConversationFlow({
                                  ...conversationFlow,
                                  data: { ...conversationFlow.data, prices },
                                });
                              }}
                            />
                            <HistoryButton
                              partId={message.flowData.partId}
                              partNo={message.flowData.partNo}
                              onClick={() => {
                                setHistoryPartId(message.flowData.partId);
                                setHistoryPartNo(message.flowData.partNo);
                                setHistoryPopupOpen(true);
                              }}
                            />
                            <Button
                              onClick={() => handlePricesEntered(conversationFlow.data.prices || { priceA: 0, priceB: 0, priceM: 0 })}
                              size="sm"
                              className="h-7 text-xs w-full"
                            >
                              Continue
                            </Button>
                          </div>
                        )}
                        {message.interactiveComponent === 'expense_form' && (
                          <div className="space-y-2">
                            <ExpenseForm
                              expenses={conversationFlow.data.expenses || []}
                              onAdd={() => {
                                const expenses = [...(conversationFlow.data.expenses || []), { type: '', amount: 0, account: '' }];
                                setConversationFlow({
                                  ...conversationFlow,
                                  data: { ...conversationFlow.data, expenses },
                                });
                              }}
                              onUpdate={(index, field, value) => {
                                const expenses = [...(conversationFlow.data.expenses || [])];
                                expenses[index] = { ...expenses[index], [field]: value };
                                setConversationFlow({
                                  ...conversationFlow,
                                  data: { ...conversationFlow.data, expenses },
                                });
                              }}
                              onRemove={(index) => {
                                const expenses = (conversationFlow.data.expenses || []).filter((_, i) => i !== index);
                                setConversationFlow({
                                  ...conversationFlow,
                                  data: { ...conversationFlow.data, expenses },
                                });
                              }}
                            />
                            <Button
                              onClick={() => handleExpensesUpdated(conversationFlow.data.expenses || [])}
                              size="sm"
                              className="h-7 text-xs w-full"
                            >
                              Continue
                            </Button>
                          </div>
                        )}
                        {message.interactiveComponent === 'received_quantity_input' && message.flowData && (
                          <QuantityInput
                            label="Received Quantity"
                            value={conversationFlow.data.receivedQuantities?.[conversationFlow.data.items?.[conversationFlow.data.currentItemIndex || 0]?.partId || ''] || 0}
                            onChange={handleReceivedQuantityEntered}
                          />
                        )}
                        {message.interactiveComponent === 'confirmation' && message.flowData && (
                          <ConfirmationButtons
                            onSave={message.flowData.type === 'purchase_order' ? handlePOCreationSave : handlePOReceivingSave}
                            onCancel={() => {
                              setConversationFlow({ type: null, step: 0, data: {} });
                              toast.info('Cancelled');
                            }}
                            saveLabel={message.flowData.type === 'purchase_order' ? 'Create PO' : 'Receive Order'}
                          />
                        )}
                        {message.interactiveComponent === 'customer_type_selection' && (
                          <CustomerTypeButtons onSelect={handleCustomerTypeSelected} />
                        )}
                        {message.interactiveComponent === 'registered_customer_selection' && (
                          <CustomerDropdown onSelect={handleRegisteredCustomerSelected} />
                        )}
                        {message.interactiveComponent === 'customer_last_invoice_selection' && (
                          <CustomerDropdown onSelect={handleCustomerSelectedForLastInvoice} />
                        )}
                        {message.interactiveComponent === 'item_stock_selection' && (
                          <ItemDropdown onSelect={handleItemSelectedForStock} />
                        )}
                        {message.interactiveComponent === 'walking_customer_name_input' && (
                          <WalkingCustomerNameInput onSubmit={handleWalkingCustomerNameSubmitted} />
                        )}
                        {message.interactiveComponent === 'customer_item_report_type' && (
                          <CustomerWiseReportTypeButtons
                            onSelect={handleReportTypeSelected}
                            onInvoiceSummary={handleInvoiceSummarySelected}
                          />
                        )}
                      </div>
                    )}
                    
                    {/* Action buttons */}
                    {message.actions && message.actions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-1.5 sm:mt-2">
                        {message.actions.map((action, idx) => (
                          <Button
                            key={idx}
                            variant={action.variant || 'default'}
                            size="sm"
                            className="h-7 sm:h-8 text-[10px] sm:text-xs gap-1 sm:gap-1.5 px-2 sm:px-3"
                            onClick={action.action}
                          >
                            <span className="scale-75 sm:scale-100">{action.icon}</span>
                            <span className="truncate">{action.label}</span>
                            <ArrowRight className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isTyping && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="bg-muted rounded-xl sm:rounded-2xl rounded-bl-md px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm">
                    <div className="flex gap-1.5 items-center">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-primary/60 rounded-full animate-bounce" />
                        <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <span className="h-1.5 w-1.5 sm:h-2 sm:w-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                      <span className="text-[10px] sm:text-xs text-muted-foreground ml-2">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Actions */}
          <div className="px-2 sm:px-3 py-1.5 sm:py-2 border-t-2 border-primary/10 bg-gradient-to-r from-muted/40 to-muted/20">
            <p className="text-[10px] sm:text-xs text-muted-foreground mb-1.5 sm:mb-2 flex items-center gap-1">
              <Zap className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Quick Actions
            </p>
            <div className="flex flex-wrap gap-1 sm:gap-1.5">
              {getQuickActions().map((action, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  className="h-6 sm:h-7 text-[10px] sm:text-xs gap-1 bg-background hover:bg-primary/10 hover:border-primary/30 px-2 sm:px-3"
                  onClick={() => handleQuickAction(action)}
                >
                  <span className="scale-75 sm:scale-100">{action.icon}</span>
                  <span className="truncate">{action.label}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="p-2 sm:p-3 border-t-2 border-primary/20 bg-gradient-to-r from-background to-muted/30 rounded-b-xl">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="flex-1 relative min-w-0">
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder={isListening ? "🎤 Listening..." : "Ask me anything..."}
                  className={cn(
                    "pr-3 sm:pr-4 h-9 sm:h-10 bg-muted/50 border-border focus-visible:ring-1 focus-visible:ring-primary rounded-lg sm:rounded-xl transition-all text-xs sm:text-sm",
                    isListening && "border-primary animate-pulse ring-2 ring-primary/20"
                  )}
                />
              </div>
              <Button 
                onClick={toggleVoiceInput} 
                size="icon" 
                variant={isListening ? "destructive" : "ghost"}
                className={cn(
                  "h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl",
                  isListening && "animate-pulse"
                )}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Mic className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              </Button>
              <Button 
                onClick={handleSend} 
                size="icon" 
                disabled={!input.trim()}
                className="h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg sm:rounded-xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
      </div>

      {/* History Popup */}
      <HistoryPopup
        open={historyPopupOpen}
        onOpenChange={setHistoryPopupOpen}
        partId={historyPartId}
        partNo={historyPartNo}
      />
    </>
  );
};

export default AIChatBot;
