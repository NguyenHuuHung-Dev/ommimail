import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  LoaderCircle,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthProvider,
} from "firebase/auth";
import { api } from "./api";
import { auth } from "./firebase";

type AuthMode = "login" | "register" | "forgot" | "verify";
type SocialProvider = "google" | "facebook" | "microsoft";

const temporaryEmailDomains = new Set([
  "10minutemail.com",
  "20minutemail.com",
  "emailondeck.com",
  "getnada.com",
  "guerrillamail.com",
  "mail.tm",
  "maildrop.cc",
  "mailinator.com",
  "moakt.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "yopmail.com",
]);

function isTemporaryEmail(value: string) {
  const domain = value.trim().toLowerCase().split("@")[1] ?? "";
  return temporaryEmailDomains.has(domain) || domain.endsWith(".mail.tm") || /(^|[.-])(temp|tempmail|disposable|throwaway|guerrilla|mailinator)([.-]|$)/.test(domain);
}

function readableAuthError(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use": "Email này đã được sử dụng.",
    "auth/weak-password": "Mật khẩu cần có ít nhất 6 ký tự.",
    "auth/invalid-email": "Địa chỉ email không hợp lệ.",
    "auth/popup-closed-by-user": "Cửa sổ đăng nhập đã được đóng.",
    "auth/popup-blocked": "Trình duyệt đã chặn cửa sổ đăng nhập.",
    "auth/account-exists-with-different-credential":
      "Email này đã gắn với một phương thức đăng nhập khác.",
  };
  return messages[code] ?? (error instanceof Error ? error.message : "Đã có lỗi xảy ra, thử lại sau.");
}

function providerFor(name: SocialProvider): AuthProvider {
  if (name === "google") return new GoogleAuthProvider();
  if (name === "facebook") return new FacebookAuthProvider();
  return new OAuthProvider("microsoft.com");
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState<SocialProvider | "">("");
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const title = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Reset your password",
    verify: "Verify your email",
  }[mode];

  async function signInWithProvider(name: SocialProvider) {
    setProviderBusy(name);
    setError("");
    try {
      await signInWithPopup(auth, providerFor(name));
      nav("/app/home");
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setProviderBusy("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        nav("/app/home");
        return;
      }
      if (mode === "register") {
        if (isTemporaryEmail(email)) {
          throw new Error("Không thể đăng ký bằng email tạm thời. Hãy dùng email cá nhân hoặc công ty.");
        }
        if (password !== confirmPassword) {
          throw new Error("Mật khẩu xác nhận không khớp.");
        }
        await api.registrationPolicy(email);
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(result.user);
        nav("/verify-email");
        return;
      }
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email);
        setResetSent(true);
        setNotice("Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư mục spam.");
        return;
      }
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  async function checkVerification() {
    if (!auth.currentUser) {
      setError("Phiên xác minh đã hết. Hãy đăng nhập lại.");
      return;
    }
    setVerifyBusy(true);
    setError("");
    setNotice("");
    try {
      await reload(auth.currentUser);
      if (auth.currentUser.emailVerified) {
        nav("/app/home");
      } else {
        setError("Email chưa được xác minh. Hãy mở email và bấm liên kết xác minh.");
      }
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setVerifyBusy(false);
    }
  }

  async function resendVerification() {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    setError("");
    try {
      await sendEmailVerification(auth.currentUser);
      setNotice("Đã gửi lại email xác minh. Hãy kiểm tra cả thư mục spam.");
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setVerifyBusy(false);
    }
  }

  const showProviders = mode === "login" || mode === "register";
  return (
    <main className="auth auth-layout">
      <aside className="auth-showcase">
        <div className="auth-showcase-brand">
          <span>OM</span>
          <strong>OmniMail</strong>
        </div>
        <div className="auth-showcase-copy">
          <span className="auth-kicker"><Sparkles /> Unified workspace</span>
          <h2>Mọi hộp thư.<br /><em>Một nơi quản lý.</em></h2>
          <p>Kết nối Gmail, Outlook và Temp Mail trong một giao diện tập trung, phân quyền rõ ràng.</p>
          <ul>
            <li><Mail /><span><strong>Unified inbox</strong><small>Đọc mail từ nhiều tài khoản</small></span></li>
            <li><ShieldCheck /><span><strong>Kiểm soát truy cập</strong><small>Admin, Premium và Basic</small></span></li>
            <li><Check /><span><strong>Read-only sharing</strong><small>Chia sẻ mailbox an toàn</small></span></li>
          </ul>
        </div>
        <small>OMNIMAIL · 2026</small>
      </aside>

      <section className="auth-panel">
        <section className="auth-card">
          <div className="auth-card-topline">
            <div className="brand large">
              <span className="brandmark"><img src="/logo.jpg" alt="OmniMail logo" /></span>
              OmniMail
            </div>
            <span className="auth-caption">SECURE ACCESS</span>
          </div>
          <h1>{title}</h1>
          <p className="muted">
            {mode === "verify"
              ? "Xác minh email để bảo vệ tài khoản trước khi vào workspace."
              : mode === "forgot"
                ? "Nhập email để nhận liên kết đặt lại mật khẩu."
                : "One calm place for every inbox."}
          </p>

          {mode === "verify" ? (
            <div className="verify-actions">
              <div className="verify-badge"><Mail size={20} /> <span>Verification link sent</span></div>
              <button className="primary" type="button" disabled={verifyBusy} onClick={() => void checkVerification()}>
                {verifyBusy ? "Checking…" : "I verified my email"}
              </button>
              <button className="secondary-button" type="button" disabled={verifyBusy} onClick={() => void resendVerification()}>
                Gửi lại email xác minh
              </button>
            </div>
          ) : mode === "forgot" && resetSent ? (
            <div className="reset-success">
              <div className="verify-badge"><Mail size={20} /> <span>Reset link sent</span></div>
              <p className="auth-notice">{notice}</p>
              <button className="secondary-button" type="button" onClick={() => { setResetSent(false); setNotice(""); }}>
                Gửi lại liên kết
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              <label>
                Email address
                <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </label>
              {mode !== "forgot" && (
                <label>
                  Password
                  <span className="password-input">
                    <input type={showPassword ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete={mode === "register" ? "new-password" : "current-password"} />
                    <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </span>
                </label>
              )}
              {mode === "register" && (
                <label>
                  Confirm password
                  <input type={showPassword ? "text" : "password"} required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repeat your password" autoComplete="new-password" />
                </label>
              )}
              {mode === "register" && <p className="auth-hint">Email tạm thời không được phép. Hãy dùng email cá nhân hoặc công ty.</p>}
              {error && <p className="form-error">{error}</p>}
              {notice && <p className="auth-notice">{notice}</p>}
              <button className="primary" disabled={busy || Boolean(providerBusy)}>
                {busy ? <><LoaderCircle className="spin" size={16} /> Please wait…</> : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
              </button>
            </form>
          )}
          {mode === "verify" && error && <p className="form-error">{error}</p>}
          {mode === "verify" && notice && <p className="auth-notice">{notice}</p>}
          <div className="auth-links">
            {mode === "login" ? (
              <><Link to="/forgot-password">Forgot password?</Link><Link to="/register">Create account</Link></>
            ) : <Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link>}
          </div>
          {showProviders && (
            <div className="auth-social-footer">
              <div className="auth-divider"><span>or continue with</span></div>
              <div className="auth-provider-grid">
                {(["google", "facebook", "microsoft"] as SocialProvider[]).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    className="provider-button provider-icon-button"
                    aria-label={`Đăng nhập với ${provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "Microsoft"}`}
                    title={provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "Microsoft"}
                    disabled={busy || Boolean(providerBusy)}
                    onClick={() => void signInWithProvider(provider)}
                  >
                    {providerBusy === provider ? <LoaderCircle className="spin" size={16} /> : <span className={`provider-mark ${provider}`}>{provider === "google" ? "G" : provider === "facebook" ? "f" : "M"}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
