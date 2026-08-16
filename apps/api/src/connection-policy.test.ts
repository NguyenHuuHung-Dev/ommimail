import { afterEach, describe, expect, it } from "vitest";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import {
  MailboxAlreadyConnectedError,
  isMailboxConnected,
  reserveMailboxConnection,
} from "./connection-policy.js";

const accountId = "connection-policy-test";

afterEach(() => {
  const index = accounts.findIndex((account) => account.id === accountId);
  if (index >= 0) accounts.splice(index, 1);
  accountOwners.delete(accountId);
});

describe("mailbox connection policy", () => {
  it("blocks an address already owned by the same user", () => {
    accounts.push({
      id: accountId,
      provider: "gmail",
      emailAddress: "Existing@Example.com",
      status: "connected",
      unreadCount: 0,
    });
    accountOwners.set(accountId, "owner");

    expect(isMailboxConnected("existing@example.com", "owner")).toBe(true);
    expect(() => reserveMailboxConnection("EXISTING@example.com", "owner"))
      .toThrow(MailboxAlreadyConnectedError);
    expect(isMailboxConnected("existing@example.com", "other-user")).toBe(false);
  });

  it("blocks duplicate rows while the first connection is pending", () => {
    const release = reserveMailboxConnection("pending@example.com", "owner");
    expect(() => reserveMailboxConnection("pending@example.com", "owner"))
      .toThrow(MailboxAlreadyConnectedError);
    release();
    const releaseAgain = reserveMailboxConnection("pending@example.com", "owner");
    releaseAgain();
  });
});
