import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({
  userId: "premium-tools-user",
  role: "premium" as "basic" | "premium" | "admin",
}));
vi.mock("./auth.js", async (original) => {
  const actual = await original<typeof import("./auth.js")>();
  return {
    ...actual,
    authenticate: (q: any, r: any, next: () => void) => {
      if (!q.headers.authorization) return r.sendStatus(401);
      Object.assign(q, {
        userId: identity.userId,
        role: actual.resolveUserRole(
          identity.userId,
          undefined,
          identity.role === "admin" ? { admin: true } : { role: identity.role },
        ),
      });
      next();
    },
  };
});
import { app } from "./app.js";
import { accounts, messages } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { premiumExpirations } from "./premium-access.js";
import { organizationStore } from "./mailbox-organization.js";

const token = { Authorization: "Bearer test" };
const mailbox = accounts[0];
const message = messages.find((item) => item.accountId === mailbox.id)!;
const original = { subject: message.subject, textBody: message.textBody };
beforeEach(() => {
  identity.userId = "premium-tools-user";
  identity.role = "premium";
  accountOwners.set(mailbox.id, identity.userId);
  message.subject = "Your verification code is 123456";
  message.textBody = "Do not share your verification code: 123456";
});
afterEach(() => {
  Object.assign(message, original);
  accountOwners.delete(mailbox.id);
  premiumExpirations.clear();
  vi.restoreAllMocks();
});

describe("Premium tools authorization and persistence", () => {
  it("requires authentication and blocks Basic before reading messages or preferences", async () => {
    expect(
      (await request(app).get(`/api/messages/${message.id}/otp`)).status,
    ).toBe(401);
    identity.role = "basic";
    const list = vi.spyOn(organizationStore, "list");
    for (const path of [
      `/api/messages/${message.id}/otp`,
      "/api/mailbox-organization",
    ]) {
      expect((await request(app).get(path).set(token)).status).toBe(403);
    }
    expect(list).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .put("/api/mailbox-organization")
          .set(token)
          .send({ accountId: mailbox.id, group: "Work", pinned: true })
      ).status,
    ).toBe(403);
    // Existing Basic access to the full original message is unchanged.
    expect(
      (await request(app).get(`/api/messages/${message.id}`).set(token)).status,
    ).toBe(200);
  });
  it("extracts only for accessible messages, without mutating the original message", async () => {
    const result = await request(app)
      .get(`/api/messages/${message.id}/otp`)
      .set(token);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(result.body.data.codes).toEqual(["123456"]);
    expect(message).not.toHaveProperty("codes");
    accountOwners.set(mailbox.id, "another-user");
    expect(
      (await request(app).get(`/api/messages/${message.id}/otp`).set(token))
        .status,
    ).toBe(403);
    identity.role = "admin";
    expect(
      (await request(app).get(`/api/messages/${message.id}/otp`).set(token))
        .status,
    ).toBe(403);
  });
  it("stores groups and pins per user, rejects cross-owner writes, and hides removed mailboxes", async () => {
    const value = {
      accountId: mailbox.id,
      group: "  Công việc  ",
      pinned: true,
    };
    const saved = await request(app)
      .put("/api/mailbox-organization")
      .set(token)
      .send(value);
    expect(saved.body.data).toEqual({ ...value, group: "Công việc" });
    expect(
      (await request(app).get("/api/mailbox-organization").set(token)).body
        .data,
    ).toContainEqual(saved.body.data);
    identity.userId = "someone-else";
    expect(
      (await request(app).get("/api/mailbox-organization").set(token)).body
        .data,
    ).toEqual([]);
    expect(
      (
        await request(app)
          .put("/api/mailbox-organization")
          .set(token)
          .send(value)
      ).status,
    ).toBe(403);
    identity.userId = "premium-tools-user";
    accountOwners.delete(mailbox.id);
    expect(
      (await request(app).get("/api/mailbox-organization").set(token)).body
        .data,
    ).toEqual([]);
  });
  it("rejects invalid group data and never reports a failed save as successful", async () => {
    const value = {
      accountId: mailbox.id,
      group: "x".repeat(41),
      pinned: true,
    };
    expect(
      (
        await request(app)
          .put("/api/mailbox-organization")
          .set(token)
          .send(value)
      ).status,
    ).toBe(400);
    vi.spyOn(organizationStore, "save").mockRejectedValue(new Error("offline"));
    expect(
      (
        await request(app)
          .put("/api/mailbox-organization")
          .set(token)
          .send({ ...value, group: "Work" })
      ).status,
    ).toBe(503);
  });
  it("locks expired paid access and restores saved organization after renewal", async () => {
    identity.role = "basic";
    premiumExpirations.set(
      identity.userId,
      new Date(Date.now() + 60_000).toISOString(),
    );
    const value = { accountId: mailbox.id, group: "Renewal", pinned: true };
    expect(
      (
        await request(app)
          .put("/api/mailbox-organization")
          .set(token)
          .send(value)
      ).status,
    ).toBe(200);
    premiumExpirations.set(
      identity.userId,
      new Date(Date.now() - 1_000).toISOString(),
    );
    expect(
      (await request(app).get("/api/mailbox-organization").set(token)).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/messages/${message.id}/otp`).set(token))
        .status,
    ).toBe(403);
    premiumExpirations.set(
      identity.userId,
      new Date(Date.now() + 60_000).toISOString(),
    );
    expect(
      (await request(app).get("/api/mailbox-organization").set(token)).body
        .data,
    ).toContainEqual(value);
  });
});
