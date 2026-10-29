import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Unlock,
  Users,
  X,
} from "lucide-react";
import type { AdminUser } from "@omnimail/shared";
import { api } from "./api";

type Status = "all" | "active" | "pending" | "disabled";
type Action = "details" | "lock" | "unlock" | "delete" | "role";
type Dialog = { user: AdminUser; action: Action };
const statusOf = (user: AdminUser) =>
  user.disabled ? "disabled" : user.emailVerified ? "active" : "pending";
const statusLabel = {
  active: "Hoạt động",
  pending: "Chờ xác minh",
  disabled: "Đã khóa",
};
const roleLabel = { admin: "Admin", premium: "Premium", basic: "Basic" };
function date(value?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Chưa đăng nhập";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function avatar(user: AdminUser) {
  return (user.displayName || user.email || "?")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function AdminPage() {
  const qc = useQueryClient();
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: api.admin,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [role, setRole] = useState("all");
  const [page, setPage] = useState(1);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [nextRole, setNextRole] = useState<"basic" | "premium">("basic");
  const [notice, setNotice] = useState("");
  const modal = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const directory = data?.directory ?? [];
  const counts = {
    all: directory.length,
    active: directory.filter((user) => statusOf(user) === "active").length,
    pending: directory.filter((user) => statusOf(user) === "pending").length,
    disabled: directory.filter((user) => user.disabled).length,
  };
  const filtered = useMemo(
    () =>
      directory.filter(
        (user) =>
          (status === "all" || statusOf(user) === status) &&
          (role === "all" || user.role === role) &&
          `${user.displayName ?? ""} ${user.email} ${user.userId}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [directory, status, role, search],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, pageCount);
  const visible = filtered.slice((safePage - 1) * 10, safePage * 10);
  const protectedUser = (user: AdminUser) =>
    user.role === "admin" || user.userId === data?.currentUserId;
  const update = useMutation({
    mutationFn: async ({ user, action }: Dialog) => {
      if (action === "delete")
        return api.deleteUser(user.userId, confirmation.trim());
      if (action === "role") return api.setUserRole(user.userId, nextRole);
      return api.setUserDisabled(user.userId, action === "lock");
    },
    onSuccess: (_result, { user, action }) => {
      const outcome = {
        lock: "Đã khóa tài khoản",
        unlock: "Đã mở khóa tài khoản",
        delete: "Đã xóa tài khoản",
        role: "Đã cập nhật vai trò",
        details: "Đã cập nhật tài khoản",
      }[action];
      setNotice(`${outcome} ${user.email || user.userId}.`);
      setDialog(null);
      for (const key of [
        "admin-overview",
        "accounts",
        "mailbox-shares",
        "message-shares",
      ])
        void qc.invalidateQueries({ queryKey: [key] });
    },
  });

  function open(user: AdminUser, action: Action) {
    if (!dialog)
      returnFocus.current = document.activeElement as HTMLElement | null;
    update.reset();
    setConfirmation("");
    setNextRole(user.role === "premium" ? "premium" : "basic");
    setDialog({ user, action });
  }
  function close() {
    if (!update.isPending) setDialog(null);
  }
  useEffect(() => {
    if (!dialog) {
      returnFocus.current?.focus();
      return;
    }
    modal.current?.querySelector<HTMLElement>("button")?.focus();
  }, [dialog]);
  function trapFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
    if (event.key !== "Tab") return;
    const controls = modal.current?.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
    );
    if (!controls?.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
  function selectStatus(value: Status) {
    setStatus(value);
    setPage(1);
  }
  const selected = dialog?.user;
  const titles = {
    details: "Chi tiết tài khoản",
    lock: "Khóa tài khoản này?",
    unlock: "Mở khóa tài khoản này?",
    delete: "Xóa tài khoản người dùng",
    role: "Thay đổi vai trò",
  };
  return (
    <main className="page-pane admin-console">
      <div className="admin-content" inert={dialog ? true : undefined}>
        <header className="admin-page-heading">
          <div>
            <span className="admin-eyebrow">
              <ShieldCheck size={14} /> QUẢN TRỊ
            </span>
            <h1>
              Người dùng<span>.</span>
            </h1>
            <p>
              Quản lý tài khoản, trạng thái và quyền truy cập trong một nơi.
            </p>
          </div>
          <button
            className="admin-button"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            <RefreshCw size={15} className={isFetching ? "spin" : ""} /> Làm mới
          </button>
        </header>
        {notice && (
          <div className="admin-success" role="status">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button aria-label="Ẩn thông báo" onClick={() => setNotice("")}>
              <X size={16} />
            </button>
          </div>
        )}
        <section className="admin-metrics" aria-label="Tổng quan người dùng">
          {(
            [
              {
                key: "all",
                label: "Tổng người dùng",
                icon: Users,
                note: "Toàn bộ tài khoản đăng ký",
              },
              {
                key: "active",
                label: "Hoạt động",
                icon: CheckCircle2,
                note: "Đã xác minh và được truy cập",
              },
              {
                key: "pending",
                label: "Chờ xác minh",
                icon: Clock3,
                note: "Chưa xác minh địa chỉ email",
              },
              {
                key: "disabled",
                label: "Đã khóa",
                icon: LockKeyhole,
                note: "Đang tạm ngưng truy cập",
              },
            ] as const
          ).map(({ key, label, icon: Icon, note }) => (
            <button
              key={key}
              className={`admin-metric ${status === key ? "selected" : ""}`}
              onClick={() => selectStatus(key)}
              aria-pressed={status === key}
            >
              <span>
                {label}
                <Icon size={18} />
              </span>
              <strong>{isPending ? "—" : counts[key]}</strong>
              <small>{note}</small>
            </button>
          ))}
        </section>
        <section
          className="admin-user-panel"
          aria-labelledby="user-list-heading"
        >
          <div className="admin-panel-heading">
            <div>
              <h2 id="user-list-heading">
                Danh sách tài khoản <span>{directory.length}</span>
              </h2>
              <p>Tìm người dùng và chọn thao tác cần thực hiện.</p>
            </div>
            {data?.serviceStatus === "healthy" && !error && (
              <span className="admin-service">
                <i /> Hệ thống đang hoạt động
              </span>
            )}
          </div>
          <div className="admin-filters">
            <label className="admin-search">
              <Search size={17} />
              <input
                aria-label="Tìm người dùng"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Tìm theo tên, email hoặc mã người dùng…"
              />
              {search && (
                <button
                  aria-label="Xóa tìm kiếm"
                  onClick={() => {
                    setSearch("");
                    setPage(1);
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </label>
            <label className="admin-role-filter">
              <span>Vai trò</span>
              <select
                aria-label="Lọc vai trò"
                value={role}
                onChange={(e) => {
                  setRole(e.target.value);
                  setPage(1);
                }}
              >
                <option value="all">Tất cả vai trò</option>
                <option value="admin">Admin</option>
                <option value="premium">Premium</option>
                <option value="basic">Basic</option>
              </select>
            </label>
          </div>
          <div className="admin-status-tabs" aria-label="Lọc trạng thái">
            {(["all", "active", "pending", "disabled"] as const).map(
              (value) => (
                <button
                  key={value}
                  className={status === value ? "active" : ""}
                  aria-pressed={status === value}
                  onClick={() => selectStatus(value)}
                >
                  {value === "all" ? "Tất cả" : statusLabel[value]}
                  <span>{counts[value]}</span>
                </button>
              ),
            )}
          </div>
          {error ? (
            <div className="admin-empty" role="alert">
              <AlertCircle />
              <h3>Chưa tải được danh sách</h3>
              <p>{error.message}</p>
              <button className="admin-button" onClick={() => void refetch()}>
                Thử lại
              </button>
            </div>
          ) : isPending ? (
            <div className="admin-loading" role="status">
              <LoaderCircle className="spin" /> Đang tải tài khoản…
            </div>
          ) : !visible.length ? (
            <div className="admin-empty">
              <Search />
              <h3>Không tìm thấy người dùng</h3>
              <p>Thử tên hoặc email khác, hoặc bỏ bớt bộ lọc.</p>
              <button
                className="admin-button"
                onClick={() => {
                  setSearch("");
                  setRole("all");
                  selectStatus("all");
                }}
              >
                Xóa bộ lọc
              </button>
            </div>
          ) : (
            <div className="admin-table-scroll">
              <table className="admin-user-table">
                <thead>
                  <tr>
                    <th>Người dùng</th>
                    <th>Vai trò</th>
                    <th>Trạng thái</th>
                    <th>Đăng nhập gần nhất</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((user) => (
                    <tr key={user.userId}>
                      <td>
                        <button
                          className="admin-user-identity"
                          onClick={() => open(user, "details")}
                        >
                          <span className={`admin-avatar ${user.role}`}>
                            {avatar(user)}
                          </span>
                          <span>
                            <strong>
                              {user.displayName || "Chưa đặt tên"}
                              {user.userId === data?.currentUserId && (
                                <em>Bạn</em>
                              )}
                            </strong>
                            <small>{user.email || user.userId}</small>
                            {user.upgradeRequestedAt && (
                              <b className="admin-upgrade-hint">
                                Yêu cầu nâng cấp Premium
                              </b>
                            )}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className={`admin-role-pill ${user.role}`}>
                          {user.role === "admin" && <ShieldCheck size={12} />}
                          {roleLabel[user.role]}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-status-pill ${statusOf(user)}`}>
                          <i />
                          {statusLabel[statusOf(user)]}
                        </span>
                      </td>
                      <td>
                        <span className="admin-date">
                          {date(user.lastSignInAt || user.lastSeenAt)}
                        </span>
                        <small className="admin-mailbox-count">
                          {user.accounts.length} hộp thư
                        </small>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            className="admin-icon-button"
                            title="Chi tiết tài khoản"
                            aria-label={`Chi tiết ${user.email || user.userId}`}
                            onClick={() => open(user, "details")}
                          >
                            <Eye size={16} />
                          </button>
                          {protectedUser(user) ? (
                            <span className="admin-protected">
                              <ShieldCheck size={13} /> Được bảo vệ
                            </span>
                          ) : (
                            <>
                              <button
                                className={`admin-row-button ${user.disabled ? "unlock" : ""}`}
                                onClick={() =>
                                  open(user, user.disabled ? "unlock" : "lock")
                                }
                              >
                                {user.disabled ? (
                                  <Unlock size={14} />
                                ) : (
                                  <LockKeyhole size={14} />
                                )}
                                {user.disabled ? "Mở khóa" : "Khóa"}
                              </button>
                              <button
                                className="admin-icon-button danger"
                                title="Xóa tài khoản"
                                aria-label={`Xóa ${user.email || user.userId}`}
                                onClick={() => open(user, "delete")}
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <footer className="admin-pagination">
            <span>
              {filtered.length
                ? `${(safePage - 1) * 10 + 1}–${Math.min(safePage * 10, filtered.length)}`
                : "0"}{" "}
              trong {filtered.length} tài khoản
            </span>
            <div>
              <button
                aria-label="Trang trước"
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
              >
                <ChevronLeft size={16} />
              </button>
              <span>
                Trang {safePage} / {pageCount}
              </span>
              <button
                aria-label="Trang sau"
                disabled={safePage === pageCount}
                onClick={() => setPage(safePage + 1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </footer>
        </section>
        <aside className="admin-sharing-note">
          <span>
            <ShieldCheck size={20} />
            <span>
              <strong>Quyền xem hộp thư được quản lý riêng</strong>
              <small>
                Cấp hoặc thu hồi quyền xem cho người dùng Premium tại mục Chia
                sẻ.
              </small>
            </span>
          </span>
          <Link to="/app/mailbox-sharing">
            Quản lý chia sẻ <ArrowUpRight size={15} />
          </Link>
        </aside>
      </div>
      {dialog && selected && (
        <div
          className="admin-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={`admin-user-modal ${dialog.action === "delete" ? "destructive" : ""}`}
            ref={modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-dialog-title"
            onKeyDown={trapFocus}
          >
            <header>
              <span className="admin-eyebrow">QUẢN LÝ TÀI KHOẢN</span>
              <button
                className="admin-icon-button"
                aria-label="Đóng hộp thoại"
                disabled={update.isPending}
                onClick={close}
              >
                <X size={20} />
              </button>
            </header>
            <h2 id="admin-dialog-title">{titles[dialog.action]}</h2>
            <div className="admin-modal-identity">
              <span className={`admin-avatar ${selected.role}`}>
                {avatar(selected)}
              </span>
              <div>
                <strong>{selected.displayName || "Chưa đặt tên"}</strong>
                <span>{selected.email || selected.userId}</span>
              </div>
              <span className={`admin-status-pill ${statusOf(selected)}`}>
                <i />
                {statusLabel[statusOf(selected)]}
              </span>
            </div>
            {dialog.action === "details" ? (
              <>
                <dl className="admin-detail-grid">
                  <div>
                    <dt>Vai trò</dt>
                    <dd>{roleLabel[selected.role]}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>
                      {selected.emailVerified ? "Đã xác minh" : "Chưa xác minh"}
                    </dd>
                  </div>
                  <div>
                    <dt>Ngày đăng ký</dt>
                    <dd>
                      {selected.createdAt
                        ? date(selected.createdAt)
                        : "Chưa có dữ liệu"}
                    </dd>
                  </div>
                  <div>
                    <dt>Đăng nhập gần nhất</dt>
                    <dd>
                      {date(selected.lastSignInAt || selected.lastSeenAt)}
                    </dd>
                  </div>
                  <div>
                    <dt>Hộp thư sở hữu</dt>
                    <dd>{selected.accounts.length}</dd>
                  </div>
                  <div>
                    <dt>Hộp thư được chia sẻ</dt>
                    <dd>{selected.sharedAccountIds.length}</dd>
                  </div>
                  <div className="wide">
                    <dt>Mã người dùng</dt>
                    <dd className="admin-user-id">{selected.userId}</dd>
                  </div>
                  <div className="wide">
                    <dt>Phương thức đăng nhập</dt>
                    <dd>
                      {selected.providers
                        .map(
                          (p) =>
                            ({
                              password: "Email và mật khẩu",
                              "google.com": "Google",
                              "facebook.com": "Facebook",
                              "microsoft.com": "Microsoft",
                            })[p] || p,
                        )
                        .join(", ") || "Chưa có dữ liệu"}
                    </dd>
                  </div>
                </dl>
                {!protectedUser(selected) && (
                  <div className="admin-detail-actions">
                    <button
                      className="admin-button"
                      onClick={() => open(selected, "role")}
                    >
                      Thay đổi vai trò
                    </button>
                    <button
                      className="admin-button"
                      onClick={() =>
                        open(selected, selected.disabled ? "unlock" : "lock")
                      }
                    >
                      {selected.disabled ? "Mở khóa" : "Khóa tài khoản"}
                    </button>
                    <button
                      className="admin-button danger-text"
                      onClick={() => open(selected, "delete")}
                    >
                      Xóa tài khoản
                    </button>
                  </div>
                )}
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update.mutate(dialog);
                }}
              >
                {dialog.action === "lock" && (
                  <p>
                    Người dùng sẽ bị đăng xuất và không thể truy cập OmniMail.
                    Dữ liệu được giữ lại; bạn có thể mở khóa bất cứ lúc nào.
                  </p>
                )}
                {dialog.action === "unlock" && (
                  <p>
                    Người dùng có thể đăng nhập trở lại. Tài khoản vẫn cần xác
                    minh email trước khi sử dụng ứng dụng.
                  </p>
                )}
                {dialog.action === "delete" && (
                  <>
                    <div className="admin-delete-warning">
                      <AlertCircle size={19} />
                      <p>
                        Thao tác này xóa tài khoản OmniMail, thông tin kết nối
                        và quyền chia sẻ liên quan. Thư gốc trên Gmail hoặc
                        Outlook vẫn được giữ nguyên.
                      </p>
                    </div>
                    <label className="admin-confirm-label">
                      <span>
                        Nhập{" "}
                        <strong>{selected.email || selected.userId}</strong> để
                        xác nhận
                      </span>
                      <input
                        autoComplete="off"
                        aria-label="Xác nhận xóa tài khoản"
                        placeholder={selected.email || selected.userId}
                        value={confirmation}
                        onChange={(e) => setConfirmation(e.target.value)}
                        disabled={update.isPending}
                      />
                    </label>
                    <small className="admin-permanent-note">
                      Không thể hoàn tác sau khi xóa.
                    </small>
                  </>
                )}
                {dialog.action === "role" && (
                  <label className="admin-confirm-label">
                    Vai trò mới
                    <select
                      aria-label="Vai trò mới"
                      value={nextRole}
                      onChange={(e) =>
                        setNextRole(e.target.value as "basic" | "premium")
                      }
                      disabled={update.isPending}
                    >
                      <option value="basic">Basic</option>
                      <option value="premium">Premium</option>
                    </select>
                    <small>
                      Premium được nhận hộp thư chia sẻ. Chuyển về Basic sẽ thu
                      hồi các quyền xem hộp thư đã nhận và yêu cầu đăng nhập
                      lại.
                    </small>
                  </label>
                )}
                {update.error && (
                  <div className="admin-error" role="alert">
                    <AlertCircle size={16} />
                    {update.error.message}
                  </div>
                )}
                <footer>
                  <button
                    className="admin-button"
                    type="button"
                    disabled={update.isPending}
                    onClick={close}
                  >
                    Hủy
                  </button>
                  <button
                    className={`admin-button primary-action ${dialog.action === "delete" ? "delete-action" : ""}`}
                    type="submit"
                    disabled={
                      update.isPending ||
                      (dialog.action === "delete" &&
                        confirmation.trim().toLowerCase() !==
                          (selected.email || selected.userId).toLowerCase()) ||
                      (dialog.action === "role" && nextRole === selected.role)
                    }
                  >
                    {update.isPending && (
                      <LoaderCircle size={16} className="spin" />
                    )}
                    {update.isPending
                      ? "Đang xử lý…"
                      : {
                          lock: "Khóa tài khoản",
                          unlock: "Mở khóa tài khoản",
                          delete: "Xóa vĩnh viễn",
                          role: "Lưu vai trò",
                        }[dialog.action]}
                  </button>
                </footer>
              </form>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
