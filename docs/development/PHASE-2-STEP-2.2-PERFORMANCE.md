# Phase 2, Step 2.2: Database Performance Indexing, Bounded Queries & Pagination

## Overview

In Step 2.2 of Phase 2 (Database Integrity & Reliability), targeted database performance indexes were introduced to resolve full table scan bottlenecks on high-frequency query paths, and strict, bounded pagination was implemented across project, table, and entry listing endpoints.

- **Branch:** `phase/2-database-integrity`
- **Starting Commit:** `c9d817feb5e0c41a33c97731037162f8b23b9cd1`
- **Migration:** `20261028020000_performance_indexes`
- **Baseline DB SHA-256:** `bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615` (Verified unchanged)

---

## 1. Indexes Added & Query Justification

A baseline query audit revealed that foreign key and list queries throughout NexuTS executed full table scans (`SCAN TABLE`) and required in-memory temporary B-Trees for sorting (`USE TEMP B-TREE FOR ORDER BY`).

| Target Model | Index Definition | Leading Column | Primary Query Patterns & Justification |
| :--- | :--- | :--- | :--- |
| `Account` | `Account(userId)` | `userId` | NextAuth account lookup and cascade deletion by user ID (`WHERE userId = ?`). Prior state performed a full table scan of `Account`. |
| `Session` | `Session(userId)` | `userId` | User session invalidation and session rotation (`WHERE userId = ?`). Prior state performed a full scan across all active sessions. |
| `Project` | `Project(userId)` | `userId` | Non-admin project listings (`WHERE userId = ? ORDER BY createdAt DESC`). Allows direct index scan for user projects. |
| `Table` | `Table(projectId)` | `projectId` | QA table queries scoped to a project (`WHERE projectId = ? ORDER BY createdAt DESC`). Replaces full table scan of `Table`. |
| `Entry` | `Entry(tableId, isDeleted)` | `tableId` | Active entry lookups in QA Boards (`WHERE tableId = ? AND isDeleted = false ORDER BY createdAt DESC`). Eliminates full scan of `Entry`. |

### Rejected Indexes
- **`Entry(isDeleted)` alone:** Rejected as redundant and ineffective. `isDeleted` has low cardinality (nearly all records are `0`) and all production queries filter by `tableId` first. The composite index `(tableId, isDeleted)` satisfies all table-scoped lookups with maximum selectivity.
- **`Project(name)` / `Table(name)`:** Rejected at this stage. Case-insensitive deduplication in route handlers relies on runtime `.trim().toLowerCase()` comparison rather than database collation. Adding a plain index would not optimize the existing normalized comparison.

---

## 2. Before vs. After Query Plan Evidence

Representative queries were analyzed on disposable SQLite databases using `EXPLAIN QUERY PLAN` before and after applying migration `20261028020000_performance_indexes`:

### 1. Project Listing Query (`WHERE userId = ? ORDER BY createdAt DESC`)
- **Before:**
  ```text
  SCAN Project
  USE TEMP B-TREE FOR ORDER BY
  ```
- **After:**
  ```text
  SEARCH Project USING INDEX Project_userId_idx (userId=?)
  USE TEMP B-TREE FOR ORDER BY
  ```

### 2. QA Table Listing Query (`WHERE projectId = ? ORDER BY createdAt DESC`)
- **Before:**
  ```text
  SCAN Table
  USE TEMP B-TREE FOR ORDER BY
  ```
- **After:**
  ```text
  SEARCH Table USING INDEX Table_projectId_idx (projectId=?)
  USE TEMP B-TREE FOR ORDER BY
  ```

### 3. QA Entry Listing Query (`WHERE tableId = ? AND isDeleted = false ORDER BY createdAt DESC`)
- **Before:**
  ```text
  SCAN Entry
  USE TEMP B-TREE FOR ORDER BY
  ```
- **After:**
  ```text
  SEARCH Entry USING INDEX Entry_tableId_isDeleted_idx (tableId=? AND isDeleted=?)
  USE TEMP B-TREE FOR ORDER BY
  ```

### 4. Account Lookup (`WHERE userId = ?`)
- **Before:**
  ```text
  SCAN Account
  ```
- **After:**
  ```text
  SEARCH Account USING INDEX Account_userId_idx (userId=?)
  ```

### 5. Session Lookup (`WHERE userId = ?`)
- **Before:**
  ```text
  SCAN Session
  ```
- **After:**
  ```text
  SEARCH Session USING INDEX Session_userId_idx (userId=?)
  ```

---

## 3. Bounded Pagination Architecture & Contracts

Unbounded list queries have been replaced with bounded, deterministic pagination managed by shared utility `src/lib/pagination.ts`.

### Parameter Rules
- `page`: Optional positive integer (`>= 1`). Default: `1`. Non-integers, zeros, or negatives return `HTTP 400 Bad Request`.
- `limit`: Optional positive integer (`1 <= limit <= 100`). Default: `50` (or `20` for dashboards). Out-of-bounds or non-integers return `HTTP 400 Bad Request`.
- `format`: Optional format selector (`format=array`). If specified, returns direct array for backwards compatibility while supplying pagination metadata via response headers.

### Deterministic Tie-Breaker Ordering
To prevent record skipping or duplication across pages when entries share identical timestamps, all listings enforce a unique composite order:
```ts
orderBy: [{ createdAt: "desc" }, { id: "desc" }]
```

### Standard Response Envelope
```json
{
  "items": [ /* records */ ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "totalPages": 3,
    "hasMore": true
  }
}
```

### Standard Response Headers
- `X-Total-Count`: Total matching records.
- `X-Page`: Current page index.
- `X-Limit`: Items per page.
- `X-Total-Pages`: Total calculated pages.

---

## 4. Endpoints Updated

1. [src/app/api/projects/route.ts](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/api/projects/route.ts#L9-L49):
   - Bounded queries with `skip` and `take`.
   - Preserves user ownership filter (`where: user.isAdmin ? {} : { userId: user.id }`).
   - Supports `page`, `limit`, and `format=array`.
2. [src/app/api/tables/route.ts](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/api/tables/route.ts#L11-L53):
   - Requires `projectId` and validates ownership prior to executing paginated queries.
   - Enforces `Table_projectId_idx` index utilization.
3. [src/app/api/tables/[tableId]/entries/route.ts](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/api/tables/[tableId]/entries/route.ts#L12-L73):
   - Validates table access and project boundaries prior to query execution.
   - Filters out soft-deleted entries (`isDeleted: false`).
   - Supports optional server-side filter parameters: `search`, `status`, `assignedTo`, `username`.
4. [src/app/api/entries/route.ts](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/api/entries/route.ts#L11-L71):
   - Added `GET` endpoint accepting `tableId` with consistent authorization and pagination contracts.

---

## 5. UI Compatibility & Frontend Changes

To satisfy the critical requirement **"do not silently return only the first page to an existing consumer that expects the complete dataset"**, both frontend consumers were updated:

### 1. Projects Dashboard ([projects-dashboard.tsx](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/(main)/dashboard/qa-boards/_components/projects-dashboard.tsx#L89-L135))
- Updated `fetchProjects` to parse both `{ items, pagination }` and legacy array payloads.
- Added pagination state (`page`, `limit`, `totalPages`, `totalProjects`).
- Added responsive pagination footer with Previous/Next navigation and current page indicator when `totalPages > 1`.
- Cleaned up event listeners and modal callbacks to preserve state after creation and editing.

### 2. QA Boards Data Table ([data-table.tsx](file:///mnt/samsungSSD/Projects/Nexumind/NexuTS/src/app/(main)/dashboard/qa-boards/_components/data-table.tsx#L127-L185))
- Updated `fetchEntries` to request paginated chunks and handle envelope structures.
- Added interactive pagination controls bar below the table and card views:
  - Rows per page dropdown (`20`, `50`, `100`).
  - Total entries indicator (`Showing X-Y of Z entries`).
  - Previous and Next page buttons with disabled states.
- **Export Compatibility Safeguard:** Updated CSV, PDF, and Excel export handlers (`exportToCSV`, `exportToPDF`, `exportToSheet`). When total records exceed the current page size (`totalEntries > entries.length`), `fetchAllExportRows` pages through the dataset in bounded batches of 100 before compiling the document. This prevents truncated exports and avoids memory exhaustion from single unbounded queries.

### 3. Attachment Safety Evaluation
- In `data-table.tsx`, table rows do not render images directly (only checking for presence), while card views and detail modals render `screenshotClipUrl`.
- Removing `screenshotClipUrl` from list responses would break card thumbnails and detail previews until blob storage migration (Step 2.5) is implemented.
- Because list requests are strictly bounded (max 50-100 entries per page), per-request memory usage is strictly bounded. Full separation of media into an asset-streaming endpoint is scheduled for Step 2.5.

---

## 6. Migration Verification & Safe Deployment Plan

### Migration Details
- **Directory:** `prisma/migrations/20261028020000_performance_indexes/`
- **File:** `migration.sql`
- **Operation:** Additive only (`CREATE INDEX ...`). No table locks, column drops, or destructive statements.

### Verifications Conducted
1. **Fresh Database:** Initializes all 4 migrations in sequence; confirms all 5 indexes exist in SQLite.
2. **Upgrade Database:** Pre-Step-2.2 database with synthetic User, Project, Table, Entry, Account, and Session records was upgraded; verified 100% record retention and verified query plans immediately switch to indexed scans.

### Production Deployment Procedure
When deploying to existing environments:
1. Back up database (`prisma/dev.db` or target production database).
2. Execute `npx prisma migrate deploy`.
3. Migration will run instantaneously (creating secondary B-trees on existing tables without data rewriting).
4. Verify index status with `PRAGMA index_list('Entry');`.

---

## 7. Automated Test Summary

The full test suite passed with 0 failures:

| Test Suite | Command | Status | Coverage |
| :--- | :--- | :--- | :--- |
| Unit Tests | `npm run test:unit` | Pass (3/3) | Strict validation, fail-closed DB routing, original DB protection. |
| Migration Tests | `npm run test:migrations` | Pass (3/3) | Fresh migration, Step 1.5 upgrade, Step 2.2 upgrade with index & plan validation. |
| Integration Tests | `npm run test:integration` | Pass (63/63) | Index verification, query plan validation, parameter boundary rejection, multi-page traversal, deterministic tie-breaking, ownership filtering. |
| Production Build | `npm run test:build` | Pass | Next.js 16.4.3 production build on disposable database. |
| HTTP Security Tests | `npm run test:security:http` | Pass (13/13) | Production HTTP requests testing bounded pagination, 400 rejection, header verification, format fallback. |
| Playwright E2E | `npm run test:e2e:run` | Pass (2/2) | End-to-end browser workflows: registration, login, project creation, table creation, entry management. |
| TypeScript Check | `npx tsc --noEmit` | Pass (0 errors) | Strict compilation pass across all files. |
| Biome Linter | `npx biome lint .` | Pass (0 errors) | Clean across all 169 files. |

---

## 8. Remaining Concerns & Recommendations for Step 2.3

1. **Transaction Wrapping & Concurrency (Step 2.3):**
   - Cascading deletions (e.g. deleting a project with child tables and entries) should execute within Prisma `$transaction` blocks to maintain atomicity and avoid orphan records on interrupted queries.
2. **Data Consistency & Input Normalization (Step 2.4):**
   - Project name deduplication currently relies on JavaScript `.trim().toLowerCase()`. Database collation (e.g. `COLLATE NOCASE`) or normalized unique constraints should be evaluated in Step 2.4.
3. **Attachment Blob Migration (Step 2.5):**
   - Base64 data URLs stored directly in SQLite entries should be migrated to filesystem or object storage with lightweight foreign key references.
