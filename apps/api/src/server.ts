import "dotenv/config";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { getAuth } from "firebase-admin/auth";
import { app } from "./app.js";
import { listMicrosoftInbox } from "./microsoft-imap.js";
import { accounts } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { gmailAppPasswords } from "./gmail-app-password.js";
import { microsoftTokens } from "./microsoft-token-accounts.js";
import { mailTm } from "./mail-tm.js";
import { restoreOAuthCredential } from "./oauth.js";
import { mailboxShares, restoreMailboxShare } from "./sharing.js";
import { restoreMessageShare } from "./message-sharing.js";
import { setUpgradeRequest } from "./upgrade-requests.js";
import { hiddenMessages } from "./hidden-messages.js";
import { authConfigured, userDirectory } from "./auth.js";
import { loadHiddenMessageIds, loadMailboxes, loadMailboxShares, loadMessageShares, loadUpgradeRequests, loadUserProfiles, persistentStoreEnabled } from "./firestore-store.js";
import { onMailboxSyncUpdate, startMailboxSyncScheduler } from "./sync-jobs.js";

const port = Number(process.env.PORT ?? 4000);
const server = createServer(app);
const configuredSocketOrigins = (process.env.SOCKET_CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const io = new Server(server, {
  cors: {
    origin(origin, callback) {
      const localDevelopmentOrigin =
        process.env.NODE_ENV !== "production" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
      callback(
        origin && !configuredSocketOrigins.includes(origin) && !localDevelopmentOrigin
          ? new Error("Origin is not allowed")
          : null,
        true,
      );
    },
  },
});
io.use(async (socket, next) => {
  if (!authConfigured) {
    socket.data.userId = "local-user";
    return next();
  }
  const authToken = typeof socket.handshake.auth?.token === "string"
    ? socket.handshake.auth.token
    : socket.handshake.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!authToken) return next(new Error("Authentication required"));
  try {
    const decoded = await getAuth().verifyIdToken(authToken);
    socket.data.userId = decoded.uid;
    return next();
  } catch {
    return next(new Error("Invalid or expired session"));
  }
});
io.on("connection", (socket) => socket.join(`user:${String(socket.data.userId)}`));
onMailboxSyncUpdate((job) => {
  const viewers = new Set([job.ownerId, ...(mailboxShares.get(job.accountId) ?? [])]);
  for (const userId of viewers) io.to(`user:${userId}`).emit("mailbox:sync", {
    id: job.id,
    accountId: job.accountId,
    status: job.status,
    requestedAt: job.requestedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    messageCount: job.messageCount,
    unreadCount: job.unreadCount,
    error: job.error,
  });
});
async function restorePersistentState() {
  if (!persistentStoreEnabled) return;
  const [mailboxes, shares, users, hidden, savedMessageShares, savedUpgradeRequests] = await Promise.all([
    loadMailboxes(),
    loadMailboxShares(),
    loadUserProfiles(),
    loadHiddenMessageIds(),
    loadMessageShares(),
    loadUpgradeRequests(),
  ]);
  for (const user of users) userDirectory.set(user.userId, { email: user.email, displayName: user.displayName, lastSeenAt: user.lastSeenAt, role: user.role });
  for (const saved of mailboxes) {
    if (!accounts.some((account) => account.id === saved.account.id)) accounts.push(saved.account);
    accountOwners.set(saved.account.id, saved.userId);
    const id = saved.account.id;
    if (saved.credentialKind === "oauth") restoreOAuthCredential(id, saved.credential);
    else if (saved.credentialKind === "gmail-app-password") gmailAppPasswords.restore(id.replace(/^gmail-imap:/, ""), saved.credential as { email: string; appPassword: string });
    else if (saved.credentialKind === "microsoft-refresh-token") microsoftTokens.restore(id.replace(/^microsoft-token:/, ""), saved.credential as { email: string; clientId: string; refreshToken: string });
    else if (saved.credentialKind === "mailtm") mailTm.restore(id.replace(/^mailtm:/, ""), saved.credential as { token: string; address: string; providerId: string });
  }
  for (const share of shares) restoreMailboxShare(share.accountId, share.userId);
  for (const record of hidden) hiddenMessages.restore(record.userId, record.messageId);
  for (const share of savedMessageShares) restoreMessageShare(share);
  for (const request of savedUpgradeRequests) setUpgradeRequest(request.userId, request.requestedAt);
}

void restorePersistentState()
  .then(() => {
    server.listen(port, () => {
      console.log(`OmniMail API ready at http://localhost:${port}`);
      startMailboxSyncScheduler();
      if (process.env.ENABLE_LEGACY_MICROSOFT_SEED === "true" && process.env.MICROSOFT_SEED_REFRESH_TOKEN)
        void listMicrosoftInbox(30).catch(() => undefined);
    });
  })
  .catch((error) => {
    console.error("Could not restore Firestore mailbox state", error);
    process.exitCode = 1;
  });
