import { signOut } from "firebase/auth";
import { auth } from "./firebase";
const noticeKey = "omnimail:session-notice";
let ending: Promise<void> | undefined;
export function endRevokedSession(reason: string) {
  const message =
    reason === "disabled" || reason === "ACCOUNT_DISABLED"
      ? "Tài khoản đã bị quản trị viên khóa. Vui lòng liên hệ quản trị viên nếu cần hỗ trợ."
      : reason === "deleted" || reason === "ACCOUNT_DELETED"
        ? "Tài khoản không còn tồn tại."
        : "Quyền truy cập đã thay đổi. Vui lòng đăng nhập lại.";
  try {
    sessionStorage.setItem(noticeKey, message);
  } catch {
    /* Session storage may be unavailable. */
  }
  ending ??= signOut(auth).finally(() => {
    ending = undefined;
  });
  return ending;
}
export function readSessionNotice() {
  try {
    const notice = sessionStorage.getItem(noticeKey) ?? "";
    return notice;
  } catch {
    return "";
  }
}

export function clearSessionNotice() {
  try {
    sessionStorage.removeItem(noticeKey);
  } catch {
    /* Storage may be unavailable. */
  }
}
