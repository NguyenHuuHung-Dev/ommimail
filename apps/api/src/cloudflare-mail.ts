import crypto from "node:crypto";
import type { MailMessage } from "@omnimail/shared";
import { accountOwners } from "./ownership.js";

export const cloudflareMailDomain = () => process.env.CLOUDFLARE_MAIL_DOMAIN?.trim().toLowerCase() ?? "";
export const cloudflareMailConfigured = () => Boolean(cloudflareMailDomain() && process.env.CLOUDFLARE_MAIL_WORKER_URL && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);

export class CloudflareMailError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Only the API can sign gateway requests. The Worker holds Google's public
// service-account keys, never the Firebase private key or a user's ID token.
export function signMailRequest(method: string, path: string, body: string, ownerId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT" });
  const claims = encode({
    iss: process.env.FIREBASE_CLIENT_EMAIL, sub: ownerId, aud: "omnimail-temp-gateway",
    iat: issuedAt, exp: issuedAt + 60, method, path,
    digest: crypto.createHash("sha256").update(body).digest("base64url"),
  });
  const input = `${header}.${claims}`;
  const key = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!key) throw new CloudflareMailError(503, "Email tên miền chưa được cấu hình.");
  return `${input}.${crypto.sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}

async function gateway<T>(method: string, path: string, ownerId: string, value?: unknown): Promise<T> {
  if (!cloudflareMailConfigured()) throw new CloudflareMailError(503, "Email tên miền chưa được cấu hình.");
  const body = value === undefined ? "" : JSON.stringify(value);
  const url = new URL(path, process.env.CLOUDFLARE_MAIL_WORKER_URL);
  if (url.protocol !== "https:" && process.env.NODE_ENV !== "test") throw new Error("Mail gateway must use HTTPS");
  const response = await fetch(url, {
    method, redirect: "error", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${signMailRequest(method, path, body, ownerId)}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body } : {}),
  });
  if (!response.ok) {
    if (response.status === 409) throw new CloudflareMailError(409, "Địa chỉ này đã được sử dụng. Hãy chọn tên khác.");
    if (response.status === 400) throw new CloudflareMailError(400, "Tên hộp thư không hợp lệ hoặc được dành riêng. Hãy chọn tên khác.");
    if (response.status === 429) throw new CloudflareMailError(429, "Bạn đã đạt giới hạn 20 hộp thư tên miền.");
    if (response.status === 404) throw new CloudflareMailError(404, "Không tìm thấy hộp thư hoặc thư đã hết hạn lưu trữ.");
    throw new CloudflareMailError(502, "Chưa kết nối được hộp thư Cloudflare. Vui lòng thử lại.");
  }
  return response.json() as Promise<T>;
}

function owner(accountId: string) {
  const ownerId = accountOwners.get(accountId);
  if (!ownerId) throw new CloudflareMailError(404, "Không tìm thấy hộp thư.");
  return ownerId;
}

export const cloudflareMail = {
  create: (localPart: string, ownerId: string) => gateway<{ id: string; address: string }>("POST", "/accounts", ownerId, { localPart: localPart.toLowerCase() }),
  list: (accountId: string) => gateway<MailMessage[]>("GET", `/accounts/${encodeURIComponent(accountId)}/messages`, owner(accountId)),
  get: (accountId: string, messageId: string) => gateway<MailMessage>("GET", `/accounts/${encodeURIComponent(accountId)}/messages/${encodeURIComponent(messageId)}`, owner(accountId)),
  remove: (accountId: string) => gateway<{ deleted: boolean }>("DELETE", `/accounts/${encodeURIComponent(accountId)}`, owner(accountId)),
};
