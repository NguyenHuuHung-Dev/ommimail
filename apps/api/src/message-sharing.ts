import crypto from "node:crypto";
import type { MessageShare } from "@omnimail/shared";

export const messageShares = new Map<string, MessageShare>();

export function messageShareId(ownerId: string, messageId: string, recipientUserId: string) {
  return crypto
    .createHash("sha256")
    .update(`${ownerId}\u0000${messageId}\u0000${recipientUserId}`)
    .digest("hex");
}

export function setMessageShare(share: MessageShare) {
  messageShares.set(share.id, share);
}

export function removeMessageShare(shareId: string) {
  return messageShares.delete(shareId);
}

export function restoreMessageShare(share: MessageShare) {
  setMessageShare(share);
}
