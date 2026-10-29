import { sendEmailVerification, type User } from "firebase/auth";

const pending = new Map<string, Promise<number>>();
const sentAt = new Map<string, number>();
const storageKey = (uid: string) => `omnimail:verification:${uid}`;

export function verificationRetryAt(uid: string) {
  let stored = 0;
  try {
    stored = Number(sessionStorage.getItem(storageKey(uid))) || 0;
  } catch {
    /* Storage may be unavailable. */
  }
  return Math.max(stored, sentAt.get(uid) ?? 0) + 60_000;
}

export function sendVerification(user: User): Promise<number> {
  const existing = pending.get(user.uid);
  if (existing) return existing;
  const retryAt = verificationRetryAt(user.uid);
  if (retryAt > Date.now()) return Promise.resolve(retryAt);

  const request = sendEmailVerification(user, {
    url: `${window.location.origin}/verify-email`,
  })
    .then(() => {
      const now = Date.now();
      sentAt.set(user.uid, now);
      try {
        sessionStorage.setItem(storageKey(user.uid), String(now));
      } catch {
        /* Keep the in-memory cooldown. */
      }
      return now + 60_000;
    })
    .finally(() => pending.delete(user.uid));
  pending.set(user.uid, request);
  return request;
}

export async function refreshVerification(user: User) {
  await user.reload();
  if (!user.emailVerified) return false;
  // Refresh the signed email_verified claim before mounting the mailbox UI.
  await user.getIdToken(true);
  return true;
}
