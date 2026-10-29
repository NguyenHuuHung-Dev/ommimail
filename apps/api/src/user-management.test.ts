import request from "supertest";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { UserRecord } from "firebase-admin/auth";

const mocks = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  directory: new Map(),
  overrides: new Map(),
  listUsers: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  revokeRefreshTokens: vi.fn(),
  setCustomUserClaims: vi.fn(),
  deleteUserData: vi.fn(),
  deleteMailbox: vi.fn(),
  saveUserProfile: vi.fn(),
  saveMailboxShare: vi.fn(),
  saveUpgradeRequest: vi.fn(),
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => mocks }));
vi.mock("./auth.js", () => ({
  authConfigured: true,
  serviceAccountConfigured: true,
  userDirectory: mocks.directory,
  roleOverrides: mocks.overrides,
  resolveUserRole: (
    uid: string,
    email: string,
    claims: Record<string, unknown> = {},
  ) =>
    claims.admin === true || email === "protected@example.com"
      ? "admin"
      : (mocks.overrides.get(uid) ??
        (claims.role === "premium" ? "premium" : "basic")),
  authenticate: (req: any, res: any, next: () => void) => {
    if (!req.headers.authorization)
      return res.status(401).json({ success: false });
    req.userId = "actor";
    req.email = "actor@example.com";
    req.role = req.headers.authorization === "Bearer admin" ? "admin" : "basic";
    next();
  },
  requireAdmin: (req: any, res: any, next: () => void) =>
    req.role === "admin" ? next() : res.status(403).json({ success: false }),
}));
vi.mock("./firestore-store.js", async (original) => ({
  ...(await original<typeof import("./firestore-store.js")>()),
  persistentStoreEnabled: false,
  deleteUserData: mocks.deleteUserData,
  deleteMailbox: mocks.deleteMailbox,
  saveUserProfile: mocks.saveUserProfile,
  saveMailboxShare: mocks.saveMailboxShare,
  saveUpgradeRequest: mocks.saveUpgradeRequest,
}));
import { app } from "./app.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { mailboxShares } from "./sharing.js";
import { upgradeRequests } from "./upgrade-requests.js";
import { onUserAccessChanged } from "./user-access-events.js";
const user = (uid: string, overrides = {}): UserRecord =>
  ({
    uid,
    email: `${uid}@example.com`,
    displayName: uid,
    disabled: false,
    emailVerified: true,
    metadata: {
      creationTime: "2026-10-29T00:00:00Z",
      lastSignInTime: "2026-10-29T01:00:00Z",
    },
    providerData: [{ providerId: "password" }],
    customClaims: {},
    ...overrides,
  }) as unknown as UserRecord;
const auth = (r: request.Test) => r.set("Authorization", "Bearer admin");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.records.clear();
  mocks.directory.clear();
  mocks.overrides.clear();
  mocks.records.set("target", user("target"));
  mocks.records.set("actor", user("actor", { customClaims: { admin: true } }));
  mocks.listUsers.mockImplementation(async () => ({
    users: [...mocks.records.values()],
  }));
  mocks.getUser.mockImplementation(async (uid) => {
    const record = mocks.records.get(uid);
    if (!record) throw { code: "auth/user-not-found" };
    return record;
  });
  mocks.updateUser.mockImplementation(async (uid, fields) => {
    const updated = { ...(mocks.records.get(uid) as UserRecord), ...fields };
    mocks.records.set(uid, updated);
    return updated;
  });
  mocks.deleteUser.mockImplementation(async (uid) => {
    mocks.records.delete(uid);
  });
  for (const mock of [
    mocks.revokeRefreshTokens,
    mocks.setCustomUserClaims,
    mocks.deleteUserData,
    mocks.deleteMailbox,
    mocks.saveUserProfile,
    mocks.saveMailboxShare,
    mocks.saveUpgradeRequest,
  ])
    mock.mockResolvedValue(undefined);
});
afterEach(() => {
  for (const id of ["gmail-management-test", "gmail-other-test"]) {
    const index = accounts.findIndex((account) => account.id === id);
    if (index >= 0) accounts.splice(index, 1);
    accountOwners.delete(id);
    mailboxShares.delete(id);
  }
  upgradeRequests.delete("target");
});

describe("admin user management", () => {
  it("lists newly registered, unverified and disabled accounts directly from Firebase", async () => {
    mocks.records.set(
      "pending",
      user("pending", { emailVerified: false, disabled: true }),
    );
    const response = await auth(request(app).get("/api/admin/overview"));
    expect(response.status).toBe(200);
    expect(response.body.data.users).toBe(3);
    expect(
      response.body.data.directory.find(
        (entry: any) => entry.userId === "pending",
      ),
    ).toMatchObject({
      emailVerified: false,
      disabled: true,
      providers: ["password"],
    });
    expect(mocks.directory.has("pending")).toBe(false);
  });
  it("continues through Firebase pagination", async () => {
    mocks.listUsers
      .mockResolvedValueOnce({ users: [user("one")], pageToken: "next" })
      .mockResolvedValueOnce({ users: [user("two")] });
    const response = await auth(request(app).get("/api/admin/overview"));
    expect(response.body.data.directory).toHaveLength(2);
    expect(mocks.listUsers).toHaveBeenLastCalledWith(1000, "next");
  });
  it("locks an account, revokes existing sessions and disconnects realtime access", async () => {
    const listener = vi.fn();
    const unsubscribe = onUserAccessChanged(listener);
    const response = await auth(
      request(app).patch("/api/admin/users/target/status"),
    ).send({ disabled: true });
    unsubscribe();
    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith("target", { disabled: true });
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith("target");
    expect(listener).toHaveBeenCalledWith({
      userId: "target",
      reason: "disabled",
    });
  });
  it("unlocks an account without restoring the previous revoked sessions", async () => {
    const response = await auth(
      request(app).patch("/api/admin/users/target/status"),
    ).send({ disabled: false });
    expect(response.status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith("target", {
      disabled: false,
    });
    expect(mocks.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it.each(["actor", "protected", "other-admin"])(
    "protects administrators and the current admin (%s)",
    async (uid) => {
      mocks.records.set(
        "protected",
        user("protected", { email: "protected@example.com" }),
      );
      mocks.records.set(
        "other-admin",
        user("other-admin", { customClaims: { admin: true } }),
      );
      const response = await auth(
        request(app).patch(`/api/admin/users/${uid}/status`),
      ).send({ disabled: true });
      expect(response.status).toBe(403);
      expect(mocks.updateUser).not.toHaveBeenCalled();
      const deletion = await auth(
        request(app).delete(`/api/admin/users/${uid}`),
      ).send({ confirmation: `${uid}@example.com` });
      expect(deletion.status).toBe(403);
      expect(mocks.deleteUser).not.toHaveBeenCalled();
    },
  );
  it("rejects non-admin mutations before looking up Firebase users", async () => {
    for (const r of [
      request(app)
        .patch("/api/admin/users/target/status")
        .send({ disabled: true }),
      request(app)
        .delete("/api/admin/users/target")
        .send({ confirmation: "target@example.com" }),
      request(app)
        .patch("/api/admin/users/target/role")
        .send({ role: "premium" }),
    ]) {
      expect((await r.set("Authorization", "Bearer basic")).status).toBe(403);
    }
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("requires an exact account confirmation before disabling or deleting anything", async () => {
    const response = await auth(
      request(app).delete("/api/admin/users/target"),
    ).send({ confirmation: "wrong@example.com" });
    expect(response.status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(mocks.deleteUserData).not.toHaveBeenCalled();
  });
  it("removes the user's own connections and shared access without touching another owner's mailbox", async () => {
    accounts.push(
      {
        id: "gmail-management-test",
        provider: "gmail",
        emailAddress: "owned@gmail.com",
        status: "connected",
        unreadCount: 0,
      },
      {
        id: "gmail-other-test",
        provider: "gmail",
        emailAddress: "other@gmail.com",
        status: "connected",
        unreadCount: 0,
      },
    );
    accountOwners.set("gmail-management-test", "target");
    accountOwners.set("gmail-other-test", "someone-else");
    mailboxShares.set("gmail-other-test", new Set(["target", "recipient"]));
    mocks.directory.set("target", { email: "target@example.com" });
    upgradeRequests.set("target", "pending");
    const response = await auth(
      request(app).delete("/api/admin/users/target"),
    ).send({ confirmation: "TARGET@example.com" });
    expect(response.status).toBe(200);
    expect(response.body.data.removedMailboxes).toBe(1);
    expect(mocks.deleteMailbox).toHaveBeenCalledWith("gmail-management-test");
    expect(mocks.deleteMailbox).not.toHaveBeenCalledWith("gmail-other-test");
    expect(
      accounts.some((account) => account.id === "gmail-management-test"),
    ).toBe(false);
    expect(accountOwners.get("gmail-other-test")).toBe("someone-else");
    expect(mailboxShares.get("gmail-other-test")).toEqual(
      new Set(["recipient"]),
    );
    expect(mocks.deleteUserData).toHaveBeenCalledWith("target");
    expect(mocks.deleteUser).toHaveBeenCalledWith("target");
    expect(mocks.directory.has("target")).toBe(false);
    expect(upgradeRequests.has("target")).toBe(false);
  });
  it("keeps the account disabled when cleanup fails, and allows a retry", async () => {
    mocks.deleteUserData.mockRejectedValueOnce(
      new Error("Firestore unavailable"),
    );
    const response = await auth(
      request(app).delete("/api/admin/users/target"),
    ).send({ confirmation: "target@example.com" });
    expect(response.status).toBe(503);
    expect((mocks.records.get("target") as UserRecord).disabled).toBe(true);
    expect(mocks.deleteUser).not.toHaveBeenCalled();
    const retry = await auth(
      request(app).delete("/api/admin/users/target"),
    ).send({ confirmation: "target@example.com" });
    expect(retry.status).toBe(200);
    expect(mocks.deleteUser).toHaveBeenCalledWith("target");
  });
  it("preserves unrelated custom claims while changing a user's role", async () => {
    mocks.records.set(
      "target",
      user("target", {
        customClaims: { role: "basic", featureFlag: "enabled" },
      }),
    );
    const response = await auth(
      request(app).patch("/api/admin/users/target/role"),
    ).send({ role: "premium" });
    expect(response.status).toBe(200);
    expect(mocks.setCustomUserClaims).toHaveBeenCalledWith("target", {
      role: "premium",
      featureFlag: "enabled",
    });
  });
});
