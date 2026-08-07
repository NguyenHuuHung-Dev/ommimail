import crypto from "node:crypto";
import type { Request, Response } from "express";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { saveMailbox, updateMailboxCredential } from "./firestore-store.js";
type State = {
  provider: "google" | "microsoft";
  userId: string;
  expires: number;
  nonce: string;
};
const credentials = new Map<string, unknown>();
export const getOAuthCredential = (accountId: string) =>
  credentials.get(accountId) as Record<string, unknown> | undefined;
export const setOAuthCredential = (
  accountId: string,
  value: Record<string, unknown>,
) => { credentials.set(accountId, value); void updateMailboxCredential(accountId, value).catch(() => undefined); };
export const restoreOAuthCredential = (accountId: string, value: Record<string, unknown>) => credentials.set(accountId, value);
export const removeOAuthCredential = (accountId: string) =>
  credentials.delete(accountId);
const web = () => process.env.WEB_APP_URL ?? "http://localhost:5173";
function issue(provider: State["provider"], userId: string) {
  const payload = Buffer.from(JSON.stringify({
    provider,
    userId,
    expires: Date.now() + 10 * 60_000,
    nonce: crypto.randomBytes(16).toString("base64url"),
  } satisfies State)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", oauthStateSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
function take(value: string, provider: State["provider"]) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("OAuth state is invalid or expired");
  const expected = crypto
    .createHmac("sha256", oauthStateSecret())
    .update(payload)
    .digest();
  const supplied = Buffer.from(signature, "base64url");
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied))
    throw new Error("OAuth state is invalid or expired");
  let saved: State;
  try {
    saved = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as State;
  } catch {
    throw new Error("OAuth state is invalid or expired");
  }
  if (saved.provider !== provider || saved.expires < Date.now() || !saved.userId || !saved.nonce)
    throw new Error("OAuth state is invalid or expired");
  return saved;
}
function oauthStateSecret() {
  const value = process.env.OAUTH_STATE_SECRET ?? process.env.TOKEN_ENCRYPTION_KEY ?? process.env.MICROSOFT_CLIENT_SECRET ?? process.env.GOOGLE_CLIENT_SECRET;
  if (!value) throw new Error("OAUTH_STATE_SECRET is not configured");
  return value;
}
async function token(url: string, params: Record<string, string>) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const description = typeof body.error_description === "string" ? body.error_description : typeof body.error === "string" ? body.error : "Provider rejected the request";
    throw new Error(`Token exchange failed (${r.status}): ${description}`);
  }
  return body;
}
async function json(url: string, accessToken: string, label = "Provider request") {
  const r = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const providerError = body.error as Record<string, unknown> | string | undefined;
    const message =
      typeof providerError === "string"
        ? providerError
        : typeof providerError?.message === "string"
          ? providerError.message
          : r.statusText || "Provider rejected the request";
    throw new Error(`${label} failed (${r.status}): ${message}`);
  }
  return body;
}
async function add(
  provider: "gmail" | "microsoft",
  email: string,
  name: string | undefined,
  providerId: string,
  tokens: unknown,
  userId: string,
) {
  const tokenRecord = tokens as Record<string, unknown>;
  const expiresAt = Date.now() + Number(tokenRecord.expires_in ?? 3600) * 1000;
  const normalizedTokens = { ...tokenRecord, expires_at: expiresAt, expiry_date: expiresAt };
  const duplicate = accounts.find(
    (a) =>
      a.provider === provider &&
      accountOwners.get(a.id) === userId &&
      a.emailAddress.toLowerCase() === email.toLowerCase(),
  );
  if (duplicate) {
    duplicate.status = "connected";
    credentials.set(duplicate.id, normalizedTokens);
    await saveMailbox(duplicate, userId, "oauth", normalizedTokens);
    return duplicate;
  }
  const id = `${provider}-${crypto.randomUUID()}`;
  const a = {
    id,
    provider,
    emailAddress: email,
    displayName: name,
    status: "connected" as const,
    unreadCount: 0,
    lastSyncedAt: new Date().toISOString(),
    color: provider === "gmail" ? "#ef4444" : "#2563eb",
  };
  accounts.push(a);
  credentials.set(id, normalizedTokens);
  accountOwners.set(id, userId);
  await saveMailbox(a, userId, "oauth", normalizedTokens);
  return a;
}
const user = (req: Request) =>
  (req as Request & { userId?: string }).userId ?? "demo-user";
export const oauth = {
  googleStart(req: Request, res: Response) {
    const client = process.env.GOOGLE_CLIENT_ID;
    const secret = process.env.GOOGLE_CLIENT_SECRET;
    const redirect = process.env.GOOGLE_REDIRECT_URI;
    if (!client || !secret || !redirect)
      return res.status(503).json({
        success: false,
        error: {
          code: "GOOGLE_NOT_CONFIGURED",
          message: "Google OAuth credentials are not configured",
          details: {},
        },
      });
    const state = issue("google", user(req));
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      access_type: "offline",
      prompt: "consent select_account",
      state,
      scope:
        "openid email profile https://www.googleapis.com/auth/gmail.readonly",
    }).toString();
    return res.json({ success: true, data: { url: url.toString() } });
  },
  async googleCallback(req: Request, res: Response) {
    try {
      const code = String(req.query.code ?? "");
      const session = take(String(req.query.state ?? ""), "google");
      const tokens = await token("https://oauth2.googleapis.com/token", {
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
        grant_type: "authorization_code",
        code,
      });
      const p = await json(
        "https://openidconnect.googleapis.com/v1/userinfo",
        String(tokens.access_token),
        "Google profile request",
      );
      await add(
        "gmail",
        String(p.email),
        typeof p.name === "string" ? p.name : undefined,
        String(p.sub),
        tokens,
        session.userId,
      );
      return res.redirect(`${web()}/app/mailboxes?connected=google`);
    } catch (e) {
      return res.redirect(
        `${web()}/app/connect?oauthError=${encodeURIComponent(e instanceof Error ? e.message : "oauth_failed")}`,
      );
    }
  },
  microsoftStart(req: Request, res: Response) {
    const client = process.env.MICROSOFT_CLIENT_ID;
    const secret = process.env.MICROSOFT_CLIENT_SECRET;
    const redirect = process.env.MICROSOFT_REDIRECT_URI;
    if (!client || !secret || !redirect)
      return res.status(503).json({
        success: false,
        error: {
          code: "MICROSOFT_NOT_CONFIGURED",
          message: "Microsoft OAuth Web credentials are incomplete. Configure client ID, client secret and redirect URI.",
          details: {},
        },
      });
    const state = issue("microsoft", user(req));
    const tenant = process.env.MICROSOFT_TENANT_ID ?? "consumers";
    const url = new URL(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    );
    url.search = new URLSearchParams({
      client_id: client,
      redirect_uri: redirect,
      response_type: "code",
      response_mode: "query",
      state,
      scope: "openid profile email offline_access User.Read Mail.Read",
      prompt: "select_account",
    }).toString();
    return res.json({ success: true, data: { url: url.toString() } });
  },
  async microsoftCallback(req: Request, res: Response) {
    try {
      const code = String(req.query.code ?? "");
      const session = take(String(req.query.state ?? ""), "microsoft");
      const tenant = process.env.MICROSOFT_TENANT_ID ?? "consumers";
      const tokenInput: Record<string, string> = {
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        redirect_uri: process.env.MICROSOFT_REDIRECT_URI!,
        grant_type: "authorization_code",
        code,
        scope: "openid profile email offline_access User.Read Mail.Read",
      };
      if (process.env.MICROSOFT_CLIENT_SECRET)
        tokenInput.client_secret = process.env.MICROSOFT_CLIENT_SECRET;
      const tokens = await token(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        tokenInput,
      );
      const p = await json(
        "https://graph.microsoft.com/v1.0/me",
        String(tokens.access_token),
        "Microsoft profile request",
      );
      await json(
        "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages?$top=1&$select=id",
        String(tokens.access_token),
        "Microsoft Mail.Read check",
      );
      const email = String(p.mail ?? p.userPrincipalName);
      await add(
        "microsoft",
        email,
        typeof p.displayName === "string" ? p.displayName : undefined,
        String(p.id),
        tokens,
        session.userId,
      );
      return res.redirect(`${web()}/app/mailboxes?connected=microsoft`);
    } catch (e) {
      return res.redirect(
        `${web()}/app/connect?oauthError=${encodeURIComponent(e instanceof Error ? e.message : "oauth_failed")}`,
      );
    }
  },
};
