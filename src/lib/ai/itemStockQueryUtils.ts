import {
  normalizeQueryForMatching,
  containsItemMetricPhrase,
  containsReportIntentPhrase,
} from "@/lib/ai/queryNormalize";

const GENERIC_PART_PLACEHOLDERS = new Set([
  "",
  "a part",
  "an item",
  "the part",
  "the item",
  "specific item",
  "specific part",
  "a specific item",
  "a specific part",
  "an specific item",
  "part",
  "item",
  "product",
  "this item",
  "this part",
  "no specific item",
  "no specific part",
]);

export function isGenericPartPlaceholder(term: string): boolean {
  return GENERIC_PART_PLACEHOLDERS.has(term.toLowerCase().trim());
}

/** Sales / analytics questions must not be treated as single-item stock lookup. */
export function isSalesAnalyticsStyleQuery(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  if (containsItemMetricPhrase(query) && containsReportIntentPhrase(query)) {
    return true;
  }
  return (
    /\b(sold|selling|sales)\b/.test(q) &&
    /\b(month|july|august|january|february|march|april|may|june|september|october|november|december|year|period)\b/.test(
      q,
    )
  ) ||
    /\b(more than|greater than|at least|over)\s+\d+/.test(q) ||
    /\blist of all (items?|parts?)\b/.test(q) ||
    /\bquantity sold\b/.test(q) ||
    /\bitems? whose\b/.test(q);
}

export function isItemStockLookupQuery(query: string): boolean {
  const q = normalizeQueryForMatching(query);

  // Never hijack analytical / multi-item sales questions
  if (isSalesAnalyticsStyleQuery(query)) return false;

  const hasStock =
    q.includes("stock") ||
    q.includes("inventory") ||
    q.includes("available stock") ||
    q.includes("stock balance") ||
    q.includes("stock level") ||
    (q.includes("how many") &&
      (q.includes("stock") || q.includes("in hand") || q.includes("available"))) ||
    (q.includes("how much") &&
      (q.includes("stock") || q.includes("inventory"))) ||
    (q.includes("pick") && (q.includes("stock") || q.includes("inventory")));

  // Bare "quantity" alone is too broad (matches "quantity sold") — require stock context
  const quantityAsStock =
    (q.includes("quantity") || q.includes(" qty ") || q.startsWith("qty ") || q.endsWith(" qty")) &&
    (q.includes("stock") ||
      q.includes("inventory") ||
      q.includes("in hand") ||
      q.includes("available") ||
      q.includes("on hand"));

  if (!hasStock && !quantityAsStock) return false;

  const partTerm = extractPartSearchFromStockQuery(query);
  if (partTerm && !isGenericPartPlaceholder(partTerm)) return true;

  if (
    q.includes("know about") ||
    q.includes("stock of") ||
    q.includes("stock for") ||
    q.includes("inventory of") ||
    q.includes("inventory for")
  ) {
    // "specific item" alone without stock phrasing already returned false above
    if (q.includes("specific item") || q.includes("specific part")) {
      return hasStock || quantityAsStock;
    }
    return true;
  }

  // Need an explicit stock cue + part/item word — not every "item" mention
  return (
    (hasStock || quantityAsStock) &&
    (q.includes("part") || q.includes("item") || q.includes("product"))
  );
}

export function extractPartSearchFromStockQuery(query: string): string | null {
  const cleaned = normalizeQueryForMatching(query);

  const patterns = [
    /(?:pick|check|show|get|find|tell me|give me|what is|how much|how many)\s+(?:the\s+)?(?:current\s+)?(?:available\s+)?stock\s+(?:of|for)\s+(?:part|item)?\s*(.+)/i,
    /(?:stock|inventory)\s+(?:of|for)\s+(?:part|item|product)?\s*(.+)/i,
    /(?:part|item|product)\s+(?:no|number|#)?\s*(.+?)\s+(?:stock|inventory)/i,
    /(?:part|item)\s+(.+?)\s+stock/i,
    /stock\s+(?:of|for)\s+(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match?.[1]) {
      const term = match[1]
        .replace(/\b(part|item|product|number|no)\b/gi, "")
        .trim();
      if (term && !isGenericPartPlaceholder(term)) {
        return term;
      }
    }
  }

  return null;
}
