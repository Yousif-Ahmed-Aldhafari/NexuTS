# NexuTS — Phase 0 Baseline Specification

## 1. Executive Summary
Phase 0 established an isolated, verified development and testing baseline for NexuTS without altering production data, committing to `main`, or introducing unvetted dependencies. The application is a Next.js full-stack QA management system with NextAuth credentials authentication, SQLite storage, and a shadcn/ui dashboard interface.

---

## 2. Technology Stack & Installed Dependencies

| Component | Technology | Version | Notes |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `v24.21.0` | Linux x86_64 |
| **Framework** | Next.js | `16.2.4` | App Router, Turbopack enabled |
| **UI Library** | React / React DOM | `19.2.4` | React Compiler enabled via `babel-plugin-react-compiler` |
| **Database ORM** | Prisma / Prisma Client | `5.22.0` | SQLite provider |
| **Authentication** | NextAuth.js | `5.0.0-beta.31` | JWT session strategy, `@auth/prisma-adapter 2.11.2` |
| **Styling** | Tailwind CSS | `4.1.5` | `@tailwindcss/postcss 4.1.18` |
| **Linter / Formatter** | Biome | `2.3.8` | Configuration in `biome.json` |
| **TypeScript** | TypeScript | `5.9.3` | `strict: true`, ES2017 target, Bundler resolution |
| **State Management**| Zustand | `5.0.10` | Client preferences and UI state |
| **Data Fetching** | TanStack React Query | `5.90.20` | Client-side cache |
| **Validation** | Zod | `3.25.76` | Schema validation |
| **Encryption** | bcryptjs | `3.0.3` | Installed in `package.json`, pending wiring in Phase 1 |

---

## 3. Database Architecture & Consistency

### 3.1 Schema & Table Inventory
The schema is defined in `prisma/schema.prisma` and backed by SQLite:

1. **`User`:** `id` (INTEGER PK AUTOINCREMENT), `name`, `email` (UNIQUE), `role` (DEFAULT 'USER'), `emailVerified`, `image`, `password`, `language` (DEFAULT 'en').
2. **`Account`:** `id` (TEXT PK), `userId` (FK -> `User.id` CASCADE), `type`, `provider`, `providerAccountId`, `refresh_token`, `access_token`, `expires_at`, `token_type`, `scope`, `id_token`, `session_state`. Unique on `[provider, providerAccountId]`.
3. **`Session`:** `id` (TEXT PK), `sessionToken` (TEXT UNIQUE), `userId` (FK -> `User.id` CASCADE), `expires`.
4. **`Project`:** `id` (TEXT PK), `name`, `url`, `logo`, `createdBy`, `userId` (FK -> `User.id` SET NULL), `createdAt`, `updatedAt`.
5. **`Table`:** `id` (TEXT PK), `projectId` (FK -> `Project.id` CASCADE), `name`, `tableType` (DEFAULT 'TEST_CASES'), `createdBy`, `createdAt`, `updatedAt`.
6. **`Entry`:** `id` (INTEGER PK AUTOINCREMENT), `tableId` (FK -> `Table.id` CASCADE), `title`, `description`, `status` (DEFAULT 'NEW'), `assignedTo`, `isDeleted` (BOOLEAN DEFAULT false), `username`, `stepsToReproduce`, `fixStatus`, `result`, `expectedResult`, `screenshotClipName`, `screenshotClipUrl`, `createdAt`, `updatedAt`.
7. **`_prisma_migrations`:** Internal Prisma table recording migration `20260512181500_add_user_language`.

### 3.2 Schema-to-Database Consistency
- Executed `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url file:./prisma/dev-isolated.db` -> **`No difference detected.`**
- Executed reverse diff -> **`No difference detected.`**
- The database structure matches the Prisma datamodel with zero drift.

---

## 4. Runtime Database Isolation

### 4.1 Physical File Paths & Separation
- **Original Database:** `/mnt/samsungSSD/Projects/Nexumind/NexuTS/prisma/dev.db`
  - SHA-256 Checksum: `bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615`
  - Status: Strictly preserved, read-only access only.
- **Isolated Database:** `/mnt/samsungSSD/Projects/Nexumind/NexuTS/prisma/dev-isolated.db`
  - Created via SQLite Online Backup API (`sqlite3.Connection.backup()`).
  - Git status: Excluded via `.gitignore` (`prisma/dev-isolated.db*`) and `.git/info/exclude`.
- **Environment Configuration:**
  - Tracked `.env` preserved untouched.
  - Untracked `.env.local` configured with `DATABASE_URL="file:./dev-isolated.db"`.

### 4.2 Runtime Routing Verification
- Implemented in `src/lib/prisma.ts`:
  - Dynamically reads `process.env.DATABASE_URL`.
  - Enforces `file:` protocol.
  - Resolves target path relative to `prisma/`.
  - **Fail-Closed Guard:** Throws explicit error halting process startup if the target database does not exist or is invalid, preventing silent fallback to `dev.db`.
- **Physical Verification Evidence:**
  - `PRAGMA database_list;` executed via Prisma query engine confirmed physical connection to `/mnt/samsungSSD/Projects/Nexumind/NexuTS/prisma/dev-isolated.db`.
  - OS `/proc/<pid>/fd` confirmed file descriptors 72 and 73 open exclusively on `dev-isolated.db`. Zero file descriptors held on `dev.db`.

---

## 5. Verified Application & Route Behavior

### 5.1 Verification Methodology Distinction
- **Static Inspection:** Code structure, schema definitions, and AST validation.
- **API / Runtime Check:** HTTP status codes, JSON payload verification, database query logging.
- **Rendered / Interactive Check:** Form presence, input markup, client-side redirect verification. (Note: HTTP 200 on page routes confirms server render success, not full client-side workflow completion).

### 5.2 Route Inventory & Test Results

| Route / Endpoint | Classification | Tested Behavior | Status |
| :--- | :--- | :--- | :---: |
| `/` | Route Redirect | Unauthenticated requests redirect to `/auth/v2/login` | HTTP 307 |
| `/auth/v1/login`, `/register` | Rendered Page | Login/Register forms rendered with OAuth and Remember Me | HTTP 200 |
| `/auth/v2/login`, `/register` | Rendered Page | Split-screen login/register layout rendered | HTTP 200 |
| `/unauthorized` | Rendered Page | Access denied screen rendered | HTTP 200 |
| `/dashboard` | Route Redirect | Redirects to `/dashboard/home-page` | HTTP 307 |
| `/dashboard/home-page` | Protected Page | Redirects unauthenticated requests to login; renders when session is present | HTTP 307 / 200 |
| `/dashboard/default` | Protected Page | Renders KPI analytics dashboard with active session | HTTP 307 / 200 |
| `/dashboard/crm` | Protected Page | Renders CRM pipeline table with active session | HTTP 307 / 200 |
| `/dashboard/finance` | Protected Page | Renders finance overview tabs with active session | HTTP 307 / 200 |
| `/dashboard/execution` | Protected Page | Renders test execution visual tree with active session | HTTP 307 / 200 |
| `/dashboard/history` | Protected Page | Renders test run history with active session | HTTP 307 / 200 |
| `/dashboard/coming-soon` | Protected Page | Placeholder view with active session | HTTP 307 / 200 |
| `/dashboard/nexumind-projects`| Protected Page | Project management UI with active session | HTTP 307 / 200 |
| `/dashboard/qa-boards` | Protected Page | QA boards list with active session | HTTP 307 / 200 |
| `/dashboard/qa-boards/[id]` | Protected Page | Project workspace, table tabs, and test case entries | HTTP 307 / 200 |
| `/dashboard/settings` | Protected Page | User preferences, language, and theme options | HTTP 307 / 200 |
| `POST /api/auth/register` | API Endpoint | Creates user account with role `USER` | HTTP 201 |
| `POST /api/auth/callback/credentials`| API Endpoint | Issues JWT `authjs.session-token` cookie | HTTP 302 |
| `POST /api/auth/signout` | API Endpoint | Clears session cookie | HTTP 302 |
| `GET /api/auth/profile` | API Endpoint | Returns profile for authenticated session; 401 unauthenticated | HTTP 200 / 401 |
| `GET /api/projects` | API Endpoint | Returns all projects and embedded users | HTTP 200 |
| `GET /api/tables` | API Endpoint | Returns tables for given `projectId` | HTTP 200 |
| `GET /api/tables/[id]/entries`| API Endpoint | Returns non-deleted entries for given `tableId` | HTTP 200 |
| `GET /api/users` | API Endpoint | Returns 403 Forbidden for non-admin; 401 unauthenticated | HTTP 403 / 401 |
| `POST /api/projects` | API Endpoint | Returns 403 Forbidden for non-admin | HTTP 403 |

---

## 6. Code Quality, Build & Tooling Baseline

### 6.1 Quality Verification Results
- **TypeScript:** `npx --no-install tsc --noEmit --incremental false` -> **0 errors, 0 warnings** (Exit code 0).
- **Biome Lint:** `npx --no-install biome lint .` -> **0 errors, 2 warnings** (Cookie manipulation in `src/lib/cookie.client.ts`).
- **Biome Check:** `npx --no-install biome check .` -> **19 errors, 2 warnings** (17 import-ordering errors, 2 formatting errors). Documented as baseline debt.
- **Production Build:** `DATABASE_URL="file:./dev-isolated.db" npm run build` -> **Compiled successfully in 2.6 min**, 28/28 static targets, exit code 0.

### 6.2 Testing & CI Infrastructure Inventory
- **Automated Tests:** Zero existing unit, integration, or E2E tests.
- **CI Pipelines:** No GitHub Actions or CI configuration present.
- **Git Hooks:** `.husky/pre-commit` configured to run `npm run generate:presets` and `lint-staged`.

---

## 7. Baseline Synthetic Data
To enable safe authenticated testing without modifying real user records, exactly one synthetic user was created in `prisma/dev-isolated.db`:
- **ID:** `5`
- **Username:** `qa_baseline_user`
- **Email:** `qa.baseline.synthetic@example.com`
- **Role:** `USER`
- **Language:** `en`
Zero synthetic records were added to `Account`, `Entry`, `Project`, `Session`, or `Table`.

