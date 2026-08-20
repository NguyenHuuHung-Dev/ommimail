import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { userDirectory } from "./auth.js";
import { accounts, messages } from "./demo-data.js";
import { messageShares } from "./message-sharing.js";
import { accountOwners } from "./ownership.js";

const account = accounts[0];
const message = messages.find((candidate) => candidate.accountId === account.id)!;
const recipient = { userId: "message-share-recipient", email: "recipient@example.com" };

afterEach(() => {
  accountOwners.delete(account.id);
  userDirectory.delete(recipient.userId);
  messageShares.clear();
});

describe("individual message sharing", () => {
  it("shares only one message with a registered OmniMail user and lets the owner revoke it", async () => {
    accountOwners.set(account.id, "local-user");
    userDirectory.set(recipient.userId, {
      email: recipient.email,
      role: "basic",
      lastSeenAt: new Date().toISOString(),
    });

    const shared = await request(app)
      .post("/api/message-shares")
      .set("Authorization", "Bearer local-session")
      .send({ messageId: message.id, email: recipient.email });

    expect(shared.status).toBe(200);
    expect(shared.body.data).toMatchObject({
      message: { id: message.id, subject: message.subject },
      mailbox: { emailAddress: account.emailAddress },
      recipient: { userId: recipient.userId, email: recipient.email },
    });
    expect(messageShares.size).toBe(1);

    const list = await request(app)
      .get("/api/message-shares")
      .set("Authorization", "Bearer local-session");
    expect(list.status).toBe(200);
    expect(list.body.data.sent).toHaveLength(1);

    const revoked = await request(app)
      .delete(`/api/message-shares/${shared.body.data.id}`)
      .set("Authorization", "Bearer local-session");
    expect(revoked.status).toBe(200);
    expect(messageShares.size).toBe(0);
  });

  it("rejects an email that has not registered with OmniMail", async () => {
    accountOwners.set(account.id, "local-user");
    const response = await request(app)
      .post("/api/message-shares")
      .set("Authorization", "Bearer local-session")
      .send({ messageId: message.id, email: "missing@example.com" });

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("USER_NOT_FOUND");
    expect(messageShares.size).toBe(0);
  });
});
