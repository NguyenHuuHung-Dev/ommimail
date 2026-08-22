import type { MailMessage } from "@omnimail/shared";
import { getOAuthCredential, setOAuthCredential } from "./oauth.js";
import { mergeLatestMessages } from "./mail-folders.js";
import {
  extractMicrosoftContent,
  type MicrosoftFileAttachment,
} from "./microsoft-message-content.js";

const listCache = new Map<string, { items: MailMessage[]; discoveredAt: number }>();
const listRequests = new Map<string, Promise<MailMessage[]>>();
const FULL_LIST_AGE_MS = 5 * 60_000;
const INBOX_LIMIT = 200;
const JUNK_LIMIT = 50;

async function access(accountId: string) {
  const c = getOAuthCredential(accountId);
  if (!c) throw new Error("Microsoft OAuth credential is unavailable");

  const expiresAt = Number(c.expires_at ?? 0);
  if (c.access_token && expiresAt > Date.now() + 60_000) {
    return String(c.access_token);
  }
  if (!c.refresh_token) {
    return String(c.access_token);
  }

  const tenant = process.env.MICROSOFT_TENANT_ID ?? "common";
  const params: Record<string, string> = {
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    grant_type: "refresh_token",
    refresh_token: String(c.refresh_token),
    scope: "openid profile email offline_access User.Read Mail.Read",
  };
  if (process.env.MICROSOFT_CLIENT_SECRET) {
    params.client_secret = process.env.MICROSOFT_CLIENT_SECRET;
  }

  const r = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    },
  );
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    console.error("Microsoft token refresh error:", r.status, errBody);
    if (c.access_token) return String(c.access_token);
    throw new Error(`Microsoft token refresh failed (${r.status}): ${errBody}`);
  }
  const n = (await r.json()) as Record<string, unknown>;
  const updated: Record<string, unknown> = {
    ...c,
    ...n,
    expires_at: Date.now() + Number(n.expires_in ?? 3600) * 1000,
  };
  setOAuthCredential(accountId, updated);
  return String(updated.access_token);
}

async function call<T>(accountId: string, path: string) {
  let token = await access(accountId);
  const url = path.startsWith("https://graph.microsoft.com/")
    ? path
    : `https://graph.microsoft.com/v1.0/me${path}`;
  let r = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    const credential = getOAuthCredential(accountId);
    if (credential?.refresh_token) {
      setOAuthCredential(accountId, { ...credential, expires_at: 0 });
      token = await access(accountId);
      r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }
  if (!r.ok) {
    const errBody = await r.text().catch(() => "");
    console.error("Microsoft Graph API error:", r.status, path, errBody);
    throw new Error(`Microsoft Graph API returned ${r.status}: ${errBody}`);
  }
  return r.json() as Promise<T>;
}

type GraphRecipient = {
  emailAddress?: { name?: string; address?: string };
};

type GraphMessage = {
  id: string;
  subject?: string;
  bodyPreview?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
  receivedDateTime?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { contentType?: string; content?: string };
  flag?: { flagStatus?: string };
};

function recipient(r?: GraphRecipient) {
  return {
    name: r?.emailAddress?.name,
    address: r?.emailAddress?.address ?? "",
  };
}

function dto(
  m: GraphMessage,
  accountId: string,
  folderId = "inbox",
  sourceAttachments: MicrosoftFileAttachment[] = [],
): MailMessage {
  const content = extractMicrosoftContent(m.body, sourceAttachments);
  return {
    id: `microsoft-graph-message:${accountId}:${m.id}:${folderId}`,
    accountId,
    providerMessageId: m.id,
    folderIds: [folderId],
    labelIds: folderId === "spam" ? ["Junk"] : [],
    from: recipient(m.from),
    to: (m.toRecipients ?? []).map(recipient),
    cc: (m.ccRecipients ?? []).map(recipient),
    subject: m.subject || "(No subject)",
    preview: m.bodyPreview ?? "",
    textBody: content.textBody,
    sanitizedHtmlBody: content.sanitizedHtmlBody,
    isRead: Boolean(m.isRead),
    isStarred: m.flag?.flagStatus === "flagged",
    hasAttachments: content.attachments.length > 0 || Boolean(m.hasAttachments),
    attachments: content.attachments,
    receivedAt: new Date(m.receivedDateTime ?? Date.now()).toISOString(),
  };
}

const messageFields = "id,subject,bodyPreview,isRead,hasAttachments,receivedDateTime,from,toRecipients,ccRecipients,flag";
type GraphPage<T> = { value?: T[]; "@odata.nextLink"?: string };

async function loadFolder(
  accountId: string,
  folder: "inbox" | "junkemail",
  limit: number,
) {
  const messages: GraphMessage[] = [];
  let next: string | undefined = `/mailFolders/${folder}/messages?$top=${Math.min(50, limit)}&$orderby=receivedDateTime%20desc&$select=${messageFields}`;
  while (next && messages.length < limit) {
    const page: GraphPage<GraphMessage> = await call<GraphPage<GraphMessage>>(accountId, next);
    messages.push(...(page.value ?? []).slice(0, limit - messages.length));
    next = page["@odata.nextLink"];
  }
  return messages.map((message) =>
    dto(message, accountId, folder === "junkemail" ? "spam" : "inbox"),
  );
}

async function listMessages(accountId: string) {
  const previous = listCache.get(accountId);
  const fullDiscovery = !previous || Date.now() - previous.discoveredAt >= FULL_LIST_AGE_MS;
  const [inbox, junk] = await Promise.allSettled([
    loadFolder(accountId, "inbox", fullDiscovery ? INBOX_LIMIT : 20),
    loadFolder(accountId, "junkemail", fullDiscovery ? JUNK_LIMIT : 10),
  ]);
  const groups = [inbox, junk]
    .filter((result): result is PromiseFulfilledResult<MailMessage[]> => result.status === "fulfilled")
    .map((result) => result.value);
  if (!groups.length)
    throw inbox.status === "rejected" ? inbox.reason : junk.status === "rejected" ? junk.reason : new Error("Microsoft folders are unavailable");
  const latest = mergeLatestMessages(groups, INBOX_LIMIT + JUNK_LIMIT);
  const items = fullDiscovery || !previous
    ? latest
    : mergeLatestMessages([previous.items, latest], INBOX_LIMIT + JUNK_LIMIT);
  listCache.set(accountId, {
    items,
    discoveredAt: fullDiscovery ? Date.now() : previous.discoveredAt,
  });
  return items;
}

export const microsoftGraph = {
  async list(accountId: string) {
    const active = listRequests.get(accountId);
    if (active) return active;
    const request = listMessages(accountId).finally(() => listRequests.delete(accountId));
    listRequests.set(accountId, request);
    return request;
  },
  async get(accountId: string, messageId: string, folderId = "inbox") {
    const m = await call<GraphMessage>(
      accountId,
      `/messages/${encodeURIComponent(messageId)}?$select=${messageFields},body`,
    );
    let attachments: MicrosoftFileAttachment[] = [];
    if (m.hasAttachments || /cid:/i.test(m.body?.content ?? "")) {
      const data = await call<GraphPage<MicrosoftFileAttachment>>(
        accountId,
        `/messages/${encodeURIComponent(messageId)}/attachments?$top=100`,
      ).catch(() => ({ value: [] }));
      attachments = data.value ?? [];
    }
    return dto(m, accountId, folderId, attachments);
  },
  clear(accountId: string) {
    listCache.delete(accountId);
    listRequests.delete(accountId);
  },
};
