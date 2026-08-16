import crypto from "node:crypto";
import type { MailMessage } from "@omnimail/shared";
import { updateMailboxCredential } from "./firestore-store.js";
import { mergeLatestMessages } from "./mail-folders.js";

type Credential = { email: string; clientId: string; refreshToken: string };
type GraphRecipient = { emailAddress?: { name?: string; address?: string } };
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

const credentials = new Map<string, Credential>();
const tokenCache = new Map<string, { value: string; expires: number }>();

async function access(id: string) {
  const cached = tokenCache.get(id);
  if (cached && cached.expires > Date.now()) return cached.value;
  const credential = credentials.get(id);
  if (!credential) throw new Error("Microsoft connection is unavailable");

  const params: Record<string, string> = {
    client_id: credential.clientId,
    grant_type: "refresh_token",
    refresh_token: credential.refreshToken,
    scope: "openid profile email offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read",
  };
  if (
    process.env.MICROSOFT_CLIENT_SECRET &&
    credential.clientId === process.env.MICROSOFT_CLIENT_ID
  ) {
    params.client_secret = process.env.MICROSOFT_CLIENT_SECRET;
  }

  const response = await fetch(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    },
  );
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const description = typeof body.error_description === "string"
      ? body.error_description
      : typeof body.error === "string"
        ? body.error
        : "Microsoft rejected the refresh token";
    throw new Error(`Microsoft token refresh failed (${response.status}): ${description}`);
  }
  if (typeof body.access_token !== "string")
    throw new Error("Microsoft did not return an access token");

  if (typeof body.refresh_token === "string") {
    credential.refreshToken = body.refresh_token;
    void updateMailboxCredential(`microsoft-token:${id}`, credential).catch(() => undefined);
  }
  tokenCache.set(id, {
    value: body.access_token,
    expires: Date.now() + Math.max(60, Number(body.expires_in ?? 3600) - 120) * 1000,
  });
  return body.access_token;
}

async function graph<T>(id: string, path: string) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me${path}`, {
    headers: { Authorization: `Bearer ${await access(id)}` },
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const graphError = body.error as { message?: string } | undefined;
    throw new Error(`Microsoft Graph returned ${response.status}: ${graphError?.message ?? "Request failed"}`);
  }
  return body as T;
}

const recipient = (value?: GraphRecipient) => ({
  name: value?.emailAddress?.name,
  address: value?.emailAddress?.address ?? "",
});

const htmlToText = (value: string) => value
  .replace(/<style[\s\S]*?<\/style>/gi, " ")
  .replace(/<script[\s\S]*?<\/script>/gi, " ")
  .replace(/<br\s*\/?\s*>/gi, "\n")
  .replace(/<\/p>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&#39;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/[ \t]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

function dto(message: GraphMessage, connectionId: string, folderId = "inbox"): MailMessage {
  const content = message.body?.content;
  return {
    id: `microsoft-token:${connectionId}:${message.id}:${folderId}`,
    accountId: `microsoft-token:${connectionId}`,
    providerMessageId: message.id,
    folderIds: [folderId],
    labelIds: folderId === "spam" ? ["Junk"] : [],
    from: recipient(message.from),
    to: (message.toRecipients ?? []).map(recipient),
    cc: (message.ccRecipients ?? []).map(recipient),
    subject: message.subject || "(No subject)",
    preview: message.bodyPreview ?? "",
    textBody: content
      ? message.body?.contentType?.toLowerCase() === "html"
        ? htmlToText(content)
        : content
      : undefined,
    isRead: Boolean(message.isRead),
    isStarred: message.flag?.flagStatus === "flagged",
    hasAttachments: Boolean(message.hasAttachments),
    receivedAt: new Date(message.receivedDateTime ?? Date.now()).toISOString(),
  };
}

const messageFields = "id,subject,bodyPreview,isRead,hasAttachments,receivedDateTime,from,toRecipients,ccRecipients,flag";

export const microsoftTokens = {
  async connect(input: Credential) {
    const id = crypto.randomUUID();
    credentials.set(id, { ...input });
    try {
      const profile = await graph<{ mail?: string; userPrincipalName?: string }>(id, "?$select=mail,userPrincipalName");
      return { id, email: profile.mail ?? profile.userPrincipalName ?? input.email };
    } catch (error) {
      credentials.delete(id);
      tokenCache.delete(id);
      throw error;
    }
  },
  async list(id: string) {
    const loadFolder = async (folder: "inbox" | "junkemail") => {
      const data = await graph<{ value?: GraphMessage[] }>(id, `/mailFolders/${folder}/messages?$top=10&$orderby=receivedDateTime%20desc&$select=${messageFields}`);
      return (data.value ?? []).map((message) => dto(message, id, folder === "junkemail" ? "spam" : "inbox"));
    };
    const [inbox, junk] = await Promise.allSettled([loadFolder("inbox"), loadFolder("junkemail")]);
    const groups = [inbox, junk]
      .filter((result): result is PromiseFulfilledResult<MailMessage[]> => result.status === "fulfilled")
      .map((result) => result.value);
    if (!groups.length) throw inbox.status === "rejected" ? inbox.reason : junk.status === "rejected" ? junk.reason : new Error("Microsoft folders are unavailable");
    return mergeLatestMessages(groups, 20);
  },
  async get(id: string, messageId: string, folderId = "inbox") {
    const message = await graph<GraphMessage>(
      id,
      `/messages/${encodeURIComponent(messageId)}?$select=${messageFields},body`,
    );
    return dto(message, id, folderId);
  },
  restore(id: string, credential: Credential) {
    credentials.set(id, { ...credential });
  },
  remove(id: string) {
    credentials.delete(id);
    tokenCache.delete(id);
  },
};
