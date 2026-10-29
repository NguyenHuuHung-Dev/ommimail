import { useCallback, useEffect, useState } from "react";
import { signOut, type User } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { auth } from "./firebase";
import {
  refreshVerification,
  sendVerification,
  verificationRetryAt,
} from "./email-verification";

function verificationError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "auth/too-many-requests")
    return "Bạn đã gửi quá nhiều yêu cầu. Hãy đợi một lúc rồi thử lại.";
  if (code === "auth/network-request-failed")
    return "Không thể kết nối. Kiểm tra mạng rồi thử lại.";
  return "Không thể xử lý xác minh email. Hãy thử lại hoặc đăng xuất để dùng tài khoản khác.";
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
          navigate("/app/home", { replace: true });
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
    void sendVerification(user)
      .then((nextRetryAt) => {
        if (active) {
          setRetryAt(nextRetryAt);
          setNotice(
            "Đã gửi liên kết xác minh. Hãy kiểm tra hộp thư đến và thư mục spam.",
          );
        }
      })
      .catch((e) => {
        if (active) setError(verificationError(e));
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
    try {
      setRetryAt(await sendVerification(user));
      setNow(Date.now());
      setNotice(
        "Đã gửi lại liên kết xác minh. Hãy kiểm tra hộp thư và thư mục spam.",
      );
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
