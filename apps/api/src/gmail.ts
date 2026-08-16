import type { MailMessage } from "@omnimail/shared";
import { getOAuthCredential, setOAuthCredential } from "./oauth.js";
import { gmailFolderIds, mergeLatestMessages } from "./mail-folders.js";
async function access(accountId: string) {
  const c = getOAuthCredential(accountId);
  if (!c) throw new Error("Gmail credential is unavailable");
  if (c.expiry_date && Number(c.expiry_date) > Date.now() + 60_000)
    return String(c.access_token);
  if (!c.refresh_token) return String(c.access_token);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: String(c.refresh_token),
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Google token refresh failed (${r.status})`);
  const n = (await r.json()) as Record<string, unknown>;
  const updated:Record<string,unknown> = {
    ...c,
    ...n,
    expiry_date: Date.now() + Number(n.expires_in ?? 3600) * 1000,
  };
  setOAuthCredential(accountId, updated);
  return String(updated.access_token);
}
async function call<T>(accountId: string, path: string) {
  const r = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me${path}`,
    { headers: { Authorization: `Bearer ${await access(accountId)}` } },
  );
  if (!r.ok) throw new Error(`Gmail API returned ${r.status}`);
  return r.json() as Promise<T>;
}
type Part = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: Part[];
  headers?: { name: string; value: string }[];
};
type Gmail = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};
const header = (m: Gmail, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";
const address = (raw: string) => {
  const match = raw.match(/^(.*?)\s*<([^>]+)>$/);
  return match
    ? { name: match[1].replace(/^"|"$/g, ""), address: match[2] }
    : { address: raw };
};
const decode = (value?: string) =>
  value
    ? Buffer.from(
        value.replace(/-/g, "+").replace(/_/g, "/"),
        "base64",
      ).toString("utf8")
    : "";
function text(part?: Part): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data)
    return decode(part.body.data);
  for (const child of part.parts ?? []) {
    const found = text(child);
    if (found) return found;
  }
  return "";
}
function dto(m: Gmail, accountId: string): MailMessage {
  const labelIds = m.labelIds ?? [];
  return {
    id: `gmail-live:${accountId}:${m.id}`,
    accountId,
    providerMessageId: m.id,
    providerThreadId: m.threadId,
    folderIds: gmailFolderIds(labelIds),
    labelIds,
    from: address(header(m, "From")),
    to: header(m, "To").split(",").filter(Boolean).map(address),
    cc: header(m, "Cc").split(",").filter(Boolean).map(address),
    subject: header(m, "Subject") || "(No subject)",
    preview: m.snippet ?? "",
    textBody: text(m.payload) || undefined,
    isRead: !m.labelIds?.includes("UNREAD"),
    isStarred: Boolean(m.labelIds?.includes("STARRED")),
    hasAttachments: Boolean(m.payload?.parts?.some((p) => p.filename)),
    receivedAt: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
  };
}
export const gmail = {
  async list(accountId: string) {
    const loadIds = (query: string, maxResults: number) =>
      call<{ messages?: { id: string }[] }>(
        accountId,
        `/messages?maxResults=${maxResults}&includeSpamTrash=true&q=${encodeURIComponent(query)}`,
      );
    // Read Spam separately so it remains available even when Inbox is busy.
    const [mainPage, spamPage] = await Promise.all([
      loadIds("{in:inbox category:promotions}", 20),
      loadIds("in:spam", 10),
    ]);
    const ids = [...new Set([...(mainPage.messages ?? []), ...(spamPage.messages ?? [])].map((message) => message.id))];
    const items = await Promise.all(
      ids.map((id) =>
        call<Gmail>(
          accountId,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
        ),
      ),
    );
    return mergeLatestMessages([items.map((message) => dto(message, accountId))], 30);
  },
  async get(accountId: string, messageId: string) {
    return dto(
      await call<Gmail>(accountId, `/messages/${messageId}?format=full`),
      accountId,
    );
  },
};
