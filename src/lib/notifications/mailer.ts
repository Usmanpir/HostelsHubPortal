import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  fromName?: string;
};

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;
  transporter = process.env.EMAIL_SERVER ? nodemailer.createTransport(process.env.EMAIL_SERVER) : null;
  return transporter;
}

/**
 * Send an email via SMTP (EMAIL_SERVER). Without SMTP configured — typical in
 * development — the message is logged to the server console instead.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  const t = getTransporter();
  const defaultFrom = process.env.EMAIL_FROM ?? "no-reply@example.com";
  const from = message.fromName ? `${message.fromName} <${extractAddress(defaultFrom)}>` : defaultFrom;
  if (!t) {
    console.info(`[email:dev] to=${message.to} subject="${message.subject}"\n${message.text}`);
    return;
  }
  await t.sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
}

function extractAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from;
}
