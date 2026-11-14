import { randomInt } from "node:crypto";
import { getApps } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import {
  PREMIUM_MONTHLY_PRICE_VND,
  type PremiumPayment,
} from "@omnimail/shared";
import { persistentStoreEnabled } from "./firestore-store.js";
import {
  addPremiumMonth,
  premiumExpirations,
  revokePaidPremium,
} from "./premium-access.js";

export class PaymentReviewRequired extends Error {}

export type StoredPremiumOrder = PremiumPayment & {
  userId: string;
  createdAt: string;
  paymentLinkId?: string;
  paidAt?: string;
};
type BillingAccount = {
  expiresAt?: string;
  revokedAt?: string;
  pendingOrderCode?: number;
  pendingExpiresAt?: string;
};
function db() {
  if (!persistentStoreEnabled || !getApps().length)
    throw new Error("Billing requires persistent storage");
  return getFirestore();
}
const orderRef = (orderCode: number) =>
  db().collection("premiumOrders").doc(String(orderCode));
const accountRef = (userId: string) =>
  db().collection("premiumBilling").doc(userId);

export const billingStore = {
  async account(userId: string): Promise<BillingAccount | undefined> {
    return (await accountRef(userId).get()).data() as
      BillingAccount | undefined;
  },
  async order(orderCode: number): Promise<StoredPremiumOrder | undefined> {
    return (await orderRef(orderCode).get()).data() as
      StoredPremiumOrder | undefined;
  },
  async reserve(userId: string, now: string): Promise<StoredPremiumOrder> {
    const orderCode = Date.parse(now) * 1000 + randomInt(1000);
    const expiresAt = new Date(Date.parse(now) + 15 * 60_000).toISOString();
    return db().runTransaction(async (transaction) => {
      const ref = accountRef(userId);
      const account = (await transaction.get(ref)).data() as
        BillingAccount | undefined;
      if (
        account?.pendingOrderCode &&
        Date.parse(account.pendingExpiresAt ?? "") > Date.parse(now)
      ) {
        const pending = (
          await transaction.get(orderRef(account.pendingOrderCode))
        ).data() as StoredPremiumOrder | undefined;
        if (pending?.userId === userId && pending.status === "PENDING")
          return pending;
      }
      const order: StoredPremiumOrder = {
        orderCode,
        userId,
        amount: PREMIUM_MONTHLY_PRICE_VND,
        status: "PENDING",
        createdAt: now,
        expiresAt,
      };
      transaction.create(orderRef(orderCode), order);
      transaction.set(
        ref,
        { pendingOrderCode: orderCode, pendingExpiresAt: expiresAt },
        { merge: true },
      );
      return order;
    });
  },
  async attachLink(
    orderCode: number,
    paymentLinkId: string,
    checkoutUrl: string,
  ) {
    await orderRef(orderCode).update({ paymentLinkId, checkoutUrl });
  },
  async markClosed(orderCode: number, status: "CANCELLED" | "EXPIRED") {
    await db().runTransaction(async (transaction) => {
      const ref = orderRef(orderCode);
      const order = (await transaction.get(ref)).data() as
        StoredPremiumOrder | undefined;
      if (order && order.status !== "PAID") transaction.update(ref, { status });
    });
  },
  // The order and entitlement commit together. Concurrent webhook deliveries,
  // status checks and renewals cannot credit the same payment twice.
  async activate(orderCode: number, now: string) {
    return db().runTransaction(async (transaction) => {
      const ref = orderRef(orderCode);
      const order = (await transaction.get(ref)).data() as
        StoredPremiumOrder | undefined;
      if (!order || order.amount !== PREMIUM_MONTHLY_PRICE_VND)
        throw new Error("Invalid stored payment");
      const billingRef = accountRef(order.userId);
      const account = (await transaction.get(billingRef)).data() as
        BillingAccount | undefined;
      if (order.status === "PAID")
        return account?.revokedAt ? undefined : account?.expiresAt;
      if (
        account?.revokedAt &&
        Date.parse(order.createdAt) <= Date.parse(account.revokedAt)
      ) {
        throw new PaymentReviewRequired(
          "Payment predates an administrator's access change",
        );
      }
      const base =
        !account?.revokedAt &&
        Date.parse(account?.expiresAt ?? "") > Date.parse(now)
          ? account!.expiresAt!
          : now;
      const premiumExpiresAt = addPremiumMonth(base);
      transaction.update(ref, {
        status: "PAID",
        paidAt: now,
        premiumExpiresAt,
      });
      const update: Record<string, unknown> = {
        expiresAt: premiumExpiresAt,
        revokedAt: FieldValue.delete(),
      };
      if (account?.pendingOrderCode === orderCode) {
        update.pendingOrderCode = FieldValue.delete();
        update.pendingExpiresAt = FieldValue.delete();
      }
      transaction.set(billingRef, update, { merge: true });
      return premiumExpiresAt;
    });
  },
  async revoke(userId: string) {
    if (persistentStoreEnabled && getApps().length) {
      await accountRef(userId).set(
        { revokedAt: new Date().toISOString() },
        { merge: true },
      );
    }
    revokePaidPremium(userId);
  },
  async restore() {
    if (!persistentStoreEnabled || !getApps().length) return;
    const accounts = await db().collection("premiumBilling").get();
    for (const document of accounts.docs) {
      const account = document.data() as BillingAccount;
      if (
        !account.revokedAt &&
        account.expiresAt &&
        Number.isFinite(Date.parse(account.expiresAt))
      ) {
        premiumExpirations.set(document.id, account.expiresAt);
      }
    }
  },
};
