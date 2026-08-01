import nodemailer from "nodemailer";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendEmailInput = {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
};

function requireEnv(name: string): string {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing email configuration: ${name}`);
  }
  return value;
}

function getMailTransport() {
  const host = String(process.env.SMTP_HOST || "smtp.hostinger.com").trim();
  const port = Number(process.env.SMTP_PORT || 465);
  const secure =
    String(process.env.SMTP_SECURE || "").trim().toLowerCase() === "true" ||
    port === 465;
  const user = requireEnv("SMTP_USER");
  const pass = requireEnv("SMTP_PASS");

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function getDefaultFromAddress() {
  const from = String(process.env.SMTP_FROM || process.env.SMTP_USER || "").trim();
  if (!from) {
    throw new Error("Missing email configuration: SMTP_FROM or SMTP_USER");
  }
  return from;
}

export async function sendEmail(input: SendEmailInput) {
  const transporter = getMailTransport();
  const from = getDefaultFromAddress();

  const info = await transporter.sendMail({
    from,
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: (input.attachments || []).map((file) => ({
      filename: file.filename,
      content: file.content,
      contentType: file.contentType,
    })),
  });

  return {
    messageId: info.messageId,
    accepted: info.accepted,
    rejected: info.rejected,
    from,
  };
}
