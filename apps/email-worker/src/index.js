import PostalMime from "postal-mime";

const DOMAIN = "omnimail.io.vn";
const AUDIENCE = "omnimail-temp-gateway";
const MAX_RAW_BYTES = 2 * 1024 * 1024;
const MAX_BODY_CHARS = 200_000;
const MAX_MESSAGES = 30;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const schema = [
  "CREATE TABLE IF NOT EXISTS inboxes (id TEXT PRIMARY KEY, address TEXT NOT NULL UNIQUE, owner TEXT NOT NULL, created_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1)",
  "CREATE TABLE IF NOT EXISTS emails (id TEXT PRIMARY KEY, inbox_id TEXT NOT NULL REFERENCES inboxes(id), received_at TEXT NOT NULL, summary TEXT NOT NULL, detail TEXT NOT NULL)",
  "CREATE INDEX IF NOT EXISTS emails_inbox_received ON emails(inbox_id, received_at DESC)",
];
const initialized = new WeakSet();
let cachedKeys;
const encoder = new TextEncoder();
const json = (value, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
const decode = (value) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
const base64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function initialize(db) {
  if (initialized.has(db)) return;
  await db.batch(schema.map(sql => db.prepare(sql)));
  initialized.add(db);
}

// Verify short-lived, operation-bound signatures from the existing API identity.
// Neither browsers nor callers knowing an inbox address can read its messages.
export async function authorize(request, env, body) {
  const token = request.headers.get("authorization")?.match(/^Bearer (\S+)$/)?.[1];
  if (!token || token.length > 8192 || !env.SERVICE_ACCOUNT_EMAIL) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(decode(parts[0])));
    const claims = JSON.parse(new TextDecoder().decode(decode(parts[1])));
    const now = Math.floor(Date.now() / 1000);
    const digest = base64url(await crypto.subtle.digest("SHA-256", encoder.encode(body)));
    if (header.alg !== "RS256" || claims.iss !== env.SERVICE_ACCOUNT_EMAIL || claims.aud !== AUDIENCE ||
        typeof claims.sub !== "string" || !claims.sub || !Number.isInteger(claims.exp) || !Number.isInteger(claims.iat) ||
        claims.exp <= now || claims.iat > now + 5 || claims.exp - claims.iat > 65 || now - claims.iat > 65 ||
        claims.method !== request.method || claims.path !== new URL(request.url).pathname || claims.digest !== digest) return null;
    if (!cachedKeys || cachedKeys.expires < Date.now() || cachedKeys.email !== env.SERVICE_ACCOUNT_EMAIL) {
      const response = await fetch(`https://www.googleapis.com/service_accounts/v1/jwk/${encodeURIComponent(env.SERVICE_ACCOUNT_EMAIL)}`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error("Signing keys unavailable");
      const result = await response.json();
      cachedKeys = { email: env.SERVICE_ACCOUNT_EMAIL, keys: result.keys, expires: Date.now() + 5 * 60_000 };
    }
    for (const jwk of cachedKeys.keys) {
      if (jwk.kty !== "RSA") continue;
      const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      if (await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decode(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`))) return claims.sub;
    }
    return null;
  } catch { return null; }
}

export function messageDto(parsed, envelope, inbox, messageId, receivedAt) {
  const address = value => ({ ...(value?.name ? { name: value.name } : {}), address: value?.address ?? "" });
  const recipients = values => (values ?? []).flatMap(value => value.group ? value.group.map(address) : [address(value)]).filter(value => value.address);
  const attachments = (parsed.attachments ?? []).map((value, index) => ({ id: String(index), filename: value.filename ?? "attachment", mimeType: value.mimeType ?? "application/octet-stream", size: value.content?.byteLength ?? 0 }));
  return {
    id: `${inbox.id}:${messageId}`, accountId: inbox.id, providerMessageId: messageId,
    folderIds: ["inbox"], labelIds: [], from: parsed.from ? address(parsed.from) : { address: envelope.from },
    to: recipients(parsed.to).length ? recipients(parsed.to) : [{ address: inbox.address }], cc: recipients(parsed.cc),
    subject: (parsed.subject || "(No subject)").slice(0, 1000), preview: (parsed.text ?? "").replace(/\s+/g, " ").trim().slice(0, 250),
    textBody: parsed.text?.slice(0, MAX_BODY_CHARS), sanitizedHtmlBody: parsed.html?.slice(0, MAX_BODY_CHARS),
    isRead: false, isStarred: false, hasAttachments: attachments.length > 0, attachments, receivedAt,
  };
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (request.method === "GET" && path === "/health") {
      if (!env.DB || !env.SERVICE_ACCOUNT_EMAIL) return json({ ready: false }, 503);
      try { await initialize(env.DB); return json({ ready: true, domain: DOMAIN }); }
      catch { return json({ ready: false }, 503); }
    }
    if (Number(request.headers.get("content-length") ?? 0) > 4096) return json({ error: "Request too large" }, 413);
    const body = await request.text();
    if (body.length > 4096) return json({ error: "Request too large" }, 413);
    const ownerId = await authorize(request, env, body);
    if (!ownerId) return json({ error: "Unauthorized" }, 401);
    try {
      await initialize(env.DB);
      if (request.method === "POST" && path === "/accounts") {
        const { localPart } = JSON.parse(body);
        if (typeof localPart !== "string" || !/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(localPart) || localPart.includes("..") || ["postmaster", "abuse", "admin", "support", "noreply", "no-reply", "security", "info", "contact"].includes(localPart)) return json({ error: "Choose another mailbox name" }, 400);
        const quota = await env.DB.prepare("SELECT COUNT(*) AS count FROM inboxes WHERE owner = ? AND active = 1").bind(ownerId).first();
        if (quota.count >= 20) return json({ error: "Mailbox limit reached" }, 429);
        const id = `cfmail:${crypto.randomUUID()}`;
        const address = `${localPart}@${DOMAIN}`;
        // Keep inactive addresses reserved: another user cannot claim a deleted inbox.
        await env.DB.prepare("INSERT OR IGNORE INTO inboxes(id, address, owner, created_at) VALUES (?, ?, ?, ?)").bind(id, address, ownerId, new Date().toISOString()).run();
        const created = await env.DB.prepare("SELECT id FROM inboxes WHERE id = ?").bind(id).first();
        return created ? json({ id, address }, 201) : json({ error: "Address unavailable" }, 409);
      }
      const match = path.match(/^\/accounts\/([^/]+)(?:\/messages(?:\/([^/]+))?)?$/);
      if (!match) return json({ error: "Not found" }, 404);
      const accountId = decodeURIComponent(match[1]);
      const inbox = await env.DB.prepare("SELECT id, address FROM inboxes WHERE id = ? AND owner = ? AND active = 1").bind(accountId, ownerId).first();
      if (!inbox) return json({ error: "Not found" }, 404);
      if (request.method === "DELETE" && !path.includes("/messages")) {
        await env.DB.batch([
          env.DB.prepare("UPDATE inboxes SET active = 0 WHERE id = ? AND owner = ?").bind(accountId, ownerId),
          env.DB.prepare("DELETE FROM emails WHERE inbox_id = ?").bind(accountId),
        ]);
        return json({ deleted: true });
      }
      const cutoff = new Date(Date.now() - RETENTION_MS).toISOString();
      if (request.method === "GET" && match[2]) {
        const row = await env.DB.prepare("SELECT detail FROM emails WHERE id = ? AND inbox_id = ? AND received_at >= ?").bind(decodeURIComponent(match[2]), accountId, cutoff).first();
        return row ? json(JSON.parse(row.detail)) : json({ error: "Not found" }, 404);
      }
      if (request.method === "GET" && path.endsWith("/messages")) {
        const rows = await env.DB.prepare("SELECT summary FROM emails WHERE inbox_id = ? AND received_at >= ? ORDER BY received_at DESC LIMIT ?").bind(accountId, cutoff, MAX_MESSAGES).all();
        return json(rows.results.map(row => JSON.parse(row.summary)));
      }
      return json({ error: "Not found" }, 404);
    } catch { return json({ error: "Mail storage unavailable" }, 503); }
  },

  async email(message, env) {
    if (message.rawSize > MAX_RAW_BYTES) { message.setReject("Message exceeds the 2 MiB inbox limit"); return; }
    await initialize(env.DB);
    const inbox = await env.DB.prepare("SELECT id, address FROM inboxes WHERE address = ? AND active = 1").bind(message.to.toLowerCase()).first();
    if (!inbox) { message.setReject("Mailbox does not exist"); return; }
    const raw = await new Response(message.raw).arrayBuffer();
    if (raw.byteLength > MAX_RAW_BYTES) { message.setReject("Message exceeds the 2 MiB inbox limit"); return; }
    const parsed = await PostalMime.parse(raw);
    const id = base64url(await crypto.subtle.digest("SHA-256", encoder.encode(`${inbox.id}\n${base64url(await crypto.subtle.digest("SHA-256", raw))}`)));
    const receivedAt = new Date().toISOString();
    const detail = messageDto(parsed, message, inbox, id, receivedAt);
    const { textBody, sanitizedHtmlBody, attachments, ...summary } = detail;
    // Insert only while the inbox remains active, including concurrent deletion.
    await env.DB.batch([
      env.DB.prepare("INSERT OR IGNORE INTO emails(id, inbox_id, received_at, summary, detail) SELECT ?, id, ?, ?, ? FROM inboxes WHERE id = ? AND active = 1").bind(id, receivedAt, JSON.stringify(summary), JSON.stringify(detail), inbox.id),
      env.DB.prepare("DELETE FROM emails WHERE inbox_id = ? AND id NOT IN (SELECT id FROM emails WHERE inbox_id = ? ORDER BY received_at DESC LIMIT ?)").bind(inbox.id, inbox.id, MAX_MESSAGES),
    ]);
  },

  async scheduled(_event, env) {
    await initialize(env.DB);
    await env.DB.prepare("DELETE FROM emails WHERE received_at < ?").bind(new Date(Date.now() - RETENTION_MS).toISOString()).run();
  },
};
