import crypto from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailMessage } from "@omnimail/shared";

type Credential = { email: string; appPassword: string };
const credentials = new Map<string, Credential>();
const clientFor = (id: string) => {
  const c = credentials.get(id);
  if (!c) throw new Error("Gmail App Password connection is unavailable");
  return new ImapFlow({ host: "imap.gmail.com", port: 993, secure: true, auth: { user: c.email, pass: c.appPassword }, logger: false });
};
const address = (v: { name?: string; address?: string } | undefined) => ({ name: v?.name, address: v?.address ?? "" });
const dto = (id: string, m: any, textBody?: string): MailMessage => ({
  id: `gmail-imap-message:${id}:${m.uid}`, accountId: `gmail-imap:${id}`,
  providerMessageId: String(m.uid), folderIds: ["inbox"], labelIds: [],
  from: address(m.envelope?.from?.[0]), to: (m.envelope?.to ?? []).map(address), cc: (m.envelope?.cc ?? []).map(address),
  subject: m.envelope?.subject ?? "(No subject)", preview: textBody?.slice(0, 180) ?? "Open to load content.", textBody,
  isRead: m.flags?.has("\\Seen") ?? false, isStarred: m.flags?.has("\\Flagged") ?? false,
  isDraft: false, isSent: false, hasAttachments: Boolean(m.bodyStructure?.childNodes?.some((n: any) => n.disposition === "attachment")),
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
    const client = clientFor(id); await client.connect(); const lock = await client.getMailboxLock("INBOX");
    try { const found = (await client.search({ all: true }, { uid: true })) || []; const out: MailMessage[] = [];
      for await (const m of client.fetch(found.slice(-10), { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true }, { uid: true })) out.push(dto(id, m));
      return out.reverse();
    } finally { lock.release(); await client.logout(); }
  },
  async get(id: string, uid: number) {
    const client = clientFor(id); await client.connect(); const lock = await client.getMailboxLock("INBOX");
    try { for await (const m of client.fetch(String(uid), { uid: true, envelope: true, flags: true, internalDate: true, source: true }, { uid: true })) { const parsed = await simpleParser(m.source!); return dto(id, m, parsed.text); } throw new Error("Message not found"); }
    finally { lock.release(); await client.logout(); }
  },
  restore(id: string, credential: Credential) { credentials.set(id, { ...credential, appPassword: credential.appPassword.replace(/\s/g, "") }); },
  remove(id: string) { credentials.delete(id); },
};
