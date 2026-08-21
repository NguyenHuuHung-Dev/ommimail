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
import type { MailAccount, MailMessage, MailSyncJob, MessageShare } from "@omnimail/shared";
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
    { page: "mail-sharing", label: "Sharing", icon: UserRoundCheck },
  ];
  const activePage = page === "mailbox-sharing" ? "mail-sharing" : page;
  return (
    <nav className={className} aria-label="Primary navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.page}
            className={`navitem ${activePage === item.page ? "active" : ""}`}
            onClick={() => onNavigate(`/app/${item.page}`)}
            aria-current={activePage === item.page ? "page" : undefined}
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
function parseShareRecipients(value: string) {
  const entries = [...new Set(value.split(/[\s,;]+/).map((entry) => entry.trim().toLowerCase()).filter(Boolean))];
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return {
    valid: entries.filter((entry) => emailPattern.test(entry)),
    invalid: entries.filter((entry) => !emailPattern.test(entry)),
  };
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
  const [shareTarget, setShareTarget] = useState<MailMessage | null>(null);
  const [mailFolder, setMailFolder] = useState<"main" | "spam">("main");
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
  const query = `?limit=250&refresh=1${selectedInboxAccount ? `&accountId=${selectedInboxAccount}` : ""}`;
  const { data, isLoading, error, refetch: refetchMessages } = useQuery({
    queryKey: ["messages", query],
    queryFn: () => api.messages(query),
    enabled: page === "mailboxes" && Boolean(selectedInboxAccount),
    refetchInterval:
      page === "mailboxes" && selectedInboxAccount ? 5_000 : false,
    refetchIntervalInBackground: false,
  });
  const allMessages = data?.items ?? [];
  const spamMessages = allMessages.filter((message) => message.folderIds.includes("spam"));
  const mainMessages = allMessages.filter((message) => !message.folderIds.includes("spam"));
  const messages = mailFolder === "spam" ? spamMessages : mainMessages;
  const currentAccount = inboxAccounts.find((a) => a.id === selectedInboxAccount);

  useEffect(() => {
    setMailFolder("main");
    setUI({ selectedMessage: null });
  }, [selectedInboxAccount, setUI]);
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
        {profileOpen && <ProfileModal me={me} accounts={accounts} onClose={() => setProfileOpen(false)} />}
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
          unreadCount={allMessages.filter((m) => !m.isRead).length}
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
                  className={`spam-toolbar-button ${mailFolder === "spam" ? "open" : ""}`}
                  type="button"
                  disabled={!currentAccount}
                  title={mailFolder === "spam" ? "Quay lại hộp thư chính" : "Mở thư Spam / Junk"}
                  onClick={() => {
                    setMailFolder(mailFolder === "spam" ? "main" : "spam");
                    ui.set({ selectedMessage: null });
                  }}
                >
                  {mailFolder === "spam" ? <ArrowLeft /> : <Mail />}
                  <span>{mailFolder === "spam" ? "Inbox" : "Spam"}</span>
                  <b>{spamMessages.length}</b>
                </button>
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
              ) : (
                <>
                  {messages.length === 0 ? (
                    <Empty
                      title={mailFolder === "spam" ? "Không có thư Spam" : "Your inbox is clear"}
                      description={mailFolder === "spam"
                        ? "Các thư bị nhà cung cấp đánh dấu Spam hoặc Junk sẽ xuất hiện riêng tại đây."
                        : currentAccount?.provider === "microsoft"
                          ? "This is the Microsoft / Outlook inbox for this sign-in. It is separate from Gmail, even when both use the same Gmail address."
                          : "Gmail returned no messages from the Inbox folder."}
                    />
                  ) : messages.map((m) => (
                    <MessageRow
                      key={m.id}
                      m={m}
                      account={visibleAccounts.find((a) => a.id === m.accountId)}
                      selected={selected?.id === m.id}
                      onSelect={() => ui.set({ selectedMessage: m.id })}
                      canShare={visibleAccounts.find((a) => a.id === m.accountId)?.access !== "shared"}
                      onShare={() => setShareTarget(m)}
                    />
                  ))}
                </>
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
      {profileOpen && <ProfileModal me={me} accounts={accounts} onClose={() => setProfileOpen(false)} />}
      {shareTarget && <MessageShareModal message={shareTarget} onClose={() => setShareTarget(null)} />}
    </div>
  );
}
type CurrentUserProfile = Awaited<ReturnType<typeof api.me>>;

function ProfileModal({
  me,
  accounts,
  onClose,
}: {
  me?: CurrentUserProfile;
  accounts: MailAccount[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const ui = useUI();
  const user = auth.currentUser;
  const [fullName, setFullName] = useState(me?.displayName ?? user?.displayName ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState<"profile" | "password" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mailboxSearch, setMailboxSearch] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const passwordAccount = user?.providerData.some((provider) => provider.providerId === "password") ?? false;
  const filteredAccounts = useMemo(() => {
    const query = mailboxSearch.trim().toLowerCase();
    return accounts.filter((account) => !query || account.emailAddress.toLowerCase().includes(query));
  }, [accounts, mailboxSearch]);
  const removableAccounts = filteredAccounts.filter(
    (account) => account.access !== "shared" && account.id !== "microsoft-live",
  );
  const allVisibleSelected = removableAccounts.length > 0
    && removableAccounts.every((account) => selectedAccountIds.has(account.id));
  const lastSignInAt = user?.metadata.lastSignInTime;
  const accountCreatedAt = user?.metadata.creationTime;

  useEffect(() => {
    setSelectedAccountIds((current) => new Set(
      [...current].filter((id) => accounts.some((account) => account.id === id)),
    ));
  }, [accounts]);

  const removeMailboxes = useMutation({
    mutationFn: (ids: string[]) => api.deleteAccounts(ids),
    onSuccess: async (result, ids) => {
      setSelectedAccountIds(new Set());
      if (ui.selectedAccount && ids.includes(ui.selectedAccount))
        ui.set({ selectedAccount: null, selectedMessage: null });
      await qc.invalidateQueries({ queryKey: ["accounts"] });
      qc.removeQueries({ queryKey: ["messages"] });
      const failedMessage = result.failed
        ? `; ${result.failed} mailbox không thể xóa`
        : "";
      setNotice(`Đã xóa ${result.deleted} mailbox${failedMessage}.`);
      setError("");
    },
    onError: (cause) => {
      setNotice("");
      setError(cause instanceof Error ? cause.message : "Không thể xóa mailbox.");
    },
  });

  const confirmRemoveMailboxes = (ids: string[]) => {
    const targets = accounts.filter((account) => ids.includes(account.id) && account.access !== "shared");
    if (!targets.length) return;
    const preview = targets.slice(0, 3).map((account) => account.emailAddress).join(", ");
    const more = targets.length > 3 ? ` và ${targets.length - 3} mailbox khác` : "";
    if (window.confirm(`Xóa kết nối ${preview}${more} khỏi OmniMail? Thư gốc trong Gmail/Outlook sẽ không bị xóa.`))
      removeMailboxes.mutate(targets.map((account) => account.id));
  };

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
            <div><h2 id="profile-title">Quản lý tài khoản</h2></div>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng hồ sơ"><X /></button>
        </header>
        <div className="profile-content">
          <div className="profile-summary">
            <div><small>Email đăng nhập</small><strong>{me?.email ?? user?.email ?? "—"}</strong></div>
            <div><small>Vai trò</small><strong className={`role-badge ${me?.role ?? "basic"}`}>{me?.role ?? "basic"}</strong></div>
            <div><small>Đăng nhập gần nhất</small><strong>{lastSignInAt ? new Date(lastSignInAt).toLocaleString("vi-VN") : "—"}</strong></div>
            <div><small>Ngày tạo tài khoản</small><strong>{accountCreatedAt ? new Date(accountCreatedAt).toLocaleString("vi-VN") : "—"}</strong></div>
          </div>
          {(error || notice) && <div className={error ? "profile-message error" : "profile-message success"}>{error || notice}</div>}
          <section className="profile-mailbox-dashboard">
            <div className="profile-section-title">
              <LayoutDashboard />
              <span><strong>Dashboard mailbox</strong><small>Tìm, chọn và xóa nhiều kết nối cùng lúc. Email gốc không bị xóa.</small></span>
              <b>{accounts.length}</b>
            </div>
            <div className="profile-mailbox-toolbar">
              <label className="profile-mailbox-search">
                <Search />
                <input
                  value={mailboxSearch}
                  onChange={(event) => setMailboxSearch(event.target.value)}
                  placeholder="Tìm theo địa chỉ email"
                  aria-label="Tìm mailbox trong hồ sơ"
                />
              </label>
              <label className="profile-select-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  disabled={!removableAccounts.length}
                  onChange={(event) => {
                    setSelectedAccountIds((current) => {
                      const next = new Set(current);
                      for (const account of removableAccounts) {
                        if (event.target.checked) next.add(account.id);
                        else next.delete(account.id);
                      }
                      return next;
                    });
                  }}
                />
                Chọn tất cả
              </label>
              <button
                className="profile-remove-selected"
                type="button"
                disabled={!selectedAccountIds.size || removeMailboxes.isPending}
                onClick={() => confirmRemoveMailboxes([...selectedAccountIds])}
              >
                <Trash2 />
                {removeMailboxes.isPending ? "Đang xóa…" : `Xóa đã chọn (${selectedAccountIds.size})`}
              </button>
            </div>
            <div className="profile-mailbox-list">
              {filteredAccounts.length ? filteredAccounts.map((account) => {
                const removable = account.access !== "shared" && account.id !== "microsoft-live";
                return (
                  <article key={account.id}>
                    <input
                      type="checkbox"
                      checked={selectedAccountIds.has(account.id)}
                      disabled={!removable || removeMailboxes.isPending}
                      onChange={(event) => setSelectedAccountIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(account.id);
                        else next.delete(account.id);
                        return next;
                      })}
                      aria-label={`Chọn ${account.emailAddress}`}
                    />
                    <ProviderDot p={account.provider} />
                    <div>
                      <strong>{account.emailAddress}</strong>
                      <small>
                        {account.provider === "gmail" ? "Google / Gmail" : account.provider === "microsoft" ? "Microsoft / Outlook" : "Temporary mail"}
                        {account.access === "shared" ? " · Được chia sẻ" : " · Chủ sở hữu"}
                      </small>
                    </div>
                    <div className="profile-mailbox-time">
                      <small>{account.lastSyncedAt ? "Đồng bộ gần nhất" : account.connectedAt ? "Đã kết nối" : "Trạng thái"}</small>
                      <strong>{account.lastSyncedAt
                        ? new Date(account.lastSyncedAt).toLocaleString("vi-VN")
                        : account.connectedAt
                          ? new Date(account.connectedAt).toLocaleString("vi-VN")
                          : account.status}</strong>
                    </div>
                    <button
                      type="button"
                      disabled={!removable || removeMailboxes.isPending}
                      title={removable ? `Xóa ${account.emailAddress}` : "Mailbox chia sẻ hoặc do máy chủ quản lý"}
                      onClick={() => confirmRemoveMailboxes([account.id])}
                    >
                      <Trash2 />
                    </button>
                  </article>
                );
              }) : <div className="profile-mailbox-empty">Không tìm thấy mailbox phù hợp.</div>}
            </div>
          </section>
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
        <div className="poster-socials"><a href="https://www.facebook.com/zingne1302" target="_blank" rel="noreferrer" aria-label="Facebook của Hữu Hưng"><Facebook /></a><a href="https://www.instagram.com/huuhungstart/" target="_blank" rel="noreferrer" aria-label="Instagram của Hữu Hưng"><Instagram /></a><a href="https://github.com/NguyenHuuHung-Dev" target="_blank" rel="noreferrer" aria-label="GitHub"><Github /></a></div>
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
  const [adminSearch, setAdminSearch] = useState("");
  const [adminRoleFilter, setAdminRoleFilter] = useState<"all"|"admin"|"premium"|"basic">("all");
  const tempAccounts = accounts.filter((account) => account.provider === "temp");
  const activeTempId = selectedTemp ?? tempAccounts[0]?.id ?? null;
  const activeTempAccount = tempAccounts.find((account) => account.id === activeTempId);
  const { data: tempDomains = [], error: tempDomainError } = useQuery({ queryKey: ["temp-domains"], queryFn: api.tempDomains, enabled: page === "temp-mail" });
  const createTemp = useMutation({ mutationFn: () => api.createTemp({ localPart: tempLocal, domain: tempDomain || tempDomains[0]?.name || "" }), onSuccess: (account) => { qc.invalidateQueries({ queryKey: ["accounts"] }); setSelectedTemp(account.id); setSelectedTempMessage(null); } });
  const { data: tempMessages, isLoading: tempLoading, isFetching: tempRefreshing, error: tempMessagesError, refetch: refreshTemp } = useQuery({ queryKey: ["temp-messages", activeTempId], queryFn: () => api.messages(`?limit=30&refresh=1&accountId=${activeTempId}`), enabled: page === "temp-mail" && Boolean(activeTempId), refetchInterval: page === "temp-mail" && activeTempId ? 3_000 : false, refetchIntervalInBackground: false });
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
    enabled: page === "mail-admin" && role === "admin",
  });
  const updateRole=useMutation({mutationFn:({userId,nextRole}:{userId:string;nextRole:"basic"|"premium"})=>api.setUserRole(userId,nextRole),onSuccess:()=>qc.invalidateQueries({queryKey:["admin-overview"]})});
  const updateShare=useMutation({mutationFn:({accountId,userId,allowed}:{accountId:string;userId:string;allowed:boolean})=>api.setMailboxShare(accountId,userId,allowed),onSuccess:()=>qc.invalidateQueries({queryKey:["admin-overview"]})});
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
          <button onClick={() => void refreshTemp()} disabled={tempRefreshing}><RefreshCw className={tempRefreshing ? "spin" : ""} />Refresh</button>
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
          <div className="temp-message-list"><header><div><strong>Latest messages</strong><small>Automatic refresh every 3 seconds</small></div><button onClick={() => void refreshTemp()} disabled={!activeTempId || tempRefreshing}><RefreshCw className={tempRefreshing ? "spin" : ""} /></button></header>{tempLoading ? <Skeleton /> : tempMessagesError ? <div className="temp-message-error" role="alert"><Mail /><strong>Không thể tải thư Temp Mail</strong><small>{tempMessagesError.message}</small><button type="button" onClick={() => void refreshTemp()}>Thử lại</button></div> : (tempMessages?.items ?? []).length ? tempMessages!.items.map((message) => <button className={selectedTempMessage === message.id ? "active" : ""} key={message.id} onClick={() => setSelectedTempMessage(message.id)}><strong>{message.from.name ?? message.from.address}</strong><span>{message.subject}</span><small>{new Date(message.receivedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></button>) : <Empty title="Waiting for messages" />}</div>
          <article className="temp-reader">{tempMessage ? <><header><span>Message</span><time>{new Date(tempMessage.receivedAt).toLocaleString()}</time></header><div><h2>{tempMessage.subject}</h2><p className="temp-from">From {tempMessage.from.name ?? tempMessage.from.address} &lt;{tempMessage.from.address}&gt;</p><div className="temp-body"><MessageBody m={tempMessage} /></div></div></> : <Empty title="Select a temp message" />}</article>
        </section>
      </main>
    );
  if (page === "mail-sharing" || page === "mailbox-sharing")
    return <SharingHubPage openConnect={openConnect} initialMode={page === "mailbox-sharing" ? "mailbox" : "message"} />;
  if (page === "mail-admin") {
    if (role === "basic") return <UpgradeRequestPage />;
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
                <div className="admin-mailboxes"><strong>{user.role === "premium" ? `${user.sharedAccountIds.length} mailbox` : user.role === "basic" ? "Không có quyền chia sẻ" : "Toàn quyền hệ thống"}</strong><small>{user.upgradeRequestedAt ? `Đang yêu cầu Premium · ${new Date(user.upgradeRequestedAt).toLocaleString()}` : user.role === "premium" ? "Đã được Admin cấp quyền xem" : user.role === "basic" ? "Chưa gửi yêu cầu nâng cấp" : "Administrator"}</small></div>
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

function SharingHubPage({
  openConnect,
  initialMode,
}: {
  openConnect: () => void;
  initialMode: "message" | "mailbox";
}) {
  const [mode, setMode] = useState<"message" | "mailbox">(initialMode);
  return (
    <main className="page-pane sharing-hub-page dashboard-page">
      <div className="page-header"><div><span className="eyebrow">Trung tâm chia sẻ</span><h1>Sharing</h1></div></div>
      <div className="sharing-mode-tabs" role="tablist" aria-label="Chọn loại chia sẻ">
        <button type="button" role="tab" aria-selected={mode === "message"} className={mode === "message" ? "active" : ""} onClick={() => setMode("message")}><UserRoundCheck /><strong>Tin nhắn</strong></button>
        <button type="button" role="tab" aria-selected={mode === "mailbox"} className={mode === "mailbox" ? "active" : ""} onClick={() => setMode("mailbox")}><Mail /><strong>Mailbox</strong></button>
      </div>
      <section className="sharing-mode-panel">
        {mode === "message" ? <MessageSharingPage /> : <MailboxSharingPage openConnect={openConnect} />}
      </section>
    </main>
  );
}

function MailboxSharingPage({ openConnect }: { openConnect: () => void }) {
  const qc = useQueryClient();
  const [mailboxSearch, setMailboxSearch] = useState("");
  const [selectedMailboxIds, setSelectedMailboxIds] = useState<Set<string>>(new Set());
  const [recipientInput, setRecipientInput] = useState("");
  const [grantSearch, setGrantSearch] = useState("");
  const [selectedGrants, setSelectedGrants] = useState<Set<string>>(new Set());
  const [report, setReport] = useState<Awaited<ReturnType<typeof api.shareMailboxesBatch>>>();
  const { data: sharing, error: sharingError, isLoading } = useQuery({
    queryKey: ["mailbox-shares"],
    queryFn: api.mailboxShares,
  });
  const updateShares = useMutation({
    mutationFn: api.shareMailboxesBatch,
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ["mailbox-shares"] });
      void qc.invalidateQueries({ queryKey: ["accounts"] });
      setReport(result);
      setSelectedGrants(new Set());
    },
  });
  const mailboxes = sharing?.mailboxes ?? [];
  const mailboxTerm = mailboxSearch.trim().toLowerCase();
  const filteredMailboxes = mailboxes.filter(({ account }) => account.emailAddress.toLowerCase().includes(mailboxTerm));
  const allVisibleMailboxesSelected = filteredMailboxes.length > 0
    && filteredMailboxes.every(({ account }) => selectedMailboxIds.has(account.id));
  const selectedMailboxes = mailboxes.filter(({ account }) => selectedMailboxIds.has(account.id));
  const parsedRecipients = parseShareRecipients(recipientInput);
  const grants = mailboxes.flatMap(({ account, recipients }) => recipients.map((recipient) => ({
    key: `${account.id}\u0000${recipient.userId}`,
    account,
    recipient,
  })));
  const grantTerm = grantSearch.trim().toLowerCase();
  const filteredGrants = grants.filter(({ account, recipient }) =>
    `${account.emailAddress} ${recipient.email}`.toLowerCase().includes(grantTerm),
  );
  const allVisibleGrantsSelected = filteredGrants.length > 0
    && filteredGrants.every((grant) => selectedGrants.has(grant.key));
  const recipientHistory = [...new Set(grants.map((grant) => grant.recipient.email))];
  const submitShares = () => {
    const items = selectedMailboxes.flatMap(({ account }) =>
      parsedRecipients.valid.map((email) => ({ accountId: account.id, email, allowed: true })),
    );
    if (items.length) updateShares.mutate(items);
  };
  const revokeSelected = () => {
    const targets = grants.filter((grant) => selectedGrants.has(grant.key));
    if (targets.length && window.confirm(`Thu hồi ${targets.length} quyền truy cập đã chọn?`))
      updateShares.mutate(targets.map(({ account, recipient }) => ({
        accountId: account.id,
        email: recipient.email,
        allowed: false,
      })));
  };
  return (
    <div className="mail-sharing-page sharing-hub-content">
      {(sharingError || updateShares.error) && <div className="connect-error">{(sharingError ?? updateShares.error)?.message}</div>}
      {isLoading ? <Skeleton /> : !mailboxes.length ? (
        <section className="share-empty-state"><Mail /><h2>Bạn chưa có mailbox để chia sẻ</h2><p>Kết nối Gmail, Microsoft hoặc Temp Mail trước, sau đó quay lại trang này để cấp quyền.</p><button className="primary" onClick={openConnect}><Plus /> Kết nối mailbox</button></section>
      ) : <>
        <section className="share-stat-grid">
          <article><small>Mailbox của bạn</small><strong>{mailboxes.length}</strong><span>Sẵn sàng chia sẻ</span></article>
          <article><small>Người đang có quyền</small><strong>{recipientHistory.length}</strong><span>Premium users</span></article>
          <article><small>Tổng quyền truy cập</small><strong>{grants.length}</strong><span>Mailbox × người nhận</span></article>
          <article><small>Đang chọn</small><strong>{selectedMailboxes.length}</strong><span>{parsedRecipients.valid.length} người nhận</span></article>
        </section>

        <section className="share-batch-builder">
          <div className="share-builder-heading"><span>01</span><div><strong>Chọn mailbox</strong><small>Có thể chọn toàn bộ kết quả đang hiển thị.</small></div></div>
          <div className="share-mailbox-selector">
            <div className="share-selector-toolbar">
              <label><Search /><input value={mailboxSearch} onChange={(event) => setMailboxSearch(event.target.value)} placeholder="Tìm địa chỉ mailbox" /></label>
              <label className="share-check-all"><input type="checkbox" checked={allVisibleMailboxesSelected} onChange={(event) => setSelectedMailboxIds((current) => {
                const next = new Set(current);
                for (const { account } of filteredMailboxes) event.target.checked ? next.add(account.id) : next.delete(account.id);
                return next;
              })} /> Chọn tất cả ({filteredMailboxes.length})</label>
            </div>
            <div className="share-mailbox-check-grid">
              {filteredMailboxes.map(({ account, recipients }) => <label key={account.id} className={selectedMailboxIds.has(account.id) ? "selected" : ""}>
                <input type="checkbox" checked={selectedMailboxIds.has(account.id)} onChange={(event) => setSelectedMailboxIds((current) => {
                  const next = new Set(current);
                  event.target.checked ? next.add(account.id) : next.delete(account.id);
                  return next;
                })} />
                <ProviderDot p={account.provider} />
                <span><strong>{account.emailAddress}</strong><small>{recipients.length} người đang có quyền</small></span>
              </label>)}
            </div>
          </div>

          <div className="share-builder-heading"><span>02</span><div><strong>Thêm người nhận</strong><small>Email phải thuộc tài khoản Premium đã đăng ký OmniMail.</small></div></div>
          <div className="share-recipient-batch">
            <textarea value={recipientInput} onChange={(event) => setRecipientInput(event.target.value)} placeholder={'premium1@gmail.com\npremium2@outlook.com'} />
            <div className="share-recipient-preview">
              <span>{parsedRecipients.valid.length} email hợp lệ</span>
              {parsedRecipients.invalid.length > 0 && <span className="invalid">{parsedRecipients.invalid.length} email sai định dạng</span>}
              {recipientHistory.length > 0 && <div><small>Người đã từng chia sẻ:</small>{recipientHistory.slice(0, 8).map((email) => <button type="button" key={email} onClick={() => {
                const current = parseShareRecipients(recipientInput).valid;
                setRecipientInput([...new Set([...current, email])].join("\n"));
              }}>{email}</button>)}</div>}
            </div>
          </div>

          <footer className="share-batch-action">
            <div><strong>{selectedMailboxes.length} mailbox × {parsedRecipients.valid.length} người</strong><small>{selectedMailboxes.length * parsedRecipients.valid.length} quyền sẽ được kiểm tra và cập nhật.</small></div>
            <button type="button" disabled={!selectedMailboxes.length || !parsedRecipients.valid.length || updateShares.isPending} onClick={submitShares}><UserRoundCheck />{updateShares.isPending ? "Đang xử lý…" : "Chia sẻ mailbox"}</button>
          </footer>
        </section>

        {report && <section className={`share-batch-report ${report.failed ? "has-errors" : ""}`}>
          <strong>Đã xử lý {report.successful + report.failed} quyền</strong>
          <span>{report.changed} thay đổi · {report.failed} lỗi</span>
          {report.failed > 0 && <div>{report.results.filter((result) => !result.success).slice(0, 8).map((result, index) => <small key={`${result.accountId}-${result.email}-${index}`}><b>{result.mailboxEmail ?? result.accountId}</b> → {result.email}: {result.error}</small>)}</div>}
        </section>}

        <section className="share-access-dashboard">
          <div className="share-access-header"><div><span className="eyebrow">Current access</span><h2>Quyền mailbox đang hoạt động</h2><p>Tìm theo mailbox hoặc người nhận, sau đó thu hồi từng quyền hoặc nhiều quyền.</p></div><button type="button" disabled={!selectedGrants.size || updateShares.isPending} onClick={revokeSelected}><Trash2 /> Thu hồi đã chọn ({selectedGrants.size})</button></div>
          <div className="share-access-toolbar">
            <label><Search /><input value={grantSearch} onChange={(event) => setGrantSearch(event.target.value)} placeholder="Tìm mailbox hoặc email người nhận" /></label>
            <label><input type="checkbox" checked={allVisibleGrantsSelected} disabled={!filteredGrants.length} onChange={(event) => setSelectedGrants((current) => {
              const next = new Set(current);
              for (const grant of filteredGrants) event.target.checked ? next.add(grant.key) : next.delete(grant.key);
              return next;
            })} /> Chọn tất cả kết quả</label>
          </div>
          <div className="share-access-table">
            <header><span /><span>Mailbox</span><span>Người nhận</span><span>Quyền</span><span>Thao tác</span></header>
            {filteredGrants.length ? filteredGrants.map(({ key, account, recipient }) => <article key={key}>
              <input type="checkbox" checked={selectedGrants.has(key)} onChange={(event) => setSelectedGrants((current) => {
                const next = new Set(current);
                event.target.checked ? next.add(key) : next.delete(key);
                return next;
              })} />
              <div><ProviderDot p={account.provider} /><strong>{account.emailAddress}</strong></div>
              <div><span className="share-recipient-avatar">{recipient.email.slice(0, 1).toUpperCase()}</span><span><strong>{recipient.email}</strong><small>{recipient.role === "premium" ? "Premium user" : recipient.role}</small></span></div>
              <span className="share-access-badge">Read only</span>
              <button type="button" disabled={updateShares.isPending} onClick={() => updateShares.mutate([{ accountId: account.id, email: recipient.email, allowed: false }])}>Thu hồi</button>
            </article>) : <div className="share-no-access"><UserRoundCheck /><p>{grants.length ? "Không có quyền nào khớp tìm kiếm." : "Chưa có quyền chia sẻ mailbox nào."}</p></div>}
          </div>
        </section>
      </>}
      <section className="shared-with-me-panel"><div className="share-section-heading"><div><span className="eyebrow">Private discovery</span><h2>Mailbox được chia sẻ cho tôi</h2></div><span>Bảo mật</span></div><p className="shared-with-me-empty">Vào Mailboxes và nhập đúng ít nhất 5 ký tự đầu của địa chỉ để mở mailbox đã được cấp quyền.</p></section>
    </div>
  );
}

function MessageShareModal({ message, onClose }: { message: MailMessage; onClose: () => void }) {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const share = useMutation({
    mutationFn: () => api.shareMessage(message.id, email.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["message-shares"] }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (email.trim()) share.mutate();
  };
  return (
    <div className="message-share-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="message-share-modal" role="dialog" aria-modal="true" aria-labelledby="message-share-title">
        <header>
          <div><span className="eyebrow">Chia sẻ riêng tư</span><h2 id="message-share-title">Chia sẻ một tin nhắn</h2></div>
          <button type="button" onClick={onClose} aria-label="Đóng"><X /></button>
        </header>
        <div className="message-share-preview">
          <Mail />
          <div><strong>{message.subject || "(Không có tiêu đề)"}</strong><small>Từ {message.from.name ?? message.from.address} · {new Date(message.receivedAt).toLocaleString()}</small></div>
        </div>
        {share.isSuccess ? <div className="message-share-success" role="status"><ShieldCheck /><div><strong>Đã chia sẻ tin nhắn</strong><small>{share.data.recipient.email} chỉ có thể xem bản thư này trong OmniMail.</small></div></div> : <form onSubmit={submit}>
          <label><span>Email người nhận</span><input autoFocus type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nguoinhan@gmail.com" required /><small>Email phải thuộc một tài khoản đã đăng ký OmniMail.</small></label>
          {share.error && <div className="connect-error">{share.error.message}</div>}
          <footer><button type="button" onClick={onClose}>Hủy</button><button className="primary" disabled={share.isPending || !email.trim()}>{share.isPending ? "Đang chia sẻ…" : "Chia sẻ tin nhắn"}</button></footer>
        </form>}
        {share.isSuccess && <footer><button className="primary" type="button" onClick={onClose}>Hoàn tất</button></footer>}
      </section>
    </div>
  );
}

function MessageSharingPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [selectedId, setSelectedId] = useState<string>();
  const { data, isLoading, error } = useQuery({ queryKey: ["message-shares"], queryFn: api.messageShares });
  const shares = data?.[tab] ?? [];
  const selected = shares.find((share) => share.id === selectedId) ?? shares[0];
  const revoke = useMutation({
    mutationFn: api.revokeMessageShare,
    onSuccess: async (_result, id) => {
      if (selectedId === id) setSelectedId(undefined);
      await qc.invalidateQueries({ queryKey: ["message-shares"] });
    },
  });
  const accountFor = (share: MessageShare): MailAccount => ({
    id: `shared-message:${share.id}`,
    provider: share.mailbox.provider,
    emailAddress: share.mailbox.emailAddress,
    status: "connected",
    unreadCount: 0,
    access: "shared",
  });
  return (
    <div className="shared-messages-page sharing-hub-content">
      <div className="shared-message-tabs">
        <button className={tab === "received" ? "active" : ""} onClick={() => { setTab("received"); setSelectedId(undefined); }}>Được chia sẻ với tôi <b>{data?.received.length ?? 0}</b></button>
        <button className={tab === "sent" ? "active" : ""} onClick={() => { setTab("sent"); setSelectedId(undefined); }}>Tôi đã chia sẻ <b>{data?.sent.length ?? 0}</b></button>
      </div>
      {error && <div className="connect-error">{error.message}</div>}
      {revoke.error && <div className="connect-error">{revoke.error.message}</div>}
      {isLoading ? <Skeleton /> : shares.length ? <section className="shared-message-workspace">
        <div className="shared-message-list">
          {shares.map((share) => <article className={selected?.id === share.id ? "active" : ""} key={share.id} onClick={() => setSelectedId(share.id)}>
            <span className="share-recipient-avatar">{(tab === "received" ? share.owner.email : share.recipient.email).slice(0, 1).toUpperCase()}</span>
            <div><strong>{share.message.subject || "(Không có tiêu đề)"}</strong><small>{tab === "received" ? `Từ ${share.owner.displayName ?? share.owner.email}` : `Đến ${share.recipient.displayName ?? share.recipient.email}`}</small><time>{new Date(share.sharedAt).toLocaleString()}</time></div>
            {tab === "sent" && <button type="button" title="Thu hồi" disabled={revoke.isPending} onClick={(event) => { event.stopPropagation(); if (window.confirm(`Thu hồi quyền xem thư của ${share.recipient.email}?`)) revoke.mutate(share.id); }}><Trash2 /></button>}
          </article>)}
        </div>
        <div className="shared-message-reader"><MessageDetail m={selected.message} account={accountFor(selected)} onClose={() => setSelectedId(undefined)} /></div>
      </section> : <section className="share-empty-state"><UserRoundCheck /><h2>{tab === "received" ? "Chưa có thư được chia sẻ" : "Bạn chưa chia sẻ thư nào"}</h2><p>{tab === "received" ? "Các tin nhắn người dùng OmniMail gửi riêng cho bạn sẽ xuất hiện tại đây." : "Mở Mailboxes, bấm dấu ba chấm trên một thư và nhập email người nhận."}</p></section>}
    </div>
  );
}

function UpgradeRequestPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["upgrade-request"], queryFn: api.myUpgradeRequest });
  const request = useMutation({
    mutationFn: api.requestUpgrade,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["upgrade-request"] }),
  });
  const requestedAt = request.data?.requestedAt ?? data?.requestedAt;
  return (
    <main className="page-pane upgrade-page dashboard-page">
      <div className="page-header"><div><span className="eyebrow">Tài khoản Basic</span><h1>Yêu cầu Admin nâng cấp</h1><p>OmniMail không thu tiền trực tiếp tại đây. Admin của hệ thống sẽ xem xét và chuyển tài khoản của bạn sang Premium.</p></div></div>
      <section className="upgrade-request-grid">
        <article className="upgrade-request-card">
          <span>PREMIUM ACCESS</span><h2>Mở rộng quyền cộng tác</h2>
          <ul><li>Giữ toàn bộ mailbox cá nhân và Temp Mail hiện có</li><li>Nhận quyền xem mailbox do Admin cấp</li><li>Quyền truy cập luôn ở chế độ chỉ đọc và có thể bị thu hồi</li></ul>
          {error && <div className="connect-error">{error.message}</div>}
          {request.error && <div className="connect-error">{request.error.message}</div>}
          <button type="button" disabled={isLoading || request.isPending || Boolean(requestedAt)} onClick={() => request.mutate()}>{request.isPending ? "Đang gửi yêu cầu…" : requestedAt ? "Đã gửi yêu cầu" : "Yêu cầu Admin nâng cấp"}</button>
          {requestedAt && <small className="upgrade-request-time">Đã gửi lúc {new Date(requestedAt).toLocaleString()}. Bạn có thể tiếp tục dùng OmniMail trong khi chờ Admin xử lý.</small>}
        </article>
        <article className="upgrade-process-card"><span>QUY TRÌNH</span><ol><li><b>1</b><div><strong>Gửi yêu cầu</strong><small>Admin nhận được trạng thái yêu cầu ngay trong trang quản trị.</small></div></li><li><b>2</b><div><strong>Admin xem xét</strong><small>Việc nâng cấp do Admin của tổ chức quyết định, không yêu cầu thanh toán online.</small></div></li><li><b>3</b><div><strong>Kích hoạt Premium</strong><small>Đăng nhập lại hoặc làm mới trang sau khi Admin duyệt.</small></div></li></ol></article>
      </section>
    </main>
  );
}

function MessageRow({
  m,
  account,
  selected,
  onSelect,
  canShare,
  onShare,
}: {
  m: MailMessage;
  account?: MailAccount;
  selected: boolean;
  onSelect: () => void;
  canShare: boolean;
  onShare: () => void;
}) {
  const folderLabels = m.folderIds
    .filter((folder) => folder !== "inbox" && folder !== "all")
    .map((folder) => folder === "spam" ? "Spam" : folder === "promotions" ? "Promotions" : folder);
  const systemFolderLabels = new Set(["INBOX", "SPAM", "JUNK", "CATEGORY_PROMOTIONS"]);
  const visibleLabels = [...folderLabels, ...m.labelIds.filter((label) => !systemFolderLabels.has(label.toUpperCase()))];
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
          {visibleLabels.map((l) => (
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
      {canShare && <details className="message-more" onClick={(event) => event.stopPropagation()}>
        <summary title="Thao tác khác" aria-label={`Thao tác với thư ${m.subject}`}><MoreHorizontal /></summary>
        <div>
          <button type="button" onClick={(event) => {
            event.currentTarget.closest("details")?.removeAttribute("open");
            onShare();
          }}><UserRoundCheck /> Chia sẻ tin nhắn</button>
        </div>
      </details>}
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
  const folderLabel = m.folderIds.includes("spam") ? "Spam" : m.folderIds.includes("promotions") ? "Promotions" : "Inbox";
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
          <span className="label">{folderLabel}</span>
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
      </div>
    </div>
  );
}
function MessageBody({ m }: { m: MailMessage }) {
  const body = m.textBody?.trim() || m.preview?.trim() || "";
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
        .map((value, index) => ({ value: value.trim(), line: index + 1 }))
        .filter(({ value }) => Boolean(value))
        .map(({ value, line }) => {
          const parts = value.split("|").map((x) => x.trim().replace(/^\t+|\t+$/g, "")).filter(Boolean);
          return parts.length >= 3
            ? {
                line,
                email: parts[0],
                clientId: parts[1],
                refreshToken: parts.slice(2).join("|").trim(),
              }
            : { line, email: parts[0] ?? "", refreshToken: parts.slice(1).join("|").trim() };
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
            <strong>Bulk import — all rows</strong>
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
              <div className="bulk-import-results">
                <strong>{batchConnect.data.connected} connected · {batchConnect.data.failed} failed</strong>
                {batchConnect.data.results.map((result) => (
                  <div className={result.success ? "success" : "failed"} key={`${result.line}:${result.email}`}>
                    <span>Dòng {result.line}</span>
                    <b>{result.email}</b>
                    <small>{result.success ? "Kết nối thành công" : result.error ?? "Kết nối thất bại"}</small>
                  </div>
                ))}
              </div>
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
