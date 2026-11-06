import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { configureRequestLimits, trustedProxyHops } from "./request-limits.js";

function createApp(env: NodeJS.ProcessEnv = { RENDER: "true" }) {
  const app = express();
  configureRequestLimits(app, { env, limit: 2 });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/example", (req, res) => res.json({ ip: req.ip }));
  app.post("/api/health", (_req, res) => res.sendStatus(404));
  return app;
}

describe("proxy-aware request limits", () => {
  it("gives distinct clients behind Render independent quotas", async () => {
    const app = createApp();
    const first = () => request(app).get("/api/example").set("X-Forwarded-For", "192.0.2.10");
    expect((await first()).body.ip).toBe("192.0.2.10");
    expect((await first()).status).toBe(200);
    const blocked = await first();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(blocked.headers.ratelimit).toBeDefined();
    const other = await request(app).get("/api/example").set("X-Forwarded-For", "198.51.100.20");
    expect(other.status).toBe(200);
    expect(other.body.ip).toBe("198.51.100.20");
  });

  it("does not let spoofed leftmost addresses bypass the last trusted hop", async () => {
    const app = createApp();
    for (const fake of ["192.0.2.1", "192.0.2.2"]) {
      const response = await request(app).get("/api/example")
        .set("X-Forwarded-For", `${fake}, 198.51.100.20`);
      expect(response.status).toBe(200);
      expect(response.body.ip).toBe("198.51.100.20");
    }
    expect((await request(app).get("/api/example")
      .set("X-Forwarded-For", "192.0.2.3, 198.51.100.20")).status).toBe(429);
  });

  it("keeps health probes available without spending application quota", async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) {
      expect((await request(app).get("/api/health")).status).toBe(200);
      expect((await request(app).head("/api/health/")).status).toBe(200);
    }
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(200);
    expect((await request(app).get("/api/example")).status).toBe(429);
    expect((await request(app).get("/api/health?probe=1")).status).toBe(200);
    expect((await request(app).post("/api/health")).status).toBe(429);
  });

  it("groups IPv6 addresses in one subnet to prevent quota evasion", async () => {
    const app = createApp();
    for (const suffix of ["1", "2"]) {
      expect((await request(app).get("/api/example")
        .set("X-Forwarded-For", `2001:db8:abcd:1200::${suffix}`)).status).toBe(200);
    }
    expect((await request(app).get("/api/example")
      .set("X-Forwarded-For", "2001:db8:abcd:1200::3")).status).toBe(429);
    expect((await request(app).get("/api/example")
      .set("X-Forwarded-For", "2001:db8:abcd:1300::1")).status).toBe(200);
  });

  it("ignores forwarded identities when running without a trusted proxy", async () => {
    const app = createApp({});
    // A direct client sending forwarding headers correctly triggers validation.
    const warning = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const first = await request(app).get("/api/example").set("X-Forwarded-For", "192.0.2.1");
      expect(first.body.ip).not.toBe("192.0.2.1");
      await request(app).get("/api/example").set("X-Forwarded-For", "192.0.2.2");
      expect((await request(app).get("/api/example")
        .set("X-Forwarded-For", "192.0.2.3")).status).toBe(429);
    } finally {
      warning.mockRestore();
    }
  });

  it("supports an explicitly configured proxy chain", async () => {
    const app = createApp({ TRUST_PROXY_HOPS: "2" });
    const response = await request(app).get("/api/example")
      .set("X-Forwarded-For", "192.0.2.1, 198.51.100.20, 10.0.0.2");
    expect(response.body.ip).toBe("198.51.100.20");
    expect(trustedProxyHops({ RENDER: "true", TRUST_PROXY_HOPS: "0" })).toBe(0);
  });

  it.each(["true", "false", "*", "-1", "1.5", "", "1abc", "9007199254740992"])(
    "rejects invalid TRUST_PROXY_HOPS=%s at startup", (value) => {
      expect(() => createApp({ TRUST_PROXY_HOPS: value })).toThrow("TRUST_PROXY_HOPS");
    },
  );
});
