import { Router, Request, Response } from "express";
import { sendEmail } from "../utils/mailer";

const router = Router();

function parseRecipients(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }
  return String(value || "")
    .split(/[;,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * POST /email/send
 * Body:
 *  - to: string | string[]
 *  - cc?: string | string[]
 *  - subject: string
 *  - message?: string
 *  - filename: string
 *  - contentType?: string
 *  - attachmentBase64: string (raw base64 or data URL)
 */
router.post("/send", async (req: Request, res: Response) => {
  try {
    const to = parseRecipients(req.body?.to);
    const cc = parseRecipients(req.body?.cc);
    const subject = String(req.body?.subject || "").trim();
    const message = String(req.body?.message || "").trim();
    const filename = String(req.body?.filename || "attachment").trim();
    const contentType = String(req.body?.contentType || "").trim() || undefined;
    let attachmentBase64 = String(req.body?.attachmentBase64 || "").trim();

    if (to.length === 0) {
      return res.status(400).json({ error: "At least one recipient (to) is required" });
    }
    if (to.some((email) => !isValidEmail(email))) {
      return res.status(400).json({ error: "One or more To addresses are invalid" });
    }
    if (cc.some((email) => !isValidEmail(email))) {
      return res.status(400).json({ error: "One or more CC addresses are invalid" });
    }
    if (!subject) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (!attachmentBase64) {
      return res.status(400).json({ error: "Attachment is required" });
    }

    if (attachmentBase64.includes(",")) {
      attachmentBase64 = attachmentBase64.split(",").pop() || "";
    }

    const content = Buffer.from(attachmentBase64, "base64");
    if (!content.length) {
      return res.status(400).json({ error: "Attachment is empty or invalid" });
    }

    const result = await sendEmail({
      to,
      cc: cc.length > 0 ? cc : undefined,
      subject,
      text:
        message ||
        "Please find the attached Purchase Import Inquiry document.",
      html: `<p>${(message || "Please find the attached Purchase Import Inquiry document.")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\n/g, "<br/>")}</p>`,
      attachments: [
        {
          filename,
          content,
          contentType,
        },
      ],
    });

    return res.json({
      success: true,
      messageId: result.messageId,
      from: result.from,
      accepted: result.accepted,
      rejected: result.rejected,
    });
  } catch (error: any) {
    console.error("[email/send]", error);
    return res.status(500).json({
      error: error?.message || "Failed to send email",
    });
  }
});

export default router;
