import { getAuth, type UserRecord } from "firebase-admin/auth";
import type { AdminOverview, AdminUser } from "@omnimail/shared";
import {
  resolveUserRole,
  roleOverrides,
  serviceAccountConfigured,
  userDirectory,
} from "./auth.js";
import { accounts, messages } from "./demo-data.js";
import { accountOwners } from "./ownership.js";
import { mailboxShares } from "./sharing.js";
import { messageShares } from "./message-sharing.js";
import { upgradeRequests } from "./upgrade-requests.js";
import { hiddenMessages } from "./hidden-messages.js";
import {
  deleteUserData,
  saveMailboxShare,
  saveUpgradeRequest,
  saveUserProfile,
} from "./firestore-store.js";
import { disconnectMailbox } from "./mailbox-lifecycle.js";
import { notifyUserAccessChanged } from "./user-access-events.js";

export class UserManagementError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const busyUsers = new Set<string>();
const iso = (value?: string) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString()
    : undefined;

function directoryEntry(user: UserRecord): AdminUser {
  const profile = userDirectory.get(user.uid);
  return {
    userId: user.uid,
    email: user.email ?? "",
    displayName: user.displayName || profile?.displayName,
    role: resolveUserRole(user.uid, user.email, user.customClaims),
    disabled: user.disabled,
    emailVerified: user.emailVerified,
    createdAt: iso(user.metadata.creationTime),
    lastSignInAt: iso(user.metadata.lastSignInTime),
    lastSeenAt: profile?.lastSeenAt,
    providers: user.providerData.map((provider) => provider.providerId),
    upgradeRequestedAt: upgradeRequests.get(user.uid),
    accounts: accounts.filter(
      (account) => accountOwners.get(account.id) === user.uid,
    ),
    sharedAccountIds: accounts
      .filter((account) => mailboxShares.get(account.id)?.has(user.uid))
      .map((account) => account.id),
  };
}

export async function adminOverview(
  currentUserId: string,
): Promise<AdminOverview> {
  const directory: AdminUser[] = [];
  if (serviceAccountConfigured) {
    let pageToken: string | undefined;
    do {
      const page = await getAuth().listUsers(1000, pageToken);
      directory.push(...page.users.map(directoryEntry));
      pageToken = page.pageToken;
    } while (pageToken);
  } else {
    for (const [userId, user] of userDirectory)
      directory.push({
        ...user,
        userId,
        disabled: false,
        emailVerified: true,
        providers: [],
        upgradeRequestedAt: upgradeRequests.get(userId),
        accounts: accounts.filter(
          (account) => accountOwners.get(account.id) === userId,
        ),
        sharedAccountIds: accounts
          .filter((account) => mailboxShares.get(account.id)?.has(userId))
          .map((account) => account.id),
      });
  }
  directory.sort(
    (a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? "") ||
      a.email.localeCompare(b.email),
  );
  return {
    currentUserId,
    users: directory.length,
    connectedAccounts: accounts.filter((account) =>
      accountOwners.has(account.id),
    ).length,
    serviceStatus: "healthy",
    directory,
  };
}

async function manage<T>(
  actorId: string,
  userId: string,
  action: (user: UserRecord) => Promise<T>,
) {
  if (actorId === userId)
    throw new UserManagementError(
      403,
      "SELF_ACTION_FORBIDDEN",
      "Bạn không thể khóa, xóa hoặc thay đổi quyền của chính mình.",
    );
  if (!serviceAccountConfigured)
    throw new UserManagementError(
      503,
      "ADMIN_AUTH_NOT_CONFIGURED",
      "Chức năng này cần kết nối Firebase Admin.",
    );
  if (busyUsers.has(userId))
    throw new UserManagementError(
      409,
      "USER_BUSY",
      "Tài khoản đang được cập nhật. Hãy đợi một chút.",
    );
  busyUsers.add(userId);
  try {
    const user = await getAuth().getUser(userId);
    if (resolveUserRole(user.uid, user.email, user.customClaims) === "admin")
      throw new UserManagementError(
        403,
        "ADMIN_PROTECTED",
        "Tài khoản quản trị được bảo vệ khỏi thao tác này.",
      );
    return await action(user);
  } finally {
    busyUsers.delete(userId);
  }
}

export function setManagedUserDisabled(
  actorId: string,
  userId: string,
  disabled: boolean,
) {
  return manage(actorId, userId, async () => {
    await getAuth().updateUser(userId, { disabled });
    if (disabled) {
      notifyUserAccessChanged({ userId, reason: "disabled" });
      await getAuth().revokeRefreshTokens(userId);
    }
    return { userId, disabled };
  });
}

export function setManagedUserRole(
  actorId: string,
  userId: string,
  role: "basic" | "premium",
) {
  return manage(actorId, userId, async (user) => {
    await getAuth().setCustomUserClaims(userId, { ...user.customClaims, role });
    roleOverrides.set(userId, role);
    const profile = {
      email: user.email ?? "",
      displayName: user.displayName,
      lastSeenAt:
        userDirectory.get(userId)?.lastSeenAt ??
        iso(user.metadata.lastSignInTime) ??
        "",
      role,
    };
    userDirectory.set(userId, profile);
    await saveUserProfile({ userId, ...profile });
    if (role === "premium") {
      upgradeRequests.delete(userId);
      await saveUpgradeRequest(userId);
    }
    if (role === "basic") {
      for (const [accountId, viewers] of mailboxShares) {
        if (viewers.has(userId)) {
          await saveMailboxShare(accountId, userId, false);
          viewers.delete(userId);
        }
        if (!viewers.size) mailboxShares.delete(accountId);
      }
    }
    // Close rooms subscribed with the previous role, including shared inboxes.
    notifyUserAccessChanged({ userId, reason: "role-changed" });
    await getAuth().revokeRefreshTokens(userId);
    return { userId, role };
  });
}

export function deleteManagedUser(
  actorId: string,
  userId: string,
  confirmation: string,
) {
  return manage(actorId, userId, async (user) => {
    if (
      (user.email || user.uid).toLowerCase() !==
      confirmation.trim().toLowerCase()
    )
      throw new UserManagementError(
        400,
        "CONFIRMATION_MISMATCH",
        "Email xác nhận không khớp với tài khoản cần xóa.",
      );
    // Keep access disabled if any cleanup step fails, so the operation can be
    // retried without leaving a partially deleted account active.
    await getAuth().updateUser(userId, { disabled: true });
    notifyUserAccessChanged({ userId, reason: "deleted" });
    await getAuth().revokeRefreshTokens(userId);
    const ownedIds = [...accountOwners]
      .filter(([, ownerId]) => ownerId === userId)
      .map(([id]) => id);
    for (const accountId of ownedIds) await disconnectMailbox(accountId);
    await deleteUserData(userId);
    await getAuth().deleteUser(userId);
    for (const [accountId, viewers] of mailboxShares) {
      viewers.delete(userId);
      if (!viewers.size) mailboxShares.delete(accountId);
    }
    for (const [id, share] of messageShares)
      if (
        share.owner.userId === userId ||
        share.recipient.userId === userId ||
        ownedIds.includes(share.message.accountId)
      )
        messageShares.delete(id);
    for (let index = messages.length - 1; index >= 0; index--)
      if (ownedIds.includes(messages[index].accountId))
        messages.splice(index, 1);
    hiddenMessages.removeUser(userId);
    userDirectory.delete(userId);
    roleOverrides.delete(userId);
    upgradeRequests.delete(userId);
    return {
      userId,
      deleted: true as const,
      removedMailboxes: ownedIds.length,
    };
  });
}
