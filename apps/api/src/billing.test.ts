import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  orders: new Map<number, any>(),
  account: vi.fn(),
  reserve: vi.fn(),
  attachLink: vi.fn(),
  activate: vi.fn(),
  markClosed: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  getUser: vi.fn(),
  saveUpgradeRequest: vi.fn(),
}));
vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({ getUser: mocks.getUser }),
}));
vi.mock("./firestore-store.js", () => ({
  persistentStoreEnabled: true,
  saveUpgradeRequest: mocks.saveUpgradeRequest,
  saveUserProfile: vi.fn(),
}));
vi.mock("./billing-store.js", () => ({
  PaymentReviewRequired: class extends Error {},
  billingStore: {
    account: mocks.account,
    order: async (code: number) => mocks.orders.get(code),
    reserve: mocks.reserve,
    attachLink: mocks.attachLink,
    activate: mocks.activate,
    markClosed: mocks.markClosed,
  },
}));
// Use the real SDK signature verifier, with mocked network methods only.
vi.mock("@payos/node", async (original) => {
  const { PayOS } = await original<typeof import("@payos/node")>();
  return {
    PayOS: class {
      paymentRequests = { create: mocks.create, get: mocks.get };
      webhooks = new PayOS({
        clientId: "test-client",
        apiKey: "test-api",
        checksumKey: "test-checksum",
      }).webhooks;
    },
  };
});
import { payosWebhook, premiumBillingRouter } from "./billing.js";
import { premiumExpirations } from "./premium-access.js";

const app = express();
app.use(express.json());
app.post("/webhook", payosWebhook);
app.use((req, res, next) => {
  if (!req.headers.authorization) return res.sendStatus(401);
  Object.assign(req, {
    userId: req.headers["x-user"] ?? "buyer",
    role: req.headers["x-role"] ?? "basic",
  });
  next();
});
app.use("/billing", premiumBillingRouter);
const token = { Authorization: "Bearer test" };
const order = () => ({
  userId: "buyer",
  orderCode: 123,
  amount: 2000,
  status: "PENDING",
  expiresAt: new Date(Date.now() + 900_000).toISOString(),
  createdAt: new Date().toISOString(),
  paymentLinkId: "link-123",
});
function webhook(changes: Record<string, unknown> = {}, key = "test-checksum") {
  const data = {
    orderCode: 123,
    amount: 2000,
    description: "OM123",
    accountNumber: "123456",
    reference: "reference",
    transactionDateTime: "2026-11-14 12:00:00",
    currency: "VND",
    paymentLinkId: "link-123",
    code: "00",
    desc: "success",
    ...changes,
  };
  const canonical = Object.entries(data)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return {
    code: "00",
    desc: "success",
    success: true,
    data,
    signature: createHmac("sha256", key).update(canonical).digest("hex"),
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.orders.clear();
  premiumExpirations.clear();
  vi.stubEnv("PAYOS_CLIENT_ID", "test-client");
  vi.stubEnv("PAYOS_API_KEY", "test-api");
  vi.stubEnv("PAYOS_CHECKSUM_KEY", "test-checksum");
  vi.stubEnv("WEB_APP_URL", "https://omnimail.io.vn");
  mocks.orders.set(123, order());
  mocks.account.mockResolvedValue({});
  mocks.reserve.mockImplementation(async () => mocks.orders.get(123));
  mocks.attachLink.mockImplementation(
    async (code, paymentLinkId, checkoutUrl) =>
      Object.assign(mocks.orders.get(code), { paymentLinkId, checkoutUrl }),
  );
  mocks.create.mockResolvedValue({
    orderCode: 123,
    amount: 2000,
    currency: "VND",
    paymentLinkId: "link-123",
    checkoutUrl: "https://pay.payos.vn/web/link-123",
  });
  mocks.get.mockResolvedValue({
    orderCode: 123,
    id: "link-123",
    amount: 2000,
    amountPaid: 2000,
    amountRemaining: 0,
    status: "PAID",
  });
  mocks.getUser.mockResolvedValue({
    uid: "buyer",
    email: "buyer@example.com",
    disabled: false,
    customClaims: { role: "basic" },
  });
  mocks.activate.mockImplementation(async (code) => {
    const expiry = "2026-12-14T12:00:00.000Z";
    Object.assign(mocks.orders.get(code), {
      status: "PAID",
      premiumExpiresAt: expiry,
    });
    return expiry;
  });
  mocks.markClosed.mockImplementation(async (code, status) =>
    Object.assign(mocks.orders.get(code), { status }),
  );
});
afterEach(() => vi.unstubAllEnvs());

describe("PayOS monthly Premium payments", () => {
  it("requires authentication for customer checkout and status checks", async () => {
    expect((await request(app).post("/billing/checkout")).status).toBe(401);
    expect((await request(app).post("/billing/orders/123/check")).status).toBe(
      401,
    );
  });
  it("keeps checkout disabled without channel credentials", async () => {
    vi.stubEnv("PAYOS_CHECKSUM_KEY", "");
    const status = await request(app).get("/billing").set(token);
    expect(status.body.data).toMatchObject({
      available: false,
      price: 2000,
      currency: "VND",
    });
    const response = await request(app)
      .post("/billing/checkout")
      .set({ ...token, "x-user": "unconfigured" });
    expect(response.status).toBe(503);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("creates only the server-priced monthly order and server-owned return URLs", async () => {
    const response = await request(app)
      .post("/billing/checkout")
      .set({ ...token, "x-user": "checkout-buyer" });
    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 2000,
        orderCode: 123,
        returnUrl:
          "https://omnimail.io.vn/app/mail-admin?orderCode=123&payment=return",
      }),
    );
    expect(response.body.data).not.toHaveProperty("userId");
    expect(response.body.data.checkoutUrl).toBe(
      "https://pay.payos.vn/web/link-123",
    );
  });
  it("rejects a price or account supplied by the browser", async () => {
    const response = await request(app)
      .post("/billing/checkout")
      .set(token)
      .send({ amount: 1, userId: "other" });
    expect(response.status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not charge Admins or users already granted unlimited Premium", async () => {
    for (const role of ["admin", "premium"]) {
      const response = await request(app)
        .post("/billing/checkout")
        .set({ ...token, "x-role": role, "x-user": `managed-${role}` });
      expect(response.status).toBe(409);
    }
    expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("reuses a known checkout URL rather than creating another payment", async () => {
    Object.assign(mocks.orders.get(123), {
      checkoutUrl: "https://pay.payos.vn/web/link-123",
    });
    const response = await request(app)
      .post("/billing/checkout")
      .set({ ...token, "x-user": "retry-buyer" });
    expect(response.status).toBe(200);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("recovers the same provider order after an uncertain create response", async () => {
    mocks.create.mockRejectedValueOnce(new Error("network deadline"));
    const response = await request(app)
      .post("/billing/checkout")
      .set({ ...token, "x-user": "network-buyer" });
    expect(response.status).toBe(200);
    expect(mocks.get).toHaveBeenCalledWith(123);
    expect(response.body.data.orderCode).toBe(123);
  });
  it("hides another user's order before contacting the provider", async () => {
    const response = await request(app)
      .post("/billing/orders/123/check")
      .set({ ...token, "x-user": "other" });
    expect(response.status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("ignores a forged PAID query flag when PayOS still reports PENDING", async () => {
    mocks.get.mockResolvedValueOnce({
      orderCode: 123,
      id: "link-123",
      amount: 2000,
      amountPaid: 0,
      amountRemaining: 2000,
      status: "PENDING",
    });
    const response = await request(app)
      .post("/billing/orders/123/check?status=PAID&amount=2000")
      .set(token);
    expect(response.body.data.status).toBe("PENDING");
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("rejects an invalid webhook signature before looking up any payment", async () => {
    const response = await request(app)
      .post("/webhook")
      .send(webhook({}, "forged-key"));
    expect(response.status).toBe(400);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("accepts a signed registration sample without granting access", async () => {
    const response = await request(app)
      .post("/webhook")
      .send(webhook({ orderCode: 999 }));
    expect(response.status).toBe(200);
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("activates a signed, provider-confirmed payment and ignores repeat delivery", async () => {
    expect((await request(app).post("/webhook").send(webhook())).status).toBe(
      200,
    );
    expect((await request(app).post("/webhook").send(webhook())).status).toBe(
      200,
    );
    expect(mocks.activate).toHaveBeenCalledTimes(1);
    expect(premiumExpirations.get("buyer")).toBe("2026-12-14T12:00:00.000Z");
  });
  it("does not grant Premium for an underpayment", async () => {
    mocks.get.mockResolvedValueOnce({
      orderCode: 123,
      id: "link-123",
      amount: 2000,
      amountPaid: 1000,
      amountRemaining: 1000,
      status: "UNDERPAID",
    });
    expect(
      (
        await request(app)
          .post("/webhook")
          .send(webhook({ amount: 1000 }))
      ).status,
    ).toBe(200);
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it.each([
    { amount: 1 },
    { orderCode: 124 },
    { id: "other-link" },
    { amountPaid: 1000 },
    { amountRemaining: 1000 },
  ])("rejects a mismatched provider record (%j)", async (change) => {
    mocks.get.mockResolvedValueOnce({
      orderCode: 123,
      id: "link-123",
      amount: 2000,
      amountPaid: 2000,
      amountRemaining: 0,
      status: "PAID",
      ...change,
    });
    expect(
      (await request(app).post("/billing/orders/123/check").set(token)).status,
    ).toBe(400);
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("does not activate payment for a disabled account", async () => {
    mocks.getUser.mockResolvedValueOnce({ uid: "buyer", disabled: true });
    expect((await request(app).post("/webhook").send(webhook())).status).toBe(
      409,
    );
    expect(mocks.activate).not.toHaveBeenCalled();
  });
  it("reconciles a cancelled checkout without granting Premium", async () => {
    mocks.get.mockResolvedValueOnce({
      orderCode: 123,
      id: "link-123",
      amount: 2000,
      amountPaid: 0,
      amountRemaining: 2000,
      status: "CANCELLED",
    });
    const response = await request(app)
      .post("/billing/orders/123/check")
      .set(token);
    expect(response.body.data.status).toBe("CANCELLED");
    expect(mocks.activate).not.toHaveBeenCalled();
  });
});
