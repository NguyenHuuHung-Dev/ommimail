import crypto from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { Attachment, MailMessage } from "@omnimail/shared";
import { decodeMailboxPath, encodeMailboxPath, findJunkMailboxPath, mergeLatestMessages } from "./mail-folders.js";

type Credential = { email: string; appPassword: string };
type ParsedContent = { textBody?: string; htmlBody?: string; attachments?: Attachment[] };
type ParsedMailContentInput = {
  text?: string;
  html?: string | false;
  attachments: Array<{ filename?: string; contentType: string; size: number }>;
};
type GmailImapListCache = { messages: Map<string, MailMessage>; metadataRefreshedAt: number };
const credentials = new Map<string, Credential>();
const listCaches = new Map<string, GmailImapListCache>();
const METADATA_REFRESH_AGE_MS = 60_000;
const clientFor = (id: string) => {
  const c = credentials.get(id);
  if (!c) throw new Error("Gmail App Password connection is unavailable");
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: c.email, pass: c.appPassword }, logger: false });
};
const address = (v: { name?: string; address?: string } | undefined) => ({ name: v?.name, address: v?.address ?? "" });
const hasAttachmentNode = (node: any): boolean =>
  node?.disposition === "attachment" || (node?.childNodes ?? []).some(hasAttachmentNode);
const messageId = (id: string, mailboxPath: string, uid: number) =>
  `gmail-imap-message:${id}:${encodeMailboxPath(mailboxPath)}:${uid}`;
export const parsedMailContent = (parsed: ParsedMailContentInput, uid: number): ParsedContent => ({
  textBody: parsed.text,
  htmlBody: typeof parsed.html === "string" ? parsed.html : undefined,
  attachments: parsed.attachments.map((attachment, index) => ({
    id: `${uid}:${index}`,
    filename: attachment.filename ?? `attachment-${index + 1}`,
    mimeType: attachment.contentType,
    size: attachment.size,
  })),
});
const dto = (id: string, m: any, content: ParsedContent = {}, mailboxPath = "INBOX", folderId = "inbox"): MailMessage => ({
  id: messageId(id, mailboxPath, m.uid), accountId: `gmail-imap:${id}`,
  providerMessageId: `${encodeMailboxPath(mailboxPath)}:${m.uid}`, folderIds: [folderId], labelIds: folderId === "spam" ? ["Spam"] : [],
  from: address(m.envelope?.from?.[0]), to: (m.envelope?.to ?? []).map(address), cc: (m.envelope?.cc ?? []).map(address),
  subject: m.envelope?.subject ?? "(No subject)", preview: content.textBody?.slice(0, 180) ?? "Open to load content.",
  textBody: content.textBody, sanitizedHtmlBody: content.htmlBody,
  isRead: m.flags?.has("\\Seen") ?? false, isStarred: m.flags?.has("\\Flagged") ?? false,
  hasAttachments: Boolean(content.attachments?.length || hasAttachmentNode(m.bodyStructure)), attachments: content.attachments,
  receivedAt: new Date(m.internalDate ?? m.envelope?.date ?? Date.now()).toISOString(),
});
export const gmailAppPasswords = {
  async connect(input: Credential) {
    const id = crypto.randomUUID(); credentials.set(id, { ...input, appPassword: input.appPassword.replace(/\s/g, "") });
    const client = clientFor(id);
    try { await client.connect(); const lock = await client.getMailboxLock("INBOX"); lock.release(); }
    catch (error) { credentials.delete(id); throw error; }
    finally { if (client.usable) await client.logout(); }
    return { id, email: input.email };
  },
  async list(id: string) {
    const client = clientFor(id); await client.connect();
    try {
      const junkPath = findJunkMailboxPath(await client.list());
      const folders = [{ path: "INBOX", folderId: "inbox" }, ...(junkPath ? [{ path: junkPath, folderId: "spam" }] : [])];
      const cache = listCaches.get(id) ?? { messages: new Map<string, MailMessage>(), metadataRefreshedAt: 0 };
      const refreshMetadata = Date.now() - cache.metadataRefreshedAt >= METADATA_REFRESH_AGE_MS;
      const activeMessageIds = new Set<string>();
      const groups: MailMessage[][] = [];
      for (const folder of folders) {
        const lock = await client.getMailboxLock(folder.path);
        try {
          const found = (await client.search({ all: true }, { uid: true })) || [];
          const limit = folder.folderId === "inbox" ? 100 : 30;
          const uids = found.slice(-limit);
          const recentIds = new Set(refreshMetadata ? uids.slice(-20) : []);
          const uidsToFetch = uids.filter((uid) =>
            !cache.messages.has(messageId(id, folder.path, uid)) || recentIds.has(uid),
          );
          if (uidsToFetch.length) {
            for await (const m of client.fetch(uidsToFetch.join(","), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: true })) {
              const message = dto(id, m, {}, folder.path, folder.folderId);
              cache.messages.set(message.id, message);
            }
          }
          const out = uids.flatMap((uid) => {
            const idForMessage = messageId(id, folder.path, uid);
            activeMessageIds.add(idForMessage);
            const message = cache.messages.get(idForMessage);
            return message ? [message] : [];
          });
          groups.push(out);
        } finally { lock.release(); }
      }
      for (const cachedId of cache.messages.keys()) if (!activeMessageIds.has(cachedId)) cache.messages.delete(cachedId);
      if (refreshMetadata) cache.metadataRefreshedAt = Date.now();
      listCaches.set(id, cache);
      return mergeLatestMessages(groups, 130);
    } finally { await client.logout(); }
  },
  async get(id: string, uid: number, mailboxToken?: string) {
    const mailboxPath = decodeMailboxPath(mailboxToken); const folderId = mailboxPath.toLowerCase() === "inbox" ? "inbox" : "spam";
    const client = clientFor(id); await client.connect(); const lock = await client.getMailboxLock(mailboxPath);
    try { for await (const m of client.fetch(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true })) { const parsed = await simpleParser(m.source!); return dto(id, m, parsedMailContent(parsed, uid), mailboxPath, folderId); } throw new Error("Message not found"); }
    finally { lock.release(); await client.logout(); }
  },
  restore(id: string, credential: Credential) { credentials.set(id, { ...credential, appPassword: credential.appPassword.replace(/\s/g, "") }); listCaches.delete(id); },
  remove(id: string) { credentials.delete(id); listCaches.delete(id); },
};
