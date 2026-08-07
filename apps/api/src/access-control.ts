import type { UserRole } from "./auth.js";

export function mayReadMailbox(input: {
  ownerId?: string;
  userId: string;
  role: UserRole;
  shared: boolean;
}) {
  return input.ownerId === input.userId || (input.role === "premium" && input.shared);
}

export const SHARED_MAILBOX_SEARCH_PREFIX_LENGTH = 5;

export function mayRevealMailboxAddress(input: {
  emailAddress: string;
  ownerId?: string;
  userId: string;
  shared: boolean;
  search?: string;
}) {
  const search = input.search?.trim().toLowerCase() ?? "";
  const emailAddress = input.emailAddress.toLowerCase();

  if (input.ownerId === input.userId) {
    return !search || emailAddress.includes(search);
  }

  return (
    input.shared &&
    search.length >= SHARED_MAILBOX_SEARCH_PREFIX_LENGTH &&
    emailAddress.startsWith(search)
  );
}

export function compositeMessageAccountId(messageId: string) {
  const parts = messageId.split(":");
  if (messageId.startsWith("gmail-imap-message:")) return parts[1] ? `gmail-imap:${parts[1]}` : undefined;
  if (messageId.startsWith("gmail-live:")) return parts[1];
  if (messageId.startsWith("microsoft-token:")) return parts[1] ? `microsoft-token:${parts[1]}` : undefined;
  if (messageId.startsWith("microsoft-graph-message:")) return parts[1];
  if (messageId.startsWith("mailtm:")) return parts[1] ? `mailtm:${parts[1]}` : undefined;
  if (messageId.startsWith("microsoft-live:")) return "microsoft-live";
  return undefined;
}
