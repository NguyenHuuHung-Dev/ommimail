import { RefreshCw, Search, Trash2 } from "lucide-react";
import type { MailAccount } from "@omnimail/shared";

export function MailboxToolbar({
  accounts,
  account,
  folder,
  spamCount,
  messageCount,
  syncing,
  removing,
  searchOpen,
  onSelect,
  onSearch,
  onToggleSpam,
  onRefresh,
  onDisconnect,
}: {
  accounts: MailAccount[];
  account?: MailAccount;
  folder: "main" | "spam";
  spamCount: number;
  messageCount: number;
  syncing: boolean;
  removing: boolean;
  searchOpen: boolean;
  onSelect: (id: string) => void;
  onSearch: () => void;
  onToggleSpam: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  return (
    <header className="mailbox-list-header">
      <div className="list-head">
        <div className="mailbox-picker">
          <select
            aria-label="Mailbox đang mở"
            value={account?.id ?? ""}
            onChange={(event) => onSelect(event.target.value)}
            title={account?.emailAddress}
          >
            <option value="">Chọn mailbox</option>
            {accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.emailAddress}
              </option>
            ))}
          </select>
        </div>
        <div
          className="mailbox-head-actions"
          role="group"
          aria-label="Công cụ mailbox"
        >
          <button
            type="button"
            className="mailbox-search-button"
            aria-label="Tìm mailbox"
            title="Tìm mailbox theo địa chỉ email"
            aria-expanded={searchOpen}
            aria-controls="mailbox-address-search"
            onClick={onSearch}
          >
            <Search />
          </button>
          <button
            type="button"
            className={`spam-toolbar-button ${folder === "spam" ? "open" : ""}`}
            disabled={!account}
            aria-pressed={folder === "spam"}
            title={
              folder === "spam"
                ? "Quay lại hộp thư chính"
                : "Mở thư Spam / Junk"
            }
            onClick={onToggleSpam}
          >
            <span>{folder === "spam" ? "Inbox" : "Spam"}</span>
            <b>{spamCount}</b>
          </button>
          <button
            type="button"
            className="account-sync"
            aria-label="Refresh mailbox"
            disabled={!account || account.access === "shared" || syncing}
            title={
              account?.access === "shared"
                ? "Mailbox chia sẻ được đồng bộ bởi chủ sở hữu"
                : "Làm mới thư"
            }
            onClick={onRefresh}
          >
            <RefreshCw className={syncing ? "spin" : ""} />
          </button>
          <button
            type="button"
            className="account-disconnect"
            aria-label="Ngắt kết nối mailbox"
            disabled={
              !account ||
              account.access === "shared" ||
              account.id === "microsoft-live" ||
              removing
            }
            title="Ngắt kết nối mailbox đang mở"
            onClick={onDisconnect}
          >
            <Trash2 />
          </button>
        </div>
      </div>
      <p className="mailbox-message-count" aria-live="polite">
        {messageCount} {messageCount === 1 ? "mail" : "mails"}
      </p>
    </header>
  );
}
