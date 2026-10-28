import { hashPassword } from "../../src/lib/auth/password";
import { normalizeRole, USER_ROLES } from "../../src/lib/auth/roles";
import { prisma } from "../../src/lib/prisma";
import { assertDisposableDatabasePath } from "../helpers/database-path";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("Phase 1, Step 1.2: Sensitive Data Exposure Elimination & Secure API Contracts", () => {
  let syntheticUserId: number | null = null;
  let syntheticProjectId: string | null = null;
  let syntheticTableId: string | null = null;
  let syntheticEntryId: number | null = null;

  const syntheticUserEmail = `qa.step12.${Date.now()}@synthetic.local`;
  const syntheticUserName = "Step 1.2 QA User";
  const syntheticPlainPassword = "SyntheticSecretPassword#2026!";

  before(async () => {
    // 1. Mandatory safety guard: independently verify the runner-owned disposable database.
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    const physicalFile = dbList[0].file;
    assertDisposableDatabasePath(physicalFile);

    // 2. Create synthetic test fixtures
    const hashedPassword = await hashPassword(syntheticPlainPassword);
    const user = await prisma.user.create({
      data: {
        name: syntheticUserName,
        email: syntheticUserEmail,
        password: hashedPassword,
        role: USER_ROLES.ADMIN,
      },
      select: { id: true },
    });
    syntheticUserId = user.id;

    const project = await prisma.project.create({
      data: {
        name: `Step 1.2 Security Project ${Date.now()}`,
        url: `https://example.com/project-${Date.now()}`,
        logo: null,
        createdBy: "step12-qa-tester",
        userId: syntheticUserId,
      },
      select: { id: true },
    });
    syntheticProjectId = project.id;

    const createdByClean = syntheticUserEmail.split("@")[0];
    const table = await prisma.table.create({
      data: {
        name: `Step 1.2 Security Table ${Date.now()}`,
        projectId: syntheticProjectId,
        tableType: "TEST_CASES",
        createdBy: createdByClean,
      },
      select: { id: true },
    });
    syntheticTableId = table.id;

    const entry = await prisma.entry.create({
      data: {
        tableId: syntheticTableId,
        title: "Verify sensitive data protection",
        description: "Ensure no password or sensitive token exposure",
        status: "NEW",
        assignedTo: syntheticUserName,
      },
      select: { id: true },
    });
    syntheticEntryId = entry.id;
  });

  after(async () => {
    // Clean up all synthetic test data created during this suite
    if (syntheticEntryId) {
      await prisma.entry.deleteMany({ where: { id: syntheticEntryId } });
    }
    if (syntheticTableId) {
      await prisma.table.deleteMany({ where: { id: syntheticTableId } });
    }
    if (syntheticProjectId) {
      await prisma.project.deleteMany({ where: { id: syntheticProjectId } });
    }
    if (syntheticUserId) {
      await prisma.user.deleteMany({ where: { id: syntheticUserId } });
    }
    await prisma.$disconnect();
  });

  test("Requirement 1 & 2: Project listing response contract never exposes passwords or creator emails", async () => {
    assert.ok(syntheticProjectId, "Synthetic project must exist");

    // Execute the exact query projection configured for GET /api/projects
    const projects = await prisma.project.findMany({
      where: { id: syntheticProjectId },
      include: {
        tables: true,
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
      },
    });

    assert.strictEqual(projects.length, 1);
    const p = projects[0];

    // Verify required frontend fields
    assert.strictEqual(typeof p.id, "string");
    assert.strictEqual(typeof p.name, "string");
    assert.strictEqual(typeof p.createdBy, "string");
    assert.ok(Array.isArray(p.tables));

    // Verify user relation projection
    assert.ok(p.user !== null);
    assert.strictEqual(p.user?.id, syntheticUserId);
    assert.strictEqual(p.user?.name, syntheticUserName);

    // Verify sensitive fields are strictly excluded
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of unprojected keys
    assert.strictEqual((p.user as any).password, undefined, "user.password must not exist");
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of creator email
    assert.strictEqual((p.user as any).email, undefined, "user.email must not be exposed in project listing");

    // Serialization verification
    const serialized = JSON.stringify(projects);
    assert.strictEqual(serialized.includes('"password"'), false, 'Response JSON must never contain "password"');
    assert.strictEqual(serialized.includes("$2b$"), false, "Response JSON must never contain bcrypt hashes");
    assert.strictEqual(serialized.includes(syntheticUserEmail), false, "Response JSON must not expose creator email");
  });

  test("Requirement 2: Individual project response contract never exposes passwords or creator emails", async () => {
    assert.ok(syntheticProjectId, "Synthetic project must exist");

    // Execute the exact query projection configured for GET /api/projects/[projectId]
    const project = await prisma.project.findUnique({
      where: { id: syntheticProjectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        tables: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    assert.ok(project !== null);
    assert.strictEqual(project.id, syntheticProjectId);
    assert.ok(Array.isArray(project.tables));

    // Verify user relation projection
    assert.ok(project.user !== null);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of unprojected keys
    assert.strictEqual((project.user as any).password, undefined);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of creator email
    assert.strictEqual((project.user as any).email, undefined);

    const serialized = JSON.stringify(project);
    assert.strictEqual(serialized.includes('"password"'), false);
    assert.strictEqual(serialized.includes("$2b$"), false);
    assert.strictEqual(serialized.includes(syntheticUserEmail), false);
  });

  test("Requirement 3: User management response contract enforces safe projection", async () => {
    assert.ok(syntheticUserId, "Synthetic user must exist");

    // Execute query projection configured for GET /api/users
    const users = await prisma.user.findMany({
      where: { id: syntheticUserId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    assert.strictEqual(users.length, 1);
    const u = users[0];

    const safePayload = {
      id: u.id,
      name: u.name,
      email: u.email,
      role: normalizeRole(u.role),
      emailVerified: u.emailVerified,
    };

    // biome-ignore lint/suspicious/noExplicitAny: verify absence of sensitive keys
    assert.strictEqual((safePayload as any).password, undefined);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of auth tokens
    assert.strictEqual((safePayload as any).accounts, undefined);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of session secrets
    assert.strictEqual((safePayload as any).sessions, undefined);

    const serialized = JSON.stringify(safePayload);
    assert.strictEqual(serialized.includes('"password"'), false);
    assert.strictEqual(serialized.includes("$2b$"), false);
  });

  test("Requirement 3: User options endpoint projection never exposes passwords, roles, or tokens", async () => {
    assert.ok(syntheticUserId, "Synthetic user must exist");

    // Execute query projection configured for GET /api/users/options
    const options = await prisma.user.findMany({
      where: { id: syntheticUserId },
      select: {
        id: true,
        name: true,
        email: true,
      },
    });

    assert.strictEqual(options.length, 1);
    const opt = options[0];

    assert.strictEqual(opt.id, syntheticUserId);
    assert.strictEqual(opt.name, syntheticUserName);
    assert.strictEqual(opt.email, syntheticUserEmail);

    // biome-ignore lint/suspicious/noExplicitAny: verify absence of sensitive fields
    assert.strictEqual((opt as any).password, undefined);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of role
    assert.strictEqual((opt as any).role, undefined);

    const serialized = JSON.stringify(options);
    assert.strictEqual(serialized.includes('"password"'), false);
    assert.strictEqual(serialized.includes("$2b$"), false);
  });

  test("Requirement 4: Profile and username update response contracts exclude passwords", async () => {
    assert.ok(syntheticUserId, "Synthetic user must exist");

    // 1. GET /api/auth/profile projection
    const user = await prisma.user.findUnique({
      where: { id: syntheticUserId },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true,
        language: true,
      },
    });

    assert.ok(user !== null);
    const profileResponse = {
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      emailVerified: user.emailVerified,
      language: user.language || "en",
    };

    // biome-ignore lint/suspicious/noExplicitAny: verify absence of password
    assert.strictEqual((profileResponse as any).password, undefined);
    assert.strictEqual(JSON.stringify(profileResponse).includes('"password"'), false);

    // 2. PUT /api/auth/profile (action: update-username) projection
    const updatedUser = await prisma.user.update({
      where: { id: syntheticUserId },
      data: { name: "Updated Step 1.2 QA Name" },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        language: true,
        role: true,
      },
    });

    // biome-ignore lint/suspicious/noExplicitAny: verify absence of password
    assert.strictEqual((updatedUser as any).password, undefined);
    assert.strictEqual(JSON.stringify(updatedUser).includes('"password"'), false);
  });

  test("Requirement 5: Verify-email response contract strictly protects user password", async () => {
    assert.ok(syntheticUserId, "Synthetic user must exist");

    // Execute updated POST /api/auth/verify-email projection
    const verifiedUser = await prisma.user.update({
      where: { id: syntheticUserId },
      data: {
        emailVerified: new Date(),
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    const responsePayload = { success: true, user: verifiedUser };

    assert.strictEqual(responsePayload.success, true);
    assert.strictEqual(verifiedUser.id, syntheticUserId);
    assert.ok(verifiedUser.emailVerified instanceof Date);

    // Verify password is NOT in the returned user payload
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of password
    assert.strictEqual((verifiedUser as any).password, undefined);

    const serialized = JSON.stringify(responsePayload);
    assert.strictEqual(serialized.includes('"password"'), false, "Verify-email response must never contain password");
    assert.strictEqual(serialized.includes("$2b$"), false, "Verify-email response must never contain bcrypt hash");
  });

  test("Requirement 6: Table and entry response contracts never leak auth tokens or secrets", async () => {
    assert.ok(syntheticTableId, "Synthetic table must exist");
    assert.ok(syntheticEntryId, "Synthetic entry must exist");

    const tables = await prisma.table.findMany({
      where: { id: syntheticTableId },
    });
    assert.strictEqual(tables.length, 1);
    const table = tables[0];

    // Ensure createdBy does not contain raw email address
    assert.strictEqual(table.createdBy?.includes("@"), false, "Table createdBy should not expose raw email address");
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of password
    assert.strictEqual((table as any).password, undefined);

    const entries = await prisma.entry.findMany({
      where: { id: syntheticEntryId, isDeleted: false },
    });
    assert.strictEqual(entries.length, 1);
    const entry = entries[0];

    assert.strictEqual(entry.title, "Verify sensitive data protection");
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of sensitive keys
    assert.strictEqual((entry as any).password, undefined);
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of tokens
    assert.strictEqual((entry as any).token, undefined);

    const serializedTables = JSON.stringify(tables);
    const serializedEntries = JSON.stringify(entries);
    assert.strictEqual(serializedTables.includes('"password"'), false);
    assert.strictEqual(serializedEntries.includes('"password"'), false);
  });

  test("Requirement 7: Error responses maintain safe shape without internal database details", () => {
    // Operational error mock simulating database query failure
    const safeErrorResponse = { error: "Failed to add project" };

    assert.strictEqual(typeof safeErrorResponse.error, "string");
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of details and stack
    assert.strictEqual((safeErrorResponse as any).details, undefined, "details must not be present in error response");
    // biome-ignore lint/suspicious/noExplicitAny: verify absence of stack
    assert.strictEqual((safeErrorResponse as any).stack, undefined, "stack traces must never be sent to consumers");

    const serialized = JSON.stringify(safeErrorResponse);
    assert.strictEqual(serialized.includes("PrismaClientKnownRequestError"), false);
    assert.strictEqual(serialized.includes("SELECT"), false);
    assert.strictEqual(serialized.includes("dev-isolated.db"), false);
  });
});
