import { type AuthenticatedUser, resolveProjectAccess, resolveTableAccess } from "../../src/lib/auth/access-control";
import { hashPassword } from "../../src/lib/auth/password";
import { USER_ROLES } from "../../src/lib/auth/roles";
import { buildPaginatedResponse, DEFAULT_PAGE_SIZE, parsePaginationParams } from "../../src/lib/pagination";
import { prisma } from "../../src/lib/prisma";
import { assertDisposableDatabasePath } from "../helpers/database-path";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("Phase 2, Step 2.2: Database Performance Indexing, Bounded Queries & Pagination", () => {
  let userAId: number;
  let userBId: number;
  let adminId: number;

  let projectAId: string;
  let projectBId: string;

  let tableAId: string;
  let tableBId: string;

  let userAContext: AuthenticatedUser;
  let _userBContext: AuthenticatedUser;
  let _adminContext: AuthenticatedUser;

  const totalSyntheticEntries = 125;

  before(async () => {
    // 1. Mandatory safety guard: verify the runner-owned disposable database.
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    assertDisposableDatabasePath(dbList[0].file);

    const dummyPasswordHash = await hashPassword("SyntheticPass#2026!");

    // 2. Create Users
    const userA = await prisma.user.create({
      data: {
        name: "User A",
        email: `perf.user.a.${Date.now()}@synthetic.local`,
        password: dummyPasswordHash,
        role: USER_ROLES.USER,
      },
    });
    userAId = userA.id;
    userAContext = {
      id: userA.id,
      name: userA.name || "User A",
      email: userA.email || "",
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    const userB = await prisma.user.create({
      data: {
        name: "User B",
        email: `perf.user.b.${Date.now()}@synthetic.local`,
        password: dummyPasswordHash,
        role: USER_ROLES.USER,
      },
    });
    userBId = userB.id;
    _userBContext = {
      id: userB.id,
      name: userB.name || "User B",
      email: userB.email || "",
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    const admin = await prisma.user.create({
      data: {
        name: "Admin User",
        email: `perf.admin.${Date.now()}@synthetic.local`,
        password: dummyPasswordHash,
        role: USER_ROLES.ADMIN,
      },
    });
    adminId = admin.id;
    _adminContext = {
      id: admin.id,
      name: admin.name || "Admin User",
      email: admin.email || "",
      role: USER_ROLES.ADMIN,
      isAdmin: true,
    };

    // 3. Create Projects
    const projectA = await prisma.project.create({
      data: {
        name: "Perf Project A",
        userId: userAId,
        createdBy: "User A",
      },
    });
    projectAId = projectA.id;

    const projectB = await prisma.project.create({
      data: {
        name: "Perf Project B",
        userId: userBId,
        createdBy: "User B",
      },
    });
    projectBId = projectB.id;

    // 4. Create Tables
    const tableA = await prisma.table.create({
      data: {
        name: "Test Cases A",
        projectId: projectAId,
        tableType: "TEST_CASES",
        createdBy: "User A",
      },
    });
    tableAId = tableA.id;

    const tableB = await prisma.table.create({
      data: {
        name: "Test Cases B",
        projectId: projectBId,
        tableType: "TEST_CASES",
        createdBy: "User B",
      },
    });
    tableBId = tableB.id;

    // 5. Seed 125 Synthetic Entries in tableA
    const entryData = [];
    for (let i = 1; i <= totalSyntheticEntries; i++) {
      entryData.push({
        tableId: tableAId,
        title: `Test Case ${i.toString().padStart(4, "0")}`,
        description: `Description for test case ${i}`,
        status: i % 3 === 0 ? "FAIL" : "SUCCESS",
        assignedTo: i % 2 === 0 ? "QA Lead" : "QA Tester",
        username: "User A",
        isDeleted: false,
      });
    }
    // Chunked creation
    for (let i = 0; i < entryData.length; i += 25) {
      await prisma.entry.createMany({
        data: entryData.slice(i, i + 25),
      });
    }

    // Also seed a session and account for index testing
    await prisma.account.create({
      data: {
        userId: userAId,
        type: "oauth",
        provider: "github",
        providerAccountId: `gh-${userAId}`,
      },
    });
    await prisma.session.create({
      data: {
        sessionToken: `token-perf-${userAId}`,
        userId: userAId,
        expires: new Date(Date.now() + 86400000),
      },
    });
  });

  after(async () => {
    // Clean up
    await prisma.entry.deleteMany({ where: { tableId: { in: [tableAId, tableBId] } } });
    await prisma.table.deleteMany({ where: { id: { in: [tableAId, tableBId] } } });
    await prisma.project.deleteMany({ where: { id: { in: [projectAId, projectBId] } } });
    await prisma.session.deleteMany({ where: { userId: { in: [userAId, userBId, adminId] } } });
    await prisma.account.deleteMany({ where: { userId: { in: [userAId, userBId, adminId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
  });

  describe("Requirement 1: Index Presence & SQLite Query Plan Verification", () => {
    test("All required secondary indexes exist in sqlite_master", async () => {
      const rows = await prisma.$queryRawUnsafe<Array<{ name: string; tbl_name: string }>>(
        "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE '%_idx';",
      );
      const indexNames = rows.map((r) => r.name);
      assert.ok(indexNames.includes("Project_userId_idx"), "Project_userId_idx must exist");
      assert.ok(indexNames.includes("Table_projectId_idx"), "Table_projectId_idx must exist");
      assert.ok(indexNames.includes("Entry_tableId_isDeleted_idx"), "Entry_tableId_isDeleted_idx must exist");
      assert.ok(indexNames.includes("Account_userId_idx"), "Account_userId_idx must exist");
      assert.ok(indexNames.includes("Session_userId_idx"), "Session_userId_idx must exist");
    });

    test("EXPLAIN QUERY PLAN confirms Project queries use Project_userId_idx", async () => {
      const plan = await prisma.$queryRawUnsafe<Array<{ detail: string }>>(
        `EXPLAIN QUERY PLAN SELECT id FROM Project WHERE userId = ${userAId} ORDER BY createdAt DESC;`,
      );
      const usesIndex = plan.some((p) => p.detail.includes("Project_userId_idx"));
      const details = plan.map((p) => p.detail).join("; ");
      assert.ok(usesIndex, `Query plan must use Project_userId_idx. Actual: ${details}`);
    });

    test("EXPLAIN QUERY PLAN confirms Table queries use Table_projectId_idx", async () => {
      const plan = await prisma.$queryRawUnsafe<Array<{ detail: string }>>(
        `EXPLAIN QUERY PLAN SELECT id FROM "Table" WHERE projectId = '${projectAId}' ORDER BY createdAt DESC;`,
      );
      const usesIndex = plan.some((p) => p.detail.includes("Table_projectId_idx"));
      const details = plan.map((p) => p.detail).join("; ");
      assert.ok(usesIndex, `Query plan must use Table_projectId_idx. Actual: ${details}`);
    });

    test("EXPLAIN QUERY PLAN confirms Entry queries use Entry_tableId_isDeleted_idx", async () => {
      const plan = await prisma.$queryRawUnsafe<Array<{ detail: string }>>(
        `EXPLAIN QUERY PLAN SELECT id FROM Entry WHERE tableId = '${tableAId}' AND isDeleted = 0 ORDER BY createdAt DESC;`,
      );
      const usesIndex = plan.some((p) => p.detail.includes("Entry_tableId_isDeleted_idx"));
      const details = plan.map((p) => p.detail).join("; ");
      assert.ok(usesIndex, `Query plan must use Entry_tableId_isDeleted_idx. Actual: ${details}`);
    });

    test("EXPLAIN QUERY PLAN confirms Account queries use Account_userId_idx", async () => {
      const plan = await prisma.$queryRawUnsafe<Array<{ detail: string }>>(
        `EXPLAIN QUERY PLAN SELECT id FROM Account WHERE userId = ${userAId};`,
      );
      const usesIndex = plan.some((p) => p.detail.includes("Account_userId_idx"));
      const details = plan.map((p) => p.detail).join("; ");
      assert.ok(usesIndex, `Query plan must use Account_userId_idx. Actual: ${details}`);
    });

    test("EXPLAIN QUERY PLAN confirms Session queries use Session_userId_idx", async () => {
      const plan = await prisma.$queryRawUnsafe<Array<{ detail: string }>>(
        `EXPLAIN QUERY PLAN SELECT id FROM Session WHERE userId = ${userAId};`,
      );
      const usesIndex = plan.some((p) => p.detail.includes("Session_userId_idx"));
      const details = plan.map((p) => p.detail).join("; ");
      assert.ok(usesIndex, `Query plan must use Session_userId_idx. Actual: ${details}`);
    });
  });

  describe("Requirement 2: Pagination Parameter Validation", () => {
    test("Uses default pagination when no params are provided", () => {
      const res = parsePaginationParams(new URLSearchParams());
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.params.page, 1);
        assert.strictEqual(res.params.limit, DEFAULT_PAGE_SIZE);
        assert.strictEqual(res.params.skip, 0);
        assert.strictEqual(res.params.take, DEFAULT_PAGE_SIZE);
      }
    });

    test("Parses valid page and limit parameters", () => {
      const res = parsePaginationParams(new URLSearchParams("page=3&limit=25"));
      assert.strictEqual(res.ok, true);
      if (res.ok) {
        assert.strictEqual(res.params.page, 3);
        assert.strictEqual(res.params.limit, 25);
        assert.strictEqual(res.params.skip, 50);
        assert.strictEqual(res.params.take, 25);
      }
    });

    test("Rejects non-integer and negative page values", () => {
      for (const invalid of ["0", "-1", "abc", "1.5", "NaN", "null"]) {
        const res = parsePaginationParams(new URLSearchParams(`page=${invalid}`));
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
          assert.ok(res.error.includes("Invalid 'page' parameter"));
        }
      }
    });

    test("Rejects limit values less than 1, greater than MAX_PAGE_SIZE, or non-integer", () => {
      for (const invalid of ["0", "-5", "101", "999", "abc", "20.5"]) {
        const res = parsePaginationParams(new URLSearchParams(`limit=${invalid}`));
        assert.strictEqual(res.ok, false);
        if (!res.ok) {
          assert.ok(res.error.includes("Invalid 'limit' parameter"));
        }
      }
    });
  });

  describe("Requirement 3: Bounded Query Execution & Pagination Correctness", () => {
    test("Multi-page retrieval traverses all synthetic entries without duplication or loss", async () => {
      const limit = 50;
      let currentPage = 1;
      let hasMore = true;
      const allRetrievedIds: number[] = [];

      while (hasMore) {
        const skip = (currentPage - 1) * limit;
        const [total, items] = await Promise.all([
          prisma.entry.count({ where: { tableId: tableAId, isDeleted: false } }),
          prisma.entry.findMany({
            where: { tableId: tableAId, isDeleted: false },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip,
            take: limit,
          }),
        ]);

        assert.strictEqual(total, totalSyntheticEntries);

        if (currentPage === 1) {
          assert.strictEqual(items.length, 50);
        } else if (currentPage === 2) {
          assert.strictEqual(items.length, 50);
        } else if (currentPage === 3) {
          assert.strictEqual(items.length, 25);
        }

        for (const item of items) {
          allRetrievedIds.push(item.id);
        }

        const totalPages = Math.ceil(total / limit);
        hasMore = currentPage < totalPages;
        currentPage++;
      }

      assert.strictEqual(allRetrievedIds.length, totalSyntheticEntries);
      const uniqueIds = new Set(allRetrievedIds);
      assert.strictEqual(uniqueIds.size, totalSyntheticEntries, "All 125 entries must be unique with zero duplicates");
    });

    test("Deterministic ordering with secondary tie-breaker id DESC", async () => {
      const items = await prisma.entry.findMany({
        where: { tableId: tableAId, isDeleted: false },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 30,
      });

      for (let i = 0; i < items.length - 1; i++) {
        const current = items[i];
        const next = items[i + 1];
        const currentMs = new Date(current.createdAt).getTime();
        const nextMs = new Date(next.createdAt).getTime();
        assert.ok(
          currentMs > nextMs || (currentMs === nextMs && current.id > next.id),
          `Ordering must be strictly deterministic: [${current.id}] before [${next.id}]`,
        );
      }
    });

    test("Empty page requested returns empty items with safe metadata", async () => {
      const limit = 50;
      const page = 99;
      const skip = (page - 1) * limit;

      const [total, items] = await Promise.all([
        prisma.entry.count({ where: { tableId: tableAId, isDeleted: false } }),
        prisma.entry.findMany({
          where: { tableId: tableAId, isDeleted: false },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip,
          take: limit,
        }),
      ]);

      assert.strictEqual(items.length, 0);
      assert.strictEqual(total, totalSyntheticEntries);
      const totalPages = Math.ceil(total / limit);
      assert.strictEqual(page > totalPages, true);
    });

    test("Soft-deleted entries are excluded from count and page items", async () => {
      // Soft delete 5 entries
      const entriesToSoftDelete = await prisma.entry.findMany({
        where: { tableId: tableAId, isDeleted: false },
        take: 5,
      });
      const deleteIds = entriesToSoftDelete.map((e) => e.id);

      await prisma.entry.updateMany({
        where: { id: { in: deleteIds } },
        data: { isDeleted: true },
      });

      try {
        const total = await prisma.entry.count({ where: { tableId: tableAId, isDeleted: false } });
        assert.strictEqual(total, totalSyntheticEntries - 5);

        const page1 = await prisma.entry.findMany({
          where: { tableId: tableAId, isDeleted: false },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: 50,
        });

        for (const item of page1) {
          assert.strictEqual(deleteIds.includes(item.id), false, `Soft-deleted entry ${item.id} must not appear`);
        }
      } finally {
        // Restore
        await prisma.entry.updateMany({
          where: { id: { in: deleteIds } },
          data: { isDeleted: false },
        });
      }
    });

    test("Ownership isolation holds across pagination", async () => {
      // User A should resolve projectA but NOT projectB
      const accessA = await resolveProjectAccess(projectAId, userAContext);
      assert.ok(accessA !== null);

      const accessB = await resolveProjectAccess(projectBId, userAContext);
      assert.strictEqual(accessB, null);

      // User A table access
      const tableAccessA = await resolveTableAccess(tableAId, userAContext);
      assert.ok(tableAccessA !== null);

      const tableAccessB = await resolveTableAccess(tableBId, userAContext);
      assert.strictEqual(tableAccessB, null);

      // Non-admin project count only counts own projects
      const userAProjects = await prisma.project.count({ where: { userId: userAId } });
      assert.strictEqual(userAProjects, 1);
    });

    test("buildPaginatedResponse produces correct envelope and headers", async () => {
      const mockItems = [{ id: "1" }, { id: "2" }];
      const response = buildPaginatedResponse(mockItems, 55, { page: 2, limit: 20 });
      assert.strictEqual(response.status, 200);

      const json = await response.json();
      assert.deepStrictEqual(json.items, mockItems);
      assert.strictEqual(json.pagination.page, 2);
      assert.strictEqual(json.pagination.limit, 20);
      assert.strictEqual(json.pagination.total, 55);
      assert.strictEqual(json.pagination.totalPages, 3);
      assert.strictEqual(json.pagination.hasMore, true);

      assert.strictEqual(response.headers.get("X-Total-Count"), "55");
      assert.strictEqual(response.headers.get("X-Page"), "2");
      assert.strictEqual(response.headers.get("X-Limit"), "20");
      assert.strictEqual(response.headers.get("X-Total-Pages"), "3");
    });
  });
});
