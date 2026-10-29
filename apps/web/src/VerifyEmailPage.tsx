import { useCallback, useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { auth } from "./firebase";
import {
  refreshVerification,
  sendVerification,
  verificationRetryAt,
  verificationFailure,
  verificationError,
  type VerificationRequest,
} from "./email-verification";

function requestNotice(result: VerificationRequest) {
  return result.status === "requested"
    ? "Đã yêu cầu gửi email xác minh. Thư có thể mất vài phút mới đến hộp thư của bạn."
    : "Yêu cầu gửi trước đã được tiếp nhận. Chưa gửi thêm thư trong thời gian chờ; bạn có thể gửi lại khi hết đếm ngược.";
}

export function VerifyEmailPage({ user }: { user: User }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retryAt, setRetryAt] = useState(() => verificationRetryAt(user.uid));
  const [now, setNow] = useState(Date.now);

  const check = useCallback(
    async (manual = false) => {
      setBusy("check");
      setError("");
      try {
        if (await refreshVerification(user))
          navigate("/", { replace: true });
        else if (manual)
          setNotice(
            "Email chưa được xác minh. Hãy mở liên kết trong thư, sau đó kiểm tra lại.",
          );
      } catch (e) {
        setError(verificationError(e));
      } finally {
        setBusy("");
      }
    },
    [user, navigate],
  );

  useEffect(() => {
    let active = true;
    const failed = verificationFailure(user.uid);
    if (failed) {
      setError(verificationError(failed));
      return;
    }
    setBusy("send");
    void sendVerification(user)
      .then((result) => {
        if (active) {
          setRetryAt(result.retryAt);
          setNotice(requestNotice(result));
        }
      })
      .catch((e) => {
        if (active) setError(verificationError(e));
      })
      .finally(() => {
        if (active) setBusy("");
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    const onFocus = () => {
      void check();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  async function resend() {
    setBusy("send");
    setError("");
    setNotice("");
    try {
      const result = await sendVerification(user);
      setRetryAt(result.retryAt);
      setNow(Date.now());
      setNotice(requestNotice(result));
    } catch (e) {
      setError(verificationError(e));
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    setBusy("logout");
    try {
      await signOut(auth);
    } catch (e) {
      setError(verificationError(e));
      setBusy("");
    }
  }

  const seconds = Math.max(0, Math.ceil((retryAt - now) / 1_000));
  return (
    <main className="auth verification-layout">
      <section className="auth-card verification-card">
        <div className="verify-badge">
          <ShieldCheck size={20} />
          <span>Xác minh email</span>
        </div>
        <h1>Kiểm tra hộp thư của bạn</h1>
        <p>
          Để truy cập OmniMail, hãy xác minh địa chỉ{" "}
          <strong>{user.email}</strong> bằng liên kết được gửi tới email này.
        </p>
        {notice && (
          <p className="auth-notice" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="verification-help">
          <strong>Chưa nhận được thư?</strong>
          <p>
            Kiểm tra cả Spam và Tất cả thư. Tìm thư có tiêu đề “Xác minh email”
            từ <strong>OmniMail</strong>. Nếu vẫn chưa thấy, đợi vài phút rồi
            gửi lại.
          </p>
          <p>
            Nếu tài khoản đã được tạo, hãy đăng nhập để tiếp tục xác minh thay
            vì đăng ký lại.
          </p>
        </div>
        <button
          className="primary"
          disabled={Boolean(busy)}
          onClick={() => void check(true)}
        >
          {busy === "check" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <ShieldCheck size={16} />
          )}{" "}
          Tôi đã xác minh email
        </button>
        <button
          className="secondary-button"
          disabled={Boolean(busy) || seconds > 0}
          onClick={() => void resend()}
        >
          <Mail size={16} />{" "}
          {seconds > 0 ? `Gửi lại sau ${seconds}s` : "Gửi lại email xác minh"}
        </button>
        <button
          className="secondary-button"
          disabled={Boolean(busy)}
          onClick={() => void logout()}
        >
          Đăng xuất / Dùng email khác
        </button>
      </section>
    </main>
  );
}
