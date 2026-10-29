import type { NextFunction, Request, Response } from "express";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { saveUserProfile } from "./firestore-store.js";
import { satisfiesEmailVerification } from "./auth-policy.js";

export type UserRole = "admin" | "premium" | "basic";
export type AuthRequest = Request & {
  userId: string;
  role: UserRole;
  email?: string;
  displayName?: string;
};
export type UserProfile = {
  email: string;
  displayName?: string;
  lastSeenAt: string;
  role: UserRole;
};
export const userDirectory = new Map<string, UserProfile>();
export const roleOverrides = new Map<string, Exclude<UserRole, "admin">>();
const inlineServiceAccountConfigured = Boolean(
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY,
);
export const serviceAccountConfigured =
  inlineServiceAccountConfigured ||
  Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
export const authConfigured = Boolean(process.env.FIREBASE_PROJECT_ID);
export const localAuthEnabled =
  !authConfigured &&
  process.env.NODE_ENV !== "production" &&
  process.env.DEMO_MODE !== "false";
if (authConfigured && !getApps().length) {
  if (inlineServiceAccountConfigured)
    initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
        privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
      }),
    });
  else if (process.env.GOOGLE_APPLICATION_CREDENTIALS)
    initializeApp({
      credential: applicationDefault(),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
  else initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
}
// The allowlist is intentionally server-side; removing an email takes effect after an API restart.
function allowedAdmins() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean),
  );
}
export function resolveUserRole(
  userId: string,
  email?: string,
  claims: Record<string, unknown> = {},
): UserRole {
  return claims.admin === true ||
    (email ? allowedAdmins().has(email.toLowerCase()) : false)
    ? "admin"
    : (roleOverrides.get(userId) ??
        (claims.role === "premium" ? "premium" : "basic"));
}
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (authConfigured) {
    if (!token)
      return res.status(401).json({
        success: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Sign in required",
          details: {},
        },
      });
    try {
      const decoded = await getAuth().verifyIdToken(token, true);
      if (!satisfiesEmailVerification(decoded))
        return res.status(403).json({
          success: false,
          error: {
            code: "EMAIL_NOT_VERIFIED",
            message: "Vui lòng xác minh email trước khi sử dụng OmniMail",
            details: {},
          },
        });
      const email = decoded.email?.toLowerCase();
      const existing = userDirectory.get(decoded.uid);
      const displayName =
        typeof decoded.name === "string" && decoded.name.trim()
          ? decoded.name.trim()
          : existing?.displayName;
      const target = req as AuthRequest;
      target.userId = decoded.uid;
      target.email = email;
      target.displayName = displayName;
      target.role = resolveUserRole(decoded.uid, email, decoded);
      if (email) {
        const profile = {
          email,
          displayName,
          lastSeenAt: new Date().toISOString(),
          role: target.role,
        };
        userDirectory.set(decoded.uid, profile);
        void saveUserProfile({ userId: decoded.uid, ...profile }).catch(
          () => undefined,
        );
      }
      return next();
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      const revoked = code === "auth/id-token-revoked";
      const disabled = code === "auth/user-disabled";
      const deleted = code === "auth/user-not-found";
      return res.status(401).json({
        success: false,
        error: {
          code: disabled
            ? "ACCOUNT_DISABLED"
            : deleted
              ? "ACCOUNT_DELETED"
              : revoked
                ? "SESSION_REVOKED"
                : "INVALID_TOKEN",
          message: disabled
            ? "Tài khoản đã bị quản trị viên khóa."
            : deleted
              ? "Tài khoản không còn tồn tại."
              : revoked
                ? "Phiên đăng nhập đã kết thúc. Vui lòng đăng nhập lại."
                : "Session is invalid or expired",
          details: {},
        },
      });
    }
  }
  if (!localAuthEnabled)
    return res.status(503).json({
      success: false,
      error: {
        code: "AUTH_NOT_CONFIGURED",
        message: "Authentication is not configured",
        details: {},
      },
    });
  const target = req as AuthRequest;
  target.userId = "local-user";
  target.role = "admin";
  target.email = "admin@local.test";
  target.displayName = "Local Admin";
  userDirectory.set(target.userId, {
    email: target.email,
    displayName: target.displayName,
    lastSeenAt: new Date().toISOString(),
    role: target.role,
  });
  return next();
}
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if ((req as AuthRequest).role !== "admin")
    return res.status(403).json({
      success: false,
      error: {
        code: "ADMIN_REQUIRED",
        message: "Administrator permission is required",
        details: {},
      },
    });
  return next();
}
