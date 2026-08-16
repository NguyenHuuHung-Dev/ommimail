import type { MailMessage } from "@omnimail/shared";
import { getOAuthCredential, setOAuthCredential } from "./oauth.js";
import { mergeLatestMessages } from "./mail-folders.js";

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
  let r = await fetch(`https://graph.microsoft.com/v1.0/me${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (r.status === 401) {
    const credential = getOAuthCredential(accountId);
    if (credential?.refresh_token) {
      setOAuthCredential(accountId, { ...credential, expires_at: 0 });
      token = await access(accountId);
      r = await fetch(`https://graph.microsoft.com/v1.0/me${path}`, {
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

function dto(m: GraphMessage, accountId: string, folderId = "inbox"): MailMessage {
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
    textBody: m.body?.content,
    isRead: Boolean(m.isRead),
    isStarred: m.flag?.flagStatus === "flagged",
    hasAttachments: Boolean(m.hasAttachments),
    receivedAt: new Date(m.receivedDateTime ?? Date.now()).toISOString(),
  };
}

export const microsoftGraph = {
  async list(accountId: string) {
    const fields = "id,subject,bodyPreview,isRead,hasAttachments,receivedDateTime,from,toRecipients,ccRecipients,flag";
    const loadFolder = async (folder: "inbox" | "junkemail") => {
      const data = await call<{ value?: GraphMessage[] }>(
        accountId,
        `/mailFolders/${folder}/messages?$top=10&$orderby=receivedDateTime%20desc&$select=${fields}`,
      );
      return (data.value ?? []).map((message) =>
        dto(message, accountId, folder === "junkemail" ? "spam" : "inbox"),
      );
    };
    const [inbox, junk] = await Promise.allSettled([loadFolder("inbox"), loadFolder("junkemail")]);
    const groups = [inbox, junk]
      .filter((result): result is PromiseFulfilledResult<MailMessage[]> => result.status === "fulfilled")
      .map((result) => result.value);
    if (groups.length) return mergeLatestMessages(groups, 20);
    console.error("microsoftGraph.list folder reads failed", {
      inbox: inbox.status === "rejected" ? inbox.reason : undefined,
      junk: junk.status === "rejected" ? junk.reason : undefined,
    });
    const data = await call<{ value?: GraphMessage[] }>(
      accountId,
      `/messages?$top=10&$orderby=receivedDateTime%20desc&$select=${fields}`,
    );
    return (data.value ?? []).map((message) => dto(message, accountId, "all"));
  },
  async get(accountId: string, messageId: string, folderId = "inbox") {
    const m = await call<GraphMessage>(
      accountId,
      `/messages/${encodeURIComponent(messageId)}`,
    );
    return dto(m, accountId, folderId);
  },
};
