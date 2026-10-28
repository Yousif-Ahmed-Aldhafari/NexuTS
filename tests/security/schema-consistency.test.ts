import { type AuthenticatedUser, resolveEntryAccess } from "../../src/lib/auth/access-control";
import { hashPassword } from "../../src/lib/auth/password";
import { USER_ROLES } from "../../src/lib/auth/roles";
import { prisma } from "../../src/lib/prisma";
import { validateAndNormalizeEntryInput } from "../../src/lib/qa-entry-schema";
import { assertDisposableDatabasePath } from "../helpers/database-path";
import assert from "node:assert";
import test, { before, describe } from "node:test";

describe("Phase 2, Step 2.3: Schema Consistency, Entry Priority Normalization & Database Constraints", () => {
  let userContext: AuthenticatedUser;
  let projectId: string;
  let testCasesTableId: string;
  let issueLogsTableId: string;

  before(async () => {
    // 1. Mandatory safety guard: verify the runner-owned disposable database.
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    assertDisposableDatabasePath(dbList[0].file);

    const dummyPasswordHash = await hashPassword("SyntheticPass#2026!");

    const user = await prisma.user.create({
      data: {
        name: "Schema User",
        email: `schema.user.${Date.now()}@synthetic.local`,
        password: dummyPasswordHash,
        role: USER_ROLES.USER,
      },
    });
    userContext = {
      id: user.id,
      name: user.name || "Schema User",
      email: user.email || "",
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    const project = await prisma.project.create({
      data: {
        name: `Schema Integrity Project ${Date.now()}`,
        userId: user.id,
        createdBy: user.name,
      },
    });
    projectId = project.id;

    const tcTable = await prisma.table.create({
      data: {
        name: "Test Cases Board",
        projectId: project.id,
        tableType: "TEST_CASES",
        createdBy: user.name,
      },
    });
    testCasesTableId = tcTable.id;

    const issueTable = await prisma.table.create({
      data: {
        name: "Issue Logs Board",
        projectId: project.id,
        tableType: "ISSUE_LOGS",
        createdBy: user.name,
      },
    });
    issueLogsTableId = issueTable.id;
  });

  test("validateAndNormalizeEntryInput correctly processes test case and issue log inputs", () => {
    // Test Case: valid success
    const tcSuccess = validateAndNormalizeEntryInput(
      {
        title: "Test Login Flow",
        username: "tester1",
        description: "Verify login succeeds with valid creds",
        stepsToReproduce: "1. Enter email\n2. Enter pass\n3. Click Login",
        status: "SUCCESS",
        result: "User logged in",
        expectedResult: "User logged in",
      },
      "TEST_CASES",
    );
    assert.ok(tcSuccess.data, "Should succeed for valid test case");
    assert.equal(tcSuccess.data?.status, "SUCCESS");
    assert.equal(tcSuccess.data?.priority, null, "Test cases must have priority null");
    assert.equal(tcSuccess.data?.fixStatus, "FIXED");

    // Test Case: valid fail with fixStatus
    const tcFail = validateAndNormalizeEntryInput(
      {
        title: "Test Checkout Crash",
        username: "tester1",
        description: "Checkout button throws 500",
        stepsToReproduce: "1. Add item\n2. Click checkout",
        status: "FAIL",
        fixStatus: "NEEDS_FIX",
        result: "500 Error",
        expectedResult: "Order confirmed",
      },
      "TEST_CASES",
    );
    assert.ok(tcFail.data);
    assert.equal(tcFail.data?.status, "FAIL");
    assert.equal(tcFail.data?.priority, null);
    assert.equal(tcFail.data?.fixStatus, "NEEDS_FIX");

    // Test Case: missing fixStatus on fail
    const tcFailNoFix = validateAndNormalizeEntryInput(
      {
        title: "Test Fail No Fix",
        username: "tester1",
        description: "Desc",
        stepsToReproduce: "Steps",
        status: "FAIL",
        result: "Fail",
        expectedResult: "Pass",
      },
      "TEST_CASES",
    );
    assert.equal(tcFailNoFix.error, "Fix Status is required when status is Fail.");

    // Issue Log: valid open issue with priority
    const issueOpen = validateAndNormalizeEntryInput(
      {
        title: "Button alignment off by 2px",
        username: "designer1",
        description: "Alignment issue on mobile viewports",
        stepsToReproduce: "Inspect button on 375px width",
        priority: "HIGH",
        fixStatus: "NEEDS_FIX",
      },
      "ISSUE_LOGS",
    );
    assert.ok(issueOpen.data, "Should succeed for valid issue");
    assert.equal(issueOpen.data?.priority, "HIGH");
    assert.equal(issueOpen.data?.status, "OPEN");
    assert.equal(issueOpen.data?.fixStatus, "NEEDS_FIX");
    assert.equal(issueOpen.data?.result, "");
    assert.equal(issueOpen.data?.expectedResult, "");

    // Issue Log: valid closed issue with fixStatus FIXED
    const issueFixed = validateAndNormalizeEntryInput(
      {
        title: "Typo in footer",
        username: "copywriter",
        description: "Copyright year was 2025",
        stepsToReproduce: "Look at footer",
        priority: "LOW",
        fixStatus: "FIXED",
      },
      "ISSUE_LOGS",
    );
    assert.ok(issueFixed.data);
    assert.equal(issueFixed.data?.priority, "LOW");
    assert.equal(issueFixed.data?.status, "CLOSED");

    // Issue Log: backward compatibility with legacy status containing priority
    const issueLegacy = validateAndNormalizeEntryInput(
      {
        title: "Legacy Issue",
        username: "legacy_user",
        description: "Desc",
        stepsToReproduce: "Steps",
        status: "MEDIUM",
        fixStatus: "NEEDS_RETEST",
      },
      "ISSUE_LOGS",
    );
    assert.ok(issueLegacy.data);
    assert.equal(issueLegacy.data?.priority, "MEDIUM");
    assert.equal(issueLegacy.data?.status, "OPEN");

    // Issue Log: invalid priority
    const issueBadPriority = validateAndNormalizeEntryInput(
      {
        title: "Bad Priority",
        username: "user",
        description: "Desc",
        stepsToReproduce: "Steps",
        priority: "URGENT",
        fixStatus: "NEEDS_FIX",
      },
      "ISSUE_LOGS",
    );
    assert.equal(issueBadPriority.error, "Priority must be High, Medium, or Low.");
  });

  test("Prisma CRUD persists dedicated priority for issues and null priority for test cases", async () => {
    // 1. Create a Test Case
    const tcEntry = await prisma.entry.create({
      data: {
        tableId: testCasesTableId,
        title: "Prisma TC Entry",
        description: "Verify login",
        stepsToReproduce: "1. Login",
        status: "SUCCESS",
        priority: null,
        fixStatus: "FIXED",
        result: "Success",
        expectedResult: "Success",
        username: "prisma_tester",
      },
    });
    assert.equal(tcEntry.status, "SUCCESS");
    assert.equal(tcEntry.priority, null);

    // 2. Create an Issue Log
    const issueEntry = await prisma.entry.create({
      data: {
        tableId: issueLogsTableId,
        title: "Prisma Issue Entry",
        description: "Crash on click",
        stepsToReproduce: "Click",
        status: "OPEN",
        priority: "HIGH",
        fixStatus: "NEEDS_FIX",
        username: "prisma_tester",
      },
    });
    assert.equal(issueEntry.status, "OPEN");
    assert.equal(issueEntry.priority, "HIGH");

    // 3. Query with priority filter
    const highPriorityIssues = await prisma.entry.findMany({
      where: {
        tableId: issueLogsTableId,
        priority: "HIGH",
        isDeleted: false,
      },
    });
    assert.ok(highPriorityIssues.some((e) => e.id === issueEntry.id));

    const testCasesWithoutPriority = await prisma.entry.findMany({
      where: {
        tableId: testCasesTableId,
        priority: null,
        isDeleted: false,
      },
    });
    assert.ok(testCasesWithoutPriority.some((e) => e.id === tcEntry.id));

    // 4. Update priority independently from status
    const updatedIssue = await prisma.entry.update({
      where: { id: issueEntry.id },
      data: {
        priority: "MEDIUM",
        fixStatus: "NEEDS_RETEST",
      },
    });
    assert.equal(updatedIssue.priority, "MEDIUM");
    assert.equal(updatedIssue.status, "OPEN"); // Status remained OPEN

    // Retest access control resolution
    const resolved = await resolveEntryAccess(issueEntry.id, userContext);
    assert.ok(resolved, "User must still access their entry");
    assert.equal(resolved?.id, issueEntry.id);
  });

  test("Database constraints actively reject invalid direct SQL writes", async () => {
    // 1. Invalid Entry.priority CHECK constraint
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Entry" ("tableId", "title", "description", "status", "priority", "updatedAt")
           VALUES ('${issueLogsTableId}', 'Direct SQL Invalid Priority', 'Desc', 'OPEN', 'CRITICAL', CURRENT_TIMESTAMP);`,
        );
      },
      /CHECK constraint failed/,
      "Database must reject invalid priority via CHECK constraint",
    );

    // 2. Invalid Table.tableType trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Table" ("id", "projectId", "name", "tableType", "updatedAt")
           VALUES ('tbl-invalid-${Date.now()}', '${projectId}', 'Invalid Board', 'KANBAN', CURRENT_TIMESTAMP);`,
        );
      },
      /INVALID_TABLE_TYPE/,
      "Database must reject invalid tableType on insert",
    );

    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `UPDATE "Table" SET "tableType" = 'SPRINT_BOARD' WHERE "id" = '${testCasesTableId}';`,
        );
      },
      /INVALID_TABLE_TYPE/,
      "Database must reject invalid tableType on update",
    );

    // 3. Invalid Entry.status trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Entry" ("tableId", "title", "description", "status", "updatedAt")
           VALUES ('${testCasesTableId}', 'Direct SQL Invalid Status', 'Desc', 'IN_PROGRESS', CURRENT_TIMESTAMP);`,
        );
      },
      /INVALID_ENTRY_STATUS/,
      "Database must reject invalid status on insert",
    );

    await assert.rejects(
      async () => {
        const existing = await prisma.entry.findFirst({ where: { tableId: testCasesTableId } });
        assert.ok(existing);
        await prisma.$executeRawUnsafe(`UPDATE "Entry" SET "status" = 'BLOCKED' WHERE "id" = ${existing.id};`);
      },
      /INVALID_ENTRY_STATUS/,
      "Database must reject invalid status on update",
    );

    // 4. Invalid Entry.fixStatus trigger
    await assert.rejects(
      async () => {
        await prisma.$executeRawUnsafe(
          `INSERT INTO "Entry" ("tableId", "title", "description", "status", "fixStatus", "updatedAt")
           VALUES ('${testCasesTableId}', 'Direct SQL Invalid Fix', 'Desc', 'FAIL', 'WONT_FIX', CURRENT_TIMESTAMP);`,
        );
      },
      /INVALID_FIX_STATUS/,
      "Database must reject invalid fixStatus on insert",
    );

    await assert.rejects(
      async () => {
        const existing = await prisma.entry.findFirst({ where: { tableId: testCasesTableId } });
        assert.ok(existing);
        await prisma.$executeRawUnsafe(
          `UPDATE "Entry" SET "fixStatus" = 'CANNOT_REPRODUCE' WHERE "id" = ${existing.id};`,
        );
      },
      /INVALID_FIX_STATUS/,
      "Database must reject invalid fixStatus on update",
    );
  });
});
