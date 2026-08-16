import type { MailMessage } from "@omnimail/shared";

export function gmailFolderIds(labelIds: string[]) {
  const folders: string[] = [];
  if (labelIds.includes("INBOX")) folders.push("inbox");
  if (labelIds.includes("CATEGORY_PROMOTIONS")) folders.push("promotions");
  if (labelIds.includes("SPAM")) folders.push("spam");
  return folders.length ? folders : ["all"];
}

export function mergeLatestMessages(
  groups: MailMessage[][],
  limit = 10,
): MailMessage[] {
  const unique = new Map<string, MailMessage>();
  for (const message of groups.flat()) unique.set(message.id, message);
  return [...unique.values()]
    .sort(
      (left, right) =>
        new Date(right.receivedAt).getTime() -
        new Date(left.receivedAt).getTime(),
    )
    .slice(0, limit);
}

export function findJunkMailboxPath(
  mailboxes: { path: string; name?: string; specialUse?: string }[],
) {
  return mailboxes.find(
    (mailbox) =>
      mailbox.specialUse?.toLowerCase() === "\\junk" ||
      /(?:^|[\\/])(spam|junk(?: email)?)$/i.test(mailbox.path) ||
      /^(spam|junk(?: email)?)$/i.test(mailbox.name ?? ""),
  )?.path;
}

export const encodeMailboxPath = (path: string) =>
  Buffer.from(path, "utf8").toString("base64url");

export const decodeMailboxPath = (token?: string) =>
  token ? Buffer.from(token, "base64url").toString("utf8") : "INBOX";
