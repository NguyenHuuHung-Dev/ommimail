import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";

const pendingConnections = new Set<string>();
const keyFor = (email: string, userId: string) =>
  `${userId}:${email.trim().toLowerCase()}`;

export class MailboxAlreadyConnectedError extends Error {
  readonly code = "MAILBOX_ALREADY_CONNECTED";

  constructor(email: string) {
    super(`${email.trim().toLowerCase()} đã được kết nối`);
    this.name = "MailboxAlreadyConnectedError";
  }
}

export function isMailboxConnected(email: string, userId: string) {
  const normalized = email.trim().toLowerCase();
  return accounts.some(
    (account) =>
      accountOwners.get(account.id) === userId &&
      account.emailAddress.trim().toLowerCase() === normalized,
  );
}

export function reserveMailboxConnection(email: string, userId: string) {
  const key = keyFor(email, userId);
  if (pendingConnections.has(key) || isMailboxConnected(email, userId))
    throw new MailboxAlreadyConnectedError(email);
  pendingConnections.add(key);
  return () => pendingConnections.delete(key);
}
