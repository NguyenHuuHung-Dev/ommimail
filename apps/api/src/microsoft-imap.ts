import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailMessage } from "@omnimail/shared";

const tokenUrl =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
let tokenCache: { value: string; expires: number } | undefined;
let inboxCache: { items: MailMessage[]; expires: number } | undefined;
const detailCache = new Map<
  string,
  { message: MailMessage; expires: number }
>();

async function accessToken() {
  if (tokenCache && tokenCache.expires > Date.now()) return tokenCache.value;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const refreshToken = process.env.MICROSOFT_SEED_REFRESH_TOKEN;
  if (!clientId || !refreshToken)
    throw new Error("Microsoft IMAP credentials are not configured");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!response.ok)
    throw new Error(`Microsoft token refresh failed (${response.status})`);
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token)
    throw new Error("Microsoft did not return an access token");
  tokenCache = {
    value: json.access_token,
    expires: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 120) * 1000,
  };
  return json.access_token;
}

function address(value: { name?: string; address?: string } | undefined) {
  return { name: value?.name, address: value?.address ?? "" };
}
function iso(value: string | Date | undefined) {
  return new Date(value ?? Date.now()).toISOString();
}
async function client() {
  const user = process.env.MICROSOFT_SEED_EMAIL;
  if (!user) throw new Error("MICROSOFT_SEED_EMAIL is not configured");
  return new ImapFlow({
    host: "outlook.office365.com",
    port: 993,
    secure: true,
    auth: { user, accessToken: await accessToken() },
    logger: false,
  });
}

export async function listMicrosoftInbox(limit = 30): Promise<MailMessage[]> {
  if (inboxCache && inboxCache.expires > Date.now())
    return inboxCache.items.slice(0, limit);
  const c = await client();
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  try {
    const found = await c.search({ all: true }, { uid: true });
    const uids = (found || []).slice(-Math.max(1, Math.min(limit, 100)));
    if (!uids.length) return [];
    const result: MailMessage[] = [];
    for await (const m of c.fetch(
      uids,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        bodyStructure: true,
      },
      { uid: true },
    )) {
      const from = m.envelope?.from?.[0];
      result.push({
        id: `microsoft-live:${m.uid}`,
        accountId: "microsoft-live",
        providerMessageId: String(m.uid),
        providerThreadId: m.envelope?.messageId,
        folderIds: ["inbox"],
        labelIds: [],
        from: address(from),
        to: (m.envelope?.to ?? []).map(address),
        cc: (m.envelope?.cc ?? []).map(address),
        subject: m.envelope?.subject ?? "(No subject)",
        preview: "Open this message to load its content securely.",
        isRead: m.flags?.has("\\Seen") ?? false,
        isStarred: m.flags?.has("\\Flagged") ?? false,
        hasAttachments: Boolean(
          m.bodyStructure?.childNodes?.some(
            (n) => n.disposition === "attachment",
          ),
        ),
        receivedAt: iso(m.internalDate ?? m.envelope?.date),
      });
    }
    const items = result.reverse();
    inboxCache = { items, expires: Date.now() + 8_000 };
    return items;
  } finally {
    lock.release();
    await c.logout();
  }
}

export async function getMicrosoftMessage(id: string): Promise<MailMessage> {
  const cached = detailCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.message;
  const uid = Number(id.split(":").at(-1));
  if (!Number.isInteger(uid)) throw new Error("Invalid Microsoft message id");
  const c = await client();
  await c.connect();
  const lock = await c.getMailboxLock("INBOX");
  try {
    let found: MailMessage | undefined;
    for await (const m of c.fetch(
      String(uid),
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
        source: true,
      },
      { uid: true },
    )) {
      const parsed = await simpleParser(m.source!);
      const from = m.envelope?.from?.[0];
      found = {
        id: `microsoft-live:${m.uid}`,
        accountId: "microsoft-live",
        providerMessageId: String(m.uid),
        folderIds: ["inbox"],
        labelIds: [],
        from: address(from),
        to: (m.envelope?.to ?? []).map(address),
        cc: (m.envelope?.cc ?? []).map(address),
        subject: m.envelope?.subject ?? "(No subject)",
        preview: (parsed.text ?? "").slice(0, 180),
        textBody: parsed.text,
        sanitizedHtmlBody:
          typeof parsed.html === "string" ? parsed.html : undefined,
        isRead: m.flags?.has("\\Seen") ?? false,
        isStarred: m.flags?.has("\\Flagged") ?? false,
        hasAttachments: parsed.attachments.length > 0,
        attachments: parsed.attachments.map((a, i) => ({
          id: `${uid}:${i}`,
          filename: a.filename ?? `attachment-${i + 1}`,
          mimeType: a.contentType,
          size: a.size,
        })),
        receivedAt: iso(m.internalDate),
      };
    }
    if (!found) throw new Error("Message not found");
    detailCache.set(id, { message: found, expires: Date.now() + 5 * 60_000 });
    return found;
  } finally {
    lock.release();
    await c.logout();
  }
}

export function clearMicrosoftCache() {
  inboxCache = undefined;
  detailCache.clear();
}
