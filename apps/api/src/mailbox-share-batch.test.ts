import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { userDirectory } from "./auth.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { mailboxShares } from "./sharing.js";

const mailboxIds = ["share-batch-mailbox-1", "share-batch-mailbox-2"];
const recipients = [
  { userId: "share-premium-1", email: "premium-one@example.com" },
  { userId: "share-premium-2", email: "premium-two@example.com" },
];

afterEach(() => {
  for (const mailboxId of mailboxIds) {
    const index = accounts.findIndex((account) => account.id === mailboxId);
    if (index >= 0) accounts.splice(index, 1);
    accountOwners.delete(mailboxId);
    mailboxShares.delete(mailboxId);
  }
  for (const recipient of recipients) userDirectory.delete(recipient.userId);
});

describe("mailbox share batch dashboard", () => {
  it("shares multiple mailboxes with multiple Premium users and revokes selected pairs", async () => {
    for (const [index, mailboxId] of mailboxIds.entries()) {
      accounts.push({
        id: mailboxId,
        provider: index ? "microsoft" : "gmail",
        emailAddress: `mailbox-${index + 1}@example.com`,
        status: "connected",
        unreadCount: 0,
      });
      accountOwners.set(mailboxId, "local-user");
    }
    for (const recipient of recipients) {
      userDirectory.set(recipient.userId, {
        email: recipient.email,
        lastSeenAt: new Date().toISOString(),
        role: "premium",
      });
    }

    const shareItems = mailboxIds.flatMap((accountId) =>
      recipients.map(({ email }) => ({ accountId, email, allowed: true })),
    );
    const shareResponse = await request(app)
      .put("/api/mailbox-shares/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items: shareItems });

    expect(shareResponse.status).toBe(200);
    expect(shareResponse.body.data).toMatchObject({ successful: 4, changed: 4, failed: 0 });
    expect(mailboxShares.get(mailboxIds[0])).toEqual(new Set(recipients.map(({ userId }) => userId)));
    expect(mailboxShares.get(mailboxIds[1])).toEqual(new Set(recipients.map(({ userId }) => userId)));

    const revokeResponse = await request(app)
      .put("/api/mailbox-shares/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items: [
        { accountId: mailboxIds[0], email: recipients[0].email, allowed: false },
        { accountId: mailboxIds[1], email: recipients[1].email, allowed: false },
      ] });

    expect(revokeResponse.status).toBe(200);
    expect(revokeResponse.body.data).toMatchObject({ successful: 2, changed: 2, failed: 0 });
    expect(mailboxShares.get(mailboxIds[0])?.has(recipients[0].userId)).toBe(false);
    expect(mailboxShares.get(mailboxIds[0])?.has(recipients[1].userId)).toBe(true);
    expect(mailboxShares.get(mailboxIds[1])?.has(recipients[0].userId)).toBe(true);
    expect(mailboxShares.get(mailboxIds[1])?.has(recipients[1].userId)).toBe(false);
  });

  it("reports an invalid recipient without blocking valid rows", async () => {
    accounts.push({
      id: mailboxIds[0],
      provider: "gmail",
      emailAddress: "mailbox@example.com",
      status: "connected",
      unreadCount: 0,
    });
    accountOwners.set(mailboxIds[0], "local-user");
    userDirectory.set(recipients[0].userId, {
      email: recipients[0].email,
      lastSeenAt: new Date().toISOString(),
      role: "premium",
    });

    const response = await request(app)
      .put("/api/mailbox-shares/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items: [
        { accountId: mailboxIds[0], email: recipients[0].email, allowed: true },
        { accountId: mailboxIds[0], email: "not-an-email", allowed: true },
      ] });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ successful: 1, changed: 1, failed: 1 });
    expect(response.body.data.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ email: recipients[0].email, success: true }),
      expect.objectContaining({ email: "not-an-email", success: false, code: "INVALID_EMAIL" }),
    ]));
  });

  it("does not reveal another owner's mailbox address in batch errors", async () => {
    accounts.push({
      id: mailboxIds[0],
      provider: "gmail",
      emailAddress: "private-owner@example.com",
      status: "connected",
      unreadCount: 0,
    });
    accountOwners.set(mailboxIds[0], "different-user");

    const response = await request(app)
      .put("/api/mailbox-shares/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items: [{ accountId: mailboxIds[0], email: recipients[0].email, allowed: true }] });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ successful: 0, failed: 1 });
    expect(response.body.data.results[0]).toMatchObject({ code: "FORBIDDEN", success: false });
    expect(response.body.data.results[0]).not.toHaveProperty("mailboxEmail");
  });
});
