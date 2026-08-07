# OmniMail

Unified email workspace for Gmail, Microsoft 365/Outlook, IMAP and temporary inboxes. The repository starts in a self-contained demo mode with three accounts and 32 realistic messages.

## Run locally

Requirements: Node.js 22+ and pnpm 10+.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API runs at `http://localhost:4000`; `GET /api/health` reports its current mode. Useful checks are `pnpm build`, `pnpm typecheck`, and `pnpm test`.

The app is split into `/app/home`, `/app/mailboxes`, `/app/temp-mail`, and the protected `/app/mail-admin`. A mailbox is fetched only after it is opened, returns the 10 newest messages, and refreshes every 10 seconds while visible. The refresh button bypasses the short Outlook cache.

## Structure

- `apps/web`: React, Vite, TypeScript, Router, TanStack Query and Zustand client.
- `apps/api`: Express API, provider adapters, security services, Socket.IO and demo repository.
- `packages/shared`: provider-independent mail DTOs and adapter contract.
- `packages/ui`: reusable UI package surface.
- `firebase`: Firestore and Storage rules plus emulator configuration.

The web app never calls a mail provider directly. All operations go through the API and use provider-neutral DTOs. Demo adapters have the same contract as Gmail, Microsoft, IMAP and temp-mail adapters, so real integrations can replace them without changing UI business logic.

## Firebase setup

1. Create a Firebase project and enable Email/Password Authentication.
2. Create Firestore and a private Storage bucket.
3. Create an Admin SDK service account and populate `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, and `FIREBASE_STORAGE_BUCKET` in `apps/api/.env`.
4. Add the Firebase web configuration as `VITE_FIREBASE_*` variables in `apps/web/.env` when switching off demo authentication.
5. Install Firebase CLI, then run `firebase emulators:start` for Auth, Firestore and Storage.
6. Deploy the client with `pnpm build && firebase deploy --only hosting,firestore:rules,storage`.

Rules intentionally prevent the browser from creating mail accounts or modifying credentials, provider tokens and sync cursors. Those changes belong to the Admin SDK service layer, which must also enforce resource ownership.

## Persistent mailbox connections

Connected mailboxes are stored by the API, not by the browser. To retain them across API restarts, set `FIREBASE_PROJECT_ID` plus either the Admin SDK service-account fields (`FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`) or `GOOGLE_APPLICATION_CREDENTIALS`, then set a base64-encoded 32-byte `TOKEN_ENCRYPTION_KEY`. Provider credentials are encrypted before being stored in Firestore. Verify the API reports `"persistentMailboxStorage":true` at `GET /api/health`.

Deploy the checked-in rules after leaving Firestore test mode:

```bash
firebase deploy --only firestore:rules,storage
```

To grant Mail Admin access after configuring Firebase Admin credentials:

```bash
pnpm --filter @omnimail/api admin:grant user@example.com
```

The user must sign out and sign in again so Firebase issues a token containing the new `admin` custom claim. Set `MICROSOFT_SEED_OWNER_UID` to the Firebase UID allowed to see a server-seeded Outlook mailbox.

## Google OAuth and Gmail

1. In Google Cloud, configure the OAuth consent screen and enable Gmail API.
2. Create a Web OAuth client and add the callback in `.env.example` as an authorized redirect URI.
3. Populate `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI`.
4. Request only the scopes used by enabled features: `gmail.modify` and `gmail.send`; add readonly-only mode where appropriate.
5. Set `DEMO_MODE=false`. OAuth state must be random, short-lived, bound to the authenticated Firebase UID and verified in the callback. Store refresh credentials only as AES-256-GCM ciphertext.

## Microsoft OAuth

1. Register an application in Microsoft Entra ID. Use tenant `consumers` for personal Outlook/Hotmail accounts, or `common` only when the registration supports both personal and organizational accounts.
2. Add the callback URI, create a client secret, and grant delegated Microsoft Graph `Mail.Read`. The OAuth request also includes `offline_access` so the API can refresh access without asking the user to sign in again.
3. Populate `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, and `MICROSOFT_REDIRECT_URI`.
4. Set `OAUTH_STATE_SECRET` to a long random value. OAuth state is signed, short-lived and bound to the authenticated Firebase UID.
5. Microsoft OAuth and manually imported refresh tokens are read through Microsoft Graph. The old seed/IMAP integration is disabled unless `ENABLE_LEGACY_MICROSOFT_SEED=true` is explicitly set.

## Secrets and encryption

Copy `.env.example` values into the app-specific `.env` files. These are Git-ignored. Generate a 32-byte encryption key with `openssl rand -base64 32` and set `TOKEN_ENCRYPTION_KEY`; rotate by incrementing `TOKEN_ENCRYPTION_KEY_VERSION`. Never prefix a browser variable with credentials. Authorization headers, cookies and tokens are redacted from API logs.

Temporary mail uses mail.tm's account-token flow. No provider API key is required; each generated mailbox receives its own server-side bearer token.

## Production notes

Set `DEMO_MODE=false`, configure Firebase Admin, OAuth and a 32-byte token key. Redis is included in Compose as the planned queue backend but is not yet wired into runtime synchronization. The current in-memory account index is suitable for a single API instance; horizontal scaling still requires a Firestore-backed repository and BullMQ workers. Email bodies remain lazy-loaded and the UI displays only the ten newest messages.

The API Dockerfile and Compose file provide the backend/Redis baseline. Use a secret manager for deployed values and rotate any credential that has been pasted into chat or logs.
