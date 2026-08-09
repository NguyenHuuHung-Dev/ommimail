import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updatePassword,
  updateProfile,
} from "firebase/auth";
import DOMPurify from "dompurify";
import { io } from "socket.io-client";
import type { MailAccount, MailMessage, MailSyncJob } from "@omnimail/shared";
import { api, apiBaseUrl } from "./api";
import { auth } from "./firebase";
import { useUI } from "./store";
import {
  ArrowLeft,
  AtSign,
  ChevronDown,
  Copy,
  FileText,
  Facebook,
  Github,
  Inbox,
  LayoutDashboard,
  LockKeyhole,
  LoaderCircle,
  LogOut,
  Mail,
  MoreHorizontal,
  Instagram,
  Paperclip,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRoundCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";

type UserRole = "admin" | "premium" | "basic";

const APP_NAV_ITEMS = [
  { page: "home", label: "Home", icon: LayoutDashboard },
  { page: "mailboxes", label: "Mailboxes", icon: Inbox },
  { page: "connect", label: "Connect", icon: Plus },
  { page: "temp-mail", label: "Temp Mail", icon: AtSign },
] as const;

function AppNav({
  page,
  role,
  unreadCount = 0,
  onNavigate,
  className,
}: {
  page: string;
  role: UserRole;
  unreadCount?: number;
  onNavigate: (path: string) => void;
  className?: string;
}) {
  const items = [
    ...APP_NAV_ITEMS,
    ...(role === "admin" ? [{ page: "mail-admin", label: "Mail Admin", icon: ShieldCheck }] : role === "basic" ? [{ page: "mail-admin", label: "Upgrade", icon: ShieldCheck }] : []),
    { page: "mail-sharing", label: "Share Mail", icon: UserRoundCheck },
  ];
  return (
    <nav className={className} aria-label="Primary navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.page}
            className={`navitem ${page === item.page ? "active" : ""}`}
            onClick={() => onNavigate(`/app/${item.page}`)}
            aria-current={page === item.page ? "page" : undefined}
          >
            <Icon />
            <span>{item.label}</span>
            {item.page === "mailboxes" && unreadCount > 0 && <b>{unreadCount}</b>}
          </button>
        );
      })}
    </nav>
  );
}

function ProviderDot({ p }: { p: string }) {
  return (
    <span className={`provider ${p}`}>
      {p === "gmail" ? "G" : p === "microsoft" ? "M" : "T"}
    </span>
  );
}
function initials(value?: string) {
  const parts = value?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (!parts.length) return "OM";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}
function ApiStatus({ pending, error, onRetry }: { pending: boolean; error: boolean; onRetry: () => void }) {
  if (!pending && !error) return null;
  return (
    <div className={`api-status ${error ? "error" : ""}`} role="status" aria-live="polite">
      <span>{error ? "API chưa phản hồi" : "Đang khởi động dịch vụ mail…"}</span>
      {error ? <button type="button" onClick={onRetry}>Thử lại</button> : <LoaderCircle className="spin" size={15} />}
    </div>
  );
}
export function MailApp() {
  const qc = useQueryClient();
  const ui = useUI();
  const setUI = useUI((state) => state.set);
  const location = useLocation();
  const navigate = useNavigate();
  const routePage = location.pathname.split("/")[2] || "home";
  const page = routePage === "accounts" ? "mailboxes" : routePage;
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    let active = true;
    let socket: ReturnType<typeof io> | undefined;
    void auth.currentUser?.getIdToken().then((token) => {
      if (!active) return;
      socket = io(apiBaseUrl, { auth: { token }, transports: ["websocket", "polling"] });
      socket.on("mailbox:sync", (job: MailSyncJob) => {
        void qc.invalidateQueries({ queryKey: ["accounts"] });
        if (job.status === "completed" || job.status === "failed")
          void qc.invalidateQueries({ queryKey: ["messages"] });
      });
    });
    return () => {
      active = false;
      socket?.disconnect();
    };
  }, [qc]);
  const { data: accounts = [], isPending: accountsPending, error: accountsError, refetch: refetchAccounts } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.accounts(),
  });
  const mailboxSearch = ui.search.trim();
  const { data: searchedAccounts = [] } = useQuery({
    queryKey: ["mail-accounts-search", mailboxSearch],
    queryFn: () => api.accounts(mailboxSearch),
    enabled: page === "mailboxes" && Boolean(mailboxSearch),
  });
  const visibleAccounts = page === "mailboxes" && mailboxSearch ? searchedAccounts : accounts;
  const inboxAccounts = useMemo(
    () => visibleAccounts.filter((account) => account.provider !== "temp"),
    [visibleAccounts],
  );
  const providerGroups = useMemo(
    () =>
      (["gmail", "microsoft"] as const)
        .map((provider) => ({
          provider,
          accounts: inboxAccounts.filter((account) => account.provider === provider),
        }))
        .filter((group) => group.accounts.length > 0),
    [inboxAccounts],
  );
  const selectedInboxAccount = inboxAccounts.some((account) => account.id === ui.selectedAccount)
    ? ui.selectedAccount
    : null;

  useEffect(() => {
    if (page === "mailboxes" && inboxAccounts.length > 0 && !selectedInboxAccount) {
      setUI({ selectedAccount: inboxAccounts[0].id });
    }
  }, [page, inboxAccounts, selectedInboxAccount, setUI]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connectedProvider = params.get("connected");
    if (connectedProvider && accounts.length > 0) {
      const newlyConnected = accounts.slice().reverse().find((a) => a.provider === connectedProvider);
      if (newlyConnected) {
        if (ui.selectedAccount !== newlyConnected.id || ui.selectedMessage !== null)
          setUI({ selectedAccount: newlyConnected.id, selectedMessage: null });
        params.delete("connected");
        navigate(
          { pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" },
          { replace: true },
        );
      }
    }
  }, [location.pathname, location.search, accounts, navigate, setUI, ui.selectedAccount, ui.selectedMessage]);
  const { data: me, isPending: mePending, error: meError, refetch: refetchMe } = useQuery({ queryKey: ["me"], queryFn: api.me });
  const servicePending = accountsPending || mePending;
  const serviceError = Boolean(accountsError || meError);
  const retryService = () => { void refetchAccounts(); void refetchMe(); };
  const query = `?limit=10${selectedInboxAccount ? `&accountId=${selectedInboxAccount}` : ""}`;
  const { data, isLoading, error, refetch: refetchMessages } = useQuery({
    queryKey: ["messages", query],
    queryFn: () => api.messages(query),
    enabled: page === "mailboxes" && Boolean(selectedInboxAccount),
    refetchInterval:
      page === "mailboxes" && selectedInboxAccount ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
  const messages = data?.items ?? [];
  const currentAccount = inboxAccounts.find((a) => a.id === selectedInboxAccount);
  const selectedSummary = ui.selectedMessage
    ? messages.find((m) => m.id === ui.selectedMessage)
    : undefined;
  const { data: selected } = useQuery({
    queryKey: ["message", selectedSummary?.id],
    queryFn: () => api.message(selectedSummary!.id),
    enabled: Boolean(selectedSummary),
  });
  const removeAccount = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: (_result, id) => {
      if (ui.selectedAccount === id)
        ui.set({ selectedAccount: null, selectedMessage: null });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.removeQueries({ queryKey: ["messages"] });
    },
  });
  const syncAccount = useMutation({
    mutationFn: async (accountId: string) => {
      const { job } = await api.syncAccount(accountId);
      let current = job;
      for (let attempt = 0; attempt < 80 && (current.status === "queued" || current.status === "running"); attempt += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        current = await api.syncJob(job.id);
      }
      if (current.status === "failed") throw new Error(current.error ?? "Mailbox sync failed");
      return current;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  const logout = async () => {
    await signOut(auth);
    qc.clear();
    navigate("/login", { replace: true });
  };
  if (page === "home")
    return (
      <>
        <ApiStatus pending={servicePending} error={serviceError} onRetry={retryService} />
        <HomeLanding
          onOpenProfile={() => setProfileOpen(true)}
          profileInitials={initials(me?.displayName ?? me?.email ?? auth.currentUser?.email ?? undefined)}
          onSearchMail={(value) => {
            setUI({
              selectedMessage: null,
              search: value.trim(),
            });
            navigate("/app/mailboxes");
          }}
          onNavigate={(path) => navigate(path)}
          onLogout={logout}
          role={me?.role ?? "basic"}
        />
        {profileOpen && <ProfileModal me={me} onClose={() => setProfileOpen(false)} />}
      </>
    );
  return (
    <div className="shell">
      <ApiStatus pending={servicePending} error={serviceError} onRetry={retryService} />
      <aside className={ui.sidebar ? "sidebar open" : "sidebar"}>
        <div className="brand">
          <span className="brandmark">
            <img src="/logo.jpg" alt="OmniMail logo" />
          </span>
          <span className="brand-title">OmniMail<span className="brand-dot">.</span></span>
          <span className="demo-pill">Read only</span>
        </div>
        <AppNav
          page={page}
          role={me?.role ?? "basic"}
          unreadCount={messages.filter((m) => !m.isRead).length}
          onNavigate={(path) => { ui.set({ sidebar: false }); navigate(path); }}
        />
        <div className="sidebar-bottom">
          <div className="user user-card">
            <button className="user-avatar" onClick={() => setProfileOpen(true)} title="Quản lý hồ sơ" aria-label="Quản lý hồ sơ">
              {initials(me?.displayName ?? me?.email ?? auth.currentUser?.email ?? undefined)}
            </button>
            <div>
              <strong>{me?.displayName ?? auth.currentUser?.displayName ?? "OmniMail user"}</strong>
              <small>{me?.email ?? auth.currentUser?.email ?? "Signed in"}</small>
            </div>
            <button className="logout-button" onClick={logout} title="Sign out" aria-label="Sign out">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {page === "mailboxes" ? (
        <>
          <section className="inbox-pane">
            <div className="mailbox-inbox-layout">
              <aside className="mailbox-account-rail">
                <div className="mailbox-rail-title"><span>Connected inboxes</span></div>
                <div className="mailbox-rail-search search">
                  <Search />
                  <input
                    value={ui.search}
                    onChange={(e) => ui.set({ search: e.target.value })}
                    placeholder="Search by email address"
                    aria-label="Search mailbox by email address"
                  />
                </div>
                {providerGroups.map((group) => {
                  const providerName = group.provider === "gmail" ? "Google / Gmail" : "Microsoft / Outlook";
                  return (
                    <section className="mailbox-provider-group" key={group.provider}>
                      <button
                        className={`mailbox-provider-heading ${currentAccount?.provider === group.provider ? "active" : ""}`}
                        onClick={() => ui.set({ selectedAccount: group.accounts[0].id, selectedMessage: null })}
                      >
                        <ProviderDot p={group.provider} />
                        <span><strong>{providerName}</strong></span>
                      </button>
                      <div className="mailbox-account-list">
                        {group.accounts.map((account) => (
                          <button
                            key={account.id}
                            className={account.id === selectedInboxAccount ? "active" : ""}
                            onClick={() => ui.set({ selectedAccount: account.id, selectedMessage: null })}
                            title={`Open ${account.emailAddress}`}
                          >
                            <span>{account.emailAddress}</span>
                            {account.id === selectedInboxAccount && <b>●</b>}
                          </button>
                        ))}
                      </div>
                    </section>
                  );
                })}
                {!inboxAccounts.length && (
                  <Empty
                    title={mailboxSearch ? "No mailbox matches this email" : "No connected inbox"}
                    description={mailboxSearch
                      ? "Shared mailboxes appear only after you enter at least the correct first 5 characters."
                      : "Connect Gmail or Microsoft to start."}
                  />
                )}
              </aside>
              <section className="mailbox-message-column">
              <div className="list-head">
              <div className="mailbox-picker">
                <span>Current mailbox</span>
                <label>
                  {currentAccount ? <ProviderDot p={currentAccount.provider} /> : <Mail />}
                  <select
                    value={ui.selectedAccount ?? ""}
                    onChange={(event) =>
                      ui.set({ selectedAccount: event.target.value || null, selectedMessage: null })
                    }
                  >
                    <option value="">Choose a mailbox</option>
                    {inboxAccounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.provider === "gmail" ? "Gmail" : "Microsoft"} — {account.emailAddress}
                      </option>
                    ))}
                  </select>
                  <ChevronDown />
                </label>
                <p>
                  {messages.length} {messages.length === 1 ? "mail" : "mails"}
                </p>
              </div>
              <div className="mailbox-head-actions">
                <button
                  className="account-sync"
                  disabled={!currentAccount || currentAccount.access === "shared" || syncAccount.isPending}
                  title={currentAccount?.access === "shared" ? "Shared mailboxes are synchronized by their owner" : "Sync latest messages"}
                  onClick={() => currentAccount && syncAccount.mutate(currentAccount.id)}
                >
                  <RefreshCw className={syncAccount.isPending ? "spin" : ""} />
                </button>
                <button
                  className="account-disconnect"
                  disabled={!currentAccount || currentAccount.access === "shared" || currentAccount.id === "microsoft-live" || removeAccount.isPending}
                  title="Disconnect current mailbox"
                  onClick={() => {
                    if (currentAccount && window.confirm(`Disconnect ${currentAccount.emailAddress} from OmniMail? Emails in the original mailbox will not be deleted.`))
                      removeAccount.mutate(currentAccount.id);
                  }}
                ><Trash2 /></button>
              </div>
              </div>
              <div className="message-list">
              {isLoading ? (
                <Skeleton />
              ) : error ? (
                <div className="mailbox-provider-error" role="alert">
                  <Mail />
                  <h3>Couldn’t load this mailbox</h3>
                  <p>{error instanceof Error ? error.message : "The mail provider rejected the request."}</p>
                  <div>
                    <button onClick={() => void refetchMessages()}>Try again</button>
                    <button onClick={() => navigate("/app/connect")}>Reconnect account</button>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <Empty
                  title="Your inbox is clear"
                  description={currentAccount?.provider === "microsoft"
                    ? "This is the Microsoft / Outlook inbox for this sign-in. It is separate from Gmail, even when both use the same Gmail address."
                    : "Gmail returned no messages from the Inbox folder."}
                />
              ) : (
                messages.map((m) => (
                  <MessageRow
                    key={m.id}
                    m={m}
                    account={visibleAccounts.find((a) => a.id === m.accountId)}
                    selected={selected?.id === m.id}
                    onSelect={() => ui.set({ selectedMessage: m.id })}
                  />
                ))
              )}
              </div>
              </section>
            </div>
          </section>
          <section className="detail-pane">
            {selected ? (
              <MessageDetail
                m={selected}
                account={visibleAccounts.find((a) => a.id === selected.accountId)}
                onClose={() => ui.set({ selectedMessage: null })}
              />
            ) : (
              <Empty title="Select a message" />
            )}
          </section>
        </>
      ) : page === "connect" ? (
        <ConnectPage onDone={() => navigate("/app/mailboxes")} />
      ) : (
        <PageContent
          page={page}
          accounts={accounts}
          role={me?.role ?? "basic"}
          openConnect={() => navigate("/app/connect")}
          navigateMailbox={(id) => {
            ui.set({ selectedAccount: id, selectedMessage: null });
            navigate(accounts.find((account) => account.id === id)?.provider === "temp" ? "/app/temp-mail" : "/app/mailboxes");
          }}
          removeAccount={(account) => {
            if (
              window.confirm(
                `Disconnect ${account.emailAddress} from OmniMail? Emails in the original mailbox will not be deleted.`,
              )
            )
              removeAccount.mutate(account.id);
          }}
          removingAccount={removeAccount.isPending ? removeAccount.variables : undefined}
        />
      )}
      {profileOpen && <ProfileModal me={me} onClose={() => setProfileOpen(false)} />}
    </div>
  );
}
type CurrentUserProfile = Awaited<ReturnType<typeof api.me>>;

function ProfileModal({
  me,
  onClose,
}: {
  me?: CurrentUserProfile;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const user = auth.currentUser;
  const [fullName, setFullName] = useState(me?.displayName ?? user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const passwordAccount = user?.providerData.some((provider) => provider.providerId === "password") ?? false;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const saveName = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    const normalized = fullName.trim();
    if (normalized.length < 2) {
      setError("Họ và tên cần ít nhất 2 ký tự.");
      return;
    }
    setBusy("profile"); setError(""); setNotice("");
    try {
      await updateProfile(user, { displayName: normalized });
      await user.getIdToken(true);
      await api.updateMe(normalized);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["me"] }),
        qc.invalidateQueries({ queryKey: ["admin-overview"] }),
      ]);
      setNotice("Đã cập nhật thông tin cá nhân.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Không thể cập nhật hồ sơ.");
    } finally { setBusy(""); }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!user?.email || !passwordAccount) return;
    if (newPassword.length < 8) { setError("Mật khẩu mới cần ít nhất 8 ký tự."); return; }
    if (newPassword !== confirmPassword) { setError("Mật khẩu xác nhận không khớp."); return; }
    setBusy("password"); setError(""); setNotice("");
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setNotice("Đã đổi mật khẩu thành công.");
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      setError(code === "auth/invalid-credential" ? "Mật khẩu hiện tại không đúng." : cause instanceof Error ? cause.message : "Không thể đổi mật khẩu.");
    } finally { setBusy(""); }
  };

  return (
    <div className="modal-backdrop profile-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <header>
          <div className="profile-heading">
            <span className="profile-avatar-large">{initials(fullName || me?.email || user?.email || undefined)}</span>
            <div><span className="eyebrow">Personal profile</span><h2 id="profile-title">Thông tin cá nhân</h2><p>Quản lý tên hiển thị và bảo mật tài khoản.</p></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng hồ sơ"><X /></button>
        </header>
        <div className="profile-content">
          <div className="profile-summary">
            <div><small>Email đăng nhập</small><strong>{me?.email ?? user?.email ?? "—"}</strong></div>
            <div><small>Vai trò</small><strong className={`role-badge ${me?.role ?? "basic"}`}>{me?.role ?? "basic"}</strong></div>
          </div>
          {(error || notice) && <div className={error ? "profile-message error" : "profile-message success"}>{error || notice}</div>}
          <form className="profile-form" onSubmit={(event) => void saveName(event)}>
            <div className="profile-section-title"><UserRoundCheck /><span><strong>Hồ sơ</strong><small>Tên này được hiển thị trong OmniMail và trang quản trị.</small></span></div>
            <label>Họ và tên<input required minLength={2} maxLength={100} value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
            <button className="primary" disabled={busy !== ""} type="submit">{busy === "profile" ? "Đang lưu…" : "Lưu thông tin"}</button>
          </form>
          <form className="profile-form password-form" onSubmit={(event) => void changePassword(event)}>
            <div className="profile-section-title"><LockKeyhole /><span><strong>Mật khẩu</strong><small>{passwordAccount ? "Xác nhận mật khẩu hiện tại trước khi đổi." : "Tài khoản mạng xã hội không sử dụng mật khẩu OmniMail."}</small></span></div>
            {passwordAccount && <>
              <label>Mật khẩu hiện tại<input type="password" required value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /></label>
              <div className="profile-password-grid">
                <label>Mật khẩu mới<input type="password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" /></label>
                <label>Xác nhận mật khẩu<input type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" /></label>
              </div>
              <button className="primary" disabled={busy !== ""} type="submit">{busy === "password" ? "Đang đổi…" : "Đổi mật khẩu"}</button>
            </>}
          </form>
        </div>
      </section>
    </div>
  );
}
function HomeLanding({
  onOpenProfile,
  profileInitials,
  onSearchMail,
  onNavigate,
  onLogout,
  role,
}: {
  onOpenProfile: () => void;
  profileInitials: string;
  onSearchMail: (value: string) => void;
  onNavigate: (path: string) => void;
  onLogout: () => void;
  role: UserRole;
}) {
  return (
    <div className="poster-home">
      <header className="poster-nav">
        <button className="poster-brand" onClick={() => window.scrollTo({ top: 0 })}><img src="/logo.jpg" alt="OmniMail logo" /><strong>OmniMail</strong><span>.</span></button>
        <AppNav page="home" role={role} onNavigate={onNavigate} />
        <div><button className="poster-icon" onClick={onLogout}><LogOut size={17} /></button><button className="poster-account" onClick={onOpenProfile} title="Quản lý hồ sơ" aria-label="Quản lý hồ sơ">{profileInitials}</button></div>
      </header>
      <main className="poster-stage">
        <section className="poster-copy">
          <div className="poster-copy-label"><strong>Live mail</strong><i /><span>Unified inbox</span></div>
          <h1><span>Every inbox.</span><br /><em>One signal.</em></h1>
          <p>Gmail, Outlook and temporary mail in one focused workspace.</p>
          <form className="poster-mail-search" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem("mailQuery"); onSearchMail(input instanceof HTMLInputElement ? input.value : ""); }}>
            <input name="mailQuery" inputMode="email" placeholder="Enter mailbox email address" aria-label="Search mailbox by email address" />
            <button className="poster-copy-action" type="submit"><span>Open mailbox</span><b>→</b></button>
          </form>
        </section>
        <figure className="poster-product" aria-label="OmniMail unified inbox">
          <img src="/homepage.png" alt="OmniMail character" />
        </figure>
        <span className="poster-side-label">READ · REFRESH · REPEAT</span>
        <div className="poster-socials"><a href="https://facebook.com" target="_blank" rel="noreferrer" aria-label="Facebook"><Facebook /></a><a href="https://instagram.com" target="_blank" rel="noreferrer" aria-label="Instagram"><Instagram /></a><a href="https://github.com/NguyenHuuHung-Dev" target="_blank" rel="noreferrer" aria-label="GitHub"><Github /></a></div>
      </main>
    </div>
  );
}
function PageContent({
  page,
  accounts,
  role,
  openConnect,
  navigateMailbox,
  removeAccount,
  removingAccount,
}: {
  page: string;
  accounts: MailAccount[];
  role: "basic" | "premium" | "admin";
  openConnect: () => void;
  navigateMailbox: (id: string) => void;
  removeAccount: (account: MailAccount) => void;
  removingAccount?: string;
}) {
  const qc = useQueryClient();
  const [tempLocal, setTempLocal] = useState(`inbox-${Math.random().toString(36).slice(2, 7)}`);
  const [tempDomain, setTempDomain] = useState("");
  const [selectedTemp, setSelectedTemp] = useState<string | null>(null);
  const [selectedTempMessage, setSelectedTempMessage] = useState<string | null>(null);
  const [copiedTemp, setCopiedTemp] = useState(false);
  const [grantUserId, setGrantUserId] = useState("");
  const [shareAccountId, setShareAccountId] = useState("");
  const [shareEmail, setShareEmail] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [adminRoleFilter, setAdminRoleFilter] = useState<"all"|"admin"|"premium"|"basic">("all");
  const tempAccounts = accounts.filter((account) => account.provider === "temp");
  const activeTempId = selectedTemp ?? tempAccounts[0]?.id ?? null;
  const activeTempAccount = tempAccounts.find((account) => account.id === activeTempId);
  const { data: tempDomains = [], error: tempDomainError } = useQuery({ queryKey: ["temp-domains"], queryFn: api.tempDomains, enabled: page === "temp-mail" });
  const createTemp = useMutation({ mutationFn: () => api.createTemp({ localPart: tempLocal, domain: tempDomain || tempDomains[0]?.name || "" }), onSuccess: (account) => { qc.invalidateQueries({ queryKey: ["accounts"] }); setSelectedTemp(account.id); setSelectedTempMessage(null); } });
  const { data: tempMessages, isLoading: tempLoading, refetch: refreshTemp } = useQuery({ queryKey: ["temp-messages", activeTempId], queryFn: () => api.messages(`?limit=10&accountId=${activeTempId}`), enabled: page === "temp-mail" && Boolean(activeTempId), refetchInterval: page === "temp-mail" && activeTempId ? 10_000 : false });
  const { data: tempMessage } = useQuery({ queryKey: ["message", selectedTempMessage], queryFn: () => api.message(selectedTempMessage!), enabled: page === "temp-mail" && Boolean(selectedTempMessage) });
  const copyTempAddress = async () => {
    if (!activeTempAccount) return;
    await navigator.clipboard.writeText(activeTempAccount.emailAddress);
    setCopiedTemp(true);
    window.setTimeout(() => setCopiedTemp(false), 1600);
  };
  const { data: admin, error: adminError } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.admin,
    enabled: (page === "mail-admin" || page === "mail-sharing") && role === "admin",
  });
  const updateRole=useMutation({mutationFn:({userId,nextRole}:{userId:string;nextRole:"basic"|"premium"})=>api.setUserRole(userId,nextRole),onSuccess:()=>qc.invalidateQueries({queryKey:["admin-overview"]})});
  const updateShare=useMutation({mutationFn:({accountId,userId,allowed}:{accountId:string;userId:string;allowed:boolean})=>api.setMailboxShare(accountId,userId,allowed),onSuccess:()=>qc.invalidateQueries({queryKey:["admin-overview"]})});
  const { data: sharing, error: sharingError } = useQuery({
    queryKey: ["mailbox-shares"],
    queryFn: api.mailboxShares,
    enabled: page === "mail-sharing",
  });
  const shareMailbox = useMutation({
    mutationFn: ({ accountId, email, allowed }: { accountId: string; email: string; allowed: boolean }) => api.shareMailbox(accountId, email, allowed),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mailbox-shares"] });
      qc.invalidateQueries({ queryKey: ["accounts"] });
      setShareEmail("");
    },
  });
  if (page === "accounts")
    return (
      <MailboxManager
        accounts={accounts}
        openConnect={openConnect}
        openMailbox={navigateMailbox}
        removeAccount={removeAccount}
        removingAccount={removingAccount}
      />
    );
  if (page === "home")
    return (
      <main className="page-pane home-page">
        <div className="home-hero">
          <div className="hero-copy">
            <span className="editorial-tag">01 / Unified mail</span>
            <h1>
              Every inbox.
              <br />
              <em>One signal.</em>
            </h1>
            <p>
              Ten recent messages. Zero noise. Your Gmail, Outlook and temporary
              addresses—live when you need them.
            </p>
            <button className="hero-action" onClick={openConnect}>
              Connect a mailbox <span>↗</span>
            </button>
          </div>
          <div className="hero-art" aria-hidden="true">
            <span className="hero-word">OMNI</span>
            <div className="mail-orbit">
              <Mail />
              <i />
              <i />
              <i />
            </div>
            <b>
              LIVE
              <br />
              MAIL
            </b>
          </div>
          <div className="hero-index">
            <span>READ ONLY</span>
            <strong>03</strong>
            <small>providers</small>
          </div>
        </div>
      </main>
    );
  if (page === "temp-mail")
    return (
      <main className="page-pane dashboard-page temp-mail-page">
        {(tempDomainError || createTemp.error) && <div className="connect-error temp-page-error">{(tempDomainError ?? createTemp.error)?.message}</div>}
        {activeTempAccount && <div className="temp-active-bar">
          <div><span>Your temporary email</span><strong>{activeTempAccount.emailAddress}</strong></div>
          <button className={copiedTemp ? "copied" : ""} onClick={copyTempAddress}><Copy />{copiedTemp ? "Copied" : "Copy"}</button>
          <button onClick={() => refreshTemp()}><RefreshCw />Refresh</button>
          <button className="danger" onClick={() => { if (window.confirm(`Remove ${activeTempAccount.emailAddress} from OmniMail?`)) removeAccount(activeTempAccount); }}><Trash2 />Delete</button>
        </div>}
        <section className="temp-workspace">
          <aside className="temp-addresses">
            <header><span>Addresses</span><b>{tempAccounts.length}</b></header>
            <div className="temp-sidebar-create">
              <strong>Tạo Temp Mail mới</strong>
              <label><span>Tên địa chỉ</span><input value={tempLocal} onChange={(e) => setTempLocal(e.target.value.replace(/[^a-z0-9._-]/gi, ""))} /></label>
              <label><span>Domain</span><select value={tempDomain || tempDomains[0]?.name || ""} onChange={(e) => setTempDomain(e.target.value)}>{tempDomains.map((domain) => <option key={domain.id} value={domain.name}>@{domain.name}</option>)}</select></label>
              <button className="primary" disabled={!tempDomains.length || createTemp.isPending} onClick={() => createTemp.mutate()}><Plus />{createTemp.isPending ? "Đang tạo…" : "Tạo & mở"}</button>
            </div>
            {tempAccounts.length ? tempAccounts.map((account) => <div className={activeTempId === account.id ? "temp-address active" : "temp-address"} key={account.id}><button onClick={() => { setSelectedTemp(account.id); setSelectedTempMessage(null); }}><ProviderDot p="temp" /><span><strong>{account.emailAddress}</strong><small>mail.tm · live</small></span><b>{account.unreadCount}</b></button><button className="temp-address-menu" title="Remove address" aria-label={`Remove ${account.emailAddress}`} onClick={() => { if (window.confirm(`Remove ${account.emailAddress} from OmniMail?`)) removeAccount(account); }}><MoreHorizontal /></button></div>) : <Empty title="No temporary address yet" />}
          </aside>
          <div className="temp-message-list"><header><div><strong>Latest messages</strong><small>Automatic refresh every 10 seconds</small></div><button onClick={() => refreshTemp()} disabled={!activeTempId}><RefreshCw /></button></header>{tempLoading ? <Skeleton /> : (tempMessages?.items ?? []).length ? tempMessages!.items.map((message) => <button className={selectedTempMessage === message.id ? "active" : ""} key={message.id} onClick={() => setSelectedTempMessage(message.id)}><strong>{message.from.name ?? message.from.address}</strong><span>{message.subject}</span><small>{new Date(message.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></button>) : <Empty title="Waiting for messages" />}</div>
          <article className="temp-reader">{tempMessage ? <><header><span>Message</span><time>{new Date(tempMessage.receivedAt).toLocaleString()}</time></header><div><h2>{tempMessage.subject}</h2><p className="temp-from">From {tempMessage.from.name ?? tempMessage.from.address} &lt;{tempMessage.from.address}&gt;</p><div className="temp-body">{tempMessage.textBody || tempMessage.preview}</div></div></> : <Empty title="Select a temp message" />}</article>
        </section>
      </main>
    );
  if (page === "mail-sharing") {
    const shareMailboxes = sharing?.mailboxes ?? [];
    const activeShareId = shareAccountId || shareMailboxes[0]?.account.id || "";
    const activeShare = shareMailboxes.find((item) => item.account.id === activeShareId) ?? shareMailboxes[0];
    return (
      <main className="page-pane mail-sharing-page dashboard-page">
        {(sharingError || shareMailbox.error) && <div className="connect-error">{(sharingError ?? shareMailbox.error)?.message}</div>}
        {!shareMailboxes.length ? <section className="share-empty-state"><Mail /><h2>Bạn chưa có mailbox để chia sẻ</h2><p>Kết nối Gmail, Microsoft hoặc Temp Mail trước, sau đó quay lại trang này để cấp quyền.</p><button className="primary" onClick={openConnect}><Plus /> Kết nối mailbox</button></section> : <section className="share-workspace">
          <aside className="share-mailbox-panel"><div className="share-section-label"><span>Your mailboxes</span><small>{shareMailboxes.length}</small></div><div className="share-mailbox-list">{shareMailboxes.map(({ account, recipients }) => <button key={account.id} className={activeShare?.account.id === account.id ? "active" : ""} onClick={() => { setShareAccountId(account.id); shareMailbox.reset(); }}><ProviderDot p={account.provider} /><span><strong>{account.emailAddress}</strong><small>{recipients.length ? `${recipients.length} người đang có quyền` : "Chưa chia sẻ"}</small></span><ChevronDown /></button>)}</div></aside>
          <div className="share-main-panel">{activeShare && <><div className="share-selected-mailbox"><ProviderDot p={activeShare.account.provider} /><div><span className="eyebrow">Selected mailbox</span><h2>{activeShare.account.emailAddress}</h2></div></div><form className="share-recipient-form" onSubmit={(event) => { event.preventDefault(); const email = shareEmail.trim(); if (email) shareMailbox.mutate({ accountId: activeShare.account.id, email, allowed: true }); }}><label htmlFor="share-recipient-email"><span>Share with</span><input id="share-recipient-email" type="email" value={shareEmail} onChange={(event) => setShareEmail(event.target.value)} placeholder="name@gmail.com" autoComplete="email" /><small>Người nhận phải có tài khoản Premium trên OmniMail.</small></label><button className="primary" type="submit" disabled={!shareEmail.trim() || shareMailbox.isPending}><UserRoundCheck />{shareMailbox.isPending ? "Đang chia sẻ…" : "Share mailbox"}</button></form><div className="share-recipients"><div className="share-section-heading"><div><span className="eyebrow">People with access</span><h2>Danh sách đã chia sẻ</h2></div><span>{activeShare.recipients.length}</span></div>{activeShare.recipients.length ? activeShare.recipients.map((recipient) => <div className="share-recipient-row" key={recipient.userId}><span className="share-recipient-avatar">{recipient.email.slice(0, 1).toUpperCase()}</span><span><strong>{recipient.email}</strong><small>{recipient.role === "premium" ? "Premium user" : recipient.role}</small></span><button type="button" onClick={() => shareMailbox.mutate({ accountId: activeShare.account.id, email: recipient.email, allowed: false })} disabled={shareMailbox.isPending}>Thu hồi</button></div>) : <div className="share-no-recipients"><UserRoundCheck /><p>Chưa có ai được chia sẻ mailbox này.</p></div>}</div></>}</div>
        </section>}
        <section className="shared-with-me-panel"><div className="share-section-heading"><div><span className="eyebrow">Private discovery</span><h2>Mailbox được chia sẻ cho tôi</h2></div><span>Bảo mật</span></div><p className="shared-with-me-empty">Danh sách mailbox được chia sẻ không hiển thị công khai. Vào Mailboxes và nhập đúng ít nhất 5 ký tự đầu của địa chỉ để mở mailbox đã được cấp quyền.</p></section>
      </main>
    );
  }
  if (page === "mail-admin") {
    if (role === "basic")
      return (
        <main className="page-pane upgrade-page dashboard-page">
          <div className="page-header"><div><span className="eyebrow">Nâng cấp tài khoản</span><h1>Mở khóa Premium</h1><p>Basic không thể xem hộp thư do Admin chia sẻ. Nâng cấp để nhận quyền truy cập.</p></div></div>
          <section className="pricing-grid">
            <article><span>BASIC</span><h2>Miễn phí</h2><strong>0đ<small>/tháng</small></strong><ul><li>Hộp thư cá nhân</li><li>Temp Mail</li><li>Không nhận mail Admin chia sẻ</li></ul><button disabled>Gói hiện tại</button></article>
            <article className="featured"><span>PREMIUM</span><h2>Cộng tác an toàn</h2><strong>99.000đ<small>/tháng</small></strong><ul><li>Tất cả tính năng Basic</li><li>Xem mail Admin cấp phép</li><li>Admin thu hồi quyền bất kỳ lúc nào</li></ul><button onClick={()=>window.alert("Cổng thanh toán đang được chuẩn bị. Vui lòng liên hệ Admin để nâng cấp.")}>Thanh toán & nâng cấp</button></article>
          </section>
        </main>
      );
    if(role === "premium") return <main className="page-pane dashboard-page"><div className="page-header"><div><span className="eyebrow">Premium access</span><h1>Truy cập mailbox được chia sẻ</h1><p>Để chống dò địa chỉ, OmniMail không liệt kê mailbox được Admin cấp. Hãy mở Mailboxes và nhập đúng ít nhất 5 ký tự đầu của địa chỉ mailbox.</p></div></div><section className="shared-mail-grid"><article><ShieldCheck/><div><strong>Private mailbox discovery</strong><small>Quyền xem vẫn được kiểm tra ở API sau khi địa chỉ khớp.</small></div></article></section></main>;
    return (
      <main className="page-pane dashboard-page admin-dashboard-page">
        <div className="page-header">
          <div>
            <span className="eyebrow">Restricted area</span>
            <h1>Mail Admin</h1>
            <p>Service health and account access controls.</p>
          </div>
        </div>
        {adminError ? (
          <div className="connect-error">{adminError.message}</div>
        ) : (
          <>
          <div className="admin-command-bar">
            <div><ShieldCheck /><span><strong>Quản trị hệ thống</strong><small>Vai trò, tài khoản và quyền truy cập mailbox</small></span></div>
            <button onClick={() => qc.invalidateQueries({ queryKey: ["admin-overview"] })}><RefreshCw /> Làm mới dữ liệu</button>
          </div>
          <div className="stats-grid admin-stats-grid">
            <div>
              <small>Users</small>
              <strong>{admin?.users ?? "—"}</strong>
            </div>
            <div>
              <small>Premium</small>
              <strong>{admin?.directory.filter((user) => user.role === "premium").length ?? "—"}</strong>
            </div>
            <div>
              <small>Basic</small>
              <strong>{admin?.directory.filter((user) => user.role === "basic").length ?? "—"}</strong>
            </div>
            <div>
              <small>Mailboxes</small>
              <strong>{admin?.connectedAccounts ?? "—"}</strong>
            </div>
          </div>
          {(updateRole.error || updateShare.error) && (
            <div className="connect-error">{(updateRole.error ?? updateShare.error)?.message}</div>
          )}
          <section className="grant-panel">
            <header>
              <div><span className="eyebrow">Cấp quyền mail</span><h2>Cho Premium user xem mailbox</h2></div>
              <select value={grantUserId} onChange={(event) => setGrantUserId(event.target.value)}>
                <option value="">Chọn Premium user</option>
                {(admin?.directory ?? []).filter((user) => user.role === "premium").map((user) => <option key={user.userId} value={user.userId}>{user.displayName ? `${user.displayName} — ${user.email}` : user.email}</option>)}
              </select>
            </header>
            {grantUserId ? (
              <div className="grant-mail-list">
                {accounts.length ? accounts.map((account) => {
                  const target = admin?.directory.find((user) => user.userId === grantUserId);
                  const checked = target?.sharedAccountIds.includes(account.id) ?? false;
                  return <label key={account.id}><input type="checkbox" checked={checked} disabled={updateShare.isPending} onChange={(event) => updateShare.mutate({ accountId: account.id, userId: grantUserId, allowed: event.target.checked })} /><ProviderDot p={account.provider} /><span><strong>{account.emailAddress}</strong><small>{checked ? "Đã cấp quyền xem" : "Chưa cấp quyền"}</small></span></label>;
                }) : <Empty title="Admin chưa kết nối mailbox nào" />}
              </div>
            ) : <p className="grant-hint">Chuyển tài khoản sang Premium bên dưới, sau đó chọn user tại đây để cấp từng mailbox.</p>}
          </section>
          <section className="admin-directory">
            <div className="admin-directory-tools">
              <label><Search /><input value={adminSearch} onChange={(event)=>setAdminSearch(event.target.value)} placeholder="Tìm họ tên, email hoặc user ID" /></label>
              <div>{(["all","admin","premium","basic"] as const).map((filter)=><button key={filter} className={adminRoleFilter===filter?"active":""} onClick={()=>setAdminRoleFilter(filter)}>{filter === "all" ? "Tất cả" : filter}</button>)}</div>
            </div>
            <header><span>Họ tên, email & role</span><span>Trạng thái quyền</span><span>Last active</span></header>
            {(admin?.directory ?? []).filter((user)=>adminRoleFilter==="all"||user.role===adminRoleFilter).filter((user)=>`${user.displayName ?? ""} ${user.email} ${user.userId}`.toLowerCase().includes(adminSearch.trim().toLowerCase())).map((user) => (
              <article key={user.userId}>
                <div><span className={`role-badge ${user.role}`}>{user.role}</span><strong>{user.displayName ?? "Chưa cập nhật họ tên"}</strong><small>{user.email}</small><small>{user.userId}</small>{user.role!=="admin"&&<select value={user.role} disabled={updateRole.isPending} onChange={e=>updateRole.mutate({userId:user.userId,nextRole:e.target.value as "basic"|"premium"})}><option value="basic">Chuyển thành Basic</option><option value="premium">Nâng lên Premium</option></select>}</div>
                <div className="admin-mailboxes"><strong>{user.role === "premium" ? `${user.sharedAccountIds.length} mailbox` : user.role === "basic" ? "Không có quyền chia sẻ" : "Toàn quyền hệ thống"}</strong><small>{user.role === "premium" ? "Đã được Admin cấp quyền xem" : user.role === "basic" ? "Nâng Premium để nhận mailbox" : "Administrator"}</small></div>
                <time>{user.lastSeenAt ? new Date(user.lastSeenAt).toLocaleString() : "—"}</time>
              </article>
            ))}
          </section>
          </>
        )}
      </main>
    );
  }
  return (
    <main className="page-pane">
      <Empty title="Page not found" />
    </main>
  );
}
function MailboxManager({
  accounts,
  openConnect,
  openMailbox,
  removeAccount,
  removingAccount,
}: {
  accounts: MailAccount[];
  openConnect: () => void;
  openMailbox: (id: string) => void;
  removeAccount: (account: MailAccount) => void;
  removingAccount?: string;
}) {
  const pageSize = 20;
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return accounts;
    return accounts.filter((account) =>
      account.emailAddress.toLowerCase().includes(term),
    );
  }, [accounts, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(currentPage, pageCount);
  const visible = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const providerName = (provider: string) =>
    provider === "microsoft" ? "Outlook" : provider === "temp" ? "Temp mail" : "Gmail";
  return (
    <main className="page-pane mailbox-manager dashboard-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">Mailbox directory</span>
          <h1>All mailboxes</h1>
          <p>Search, open, or disconnect accounts without scrolling through the dashboard.</p>
        </div>
        <button className="primary" onClick={openConnect}><Plus /> Connect account</button>
      </div>
      <div className="mailbox-toolbar">
        <label><Search /><input value={search} onChange={(event) => { setSearch(event.target.value); setCurrentPage(1); }} placeholder="Search by email address" /></label>
        <span>{filtered.length} of {accounts.length} accounts</span>
      </div>
      <section className="mailbox-directory">
        <header><span>Account</span><span>Provider</span><span>Status</span><span>Actions</span></header>
        {visible.length ? visible.map((account) => (
          <article key={account.id}>
            <div className="mailbox-identity"><ProviderDot p={account.provider} /><span><strong>{account.emailAddress}</strong><small>{account.displayName || "Connected mailbox"}</small></span></div>
            <strong>{providerName(account.provider)}</strong>
            <span className={`account-status ${account.status}`}>{account.status}</span>
            <div className="mailbox-actions">
              <button onClick={() => openMailbox(account.id)}>Open inbox</button>
              <button className="disconnect-account" onClick={() => removeAccount(account)} disabled={removingAccount === account.id || account.id === "microsoft-live"} title={account.id === "microsoft-live" ? "Server-managed mailbox" : "Disconnect account"}>
                <Trash2 /> {removingAccount === account.id ? "Removing…" : "Disconnect"}
              </button>
            </div>
          </article>
        )) : <Empty title="No mailboxes match your search" />}
      </section>
      <div className="mailbox-pagination">
        <button disabled={safePage === 1} onClick={() => setCurrentPage(safePage - 1)}>← Previous</button>
        <span>Page {safePage} / {pageCount}</span>
        <button disabled={safePage === pageCount} onClick={() => setCurrentPage(safePage + 1)}>Next →</button>
      </div>
    </main>
  );
}
function MessageRow({
  m,
  account,
  selected,
  onSelect,
}: {
  m: MailMessage;
  account?: MailAccount;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <article
      className={`message-row ${!m.isRead ? "unread" : ""} ${selected ? "selected" : ""}`}
      onClick={onSelect}
    >
      <span
        className={`star ${m.isStarred ? "on" : ""}`}
      >
        <Star />
      </span>
      <div className="avatar">
        {(m.from.name ?? m.from.address).slice(0, 2).toUpperCase()}
      </div>
      <div className="message-main">
        <div className="message-meta">
          <strong>{m.from.name ?? m.from.address}</strong>
          <span>
            {new Date(m.receivedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
        <h3>
          <ProviderDot p={account?.provider ?? "temp"} />
          {m.subject}
        </h3>
        <p>{m.preview}</p>
        <div className="chips">
          {m.labelIds.map((l) => (
            <span key={l}>{l}</span>
          ))}
          {m.hasAttachments && (
            <span>
              <Paperclip />
              Attachment
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
function MessageDetail({
  m,
  account,
  onClose,
}: {
  m: MailMessage;
  account?: MailAccount;
  onClose: () => void;
}) {
  return (
    <div className="detail">
      <div className="detail-toolbar">
        <button className="mobile-menu" onClick={onClose}>
          <ArrowLeft />
        </button>
        <span />
        <small>READ ONLY</small>
      </div>
      <div className="detail-scroll">
        <div className="subject-row">
          <h2>{m.subject}</h2>
          <span className="label">Inbox</span>
        </div>
        <div className="sender">
          <div className="avatar large-avatar">
            {(m.from.name ?? "M").slice(0, 2).toUpperCase()}
          </div>
          <div>
            <strong>{m.from.name}</strong>{" "}
            <small>&lt;{m.from.address}&gt;</small>
            <button className="to">
              to me <ChevronDown />
            </button>
          </div>
          <time>
            {new Date(m.receivedAt).toLocaleString(undefined, {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </time>
        </div>
        <div className="account-line">
          <ProviderDot p={account?.provider ?? "temp"} />
          via {account?.emailAddress}
        </div>
        <div className="mail-body">
          <MessageBody m={m} />
        </div>
        {m.attachments?.map((a) => (
          <div className="attachment" key={a.id}>
            <div>
              <FileText />
            </div>
            <span>
              <strong>{a.filename}</strong>
              <small>{(a.size / 1e6).toFixed(1)} MB</small>
            </span>
          </div>
        ))}
        <div className="note">
          <ShieldCheck />
          <div>
            <strong>Read-only mailbox</strong>
            <p>OmniMail observes provider messages and never sends email.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
function MessageBody({ m }: { m: MailMessage }) {
  const body = m.textBody?.trim() ?? "";
  const html = m.sanitizedHtmlBody?.trim() || (/<[a-z][\s\S]*>/i.test(body) ? body : "");
  if (html) {
    return <MailHtmlFrame html={html} />;
  }
  return body.split("\n").map((line, index) => <p key={index}>{line || <br />}</p>);
}
function MailHtmlFrame({ html }: { html: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(320);
  const safeHtml = DOMPurify.sanitize(html);
  const srcDoc = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      * { box-sizing: border-box; max-width: 100%; }
      html, body { margin: 0; padding: 0; min-width: 0; width: 100%; overflow-x: hidden; background: transparent; }
      body { padding: 8px 0; color: #18212b; font: 14px/1.6 Arial, sans-serif; overflow-wrap: anywhere; word-break: break-word; }
      table { max-width: 100% !important; width: 100% !important; table-layout: fixed !important; }
      tbody, tr, td, th { max-width: 100% !important; }
      td, th { overflow-wrap: anywhere !important; word-break: break-word !important; }
      img, video { display: block; max-width: 100% !important; height: auto !important; }
      pre { max-width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
      a { overflow-wrap: anywhere; }
    </style>
  </head>
  <body>${safeHtml}</body>
</html>`;

  return (
    <iframe
      ref={frameRef}
      className="mail-html-frame"
      title="Email content"
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      style={{ height }}
      onLoad={() => {
        const document = frameRef.current?.contentDocument;
        if (!document) return;
        setHeight(Math.max(320, document.documentElement.scrollHeight + 16));
      }}
    />
  );
}
function ConnectPage({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const location = useLocation();
  const {
    data: domains = [],
    isLoading,
    error,
  } = useQuery({ queryKey: ["temp-domains"], queryFn: api.tempDomains });
  const [localPart, setLocalPart] = useState(
    `inbox-${Math.random().toString(36).slice(2, 7)}`,
  );
  const [domain, setDomain] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api.createTemp({ localPart, domain: domain || domains[0]?.name || "" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
  });
  const [oauthError, setOauthError] = useState(
    () => new URLSearchParams(location.search).get("oauthError") ?? "",
  );
  const [oauthBusy, setOauthBusy] = useState("");
  const [gmailEmail, setGmailEmail] = useState("");
  const [gmailAppPassword, setGmailAppPassword] = useState("");
  const [msEmail, setMsEmail] = useState("");
  const [msClient, setMsClient] = useState("");
  const [msRefresh, setMsRefresh] = useState("");
  const [bulkMicrosoft, setBulkMicrosoft] = useState("");
  const gmailPasswordConnect = useMutation({
    mutationFn: () => api.connectGmailAppPassword({ email: gmailEmail.trim(), appPassword: gmailAppPassword.replace(/\s/g, "") }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["accounts"] }); onDone(); },
  });
  const tokenConnect = useMutation({
    mutationFn: () =>
      api.connectMicrosoftToken({
        email: msEmail,
        clientId: msClient || undefined,
        refreshToken: msRefresh,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounts"] });
      onDone();
    },
  });
  const batchConnect = useMutation({
    mutationFn: () => {
      const items = bulkMicrosoft
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((line) => {
          const parts = line.split("|").map((x) => x.trim().replace(/^\t+|\t+$/g, "")).filter(Boolean);
          return parts.length >= 3
            ? {
                email: parts[0],
                clientId: parts[1],
                refreshToken: parts.slice(2).join("|").trim(),
              }
            : { email: parts[0], refreshToken: parts.slice(1).join("|").trim() };
        });
      return api.connectMicrosoftBatch(items);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
  const oauth = async (provider: "google" | "microsoft") => {
    setOauthBusy(provider);
    setOauthError("");
    try {
      const { url } = await api.oauthStart(provider);
      window.location.assign(url);
    } catch (e) {
      setOauthError(e instanceof Error ? e.message : "Could not start OAuth");
      setOauthBusy("");
    }
  };
  return (
    <main className="page-pane connect-page dashboard-page">
      <section className="connect-modal connect-surface">
        <header>
          <div>
            <h2>Connect an account</h2>
            <p>Bring every inbox into one workspace.</p>
          </div>
          <button onClick={onDone} aria-label="Back to mailbox manager">
            <ArrowLeft />
          </button>
        </header>
        <div className="connect-channels">
        <section className="connect-channel gmail-channel">
          <header><span>01</span><div><strong>Google / Gmail</strong><small>OAuth 2.0 · Ready</small></div></header>
          <button onClick={() => oauth("google")} disabled={Boolean(oauthBusy)}>
            <ProviderDot p="gmail" />
            <span>
              <strong>Continue with Google</strong>
              <small>
                {oauthBusy === "google"
                  ? "Opening Google…"
                  : "OAuth 2.0 secure connection"}
              </small>
            </span>
          </button>
          <div className="gmail-divider"><span>or use Google 2FA</span></div>
          <div className="gmail-app-password">
            <strong>App Password</strong>
            <p>Dùng App Password 16 ký tự được tạo đúng từ tài khoản Gmail này. Không dùng mật khẩu Gmail, mã OTP hoặc mã xác minh 2 bước.</p>
            <details className="gmail-guide" open>
              <summary>Hướng dẫn lấy App Password 16 ký tự</summary>
              <div className="gmail-guide-content">
                <div className="guide-note"><ShieldCheck /><p><strong>App Password là gì?</strong><span>Đây là mật khẩu phụ Google tạo riêng cho OmniMail, không phải mật khẩu Gmail hay mã OTP. Bạn có thể thu hồi riêng bất kỳ lúc nào.</span></p></div>
                <ol>
                  <li><b>Đăng nhập đúng Gmail</b><span>Mở tài khoản Google của chính địa chỉ bạn sắp nhập bên dưới.</span></li>
                  <li><b>Bật Xác minh 2 bước</b><span>Vào Google Account → Security → 2-Step Verification và hoàn tất kích hoạt nếu chưa bật.</span></li>
                  <li><b>Mở trang App Passwords</b><span><a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Mở Google App Passwords ↗</a>, sau đó xác minh lại tài khoản nếu Google yêu cầu.</span></li>
                  <li><b>Tạo mã cho OmniMail</b><span>Nhập tên ứng dụng <code>OmniMail</code>, bấm Create/Tạo. Google sẽ hiển thị mã dạng <code>xxxx xxxx xxxx xxxx</code>.</span></li>
                  <li><b>Sao chép và kết nối</b><span>Dán mã 16 ký tự vào ô App Password bên dưới. Dấu cách sẽ được OmniMail tự loại bỏ.</span></li>
                </ol>
                <div className="guide-warning"><strong>Không thấy App Passwords?</strong><span>Tài khoản có thể chưa bật 2FA, là tài khoản công ty/trường học bị quản trị viên chặn, chỉ dùng khóa bảo mật, hoặc đang bật Advanced Protection.</span></div>
                <p className="guide-security">Không gửi mã này cho người khác. Nếu nghi ngờ bị lộ, hãy quay lại Google App Passwords và thu hồi mã OmniMail.</p>
              </div>
            </details>
            <input type="email" value={gmailEmail} onChange={(e) => setGmailEmail(e.target.value)} placeholder="yourname@gmail.com" />
            <input value={gmailAppPassword} onChange={(e) => setGmailAppPassword(e.target.value)} placeholder="xxxx xxxx xxxx xxxx" autoComplete="off" />
            <small>{gmailAppPassword.replace(/\s/g, "").length}/16 ký tự</small>
            <button className="primary" disabled={!gmailEmail || gmailAppPassword.replace(/\s/g, "").length !== 16 || gmailPasswordConnect.isPending} onClick={() => gmailPasswordConnect.mutate()}>{gmailPasswordConnect.isPending ? "Verifying…" : "Connect with App Password"}</button>
            {gmailPasswordConnect.error && <div className="connect-error">{gmailPasswordConnect.error.message}</div>}
          </div>
        </section>
        <section className="connect-channel microsoft-channel">
          <header><span>02</span><div><strong>Outlook / Microsoft</strong><small>OAuth or refresh-token connection</small></div></header>
          <button
            onClick={() => oauth("microsoft")}
            disabled={Boolean(oauthBusy)}
          >
            <ProviderDot p="microsoft" />
            <span>
              <strong>Continue with Microsoft Azure</strong>
              <small>
                {oauthBusy === "microsoft"
                  ? "Opening Microsoft…"
                  : "OAuth 2.0 secure connection"}
              </small>
            </span>
          </button>
        {oauthError && (
          <div className="connect-error oauth-error">{oauthError}</div>
        )}
        <details className="token-connect" open>
          <summary>Outlook / Microsoft — Refresh token</summary>
          <p>
            No Azure sign-in required. The token is verified by the backend and
            never returned to the browser.
          </p>
          <div className="token-fields">
            <input
              type="email"
              value={msEmail}
              onChange={(e) => setMsEmail(e.target.value)}
              placeholder="Microsoft email"
            />
            <input
              value={msClient}
              onChange={(e) => setMsClient(e.target.value)}
              placeholder="Client ID (optional)"
            />
            <textarea
              value={msRefresh}
              onChange={(e) => setMsRefresh(e.target.value)}
              placeholder="Paste refresh token"
            />
            <button
              className="primary"
              disabled={
                tokenConnect.isPending || !msEmail || msRefresh.length < 40
              }
              onClick={() => tokenConnect.mutate()}
            >
              {tokenConnect.isPending ? "Verifying…" : "Connect securely"}
            </button>
          </div>
          {tokenConnect.error && (
            <div className="connect-error">{tokenConnect.error.message}</div>
          )}
          <div className="bulk-import">
            <strong>Bulk import — up to 10 accounts</strong>
            <small>
              One account per line: email | client ID | refresh token
            </small>
            <textarea
              value={bulkMicrosoft}
              onChange={(e) => setBulkMicrosoft(e.target.value)}
              placeholder={
                "user1@outlook.com | client-id | refresh-token\nuser2@hotmail.com | client-id | refresh-token"
              }
            />
            <button
              className="primary"
              disabled={batchConnect.isPending || !bulkMicrosoft.trim()}
              onClick={() => batchConnect.mutate()}
            >
              {batchConnect.isPending
                ? "Connecting accounts…"
                : "Import Microsoft accounts"}
            </button>
            {batchConnect.data && (
              <span>
                {batchConnect.data.connected} connected ·{" "}
                {batchConnect.data.failed} failed
              </span>
            )}
            {batchConnect.error && (
              <div className="connect-error">{batchConnect.error.message}</div>
            )}
          </div>
        </details>
        </section>
        <section className="connect-channel temp-channel">
          <header><span>03</span><div><strong>Temporary mail</strong><small>Create a disposable mail.tm inbox</small></div></header>
        <div className="temp-connect">
          <div>
            <h3>mail.tm temporary inbox</h3>
            <p>
              Create a free disposable address and receive messages immediately.
            </p>
          </div>
          {isLoading ? (
            <p>Checking available domains…</p>
          ) : error ? (
            <div className="connect-error">{error.message}</div>
          ) : domains.length === 0 ? (
            <div className="connect-warning">
              <strong>mail.tm currently has no available domain.</strong>
              <span>
                Please wait a moment and refresh the available domains.
              </span>
              <a href="https://docs.mail.tm/" target="_blank" rel="noreferrer">
                Open mail.tm documentation
              </a>
            </div>
          ) : (
            <div className="address-builder">
              <input
                value={localPart}
                onChange={(e) =>
                  setLocalPart(e.target.value.replace(/[^a-z0-9._-]/gi, ""))
                }
              />
              <span>@</span>
              <select
                value={domain || domains[0].name}
                onChange={(e) => setDomain(e.target.value)}
              >
                {domains.map((d) => (
                  <option value={d.name} key={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <button
                className="primary"
                onClick={() => create.mutate()}
                disabled={create.isPending}
              >
                {create.isPending ? "Creating…" : "Create inbox"}
              </button>
            </div>
          )}
          {create.error && (
            <div className="connect-error">{create.error.message}</div>
          )}
        </div>
        </section>
        </div>
        <footer>
          <ShieldCheck /> Credentials stay on the server and are never exposed
          to the browser.
        </footer>
      </section>
    </main>
  );
}
function Skeleton() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <div className="skeleton" key={i}>
          <i />
          <span />
          <span />
        </div>
      ))}
    </>
  );
}
function Empty({ title, description = "Everything you need will appear here." }: { title: string; description?: string }) {
  return (
    <div className="empty">
      <Mail />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
