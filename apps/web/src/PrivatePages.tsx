import { Navigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { AuthPage } from "./AuthPage";
import { SessionError, SessionLoading, useAuthSession } from "./AuthSession";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { MailApp } from "./MailApp";
import { Seo, omnimailSchema } from "./Seo";
import { HomeLanding } from "./HomeLanding";
import { auth } from "./firebase";
import "./modern.css";
import "./styles.css";
import "./admin-access.css";
import "./dashboard-polish.css";
import "./responsive.css";
import "./mailbox-errors.css";
import "./share-dashboard.css";
import "./message-sharing.css";
import "./verification.css";
import "./workspace-polish.css";
import "./admin-console.css";

export function HomeRoute() {
  const { user, canAccess, loading } = useAuthSession();
  return (
    <>
      <Seo
        title="OmniMail — Mọi hộp thư, một nơi quản lý"
        description="Kết nối Gmail, Outlook và email tạm thời trong một không gian tập trung. Tạo tài khoản OmniMail miễn phí để bắt đầu."
        path="/"
        schema={omnimailSchema}
      />
      {user && canAccess ? (
        <MailApp />
      ) : (
        <HomeLanding
          mode={user ? "unverified" : "guest"}
          ready={!loading}
          onLogout={() => void signOut(auth)}
        />
      )}
    </>
  );
}

function PrivateSeo() {
  return (
    <Seo
      title="Ứng dụng | OmniMail"
      description="Khu vực ứng dụng OmniMail dành cho người dùng đã đăng nhập."
      noIndex
    />
  );
}

export function Guard() {
  const { user, canAccess, loading, error } = useAuthSession();
  if (loading)
    return (
      <>
        <PrivateSeo />
        <SessionLoading />
      </>
    );
  if (error) return <SessionError />;
  if (!user)
    return (
      <>
        <PrivateSeo />
        <Navigate to="/login" replace />
      </>
    );
  if (!canAccess) return <Navigate to="/verify-email" replace />;
  return (
    <>
      <PrivateSeo />
      <MailApp />
    </>
  );
}

export function AuthRoute({ mode }: { mode: "login" | "register" | "forgot" }) {
  const { user, canAccess, loading, error } = useAuthSession();
  if (loading) return <SessionLoading />;
  if (error) return <SessionError />;
  if (user) return <Navigate to={canAccess ? "/" : "/verify-email"} replace />;
  const titles = {
    login: "Đăng nhập | OmniMail",
    register: "Tạo tài khoản | OmniMail",
    forgot: "Đặt lại mật khẩu | OmniMail",
  };
  return (
    <>
      <Seo
        title={titles[mode]}
        description="Truy cập tài khoản OmniMail."
        noIndex
      />
      <AuthPage mode={mode} />
    </>
  );
}

export function VerifyEmailRoute() {
  const { user, canAccess, loading, error } = useAuthSession();
  if (loading) return <SessionLoading />;
  if (error) return <SessionError />;
  if (!user) return <Navigate to="/login" replace />;
  if (canAccess) return <Navigate to="/" replace />;
  return (
    <>
      <PrivateSeo />
      <VerifyEmailPage user={user} />
    </>
  );
}
