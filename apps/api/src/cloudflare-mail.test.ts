import crypto from "node:crypto";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { domains } = vi.hoisted(() => ({ domains: vi.fn() }));
vi.mock("./mail-tm.js", () => ({ mailTm: { domains, list: vi.fn(), get: vi.fn(), remove: vi.fn() } }));
import { app } from "./app.js";
import { signMailRequest } from "./cloudflare-mail.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { compositeMessageAccountId } from "./access-control.js";
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const id = "cfmail:domain-test";
const message = { id: `${id}:message-1`, accountId: id, providerMessageId: "message-1", from: { address: "sender@example.com" }, to: [{ address: "alice@omnimail.io.vn" }], cc: [], subject: "OTP", preview: "123456", textBody: "123456", folderIds: ["inbox"], labelIds: [], isRead: false, isStarred: false, hasAttachments: false, receivedAt: new Date().toISOString() };
beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_MAIL_DOMAIN", "omnimail.io.vn");
  vi.stubEnv("CLOUDFLARE_MAIL_WORKER_URL", "https://gateway.example");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "test@ommimail.iam.gserviceaccount.com");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", privateKey.export({ format: "pem", type: "pkcs8" }).toString());
  domains.mockResolvedValue([{ id: "mailtm-domain", name: "example.org", ready: true }]);
});
afterEach(() => {
  const index = accounts.findIndex(account => account.id === id);
  if (index >= 0) accounts.splice(index, 1);
  accountOwners.delete(id);
  vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks();
});
describe("Cloudflare Temp Mail integration", () => {
  it("signs exact method, path, owner and body with a short-lived RSA token", () => {
    const token = signMailRequest("POST", "/accounts", '{"localPart":"alice"}', "owner");
    const [header, claims, signature] = token.split(".");
    expect(crypto.verify("RSA-SHA256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"))).toBe(true);
    const payload = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(payload).toMatchObject({ method: "POST", path: "/accounts", sub: "owner", aud: "omnimail-temp-gateway", digest: crypto.createHash("sha256").update('{"localPart":"alice"}').digest("base64url") });
    expect(payload.exp - payload.iat).toBe(60);
  });
  it("lists the custom domain first and keeps it available during mail.tm outages", async () => {
    let response = await request(app).get("/api/temp-mail/domains").set("Authorization", "Bearer local-session");
    expect(response.body.data.map((value: { name: string }) => value.name)).toEqual(["omnimail.io.vn", "example.org"]);
    domains.mockRejectedValueOnce(new Error("mail.tm unavailable"));
    response = await request(app).get("/api/temp-mail/domains").set("Authorization", "Bearer local-session");
    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
  it("creates a domain inbox and blocks cross-owner message reads before the gateway", async () => {
    const remote = vi.fn().mockResolvedValueOnce(Response.json({ id, address: "alice@omnimail.io.vn" }, { status: 201 }));
    vi.stubGlobal("fetch", remote);
    const created = await request(app).post("/api/temp-mail/accounts").set("Authorization", "Bearer local-session").send({ localPart: "Alice", domain: "omnimail.io.vn" });
    expect(created.status).toBe(200);
    expect(accountOwners.get(id)).toBe("local-user");
    expect(created.body.data).toMatchObject({ id, provider: "temp", displayName: "Cloudflare inbox" });
    expect(JSON.parse(remote.mock.calls[0][1].body)).toEqual({ localPart: "alice" });
    remote.mockResolvedValueOnce(Response.json([message]));
    const list = await request(app).get(`/api/messages?accountId=${id}`).set("Authorization", "Bearer local-session");
    expect(list.body.data.items[0].id).toBe(message.id);
    remote.mockResolvedValueOnce(Response.json(message));
    const detail = await request(app).get(`/api/messages/${message.id}`).set("Authorization", "Bearer local-session");
    expect(detail.body.data.textBody).toBe("123456");
    accountOwners.set(id, "other-user");
    remote.mockClear();
    expect((await request(app).get(`/api/messages?accountId=${id}`).set("Authorization", "Bearer local-session")).status).toBe(403);
    expect((await request(app).get(`/api/messages/${message.id}`).set("Authorization", "Bearer local-session")).status).toBe(403);
    expect(remote).not.toHaveBeenCalled();
    expect(compositeMessageAccountId(message.id)).toBe(id);
  });
  it("does not drop ownership if remote inbox deletion fails", async () => {
    accounts.push({ id, provider: "temp", emailAddress: "alice@omnimail.io.vn", status: "connected", unreadCount: 0 });
    accountOwners.set(id, "local-user");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ error: "offline" }, { status: 503 })));
    const result = await request(app).delete(`/api/temp-mail/accounts/${id}`).set("Authorization", "Bearer local-session");
    expect(result.status).toBe(502);
    expect(accountOwners.get(id)).toBe("local-user");
    expect(accounts.some(account => account.id === id)).toBe(true);
  });
});
