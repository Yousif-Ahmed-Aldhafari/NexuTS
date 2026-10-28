# NexuTS — Phase 2, Step 2.3 Documentation
## Schema Consistency, Entry Priority Normalization & Database Constraints

**Repository:** `/mnt/samsungSSD/Projects/Nexumind/NexuTS`  
**Branch:** `phase/2-database-integrity`  
**Starting Commit:** `96f521139426cdbbb2d80961dc1e62ffbe11341c`  
**Status:** Completed & Verified  

---

### 1. Executive Summary

In NexuTS Phase 2, Step 2.3, we addressed schema inconsistency, field overloading, and lack of database-level constraints across test case and issue log management:
1. **Entry Priority Normalization:** Resolved field overloading where `Entry.status` previously stored issue priority strings (`"HIGH"`, `"MEDIUM"`, `"LOW"`). Added a dedicated nullable `Entry.priority` column with an SQLite `CHECK` constraint.
2. **Data Migration & Backfill:** Created additive migration `20261028030000_normalize_entry_priority_and_constraints` that automatically copies legacy issue priorities from `status` to `priority` and safely transitions issue `status` to `"CLOSED"` (when `fixStatus == 'FIXED'`) or `"OPEN"` (otherwise), leaving test cases intact.
3. **Database Constraints & Triggers:** Added SQLite database triggers and constraints to enforce domain invariants against direct SQL mutations:
   - `CHECK (priority IS NULL OR priority IN ('HIGH', 'MEDIUM', 'LOW'))`
   - Trigger enforcement on `Table.tableType IN ('TEST_CASES', 'ISSUE_LOGS')`
   - Trigger enforcement on `Entry.status IN ('SUCCESS', 'FAIL', 'OPEN', 'CLOSED', 'NEW')`
   - Trigger enforcement on `Entry.fixStatus IS NULL OR fixStatus = '' OR fixStatus IN ('NEEDS_FIX', 'NEEDS_RETEST', 'FIXED')`
4. **Application Validation & UI Compatibility:** Updated input schemas (`src/lib/qa-entry-schema.ts`, `src/lib/auth/mutation-guard.ts`), API endpoints (`/api/entries`, `/api/tables/[tableId]/entries`), QA boards UI (`data-table.tsx`), status badges (`status-badges.tsx`), and i18n dictionaries (`en.ts`, `ar.ts`).
5. **Comprehensive Verification:** Fresh migrations, upgrade migrations with synthetic legacy data, integration tests, HTTP security tests, TypeScript compilation, and Biome lint checks passed with 100% success rate. The development database `prisma/dev.db` was untouched and preserved.

---

### 2. Original Field Semantics vs. Normalized Design

#### Original State (Audited in Step 2.1)
- **`TEST_CASES`**:
  - `status`: `"SUCCESS"` | `"FAIL"` (or default `"NEW"`).
  - `fixStatus`: `"NEEDS_FIX"` | `"NEEDS_RETEST"` | `"FIXED"`.
  - `result` & `expectedResult`: User-supplied execution outputs.
  - `priority`: Did not exist in schema; UI and API ignored priority.
- **`ISSUE_LOGS`**:
  - `status`: **Overloaded.** Stored priority strings (`"HIGH"`, `"MEDIUM"`, `"LOW"`).
  - `fixStatus`: `"NEEDS_FIX"` | `"NEEDS_RETEST"` | `"FIXED"`.
  - `result` & `expectedResult`: Empty strings.
  - `priority`: Column did not exist; client sent priority via payload, but backend stored it into `status`.

#### Normalized Schema Design
- **`TEST_CASES`**:
  - `status`: Execution state (`"SUCCESS"`, `"FAIL"`, `"NEW"`).
  - `priority`: `NULL` (test cases do not have issue severity/priority).
  - `fixStatus`: Fix tracking state (`"NEEDS_FIX"`, `"NEEDS_RETEST"`, `"FIXED"`).
  - `result` & `expectedResult`: Execution details.
- **`ISSUE_LOGS`**:
  - `status`: Issue lifecycle status (`"OPEN"`, `"CLOSED"`).
  - `priority`: Dedicated field (`"HIGH"`, `"MEDIUM"`, `"LOW"`).
  - `fixStatus`: Resolution tracking state (`"NEEDS_FIX"`, `"NEEDS_RETEST"`, `"FIXED"`).
  - `result` & `expectedResult`: Empty strings.

---

### 3. Migration & Backfill Strategy

Migration file: `prisma/migrations/20261028030000_normalize_entry_priority_and_constraints/migration.sql`

#### Column Creation with Native SQLite CHECK Constraint
```sql
ALTER TABLE "Entry" ADD COLUMN "priority" TEXT CHECK ("priority" IS NULL OR "priority" IN ('HIGH', 'MEDIUM', 'LOW'));
```

#### Safe, Idempotent Backfill
```sql
UPDATE "Entry"
SET
  "priority" = "status",
  "status" = CASE
    WHEN "fixStatus" = 'FIXED' THEN 'CLOSED'
    ELSE 'OPEN'
  END
WHERE "tableId" IN (SELECT "id" FROM "Table" WHERE "tableType" = 'ISSUE_LOGS')
  AND "status" IN ('HIGH', 'MEDIUM', 'LOW');
```

#### Invariant Triggers for Direct SQL Safety
1. **Table Type Validation:**
   - `validate_table_table_type_insert` (BEFORE INSERT ON `Table`)
   - `validate_table_table_type_update` (BEFORE UPDATE OF `tableType` ON `Table`)
   - Rejects any values outside `('TEST_CASES', 'ISSUE_LOGS')`.
2. **Entry Status Validation:**
   - `validate_entry_status_insert` (BEFORE INSERT ON `Entry`)
   - `validate_entry_status_update` (BEFORE UPDATE OF `status` ON `Entry`)
   - Rejects any values outside `('SUCCESS', 'FAIL', 'OPEN', 'CLOSED', 'NEW')`.
3. **Entry Fix Status Validation:**
   - `validate_entry_fix_status_insert` (BEFORE INSERT ON `Entry`)
   - `validate_entry_fix_status_update` (BEFORE UPDATE OF `fixStatus` ON `Entry`)
   - When non-null and non-empty, rejects any values outside `('NEEDS_FIX', 'NEEDS_RETEST', 'FIXED')`.

---

### 4. Application Changes

1. **`prisma/schema.prisma`**:
   - Added `priority String?` to `model Entry`.
2. **`src/lib/qa-entry-schema.ts`**:
   - Updated `NormalizedEntryCreateInput` to include `priority: IssuePriority | null`.
   - Updated `validateAndNormalizeEntryInput`:
     - For `TEST_CASES`: sets `priority: null`, validates `status` as `"SUCCESS" | "FAIL"`.
     - For `ISSUE_LOGS`: extracts `priority` (with fallback to `rawInput.status` for legacy clients), sets `status: "OPEN"` (or `"CLOSED"` if `fixStatus === 'FIXED'`), sets `result` and `expectedResult` to `""`.
3. **`src/lib/auth/mutation-guard.ts`**:
   - Updated `entryInput` schema to accept `status: z.enum(["SUCCESS", "FAIL", "OPEN", "CLOSED", "NEW"]).optional()`.
   - Maintained `priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional()`.
4. **API Endpoints (`src/app/api/entries/route.ts` & `src/app/api/tables/[tableId]/entries/route.ts`)**:
   - Added `priority` query parameter support in `GET` handlers.
   - Preserved all Phase 1 authorization and rate-limiting safeguards.
5. **QA Boards UI (`data-table.tsx`)**:
   - Updated `Entry` interface with `priority?: string | null`.
   - Added backward-compatible priority accessor `getEntryPriority(entry) = entry.priority || (isIssuePriority(entry.status) ? entry.status : "")`.
   - Updated client-side filters: `matchesPriority` filters on `getEntryPriority(entry)`.
   - Updated table view, card view, detail modal, and CSV/PDF/Sheet exports to use `getEntryPriority(entry)` for issue logs and `entry.status` for test cases.
6. **Badges & i18n (`status-badges.tsx`, `en.ts`, `ar.ts`)**:
   - Added `OPEN` (blue tone) and `CLOSED` (green tone) to `STATUS_META`.
   - Added localized translations for `"status.open"` and `"status.closed"` in English and Arabic.

---

### 5. Multi-Statement Transaction Audit

- **Single-Statement Operations:** Single-statement operations (`prisma.project.delete`, `prisma.table.delete`, `prisma.user.delete`, `prisma.entry.update` soft-delete) rely on native SQLite cascading deletes and single-statement ACID atomicity. Wrapping them in application-level `$transaction` is unnecessary and introduces deadlocks under SQLite.
- **Multi-Statement Operations:** Operations requiring multi-statement atomicity (such as `VerificationProof` consumption in `src/lib/auth/verification.ts`) already use `prisma.$transaction(async (tx) => ...)`.
- **Concurrency & Race Conditions:** Project creation name uniqueness checks (`findMany` followed by `create`) rely on application-level checks. In high-concurrency environments, race conditions could lead to duplicate project names if requests arrive in parallel. This is addressed in Phase 2, Step 2.5 (Concurrency & Conflict Resolution).

---

### 6. Verification and Test Results

#### Fresh & Upgrade Migration Suite (`npm run test:migrations`)
- `all project migrations initialize a fresh disposable database`: PASSED
- `Step 1.5 migration upgrades a safe pre-Step-1.5 database without losing records`: PASSED
- `Step 2.2 performance indexes migration upgrades existing database preserving data and adding indexes`: PASSED
- `Step 2.3 schema consistency & priority normalization upgrades existing database preserving test cases, backfilling issue priorities, and activating constraints`: PASSED

#### Security & Integration Suite (`npm run test:integration`)
- 66 tests passed (10 test suites), including:
  - `validateAndNormalizeEntryInput correctly processes test case and issue log inputs`: PASSED
  - `Prisma CRUD persists dedicated priority for issues and null priority for test cases`: PASSED
  - `Database constraints actively reject invalid direct SQL writes`: PASSED

#### HTTP Security Suite (`npm run test:security:http`)
- 14 tests passed, including:
  - `entry API creates and filters issue logs with priority and test cases with status`: PASSED

#### Full CI Suite (`npm run test:ci`)
- Unit tests: 3 passed
- Migration tests: 4 passed
- Integration tests: 66 passed
- Build test: 1 passed
- HTTP tests: 14 passed
- Playwright E2E tests: 2 passed
- **Total: 90 tests passed, 0 failures.**

#### Static Analysis & Quality Gates
- TypeScript (`npx tsc --noEmit --incremental false`): 0 errors
- Biome (`npx biome lint .`): 171 files checked, 0 errors, 0 warnings
- Database Checksum: `bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615` (unmodified)

---

### 7. Remaining Issues for Step 2.4

- Foreign key constraint enforcement (`PRAGMA foreign_keys = ON;` per-connection enforcement in Prisma client).
- Cascade deletion audit for soft-deleted entries vs hard-deleted parent tables.
- Verification of orphan record cleanup in legacy databases.

