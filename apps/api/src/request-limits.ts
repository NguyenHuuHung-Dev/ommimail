import type { Express } from "express";
import rateLimit from "express-rate-limit";

export function trustedProxyHops(env: NodeJS.ProcessEnv = process.env): number {
  // Render terminates public traffic at its proxy. Direct/local deployments
  // must not trust forwarding headers unless explicitly configured.
  const configured = env.TRUST_PROXY_HOPS ?? (env.RENDER === "true" ? "1" : "0");
  if (!/^\d+$/.test(configured) || !Number.isSafeInteger(Number(configured))) {
    throw new Error("TRUST_PROXY_HOPS must be a non-negative integer, never true or a wildcard");
  }
  return Number(configured);
}

export function configureRequestLimits(
  app: Express,
  { env = process.env, limit = 240 }: { env?: NodeJS.ProcessEnv; limit?: number } = {},
) {
  const hops = trustedProxyHops(env);
  app.set("trust proxy", hops === 0 ? false : hops);
  app.use(rateLimit({
    windowMs: 60_000,
    limit,
    // Use the library's IP key generator, including IPv6 subnet grouping.
    // Never use the untrusted leftmost X-Forwarded-For value directly.
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) =>
      (req.method === "GET" || req.method === "HEAD") && /^\/api\/health\/?$/i.test(req.path),
    message: {
      success: false,
      error: {
        code: "RATE_LIMITED",
        message: "Bạn gửi quá nhiều yêu cầu. Vui lòng đợi một phút rồi thử lại.",
        details: {},
      },
    },
  }));
}
