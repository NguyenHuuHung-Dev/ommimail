import type { UserRole } from "./auth.js";

export function mayReadMailbox(input: {
  ownerId?: string;
  userId: string;
  role: UserRole;
  shared: boolean;
}) {
  return input.ownerId === input.userId || (input.role === "premium" && input.shared);
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
