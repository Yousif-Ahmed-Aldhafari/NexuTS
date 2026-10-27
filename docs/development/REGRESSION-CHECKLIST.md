# NexuTS — Regression Verification Checklist

This checklist defines the core verification matrix for NexuTS across all development phases. It contrasts checks manually/runtime verified in Phase 0 with required automated test suites to be built during Phase 1.

---

## 1. Regression Matrix by Functional Area

### 1.1 Database Isolation & Safety
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| `prisma/dev.db` remains unchanged | **VERIFIED** | SHA-256 checksum comparison (`bfc6da8...`) | CI step checking git status & checksum |
| `dev-isolated.db` receives local writes | **VERIFIED** | PRAGMA database_list and SQLite row queries | Unit test validating isolated SQLite connection |
| Fail-closed on missing DB path | **VERIFIED** | Runtime test with nonexistent DB parameter | Unit test for `src/lib/prisma.ts` exception throw |
| Git exclusions for DB and env | **VERIFIED** | `git check-ignore -v` on `.env.local` & `dev-isolated.db` | Pre-commit git hook / CI lint |

---

### 1.2 Authentication & Sessions
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| User registration (`POST /api/auth/register`) | **VERIFIED** | API runtime curl (synthetic user creation) | API integration test verifying DB insertion & role |
| Password hashing on registration | **UNVERIFIED (Defect)** | Stored in plaintext in Phase 0 | Integration test asserting bcrypt hash format |
| Plaintext password lazy migration | **PLANNED** | Scheduled for Step 1.1 | Integration test verifying hash upgrade upon login |
| Login credentials callback | **VERIFIED** | NextAuth `credentials` signin via curl | Integration test verifying JWT token issuance |
| Session token persistence | **VERIFIED** | `authjs.session-token` cookie inspection | Playwright test verifying session cookie lifecycle |
| Logout & session invalidation | **VERIFIED** | `POST /api/auth/signout` via curl | API & E2E test verifying cookie clear & 401 on profile |
| Auth error messaging | **VERIFIED** | Inspected error handling strings | Unit test for `authenticate` server action |

---

### 1.3 Role-Based Access Control (RBAC)
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| Non-admin access to `GET /api/users` | **VERIFIED** | Returned `HTTP 403 Forbidden` | API test asserting 403 for `USER` role |
| Non-admin access to `POST /api/projects`| **VERIFIED** | Returned `HTTP 403 Forbidden` | API test asserting 403 for `USER` role |
| Unauthenticated access to admin routes | **VERIFIED** | Returned `HTTP 401 Unauthorized` | API test asserting 401 for anonymous client |
| Dynamic database-driven admin role | **UNVERIFIED (Defect)** | Hardcoded email set in `src/lib/auth/roles.ts` | Integration test verifying role read from DB |

---

### 1.4 Route Protection & Middleware
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| Root `/` redirects to login | **VERIFIED** | Returned `HTTP 307` to `/auth/v2/login` | E2E test for root landing |
| Protected dashboard routes redirect | **VERIFIED** | All `/dashboard/*` returned `HTTP 307` | Integration test for unauthenticated route guards |
| Authenticated access to dashboards | **VERIFIED** | All `/dashboard/*` returned `HTTP 200` | E2E Playwright test navigating dashboard sidebar |
| Unauthorized page rendering | **VERIFIED** | `/unauthorized` returned `HTTP 200` | UI render test |

---

### 1.5 Project Management
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| Project listing (`GET /api/projects`) | **VERIFIED** | Returned JSON project list via Prisma | API test verifying project array structure |
| Project details (`GET /api/projects/[id]`) | **VERIFIED** | Returned project and embedded tables | API test verifying single project retrieval |
| Sensitive field stripping | **FAILED (Vulnerability)** | Password field publicly leaked in Phase 0 | Security test asserting `password` is undefined |
| Authentication requirement | **FAILED (Vulnerability)** | Publicly accessible anonymously in Phase 0 | Security test asserting 401 without session |
| Project creation & validation | **VERIFIED (Static)** | Analyzed `POST /api/projects` validation | Integration test covering name/URL uniqueness |

---

### 1.6 QA Boards & Tables
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| QA Boards navigation UI | **VERIFIED** | `/dashboard/qa-boards` rendered `HTTP 200` | Playwright test verifying project card clicks |
| Workspace view (`/dashboard/qa-boards/[id]`)| **VERIFIED** | Dynamic workspace route rendered `HTTP 200` | Playwright test verifying table tabs render |
| Table listing (`GET /api/tables?projectId=...`)| **VERIFIED** | Returned table array for project | API test asserting table retrieval by project |
| BOLA/IDOR authorization | **FAILED (Vulnerability)** | Any user can query any project's tables | Security test asserting 403 on cross-project access |
| Table creation (`POST /api/tables`) | **VERIFIED (Static)** | Code inspection of admin-only check | Integration test asserting admin table creation |

---

### 1.7 Test Case Entries
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| Entry retrieval (`GET /api/tables/[id]/entries`)| **VERIFIED** | Returned active non-deleted entries | API test asserting entry retrieval |
| Authentication requirement | **FAILED (Vulnerability)** | Publicly accessible anonymously in Phase 0 | Security test asserting 401 without session |
| Entry creation (`POST /api/entries`) | **VERIFIED (Static)** | Schema validation via `validateAndNormalize` | API test verifying payload validation |
| Entry update (`PUT /api/entries`) | **VERIFIED (Static)** | Verified partial update logic | Integration test verifying title/status updates |
| Entry soft-delete (`DELETE /api/entries`) | **VERIFIED (Static)** | Verified `isDeleted: true` flag update | Integration test verifying soft deletion filter |
| BOLA / IDOR entry mutation protection | **FAILED (Vulnerability)** | Anonymous/unauthorized mutations permitted | Security test asserting 401/403 on mutation |

---

### 1.8 Production Build & Quality Tooling
| Verification Check | Phase 0 Status | Verification Method | Phase 1 Automated Test Requirement |
| :--- | :---: | :--- | :--- |
| TypeScript compilation | **VERIFIED** | `tsc --noEmit` exited `0` | CI step `npx tsc --noEmit` |
| Biome lint rules | **VERIFIED** | `biome lint .` exited `0` (2 pre-existing warnings) | CI step `npx biome lint .` |
| Next.js production build | **VERIFIED** | Turbopack compiled 31 routes in 2.6 min | CI step `npm run build` |
| Import organization & formatting debt | **KNOWN DEBT** | 19 errors flagged by `biome check` | Dedicated cleanup step before Phase 1 merge |

