import { DatabaseSync } from "node:sqlite";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker from "./index.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const email = "gateway-test@ommimail.iam.gserviceaccount.com";
let sqlite;
let env;
function statement(sql, bindings = []) {
  return {
    bind: (...values) => statement(sql, values),
    first: async () => sqlite.prepare(sql).get(...bindings) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...bindings) }),
    run: async () => sqlite.prepare(sql).run(...bindings),
  };
}
function signedRequest(method, path, body, owner = "owner-1", override = {}) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${encode({ alg: "RS256" })}.${encode({ iss: email, sub: owner, aud: "omnimail-temp-gateway", iat: now, exp: now + 60, method, path, digest: createHash("sha256").update(payload).digest("base64url"), ...override })}`;
  const token = `${input}.${sign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
  return new Request(`https://gateway.test${path}`, { method, headers: { Authorization: `Bearer ${token}` }, ...(payload ? { body: payload } : {}) });
}
const call = (method, path, body, owner, override) => worker.fetch(signedRequest(method, path, body, owner, override), env);
beforeEach(() => {
  sqlite = new DatabaseSync(":memory:");
  env = { SERVICE_ACCOUNT_EMAIL: email, DB: { prepare: statement, batch: async statements => { sqlite.exec("BEGIN"); try { const result = await Promise.all(statements.map(s => s.run())); sqlite.exec("COMMIT"); return result; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } } };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [publicKey.export({ format: "jwk" })] })));
});
afterEach(() => { sqlite.close(); vi.unstubAllGlobals(); });

describe("Cloudflare domain inbox", () => {
  it("rejects unsigned, expired, cross-path and body-tampered requests", async () => {
    expect((await worker.fetch(new Request("https://gateway.test/accounts"), env)).status).toBe(401);
    expect((await call("POST", "/accounts", { localPart: "alice" }, "owner", { exp: 1 })).status).toBe(401);
    expect((await call("POST", "/accounts", { localPart: "alice" }, "owner", { path: "/other" })).status).toBe(401);
    expect((await call("POST", "/accounts", { localPart: "alice" }, "owner", { digest: "tampered" })).status).toBe(401);
  });
  it("enforces unique ownership, delivers decoded MIME, and isolates mailbox reads", async () => {
    const created = await call("POST", "/accounts", { localPart: "alice" });
    expect(created.status).toBe(201);
    const inbox = await created.json();
    expect((await call("POST", "/accounts", { localPart: "alice" }, "owner-2")).status).toBe(409);
    const reject = vi.fn();
    const raw = new TextEncoder().encode("From: Sender <sender@example.com>\r\nTo: alice@omnimail.io.vn\r\nSubject: =?UTF-8?B?WMOEjCB0aOG7rQ==?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\nT1RQOiAxMjM0NTY=\r\n");
    const incoming = () => ({ from: "sender@example.com", to: inbox.address, rawSize: raw.length, raw: new Blob([raw]).stream(), setReject: reject });
    await worker.email(incoming(), env);
    await worker.email(incoming(), env);
    const path = `/accounts/${encodeURIComponent(inbox.id)}/messages`;
    expect((await call("GET", path, undefined, "owner-2")).status).toBe(404);
    const list = await (await call("GET", path)).json();
    expect(list).toHaveLength(1);
    expect(list[0].preview).toBe("OTP: 123456");
    expect(list[0].textBody).toBeUndefined();
    const detail = await (await call("GET", `${path}/${list[0].providerMessageId}`)).json();
    expect(detail.textBody.trim()).toBe("OTP: 123456");
    expect(detail.from).toEqual({ name: "Sender", address: "sender@example.com" });
    expect(reject).not.toHaveBeenCalled();
    expect((await call("DELETE", `/accounts/${encodeURIComponent(inbox.id)}`)).status).toBe(200);
    expect((await call("GET", path)).status).toBe(404);
    expect((await call("POST", "/accounts", { localPart: "alice" }, "owner-2")).status).toBe(409);
    await worker.email(incoming(), env);
    expect(reject).toHaveBeenCalledWith("Mailbox does not exist");
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM emails").get().n).toBe(0);
  });
  it("rejects unknown recipients and oversized mail before parsing", async () => {
    const setReject = vi.fn();
    await worker.email({ to: "unknown@omnimail.io.vn", rawSize: 3 * 1024 * 1024, setReject }, env);
    expect(setReject).toHaveBeenCalledWith("Message exceeds the 2 MiB inbox limit");
    setReject.mockReset();
    await worker.email({ to: "unknown@omnimail.io.vn", rawSize: 10, setReject }, env);
    expect(setReject).toHaveBeenCalledWith("Mailbox does not exist");
  });
  it("reserves role addresses and cleans expired messages", async () => {
    expect((await call("POST", "/accounts", { localPart: "admin" })).status).toBe(400);
    expect((await call("POST", "/accounts", { localPart: "a..b" })).status).toBe(400);
    const inbox = await (await call("POST", "/accounts", { localPart: "retention" })).json();
    sqlite.prepare("INSERT INTO emails VALUES (?, ?, ?, ?, ?)").run("expired", inbox.id, "2000-01-01T00:00:00.000Z", "{}", "{}");
    expect(await (await call("GET", `/accounts/${encodeURIComponent(inbox.id)}/messages`)).json()).toEqual([]);
    await worker.scheduled({}, env);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM emails").get().n).toBe(0);
  });
});
