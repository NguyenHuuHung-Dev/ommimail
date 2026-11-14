import { PayOS } from "@payos/node";
import { getAuth } from "firebase-admin/auth";
import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  PREMIUM_MONTHLY_PRICE_VND,
  type PremiumBilling,
  type PremiumPayment,
} from "@omnimail/shared";
import { type AuthRequest, resolveUserRole } from "./auth.js";
import {
  persistentStoreEnabled,
  saveUpgradeRequest,
} from "./firestore-store.js";
import {
  billingStore,
  PaymentReviewRequired,
  type StoredPremiumOrder,
} from "./billing-store.js";
import {
  premiumExpirations,
  premiumAccessRevision,
  publishPaidPremium,
} from "./premium-access.js";
import { setUpgradeRequest } from "./upgrade-requests.js";

class BillingError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const ok = (response: Response, data: unknown) =>
  response.json({ success: true, data });
function failure(response: Response, error: unknown) {
  if (error instanceof PaymentReviewRequired)
    error = new BillingError(
      409,
      "PAYMENT_REVIEW_REQUIRED",
      "Quyền tài khoản đã được Admin thay đổi. Vui lòng liên hệ Admin để xử lý thanh toán này, không chuyển tiền thêm.",
    );
  const billingError = error instanceof BillingError ? error : undefined;
  return response.status(billingError?.status ?? 503).json({
    success: false,
    error: {
      code: billingError?.code ?? "PAYMENT_UNAVAILABLE",
      message:
        billingError?.message ??
        "Chưa thể kiểm tra thanh toán. Vui lòng thử lại, không chuyển tiền thêm.",
      details: {},
    },
  });
}
function webOrigin() {
  const url = new URL(
    (process.env.WEB_APP_URL ?? "http://localhost:5173").split(",")[0].trim(),
  );
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new Error("HTTPS payment return URL required");
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("Invalid payment return URL");
  return url.origin;
}
export function paymentsAvailable() {
  if (
    !persistentStoreEnabled ||
    !process.env.PAYOS_CLIENT_ID ||
    !process.env.PAYOS_API_KEY ||
    !process.env.PAYOS_CHECKSUM_KEY
  )
    return false;
  try {
    webOrigin();
    return true;
  } catch {
    return false;
  }
}
function payos() {
  if (!paymentsAvailable())
    throw new BillingError(
      503,
      "PAYMENT_NOT_CONFIGURED",
      "Thanh toán chưa được mở. Bạn vẫn có thể gửi yêu cầu nâng cấp cho Admin.",
    );
  return new PayOS({
    clientId: process.env.PAYOS_CLIENT_ID!,
    apiKey: process.env.PAYOS_API_KEY!,
    checksumKey: process.env.PAYOS_CHECKSUM_KEY!,
    timeout: 20_000,
    maxRetries: 0,
    logLevel: "off",
  });
}
function publicOrder(order: StoredPremiumOrder): PremiumPayment {
  return {
    orderCode: order.orderCode,
    amount: order.amount,
    status: order.status,
    expiresAt: order.expiresAt,
    ...(order.checkoutUrl ? { checkoutUrl: order.checkoutUrl } : {}),
    ...(order.premiumExpiresAt
      ? { premiumExpiresAt: order.premiumExpiresAt }
      : {}),
  };
}
function orderCodeFrom(value: unknown) {
  const parsed = z.coerce
    .number()
    .int()
    .positive()
    .max(Number.MAX_SAFE_INTEGER)
    .safeParse(value);
  if (!parsed.success)
    throw new BillingError(400, "INVALID_ORDER", "Mã thanh toán không hợp lệ.");
  return parsed.data;
}
async function ownedOrder(userId: string, orderCode: number) {
  const order = await billingStore.order(orderCode);
  if (!order || order.userId !== userId)
    throw new BillingError(
      404,
      "ORDER_NOT_FOUND",
      "Không tìm thấy thanh toán của tài khoản này.",
    );
  return order;
}
function checkCheckoutUrl(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "pay.payos.vn" ||
    url.username ||
    url.password ||
    url.port
  ) {
    throw new Error("Invalid PayOS checkout URL");
  }
  return url.toString();
}
// Both the signed webhook and the browser's status check use the provider's
// signed API response. Query-string success/cancel flags never grant access.
export async function reconcilePremiumPayment(
  order: StoredPremiumOrder,
  client = payos(),
) {
  if (order.status === "PAID") return order;
  const payment = await client.paymentRequests.get(order.orderCode);
  if (
    payment.orderCode !== order.orderCode ||
    payment.amount !== PREMIUM_MONTHLY_PRICE_VND ||
    order.amount !== PREMIUM_MONTHLY_PRICE_VND ||
    (order.paymentLinkId && payment.id !== order.paymentLinkId)
  ) {
    throw new BillingError(
      400,
      "PAYMENT_MISMATCH",
      "Thông tin thanh toán không khớp đơn hàng.",
    );
  }
  if (payment.status === "PAID") {
    if (payment.amountPaid < order.amount || payment.amountRemaining !== 0) {
      throw new BillingError(
        400,
        "PAYMENT_UNDERPAID",
        "Thanh toán chưa đủ số tiền của đơn hàng.",
      );
    }
    const user = await getAuth().getUser(order.userId);
    if (user.disabled)
      throw new BillingError(
        409,
        "ACCOUNT_DISABLED",
        "Tài khoản đang bị khóa. Vui lòng liên hệ Admin về thanh toán này.",
      );
    if (resolveUserRole(user.uid, user.email, user.customClaims) === "admin") {
      throw new BillingError(
        409,
        "ADMIN_PAYMENT",
        "Tài khoản Admin không cần thanh toán Premium.",
      );
    }
    const revision = premiumAccessRevision(order.userId);
    const expiresAt = await billingStore.activate(
      order.orderCode,
      new Date().toISOString(),
    );
    if (expiresAt) publishPaidPremium(order.userId, expiresAt, revision);
    setUpgradeRequest(order.userId);
    await saveUpgradeRequest(order.userId);
  } else if (payment.status === "CANCELLED" || payment.status === "EXPIRED") {
    await billingStore.markClosed(order.orderCode, payment.status);
  }
  return (await billingStore.order(order.orderCode))!;
}

async function createCheckout(user: AuthRequest) {
  const client = payos();
  if (
    user.role === "admin" ||
    (user.role === "premium" && !premiumExpirations.has(user.userId))
  ) {
    throw new BillingError(
      409,
      "ALREADY_UPGRADED",
      "Tài khoản của bạn đã được Admin cấp Premium và không cần thanh toán.",
    );
  }
  const order = await billingStore.reserve(
    user.userId,
    new Date().toISOString(),
  );
  if (order.checkoutUrl) return publicOrder(order);
  const returnUrl = new URL("/app/mail-admin", webOrigin());
  returnUrl.searchParams.set("orderCode", String(order.orderCode));
  returnUrl.searchParams.set("payment", "return");
  const cancelUrl = new URL(returnUrl);
  cancelUrl.searchParams.set("payment", "cancelled");
  let paymentLinkId: string;
  let checkoutUrl: string;
  try {
    const payment = await client.paymentRequests.create({
      orderCode: order.orderCode,
      amount: PREMIUM_MONTHLY_PRICE_VND,
      // Some PayOS bank connections allow only nine description characters.
      description: `OM${order.orderCode.toString(36).slice(-7).toUpperCase()}`,
      items: [
        {
          name: "OmniMail Premium - 1 thang",
          quantity: 1,
          price: PREMIUM_MONTHLY_PRICE_VND,
        },
      ],
      returnUrl: returnUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      expiredAt: Math.floor(Date.parse(order.expiresAt) / 1000),
    });
    if (
      payment.orderCode !== order.orderCode ||
      payment.amount !== PREMIUM_MONTHLY_PRICE_VND ||
      payment.currency !== "VND"
    ) {
      throw new Error("Payment link does not match order");
    }
    paymentLinkId = payment.paymentLinkId;
    checkoutUrl = checkCheckoutUrl(payment.checkoutUrl);
  } catch (error) {
    // A timed-out create may have succeeded at PayOS. Reuse the same persisted
    // order code instead of creating another bill on retry or across replicas.
    let existing;
    try {
      existing = await client.paymentRequests.get(order.orderCode);
    } catch {
      throw error;
    }
    if (
      existing.orderCode !== order.orderCode ||
      existing.amount !== PREMIUM_MONTHLY_PRICE_VND ||
      !existing.id
    )
      throw error;
    paymentLinkId = existing.id;
    checkoutUrl = checkCheckoutUrl(
      `https://pay.payos.vn/web/${encodeURIComponent(existing.id)}`,
    );
  }
  await billingStore.attachLink(order.orderCode, paymentLinkId, checkoutUrl);
  return publicOrder((await billingStore.order(order.orderCode))!);
}
const checkoutTasks = new Map<string, Promise<PremiumPayment>>();
export const premiumBillingRouter = Router();
premiumBillingRouter.get("/", async (request, response) => {
  try {
    const user = request as AuthRequest;
    const account = persistentStoreEnabled
      ? await billingStore.account(user.userId)
      : undefined;
    const expiresAt =
      account && !account.revokedAt ? account.expiresAt : undefined;
    const pending = account?.pendingOrderCode
      ? await billingStore.order(account.pendingOrderCode)
      : undefined;
    const data: PremiumBilling = {
      available: paymentsAvailable(),
      price: PREMIUM_MONTHLY_PRICE_VND,
      currency: "VND",
      managed:
        user.role === "admin" ||
        (user.role === "premium" && !premiumExpirations.has(user.userId)),
      ...(expiresAt ? { premiumExpiresAt: expiresAt } : {}),
      ...(pending ? { order: publicOrder(pending) } : {}),
    };
    return ok(response, data);
  } catch (error) {
    return failure(response, error);
  }
});
premiumBillingRouter.post(
  "/checkout",
  rateLimit({
    windowMs: 60_000,
    limit: 5,
    keyGenerator: (request) => (request as AuthRequest).userId,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      success: false,
      error: {
        code: "PAYMENT_RATE_LIMITED",
        message: "Vui lòng đợi một phút trước khi tạo lại thanh toán.",
        details: {},
      },
    },
  }),
  async (request, response) => {
    try {
      if (
        !z
          .object({})
          .strict()
          .safeParse(request.body ?? {}).success
      )
        throw new BillingError(
          400,
          "INVALID_CHECKOUT",
          "Đơn Premium được tạo theo giá niêm yết của OmniMail.",
        );
      const user = request as AuthRequest;
      let task = checkoutTasks.get(user.userId);
      if (!task) {
        task = createCheckout(user).finally(() =>
          checkoutTasks.delete(user.userId),
        );
        checkoutTasks.set(user.userId, task);
      }
      return ok(response, await task);
    } catch (error) {
      return failure(response, error);
    }
  },
);
premiumBillingRouter.post(
  "/orders/:orderCode/check",
  async (request, response) => {
    try {
      const order = await ownedOrder(
        (request as unknown as AuthRequest).userId,
        orderCodeFrom(request.params.orderCode),
      );
      return ok(response, publicOrder(await reconcilePremiumPayment(order)));
    } catch (error) {
      return failure(response, error);
    }
  },
);

export async function payosWebhook(request: Request, response: Response) {
  let client: PayOS;
  try {
    client = payos();
  } catch (error) {
    return failure(response, error);
  }
  let data;
  try {
    data = await client.webhooks.verify(request.body);
  } catch {
    return failure(
      response,
      new BillingError(
        400,
        "INVALID_WEBHOOK",
        "Chữ ký thanh toán không hợp lệ.",
      ),
    );
  }
  try {
    // PayOS sends a signed sample when registering the webhook. Unknown orders
    // are acknowledged without creating an order or changing any user's access.
    const order = await billingStore.order(data.orderCode);
    if (!order) return ok(response, { received: true });
    if (data.code !== "00") return ok(response, { received: true });
    if (
      data.currency !== "VND" ||
      !Number.isSafeInteger(data.amount) ||
      data.amount <= 0 ||
      (order.paymentLinkId && order.paymentLinkId !== data.paymentLinkId)
    ) {
      throw new BillingError(
        400,
        "PAYMENT_MISMATCH",
        "Dữ liệu thanh toán không khớp đơn hàng.",
      );
    }
    await reconcilePremiumPayment(order, client);
    return ok(response, { received: true });
  } catch (error) {
    return failure(response, error);
  }
}
