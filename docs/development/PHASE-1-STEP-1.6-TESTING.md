# Phase 1, Step 1.6 — Automated security testing and CI

## Test inventory

The security suite is deliberately kept on Node's built-in test runner. Step 1.6 reuses all 60 Step 1.5 cases and adds focused unit, migration, and browser tests.

| Suite | Command | Boundary exercised |
| --- | --- | --- |
| Security primitives | `npm run test:unit` | Password/schema rules and fail-closed database routing in child processes |
| Migration integration | `npm run test:migrations` | Real Prisma migration deployment against new temporary SQLite files, including a pre-Step-1.5 upgrade |
| Database/route integration | `npm run test:integration` | 47 tests using real SQLite operations and actual Next.js route functions; authentication identity is injected only where a test targets authorization logic |
| Production HTTP security | `npm run test:security:http` | 13 tests against `next start`, including encrypted cookies, Auth.js CSRF, session revocation, abuse limits, and authorized QA APIs |
| Browser E2E | `npm run test:e2e` | Chromium registration, validation, login/logout, protected navigation, admin UI, and QA project/table/entry HTTP workflows from a browser session |
| Complete local/CI sequence | `npm run test:ci` | All suites, one production build, and Playwright |

Every critical suite fails with a nonzero status. There are no source-text assertion suites and no silent critical-test skips. `test:security:http` and `test:e2e:run` require a completed `.next` production build; the public `test:security` and `test:e2e` commands create one first.

## Disposable database design

`tests/helpers/test-database.cjs` creates a unique mode-0700 directory below the operating system temporary directory for every runner. Its `test.db` is initialized using `prisma migrate deploy`. The application accepts this location only when all of these controls agree:

- `NEXUTS_TEST_MODE=1` is explicit;
- `NEXUTS_TEST_DATABASE_DIR` resolves below the OS temporary directory;
- the directory contains the runner's ownership marker;
- `DATABASE_URL` resolves exactly to `<owned-directory>/test.db`;
- the target is not the same physical file as `prisma/dev.db`.

Cleanup validates the marker and temporary-directory boundary before recursively deleting anything. It removes only the directory created by that process. Each runner snapshots the physical identities and SHA-256 digests of both `prisma/dev.db` and `prisma/dev-isolated.db`, then verifies both after cleanup. Parallel runners therefore use separate mutable state.

Fixtures use only `@synthetic.local` addresses and fixed test-only secrets. CI does not copy a local database, environment file, or developer credential.

## Migration coverage and existing deployments

The previous migration directory began with an `ALTER TABLE User`, so an empty database could not be initialized. `20260512000000_baseline` records the schema that existed before `20260512181500_add_user_language`. It introduces no model beyond the historical schema.

The migration suite verifies:

1. all migrations deploy successfully to an empty disposable database;
2. expected tables, columns, migration records, and administrator triggers exist;
3. a database initialized through the baseline and language migrations preserves a synthetic administrator and project while applying `20261028010000_auth_lifecycle`;
4. new default values and the last-administrator constraint work after upgrade.

An existing deployment that predates the baseline file already has those tables. Back it up and rehearse against a staging copy, verify the schema matches the baseline, and record only the baseline as applied before `migrate deploy`:

```bash
DATABASE_URL="file:/absolute/path/to/staging-copy.db" \
  npx --no-install prisma migrate resolve --applied 20260512000000_baseline
DATABASE_URL="file:/absolute/path/to/staging-copy.db" \
  npx --no-install prisma migrate deploy
```

Do not run that command against either repository developer database. SQLite migration rollback is recovery from a verified pre-migration backup followed by diagnosis and a forward corrective migration; destructive automatic rollback is not provided.

## Local commands

Install locked dependencies and generate the client:

```bash
npm ci
npx --no-install prisma generate
```

Run suites separately:

```bash
npm run test:unit
npm run test:migrations
npm run test:integration
npm run test:security
npm run test:e2e
```

Run the same ordering used by CI:

```bash
npm run test:ci
```

Playwright uses a system Google Chrome at `/usr/bin/google-chrome` locally when present. Otherwise install the supported Chromium binary:

```bash
npx --no-install playwright install chromium
```

The test servers bind only to `127.0.0.1` on ports 3105 and 3106 by default. Override them with `SECURITY_TEST_PORT` or `E2E_PORT` when a local port is occupied.

## GitHub Actions

`.github/workflows/security-ci.yml` runs for pull requests and pushes to `main`, `development`, and `phase/**`. It has read-only repository permissions, cancels superseded runs, installs with `npm ci`, generates Prisma Client, checks TypeScript and Biome, runs unit/migration/integration/HTTP suites, builds the production app, installs only Chromium, and runs Playwright. Test failures fail the job. Browser traces, screenshots, videos, and the HTML report are retained for seven days only when the job fails.

The workflow has no application secrets and relies on synthetic runner-provided values. GitHub-hosted execution must be observed before treating the workflow itself as remotely verified.

## Coverage limits

SQLite concurrency, session revocation, token replay, request bounds, cross-project access, origin enforcement, sensitive projections, and same-database atomic rate limits are verified locally. Globally distributed rate limiting, reverse-proxy trust, real email delivery, multi-region session consistency, and production infrastructure behavior require a dedicated staging environment. Playwright intentionally uses one Chromium project; add Firefox/WebKit only when the product's browser-support policy requires them.

An October 28, 2026 `npm audit --omit=dev` reports 13 existing production dependency advisories (1 moderate, 8 high, and 4 critical), including advisories affecting the pinned Next.js/Auth.js versions. The Step 1.6 lockfile diff adds only Playwright packages, so these are not introduced by the test infrastructure. Dependency upgrades can change authentication and framework behavior and require a dedicated, urgent Step 1.7 upgrade and regression pass. The current CI does not claim that passing functional security tests removes dependency-level risk.

## Step 1.6 verification record

The final local `npm run test:ci` execution completed with no failures or skips:

- 3/3 security primitive and database-routing unit tests;
- 2/2 fresh/upgrade migration tests;
- 47/47 database and route-handler security integration tests;
- 13/13 production HTTP security tests;
- 2/2 Chromium E2E journeys.

The production build, standalone TypeScript check, full Biome lint, and changed-file Biome check also passed. GitHub Actions is configured but has not been remotely executed from this local environment.
