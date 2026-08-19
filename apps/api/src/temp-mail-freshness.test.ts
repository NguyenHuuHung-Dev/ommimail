import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MailAccount, MailMessage } from "@omnimail/shared";

const { listTempMessages } = vi.hoisted(() => ({ listTempMessages: vi.fn() }));

vi.mock("./mail-tm.js", () => ({
  mailTm: {
    list: listTempMessages,
    get: vi.fn(),
    domains: vi.fn(),
    create: vi.fn(),
    credential: vi.fn(),
    restore: vi.fn(),
    remove: vi.fn(),
  },
}));

import { app } from "./app.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import {
  clearMailboxSyncState,
  enqueueMailboxSync,
  onMailboxSyncUpdate,
} from "./sync-jobs.js";

const account: MailAccount = {
  id: "mailtm:freshness-account",
  provider: "temp",
  emailAddress: "freshness@example.com",
  status: "connected",
  unreadCount: 0,
};
const arrivedMessage: MailMessage = {
  id: "mailtm:freshness-account:message-1",
  accountId: account.id,
  providerMessageId: "message-1",
  folderIds: ["inbox"],
  labelIds: [],
  from: { address: "sender@example.com" },
  to: [{ address: account.emailAddress }],
  cc: [],
  subject: "Your verification code",
  preview: "123456",
  isRead: false,
  isStarred: false,
  hasAttachments: false,
  receivedAt: new Date().toISOString(),
};

afterEach(() => {
  const index = accounts.findIndex((candidate) => candidate.id === account.id);
  if (index >= 0) accounts.splice(index, 1);
  accountOwners.delete(account.id);
  clearMailboxSyncState(account.id);
  listTempMessages.mockReset();
});

describe("Temp Mail freshness", () => {
  it("bypasses an empty synchronization cache when a message arrives", async () => {
    accounts.push({ ...account });
    accountOwners.set(account.id, "local-user");
    listTempMessages.mockResolvedValueOnce([]);

    const synchronized = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("temp sync timed out")), 2_000);
      const unsubscribe = onMailboxSyncUpdate((job) => {
        if (job.accountId !== account.id || job.status !== "completed") return;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });
    enqueueMailboxSync(account.id, "local-user", { priority: true });
    await synchronized;

    listTempMessages.mockResolvedValueOnce([arrivedMessage]);
    const response = await request(app)
      .get(`/api/messages?limit=30&accountId=${encodeURIComponent(account.id)}`)
      .set("Authorization", "Bearer local-session");

    expect(response.status).toBe(200);
    expect(response.body.data.items).toEqual([expect.objectContaining({
      id: arrivedMessage.id,
      subject: arrivedMessage.subject,
    })]);
    expect(listTempMessages).toHaveBeenCalledTimes(2);
  });
});
