import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailAccount, MailMessage } from "@omnimail/shared";

const latestMessage: MailMessage = {
  id: "gmail-live:sync-test-account:message-1",
  accountId: "sync-test-account",
  providerMessageId: "message-1",
  folderIds: ["inbox"],
  labelIds: [],
  from: { address: "alerts@example.com" },
  to: [{ address: "owner@example.com" }],
  cc: [],
  subject: "Security alert",
  preview: "A new sign-in was detected",
  isRead: false,
  isStarred: false,
  hasAttachments: false,
  receivedAt: new Date().toISOString(),
};

const { gmailList, persistSyncState } = vi.hoisted(() => ({
  gmailList: vi.fn(),
  persistSyncState: vi.fn(async () => undefined),
}));

vi.mock("./gmail.js", () => ({ gmail: { list: gmailList, get: vi.fn() } }));
vi.mock("./gmail-app-password.js", () => ({ gmailAppPasswords: { list: vi.fn() } }));
vi.mock("./mail-tm.js", () => ({ mailTm: { list: vi.fn() } }));
vi.mock("./microsoft-graph.js", () => ({ microsoftGraph: { list: vi.fn() } }));
vi.mock("./microsoft-imap.js", () => ({ listMicrosoftInbox: vi.fn() }));
vi.mock("./microsoft-token-accounts.js", () => ({ microsoftTokens: { list: vi.fn() } }));
vi.mock("./firestore-store.js", () => ({ updateMailboxSyncState: persistSyncState }));

import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import {
  clearMailboxSyncState,
  enqueueMailboxSync,
  getCachedMailboxMessages,
  onMailboxSyncUpdate,
} from "./sync-jobs.js";

const account: MailAccount = {
  id: "gmail-sync-test-account",
  provider: "gmail",
  emailAddress: "owner@example.com",
  status: "connected",
  unreadCount: 0,
};

afterEach(() => {
  const index = accounts.findIndex((candidate) => candidate.id === account.id);
  if (index >= 0) accounts.splice(index, 1);
  accountOwners.delete(account.id);
  clearMailboxSyncState(account.id);
  gmailList.mockClear();
  persistSyncState.mockClear();
});

describe("mailbox sync queue", () => {
  it("reads the provider and completes with fresh mailbox metadata", async () => {
    gmailList.mockResolvedValueOnce([latestMessage]);
    accounts.push(account);
    accountOwners.set(account.id, "owner-1");

    const completed = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("sync job timed out")), 2_000);
      const unsubscribe = onMailboxSyncUpdate((job) => {
        if (job.accountId !== account.id || job.status !== "completed") return;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });

    const queued = enqueueMailboxSync(account.id, "owner-1", { priority: true });
    expect(queued.status).toBe("queued");
    await completed;

    expect(gmailList).toHaveBeenCalledWith(account.id);
    expect(account.status).toBe("connected");
    expect(account.unreadCount).toBe(1);
    expect(account.lastSyncedAt).toBeTruthy();
    expect(getCachedMailboxMessages(account.id)).toEqual([latestMessage]);
    expect(persistSyncState).toHaveBeenCalledWith(account);
  });
});
