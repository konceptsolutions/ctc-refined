import express, { Request, Response } from "express";
import prisma from "../config/database";
import fetch from "node-fetch";
import { buildErpSystemPrompt } from "../ai/erpKnowledge";

const router = express.Router();

async function getAiSettings() {
  const settings = await prisma.longCatSettings.findFirst();
  return {
    apiKey: settings?.apiKey || process.env.LONGCAT_API_KEY || "",
    model: settings?.model || "LongCat-Flash-Chat",
    baseUrl: settings?.baseUrl || "https://api.longcat.chat",
  };
}

// GET /api/ai-assistant/status
router.get("/status", async (_req: Request, res: Response) => {
  try {
    const { apiKey, model, baseUrl } = await getAiSettings();
    res.json({
      data: {
        configured: Boolean(apiKey),
        model,
        baseUrl,
        provider: "longcat",
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/ai-assistant/knowledge — returns system knowledge (for debugging / future RAG)
router.get("/knowledge", async (_req: Request, res: Response) => {
  try {
    res.json({
      data: {
        systemPrompt: buildErpSystemPrompt({ currentPath: "/" }),
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/ai-assistant/chat
router.post("/chat", async (req: Request, res: Response) => {
  try {
    const { messages, currentPath, conversationSummary, max_tokens, temperature } =
      req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    const { apiKey, model, baseUrl } = await getAiSettings();
    if (!apiKey) {
      return res.status(400).json({
        error:
          "AI assistant is not configured. Add your API key in Settings → LongCat AI.",
        code: "AI_NOT_CONFIGURED",
      });
    }

    const systemPrompt = buildErpSystemPrompt({
      currentPath: typeof currentPath === "string" ? currentPath : "/",
      conversationSummary:
        typeof conversationSummary === "string" ? conversationSummary : "",
    });

    const apiMessages = [
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

    const requestBody: Record<string, unknown> = {
      model,
      messages: apiMessages,
      max_tokens: max_tokens ?? 1200,
      temperature: temperature ?? 0.6,
    };

    const response = await fetch(`${baseUrl}/openai/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    let responseData: any;
    try {
      responseData = await response.json();
    } catch {
      const text = await response.text();
      return res.status(500).json({
        error: "Invalid response from AI provider",
        details: text,
      });
    }

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          responseData?.error?.message ||
          "Failed to get response from AI provider",
        details: responseData,
      });
    }

    const content =
      responseData?.choices?.[0]?.message?.content ||
      "I could not generate a response. Please try again.";

    res.json({
      success: true,
      data: {
        content,
        model: responseData?.model || model,
        usage: responseData?.usage,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message || "Failed to process AI assistant request",
    });
  }
});

export default router;
