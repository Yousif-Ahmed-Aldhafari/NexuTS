# Phase 1, Step 1.5 — Authentication lifecycle and request validation

## Baseline and database safety

Started on `phase/1-security-auth` at `d0e35e55016ec2de49be559229393943c5863a1e`, clean worktree. No branch creation, push, merge, or Step 1.6 work is part of this change.

Protected original: `prisma/dev.db`, SHA-256 `bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615`.

`DATABASE_URL` is now mandatory in both Prisma's schema and runtime. Local development/tests must resolve physically to `prisma/dev-isolated.db`. The protected original is rejected even through symlink/hardlink aliases (device/inode check). Missing files and wrong/non-SQLite targets fail closed. Query/error logging is disabled to avoid accidental credential/query disclosure. No environment files or databases belong in the commit.

The migration `20261028010000_auth_lifecycle` adds `User.sessionVersion`, `User.disabled`, token-digest and abuse-counter tables, indexes, and SQLite invariant triggers. Existing columns/data are preserved. Existing JWTs without lifecycle claims intentionally require a new login. The SQL was applied only after an independent `PRAGMA database_list` physical-path check on the isolated database. After independently confirming both new columns and all four triggers, `prisma migrate resolve --applied 20261028010000_auth_lifecycle` recorded that verified application in the isolated database migration history. Review and reconcile existing migration history before deploying this additive SQL elsewhere; do not use `db push` or reset against the original database. Never apply it twice.

## Confirmed issues and changes

- Email verification previously marked an account verified for any nonempty string. JWTs remained usable after password changes; deleted subjects could retain old claims. Numeric IDs accepted trailing junk via `parseInt`. Registration exposed existing-email state. Mutation payloads lacked consistent bounds, origin checks, and strict privileged-field rejection. Administrator count-before-write checks could race. Provisioning logged email addresses and had no explicit operational opt-in.
- Verification now uses 32 random bytes encoded as 64 hex characters, SHA-256 digests only in SQLite, a 15-minute lifetime, and a `verify-email` purpose. Tokens bind to account ID and the current email. Reissue cancels older proofs. Atomic transaction consumption and account update permit exactly one verification; other users, changed emails, expired tokens, and replay fail without verifying accounts.
- Request/verification limits are per authenticated account. No token appears in HTTP responses, URLs, or logs. Failure messages do not include Prisma exceptions or submitted secrets.

## Trusted email delivery and local testing

Set `RESEND_API_KEY` and `EMAIL_FROM` using an approved secret manager; the sender must be a verified provider identity. The authenticated **Send verification token** action delivers through Resend's HTTPS API. No provider is configured by this change and no real email was sent during testing. Without configuration the request returns 503 and does not claim delivery. Provider failures also fail explicitly. Tokens are entered in the existing settings dialog, never navigated through URLs.

A deliberately restricted local channel is available only for synthetic `@synthetic.local` accounts on the physical isolated database:

```bash
DATABASE_URL=file:./dev-isolated.db ALLOW_LOCAL_VERIFICATION=true \
  npx --no-install ts-node --compiler-options '{"module":"CommonJS"}' src/scripts/local-verification.ts <synthetic-user-id>
```

It writes `.local-verification/<id>.txt` using exclusive creation, mode 0600 inside a 0700 directory. Read it locally and paste into the token field; remove it after use. Production execution, other database paths, nonsynthetic recipients, and implicit opt-in are rejected. This is a local test delivery channel, not proof of access to a real mailbox. The directory is Git-ignored.

## Sessions and account changes

- Encrypted Auth.js JWTs have a seven-day maximum transport lifetime and a signed absolute expiry: eight hours normally, seven days with Remember Me. Refresh cannot extend that absolute expiry. Production session cookies use the `__Secure-` prefix, HttpOnly, Secure, SameSite=Lax, and Path=/.
- Every session access consults the database for existence, disabled status, session version, and current role. Missing claims, expiry, deletion, demotion/version mismatch, and database failures fail closed. Client session-update role claims are ignored. No fallback by email can substitute a different account for a missing subject.
- SQLite triggers increment the version on password, email, role, or disabled-state changes, covering profile updates, admin resets, and maintenance writers. A reset invalidates previous cookies on their next request; it does not cancel an already-running authorized operation. Email changes also clear verification and cancel pending proofs.
- Logout clears Auth.js cookies and invalidates the current session version, terminating all sessions from that version. A replayed obsolete logout cookie cannot revoke newer sessions. The profile UI directs the user through logout after a password change.
- New/changed passwords require eight characters, uppercase, lowercase, and a digit or symbol, with a 72-byte UTF-8 ceiling matching bcrypt's limit. Bcrypt cost 12 and constant-time legacy checks remain. Legacy sign-in upgrades atomically; password-version comparisons prevent a concurrent reset from authorizing an old password. Old weak passwords are not rejected merely for failing new complexity rules.
- Self-service password changes verify the current password and compare-and-set the credential/version before updating. Admin provisioning/role changes/resets/deletions require an authenticated database administrator; HTTP account mutations require a login within ten minutes. An expired reauthentication window produces 403 instructing the administrator to sign in again. No public password-recovery bypass exists or was added.
- Registration performs equivalent hashing work and returns the same success/status/email shape for new and existing addresses. Malformed or privileged properties are rejected. No existing credential is replaced by registration.

## Validation and browser protections

Strict Zod schemas bound account strings, validate emails/roles/actions and exact numeric IDs, and reject privileged/unexpected fields. QA mutations keep existing ownership checks and semantic entry validation, with CUIDs, enum validation, HTTP(S) project URLs, constrained image/media formats, and bounded text/attachments. Account JSON bodies are limited to 8 KiB, verification to 4 KiB, project/table payloads to 3 MiB, and entries to 16 MiB (attachment field capped at 12 MiB). Limits count streamed bytes and do not trust Content-Length alone. Invalid input returns controlled 400/413/415 responses instead of leaked database errors.

Custom mutations reject cross-site or mismatched Origin requests. Production requires Origin and a canonical `AUTH_URL` matching the public HTTPS origin (the test runner uses loopback HTTP). Do not derive deployment trust from arbitrary forwarded headers. Auth.js keeps its own CSRF mechanism; its POST wrapper adds bounded bodies, origin checks, and rate limits, without disabling native CSRF. Next.js server actions keep their built-in origin protections. Redirects are restricted to the same origin. No permissive CORS headers are added.

Headers add CSP, DENY framing/frame-ancestors, nosniff, no-referrer, restrictive device permissions, and production HSTS. CSP retains inline script/style compatibility for the current Next.js/theme bootstrap; development alone permits unsafe-eval and WebSockets. A nonce-based CSP rollout remains recommended after browser coverage. Non-auth preference cookies now use encoded values, SameSite=Lax, and Secure on HTTPS; session credentials remain HttpOnly and are never written by client utilities.

## Abuse protection and deployment limits

Atomic `AuthRateLimit.upsert` counters live in SQLite, shared across processes using that same database, not in a per-process map. Keys are SHA-256 digests rather than raw account identifiers. Expired counters are periodically removed.

| Operation | Limit |
| --- | --- |
| Credential attempts per account | 8 / 15 min |
| Credential attempts globally | 3000 / 15 min |
| Auth.js HTTP POST globally | 100 / 15 min |
| Auth.js credentials callback per account | 8 / 15 min |
| Registration per email | 3 / hour |
| Registration globally | 50 / hour |
| Verification attempts per account | 10 / 15 min |
| Verification sends per account | 3 / hour |
| Profile changes per account | 10 / 15 min |
| Admin account mutations per administrator | 30 / 15 min |

HTTP rate rejections return 429 with Retry-After. Server-action login deliberately returns the generic credential failure when limited. Fixed-window boundaries can allow a short burst. Global limits are conservative and can cause shared-service denial of access under attack; tune them against operational traffic. This is not a globally distributed limiter across separate databases/replicas. A production reverse proxy must enforce body, connection, per-client/network rate limits, canonical host handling, and HTTPS. Client-supplied X-Forwarded-For is deliberately not trusted for rate identities. Multi-region or replicated deployment requires a coordinated limiter/shared store and is not certified by these tests.

## Administrator invariant and provisioning

SQLite BEFORE triggers abort removal/demotion/disabling of the last enabled administrator at the database write itself, even across connections. The application count checks remain for friendly errors but are not the concurrency guarantee. Constraint errors are mapped safely. Concurrency tests exercise both demotion and deletion using independent Prisma connections and synthetic administrators.

Provisioning requires explicit `DATABASE_URL` and `ALLOW_ADMIN_PROVISIONING=true`, confirms the physical database, refuses the protected original, and logs only numeric account ID plus timestamp. It cannot create accounts. Use only a trusted local administrator shell; the CLI is intentionally not rate-limited as an HTTP service. Concurrent provisioning cannot weaken the last-admin invariant. Database owners can bypass/drop triggers and remain a trusted operational boundary.

## Regression verification

Run after building with the isolated URL:

```bash
DATABASE_URL=file:./dev-isolated.db npx --no-install tsc --noEmit --incremental false
DATABASE_URL=file:./dev-isolated.db npx --no-install biome lint .
DATABASE_URL=file:./dev-isolated.db AUTH_URL=http://localhost:3105 npm run build
node tests/security/run-step15.cjs
```

The runner makes a private backup of **only the isolated database**, reconstructs its schema at the same verified physical path, seeds synthetic accounts/project, runs all existing and new lifecycle tests, starts the production server on loopback, runs real-cookie HTTP tests, stops the server, and restores pre-test isolated contents in a finally block. It checks the protected original SHA-256 before and after. Do not run another development server while it temporarily replaces the isolated fixture database. It refuses a symlinked isolated path or an unexpected original checksum. Private backups are retained outside the repository for recovery on unexpected process termination.

New scenarios cover invalid/expired/reused/cross-user/mismatched tokens, exactly-once use, session expiry/version revocation, password changes/admin resets, role/disabled/deletion handling, strict and oversized input, privilege injection, rate limits, origins and Auth.js CSRF, cookie flags, authorized QA workflows, registration response equivalence, logout replay, provisioning, local-only delivery, and concurrent last-admin operations. Tests exercise actual database operations and production HTTP cookies, not only source assertions.

Final verified results: **60/60 tests passed**, zero failures/skips: 34 previous security tests, 13 new lifecycle/database/CLI tests, and 13 actual production HTTP tests. The latter include recent-login enforcement using a correctly encrypted but old-authentication JWT, legacy sign-in upgrade, real old-cookie revocation after self-service/admin password changes, demotion/disabling/deletion, and logout replay. An authorized project/table/entry create/delete sequence and authenticated project-page render passed.

- TypeScript: `npx --no-install tsc --noEmit --incremental false`, exit 0.
- Full repository lint: `npx --no-install biome lint .`, exit 0; no warnings/errors.
- Changed-file Biome checks: passed.
- Production build with isolated DATABASE_URL and canonical loopback AUTH_URL: passed.
- Full optional `biome check .`: 15 pre-existing errors in unchanged files (14 import-organization diagnostics and tsconfig.json formatting). These are outside Step 1.5 and were not rewritten.
- Physical target: /mnt/samsungSSD/Projects/Nexumind/NexuTS/prisma/dev-isolated.db, independently checked with PRAGMA database_list.
- Original database SHA-256 remained bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615. Isolated pre-test contents were restored after fixture runs.
- No real mail-provider send or cross-browser UI automation was performed; trusted local delivery and production HTTP security behavior were tested.

### Files in this change

- docs/development/PHASE-1-STEP-1.5-SECURITY.md
- prisma/migrations/20261028010000_auth_lifecycle/migration.sql
- src/lib/auth/account-schemas.ts
- src/lib/auth/mutation-guard.ts
- src/lib/auth/rate-limit.ts
- src/lib/auth/request-security.ts
- src/lib/auth/session-lifecycle.ts
- src/lib/auth/verification.ts
- src/scripts/local-verification.ts
- tests/security/auth-http.test.cjs
- tests/security/auth-lifecycle.test.ts
- tests/security/run-step15.cjs
- .gitignore
- README.md
- next.config.mjs
- prisma/schema.prisma
- src/actions/auth.ts
- src/app/(main)/dashboard/settings/_components/system-settings-content.tsx
- src/app/api/auth/[...nextauth]/route.ts
- src/app/api/auth/profile/route.ts
- src/app/api/auth/register/route.ts
- src/app/api/auth/verify-email/route.ts
- src/app/api/entries/route.ts
- src/app/api/projects/route.ts
- src/app/api/tables/route.ts
- src/app/api/users/route.ts
- src/auth.ts
- src/lib/auth/access-control.ts
- src/lib/auth/current-user.ts
- src/lib/cookie.client.ts
- src/lib/i18n/messages/ar.ts
- src/lib/i18n/messages/en.ts
- src/lib/password-rules.ts
- src/lib/prisma.ts
- src/scripts/provision-admin.ts
- src/types/next-auth.d.ts

## Remaining work for Step 1.6

Add these Node regression suites to CI without running them against live data; add cross-browser UI coverage and mail-provider sandbox tests. Evaluate a nonce CSP, durable distributed abuse controls for replicated deployments, account/IP risk signals and MFA, operational rate tuning and monitoring, and migration-history/deployment rehearsal on a dedicated staging database. This step does not introduce a new test framework, deploy changes, push, merge, or begin Step 1.6.

References: [Auth.js callbacks and JWT sessions](https://authjs.dev/reference/core), [OWASP account-recovery token guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), [SQLite trigger guarantees](https://www.sqlite.org/lang_createtrigger.html).
