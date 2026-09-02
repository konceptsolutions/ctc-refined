import { normalizeQueryForMatching } from "@/lib/ai/queryNormalize";

export function isCustomerInvoiceLookupQuery(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  const wantsLast =
    q.includes("last") ||
    q.includes("latest") ||
    q.includes("most recent") ||
    q.includes("newest") ||
    q.includes("recent invoice");
  const mentionsInvoice = q.includes("invoice");
  if (!wantsLast || !mentionsInvoice) return false;

  const name = extractCustomerNameFromInvoiceQuery(query);
  if (name && !isGenericCustomerPlaceholder(name)) return true;

  if (
    q.includes("know about") ||
    q.includes("about last invoice") ||
    q.includes("about latest invoice")
  ) {
    return true;
  }

  return (
    q.includes("customer") ||
    q.includes("of customer") ||
    q.includes("for customer") ||
    q.includes("which customer")
  );
}

export function isGenericCustomerPlaceholder(name: string): boolean {
  const n = name.toLowerCase().trim();
  return (
    !n ||
    n === "a customer" ||
    n === "the customer" ||
    n === "customer" ||
    n === "my customer" ||
    n === "a client" ||
    n === "the client"
  );
}

export function extractCustomerNameFromInvoiceQuery(query: string): string | null {
  const cleaned = normalizeQueryForMatching(query);

  const patterns = [
    /(?:know|like to know|want to know|would like to know)\s+about\s+(?:the\s+)?(?:last|latest|most recent|newest)\s+invoice\s+(?:of|for)\s+(?:customer\s+)?(.+)/i,
    /(?:what is|what'?s|show|tell me|get|find|i want|i need)?\s*(?:the\s+)?(?:last|latest|most recent|newest)\s+invoice\s+(?:of|for)\s+customer\s+(.+)/i,
    /(?:last|latest|most recent|newest)\s+invoice\s+(?:of|for)\s+customer\s+(.+)/i,
    /(?:last|latest|most recent|newest)\s+invoice\s+(?:of|for)\s+(.+)/i,
    /customer\s+(.+?)(?:'s)?\s+(?:last|latest|most recent|newest)\s+invoice/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const name = match[1].trim();
      if (!isGenericCustomerPlaceholder(name)) {
        return name;
      }
    }
  }

  return null;
}

import { formatUiDate } from "@/utils/dateUtils";

export function formatInvoiceDate(isoOrDate: string): string {
  return formatUiDate(isoOrDate) || isoOrDate;
}
