import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";

const ownedIds = ["batch-delete-owned-1", "batch-delete-owned-2"];
const sharedId = "batch-delete-shared";

afterEach(() => {
  for (const id of [...ownedIds, sharedId]) {
    const index = accounts.findIndex((account) => account.id === id);
    if (index >= 0) accounts.splice(index, 1);
    accountOwners.delete(id);
  }
});

describe("mailbox dashboard batch deletion", () => {
  it("deletes every selected owned mailbox and rejects another user's mailbox", async () => {
    for (const [index, id] of ownedIds.entries()) {
      accounts.push({
        id,
        provider: "gmail",
        emailAddress: `owned-${index}@example.com`,
        status: "connected",
        unreadCount: 0,
      });
      accountOwners.set(id, "local-user");
    }
    accounts.push({
      id: sharedId,
      provider: "microsoft",
      emailAddress: "shared@example.com",
      status: "connected",
      unreadCount: 0,
    });
    accountOwners.set(sharedId, "different-user");

    const response = await request(app)
      .post("/api/mail-accounts/delete-batch")
      .set("Authorization", "Bearer local-session")
      .send({ ids: [...ownedIds, sharedId] });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ deleted: 2, failed: 1 });
    expect(response.body.data.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ownedIds[0], success: true }),
      expect.objectContaining({ id: ownedIds[1], success: true }),
      expect.objectContaining({ id: sharedId, success: false }),
    ]));
    expect(accounts.some((account) => ownedIds.includes(account.id))).toBe(false);
    expect(accounts.some((account) => account.id === sharedId)).toBe(true);
  });

  it("requires at least one mailbox", async () => {
    const response = await request(app)
      .post("/api/mail-accounts/delete-batch")
      .set("Authorization", "Bearer local-session")
      .send({ ids: [] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });
});
