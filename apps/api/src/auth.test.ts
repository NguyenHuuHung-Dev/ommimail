import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthRequest } from "./auth.js";
import type { authenticateSocket as SocketAuthenticator } from "./socket-auth.js";

const { verifyIdToken, saveUserProfile } = vi.hoisted(() => ({
  verifyIdToken: vi.fn(),
  saveUserProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock("./firestore-store.js", () => ({ saveUserProfile }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("FIREBASE_PROJECT_ID", "auth-regression-tests");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
  vi.stubEnv("ADMIN_EMAILS", "admin@gmail.com");
});
afterEach(() => vi.unstubAllEnvs());

async function authenticatedApp() {
  const { authenticate, userDirectory } = await import("./auth.js");
  const app = express();
  app.use(authenticate);
  app.get("/private", (req, res) => {
    const user = req as AuthRequest;
    res.json({ userId: user.userId, role: user.role });
  });
  return { app, userDirectory };
}

describe("verified account access", () => {
  it("rejects requests without a Firebase token", async () => {
    const { app } = await authenticatedApp();
    expect((await request(app).get("/private")).status).toBe(401);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    "rejects an unverified email (%s), including allowlisted admins",
    async (verified) => {
      verifyIdToken.mockResolvedValue({
        uid: "attacker",
        email: "admin@gmail.com",
        email_verified: verified,
        admin: true,
      });
      const { app, userDirectory } = await authenticatedApp();
      const response = await request(app)
        .get("/private")
        .set("Authorization", "Bearer signed-token");
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe("EMAIL_NOT_VERIFIED");
      expect(userDirectory.has("attacker")).toBe(false);
      expect(saveUserProfile).not.toHaveBeenCalled();
    },
  );

  it("rejects identities without an email address", async () => {
    verifyIdToken.mockResolvedValue({ uid: "anonymous", email_verified: true });
    const { app } = await authenticatedApp();
    expect(
      (
        await request(app)
          .get("/private")
          .set("Authorization", "Bearer signed-token")
      ).status,
    ).toBe(403);
  });

  it("accepts a verified identity and preserves its role", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "owner",
      email: "owner@gmail.com",
      email_verified: true,
      role: "premium",
    });
    const { app, userDirectory } = await authenticatedApp();
    const response = await request(app)
      .get("/private")
      .set("Authorization", "Bearer refreshed-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ userId: "owner", role: "premium" });
    expect(userDirectory.get("owner")?.email).toBe("owner@gmail.com");
  });

  it("rejects expired tokens", async () => {
    verifyIdToken.mockRejectedValue(new Error("expired"));
    const { app } = await authenticatedApp();
    const response = await request(app)
      .get("/private")
      .set("Authorization", "Bearer expired");
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("INVALID_TOKEN");
  });

  it("does not silently grant local admin access in production when Firebase is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    const { app } = await authenticatedApp();
    const response = await request(app)
      .get("/private")
      .set("Authorization", "Bearer local-session");
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe("AUTH_NOT_CONFIGURED");
  });

  it("does not enable local auth when demo mode is explicitly disabled", async () => {
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    vi.stubEnv("DEMO_MODE", "false");
    const { app } = await authenticatedApp();
    expect((await request(app).get("/private")).status).toBe(503);
  });
});

describe("realtime account access", () => {
  function socket(token?: string) {
    return {
      handshake: { auth: { token }, headers: {} },
      data: {},
    } as unknown as Parameters<typeof SocketAuthenticator>[0];
  }

  it("rejects unverified identities before joining any user room", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "attacker",
      email: "fake@gmail.com",
      email_verified: false,
    });
    const { authenticateSocket } = await import("./socket-auth.js");
    const client = socket("signed-token");
    const next = vi.fn();
    await authenticateSocket(client, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Email verification required" }),
    );
    expect(client.data.userId).toBeUndefined();
  });

  it("accepts verified identities", async () => {
    verifyIdToken.mockResolvedValue({
      uid: "owner",
      email: "real@gmail.com",
      email_verified: true,
    });
    const { authenticateSocket } = await import("./socket-auth.js");
    const client = socket("signed-token");
    const next = vi.fn();
    await authenticateSocket(client, next);
    expect(next).toHaveBeenCalledWith();
    expect(client.data.userId).toBe("owner");
  });

  it("rejects unauthenticated sockets", async () => {
    const { authenticateSocket } = await import("./socket-auth.js");
    const next = vi.fn();
    await authenticateSocket(socket(), next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Authentication required" }),
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("fails closed in production without Firebase", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_PROJECT_ID", "");
    const { authenticateSocket } = await import("./socket-auth.js");
    const client = socket();
    const next = vi.fn();
    await authenticateSocket(client, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Authentication is not configured" }),
    );
    expect(client.data.userId).toBeUndefined();
  });
});
