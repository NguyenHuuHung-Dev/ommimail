import { beforeEach, describe, expect, it, vi } from "vitest";

const memory = vi.hoisted(() => ({
  documents: new Map<string, Record<string, any>>(),
  queue: Promise.resolve() as Promise<unknown>,
}));
vi.mock("./firestore-store.js", () => ({ persistentStoreEnabled: true }));
vi.mock("firebase-admin/app", () => ({ getApps: () => [{}] }));
vi.mock("firebase-admin/firestore", () => {
  const snapshot = (path: string) => ({
    data: () => structuredClone(memory.documents.get(path)),
  });
  const write = (
    path: string,
    data: Record<string, unknown>,
    merge: boolean,
  ) => {
    const result = merge ? { ...memory.documents.get(path) } : {};
    for (const [key, value] of Object.entries(data)) {
      if (value === "__DELETE__") delete result[key];
      else result[key] = value;
    }
    memory.documents.set(path, result);
  };
  const reference = (path: string) => ({
    path,
    get: async () => snapshot(path),
    set: async (value: any, options: any) => write(path, value, options?.merge),
    update: async (value: any) => write(path, value, true),
  });
  return {
    FieldValue: { delete: () => "__DELETE__" },
    getFirestore: () => ({
      collection: (name: string) => ({
        doc: (id: string) => reference(`${name}/${id}`),
        get: async () => ({
          docs: [...memory.documents.keys()]
            .filter((path) => path.startsWith(`${name}/`))
            .map((path) => ({ id: path.split("/")[1], ...snapshot(path) })),
        }),
      }),
      runTransaction: (operation: (transaction: any) => Promise<unknown>) => {
        const result = memory.queue.then(async () => {
          const writes: Array<() => void> = [];
          const transaction = {
            get: async (ref: any) => snapshot(ref.path),
            create: (ref: any, value: any) =>
              writes.push(() => {
                if (memory.documents.has(ref.path))
                  throw new Error("duplicate");
                write(ref.path, value, false);
              }),
            set: (ref: any, value: any, options: any) =>
              writes.push(() => write(ref.path, value, options?.merge)),
            update: (ref: any, value: any) =>
              writes.push(() => write(ref.path, value, true)),
          };
          const value = await operation(transaction);
          for (const commit of writes) commit();
          return value;
        });
        memory.queue = result.catch(() => undefined);
        return result;
      },
    }),
  };
});
import { billingStore } from "./billing-store.js";
import {
  addPremiumMonth,
  hasPaidPremium,
  premiumExpirations,
  premiumAccessRevision,
  publishPaidPremium,
  revokePaidPremium,
} from "./premium-access.js";

const now = "2026-01-31T10:00:00.000Z";
const seed = (code = 123, amount = 2000) =>
  memory.documents.set(`premiumOrders/${code}`, {
    userId: "buyer",
    orderCode: code,
    amount,
    status: "PENDING",
    createdAt: now,
    expiresAt: now,
  });
beforeEach(() => {
  memory.documents.clear();
  memory.queue = Promise.resolve();
  premiumExpirations.clear();
});

describe("persistent monthly Premium entitlements", () => {
  it.each([
    ["2026-01-31T10:00:00.000Z", "2026-02-28T10:00:00.000Z"],
    ["2028-01-31T10:00:00.000Z", "2028-02-29T10:00:00.000Z"],
    ["2026-12-15T10:00:00.000Z", "2027-01-15T10:00:00.000Z"],
  ])("adds a calendar month with month-end handling: %s", (start, end) =>
    expect(addPremiumMonth(start)).toBe(end),
  );

  it("commits the payment and access together and clears the matching pending checkout", async () => {
    seed();
    memory.documents.set("premiumBilling/buyer", {
      pendingOrderCode: 123,
      pendingExpiresAt: now,
    });
    expect(await billingStore.activate(123, now)).toBe(
      "2026-02-28T10:00:00.000Z",
    );
    expect(memory.documents.get("premiumOrders/123")).toMatchObject({
      status: "PAID",
      paidAt: now,
    });
    expect(memory.documents.get("premiumBilling/buyer")).toEqual({
      expiresAt: "2026-02-28T10:00:00.000Z",
    });
  });

  it("credits a concurrently repeated webhook/status check only once", async () => {
    seed();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => billingStore.activate(123, now)),
    );
    expect(new Set(results)).toEqual(new Set(["2026-02-28T10:00:00.000Z"]));
    expect(memory.documents.get("premiumBilling/buyer")?.expiresAt).toBe(
      "2026-02-28T10:00:00.000Z",
    );
  });

  it("preserves remaining time when two different orders settle concurrently", async () => {
    seed(123);
    seed(124);
    await Promise.all([
      billingStore.activate(123, now),
      billingStore.activate(124, now),
    ]);
    expect(memory.documents.get("premiumBilling/buyer")?.expiresAt).toBe(
      "2026-03-28T10:00:00.000Z",
    );
  });

  it("starts a lapsed or revoked subscription at the new confirmation time", async () => {
    seed();
    memory.documents.set("premiumBilling/buyer", {
      expiresAt: "2027-01-01T00:00:00.000Z",
      revokedAt: "2026-01-01T00:00:00.000Z",
    });
    await billingStore.activate(123, now);
    expect(memory.documents.get("premiumBilling/buyer")).toEqual({
      expiresAt: "2026-02-28T10:00:00.000Z",
    });
  });

  it("refuses an invalid stored price without changing access", async () => {
    seed(123, 1);
    await expect(billingStore.activate(123, now)).rejects.toThrow(
      "Invalid stored payment",
    );
    expect(memory.documents.has("premiumBilling/buyer")).toBe(false);
    expect(memory.documents.get("premiumOrders/123")?.status).toBe("PENDING");
  });

  it("requires review when a delayed payment predates an Admin revocation", async () => {
    seed();
    memory.documents.set("premiumBilling/buyer", {
      revokedAt: "2026-02-01T10:00:00.000Z",
    });
    await expect(
      billingStore.activate(123, "2026-02-02T10:00:00.000Z"),
    ).rejects.toThrow("administrator");
    expect(memory.documents.get("premiumOrders/123")?.status).toBe("PENDING");
  });

  it("does not shorten a paid period when concurrent settlement responses arrive out of order", () => {
    const revision = premiumAccessRevision("buyer");
    publishPaidPremium("buyer", "2026-03-28T10:00:00.000Z", revision);
    publishPaidPremium("buyer", "2026-02-28T10:00:00.000Z", revision);
    expect(premiumExpirations.get("buyer")).toBe("2026-03-28T10:00:00.000Z");
    revokePaidPremium("buyer");
    publishPaidPremium("buyer", "2026-03-28T10:00:00.000Z", revision);
    expect(premiumExpirations.has("buyer")).toBe(false);
  });

  it("reserves the same pending order across concurrent checkout requests", async () => {
    const [first, second] = await Promise.all([
      billingStore.reserve("buyer", now),
      billingStore.reserve("buyer", now),
    ]);
    expect(first.orderCode).toBe(second.orderCode);
    expect(
      [...memory.documents.keys()].filter((key) =>
        key.startsWith("premiumOrders/"),
      ),
    ).toHaveLength(1);
  });

  it("creates a new checkout after a prior link has expired", async () => {
    const first = await billingStore.reserve("buyer", now);
    const second = await billingStore.reserve(
      "buyer",
      "2026-01-31T11:00:00.000Z",
    );
    expect(second.orderCode).not.toBe(first.orderCode);
  });

  it("does not replace a paid status with a delayed cancellation", async () => {
    seed();
    await billingStore.activate(123, now);
    await billingStore.markClosed(123, "CANCELLED");
    expect(memory.documents.get("premiumOrders/123")?.status).toBe("PAID");
  });

  it("restores expiration enforcement after restart and respects Admin revocation", async () => {
    memory.documents.set("premiumBilling/buyer", {
      expiresAt: "2026-02-28T10:00:00.000Z",
    });
    await billingStore.restore();
    expect(hasPaidPremium("buyer", Date.parse(now))).toBe(true);
    expect(
      hasPaidPremium("buyer", Date.parse("2026-02-28T10:00:00.000Z")),
    ).toBe(false);
    await billingStore.revoke("buyer");
    premiumExpirations.clear();
    await billingStore.restore();
    expect(premiumExpirations.has("buyer")).toBe(false);
  });
});
