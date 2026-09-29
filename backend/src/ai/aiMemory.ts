/**
 * AI self-learning helpers — teach commands + learned-fact loading.
 */

export type TeachCommand =
  | { type: "remember"; fact: string; topic?: string }
  | { type: "forget"; query: string }
  | { type: "list" };

const TEACH_RE =
  /^(remember|learn|teach|note that|forget|unlearn|list\s+(learned|memory|memories|facts))\b/i;

export function isTeachCommand(text: string): boolean {
  return TEACH_RE.test(String(text || "").trim());
}

export function parseTeachCommand(text: string): TeachCommand | null {
  const raw = String(text || "").trim();
  if (!raw) return null;

  const listMatch = raw.match(/^list\s+(learned|memory|memories|facts)\b/i);
  if (listMatch) return { type: "list" };

  const forgetMatch = raw.match(/^(forget|unlearn)\s+(.+)$/i);
  if (forgetMatch) {
    const query = forgetMatch[2].trim();
    if (!query) return null;
    return { type: "forget", query };
  }

  const rememberMatch = raw.match(
    /^(remember|learn|teach|note that)(?:\s+that)?\s*[:\-]?\s*(.+)$/i,
  );
  if (rememberMatch) {
    let fact = rememberMatch[2].trim();
    if (!fact) return null;

    // Optional "about X: ..." or "topic X — ..."
    let topic: string | undefined;
    const topicMatch = fact.match(
      /^(?:about|topic)\s+([^:\-–—]+)[:\-–—]\s*(.+)$/i,
    );
    if (topicMatch) {
      topic = topicMatch[1].trim().slice(0, 80);
      fact = topicMatch[2].trim();
    }

    if (fact.length < 3) return null;
    if (fact.length > 1000) fact = fact.slice(0, 1000);
    return { type: "remember", fact, topic };
  }

  return null;
}

export function formatLearnedFactsForPrompt(
  facts: Array<{ fact: string; topic?: string | null }>,
): string {
  if (!facts.length) {
    return `**LEARNED FACTS (self-learning memory)**
No user-taught facts yet. If the user says "remember …" / "learn …", acknowledge and store via the memory system.`;
  }

  const lines = facts.map((f, i) => {
    const topic = f.topic ? ` [${f.topic}]` : "";
    return `${i + 1}.${topic} ${f.fact}`;
  });

  return `**LEARNED FACTS (self-learning memory — treat as company-specific overrides)**
These were taught by users. Prefer them when they conflict with generic guidance, but never invent new "learned" facts.
${lines.join("\n")}

Users can teach you with: "remember …", "learn …", "forget …", "list learned facts".`;
}
