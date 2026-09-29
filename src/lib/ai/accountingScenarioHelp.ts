/**
 * Lightweight detectors only.
 * Do NOT return canned scenario answers here — open questions must go to the
 * live LLM (erpKnowledge + conversation). Hardcoded templates caused wrong
 * fixed replies for new user cases.
 */

/** True when the message looks like an accounts / voucher / money scenario. */
export function isAccountingScenarioQuery(query: string): boolean {
  const q = query
    .toLowerCase()
    .replace(/[?!.,]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\breciev(e|ing|ed|ables?)?\b/g, "receiv$1")
    .replace(/\breceving\b/g, "receiving")
    .trim();
  if (!q) return false;

  const accountingCue =
    /\b(vouchers?|receipts?|payments?|contras?|journals?|accounts?|ledgers?|discount|cash|bank|supplier|customer|party|expense|payables?|receivables?|branch|transfer\s+in|transfer\s+out|branch\s+transfer|debit|credit|dr\b|cr\b)\b/.test(
      q,
    );

  if (
    /\b(branch\s+transfer|transfer\s+in|transfer\s+out|inter[\s-]?branch)\b/.test(q) ||
    (/\b(payments?|receipts?|receiving|supplier|journal)\b/.test(q) &&
      /\b(branch|account|without\s+(cash|bank)|no\s+(cash|bank))\b/.test(q))
  ) {
    return true;
  }

  if (
    /\b(scenario|suppose|what if|how (do|should|can) i|how i (make|do|enter|post|create|record)|which voucher|in this system)\b/.test(
      q,
    ) &&
    accountingCue
  ) {
    return true;
  }

  if (
    accountingCue &&
    /\b(received|receive|receiving|paid|pay|discount|contra|deposit|transfer|settlement|journal|voucher)\b/.test(
      q,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * @deprecated Always returns null. Kept so callers compile; never serve fixed scenario text.
 */
export function getAccountingScenarioHelp(_query: string): string | null {
  return null;
}
