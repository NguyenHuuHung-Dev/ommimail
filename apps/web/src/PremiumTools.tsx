import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MailAccount, MailboxOrganization } from "@omnimail/shared";
import { api } from "./api";
import "./premium-tools.css";

export function OtpCard({ messageId }: { messageId: string }) {
  const me = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 15_000 });
  const premium = me.data?.role === "premium" || me.data?.role === "admin";
  const otp = useQuery({
    queryKey: ["message-otp", me.data?.userId, messageId],
    queryFn: () => api.messageOtp(messageId),
    enabled: premium,
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
  });
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState(false);
  if (!premium) return null;
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setCopyError(false);
    } catch {
      setCopied("");
      setCopyError(true);
    }
  };
  return (
    <section className="otp-card" aria-label="Nhận diện OTP">
      <div className="otp-heading">
        <span>OTP</span>
      </div>
      {otp.isPending ? (
        <p role="status">Đang tìm mã xác minh…</p>
      ) : otp.error ? (
        <div role="alert">
          <p>Chưa nhận diện được OTP. Bạn vẫn có thể đọc thư bên dưới.</p>
          <button type="button" onClick={() => void otp.refetch()}>
            Thử lại
          </button>
        </div>
      ) : otp.data?.codes.length ? (
        <>
          <div className="otp-codes">
            {otp.data.codes.map((code) => (
              <button
                key={code}
                type="button"
                aria-label={`Sao chép mã ${code}`}
                onClick={() => void copy(code)}
              >
                <strong>{code}</strong>
                <span>{copied === code ? "Đã sao chép" : "Sao chép"}</span>
              </button>
            ))}
          </div>
          <p>
            {otp.data.codes.length > 1
              ? "Tìm thấy nhiều mã; đối chiếu nội dung thư trước khi dùng. "
              : ""}
            Mã có thể đã hết hạn; hãy kiểm tra thời gian nhận thư.
          </p>
        </>
      ) : (
        <p>Không tìm thấy mã rõ ràng. Hãy kiểm tra nội dung thư bên dưới.</p>
      )}
      {copyError && (
        <p role="alert">
          Trình duyệt chưa cho phép sao chép. Bạn có thể chọn mã và sao chép thủ
          công.
        </p>
      )}
      <span className="sr-only" role="status">
        {copied ? `Đã sao chép mã ${copied}` : ""}
      </span>
    </section>
  );
}

export function groupMailboxes(
  accounts: MailAccount[],
  preferences: MailboxOrganization[],
  filter: string,
) {
  const prefs = new Map(preferences.map((item) => [item.accountId, item]));
  const groups = new Map<string, { label: string; accounts: MailAccount[] }>();
  for (const account of accounts) {
    const pref = prefs.get(account.id);
    if (filter && pref?.group !== filter) continue;
    const key = pref?.pinned
      ? "pinned"
      : pref?.group
        ? `group:${pref.group}`
        : `provider:${account.provider}`;
    const label = pref?.pinned
      ? "Đã ghim"
      : pref?.group ||
        {
          gmail: "Google / Gmail",
          microsoft: "Microsoft / Outlook",
          temp: "Temp Mail",
          imap: "IMAP",
        }[account.provider];
    if (!groups.has(key)) groups.set(key, { label, accounts: [] });
    groups.get(key)!.accounts.push(account);
  }
  return [...groups]
    .sort(([a], [b]) =>
      a === "pinned" ? -1 : b === "pinned" ? 1 : a.localeCompare(b, "vi"),
    )
    .map(([key, value]) => ({ key, ...value }));
}

export function MailboxOrganizationPanel({
  accounts,
  selectedId,
  onSelect,
  userId,
}: {
  accounts: MailAccount[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  userId: string;
}) {
  const client = useQueryClient();
  const queryKey = ["mailbox-organization", userId];
  const preferences = useQuery({
    queryKey,
    queryFn: api.mailboxOrganization,
    retry: false,
  });
  const [filter, setFilter] = useState("");
  const save = useMutation({
    mutationFn: api.saveMailboxOrganization,
    onSuccess: (value) => {
      client.setQueryData<MailboxOrganization[]>(queryKey, (old = []) => [
        ...old.filter((entry) => entry.accountId !== value.accountId),
        value,
      ]);
      void client.invalidateQueries({ queryKey });
    },
  });
  const values = preferences.data ?? [];
  const names = [
    ...new Set(values.map((entry) => entry.group).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b, "vi"));
  // A removed/renamed last group must not leave the rail stuck on an empty filter.
  const activeFilter = names.includes(filter) ? filter : "";
  const groups = groupMailboxes(accounts, values, activeFilter);
  const selected = accounts.find(
    (account) => account.id === selectedId && account.access !== "shared",
  );
  const selectedPreference = values.find(
    (entry) => entry.accountId === selectedId,
  );
  const busy =
    save.isPending || preferences.isPending || Boolean(preferences.error);
  return (
    <div className="mailbox-organization">
      <div className="organization-heading">
        <span>Nhóm & ghim</span>
      </div>
      <label className="organization-filter">
        Lọc nhóm
        <select
          aria-label="Lọc nhóm mailbox"
          value={activeFilter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">Tất cả mailbox</option>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      {preferences.isPending && <p role="status">Đang tải nhóm…</p>}
      {preferences.error && (
        <p role="alert">
          Chưa tải được nhóm.{" "}
          <button type="button" onClick={() => void preferences.refetch()}>
            Thử lại
          </button>
        </p>
      )}
      {save.error && <p role="alert">{save.error.message}</p>}
      {groups.map((group) => (
        <section key={group.key} className="organized-group">
          <h3>{group.label}</h3>
          {group.accounts.map((account) => {
            const value = values.find(
              (entry) => entry.accountId === account.id,
            ) ?? { accountId: account.id, group: "", pinned: false };
            return (
              <div
                key={account.id}
                className={`organized-mailbox ${account.id === selectedId ? "active" : ""}`}
              >
                <button
                  type="button"
                  className="organized-open"
                  onClick={() => onSelect(account.id)}
                  title={account.emailAddress}
                >
                  <span>{account.emailAddress}</span>
                  {value.group && <small>{value.group}</small>}
                </button>
                {account.access !== "shared" && (
                  <button
                    type="button"
                    className="organized-pin"
                    aria-label={`${value.pinned ? "Bỏ ghim" : "Ghim"} ${account.emailAddress}`}
                    aria-pressed={value.pinned}
                    disabled={busy}
                    onClick={() =>
                      save.mutate({ ...value, pinned: !value.pinned })
                    }
                  >
                    <span aria-hidden="true">{value.pinned ? "●" : "Ghim"}</span>
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}
      {!groups.length && <p>Không có mailbox trong nhóm này.</p>}
      {selected && (
        <GroupEditor
          key={`${selected.id}:${selectedPreference?.group ?? ""}`}
          account={selected}
          value={
            selectedPreference ?? {
              accountId: selected.id,
              group: "",
              pinned: false,
            }
          }
          names={names}
          disabled={busy}
          onSave={(value) => save.mutate(value)}
        />
      )}
    </div>
  );
}

function GroupEditor({
  account,
  value,
  names,
  disabled,
  onSave,
}: {
  account: MailAccount;
  value: MailboxOrganization;
  names: string[];
  disabled: boolean;
  onSave: (value: MailboxOrganization) => void;
}) {
  const [name, setName] = useState(value.group);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSave({ ...value, group: name.trim() });
  };
  return (
    <form className="organization-editor" onSubmit={submit}>
      <label htmlFor="mailbox-group-name">Nhóm cho mailbox đang mở</label>
      <small title={account.emailAddress}>{account.emailAddress}</small>
      <input
        id="mailbox-group-name"
        list="mailbox-group-options"
        placeholder="VD: Công việc, Cá nhân…"
        maxLength={40}
        value={name}
        disabled={disabled}
        onChange={(event) => setName(event.target.value)}
      />
      <datalist id="mailbox-group-options">
        {names.map((entry) => (
          <option value={entry} key={entry} />
        ))}
      </datalist>
      <button type="submit" disabled={disabled || name.trim() === value.group}>
        {disabled ? "Đang tải…" : "Lưu nhóm"}
      </button>
    </form>
  );
}
