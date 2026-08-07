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
import { useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  type AuthProvider,
  updateProfile,
} from "firebase/auth";
import { api } from "./api";
import { auth } from "./firebase";

type AuthMode = "login" | "register" | "forgot";
type SocialProvider = "google" | "facebook" | "microsoft";

function readableAuthError(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use": "Email này đã được sử dụng.",
    "auth/weak-password": "Mật khẩu cần có ít nhất 6 ký tự.",
    "auth/invalid-email": "Địa chỉ email không hợp lệ.",
    "auth/popup-closed-by-user": "Cửa sổ đăng nhập đã được đóng.",
    "auth/popup-blocked": "Trình duyệt đã chặn cửa sổ đăng nhập.",
    "auth/too-many-requests":
      "Bạn đã yêu cầu gửi quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const title = {
    login: "Welcome back",
    register: "Create your account",
    forgot: "Reset your password",
  }[mode];

  useEffect(() => {
    setError(""); setNotice(""); setEmail(""); setPassword("");
    setConfirmPassword(""); setFullName(""); setResetSent(false);
  }, [mode]);

  useEffect(() => {
    // Render's free service may be asleep. Wake it while the user is filling
    // the form so mailbox data is ready by the time authentication completes.
    void api.health().catch(() => undefined);
  }, []);

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
        if (password !== confirmPassword) {
          throw new Error("Mật khẩu xác nhận không khớp.");
        }
        await api.registrationPolicy(email);
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: fullName.trim() });
        await result.user.getIdToken(true);
        await api.updateMe(fullName.trim()).catch(() => undefined);
        nav("/app/home");
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
            {mode === "forgot"
              ? "Nhập email để nhận liên kết đặt lại mật khẩu."
              : "One calm place for every inbox."}
          </p>

          {mode === "forgot" && resetSent ? (
            <div className="reset-success">
              <div className="verify-badge"><Mail size={20} /> <span>Reset link sent</span></div>
              <p className="auth-notice">{notice}</p>
              <button className="secondary-button" type="button" onClick={() => { setResetSent(false); setNotice(""); }}>
                Gửi lại liên kết
              </button>
            </div>
          ) : (
            <form onSubmit={(event) => void submit(event)}>
              {mode === "register" && (
                <label>
                  Họ và tên
                  <input type="text" required minLength={2} maxLength={100} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nguyễn Văn An" autoComplete="name" />
                </label>
              )}
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
              {error && <p className="form-error">{error}</p>}
              {notice && <p className="auth-notice">{notice}</p>}
              <button className="primary" disabled={busy || Boolean(providerBusy)}>
                {busy ? <><LoaderCircle className="spin" size={16} /> Please wait…</> : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : "Send reset link"}
              </button>
            </form>
          )}
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
