import type {
  MailAccount,
  MailMessage,
  PaginatedMessages,
} from "@omnimail/shared";
import { auth } from "./firebase";
const base = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await auth.currentUser?.getIdToken();
  const r = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token
        ? { Authorization: `Bearer ${token}` }
        : { Authorization: "Bearer local-session" }),
      ...init?.headers,
    },
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message ?? "Request failed");
  return j.data;
}
export const api = {
  registrationPolicy: (email: string) =>
    request<{ allowed: true }>("/api/auth/registration-policy", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  accounts: (search = "") =>
    request<MailAccount[]>(`/api/mail-accounts${search ? `?q=${encodeURIComponent(search)}` : ""}`),
  messages: (q = "") => request<PaginatedMessages>(`/api/messages${q}`),
  message: (id: string) =>
    request<MailMessage>(`/api/messages/${encodeURIComponent(id)}`),
  patchMessage: (id: string, p: Partial<MailMessage>) =>
    request<MailMessage>(`/api/messages/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(p),
    }),
  syncAll: () => request("/api/mail-accounts/sync-all", { method: "POST" }),
  tempDomains: () =>
    request<{ id: string; name: string; ready: boolean }[]>(
      "/api/temp-mail/domains",
    ),
  createTemp: (p: { localPart: string; domain: string }) =>
    request<MailAccount>("/api/temp-mail/accounts", {
      method: "POST",
      body: JSON.stringify(p),
    }),
  me: () => request<{ userId: string; email?: string; displayName?: string; role: "basic" | "premium" | "admin" }>("/api/me"),
  updateMe: (displayName: string) => request<{ userId: string; email: string; displayName: string; role: "basic" | "premium" | "admin" }>("/api/me", { method: "PATCH", body: JSON.stringify({ displayName }) }),
  admin: () =>
    request<{
      users: number;
      connectedAccounts: number;
      serviceStatus: string;
      directory: { userId: string; email: string; displayName?: string; role:"basic"|"premium"|"admin"; lastSeenAt?: string; accounts: MailAccount[]; sharedAccountIds:string[] }[];
    }>("/api/admin/overview"),
  setUserRole:(userId:string,role:"basic"|"premium")=>request(`/api/admin/users/${encodeURIComponent(userId)}/role`,{method:"PATCH",body:JSON.stringify({role})}),
  setMailboxShare:(accountId:string,userId:string,allowed:boolean)=>request('/api/admin/mailbox-shares',{method:'PUT',body:JSON.stringify({accountId,userId,allowed})}),
  mailboxShares: () => request<{
    mailboxes: { account: MailAccount; recipients: { userId: string; email: string; role: "basic" | "premium" | "admin" }[] }[];
    sharedWithMe: { account: MailAccount; ownerEmail: string }[];
  }>("/api/mailbox-shares"),
  shareMailbox: (accountId: string, email: string, allowed: boolean) => request<{
    accountId: string; userId: string; email: string; allowed: boolean;
  }>("/api/mailbox-shares", { method: "PUT", body: JSON.stringify({ accountId, email, allowed }) }),
  oauthStart: (provider: "google" | "microsoft") =>
    request<{ url: string }>(`/api/oauth/${provider}/start`),
  connectMicrosoftToken: (input: {
    email: string;
    clientId?: string;
    refreshToken: string;
  }) =>
    request<MailAccount>("/api/mail-accounts/microsoft/refresh-token", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  connectGmailAppPassword: (input: { email: string; appPassword: string }) =>
    request<MailAccount>("/api/mail-accounts/google/app-password", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  connectMicrosoftBatch: (
    items: { email: string; clientId?: string; refreshToken: string }[],
  ) =>
    request<{
      connected: number;
      failed: number;
      results: { email: string; success: boolean; error?: string }[];
    }>("/api/mail-accounts/microsoft/refresh-token/batch", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  deleteAccount: (id: string) =>
    request<{ deleted: boolean }>(`/api/mail-accounts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
