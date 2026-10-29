import {
  AtSign,
  Inbox,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import "./site-header.css";

export type NavigationRole = "admin" | "premium" | "basic";
export type SiteHeaderProps = {
  variant?: "workspace" | "home";
  mode?: "guest" | "member" | "unverified";
  ready?: boolean;
  role?: NavigationRole;
  profileInitials?: string;
  unreadCount?: number;
  onOpenProfile?: () => void;
  onLogout?: () => void;
};

export function SiteHeader({
  variant = "workspace",
  mode = "guest",
  ready = true,
  role,
  profileInitials = "OM",
  unreadCount = 0,
  onOpenProfile,
  onLogout,
}: SiteHeaderProps) {
  const { pathname } = useLocation();
  const items = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/app/mailboxes", label: "Mailboxes", icon: Inbox },
    { to: "/app/connect", label: "Connect", icon: Plus },
    { to: "/app/temp-mail", label: "Temp Mail", icon: AtSign },
    ...(mode === "member" && role === "admin"
      ? [{ to: "/app/mail-admin", label: "Người dùng", icon: ShieldCheck }]
      : mode === "member" && role === "basic"
        ? [{ to: "/app/mail-admin", label: "Upgrade", icon: ShieldCheck }]
        : []),
    { to: "/app/mail-sharing", label: "Sharing", icon: UserRoundCheck },
  ];
  const navigationLinks = (home = false) =>
    items.map(({ to, label, icon: Icon }) => {
      const active =
        pathname === to ||
        (to === "/app/mail-sharing" && pathname === "/app/mailbox-sharing");
      return (
        <Link
          key={to}
          to={to}
          className={
            home
              ? `navitem${active ? " active" : ""}`
              : `site-nav-link${active ? " is-active" : ""}`
          }
          aria-current={active ? "page" : undefined}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          {!home && to === "/app/mailboxes" && unreadCount > 0 && (
            <b
              className="site-unread"
              aria-label={`${unreadCount} thư chưa đọc`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </b>
          )}
        </Link>
      );
    });
  if (variant === "home")
    return (
      <header className="poster-nav home-header">
        <Link
          className="poster-brand"
          to="/"
          onClick={() => window.scrollTo({ top: 0 })}
          aria-label="OmniMail — Trang chủ"
        >
          <img src="/logo.jpg" alt="OmniMail logo" />
          <strong>OmniMail</strong>
          <span>.</span>
        </Link>
        <nav aria-label="Primary navigation">{navigationLinks(true)}</nav>
        <div className="home-header-actions">
          {!ready ? (
            <span className="home-session-loading" role="status">
              Đang kết nối…
            </span>
          ) : mode === "guest" ? (
            <>
              <Link className="home-signin-link" to="/login">
                Đăng nhập
              </Link>
              <Link className="home-register-link" to="/register">
                Đăng ký <span aria-hidden="true">↗</span>
              </Link>
            </>
          ) : (
            <>
              {mode === "unverified" && (
                <Link className="home-register-link" to="/verify-email">
                  Xác minh email
                </Link>
              )}
              <button
                className="poster-icon"
                type="button"
                onClick={onLogout}
                aria-label="Đăng xuất"
                title="Đăng xuất"
              >
                <LogOut size={17} />
              </button>
              {mode === "member" && (
                <button
                  className="poster-account"
                  type="button"
                  onClick={onOpenProfile}
                  title="Quản lý hồ sơ"
                  aria-label="Quản lý hồ sơ"
                >
                  {profileInitials}
                </button>
              )}
            </>
          )}
        </div>
      </header>
    );
  return (
    <header className="site-header">
      <Link className="site-brand" to="/" aria-label="OmniMail — Trang chủ">
        <img src="/logo.jpg" width="36" height="36" alt="" />
        <span>
          OmniMail<span className="site-brand-dot">.</span>
        </span>
      </Link>
      <nav className="site-navigation" aria-label="Primary navigation">
        {navigationLinks()}
      </nav>
      <div className="site-header-actions">
        {!ready ? (
          <span className="site-session-loading" role="status">
            Đang kết nối…
          </span>
        ) : mode === "guest" ? (
          <>
            <Link className="site-login" to="/login">
              Đăng nhập
            </Link>
            <Link className="site-register" to="/register">
              Đăng ký <span aria-hidden="true">↗</span>
            </Link>
          </>
        ) : (
          <>
            {mode === "unverified" ? (
              <Link className="site-register" to="/verify-email">
                Xác minh email
              </Link>
            ) : (
              <button
                className="site-profile"
                type="button"
                onClick={onOpenProfile}
                title="Quản lý hồ sơ"
                aria-label="Quản lý hồ sơ"
              >
                {profileInitials}
              </button>
            )}
            <button
              className="site-signout"
              type="button"
              onClick={onLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut size={17} />
            </button>
          </>
        )}
      </div>
    </header>
  );
}
