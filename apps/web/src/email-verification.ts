import { sendEmailVerification, type User } from "firebase/auth";

export type VerificationRequest = {
  status: "requested" | "cooldown";
  retryAt: number;
};

const pending = new Map<string, Promise<VerificationRequest>>();
const sentAt = new Map<string, number>();
const failures = new Map<string, unknown>();
const storageKey = (uid: string) => `omnimail:verification:${uid}`;

export function verificationRetryAt(uid: string) {
  let stored = 0;
  try {
    const value = Number(sessionStorage.getItem(storageKey(uid)));
    if (Number.isFinite(value) && value > 0 && value <= Date.now())
      stored = value;
  } catch {
    /* Storage may be unavailable. */
  }
  const latest = Math.max(stored, sentAt.get(uid) ?? 0);
  return latest ? latest + 60_000 : 0;
}

export function verificationFailure(uid: string) {
  return failures.get(uid);
}

export function verificationError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/too-many-requests")
    return "Dịch vụ gửi thư đang tạm giới hạn yêu cầu. Hãy đợi vài phút rồi gửi lại; không cần tạo tài khoản mới.";
  if (code === "auth/quota-exceeded")
    return "Dịch vụ đã hết hạn mức gửi email. Vui lòng thử lại sau.";
  if (code === "auth/network-request-failed")
    return "Không thể kết nối. Kiểm tra mạng rồi thử lại.";
  if (
    [
      "auth/unauthorized-continue-uri",
      "auth/invalid-continue-uri",
      "auth/invalid-sender",
      "auth/invalid-message-payload",
      "auth/operation-not-allowed",
    ].includes(code ?? "")
  )
    return "Dịch vụ gửi email xác minh chưa được cấu hình đúng. Vui lòng liên hệ quản trị viên.";
  return "Không thể xử lý xác minh email. Hãy thử lại hoặc đăng xuất để dùng tài khoản khác.";
}

export function sendVerification(user: User): Promise<VerificationRequest> {
  const existing = pending.get(user.uid);
  if (existing) return existing;
  const retryAt = verificationRetryAt(user.uid);
  if (retryAt > Date.now())
    return Promise.resolve({ status: "cooldown", retryAt });

  failures.delete(user.uid);
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
      return { status: "requested" as const, retryAt: now + 60_000 };
    })
    .catch((error: unknown) => {
      failures.set(user.uid, error);
      throw error;
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
