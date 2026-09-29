/**
 * Client-side detection for AI teach / self-learning commands.
 * Server is authoritative via /api/ai-assistant/memory and /chat.
 */

const TEACH_RE =
  /^(remember|learn|teach|note that|forget|unlearn|list\s+(learned|memory|memories|facts))\b/i;

export function isTeachCommand(text: string): boolean {
  return TEACH_RE.test(String(text || "").trim());
}
