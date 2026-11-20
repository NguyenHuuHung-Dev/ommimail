import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { domains } = vi.hoisted(() => ({ domains: vi.fn() }));
vi.mock("./mail-tm.js", () => ({ mailTm: { domains, list: vi.fn(), get: vi.fn(), remove: vi.fn() } }));
import { app } from "./app.js";
import { resetTempMailSendLimits } from "./brevo-mail.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";

const domainAccountId = "cfmail:brevo-test";
const mailtmAccountId = "mailtm:brevo-test";

beforeEach(() => {
  vi.stubEnv("CLOUDFLARE_MAIL_DOMAIN", "omnimail.io.vn");
  vi.stubEnv("CLOUDFLARE_MAIL_WORKER_URL", "https://gateway.example");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "test@ommimail.iam.gserviceaccount.com");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-key");
  vi.stubEnv("BREVO_API_KEY", "xkeysib-test-key");
  domains.mockResolvedValue([]);
  accounts.push(
    {
      id: domainAccountId,
      provider: "temp",
      emailAddress: "inbox-test@omnimail.io.vn",
      displayName: "Cloudflare inbox",
      status: "connected",
      unreadCount: 0,
    },
    {
      id: mailtmAccountId,
      provider: "temp",
      emailAddress: "inbox-test@example.org",
      displayName: "mail.tm inbox",
      status: "connected",
      unreadCount: 0,
    },
  );
  accountOwners.set(domainAccountId, "local-user");
  accountOwners.set(mailtmAccountId, "local-user");
  resetTempMailSendLimits();
});

afterEach(() => {
  for (const targetId of [domainAccountId, mailtmAccountId]) {
    const index = accounts.findIndex((account) => account.id === targetId);
    if (index >= 0) accounts.splice(index, 1);
    accountOwners.delete(targetId);
  }
  resetTempMailSendLimits();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Brevo Temp Mail outbound sending", () => {
  it("reports canSend on the custom domain based on BREVO_API_KEY", async () => {
    let response = await request(app)
      .get("/api/temp-mail/domains")
      .set("Authorization", "Bearer local-session");
    expect(response.status).toBe(200);
    expect(response.body.data[0]).toMatchObject({
      id: "cloudflare-domain",
      name: "omnimail.io.vn",
      canSend: true,
    });

    vi.stubEnv("BREVO_API_KEY", "");
    response = await request(app)
      .get("/api/temp-mail/domains")
      .set("Authorization", "Bearer local-session");
    expect(response.body.data[0].canSend).toBe(false);
  });

  it("sends a real email via Brevo API v3 from the owned domain inbox", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      Response.json({ messageId: "<msg-123@brevo.example>" }, { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app)
      .post(`/api/temp-mail/accounts/${domainAccountId}/send`)
      .set("Authorization", "Bearer local-session")
      .send({
        to: "Receiver@Gmail.com",
        subject: "Test\r\nSubject",
        text: "Hello from omnimail.io.vn",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      messageId: "<msg-123@brevo.example>",
      from: "inbox-test@omnimail.io.vn",
      to: "receiver@gmail.com",
      subject: "Test Subject",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.headers["api-key"]).toBe("xkeysib-test-key");
    expect(JSON.parse(init.body)).toEqual({
      sender: { name: "OmniMail", email: "inbox-test@omnimail.io.vn" },
      to: [{ email: "receiver@gmail.com" }],
      replyTo: { email: "inbox-test@omnimail.io.vn", name: "OmniMail" },
      subject: "Test Subject",
      textContent: "Hello from omnimail.io.vn",
    });
  });

  it("blocks cross-owner sending and mail.tm mailboxes before calling Brevo", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const wrongProvider = await request(app)
      .post(`/api/temp-mail/accounts/${mailtmAccountId}/send`)
      .set("Authorization", "Bearer local-session")
      .send({ to: "receiver@gmail.com", subject: "Hi", text: "Test" });
    expect(wrongProvider.status).toBe(400);

    accountOwners.set(domainAccountId, "another-user");
    const wrongOwner = await request(app)
      .post(`/api/temp-mail/accounts/${domainAccountId}/send`)
      .set("Authorization", "Bearer local-session")
      .send({ to: "receiver@gmail.com", subject: "Hi", text: "Test" });
    expect(wrongOwner.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 503 when BREVO_API_KEY is missing and enforces per-user rate limit", async () => {
    vi.stubEnv("BREVO_API_KEY", "");
    const unconfigured = await request(app)
      .post(`/api/temp-mail/accounts/${domainAccountId}/send`)
      .set("Authorization", "Bearer local-session")
      .send({ to: "receiver@gmail.com", subject: "Hi", text: "Test" });
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body.error.code).toBe("BREVO_NOT_CONFIGURED");

    vi.stubEnv("BREVO_API_KEY", "xkeysib-test-key");
    vi.stubEnv("BREVO_SEND_LIMIT_PER_15M", "2");
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(Response.json({ messageId: "<ok@brevo>" }, { status: 201 })),
    );
    vi.stubGlobal("fetch", fetchMock);

    for (let i = 0; i < 2; i += 1) {
      const okRes = await request(app)
        .post(`/api/temp-mail/accounts/${domainAccountId}/send`)
        .set("Authorization", "Bearer local-session")
        .send({ to: "receiver@gmail.com", subject: `Hi ${i}`, text: "Test" });
      expect(okRes.status).toBe(200);
    }

    const limited = await request(app)
      .post(`/api/temp-mail/accounts/${domainAccountId}/send`)
      .set("Authorization", "Bearer local-session")
      .send({ to: "receiver@gmail.com", subject: "Over limit", text: "Test" });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("TEMP_MAIL_SEND_RATE_LIMITED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
