import { Navigate } from "react-router-dom";
import { AuthPage } from "./AuthPage";
import { SessionError, SessionLoading, useAuthSession } from "./AuthSession";
import { VerifyEmailPage } from "./VerifyEmailPage";
import { MailApp } from "./MailApp";
import { Seo } from "./Seo";
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
  if (user)
    return <Navigate to={canAccess ? "/app/home" : "/verify-email"} replace />;
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
  if (canAccess) return <Navigate to="/app/home" replace />;
  return (
    <>
      <PrivateSeo />
      <VerifyEmailPage user={user} />
    </>
  );
}
