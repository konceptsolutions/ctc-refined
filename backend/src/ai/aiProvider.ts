/**
 * Build chat-completions URL for LongCat or OpenAI (and similar hosts).
 */
export function resolveChatCompletionsUrl(baseUrl: string): string {
  const base = (baseUrl || "https://api.longcat.chat").replace(/\/+$/, "");
  if (/openai\.com/i.test(base)) {
    if (/\/v1$/i.test(base)) return `${base}/chat/completions`;
    return `${base}/v1/chat/completions`;
  }
  // LongCat OpenAI-compatible path
  return `${base}/openai/v1/chat/completions`;
}

export function detectAiProvider(baseUrl: string, apiKey?: string): "openai" | "longcat" {
  if (/openai\.com/i.test(baseUrl || "") || (apiKey || "").startsWith("sk-")) {
    return "openai";
  }
  return "longcat";
}
