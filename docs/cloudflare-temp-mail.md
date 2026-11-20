# Cloudflare domain inboxes

`@omnimail.io.vn` is an additional Temp Mail provider. The browser uses the same
authenticated API, mailbox ownership checks and message reader as mail.tm.

## Deployment

1. Create a Cloudflare D1 database named `omnimail-temp-mail`.
2. Build `pnpm --filter @omnimail/email-worker build` and deploy
   `apps/email-worker/dist/index.js` as `omnimail-temp-mail`.
3. Bind that database as `DB`. Set the Worker's non-secret
   `SERVICE_ACCOUNT_EMAIL` to the API's existing `FIREBASE_CLIENT_EMAIL`.
   Schema is initialized on the first health check/request.
4. Set the API's `CLOUDFLARE_MAIL_DOMAIN=omnimail.io.vn` and
   `CLOUDFLARE_MAIL_WORKER_URL` to the deployed HTTPS Worker origin.
   Deploy the API and web application through the existing Render/Firebase flow.
5. Enable Email Routing for the domain. Preserve the existing Firebase DKIM and
   verification records. Use one SPF record containing both
   `include:_spf.firebasemail.com` and `include:_spf.mx.cloudflare.net`.
6. Set the catch-all routing rule to **Send to a Worker → omnimail-temp-mail**.
   The Worker rejects recipients that have not been created by the application.
7. Configure the Worker cron `0 3 * * *` to clean up messages older than seven days.
8. Verify `/health`, create an address on Temp Mail, and send a test email from
   an external account. Confirm both the message list and reader.

## Storage and access

The API signs short-lived operation-bound requests using its existing Firebase
service-account RSA key. The Worker verifies the signature against that
identity's public Google JWKS. No private key, Firebase user token or provider
credential is sent to the Worker. TLS is required and redirects are rejected.
Mailbox uniqueness is enforced by D1, with the owning UID stored per inbox.
Addresses stay reserved after deletion so another user cannot capture future
mail intended for a previous owner. Mailbox limits: 20 active addresses per
user, 30 latest messages per inbox, seven-day message retention, 2 MiB maximum
incoming message size. Attachment metadata is displayed; attachment binaries
are not retained or downloadable. HTML is displayed in the existing isolated
message renderer. The Worker exposes no public inbox-read or email-injection
endpoint. Email arrives only through Cloudflare's email handler.

Deleting an inbox removes its stored messages. If remote deletion fails, the
API keeps the connection available for retry. Schedule daily cleanup as above;
expired messages are excluded from reads even before the cleanup runs.

## Validation

`pnpm test`, `pnpm typecheck`, `pnpm build`. Worker tests exercise real SQLite
queries, MIME delivery/deduplication, signed request validation, user isolation,
reserved addresses, deletion and retention. API integration tests exercise
domain fallback, creation, message reads, ownership denial and deletion errors.
