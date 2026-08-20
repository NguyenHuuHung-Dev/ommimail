import type { Attachment, MailMessage } from "@omnimail/shared";
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
type GmailListPage = {
  messages?: { id: string }[];
  nextPageToken?: string;
};
type GmailListCache = {
  messages: Map<string, MailMessage>;
  orderedIds: string[];
  discoveredAt: number;
  metadataRefreshedAt: number;
};
type GmailContent = {
  text?: string;
  html?: string;
  attachments: Attachment[];
};

const MAIN_MESSAGE_LIMIT = 200;
const SPAM_MESSAGE_LIMIT = 50;
const FULL_DISCOVERY_AGE_MS = 5 * 60_000;
const METADATA_REFRESH_AGE_MS = 60_000;
const QUICK_CHECK_MAIN_LIMIT = 25;
const QUICK_CHECK_SPAM_LIMIT = 10;
const METADATA_BATCH_SIZE = 10;
const listCaches = new Map<string, GmailListCache>();
const listRequests = new Map<string, Promise<MailMessage[]>>();
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
const partHeader = (part: Part, name: string) =>
  part.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())
    ?.value ?? "";

export async function extractGmailContent(
  part?: Part,
  loadAttachment?: (attachmentId: string) => Promise<string>,
): Promise<GmailContent> {
  const textParts: string[] = [];
  const htmlParts: string[] = [];
  const attachments: Attachment[] = [];
  const inlineAssets: Array<{ cid: string; mimeType: string; data: string }> = [];
  let attachmentIndex = 0;

  const bodyData = async (current: Part) => {
    if (current.body?.data) return current.body.data;
    if (current.body?.attachmentId && loadAttachment)
      return loadAttachment(current.body.attachmentId);
    return "";
  };

  const visit = async (current?: Part): Promise<void> => {
    if (!current) return;
    const mimeType = current.mimeType?.toLowerCase() ?? "application/octet-stream";
    if (mimeType === "text/plain" || mimeType === "text/html") {
      const data = await bodyData(current);
      if (data) (mimeType === "text/html" ? htmlParts : textParts).push(decode(data));
    } else if (!mimeType.startsWith("multipart/")) {
      const contentId = partHeader(current, "Content-ID").replace(/^<|>$/g, "");
      const disposition = partHeader(current, "Content-Disposition").toLowerCase();
      if (contentId) {
        const data = await bodyData(current);
        if (data) inlineAssets.push({ cid: contentId, mimeType, data });
      }
      if (current.filename || disposition.includes("attachment")) {
        attachmentIndex += 1;
        attachments.push({
          id: current.body?.attachmentId ?? `part-${attachmentIndex}`,
          filename: current.filename || `attachment-${attachmentIndex}`,
          mimeType,
          size: current.body?.size ?? 0,
        });
      }
    }
    for (const child of current.parts ?? []) await visit(child);
  };

  await visit(part);
  let html = htmlParts.join("\n").trim();
  for (const asset of inlineAssets) {
    const source = `data:${asset.mimeType};base64,${asset.data.replace(/-/g, "+").replace(/_/g, "/")}`;
    html = html.replaceAll(`cid:${asset.cid}`, source);
  }
  const text = textParts.join("\n\n").trim();
  return {
    text: text || undefined,
    html: html || undefined,
    attachments,
  };
}

function summaryDto(m: Gmail, accountId: string): MailMessage {
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
    isRead: !m.labelIds?.includes("UNREAD"),
    isStarred: Boolean(m.labelIds?.includes("STARRED")),
    hasAttachments: Boolean(m.payload?.parts?.some((p) => p.filename)),
    receivedAt: new Date(Number(m.internalDate ?? Date.now())).toISOString(),
  };
}

async function loadMessageIds(accountId: string, query: string, limit: number) {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const remaining = limit - ids.length;
    const page = await call<GmailListPage>(
      accountId,
      `/messages?maxResults=${Math.min(500, remaining)}&includeSpamTrash=true&q=${encodeURIComponent(query)}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
    );
    ids.push(...(page.messages ?? []).map((message) => message.id));
    pageToken = page.nextPageToken;
  } while (pageToken && ids.length < limit);
  return ids.slice(0, limit);
}

async function loadSummaries(accountId: string, ids: string[]) {
  const summaries: MailMessage[] = [];
  for (let offset = 0; offset < ids.length; offset += METADATA_BATCH_SIZE) {
    const batch = await Promise.all(
      ids.slice(offset, offset + METADATA_BATCH_SIZE).map((id) =>
        call<Gmail>(
          accountId,
          `/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
        ),
      ),
    );
    summaries.push(...batch.map((message) => summaryDto(message, accountId)));
  }
  return summaries;
}

async function listMessages(accountId: string) {
  const now = Date.now();
  const previous = listCaches.get(accountId);
  const fullDiscovery = !previous || now - previous.discoveredAt >= FULL_DISCOVERY_AGE_MS;
  const [mainIds, spamIds] = await Promise.all([
    loadMessageIds(
      accountId,
      "{in:inbox category:promotions}",
      fullDiscovery ? MAIN_MESSAGE_LIMIT : QUICK_CHECK_MAIN_LIMIT,
    ),
    loadMessageIds(
      accountId,
      "in:spam",
      fullDiscovery ? SPAM_MESSAGE_LIMIT : QUICK_CHECK_SPAM_LIMIT,
    ),
  ]);
  const discoveredIds = [...new Set([...mainIds, ...spamIds])];
  const messages = previous?.messages ?? new Map<string, MailMessage>();
  if (fullDiscovery) {
    const activeIds = new Set(discoveredIds);
    for (const id of messages.keys()) if (!activeIds.has(id)) messages.delete(id);
  }

  const refreshMetadata =
    !previous || now - previous.metadataRefreshedAt >= METADATA_REFRESH_AGE_MS;
  const idsToLoad = discoveredIds.filter(
    (id, index) => !messages.has(id) || (refreshMetadata && index < QUICK_CHECK_MAIN_LIMIT + QUICK_CHECK_SPAM_LIMIT),
  );
  for (const message of await loadSummaries(accountId, idsToLoad))
    messages.set(message.providerMessageId, message);

  const orderedIds = fullDiscovery
    ? discoveredIds
    : [...new Set([...discoveredIds, ...(previous?.orderedIds ?? [])])];
  const cache: GmailListCache = {
    messages,
    orderedIds,
    discoveredAt: fullDiscovery ? now : (previous?.discoveredAt ?? now),
    metadataRefreshedAt: refreshMetadata ? now : (previous?.metadataRefreshedAt ?? now),
  };
  listCaches.set(accountId, cache);
  return mergeLatestMessages(
    [orderedIds.flatMap((id) => {
      const message = messages.get(id);
      return message ? [message] : [];
    })],
    MAIN_MESSAGE_LIMIT + SPAM_MESSAGE_LIMIT,
  );
}

export const gmail = {
  async list(accountId: string) {
    const active = listRequests.get(accountId);
    if (active) return active;
    const request = listMessages(accountId).finally(() => listRequests.delete(accountId));
    listRequests.set(accountId, request);
    return request;
  },
  async get(accountId: string, messageId: string) {
    const message = await call<Gmail>(accountId, `/messages/${messageId}?format=full`);
    const content = await extractGmailContent(message.payload, async (attachmentId) => {
      const body = await call<{ data?: string }>(
        accountId,
        `/messages/${messageId}/attachments/${encodeURIComponent(attachmentId)}`,
      );
      return body.data ?? "";
    });
    return {
      ...summaryDto(message, accountId),
      textBody: content.text,
      sanitizedHtmlBody: content.html,
      hasAttachments: content.attachments.length > 0,
      attachments: content.attachments,
    };
  },
  clear(accountId: string) {
    listCaches.delete(accountId);
    listRequests.delete(accountId);
  },
};
