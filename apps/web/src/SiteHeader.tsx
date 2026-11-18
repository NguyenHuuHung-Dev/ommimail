import {
  AtSign,
  ArrowUpRight,
  Inbox,
  LayoutDashboard,
  LogIn,
  LogOut,
  Plus,
  ShieldCheck,
  UserRoundCheck,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./site-header.css";

export type NavigationRole = "admin" | "premium" | "basic";
export type SiteHeaderProps = {
  variant?: "workspace" | "home";
  mode?: "guest" | "member" | "unverified";
  ready?: boolean;
  role?: NavigationRole;
  profileName?: string;
  unreadCount?: number;
  onOpenProfile?: () => void;
  onLogout?: () => void;
};

export function SiteHeader({
  variant = "workspace",
  mode = "guest",
  ready = true,
  role,
  profileName = "Tài khoản",
  unreadCount = 0,
  onOpenProfile,
  onLogout,
}: SiteHeaderProps) {
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuId = useId();
  useEffect(() => setAccountOpen(false), [pathname, mode, ready]);
  useEffect(() => {
    if (!accountOpen) return;
    const outside = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node))
        setAccountOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [accountOpen]);
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
          onClick={() => setAccountOpen(false)}
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
        <img src="/logo.png" width="28" height="28" alt="" />
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
              <LogIn size={16} aria-hidden="true" />
              Đăng nhập
            </Link>
            <Link className="site-register" to="/register">
              Đăng ký
              <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </>
        ) : (
          <div
            className="site-account-controls"
            ref={accountRef}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setAccountOpen(false);
            }}
          >
            <div className="site-account-identity">
              <strong title={profileName}>{profileName}</strong>
              <small>
                {mode === "unverified"
                  ? "Chưa xác minh"
                  : role === "admin"
                    ? "Quản trị viên"
                    : role === "premium"
                      ? "Premium"
                      : "Basic"}
              </small>
            </div>
            <button
              className="site-account-trigger"
              ref={triggerRef}
              type="button"
              aria-label="Menu tài khoản"
              aria-expanded={accountOpen}
              aria-controls={accountMenuId}
              onClick={() => setAccountOpen((open) => !open)}
            >
              <span className="site-menu-lines" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </button>
            {accountOpen && (
              <nav
                className="site-account-menu"
                id={accountMenuId}
                aria-label="Tài khoản"
              >
                <div className="site-compact-navigation">
                  <span className="site-menu-section-label">Điều hướng</span>
                  {navigationLinks()}
                </div>
                {mode === "unverified" && (
                  <Link
                    className="site-register"
                    to="/verify-email"
                    onClick={() => setAccountOpen(false)}
                  >
                    <ShieldCheck size={16} aria-hidden="true" />
                    Xác minh email
                  </Link>
                )}
                {mode === "member" && (
                  <button
                    className="site-profile"
                    type="button"
                    onClick={() => {
                      setAccountOpen(false);
                      onOpenProfile?.();
                    }}
                    title="Quản lý hồ sơ"
                    aria-label="Quản lý hồ sơ"
                  >
                    <UserRound size={16} aria-hidden="true" />
                    <span>Hồ sơ</span>
                  </button>
                )}
                <button
                  className="site-signout"
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    onLogout?.();
                  }}
                  aria-label="Đăng xuất"
                  title="Đăng xuất"
                >
                  <LogOut size={16} aria-hidden="true" />
                  <span>Đăng xuất</span>
                </button>
              </nav>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
