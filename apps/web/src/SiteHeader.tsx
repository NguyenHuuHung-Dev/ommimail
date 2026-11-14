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
        : mode === "member" && role === "premium"
          ? [{ to: "/app/mail-admin", label: "Premium", icon: ShieldCheck }]
          : []),
    { to: "/app/mail-sharing", label: "Sharing", icon: UserRoundCheck },
  ];
  const navigationLinks = () =>
    items.map(({ to, label, icon: Icon }) => {
      const active =
        pathname === to ||
        (to === "/app/mail-sharing" && pathname === "/app/mailbox-sharing");
      return (
        <Link
          key={to}
          to={to}
          className={`site-nav-link${active ? " is-active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <Icon size={16} aria-hidden="true" />
          <span>{label}</span>
          {to === "/app/mailboxes" && unreadCount > 0 && (
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
  return (
    <header className={`site-header site-header--${variant}`}>
      <Link
        className="site-brand"
        to="/"
        onClick={() => window.scrollTo({ top: 0 })}
        aria-label="OmniMail — Trang chủ"
      >
        <img src="/logo.jpg" width="28" height="28" alt="" />
        <strong>OmniMail</strong>
        <span className="site-brand-dot">.</span>
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
            ) : null}
            <button
              className="site-signout"
              type="button"
              onClick={onLogout}
              aria-label="Đăng xuất"
              title="Đăng xuất"
            >
              <LogOut size={17} />
            </button>
            {mode === "member" && (
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
          </>
        )}
      </div>
    </header>
  );
}
