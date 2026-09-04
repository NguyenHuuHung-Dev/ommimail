import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { onAuthStateChanged, type User } from "firebase/auth";
import { AuthPage } from "./AuthPage";
import { auth } from "./firebase";
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
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (nextUser) await nextUser.getIdToken(true);
      if (active) setUser(nextUser);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  if (user === undefined)
    return (
      <>
        <PrivateSeo />
        <div className="app-loading">Loading OmniMail…</div>
      </>
    );
  if (!user)
    return (
      <>
        <PrivateSeo />
        <Navigate to="/login" replace />
      </>
    );
  return (
    <>
      <PrivateSeo />
      <MailApp />
    </>
  );
}

export function AuthRoute({ mode }: { mode: "login" | "register" | "forgot" }) {
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
