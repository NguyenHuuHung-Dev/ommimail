import crypto from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailMessage } from "@omnimail/shared";
import { decodeMailboxPath, encodeMailboxPath, findJunkMailboxPath, mergeLatestMessages } from "./mail-folders.js";

type Credential = { email: string; appPassword: string };
const credentials = new Map<string, Credential>();
const clientFor = (id: string) => {
  const c = credentials.get(id);
  if (!c) throw new Error("Gmail App Password connection is unavailable");
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: c.email, pass: c.appPassword }, logger: false });
};
const address = (v: { name?: string; address?: string } | undefined) => ({ name: v?.name, address: v?.address ?? "" });
const dto = (id: string, m: any, textBody?: string, mailboxPath = "INBOX", folderId = "inbox"): MailMessage => ({
  id: `gmail-imap-message:${id}:${encodeMailboxPath(mailboxPath)}:${m.uid}`, accountId: `gmail-imap:${id}`,
  providerMessageId: `${encodeMailboxPath(mailboxPath)}:${m.uid}`, folderIds: [folderId], labelIds: folderId === "spam" ? ["Spam"] : [],
  from: address(m.envelope?.from?.[0]), to: (m.envelope?.to ?? []).map(address), cc: (m.envelope?.cc ?? []).map(address),
  subject: m.envelope?.subject ?? "(No subject)", preview: textBody?.slice(0, 180) ?? "Open to load content.", textBody,
  isRead: m.flags?.has("\\Seen") ?? false, isStarred: m.flags?.has("\\Flagged") ?? false,
  hasAttachments: Boolean(m.bodyStructure?.childNodes?.some((n: any) => n.disposition === "attachment")),
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
      const groups: MailMessage[][] = [];
      for (const folder of folders) {
        const lock = await client.getMailboxLock(folder.path);
        try { const found = (await client.search({ all: true }, { uid: true })) || []; const out: MailMessage[] = [];
          for await (const m of client.fetch(found.slice(-10), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: true })) out.push(dto(id, m, undefined, folder.path, folder.folderId));
          groups.push(out);
        } finally { lock.release(); }
      }
      return mergeLatestMessages(groups, 10);
    } finally { await client.logout(); }
  },
  async get(id: string, uid: number, mailboxToken?: string) {
    const mailboxPath = decodeMailboxPath(mailboxToken); const folderId = mailboxPath.toLowerCase() === "inbox" ? "inbox" : "spam";
    const client = clientFor(id); await client.connect(); const lock = await client.getMailboxLock(mailboxPath);
    try { for await (const m of client.fetch(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true })) { const parsed = await simpleParser(m.source!); return dto(id, m, parsed.text, mailboxPath, folderId); } throw new Error("Message not found"); }
    finally { lock.release(); await client.logout(); }
  },
  restore(id: string, credential: Credential) { credentials.set(id, { ...credential, appPassword: credential.appPassword.replace(/\s/g, "") }); },
  remove(id: string) { credentials.delete(id); },
};
