/**
 * Normalizes user chat input for fuzzy report / lookup intent matching.
 * Strips polite filler, fixes common typos, collapses whitespace.
 */
export function normalizeQueryForMatching(raw: string): string {
  let q = raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[?!.,;:'"()[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const typoFixes: Array<[RegExp, string]> = [
    [/\bcustmer\b/g, "customer"],
    [/\bcusotmer\b/g, "customer"],
    [/\bcustomr\b/g, "customer"],
    [/\bcustomerwize\b/g, "customerwise"],
    [/\bcustomer\s*wize\b/g, "customer wise"],
    [/\bcustomer\s*vise\b/g, "customer wise"],
    [/\bcustomer\s*wyse\b/g, "customer wise"],
    [/\bcustomer\s*wise\b/g, "customer wise"],
    [/\bsellng\b/g, "selling"],
    [/\bseling\b/g, "selling"],
    [/\bsellin\b/g, "selling"],
    [/\bsaleing\b/g, "selling"],
    [/\blest\b/g, "least"],
    [/\bleatest\b/g, "least"],
    [/\blowst\b/g, "lowest"],
    [/\bmoast\b/g, "most"],
    [/\bhigest\b/g, "highest"],
    [/\bproft\b/g, "profit"],
    [/\bprofitablity\b/g, "profitability"],
    [/\bprofittability\b/g, "profitability"],
    [/\bfinantial\b/g, "financial"],
    [/\brevenu\b/g, "revenue"],
    [/\brevenuee\b/g, "revenue"],
    [/\bitmes\b/g, "items"],
    [/\biten\b/g, "items"],
    [/\binvoicee\b/g, "invoice"],
    [/\binvocie\b/g, "invoice"],
    [/\binvoce\b/g, "invoice"],
    [/\blatestt\b/g, "latest"],
    [/\banalytics\b/g, "analytics"],
    [/\bdemanding\b/g, "demanding"],
    [/\bdemandng\b/g, "demanding"],
    [/\bpls\b/g, "please"],
    [/\bplz\b/g, "please"],
    [/\bkow\b/g, "know"],
    [/\bknw\b/g, "know"],
    [/\bstok\b/g, "stock"],
    [/\bstck\b/g, "stock"],
    [/\binventry\b/g, "inventory"],
    [/\binventroy\b/g, "inventory"],
    [/\bquantiy\b/g, "quantity"],
    [/\bqtyy\b/g, "qty"],
    [/\bitm\b/g, "item"],
    [/\bitme\b/g, "item"],
  ];

  for (const [pattern, replacement] of typoFixes) {
    q = q.replace(pattern, replacement);
  }

  const phraseFillers = [
    "could you please",
    "can you please",
    "would you please",
    "would you kindly",
    "i would like to",
    "i would like",
    "i want to",
    "i need to",
    "i want",
    "i need",
    "give me",
    "show me",
    "tell me",
    "help me",
    "get me",
    "let me have",
    "like to know",
    "want to know",
    "need to know",
    "would like to know",
    "like to kow",
    "want to kow",
    "can you",
    "could you",
    "would you",
    "please",
    "kindly",
    "just",
    "also",
    "thanks",
    "thank you",
  ];

  for (const phrase of phraseFillers) {
    q = q.replace(new RegExp(`\\b${phrase.replace(/ /g, "\\s+")}\\b`, "g"), " ");
  }

  const wordFillers = new Set([
    "a",
    "an",
    "the",
    "me",
    "my",
    "to",
    "of",
    "with",
    "and",
    "is",
    "are",
    "was",
    "were",
    "be",
    "it",
    "this",
    "that",
    "some",
    "any",
    "all",
  ]);

  q = q
    .split(" ")
    .filter((word) => word.length > 0 && !wordFillers.has(word))
    .join(" ");

  return q.replace(/\s+/g, " ").trim();
}

/** True if normalized text contains all tokens in order (gaps allowed). */
export function containsTokenSequence(normalized: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  let from = 0;
  for (const token of tokens) {
    const idx = normalized.indexOf(token, from);
    if (idx < 0) return false;
    from = idx + token.length;
  }
  return true;
}

export function containsCustomerWisePhrase(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  if (
    q.includes("customer wise") ||
    q.includes("customerwise") ||
    q.includes("by customer") ||
    q.includes("per customer") ||
    q.includes("customer sales record")
  ) {
    return true;
  }
  if (/\bcustomer\b/.test(q) && /\bwise\b/.test(q)) {
    return true;
  }
  if (/\bcustomer\b/.test(q) && /\bsale report\b/.test(q)) {
    return true;
  }
  if (/\bcustomer\b/.test(q) && /\bsales report\b/.test(q)) {
    return true;
  }
  return containsTokenSequence(q, ["customer", "wise"]);
}

export function containsItemMetricPhrase(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  return (
    q.includes("selling") ||
    q.includes("demand") ||
    q.includes("demanding") ||
    q.includes("sold") ||
    q.includes("sale item") ||
    q.includes("sales item") ||
    q.includes("revenue") ||
    q.includes("profit") ||
    q.includes("profitability") ||
    q.includes("margin") ||
    q.includes("turnover") ||
    (q.includes("item") && (q.includes("most") || q.includes("least"))) ||
    q.includes("least sell") ||
    q.includes("most sell") ||
    q.includes("least revenue") ||
    q.includes("most revenue") ||
    q.includes("least profit") ||
    q.includes("most profit") ||
    q.includes("max profit") ||
    q.includes("min profit")
  );
}

export function containsReportIntentPhrase(query: string): boolean {
  const q = normalizeQueryForMatching(query);
  return (
    q.includes("report") ||
    q.includes("pdf") ||
    q.includes("export") ||
    q.includes("list") ||
    q.includes("generate") ||
    q.includes("analytics") ||
    q.includes("want") ||
    q.includes("need") ||
    q.includes("show") ||
    q.includes("give") ||
    q.includes("record") ||
    q.includes("most") ||
    q.includes("least") ||
    q.includes("top") ||
    q.includes("bottom") ||
    q.includes("highest") ||
    q.includes("lowest") ||
    q.includes("max") ||
    q.includes("min") ||
    q.includes("best") ||
    q.includes("worst") ||
    containsCustomerWisePhrase(query) ||
    containsItemMetricPhrase(query)
  );
}
