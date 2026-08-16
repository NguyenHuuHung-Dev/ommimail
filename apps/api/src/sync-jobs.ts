import crypto from "node:crypto";
import type { MailAccount, MailMessage, MailSyncJob } from "@omnimail/shared";
import { accounts } from "./demo-data.js";
import { gmail } from "./gmail.js";
import { gmailAppPasswords } from "./gmail-app-password.js";
import { mailTm } from "./mail-tm.js";
import { microsoftGraph } from "./microsoft-graph.js";
import { listMicrosoftInbox } from "./microsoft-imap.js";
import { microsoftTokens } from "./microsoft-token-accounts.js";
import { accountOwners } from "./ownership.js";
import { mailboxShares } from "./sharing.js";
import { updateMailboxSyncState } from "./firestore-store.js";

type InternalSyncJob = MailSyncJob & { ownerId: string };
type SyncListener = (job: InternalSyncJob) => void;

const jobs = new Map<string, InternalSyncJob>();
const pending: string[] = [];
const listeners = new Set<SyncListener>();
const messageCache = new Map<string, { messages: MailMessage[]; syncedAt: number }>();
export const syncRuntimeInfo = {
  mode: "in-process" as const,
  concurrency: Math.max(1, Math.min(5, Number(process.env.SYNC_CONCURRENCY ?? 2) || 2)),
  intervalMs: Math.max(30_000, Number(process.env.SYNC_INTERVAL_MS ?? 300_000) || 300_000),
};
const concurrency = syncRuntimeInfo.concurrency;
let activeJobs = 0;

function publicJob(job: InternalSyncJob): MailSyncJob {
  const { ownerId: _ownerId, ...result } = job;
  return result;
}

function notify(job: InternalSyncJob) {
  for (const listener of listeners) listener({ ...job });
}

async function fetchLatestMessages(account: MailAccount): Promise<MailMessage[]> {
  if (account.id.startsWith("gmail-imap:"))
    return gmailAppPasswords.list(account.id.slice("gmail-imap:".length));
  if (account.id.startsWith("gmail-")) return gmail.list(account.id);
  if (account.id.startsWith("microsoft-token:"))
    return microsoftTokens.list(account.id.slice("microsoft-token:".length));
  if (account.id === "microsoft-live") return listMicrosoftInbox(20);
  if (account.id.startsWith("microsoft-")) return microsoftGraph.list(account.id);
  if (account.id.startsWith("mailtm:"))
    return mailTm.list(account.id.slice("mailtm:".length));
  throw new Error(`No synchronizer is available for ${account.provider}`);
}

async function run(job: InternalSyncJob) {
  const account = accounts.find((candidate) => candidate.id === job.accountId);
  if (!account) throw new Error("Mailbox no longer exists");

  job.status = "running";
  job.startedAt = new Date().toISOString();
  account.status = "syncing";
  notify(job);

  try {
    const latest = await fetchLatestMessages(account);
    const completedAt = new Date().toISOString();
    const unreadCount = latest.filter((message) => !message.isRead).length;
    messageCache.set(account.id, { messages: latest, syncedAt: Date.now() });
    account.status = "connected";
    account.unreadCount = unreadCount;
    account.lastSyncedAt = completedAt;
    job.status = "completed";
    job.completedAt = completedAt;
    job.messageCount = latest.length;
    job.unreadCount = unreadCount;
    await updateMailboxSyncState(account);
  } catch (cause) {
    account.status = "error";
    job.status = "failed";
    job.completedAt = new Date().toISOString();
    job.error = cause instanceof Error ? cause.message : "Mailbox synchronization failed";
    await updateMailboxSyncState(account).catch(() => undefined);
  } finally {
    notify(job);
    const cleanup = setTimeout(() => jobs.delete(job.id), 6 * 60 * 60_000);
    cleanup.unref();
  }
}

function drain() {
  while (activeJobs < concurrency && pending.length) {
    const jobId = pending.shift();
    const job = jobId ? jobs.get(jobId) : undefined;
    if (!job || job.status !== "queued") continue;
    activeJobs += 1;
    void run(job).finally(() => {
      activeJobs -= 1;
      drain();
    });
  }
}

export function enqueueMailboxSync(
  accountId: string,
  ownerId: string,
  options: { priority?: boolean } = {},
): MailSyncJob {
  const account = accounts.find((candidate) => candidate.id === accountId);
  if (!account || accountOwners.get(accountId) !== ownerId)
    throw new Error("Only the mailbox owner can queue synchronization");
  const existing = [...jobs.values()].find(
    (job) =>
      job.accountId === accountId &&
      job.ownerId === ownerId &&
      (job.status === "queued" || job.status === "running"),
  );
  if (existing) return publicJob(existing);

  const job: InternalSyncJob = {
    id: crypto.randomUUID(),
    accountId,
    ownerId,
    status: "queued",
    requestedAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  if (options.priority) pending.unshift(job.id);
  else pending.push(job.id);
  notify(job);
  queueMicrotask(drain);
  return publicJob(job);
}

export function getMailboxSyncJob(jobId: string, ownerId: string) {
  const job = jobs.get(jobId);
  return job?.ownerId === ownerId ? publicJob(job) : undefined;
}

export function getCachedMailboxMessages(accountId: string, maxAgeMs = 30_000) {
  const cached = messageCache.get(accountId);
  if (!cached || Date.now() - cached.syncedAt > maxAgeMs) return undefined;
  return cached.messages;
}

export function clearMailboxSyncState(accountId: string) {
  messageCache.delete(accountId);
}

export function onMailboxSyncUpdate(listener: SyncListener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function enqueueScheduledMailboxSyncs() {
  for (const account of accounts) {
    const ownerId = accountOwners.get(account.id);
    if (!ownerId) continue;
    enqueueMailboxSync(account.id, ownerId, {
      priority: Boolean(mailboxShares.get(account.id)?.size),
    });
  }
}

export function startMailboxSyncScheduler() {
  const intervalMs = syncRuntimeInfo.intervalMs;
  const initial = setTimeout(enqueueScheduledMailboxSyncs, Math.min(30_000, intervalMs));
  const timer = setInterval(enqueueScheduledMailboxSyncs, intervalMs);
  initial.unref();
  timer.unref();
  return () => {
    clearTimeout(initial);
    clearInterval(timer);
  };
}
