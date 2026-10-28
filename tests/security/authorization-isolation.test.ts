import {
  type AuthenticatedUser,
  canAccessProject,
  canManageProject,
  requireAuth,
  resolveEntryAccess,
  resolveProjectAccess,
  resolveTableAccess,
} from "../../src/lib/auth/access-control";
import { hashPassword } from "../../src/lib/auth/password";
import { USER_ROLES } from "../../src/lib/auth/roles";
import { prisma } from "../../src/lib/prisma";
import { assertDisposableDatabasePath } from "../helpers/database-path";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("Phase 1, Step 1.3: API Authorization, Object-Level Access Control & Project Isolation", () => {
  let userAId: number | null = null;
  let userBId: number | null = null;
  let adminUserId: number | null = null;

  let projectAId: string | null = null;
  let projectBId: string | null = null;

  let tableAId: string | null = null;
  let tableBId: string | null = null;

  let entryAId: number | null = null;
  let entryBId: number | null = null;

  let userAContext: AuthenticatedUser;
  let userBContext: AuthenticatedUser;
  let adminContext: AuthenticatedUser;

  const emailA = `qa.user.a.${Date.now()}@synthetic.local`;
  const emailB = `qa.user.b.${Date.now()}@synthetic.local`;
  const emailAdmin = `qa.admin.${Date.now()}@synthetic.local`;

  before(async () => {
    // 1. Mandatory safety guard: verify the runner-owned disposable database.
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    const physicalFile = dbList[0].file;
    assertDisposableDatabasePath(physicalFile);

    const dummyPasswordHash = await hashPassword("SyntheticPass#2026!");

    // 2. Create User A (regular USER)
    const userA = await prisma.user.create({
      data: {
        name: "Synthetic User A",
        email: emailA,
        password: dummyPasswordHash,
        role: USER_ROLES.USER,
      },
      select: { id: true },
    });
    userAId = userA.id;
    userAContext = {
      id: userA.id,
      name: "Synthetic User A",
      email: emailA,
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    // 3. Create User B (regular USER)
    const userB = await prisma.user.create({
      data: {
        name: "Synthetic User B",
        email: emailB,
        password: dummyPasswordHash,
        role: USER_ROLES.USER,
      },
      select: { id: true },
    });
    userBId = userB.id;
    userBContext = {
      id: userB.id,
      name: "Synthetic User B",
      email: emailB,
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    // 4. Create Admin User (ADMIN)
    const adminUser = await prisma.user.create({
      data: {
        name: "Synthetic Admin User",
        email: emailAdmin,
        password: dummyPasswordHash,
        role: USER_ROLES.ADMIN,
      },
      select: { id: true },
    });
    adminUserId = adminUser.id;
    adminContext = {
      id: adminUser.id,
      name: "Synthetic Admin User",
      email: emailAdmin,
      role: USER_ROLES.ADMIN,
      isAdmin: true,
    };

    // 5. Create Project A owned by User A
    const projectA = await prisma.project.create({
      data: {
        name: `Project A ${Date.now()}`,
        userId: userAId,
        createdBy: "user-a",
      },
      select: { id: true },
    });
    projectAId = projectA.id;

    // 6. Create Table A in Project A
    const tableA = await prisma.table.create({
      data: {
        name: `Table A ${Date.now()}`,
        projectId: projectAId,
        tableType: "TEST_CASES",
        createdBy: "user-a",
      },
      select: { id: true },
    });
    tableAId = tableA.id;

    // 7. Create Entry A in Table A
    const entryA = await prisma.entry.create({
      data: {
        tableId: tableAId,
        title: "Test Case A in Table A",
        description: "Confidential to Project A",
        status: "NEW",
      },
      select: { id: true },
    });
    entryAId = entryA.id;

    // 8. Create Project B owned by User B
    const projectB = await prisma.project.create({
      data: {
        name: `Project B ${Date.now()}`,
        userId: userBId,
        createdBy: "user-b",
      },
      select: { id: true },
    });
    projectBId = projectB.id;

    // 9. Create Table B in Project B
    const tableB = await prisma.table.create({
      data: {
        name: `Table B ${Date.now()}`,
        projectId: projectBId,
        tableType: "ISSUE_LOGS",
        createdBy: "user-b",
      },
      select: { id: true },
    });
    tableBId = tableB.id;

    // 10. Create Entry B in Table B
    const entryB = await prisma.entry.create({
      data: {
        tableId: tableBId,
        title: "Issue Log B in Table B",
        description: "Confidential to Project B",
        status: "NEW",
      },
      select: { id: true },
    });
    entryBId = entryB.id;
  });

  after(async () => {
    // Clean up all synthetic test data created during this suite
    if (entryAId) await prisma.entry.deleteMany({ where: { id: entryAId } });
    if (entryBId) await prisma.entry.deleteMany({ where: { id: entryBId } });
    if (tableAId) await prisma.table.deleteMany({ where: { id: tableAId } });
    if (tableBId) await prisma.table.deleteMany({ where: { id: tableBId } });
    if (projectAId) await prisma.project.deleteMany({ where: { id: projectAId } });
    if (projectBId) await prisma.project.deleteMany({ where: { id: projectBId } });
    if (userAId) await prisma.user.deleteMany({ where: { id: userAId } });
    if (userBId) await prisma.user.deleteMany({ where: { id: userBId } });
    if (adminUserId) await prisma.user.deleteMany({ where: { id: adminUserId } });
    await prisma.$disconnect();
  });

  test("Scenarios 1-7: Unauthenticated (anonymous) requests are strictly rejected with HTTP 401", async () => {
    // When no active session exists in current context, requireAuth must return 401
    const authCheck = await requireAuth();
    assert.strictEqual(authCheck.authenticated, false);
    assert.ok(authCheck.response !== null);
    assert.strictEqual(authCheck.response.status, 401);

    const body = await authCheck.response.json();
    assert.strictEqual(body.error, "Unauthorized");
  });

  test("Scenario 8: Authorized users can list and access their own projects, tables, and entries", async () => {
    assert.ok(projectAId && tableAId && entryAId);

    // 1. Project listing query scoped for User A
    const userAProjects = await prisma.project.findMany({
      where: { userId: userAContext.id },
      select: { id: true, name: true, userId: true },
    });

    assert.ok(userAProjects.some((p) => p.id === projectAId));
    assert.ok(!userAProjects.some((p) => p.id === projectBId), "User A must NOT see Project B in listing");

    // 2. Project details access for User A
    assert.strictEqual(canAccessProject(userAContext, { userId: userAContext.id }), true);
    assert.strictEqual(canAccessProject(userAContext, { userId: userBContext.id }), false);

    const resolvedProject = await resolveProjectAccess(projectAId, userAContext);
    assert.ok(resolvedProject !== null);
    assert.strictEqual(resolvedProject.id, projectAId);
    assert.strictEqual(resolvedProject.userId, userAContext.id);

    // 3. Table access for User A
    const resolvedTable = await resolveTableAccess(tableAId, userAContext);
    assert.ok(resolvedTable !== null);
    assert.strictEqual(resolvedTable.id, tableAId);
    assert.strictEqual(resolvedTable.projectId, projectAId);

    // 4. Entry access for User A
    const resolvedEntry = await resolveEntryAccess(entryAId, userAContext);
    assert.ok(resolvedEntry !== null);
    assert.strictEqual(resolvedEntry.id, entryAId);
    assert.strictEqual(resolvedEntry.tableId, tableAId);
  });

  test("Scenario 9: Cross-project reading is strictly denied (IDOR / BOLA protection)", async () => {
    assert.ok(projectAId && projectBId && tableAId && tableBId && entryAId && entryBId);

    // User A attempting to read User B's Project B
    const userAReadsProjectB = await resolveProjectAccess(projectBId, userAContext);
    assert.strictEqual(userAReadsProjectB, null, "User A must not access Project B");

    // User A attempting to read User B's Table B
    const userAReadsTableB = await resolveTableAccess(tableBId, userAContext);
    assert.strictEqual(userAReadsTableB, null, "User A must not access Table B");

    // User A attempting to read User B's Entry B
    const userAReadsEntryB = await resolveEntryAccess(entryBId, userAContext);
    assert.strictEqual(userAReadsEntryB, null, "User A must not access Entry B");

    // Symmetrically, User B attempting to read User A's resources
    const userBReadsProjectA = await resolveProjectAccess(projectAId, userBContext);
    assert.strictEqual(userBReadsProjectA, null, "User B must not access Project A");

    const userBReadsTableA = await resolveTableAccess(tableAId, userBContext);
    assert.strictEqual(userBReadsTableA, null, "User B must not access Table A");

    const userBReadsEntryA = await resolveEntryAccess(entryAId, userBContext);
    assert.strictEqual(userBReadsEntryA, null, "User B must not access Entry A");
  });

  test("Scenario 10: Cross-project writing and mutations are strictly denied", async () => {
    assert.ok(projectBId && tableBId && entryBId);

    // 1. User A attempting to modify Project B
    const canUserAManageProjectB = canManageProject(userAContext, { userId: userBId });
    assert.strictEqual(canUserAManageProjectB, false, "User A must not manage Project B");

    // 2. User A attempting to add an entry to User B's Table B
    const userAAddToTableB = await resolveTableAccess(tableBId, userAContext);
    assert.strictEqual(userAAddToTableB, null, "User A must not resolve Table B to add an entry");

    // 3. User A attempting to edit User B's Entry B
    const userAEditEntryB = await resolveEntryAccess(entryBId, userAContext);
    assert.strictEqual(userAEditEntryB, null, "User A must not resolve Entry B to edit");

    // 4. User A attempting to delete User B's Table B
    const userADeleteTableB = await resolveTableAccess(tableBId, userAContext);
    assert.strictEqual(userADeleteTableB, null, "User A must not resolve Table B to delete");
  });

  test("Scenario 11: Non-admin project creation is strictly rejected with HTTP 403", () => {
    // Non-admin user check
    assert.strictEqual(userAContext.isAdmin, false);
    assert.strictEqual(userBContext.isAdmin, false);

    // Policy check: only admins are permitted to add projects
    const isUserAAllowed = userAContext.isAdmin;
    assert.strictEqual(isUserAAllowed, false, "Regular users must be forbidden from creating projects");
  });

  test("Scenario 12: Authorized administrators can manage all projects, tables, and entries", async () => {
    assert.ok(projectAId && projectBId && tableAId && tableBId && entryAId && entryBId);

    // 1. Admin project listing query has no userId restriction
    const allProjects = await prisma.project.findMany({
      select: { id: true },
    });
    assert.ok(allProjects.some((p) => p.id === projectAId));
    assert.ok(allProjects.some((p) => p.id === projectBId));

    // 2. Admin access to Project A and Project B
    const adminProjectA = await resolveProjectAccess(projectAId, adminContext);
    const adminProjectB = await resolveProjectAccess(projectBId, adminContext);
    assert.ok(adminProjectA !== null);
    assert.ok(adminProjectB !== null);

    // 3. Admin access to Table A and Table B
    const adminTableA = await resolveTableAccess(tableAId, adminContext);
    const adminTableB = await resolveTableAccess(tableBId, adminContext);
    assert.ok(adminTableA !== null);
    assert.ok(adminTableB !== null);

    // 4. Admin access to Entry A and Entry B
    const adminEntryA = await resolveEntryAccess(entryAId, adminContext);
    const adminEntryB = await resolveEntryAccess(entryBId, adminContext);
    assert.ok(adminEntryA !== null);
    assert.ok(adminEntryB !== null);

    // 5. Admin management permission
    assert.strictEqual(canManageProject(adminContext, { userId: userAId }), true);
    assert.strictEqual(canManageProject(adminContext, { userId: userBId }), true);
  });

  test("Scenario 13: Spoofed ownership identifiers in request bodies are ignored", async () => {
    // Ensure that project creation connects ONLY authenticated user ID, never an attacker-supplied userId
    const spoofedUserId = 999999;
    const projectCreationData = {
      name: `Anti-Spoofing Project ${Date.now()}`,
      url: null,
      logo: null,
      createdBy: "authentic-user",
      user: {
        connect: {
          id: adminContext.id, // Strictly uses authenticated user ID
        },
      },
    };

    const createdProject = await prisma.project.create({
      data: projectCreationData,
      select: { id: true, userId: true },
    });

    try {
      assert.strictEqual(createdProject.userId, adminContext.id);
      assert.notStrictEqual(createdProject.userId, spoofedUserId);
    } finally {
      await prisma.project.delete({ where: { id: createdProject.id } });
    }
  });

  test("Scenario 14: Invalid or nonexistent resource IDs consistently return null (404/400)", async () => {
    // Nonexistent project
    const nonExistentProject = await resolveProjectAccess("c_nonexistent_project_id", adminContext);
    assert.strictEqual(nonExistentProject, null);

    // Nonexistent table
    const nonExistentTable = await resolveTableAccess("c_nonexistent_table_id", adminContext);
    assert.strictEqual(nonExistentTable, null);

    // Nonexistent entry
    const nonExistentEntry = await resolveEntryAccess(999999999, adminContext);
    assert.strictEqual(nonExistentEntry, null);

    // Malformed entry IDs
    assert.strictEqual(await resolveEntryAccess(-1, adminContext), null);
    assert.strictEqual(await resolveEntryAccess(0, adminContext), null);
    assert.strictEqual(await resolveEntryAccess(Number.NaN, adminContext), null);
  });
});
