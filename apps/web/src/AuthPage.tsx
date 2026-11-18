import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  Eye,
  EyeOff,
  LoaderCircle,
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
import { CubeCluster3D } from "./CubeCluster3D";
import { auth } from "./firebase";
import { sendVerification } from "./email-verification";
import { readSessionNotice, clearSessionNotice } from "./session-access";
import { canEnterApp } from "./auth-access";

import { AuthAnimation } from "./AuthAnimation";

type AuthMode = "login" | "register" | "forgot";
type SocialProvider = "google" | "facebook" | "microsoft";

function readableAuthError(error: unknown) {
  const code = (error as { code?: string })?.code ?? "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "Email hoặc mật khẩu không đúng.",
    "auth/email-already-in-use": "Email này đã được sử dụng.",
    "auth/weak-password": "Mật khẩu cần có ít nhất 6 ký tự.",
    "auth/user-disabled": "Tài khoản đã bị quản trị viên khóa.",
    "auth/user-token-expired":
      "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại.",
    "auth/invalid-email": "Địa chỉ email không hợp lệ.",
    "auth/popup-closed-by-user": "Cửa sổ đăng nhập đã được đóng.",
    "auth/popup-blocked": "Trình duyệt đã chặn cửa sổ đăng nhập.",
    "auth/too-many-requests":
      "Bạn đã yêu cầu gửi quá nhiều lần. Hãy đợi một lúc rồi thử lại.",
    "auth/account-exists-with-different-credential":
      "Email này đã gắn với một phương thức đăng nhập khác.",
  };
  return (
    messages[code] ??
    (error instanceof Error ? error.message : "Đã có lỗi xảy ra, thử lại sau.")
  );
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
    login: "Đăng nhập.",
    register: "Tạo tài khoản.",
    forgot: "Đặt lại mật khẩu.",
  }[mode];

  useEffect(() => {
    setError("");
    setNotice(readSessionNotice());
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setConfirmPassword("");
    setFullName("");
    setResetSent(false);
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
      const { user } = await signInWithPopup(auth, providerFor(name));
      nav((await canEnterApp(user)) ? "/" : "/verify-email", { replace: true });
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setProviderBusy("");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    clearSessionNotice();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "login") {
        const { user } = await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        nav((await canEnterApp(user)) ? "/" : "/verify-email", {
          replace: true,
        });
        return;
      }
      if (mode === "register") {
        if (password !== confirmPassword) {
          throw new Error("Mật khẩu xác nhận không khớp.");
        }
        await api.registrationPolicy(email.trim());
        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(result.user, { displayName: fullName.trim() });
        // The verification screen retains send failures and offers a manual retry.
        // Account creation has already succeeded, so never make users sign up again.
        await sendVerification(result.user).catch(() => undefined);
        nav("/verify-email", { replace: true });
        return;
      }
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email.trim());
        setResetSent(true);
        setNotice(
          "Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư mục spam.",
        );
        return;
      }
    } catch (e) {
      setError(readableAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  const showProviders = mode !== "forgot";
  const registering = mode === "register";
  return (
    <main className={`auth auth-layout auth-redesign auth-redesign--${mode}`}>
      <header className="auth-page-header">
        <Link
          className="auth-wordmark"
          to="/"
          aria-label="OmniMail — Trang chủ"
        >
          <img src="/logo.png" width="30" height="30" alt="" />
          <strong>
            OmniMail<span>.</span>
          </strong>
        </Link>
        <Link className="auth-return-home" to="/">
          <ArrowLeft size={15} aria-hidden="true" />
          Về trang chủ
        </Link>
      </header>
      <div className="auth-main-grid">
        <aside className="auth-scene" aria-label="Không gian OmniMail">
          <div className="auth-scene-copy">
            <span className="auth-scene-eyebrow">EVERY INBOX. ONE SIGNAL.</span>
            <h2>
              {registering ? (
                <>
                  Ít tab hơn.
                  <br />
                  <em>Nhiều kết nối hơn.</em>
                </>
              ) : (
                <>
                  Mọi hộp thư.
                  <br />
                  <em>Một nơi quản lý.</em>
                </>
              )}
            </h2>
            <p>
              {registering
                ? "Bắt đầu với tài khoản miễn phí. Kết nối hộp thư của bạn khi đã sẵn sàng."
                : "Gmail, Outlook và email tạm thời, cùng một không gian quen thuộc."}
            </p>
          </div>
          <div className="auth-scene-art">
            <CubeCluster3D variant="badge" className="auth-scene-cubes" />
            <span className="auth-scene-word" aria-hidden="true">
              {registering ? "TOGETHER" : "CONNECTED"}
            </span>
            <AuthAnimation
              key={registering ? "team" : "salesman"}
              src={
                registering
                  ? "/animations/business-team.json"
                  : "/animations/business-salesman.json"
              }
            />
          </div>
          <div className="auth-scene-providers">
            <div aria-hidden="true">
              <img src="/icons/gmail-3d.webp" alt="" />
              <img src="/icons/outlook-3d.webp" alt="" />
            </div>
            <span>
              Nhiều hộp thư.
              <br />
              <strong>Cùng một không gian.</strong>
            </span>
          </div>
        </aside>
        <section className="auth-panel" aria-labelledby="auth-title">
          <section className="auth-card">
            {showProviders && (
              <nav className="auth-mode-tabs" aria-label="Truy cập tài khoản">
                <Link
                  to="/login"
                  aria-current={mode === "login" ? "page" : undefined}
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  aria-current={registering ? "page" : undefined}
                >
                  Đăng ký
                </Link>
              </nav>
            )}
            <span className="auth-form-eyebrow">
              {registering
                ? "KHÔNG GIAN CỦA BẠN"
                : mode === "forgot"
                  ? "BẮT ĐẦU LẠI THẬT DỄ"
                  : "CHÀO MỪNG TRỞ LẠI"}
            </span>
            <h1 id="auth-title">{title}</h1>
            <p className="auth-form-description">
              {mode === "forgot"
                ? "Nhập email của bạn để nhận liên kết đặt lại mật khẩu."
                : registering
                  ? "Một tài khoản cho những kết nối mỗi ngày."
                  : "Hộp thư của bạn đang chờ. Cùng tiếp tục nhé."}
            </p>
            {showProviders && (
              <>
                <div className="auth-provider-grid">
                  {(
                    ["google", "facebook", "microsoft"] as SocialProvider[]
                  ).map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="provider-button"
                      aria-label={`Đăng nhập với ${provider === "google" ? "Google" : provider === "facebook" ? "Facebook" : "Microsoft"}`}
                      disabled={busy || Boolean(providerBusy)}
                      onClick={() => void signInWithProvider(provider)}
                    >
                      {providerBusy === provider ? (
                        <LoaderCircle className="spin" size={16} />
                      ) : (
                        <ProviderMark provider={provider} />
                      )}
                      <span>
                        {provider === "google"
                          ? "Google"
                          : provider === "facebook"
                            ? "Facebook"
                            : "Microsoft"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="auth-divider">
                  <span>hoặc dùng email</span>
                </div>
              </>
            )}
            {mode === "forgot" && resetSent ? (
              <div className="reset-success">
                <div className="verify-badge">
                  <ShieldCheck size={18} />
                  <span>Đã gửi liên kết</span>
                </div>
                <p className="auth-notice" role="status">
                  {notice}
                </p>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setResetSent(false);
                    setNotice("");
                  }}
                >
                  Gửi lại liên kết
                </button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                {registering && (
                  <label>
                    Họ và tên
                    <input
                      type="text"
                      name="fullName"
                      required
                      minLength={2}
                      maxLength={100}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn An"
                      autoComplete="name"
                    />
                  </label>
                )}
                <label>
                  Địa chỉ email
                  <input
                    type="email"
                    name="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                </label>
                {mode !== "forgot" && (
                  <div
                    className={`auth-password-fields${registering ? " is-pair" : ""}`}
                  >
                    <label>
                      Mật khẩu
                      <span className="password-input">
                        <input
                          name="password"
                          aria-label="Mật khẩu"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder={
                            registering
                              ? "Ít nhất 6 ký tự"
                              : "Nhập mật khẩu của bạn"
                          }
                          autoComplete={
                            registering ? "new-password" : "current-password"
                          }
                        />
                        <button
                          type="button"
                          aria-label={
                            showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                          }
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword((value) => !value)}
                        >
                          {showPassword ? (
                            <EyeOff size={16} />
                          ) : (
                            <Eye size={16} />
                          )}
                        </button>
                      </span>
                    </label>
                    {registering && (
                      <label>
                        Xác nhận mật khẩu
                        <input
                          name="confirmPassword"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Nhập lại mật khẩu"
                          autoComplete="new-password"
                        />
                      </label>
                    )}
                  </div>
                )}
                {mode === "login" && (
                  <div className="auth-forgot">
                    <Link to="/forgot-password">Quên mật khẩu?</Link>
                  </div>
                )}
                {error && (
                  <p className="form-error" role="alert">
                    {error}
                  </p>
                )}
                {notice && (
                  <p className="auth-notice" role="status">
                    {notice}
                  </p>
                )}
                <button
                  className="primary"
                  disabled={busy || Boolean(providerBusy)}
                >
                  {busy ? (
                    <>
                      <LoaderCircle className="spin" size={16} />
                      Đang xử lý…
                    </>
                  ) : (
                    <>
                      <span>
                        {mode === "login"
                          ? "Đăng nhập"
                          : registering
                            ? "Tạo tài khoản"
                            : "Gửi liên kết"}
                      </span>
                      <ArrowRight size={17} aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>
            )}
            {registering && (
              <p className="auth-registration-note">
                <ShieldCheck size={16} aria-hidden="true" />
                <span>
                  Bạn cần xác minh địa chỉ email qua liên kết gửi đến hộp thư để
                  bắt đầu sử dụng.
                </span>
              </p>
            )}
            {mode === "forgot" && (
              <Link className="auth-back-login" to="/login">
                <ArrowLeft size={14} aria-hidden="true" />
                Quay lại đăng nhập
              </Link>
            )}
          </section>
        </section>
      </div>
      <footer className="auth-page-footer">
        <span>© 2026 OmniMail</span>
        <nav aria-label="Thông tin OmniMail">
          <Link to="/security">
            Bảo mật <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
          <Link to="/privacy">
            Quyền riêng tư <ArrowUpRight size={12} aria-hidden="true" />
          </Link>
        </nav>
      </footer>
    </main>
  );
}

function ProviderMark({ provider }: { provider: SocialProvider }) {
  if (provider === "microsoft")
    return (
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <path fill="#f25022" d="M1 1h10v10H1z" />
        <path fill="#7fba00" d="M13 1h10v10H13z" />
        <path fill="#00a4ef" d="M1 13h10v10H1z" />
        <path fill="#ffb900" d="M13 13h10v10H13z" />
      </svg>
    );
  if (provider === "facebook")
    return (
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true">
        <circle cx="12" cy="12" r="12" fill="#1877f2" />
        <path
          fill="#fff"
          d="M13.7 22v-9h2.35l.35-2.73h-2.7V8.53c0-.79.22-1.33 1.35-1.33h1.45V4.76a19.4 19.4 0 0 0-2.1-.11c-2.08 0-3.5 1.27-3.5 3.6v2.02H8.55V13h2.35v9z"
        />
      </svg>
    );
  return (
    <svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.9 46.98 24.55z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
