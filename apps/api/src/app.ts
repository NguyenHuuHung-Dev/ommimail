import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import crypto from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { z } from "zod";
import { accounts, messages } from "./demo-data.js";
import { mailTm } from "./mail-tm.js";
import { microsoftTokens } from "./microsoft-token-accounts.js";
import { accountOwners } from "./ownership.js";
import { isMailboxShared, mailboxShares, setMailboxShare } from "./sharing.js";
import { gmail } from "./gmail.js";
import { gmailAppPasswords } from "./gmail-app-password.js";
import { microsoftGraph } from "./microsoft-graph.js";
import { hiddenMessages } from "./hidden-messages.js";
import { compositeMessageAccountId, mayReadMailbox, mayRevealMailboxAddress } from "./access-control.js";
import { oauth, removeOAuthCredential } from "./oauth.js";
import { deleteMailbox, persistentStoreEnabled, saveHiddenMessage, saveMailbox, saveMailboxShare, saveUserProfile } from "./firestore-store.js";
import {
  listMicrosoftInbox,
  getMicrosoftMessage,
  clearMicrosoftCache,
} from "./microsoft-imap.js";
import {
  authenticate,
  authConfigured,
  requireAdmin,
  roleOverrides,
  serviceAccountConfigured,
  userDirectory,
  type AuthRequest,
} from "./auth.js";
import { normalizeRegistrationEmail } from "./auth-policy.js";
const identity = (q: express.Request) => q as unknown as AuthRequest;
const legacyMicrosoftSeedEnabled = process.env.ENABLE_LEGACY_MICROSOFT_SEED === "true";
const ownsSeed = (q: express.Request) =>
  legacyMicrosoftSeedEnabled &&
  (!authConfigured ||
  (Boolean(process.env.MICROSOFT_SEED_OWNER_UID) &&
    process.env.MICROSOFT_SEED_OWNER_UID === identity(q).userId));
const canReadAccount=(q:express.Request,accountId:string)=>mayReadMailbox({ownerId:accountOwners.get(accountId),userId:identity(q).userId,role:identity(q).role,shared:isMailboxShared(accountId,identity(q).userId)});
const accountIdForMessage = (messageId: string) => {
  return compositeMessageAccountId(messageId) ?? messages.find((message) => message.id === messageId)?.accountId;
};
const filterLoadedMessages = (q: express.Request, list: typeof messages) => {
  let filtered = list.filter((message) => !hiddenMessages.has(identity(q).userId, message.id));
  if (q.query.starred === "true") filtered = filtered.filter((message) => message.isStarred);
  if (q.query.read === "false") filtered = filtered.filter((message) => !message.isRead);
  const search = String(q.query.q ?? "").trim().toLowerCase();
  if (search) {
    if (search === "is:unread") filtered = filtered.filter((message) => !message.isRead);
    else if (search === "is:read") filtered = filtered.filter((message) => message.isRead);
    else if (search.startsWith("from:")) {
      const value = search.slice(5).trim();
      filtered = filtered.filter((message) => `${message.from.name ?? ""} ${message.from.address}`.toLowerCase().includes(value));
    } else if (search.startsWith("subject:")) {
      const value = search.slice(8).trim();
      filtered = filtered.filter((message) => message.subject.toLowerCase().includes(value));
    } else {
      filtered = filtered.filter((message) => `${message.subject} ${message.preview} ${message.from.name ?? ""} ${message.from.address}`.toLowerCase().includes(search));
    }
  }
  const limit = Math.min(Math.max(Number(q.query.limit) || 10, 1), 10);
  return filtered.slice(0, limit);
};
export const app = express();
app.use(helmet());
const configuredWebOrigins = (process.env.WEB_APP_URL ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin(origin, callback) {
      const localDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
      callback(
        origin && !configuredWebOrigins.includes(origin) && !localDevelopmentOrigin
          ? new Error("Origin is not allowed")
          : null,
        true,
      );
    },
  }),
);
app.use(express.json({ limit: "2mb" }));
app.use(rateLimit({ windowMs: 60_000, limit: 240 }));
app.use(
  pinoHttp({
    genReqId: () => crypto.randomUUID(),
    redact: ["req.headers.authorization", "req.headers.cookie"],
  }),
);
app.get("/api/health", (_q, r) =>
  r.json({
    success: true,
    data: {
      status: "ok",
      mode: process.env.DEMO_MODE === "false" ? "production" : "demo",
      persistentMailboxStorage: persistentStoreEnabled,
      providers: {
        googleOAuth: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REDIRECT_URI),
        microsoftOAuth: Boolean(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_REDIRECT_URI),
        tempMail: true,
      },
    },
  }),
);
app.get("/api/oauth/google/callback", oauth.googleCallback);
app.get("/api/oauth/microsoft/callback", oauth.microsoftCallback);
app.post("/api/auth/registration-policy", (q, r) => {
  const parsed = z.object({ email: z.string().trim().email() }).safeParse(q.body);
  if (!parsed.success) return fail(r, 400, "INVALID_EMAIL", "Nhập một địa chỉ email hợp lệ");
  const email = normalizeRegistrationEmail(parsed.data.email);
  return ok(r, { allowed: true, email });
});
app.use(authenticate);
const ok = (res: express.Response, data: unknown) =>
  res.json({ success: true, data });
const fail = (
  res: express.Response,
  status: number,
  code: string,
  message: string,
) =>
  res
    .status(status)
    .json({ success: false, error: { code, message, details: {} } });
app.get("/api/me", (q, r) =>
  ok(r, { userId: identity(q).userId, email: identity(q).email, displayName: identity(q).displayName, role: identity(q).role }),
);
app.patch("/api/me", async (q, r) => {
  const parsed = z.object({ displayName: z.string().trim().min(2).max(100) }).safeParse(q.body);
  if (!parsed.success) return fail(r, 400, "VALIDATION_ERROR", "Họ và tên cần từ 2 đến 100 ký tự");
  const current = userDirectory.get(identity(q).userId);
  const email = identity(q).email ?? current?.email;
  if (!email) return fail(r, 400, "EMAIL_REQUIRED", "Tài khoản chưa có địa chỉ email");
  if (authConfigured) await getAuth().updateUser(identity(q).userId, { displayName: parsed.data.displayName });
  const profile = { email, displayName: parsed.data.displayName, lastSeenAt: new Date().toISOString(), role: identity(q).role };
  userDirectory.set(identity(q).userId, profile);
  await saveUserProfile({ userId: identity(q).userId, ...profile });
  return ok(r, { userId: identity(q).userId, ...profile });
});
app.get("/api/admin/overview", requireAdmin, (_q, r) =>
  ok(r, {
    users: Math.max(1, userDirectory.size),
    connectedAccounts: accounts.filter((account) => accountOwners.has(account.id)).length,
    serviceStatus: "healthy",
    directory: [...new Set([...userDirectory.keys(), ...accountOwners.values()])].map((userId) => ({
      userId,
      email: userDirectory.get(userId)?.email ?? "Unknown user",
      displayName: userDirectory.get(userId)?.displayName,
      lastSeenAt: userDirectory.get(userId)?.lastSeenAt,
      role: userDirectory.get(userId)?.role ?? 'basic',
      accounts: accounts.filter((account) => accountOwners.get(account.id) === userId),
      sharedAccountIds: accounts.filter((account)=>isMailboxShared(account.id,userId)).map((account)=>account.id),
    })),
  }),
);
app.patch('/api/admin/users/:userId/role',requireAdmin,async(q,r)=>{
  const parsed=z.object({role:z.enum(['basic','premium'])}).safeParse(q.body);if(!parsed.success)return fail(r,400,'VALIDATION_ERROR','Role must be basic or premium');
  const userId=String(q.params.userId);const user=userDirectory.get(userId);if(!user)return fail(r,404,'NOT_FOUND','User not found');
  roleOverrides.set(userId,parsed.data.role);
  if(serviceAccountConfigured)await getAuth().setCustomUserClaims(userId,{role:parsed.data.role});
  user.role=parsed.data.role;
  void saveUserProfile({userId,...user}).catch(()=>undefined);
  if(parsed.data.role==='basic')for(const [accountId,users] of mailboxShares){users.delete(userId);void saveMailboxShare(accountId,userId,false).catch(()=>undefined);if(!users.size)mailboxShares.delete(accountId)}
  return ok(r,{userId,role:parsed.data.role});
});
app.put('/api/admin/mailbox-shares',requireAdmin,async(q,r)=>{
  const parsed=z.object({accountId:z.string().min(1),userId:z.string().min(1),allowed:z.boolean()}).safeParse(q.body);if(!parsed.success)return fail(r,400,'VALIDATION_ERROR','Invalid sharing request');
  if(accountOwners.get(parsed.data.accountId)!==identity(q).userId)return fail(r,403,'FORBIDDEN','Admin can only share their own mailbox');
  if(userDirectory.get(parsed.data.userId)?.role!=='premium')return fail(r,400,'PREMIUM_REQUIRED','Only Premium users can receive mailbox access');
  setMailboxShare(parsed.data.accountId,parsed.data.userId,parsed.data.allowed);await saveMailboxShare(parsed.data.accountId,parsed.data.userId,parsed.data.allowed);return ok(r,parsed.data);
});
app.get('/api/mailbox-shares', (q, r) => {
  const ownerId = identity(q).userId;
  const mailboxes = accounts
    .filter((account) => accountOwners.get(account.id) === ownerId)
    .map((account) => ({
      account,
      recipients: [...(mailboxShares.get(account.id) ?? new Set<string>())].map((userId) => {
        const user = userDirectory.get(userId);
        return { userId, email: user?.email ?? 'Unknown user', role: user?.role ?? 'basic' };
      }),
    }));
  // Shared mailbox identities are intentionally discoverable only through the
  // guarded email-prefix search on /api/mail-accounts.
  return ok(r, { mailboxes, sharedWithMe: [] });
});
app.put('/api/mailbox-shares', async (q, r) => {
  const parsed = z.object({ accountId: z.string().min(1), email: z.string().trim().email(), allowed: z.boolean() }).safeParse(q.body);
  if (!parsed.success) return fail(r, 400, 'VALIDATION_ERROR', 'Nhập một địa chỉ email hợp lệ');
  const ownerId = identity(q).userId;
  if (accountOwners.get(parsed.data.accountId) !== ownerId) return fail(r, 403, 'FORBIDDEN', 'Bạn chỉ có thể chia sẻ mailbox của mình');
  const targetEmail = parsed.data.email.toLowerCase();
  const target = [...userDirectory.entries()].find(([, user]) => user.email.toLowerCase() === targetEmail);
  if (!target) return fail(r, 404, 'USER_NOT_FOUND', 'Email này chưa có tài khoản trong OmniMail');
  const [targetUserId, targetProfile] = target;
  if (targetUserId === ownerId) return fail(r, 400, 'SELF_SHARE', 'Bạn không thể chia sẻ mailbox cho chính mình');
  if (targetProfile.role !== 'premium') return fail(r, 400, 'PREMIUM_REQUIRED', 'Người nhận cần tài khoản Premium để xem mailbox được chia sẻ');
  setMailboxShare(parsed.data.accountId, targetUserId, parsed.data.allowed);
  await saveMailboxShare(parsed.data.accountId, targetUserId, parsed.data.allowed);
  return ok(r, { accountId: parsed.data.accountId, userId: targetUserId, email: targetProfile.email, allowed: parsed.data.allowed });
});
app.get("/api/mail-accounts", (_q, r) => {
  const search = String(_q.query.q ?? "").trim();
  const live =
    legacyMicrosoftSeedEnabled && process.env.MICROSOFT_SEED_REFRESH_TOKEN && ownsSeed(_q)
      ? [
          {
            id: "microsoft-live",
            provider: "microsoft" as const,
            emailAddress:
              process.env.MICROSOFT_SEED_EMAIL ?? "Microsoft account",
            displayName: "Hotmail (OAuth IMAP)",
            status: "connected" as const,
            unreadCount: 0,
            color: "#2563eb",
          },
        ]
      : [];
  const connected = accounts.filter(
    (a) =>
      !["gmail-1", "outlook-1", "temp-1", "microsoft-live"].includes(a.id) &&
      canReadAccount(_q,a.id) &&
      mayRevealMailboxAddress({
        emailAddress: a.emailAddress,
        ownerId: accountOwners.get(a.id),
        userId: identity(_q).userId,
        shared: isMailboxShared(a.id, identity(_q).userId),
        search,
      }),
  );
  const visibleLive = search
    ? live.filter((account) => account.emailAddress.toLowerCase().includes(search.toLowerCase()))
    : live;
  ok(r, [...visibleLive, ...connected]);
});
app.get("/api/mail-accounts/:id", (q, r) => {
  const a = accounts.find((x) => x.id === q.params.id);
  if (!a) return fail(r, 404, "NOT_FOUND", "Account not found");
  if (!canReadAccount(q, a.id))
    return fail(r, 403, "FORBIDDEN", "Mailbox access was not granted");
  return ok(r, a);
});
app.patch("/api/mail-accounts/:id/settings", (q, r) => {
  const a = accounts.find((x) => x.id === q.params.id);
  if(a&&accountOwners.get(a.id)!==identity(q).userId)return fail(r,403,"READ_ONLY_SHARE","Shared mailboxes are read only");
  return a
    ? ok(r, { ...a, settings: q.body })
    : fail(r, 404, "NOT_FOUND", "Account not found");
});
app.delete("/api/mail-accounts/:id", async (q, r) => {
  if (q.params.id === "microsoft-live")
    return fail(
      r,
      400,
      "MANAGED_ACCOUNT",
      "This server-managed mailbox cannot be removed here",
    );
  const i = accounts.findIndex((x) => x.id === q.params.id);
  if (i < 0) return fail(r, 404, "NOT_FOUND", "Account not found");
  if (
    accountOwners.get(q.params.id) !== identity(q).userId &&
    identity(q).role !== "admin"
  )
    return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
  const account = accounts[i];
  if (account.id.startsWith("gmail-imap:"))
    gmailAppPasswords.remove(account.id.slice("gmail-imap:".length));
  else if (account.id.startsWith("microsoft-token:"))
    microsoftTokens.remove(account.id.slice("microsoft-token:".length));
  else if (account.id.startsWith("mailtm:")) {
    try {
      await mailTm.remove(account.id.replace(/^mailtm:/, ""));
    } catch {
      // The local connection should still be removable if the provider expired it.
    }
  } else removeOAuthCredential(account.id);
  accounts.splice(i, 1);
  accountOwners.delete(q.params.id);
  mailboxShares.delete(q.params.id);
  await deleteMailbox(q.params.id);
  return ok(r, { deleted: true });
});
app.post("/api/mail-accounts/:id/sync", async (q, r) => {
  const a = accounts.find((x) => x.id === q.params.id);
  if (!a) return fail(r, 404, "NOT_FOUND", "Account not found");
  if(accountOwners.get(a.id)!==identity(q).userId)return fail(r,403,"READ_ONLY_SHARE","Shared mailboxes are read only");
  a.status = "syncing";
  setTimeout(() => {
    a.status = "connected";
    a.lastSyncedAt = new Date().toISOString();
  }, 500);
  return ok(r, { jobId: crypto.randomUUID(), status: "queued" });
});
app.post("/api/mail-accounts/sync-all", (q, r) =>
  ok(r, {
    jobs: accounts
      .filter((account) => accountOwners.get(account.id) === identity(q).userId)
      .map((account) => ({ accountId: account.id, status: "queued" })),
  }),
);
app.get("/api/messages", async (q, r) => {
  const account = String(q.query.accountId ?? "");
  if (account.startsWith("gmail-imap:")) {
    if (!canReadAccount(q,account)) return fail(r, 403, "FORBIDDEN", "Mailbox access was not granted");
    try { const list = await gmailAppPasswords.list(account.slice("gmail-imap:".length)); return ok(r, { items: list, total: list.length }); }
    catch (e) { return fail(r, 502, "GMAIL_IMAP_ERROR", e instanceof Error ? e.message : "Could not read Gmail inbox"); }
  }
  if (account.startsWith("gmail-")) {
    if (!canReadAccount(q,account))
      return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
    try {
      const list = filterLoadedMessages(q, await gmail.list(account));
      return ok(r, { items: list, total: list.length });
    } catch (e) {
      return fail(
        r,
        502,
        "GMAIL_ERROR",
        e instanceof Error ? e.message : "Could not read Gmail inbox",
      );
    }
  }
  if (account.startsWith("microsoft-token:")) {
    if (!canReadAccount(q,account))
      return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
    try {
      const list = filterLoadedMessages(
        q,
        await microsoftTokens.list(account.slice("microsoft-token:".length)),
      );
      return ok(r, { items: list, total: list.length });
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_GRAPH_ERROR",
        e instanceof Error ? e.message : "Could not read Microsoft inbox",
      );
    }
  }
  if (account.startsWith("microsoft-") && !account.startsWith("microsoft-token:") && account !== "microsoft-live") {
    if (!canReadAccount(q, account))
      return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
    try {
      const list = filterLoadedMessages(q, await microsoftGraph.list(account));
      return ok(r, { items: list, total: list.length });
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_GRAPH_ERROR",
        e instanceof Error ? e.message : "Could not read Microsoft inbox via Graph API",
      );
    }
  }
  if (account.startsWith("mailtm:")) {
    if (!canReadAccount(q,account))
      return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
    try {
      const list = filterLoadedMessages(q, await mailTm.list(account.slice("mailtm:".length)));
      return ok(r, { items: list, total: list.length });
    } catch (e) {
      return fail(
        r,
        502,
        "TEMP_PROVIDER_ERROR",
        e instanceof Error ? e.message : "Could not read temp inbox",
      );
    }
  }
  if (
    (account === "microsoft-live" && ownsSeed(q)) ||
    (!account &&
      legacyMicrosoftSeedEnabled &&
      Boolean(process.env.MICROSOFT_SEED_REFRESH_TOKEN) &&
      ownsSeed(q))
  ) {
    try {
      if (q.query.refresh === "1") clearMicrosoftCache();
      const list = filterLoadedMessages(q, await listMicrosoftInbox(10));
      return ok(r, { items: list, total: list.length });
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_IMAP_ERROR",
        e instanceof Error ? e.message : "Could not read Outlook inbox",
      );
    }
  }
  let list: typeof messages = [];
  if (account) list = list.filter((m) => m.accountId === account);
  if (q.query.starred === "true") list = list.filter((m) => m.isStarred);
  if (q.query.read === "false") list = list.filter((m) => !m.isRead);
  const search = String(q.query.q ?? "").toLowerCase();
  if (search)
    list = list.filter((m) =>
      (m.subject + m.preview + m.from.address)
        .toLowerCase()
        .includes(search.replace(/^(from:|subject:)/, "")),
    );
  const limit = Math.min(Number(q.query.limit) || 25, 100);
  const offset = Number(q.query.cursor) || 0;
  return ok(r, {
    items: list.slice(offset, offset + limit),
    nextCursor:
      offset + limit < list.length ? String(offset + limit) : undefined,
    total: list.length,
  });
});
app.get("/api/messages/:id", async (q, r) => {
  if (q.params.id.startsWith("gmail-imap-message:")) {
    const [, connectionId, uid] = q.params.id.split(":"); const accountId = `gmail-imap:${connectionId}`;
    if (!canReadAccount(q,accountId)) return fail(r, 403, "FORBIDDEN", "Mailbox access was not granted");
    try { return ok(r, await gmailAppPasswords.get(connectionId, Number(uid))); }
    catch (e) { return fail(r, 502, "GMAIL_IMAP_ERROR", e instanceof Error ? e.message : "Could not read Gmail message"); }
  }
  if (q.params.id.startsWith("gmail-live:")) {
    try {
      const [, accountId, messageId] = q.params.id.split(":");
      if (!canReadAccount(q,accountId))
        return fail(
          r,
          403,
          "FORBIDDEN",
          "Message does not belong to this user",
        );
      return ok(r, await gmail.get(accountId, messageId));
    } catch (e) {
      return fail(
        r,
        502,
        "GMAIL_ERROR",
        e instanceof Error ? e.message : "Could not read Gmail message",
      );
    }
  }
  if (q.params.id.startsWith("microsoft-token:")) {
    try {
      const [, connectionId, uid] = q.params.id.split(":");
      const accountId = `microsoft-token:${connectionId}`;
      if (!canReadAccount(q,accountId))
        return fail(
          r,
          403,
          "FORBIDDEN",
          "Message does not belong to this user",
        );
      return ok(r, await microsoftTokens.get(connectionId, uid));
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_GRAPH_ERROR",
        e instanceof Error ? e.message : "Could not read Microsoft message",
      );
    }
  }
  if (q.params.id.startsWith("mailtm:")) {
    try {
      const [, accountId, messageId] = q.params.id.split(":");
      if (!canReadAccount(q,`mailtm:${accountId}`))
        return fail(
          r,
          403,
          "FORBIDDEN",
          "Message does not belong to this user",
        );
      return ok(r, await mailTm.get(accountId, messageId));
    } catch (e) {
      return fail(
        r,
        502,
        "TEMP_PROVIDER_ERROR",
        e instanceof Error ? e.message : "Could not read temp message",
      );
    }
  }
  if (q.params.id.startsWith("microsoft-graph-message:")) {
    try {
      const [, accountId, messageId] = q.params.id.split(":");
      if (!canReadAccount(q, accountId))
        return fail(
          r,
          403,
          "FORBIDDEN",
          "Message does not belong to this user",
        );
      return ok(r, await microsoftGraph.get(accountId, messageId));
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_GRAPH_ERROR",
        e instanceof Error ? e.message : "Could not read Microsoft message",
      );
    }
  }
  if (q.params.id.startsWith("microsoft-live:")) {
    try {
      if (!ownsSeed(q))
        return fail(r, 403, "FORBIDDEN", "Mailbox access was not granted");
      return ok(r, await getMicrosoftMessage(q.params.id));
    } catch (e) {
      return fail(
        r,
        502,
        "MICROSOFT_IMAP_ERROR",
        e instanceof Error ? e.message : "Could not read Outlook message",
      );
    }
  }
  const m = messages.find((x) => x.id === q.params.id);
  if (!m) return fail(r, 404, "NOT_FOUND", "Message not found");
  if (!canReadAccount(q, m.accountId))
    return fail(r, 403, "FORBIDDEN", "Message access was not granted");
  return ok(r, m);
});
app.patch("/api/messages/:id", (q, r) => {
  const schema = z.object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
    labelIds: z.array(z.string()).optional(),
  });
  const p = schema.safeParse(q.body);
  if (!p.success)
    return fail(r, 400, "VALIDATION_ERROR", "Invalid message update");
  const m = messages.find((x) => x.id === q.params.id);
  if (!m) return fail(r, 404, "NOT_FOUND", "Message not found");
  if(accountOwners.get(m.accountId)!==identity(q).userId)return fail(r,403,"READ_ONLY_SHARE","Shared messages are read only");
  Object.assign(m, p.data);
  return ok(r, m);
});
app.delete("/api/messages/:id", async (q, r) => {
  const accountId = accountIdForMessage(q.params.id);
  const allowed = accountId === "microsoft-live" ? ownsSeed(q) : Boolean(accountId && canReadAccount(q, accountId));
  if (!allowed) return fail(r, 403, "FORBIDDEN", "Message access was not granted");
  const hiddenCount = hiddenMessages.add(identity(q).userId, q.params.id);
  await saveHiddenMessage(identity(q).userId, q.params.id);
  return ok(r, {
    hidden: true,
    hiddenCount,
  });
});
app.get("/api/temp-mail/domains", async (_q, r) => {
  try {
    return ok(r, await mailTm.domains());
  } catch (e) {
    return fail(
      r,
      502,
      "TEMP_PROVIDER_ERROR",
      e instanceof Error ? e.message : "Could not reach mail.tm",
    );
  }
});
app.post("/api/temp-mail/accounts", async (q, r) => {
  const parsed = z
    .object({
      localPart: z.string().regex(/^[a-z0-9._-]{1,64}$/i),
      domain: z.string().min(3),
    })
    .safeParse(q.body);
  if (!parsed.success)
    return fail(
      r,
      400,
      "VALIDATION_ERROR",
      "Choose a valid mailbox name and domain",
    );
  try {
    const remote = await mailTm.create(
      parsed.data.localPart,
      parsed.data.domain,
    );
    const a = {
      id: `mailtm:${remote.id}`,
      provider: "temp" as const,
      emailAddress: remote.address,
      displayName: "mail.tm inbox",
      status: "connected" as const,
      unreadCount: 0,
      lastSyncedAt: new Date().toISOString(),
      color: "#8b5cf6",
    };
    accounts.push(a);
    accountOwners.set(a.id, identity(q).userId);
    await saveMailbox(a, identity(q).userId, "mailtm", mailTm.credential(remote.id)!);
    return ok(r, { ...a, providerAccountId: remote.id });
  } catch (e) {
    return fail(
      r,
      502,
      "TEMP_PROVIDER_ERROR",
      e instanceof Error ? e.message : "Could not create mailbox",
    );
  }
});
app.post("/api/mail-accounts/microsoft/refresh-token", async (q, r) => {
  const parsed = z
    .object({
      email: z.string().trim().email(),
      clientId: z.string().trim().uuid().optional(),
      refreshToken: z.string().trim().min(40),
    })
    .safeParse(q.body);
  if (!parsed.success)
    return fail(
      r,
      400,
      "VALIDATION_ERROR",
      "Email, Client ID or refresh token is invalid",
    );
  try {
    const remote = await microsoftTokens.connect({
      email: parsed.data.email,
      clientId: parsed.data.clientId ?? process.env.MICROSOFT_CLIENT_ID ?? "",
      refreshToken: parsed.data.refreshToken,
    });
    const a = {
      id: `microsoft-token:${remote.id}`,
      provider: "microsoft" as const,
      emailAddress: remote.email,
      displayName: "Microsoft Graph (refresh token)",
      status: "connected" as const,
      unreadCount: 0,
      lastSyncedAt: new Date().toISOString(),
      color: "#2563eb",
    };
    accounts.push(a);
    accountOwners.set(a.id, identity(q).userId);
    await saveMailbox(a, identity(q).userId, "microsoft-refresh-token", { email: parsed.data.email, clientId: parsed.data.clientId ?? process.env.MICROSOFT_CLIENT_ID ?? "", refreshToken: parsed.data.refreshToken });
    return ok(r, a);
  } catch (e) {
    return fail(
      r,
      401,
      "MICROSOFT_TOKEN_INVALID",
      e instanceof Error ? e.message : "Microsoft connection failed",
    );
  }
});
app.post("/api/mail-accounts/google/app-password", async (q, r) => {
  const parsed = z.object({ email: z.string().trim().email(), appPassword: z.string().transform((value)=>value.replace(/\s/g," ").replace(/ /g,"")).refine((value)=>value.length===16) }).safeParse(q.body);
  if (!parsed.success) return fail(r, 400, "INVALID_INPUT", "Mã App Password phải có đúng 16 ký tự, không tính dấu cách");
  try {
    const connected = await gmailAppPasswords.connect(parsed.data);
    const account = { id: `gmail-imap:${connected.id}`, provider: "gmail" as const, emailAddress: connected.email, displayName: "Gmail (App Password)", status: "connected" as const, unreadCount: 0, lastSyncedAt: new Date().toISOString(), color: "#ef4444" };
    accounts.push(account); accountOwners.set(account.id, identity(q).userId); await saveMailbox(account, identity(q).userId, "gmail-app-password", { email: parsed.data.email, appPassword: parsed.data.appPassword }); return ok(r, account);
  } catch { return fail(r, 401, "GMAIL_AUTH_FAILED", "Google từ chối đăng nhập. Hãy kiểm tra đúng email tạo mã, bật xác minh 2 bước và tạo App Password mới (không dùng mật khẩu Gmail hoặc mã OTP)"); }
});
app.post("/api/mail-accounts/microsoft/refresh-token/batch", async (q, r) => {
  const item = z.object({
    email: z.string().trim().email(),
    clientId: z.string().trim().uuid().optional(),
    refreshToken: z.string().trim().min(40),
  });
  const parsed = z
    .object({ items: z.array(item).min(1).max(10) })
    .safeParse(q.body);
  if (!parsed.success)
    return fail(
      r,
      400,
      "VALIDATION_ERROR",
      "Provide between 1 and 10 valid Microsoft accounts",
    );
  const results: Array<{ email: string; success: boolean; error?: string }> =
    [];
  for (const input of parsed.data.items) {
    try {
      const remote = await microsoftTokens.connect({
        email: input.email,
        clientId: input.clientId ?? process.env.MICROSOFT_CLIENT_ID ?? "",
        refreshToken: input.refreshToken,
      });
      const a = {
        id: `microsoft-token:${remote.id}`,
        provider: "microsoft" as const,
        emailAddress: remote.email,
        displayName: "Microsoft Graph (bulk import)",
        status: "connected" as const,
        unreadCount: 0,
        lastSyncedAt: new Date().toISOString(),
        color: "#2563eb",
      };
      accounts.push(a);
      accountOwners.set(a.id, identity(q).userId);
      await saveMailbox(a, identity(q).userId, "microsoft-refresh-token", { email: input.email, clientId: input.clientId ?? process.env.MICROSOFT_CLIENT_ID ?? "", refreshToken: input.refreshToken });
      results.push({ email: input.email, success: true });
    } catch (e) {
      results.push({
        email: input.email,
        success: false,
        error: e instanceof Error ? e.message : "Connection failed",
      });
    }
  }
  return ok(r, {
    results,
    connected: results.filter((x) => x.success).length,
    failed: results.filter((x) => !x.success).length,
  });
});
app.get("/api/temp-mail/accounts/:id/messages", async (q, r) => {
  if (accountOwners.get(q.params.id) !== identity(q).userId)
    return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
  try {
    return ok(r, await mailTm.list(q.params.id.replace(/^mailtm:/, "")));
  } catch (e) {
    return fail(
      r,
      502,
      "TEMP_PROVIDER_ERROR",
      e instanceof Error ? e.message : "Could not read temp inbox",
    );
  }
});
app.delete("/api/temp-mail/accounts/:id", async (q, r) => {
  if (accountOwners.get(q.params.id) !== identity(q).userId)
    return fail(r, 403, "FORBIDDEN", "Mailbox does not belong to this user");
  const i = accounts.findIndex(
    (a) => a.id === q.params.id && a.provider === "temp",
  );
  try {
    await mailTm.remove(q.params.id.replace(/^mailtm:/, ""));
  } catch {
    /* local cleanup still applies */
  }
  if (i >= 0) accounts.splice(i, 1);
  accountOwners.delete(q.params.id);
  await deleteMailbox(q.params.id);
  return ok(r, { deleted: i >= 0 });
});
app.get("/api/oauth/google/start", oauth.googleStart);
app.get("/api/oauth/microsoft/start", oauth.microsoftStart);
app.use((q, r) =>
  fail(r, 404, "ROUTE_NOT_FOUND", `No route for ${q.method} ${q.path}`),
);
