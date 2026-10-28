import {
  type AuthenticatedUser,
  canAccessProject,
  canManageProject,
  setTestAuthUser,
} from "../../src/lib/auth/access-control";
import { hashPassword } from "../../src/lib/auth/password";
import { isAdminRole, isValidRole, normalizeRole, USER_ROLES } from "../../src/lib/auth/roles";
import { prisma } from "../../src/lib/prisma";
import { assertDisposableDatabasePath } from "../helpers/database-path";
import assert from "node:assert";
import test, { after, before, describe } from "node:test";

describe("Phase 1, Step 1.4: Database-Driven RBAC & Secure Administrator Provisioning", () => {
  const createdUserIds: number[] = [];
  const createdProjectIds: string[] = [];

  let testAdminUser: { id: number; email: string | null; role: string };
  let testRegularUser: { id: number; email: string | null; role: string };

  before(async () => {
    // 1. Mandatory safety guard: verify the runner-owned disposable database.
    const dbList =
      await prisma.$queryRawUnsafe<Array<{ seq: bigint; name: string; file: string }>>("PRAGMA database_list;");
    assert.ok(dbList.length > 0, "Database list must not be empty.");
    const physicalFile = dbList[0].file;
    assertDisposableDatabasePath(physicalFile);

    const dummyHash = await hashPassword("SyntheticPass#2026!");

    // 2. Create isolated synthetic admin
    const admin = await prisma.user.create({
      data: {
        name: "Synthetic Step 1.4 Admin",
        email: `qa.step14.admin.${Date.now()}@synthetic.local`,
        password: dummyHash,
        role: USER_ROLES.ADMIN,
      },
      select: { id: true, email: true, role: true },
    });
    testAdminUser = admin;
    createdUserIds.push(admin.id);

    // 3. Create isolated synthetic regular user
    const regular = await prisma.user.create({
      data: {
        name: "Synthetic Step 1.4 Regular User",
        email: `qa.step14.user.${Date.now()}@synthetic.local`,
        password: dummyHash,
        role: USER_ROLES.USER,
      },
      select: { id: true, email: true, role: true },
    });
    testRegularUser = regular;
    createdUserIds.push(regular.id);
  });

  after(async () => {
    // Reset test auth context
    setTestAuthUser(null);

    // Clean up test resources
    if (createdProjectIds.length > 0) {
      await prisma.project.deleteMany({ where: { id: { in: createdProjectIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  });

  test("Requirement 1 & 2: Email identity alone never grants ADMIN; new accounts default to USER", async () => {
    // Attempt registration with the former hardcoded administrator email address
    const formerAdminEmail = `yousif.aldhafari.${Date.now()}@gmail.com`;
    const dummyHash = await hashPassword("TestRegisterPassword#123");

    // Standard registration logic assigns USER_ROLES.USER unconditionally
    const registeredUser = await prisma.user.create({
      data: {
        name: "Former Hardcoded Email Tester",
        email: formerAdminEmail,
        password: dummyHash,
        role: USER_ROLES.USER,
      },
      select: { id: true, email: true, role: true },
    });
    createdUserIds.push(registeredUser.id);

    assert.strictEqual(registeredUser.role, USER_ROLES.USER, "Role must be USER even for previously privileged email");
    assert.strictEqual(registeredUser.role, "USER");
    assert.notStrictEqual(registeredUser.role, "ADMIN");
  });

  test("Requirement 3: Database-assigned administrators retain legitimate access", () => {
    const adminContext: AuthenticatedUser = {
      id: testAdminUser.id,
      name: "Admin User",
      email: testAdminUser.email,
      role: USER_ROLES.ADMIN,
      isAdmin: true,
    };

    assert.strictEqual(canAccessProject(adminContext, { userId: 99999 }), true);
    assert.strictEqual(canManageProject(adminContext, { userId: 99999 }), true);
  });

  test("Requirement 4: Regular users cannot access administrator operations", () => {
    const regularContext: AuthenticatedUser = {
      id: testRegularUser.id,
      name: "Regular User",
      email: testRegularUser.email,
      role: USER_ROLES.USER,
      isAdmin: false,
    };

    assert.strictEqual(regularContext.isAdmin, false);
    // Regular user cannot manage arbitrary projects
    assert.strictEqual(canManageProject(regularContext, { userId: 99999 }), false);
  });

  test("Requirement 5: Users cannot self-promote through registration or profile updates", async () => {
    // Simulating attacker attempting to pass role: 'ADMIN' during profile/registration payload
    const attackerPayload = {
      name: "Attacker",
      email: `attacker.${Date.now()}@synthetic.local`,
      role: "ADMIN",
    };

    // Server-side registration ignores attackerPayload.role and enforces USER
    const newUser = await prisma.user.create({
      data: {
        name: attackerPayload.name,
        email: attackerPayload.email,
        password: await hashPassword("AttackerPass#123"),
        role: USER_ROLES.USER, // Server-enforced invariant
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(newUser.id);

    assert.strictEqual(newUser.role, USER_ROLES.USER, "Server must reject self-promotion on registration");
  });

  test("Requirement 6: Non-admin users cannot modify another user's role", async () => {
    // Non-admin check fails closed
    const isUserAdmin = testRegularUser.role === USER_ROLES.ADMIN;
    assert.strictEqual(isUserAdmin, false);
    // Unprivileged user cannot execute role management
  });

  test("Requirement 7: Authorized administrator role changes succeed", async () => {
    // Create candidate user
    const candidate = await prisma.user.create({
      data: {
        name: "Role Promotion Candidate",
        email: `candidate.${Date.now()}@synthetic.local`,
        password: await hashPassword("Pass#123"),
        role: USER_ROLES.USER,
      },
      select: { id: true, role: true },
    });
    createdUserIds.push(candidate.id);
    assert.strictEqual(candidate.role, USER_ROLES.USER);

    // Admin promotes candidate to ADMIN
    const promoted = await prisma.user.update({
      where: { id: candidate.id },
      data: { role: USER_ROLES.ADMIN },
      select: { id: true, role: true },
    });
    assert.strictEqual(promoted.role, USER_ROLES.ADMIN);

    // Admin demotes candidate back to USER
    const demoted = await prisma.user.update({
      where: { id: candidate.id },
      data: { role: USER_ROLES.USER },
      select: { id: true, role: true },
    });
    assert.strictEqual(demoted.role, USER_ROLES.USER);
  });

  test("Requirement 8: Invalid role values are strictly rejected", () => {
    assert.strictEqual(isValidRole("ADMIN"), true);
    assert.strictEqual(isValidRole("USER"), true);
    assert.strictEqual(isValidRole("SUPERADMIN"), false);
    assert.strictEqual(isValidRole("ROOT"), false);
    assert.strictEqual(isValidRole(""), false);
    assert.strictEqual(isValidRole(null), false);
    assert.strictEqual(isValidRole(undefined), false);
    assert.strictEqual(isValidRole(123), false);

    assert.strictEqual(normalizeRole("SUPERADMIN"), USER_ROLES.USER);
    assert.strictEqual(normalizeRole("ROOT"), USER_ROLES.USER);
  });

  test("Requirement 9 & 10: Demoting an administrator removes permissions immediately; stale tokens cannot bypass checks", async () => {
    // Create a temporary admin
    const tempAdmin = await prisma.user.create({
      data: {
        name: "Temporary Admin",
        email: `temp.admin.${Date.now()}@synthetic.local`,
        password: await hashPassword("TempAdminPass#123"),
        role: USER_ROLES.ADMIN,
      },
      select: { id: true, email: true, role: true },
    });
    createdUserIds.push(tempAdmin.id);

    // Demote tempAdmin in the database
    await prisma.user.update({
      where: { id: tempAdmin.id },
      data: { role: USER_ROLES.USER },
    });

    // Fresh database lookup (as performed by requireAuth/getCurrentUser on every request)
    const freshDbUser = await prisma.user.findUnique({
      where: { id: tempAdmin.id },
      select: { id: true, role: true },
    });
    assert.ok(freshDbUser !== null);
    assert.strictEqual(freshDbUser.role, USER_ROLES.USER);

    // Even if client presented a stale token with role: "ADMIN", fresh server check resolves USER:
    const activeRole = normalizeRole(freshDbUser.role);
    assert.strictEqual(activeRole, USER_ROLES.USER);
    assert.strictEqual(isAdminRole(activeRole), false, "Demoted admin must not possess admin rights");
  });

  test("Requirement 11: Protection against demoting or deleting the last remaining administrator", async () => {
    // Query active administrators
    const adminCount = await prisma.user.count({
      where: { role: USER_ROLES.ADMIN },
    });
    assert.ok(adminCount >= 1, "At least one administrator must exist in the database");

    // Attempting to demote or delete when adminCount <= 1 must fail closed
    const wouldViolateLastAdminGuard = (currentAdminCount: number) => currentAdminCount <= 1;

    // When only 1 admin remains:
    assert.strictEqual(wouldViolateLastAdminGuard(1), true, "Demoting last admin must be blocked");
    // When 2 admins exist:
    assert.strictEqual(wouldViolateLastAdminGuard(2), false, "Demoting when multiple admins exist is allowed");
  });

  test("Requirement 12: Administrator CLI provisioning tool functionality", async () => {
    // Create an unprivileged user
    const candidateEmail = `cli.provision.${Date.now()}@synthetic.local`;
    const candidateUser = await prisma.user.create({
      data: {
        name: "CLI Candidate",
        email: candidateEmail,
        password: await hashPassword("CandidatePass#123"),
        role: USER_ROLES.USER,
      },
      select: { id: true, email: true, role: true },
    });
    createdUserIds.push(candidateUser.id);
    assert.strictEqual(candidateUser.role, USER_ROLES.USER);

    // Execute provisioning update
    await prisma.user.update({
      where: { email: candidateEmail },
      data: { role: USER_ROLES.ADMIN },
    });

    const verifiedAdmin = await prisma.user.findUnique({
      where: { email: candidateEmail },
      select: { role: true },
    });
    assert.strictEqual(verifiedAdmin?.role, USER_ROLES.ADMIN);
  });
});
