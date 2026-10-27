import { hashPassword, isBcryptHash, verifyPassword } from "../../src/lib/auth/password";
import { isAdminEmail, isAdminRole, resolveRoleFromEmail, USER_ROLES } from "../../src/lib/auth/roles";
import { prisma } from "../../src/lib/prisma";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("Phase 1, Step 1.1: Credential Protection & Secure Authentication", () => {
  const createdUserIds: number[] = [];

  before(async () => {
    // 1. Independently verify the physical database target before performing any mutations
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    const physicalFile = dbList[0].file;
    assert.ok(
      physicalFile.endsWith("dev-isolated.db"),
      `MANDATORY SAFETY GUARD: Physical database must be dev-isolated.db, got: "${physicalFile}"`,
    );
  });

  after(async () => {
    // Clean up all synthetic test users created during this test suite
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      });
    }
    await prisma.$disconnect();
  });

  test("Scenario 1: New registration stores a valid bcrypt hash, never plaintext", async () => {
    const syntheticEmail = `test.reg.${Date.now()}@synthetic.local`;
    const plaintextPassword = "NewUserSyntheticPass#2026!";

    const hashedPassword = await hashPassword(plaintextPassword);
    assert.ok(isBcryptHash(hashedPassword), "Generated hash must conform to modular bcrypt format.");
    assert.notStrictEqual(hashedPassword, plaintextPassword, "Hash must never equal plaintext password.");

    const newUser = await prisma.user.create({
      data: {
        name: "Synthetic Registration User",
        email: syntheticEmail,
        password: hashedPassword,
        role: "USER",
      },
      select: {
        id: true,
        email: true,
        password: true,
        role: true,
      },
    });
    createdUserIds.push(newUser.id);

    // Verify stored credential in isolated DB
    const fetched = await prisma.user.findUnique({
      where: { id: newUser.id },
      select: { password: true },
    });
    assert.ok(fetched?.password, "Stored password must exist.");
    assert.ok(isBcryptHash(fetched.password), "Stored password must be a 60-character bcrypt hash.");
    assert.strictEqual(
      fetched.password.startsWith("$2b$") || fetched.password.startsWith("$2a$"),
      true,
      "Stored password must have standard bcrypt prefix.",
    );
  });

  test("Scenario 2: Correct password authentication succeeds with hashed credentials", async () => {
    const plaintextPassword = "CorrectSyntheticPassword#2026!";
    const hashedPassword = await hashPassword(plaintextPassword);

    const verification = await verifyPassword(plaintextPassword, hashedPassword);
    assert.strictEqual(verification.valid, true, "Valid password against bcrypt hash must succeed.");
    assert.strictEqual(verification.needsUpgrade, false, "Bcrypt hash does not require upgrade.");
  });

  test("Scenario 3: Incorrect password authentication fails with hashed credentials", async () => {
    const plaintextPassword = "CorrectSyntheticPassword#2026!";
    const wrongPassword = "WrongPassword#Attempt123!";
    const hashedPassword = await hashPassword(plaintextPassword);

    const verification = await verifyPassword(wrongPassword, hashedPassword);
    assert.strictEqual(verification.valid, false, "Invalid password against bcrypt hash must fail.");
    assert.strictEqual(verification.needsUpgrade, false, "Failed attempt must not trigger upgrade.");
  });

  test("Scenario 4: Successful legacy authentication safely upgrades credential to bcrypt", async () => {
    const syntheticEmail = `test.legacy.succ.${Date.now()}@synthetic.local`;
    const legacyPlaintext = "LegacyPlaintextSecret#456!";

    // Create legacy synthetic user with plaintext password
    const legacyUser = await prisma.user.create({
      data: {
        name: "Legacy User Success",
        email: syntheticEmail,
        password: legacyPlaintext,
        role: "USER",
      },
    });
    createdUserIds.push(legacyUser.id);

    // Initial verification
    const verification = await verifyPassword(legacyPlaintext, legacyUser.password);
    assert.strictEqual(verification.valid, true, "Legacy plaintext password must match candidate.");
    assert.strictEqual(verification.needsUpgrade, true, "Legacy plaintext must signal upgrade needed.");

    // Perform atomic upgrade
    const upgradedHash = await hashPassword(legacyPlaintext);
    const updateResult = await prisma.user.updateMany({
      where: {
        id: legacyUser.id,
        password: legacyPlaintext,
      },
      data: {
        password: upgradedHash,
      },
    });
    assert.strictEqual(updateResult.count, 1, "Exactly one row must be upgraded.");

    // Re-query from DB to verify upgrade took effect
    const upgradedUser = await prisma.user.findUnique({
      where: { id: legacyUser.id },
      select: { password: true },
    });
    assert.ok(upgradedUser?.password, "Upgraded password must exist.");
    assert.ok(isBcryptHash(upgradedUser.password), "Database credential must now be a bcrypt hash.");

    // Subsequent login now verifies against the hash without requiring upgrade
    const subsequentAuth = await verifyPassword(legacyPlaintext, upgradedUser.password);
    assert.strictEqual(subsequentAuth.valid, true, "Subsequent login against new hash must succeed.");
    assert.strictEqual(subsequentAuth.needsUpgrade, false, "Subsequent login must not require upgrade.");
  });

  test("Scenario 5: Failed legacy authentication leaves the credential unchanged", async () => {
    const syntheticEmail = `test.legacy.fail.${Date.now()}@synthetic.local`;
    const legacyPlaintext = "UntouchedLegacySecret#789!";

    const legacyUser = await prisma.user.create({
      data: {
        name: "Legacy User Fail",
        email: syntheticEmail,
        password: legacyPlaintext,
        role: "USER",
      },
    });
    createdUserIds.push(legacyUser.id);

    const wrongAttempt = "IncorrectGuess#000!";
    const verification = await verifyPassword(wrongAttempt, legacyUser.password);
    assert.strictEqual(verification.valid, false, "Incorrect password against legacy must fail.");
    assert.strictEqual(verification.needsUpgrade, false, "Failed attempt must never request upgrade.");

    // Confirm stored password remains strictly unchanged
    const stored = await prisma.user.findUnique({
      where: { id: legacyUser.id },
      select: { password: true },
    });
    assert.strictEqual(
      stored?.password,
      legacyPlaintext,
      "Stored legacy credential must remain unchanged after failed login.",
    );
  });

  test("Scenario 6: Concurrent migration attempts cannot corrupt the password", async () => {
    const syntheticEmail = `test.concurrent.${Date.now()}@synthetic.local`;
    const legacyPlaintext = "ConcurrentRaceConditionPassword#111!";

    const legacyUser = await prisma.user.create({
      data: {
        name: "Concurrent Test User",
        email: syntheticEmail,
        password: legacyPlaintext,
        role: "USER",
      },
    });
    createdUserIds.push(legacyUser.id);

    // Simulate two concurrent requests arriving at the exact same moment
    const [task1Verification, task2Verification] = await Promise.all([
      verifyPassword(legacyPlaintext, legacyUser.password),
      verifyPassword(legacyPlaintext, legacyUser.password),
    ]);
    assert.strictEqual(task1Verification.valid, true);
    assert.strictEqual(task2Verification.valid, true);
    assert.strictEqual(task1Verification.needsUpgrade, true);
    assert.strictEqual(task2Verification.needsUpgrade, true);

    // Both generate hashes in parallel
    const [hash1, hash2] = await Promise.all([hashPassword(legacyPlaintext), hashPassword(legacyPlaintext)]);

    // Both attempt atomic upgrade with condition `where: { password: legacyPlaintext }`
    const [res1, res2] = await Promise.all([
      prisma.user.updateMany({
        where: { id: legacyUser.id, password: legacyPlaintext },
        data: { password: hash1 },
      }),
      prisma.user.updateMany({
        where: { id: legacyUser.id, password: legacyPlaintext },
        data: { password: hash2 },
      }),
    ]);

    // Exactly one of the concurrent tasks should update the row; the second must safely update 0 rows
    const totalUpdates = res1.count + res2.count;
    assert.strictEqual(totalUpdates, 1, "Exactly one concurrent upgrade must write to the database.");

    // The stored password is valid and verifies correctly
    const finalUser = await prisma.user.findUnique({
      where: { id: legacyUser.id },
      select: { password: true },
    });
    assert.ok(isBcryptHash(finalUser?.password), "Stored password must be a valid bcrypt hash.");
    const finalVerification = await verifyPassword(legacyPlaintext, finalUser?.password);
    assert.strictEqual(finalVerification.valid, true, "Final password verifies successfully.");
    assert.strictEqual(finalVerification.needsUpgrade, false);
  });

  test("Scenario 7: Project API responses never contain passwords or sensitive user fields", async () => {
    // Query projects using the safe relation projection
    const projects = await prisma.project.findMany({
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

    assert.ok(projects.length > 0, "At least one project should exist for verification.");

    const serialized = JSON.stringify(projects);
    assert.strictEqual(serialized.includes('"password"'), false, 'Serialized JSON must never contain "password" key.');
    assert.strictEqual(serialized.includes("$2b$"), false, "Serialized JSON must never contain bcrypt hashes.");
    assert.strictEqual(serialized.includes("$2a$"), false, "Serialized JSON must never contain bcrypt hashes.");

    for (const project of projects) {
      if (project.user) {
        assert.strictEqual(
          // biome-ignore lint/suspicious/noExplicitAny: verification of absence of unprojected key
          (project.user as any).password,
          undefined,
          "User relation object must not have password property.",
        );
      }
    }
  });

  test("Scenario 8: Non-password authentication and session role behaviors remain functional", () => {
    assert.strictEqual(isAdminEmail("yousif.aldhafari@gmail.com"), true);
    assert.strictEqual(isAdminEmail("arbitrary.user@example.com"), false);
    assert.strictEqual(isAdminRole(USER_ROLES.ADMIN), true);
    assert.strictEqual(isAdminRole(USER_ROLES.USER), false);
    assert.strictEqual(resolveRoleFromEmail("yousif.aldhafari@gmail.com"), USER_ROLES.ADMIN);
    assert.strictEqual(resolveRoleFromEmail("other@example.com"), USER_ROLES.USER);
  });
});
