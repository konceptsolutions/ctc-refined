import { normalizeQueryForMatching } from "@/lib/ai/queryNormalize";

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
]);

export function isGenericPartPlaceholder(term: string): boolean {
  return GENERIC_PART_PLACEHOLDERS.has(term.toLowerCase().trim());
}

export function isItemStockLookupQuery(query: string): boolean {
  const q = normalizeQueryForMatching(query);

  const hasStock =
    q.includes("stock") ||
    q.includes("inventory") ||
    q.includes("quantity") ||
    q.includes(" qty ") ||
    q.startsWith("qty ") ||
    q.endsWith(" qty") ||
    q.includes("available stock") ||
    q.includes("stock balance") ||
    q.includes("stock level") ||
    q.includes("how many") ||
    q.includes("how much") ||
    (q.includes("pick") && (q.includes("stock") || q.includes("inventory")));

  if (!hasStock) return false;

  const partTerm = extractPartSearchFromStockQuery(query);
  if (partTerm && !isGenericPartPlaceholder(partTerm)) return true;

  if (
    q.includes("know about") ||
    q.includes("stock of") ||
    q.includes("stock for") ||
    q.includes("inventory of") ||
    q.includes("inventory for") ||
    q.includes("specific item") ||
    q.includes("specific part")
  ) {
    return true;
  }

  return (
    q.includes("part") ||
    q.includes("item") ||
    q.includes("product")
  );
}

export function extractPartSearchFromStockQuery(query: string): string | null {
  const cleaned = normalizeQueryForMatching(query);

  const patterns = [
    /(?:pick|check|show|get|find|tell me|give me|what is|how much|how many)\s+(?:the\s+)?(?:current\s+)?(?:available\s+)?stock\s+(?:of|for)\s+(?:part|item)?\s*(.+)/i,
    /(?:stock|inventory|quantity|qty)\s+(?:of|for)\s+(?:part|item|product)?\s*(.+)/i,
    /(?:part|item|product)\s+(?:no|number|#)?\s*(.+?)\s+(?:stock|inventory|quantity|qty)/i,
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
