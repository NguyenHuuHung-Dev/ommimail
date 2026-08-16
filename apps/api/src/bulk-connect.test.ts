import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";

const duplicateAccountId = "duplicate-route-test";

afterEach(() => {
  const index = accounts.findIndex((account) => account.id === duplicateAccountId);
  if (index >= 0) accounts.splice(index, 1);
  accountOwners.delete(duplicateAccountId);
});

describe("Microsoft bulk connection", () => {
  it("accepts more than ten rows and reports validation errors per line", async () => {
    const items = Array.from({ length: 12 }, (_, index) => ({
      line: index + 3,
      email: index === 4 ? "not-an-email" : `user${index}@outlook.com`,
      refreshToken: "short",
    }));

    const response = await request(app)
      .post("/api/mail-accounts/microsoft/refresh-token/batch")
      .set("Authorization", "Bearer local-session")
      .send({ items });

    expect(response.status).toBe(200);
    expect(response.body.data.results).toHaveLength(12);
    expect(response.body.data.failed).toBe(12);
    expect(response.body.data.results[0]).toMatchObject({
      line: 3,
      email: "user0@outlook.com",
      success: false,
    });
    expect(response.body.data.results[4]).toMatchObject({
      line: 7,
      email: "not-an-email",
      success: false,
      error: "Email Microsoft không hợp lệ",
    });
  });

  it("rejects an address that the user already connected", async () => {
    accounts.push({
      id: duplicateAccountId,
      provider: "gmail",
      emailAddress: "already@gmail.com",
      status: "connected",
      unreadCount: 0,
    });
    accountOwners.set(duplicateAccountId, "local-user");

    const response = await request(app)
      .post("/api/mail-accounts/google/app-password")
      .set("Authorization", "Bearer local-session")
      .send({
        email: "ALREADY@gmail.com",
        appPassword: "abcdefghijklmnop",
      });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MAILBOX_ALREADY_CONNECTED");
  });
});
