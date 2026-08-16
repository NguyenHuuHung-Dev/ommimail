import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getApps } from "firebase-admin/app";
import type { MailAccount } from "@omnimail/shared";
import { EncryptionService } from "./security.js";
import crypto from "node:crypto";

type CredentialKind = "oauth" | "gmail-app-password" | "microsoft-refresh-token" | "mailtm";
export type StoredMailbox = { account: MailAccount; userId: string; credentialKind: CredentialKind; credential: Record<string, unknown> };
export type StoredUser = { userId: string; email: string; displayName?: string; lastSeenAt: string; role: "admin" | "premium" | "basic" };

const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
const key = rawKey ? Buffer.from(rawKey, "base64") : undefined;
const encryption = key?.length === 32 ? new EncryptionService(key, Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION ?? 1)) : undefined;

// Firestore needs an Admin SDK identity and a 32-byte key. Never put either in VITE_* variables.
const hasAdminIdentity = Boolean(
  (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) || process.env.GOOGLE_APPLICATION_CREDENTIALS,
);
export const persistentStoreEnabled = Boolean(process.env.FIREBASE_PROJECT_ID && hasAdminIdentity && encryption);
const db = () => {
  if (!persistentStoreEnabled || !getApps().length) throw new Error("Persistent mailbox storage is not configured or Firebase Admin is not initialized");
  return getFirestore();
};

export async function saveMailbox(
  account: MailAccount,
  userId: string,
  credentialKind: CredentialKind,
  credential: Record<string, unknown>,
) {
  account.connectedAt ??= new Date().toISOString();
  if (!persistentStoreEnabled || !getApps().length) return;
  await db().collection("mailAccounts").doc(account.id).set({
    ...account,
    userId,
    credentialKind,
    encryptedCredentials: encryption!.encrypt(JSON.stringify(credential)),
    credentialKeyVersion: Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION ?? 1),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function updateMailboxCredential(accountId: string, credential: Record<string, unknown>) {
  if (!persistentStoreEnabled || !getApps().length) return;
  await db().collection("mailAccounts").doc(accountId).update({
    encryptedCredentials: encryption!.encrypt(JSON.stringify(credential)),
    credentialKeyVersion: Number(process.env.TOKEN_ENCRYPTION_KEY_VERSION ?? 1),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function updateMailboxSyncState(account: MailAccount) {
  if (!persistentStoreEnabled || !getApps().length) return;
  await db().collection("mailAccounts").doc(account.id).set({
    status: account.status,
    unreadCount: account.unreadCount,
    lastSyncedAt: account.lastSyncedAt ?? null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function deleteMailbox(accountId: string) {
  if (!persistentStoreEnabled || !getApps().length) return;
  const reference = db().collection("mailAccounts").doc(accountId);
  const shares = await reference.collection("shares").get();
  const batch = db().batch();
  for (const share of shares.docs) batch.delete(share.ref);
  batch.delete(reference);
  await batch.commit();
}

export async function loadMailboxes(): Promise<StoredMailbox[]> {
  if (!persistentStoreEnabled || !getApps().length) return [];
  const snapshot = await db().collection("mailAccounts").get();
  const results: StoredMailbox[] = [];
  for (const document of snapshot.docs) {
    const value = document.data();
    if (typeof value.userId !== "string" || typeof value.encryptedCredentials !== "string" || typeof value.credentialKind !== "string") continue;
    try {
      const { userId, credentialKind, encryptedCredentials, credentialKeyVersion, createdAt, updatedAt, ...account } = value;
      const storedConnectedAt = typeof account.connectedAt === "string"
        ? account.connectedAt
        : createdAt && typeof createdAt.toDate === "function"
          ? createdAt.toDate().toISOString()
          : undefined;
      results.push({
        account: { ...account, connectedAt: storedConnectedAt } as MailAccount,
        userId,
        credentialKind: credentialKind as CredentialKind,
        credential: JSON.parse(encryption!.decrypt(encryptedCredentials)) as Record<string, unknown>,
      });
    } catch {
      // One corrupt record must not prevent the API from starting. It remains intact for recovery.
    }
  }
  return results;
}

export async function saveMailboxShare(accountId: string, userId: string, allowed: boolean) {
  if (!persistentStoreEnabled || !getApps().length) return;
  const reference = db().collection("mailAccounts").doc(accountId).collection("shares").doc(userId);
  if (allowed) await reference.set({ userId, updatedAt: FieldValue.serverTimestamp() });
  else await reference.delete();
}

export async function loadMailboxShares() {
  if (!persistentStoreEnabled || !getApps().length) return [] as Array<{ accountId: string; userId: string }>;
  const snapshot = await db().collectionGroup("shares").get();
  return snapshot.docs.flatMap((share) => {
    const accountId = share.ref.parent.parent?.id;
    return accountId ? [{ accountId, userId: share.id }] : [];
  });
}

export async function saveUserProfile(user: StoredUser) {
  if (!persistentStoreEnabled || !getApps().length) return;
  await db().collection("users").doc(user.userId).set({ ...user, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function loadUserProfiles(): Promise<StoredUser[]> {
  if (!persistentStoreEnabled || !getApps().length) return [];
  const snapshot = await db().collection("users").get();
  return snapshot.docs.flatMap((document) => {
    const value = document.data();
    return typeof value.email === "string" && typeof value.lastSeenAt === "string" && (value.role === "admin" || value.role === "premium" || value.role === "basic")
      ? [{ userId: document.id, email: value.email, displayName: typeof value.displayName === "string" ? value.displayName : undefined, lastSeenAt: value.lastSeenAt, role: value.role }]
      : [];
  });
}

export async function saveHiddenMessage(userId: string, messageId: string) {
  if (!persistentStoreEnabled || !getApps().length) return;
  const documentId = crypto.createHash("sha256").update(messageId).digest("hex");
  await db().collection("users").doc(userId).collection("hiddenMessages").doc(documentId).set({
    messageId,
    hiddenAt: FieldValue.serverTimestamp(),
  });
}

export async function loadHiddenMessageIds() {
  if (!persistentStoreEnabled || !getApps().length) return [] as Array<{ userId: string; messageId: string }>;
  const snapshot = await db().collectionGroup("hiddenMessages").get();
  return snapshot.docs.flatMap((document) => {
    const userId = document.ref.parent.parent?.id;
    const messageId = document.data().messageId;
    return userId && typeof messageId === "string" ? [{ userId, messageId }] : [];
  });
}
