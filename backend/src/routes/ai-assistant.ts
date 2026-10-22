import express, { Response } from "express";
import { randomUUID } from "crypto";
import prisma from "../config/database.js";
import fetch from "node-fetch";
import { buildErpSystemPrompt } from "../ai/erpKnowledge.js";
import {
  formatLearnedFactsForPrompt,
  isTeachCommand,
  parseTeachCommand,
} from "../ai/aiMemory.js";
import { detectAiProvider, resolveChatCompletionsUrl } from "../ai/aiProvider.js";
import { AI_DB_TOOLS, executeAiDbTool } from "../ai/aiDbTools.js";
import { resolveAiExportFile } from "../ai/aiExportFiles.js";
import { AuthRequest } from "../middleware/authMiddleware.js";
import path from "path";

const router = express.Router();

const MAX_LEARNED_FACTS_IN_PROMPT = 40;
const MAX_TOOL_ROUNDS = 5;

/** Detect questions that need real DB numbers (not how-to guidance). */
function shouldForceLiveDataTools(text: string): boolean {
  const q = String(text || "").toLowerCase().replace(/[?!.,]/g, " ");
  if (!q.trim()) return false;

  const isHowTo =
    /\b(how (do|to|can|does|should)|explain|guide|steps?|walk me|navigate|take me|go to|open)\b/.test(
      q,
    );
  const hasLiveSignal =
    /\b(balance|outstanding|receivable|payable|stock|inventory|grand total|amount due|paid amount)\b/.test(
      q,
    ) ||
    // "babalbhar account details" / typos like "accout"
    /\b(account|accounts|accout|acct|customer|supplier|employee)\b/.test(q) ||
    (/\b(details?|info|information|lookup|find|show)\b/.test(q) &&
      !/\b(how to|how do|explain|guide)\b/.test(q)) ||
    (/\b(top|highest|maximum|max|lowest|least|best|worst)\b/.test(q) &&
      /\b(sale|sales|customer|revenue|turnover|buyer|client)\b/.test(q)) ||
    (/\b(who|which)\b/.test(q) &&
      /\b(customer|buyer|client|sold|sale|sales)\b/.test(q)) ||
    /\b(total|sum|overall)\s+(sale|sales|revenue|turnover)\b/.test(q) ||
    (/\b(how much|how many)\b/.test(q) &&
      /\b(sale|sales|stock|balance|invoice|owing|owe|due)\b/.test(q)) ||
    /\blist\s+(of\s+)?(invoice|customer|supplier|voucher|part|account)/.test(
      q,
    ) ||
    /\b(invoice|voucher|po|dpo)\s*(no\.?|number|#)?\s*[a-z0-9-]{3,}/i.test(
      text,
    );

  if (isHowTo && !hasLiveSignal) return false;
  return hasLiveSignal;
}

async function callChatCompletions(opts: {
  apiKey: string;
  baseUrl: string;
  body: Record<string, unknown>;
}) {
  const response = await fetch(resolveChatCompletionsUrl(opts.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(opts.body),
  });

  let responseData: any;
  try {
    responseData = await response.json();
  } catch {
    const text = await response.text();
    return {
      ok: false as const,
      status: response.status,
      error: "Invalid response from AI provider",
      details: text,
      data: null,
    };
  }

  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error:
        responseData?.error?.message ||
        "Failed to get response from AI provider",
      details: responseData,
      data: responseData,
    };
  }

  return {
    ok: true as const,
    status: response.status,
    error: null,
    details: null,
    data: responseData,
  };
}

async function getAiSettings() {
  const settings = await prisma.longCatSettings.findFirst();
  const apiKey =
    settings?.apiKey ||
    process.env.OPENAI_API_KEY ||
    process.env.LONGCAT_API_KEY ||
    "";
  const looksOpenAi = detectAiProvider(settings?.baseUrl || "", apiKey) === "openai";
  return {
    apiKey,
    model:
      settings?.model ||
      (looksOpenAi ? "gpt-4o-mini" : "LongCat-Flash-Chat"),
    baseUrl:
      settings?.baseUrl ||
      (looksOpenAi ? "https://api.openai.com" : "https://api.longcat.chat"),
  };
}

function memoryModel() {
  return (prisma as any).aiLearnedFact;
}

function feedbackModel() {
  return (prisma as any).aiMessageFeedback;
}

async function loadActiveFacts(userId?: string | null) {
  const model = memoryModel();
  if (!model?.findMany) return [];

  const rows = await model.findMany({
    where: {
      status: "active",
      OR: [{ userId: null }, ...(userId ? [{ userId }] : [])],
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_LEARNED_FACTS_IN_PROMPT,
    select: { id: true, fact: true, topic: true, source: true, updatedAt: true },
  });
  return Array.isArray(rows) ? rows : [];
}

async function handleTeachCommand(
  text: string,
  userId?: string | null,
): Promise<{ content: string; learned?: boolean }> {
  const cmd = parseTeachCommand(text);
  if (!cmd) {
    return {
      content:
        'I could not parse that teach command. Try: "remember …", "learn …", "forget …", or "list learned facts".',
    };
  }

  const model = memoryModel();
  if (!model) {
    return {
      content:
        "Self-learning memory is unavailable. Run database migration and regenerate Prisma client, then restart the backend.",
    };
  }

  if (cmd.type === "list") {
    const facts = await loadActiveFacts(userId);
    if (!facts.length) {
      return {
        content:
          "I have no learned facts yet. Teach me with **remember …** or **learn …**.",
      };
    }
    const lines = facts.map(
      (f: any, i: number) =>
        `${i + 1}. ${f.topic ? `*[${f.topic}]* ` : ""}${f.fact}`,
    );
    return {
      content: `🧠 **Learned facts (${facts.length})**\n\n${lines.join("\n")}\n\nForget one with: \`forget <text>\``,
    };
  }

  if (cmd.type === "forget") {
    const q = cmd.query.toLowerCase();
    const facts = await loadActiveFacts(userId);
    const match = facts.find((f: any) =>
      String(f.fact || "")
        .toLowerCase()
        .includes(q),
    );
    if (!match) {
      return {
        content: `I could not find an active learned fact matching "${cmd.query}".`,
      };
    }
    await model.update({
      where: { id: match.id },
      data: { status: "archived", updatedAt: new Date() },
    });
    return {
      content: `Forgot: **${match.fact}**`,
      learned: true,
    };
  }

  // remember / learn
  const existing = await model.findFirst({
    where: {
      status: "active",
      fact: { equals: cmd.fact, mode: "insensitive" },
    },
  });
  if (existing) {
    await model.update({
      where: { id: existing.id },
      data: {
        topic: cmd.topic || existing.topic,
        source: "remember",
        updatedAt: new Date(),
        userId: userId || existing.userId || null,
      },
    });
    return {
      content: `Updated learned fact: **${cmd.fact}**`,
      learned: true,
    };
  }

  await model.create({
    data: {
      id: randomUUID(),
      userId: userId || null,
      topic: cmd.topic || null,
      fact: cmd.fact,
      source: "remember",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });

      return {
        content: `Got it — I'll remember: **${cmd.fact}**\n\nAsk me about it later and I'll use this. Want to see everything I've learned? Say \`list learned facts\`.`,
        learned: true,
      };
}

// GET /api/ai-assistant/status
router.get("/status", async (_req: AuthRequest, res: Response) => {
  try {
    const { apiKey, model, baseUrl } = await getAiSettings();
    let learnedCount = 0;
    try {
      const m = memoryModel();
      if (m?.count) {
        learnedCount = await m.count({ where: { status: "active" } });
      }
    } catch {
      learnedCount = 0;
    }
    res.json({
      data: {
        configured: Boolean(apiKey),
        model,
        baseUrl,
        provider: detectAiProvider(baseUrl, apiKey),
        selfLearning: true,
        learnedFacts: learnedCount,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-assistant/knowledge
router.get("/knowledge", async (req: AuthRequest, res: Response) => {
  try {
    const facts = await loadActiveFacts(req.user?.id || null);
    res.json({
      data: {
        systemPrompt: buildErpSystemPrompt({
          currentPath: "/",
          learnedFactsSection: formatLearnedFactsForPrompt(facts),
        }),
        learnedFacts: facts,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-assistant/memory
router.get("/memory", async (req: AuthRequest, res: Response) => {
  try {
    const facts = await loadActiveFacts(req.user?.id || null);
    res.json({ data: facts, total: facts.length });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai-assistant/memory — teach / forget / list via structured body or natural command
router.post("/memory", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id || null;
    const commandText =
      typeof req.body?.command === "string"
        ? req.body.command
        : typeof req.body?.text === "string"
          ? req.body.text
          : typeof req.body?.fact === "string"
            ? `remember ${req.body.fact}`
            : "";

    if (!commandText.trim()) {
      return res.status(400).json({
        error: 'Provide { fact } or { command: "remember …" }',
      });
    }

    const result = await handleTeachCommand(commandText, userId);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/ai-assistant/memory/:id
router.delete("/memory/:id", async (req: AuthRequest, res: Response) => {
  try {
    const model = memoryModel();
    if (!model) {
      return res.status(500).json({ error: "Memory model unavailable" });
    }
    const id = String(req.params.id || "").trim();
    await model.update({
      where: { id },
      data: { status: "archived", updatedAt: new Date() },
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai-assistant/feedback
router.post("/feedback", async (req: AuthRequest, res: Response) => {
  try {
    const model = feedbackModel();
    if (!model) {
      return res.status(500).json({
        error:
          "Feedback model unavailable. Migrate DB and regenerate Prisma client.",
      });
    }

    const rating = String(req.body?.rating || "")
      .trim()
      .toLowerCase();
    if (rating !== "up" && rating !== "down") {
      return res.status(400).json({ error: 'rating must be "up" or "down"' });
    }

    const userMessage = String(req.body?.userMessage || "").trim();
    const assistantMessage = String(req.body?.assistantMessage || "").trim();
    const comment = String(req.body?.comment || "").trim() || null;

    if (!assistantMessage) {
      return res.status(400).json({ error: "assistantMessage is required" });
    }

    const row = await model.create({
      data: {
        id: randomUUID(),
        userId: req.user?.id || null,
        rating,
        userMessage: userMessage.slice(0, 4000),
        assistantMessage: assistantMessage.slice(0, 4000),
        comment: comment ? comment.slice(0, 1000) : null,
        createdAt: new Date(),
      },
    });

    // Thumbs-down with a correction comment → learn it as a fact
    let learnedFact: string | null = null;
    if (rating === "down" && comment && comment.length >= 5) {
      const memory = memoryModel();
      if (memory?.create) {
        learnedFact = comment.slice(0, 1000);
        await memory.create({
          data: {
            id: randomUUID(),
            userId: req.user?.id || null,
            topic: "correction",
            fact: learnedFact,
            source: "feedback",
            status: "active",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        });
      }
    }

    res.json({
      success: true,
      data: {
        id: row.id,
        learnedFact,
        message: learnedFact
          ? "Thanks — I learned your correction for next time."
          : "Thanks for the feedback.",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai-assistant/chat
router.post("/chat", async (req: AuthRequest, res: Response) => {
  try {
    const { messages, currentPath, conversationSummary, max_tokens, temperature } =
      req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const lastUser = [...messages]
      .reverse()
      .find(
        (m: any) =>
          m && m.role === "user" && typeof m.content === "string" && m.content.trim(),
      );
    const lastUserText = String(lastUser?.content || "").trim();

    // Teach commands are handled locally (works even without LongCat key)
    if (lastUserText && isTeachCommand(lastUserText)) {
      const result = await handleTeachCommand(lastUserText, req.user?.id || null);
      return res.json({
        success: true,
        data: {
          content: result.content,
          model: "self-learning",
          learned: Boolean(result.learned),
        },
      });
    }

    const { apiKey, model, baseUrl } = await getAiSettings();
    if (!apiKey) {
      return res.status(400).json({
        error:
          "AI assistant is not configured. Add your API key in Settings → LongCat AI.",
        code: "AI_NOT_CONFIGURED",
      });
    }

    const facts = await loadActiveFacts(req.user?.id || null);
    const systemPrompt = buildErpSystemPrompt({
      currentPath: typeof currentPath === "string" ? currentPath : "/",
      conversationSummary:
        typeof conversationSummary === "string" ? conversationSummary : "",
      learnedFactsSection: formatLearnedFactsForPrompt(facts),
    });

    const apiMessages: any[] = [
      { role: "system", content: systemPrompt },
      ...messages
        .filter(
          (m: any) =>
            m &&
            typeof m.content === "string" &&
            (m.role === "user" || m.role === "assistant"),
        )
        .map((m: any) => ({ role: m.role, content: m.content })),
    ];

    let responseData: any = null;
    let toolsUsed: string[] = [];
    const attachments: Array<{
      id: string;
      fileName: string;
      format: string;
      mimeType: string;
      downloadPath: string;
      rowCount: number;
      title: string;
    }> = [];

    const forceLiveTools = shouldForceLiveDataTools(lastUserText);

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const requestBody: Record<string, unknown> = {
        model,
        messages: apiMessages,
        max_tokens: max_tokens ?? 1600,
        // Deterministic answers for the same question + same DB
        temperature: temperature ?? 0,
        tools: AI_DB_TOOLS,
        // First round: require a tool for live-number questions so the model
        // cannot invent totals from memory or a partial sample.
        tool_choice:
          round === 0 && forceLiveTools ? "required" : "auto",
      };

      const result = await callChatCompletions({
        apiKey,
        baseUrl,
        body: requestBody,
      });

      if (!result.ok) {
        return res.status(result.status || 500).json({
          error: result.error,
          details: result.details,
        });
      }

      responseData = result.data;
      const choice = responseData?.choices?.[0];
      const assistantMessage = choice?.message;
      const toolCalls = assistantMessage?.tool_calls;

      if (!Array.isArray(toolCalls) || toolCalls.length === 0) {
        break;
      }

      apiMessages.push({
        role: "assistant",
        content: assistantMessage.content || null,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const toolName = String(call?.function?.name || "");
        const toolArgs = call?.function?.arguments ?? "{}";
        toolsUsed.push(toolName);
        const toolResult = await executeAiDbTool(toolName, toolArgs);
        if (
          toolResult &&
          typeof toolResult === "object" &&
          (toolResult as any).success &&
          (toolResult as any).downloadPath
        ) {
          attachments.push({
            id: String((toolResult as any).id),
            fileName: String((toolResult as any).fileName),
            format: String((toolResult as any).format),
            mimeType: String((toolResult as any).mimeType),
            downloadPath: String((toolResult as any).downloadPath),
            rowCount: Number((toolResult as any).rowCount || 0),
            title: String((toolResult as any).title || "Export"),
          });
        }
        apiMessages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(toolResult),
        });
      }
    }

    const content =
      responseData?.choices?.[0]?.message?.content ||
      (toolsUsed.length
        ? "I looked up live data but could not form a final answer. Please rephrase."
        : "I could not generate a response. Please try again.");

    res.json({
      success: true,
      data: {
        content,
        model: responseData?.model || model,
        usage: responseData?.usage,
        learnedFactsUsed: facts.length,
        toolsUsed: toolsUsed.length ? toolsUsed : undefined,
        attachments: attachments.length ? attachments : undefined,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to process AI assistant request",
    });
  }
});

// GET /api/ai-assistant/exports/:file — download AI-generated PDF/Excel
router.get("/exports/:file", async (req: AuthRequest, res: Response) => {
  try {
    const resolved = resolveAiExportFile(String(req.params.file || ""));
    if (!resolved) {
      return res.status(404).json({ error: "Export file not found or expired." });
    }
    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${resolved.downloadName}"`,
    );
    return res.sendFile(path.resolve(resolved.fullPath));
  } catch (error: any) {
    return res.status(500).json({ error: error.message || "Download failed" });
  }
});

export default router;
