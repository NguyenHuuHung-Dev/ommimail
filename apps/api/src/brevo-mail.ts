import { cloudflareMailDomain } from "./cloudflare-mail.js";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_WINDOW_MS = 15 * 60_000;
const DEFAULT_SEND_LIMIT = 10;

const sendHistory = new Map<string, number[]>();

export const brevoMailConfigured = () =>
  Boolean(process.env.BREVO_API_KEY?.trim() && cloudflareMailDomain());

export class BrevoMailError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function resetTempMailSendLimits() {
  sendHistory.clear();
}

export function consumeTempMailSendSlot(ownerId: string, now = Date.now()) {
  const configuredLimit = Number(process.env.BREVO_SEND_LIMIT_PER_15M ?? DEFAULT_SEND_LIMIT);
  const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 ? configuredLimit : DEFAULT_SEND_LIMIT;
  const cutoff = now - SEND_WINDOW_MS;
  const recent = (sendHistory.get(ownerId) ?? []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= limit) {
    sendHistory.set(ownerId, recent);
    throw new BrevoMailError(
      429,
      "TEMP_MAIL_SEND_RATE_LIMITED",
      `Bạn đã gửi tối đa ${limit} thư thử trong 15 phút. Vui lòng đợi một lát rồi thử lại.`,
    );
  }
  recent.push(now);
  sendHistory.set(ownerId, recent);
}

function sanitizeHeaderValue(value: string) {
  return value.replace(/[\r\n]+/g, " ").trim();
}

export async function sendBrevoTempMail(input: {
  fromEmail: string;
  fromName?: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{
  messageId: string;
  from: string;
  to: string;
  subject: string;
  sentAt: string;
}> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const domain = cloudflareMailDomain();
  if (!apiKey || !domain) {
    throw new BrevoMailError(
      503,
      "BREVO_NOT_CONFIGURED",
      "Chưa cấu hình BREVO_API_KEY trên máy chủ API để gửi email từ tên miền.",
    );
  }

  const fromEmail = input.fromEmail.trim().toLowerCase();
  if (!fromEmail.endsWith(`@${domain}`)) {
    throw new BrevoMailError(
      400,
      "UNSUPPORTED_SENDER_DOMAIN",
      `Chỉ hỗ trợ gửi email từ địa chỉ thuộc tên miền @${domain}.`,
    );
  }

  const senderName =
    sanitizeHeaderValue(input.fromName || process.env.BREVO_SENDER_NAME || "OmniMail") || "OmniMail";
  const subject = sanitizeHeaderValue(input.subject);
  const to = input.to.trim().toLowerCase();

  let response: Response;
  try {
    response = await fetch(BREVO_SEND_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": apiKey,
      },
      body: JSON.stringify({
        sender: { name: senderName, email: fromEmail },
        to: [{ email: to }],
        replyTo: { email: fromEmail, name: senderName },
        subject,
        textContent: input.text,
      }),
    });
  } catch {
    throw new BrevoMailError(
      502,
      "BREVO_NETWORK_ERROR",
      "Không thể kết nối tới Brevo. Vui lòng thử lại sau.",
    );
  }

  const payload = (await response.json().catch(() => ({}))) as {
    messageId?: string;
    code?: string;
    message?: string;
  };

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new BrevoMailError(
        502,
        "BREVO_AUTH_ERROR",
        "BREVO_API_KEY không hợp lệ hoặc chưa được bật quyền gửi Transactional Email trên Brevo.",
      );
    }
    if (response.status === 402 || response.status === 429) {
      throw new BrevoMailError(
        429,
        "BREVO_QUOTA_EXCEEDED",
        "Tài khoản Brevo đã đạt giới hạn gửi email. Vui lòng thử lại sau.",
      );
    }
    if (response.status === 400) {
      const detail = payload.message ? ` (${payload.message})` : "";
      throw new BrevoMailError(
        400,
        "BREVO_REJECTED",
        `Brevo từ chối yêu cầu gửi email. Hãy kiểm tra domain @${domain} đã được xác thực trên Brevo chưa${detail}.`,
      );
    }
    throw new BrevoMailError(
      502,
      "BREVO_SEND_FAILED",
      "Brevo chưa thể gửi email lúc này. Vui lòng thử lại sau.",
    );
  }

  return {
    messageId: payload.messageId ?? "",
    from: fromEmail,
    to,
    subject,
    sentAt: new Date().toISOString(),
  };
}
