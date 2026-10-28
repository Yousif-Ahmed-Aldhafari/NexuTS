const assert = require("node:assert/strict");
const { test, before, after, describe } = require("node:test");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const crypto = require("node:crypto");
const path = require("node:path");
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } }, log: [] });
const base = process.env.SECURITY_TEST_URL || "http://localhost:3105";
const password = "SyntheticPassword#2026!";
const users = [];
let admin, member, adminCookie, memberCookie, projectId;
function cookieParts(response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
async function login(email, candidate = password) {
  const csrf = await fetch(`${base}/api/auth/csrf`);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { Origin: base, Cookie: cookieParts(csrf), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email,
      password: candidate,
      csrfToken,
      callbackUrl: `${base}/dashboard/home-page`,
      remember: "false",
    }),
  });
  return { response, cookie: `${cookieParts(csrf)}; ${cookieParts(response)}` };
}
function request(path, method = "GET", cookie = "", body, extra = {}) {
  return fetch(`${base}${path}`, {
    method,
    redirect: "manual",
    headers: { Origin: base, Cookie: cookie, "Content-Type": "application/json", ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function createUser(role = "USER") {
  const user = await prisma.user.create({
    data: {
      name: "Synthetic HTTP User",
      email: `http.${crypto.randomUUID()}@synthetic.local`,
      password: await bcrypt.hash(password, 12),
      role,
    },
  });
  users.push(user.id);
  return user;
}
async function proof(user, expired = false) {
  const code = crypto.randomBytes(32).toString("hex");
  await prisma.verificationProof.create({
    data: {
      digest: crypto.createHash("sha256").update(code).digest("hex"),
      userId: user.id,
      email: user.email,
      purpose: "verify-email",
      expiresAt: new Date(Date.now() + (expired ? -1000 : 60000)),
    },
  });
  return code;
}

describe("Step 1.5 actual production HTTP security", () => {
  before(async () => {
    const paths = await prisma.$queryRawUnsafe("PRAGMA database_list");
    assert.equal(paths[0].file, path.join(process.env.NEXUTS_TEST_DATABASE_DIR, "test.db"));
    admin = await createUser("ADMIN");
    member = await createUser();
    const a = await login(admin.email);
    const m = await login(member.email);
    adminCookie = a.cookie;
    memberCookie = m.cookie;
    assert.ok(
      a.response.headers
        .getSetCookie()
        .some(
          (value) =>
            value.includes("__Secure-authjs.session-token=") &&
            /HttpOnly/i.test(value) &&
            /Secure/i.test(value) &&
            /SameSite=Lax/i.test(value),
        ),
    );
  });
  after(async () => {
    await prisma.project.deleteMany({ where: { OR: [{ id: projectId }, { userId: { in: users } }] } });
    await prisma.verificationProof.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });
  test("real login authenticates; anonymous APIs and forged roles are denied", async () => {
    assert.equal((await request("/api/users", "GET", adminCookie)).status, 200);
    assert.equal((await request("/api/users", "GET", memberCookie)).status, 403);
    assert.equal((await request("/api/projects")).status, 401);
    assert.equal(
      (
        await request("/api/auth/profile", "PUT", memberCookie, {
          action: "update-username",
          username: "Synthetic",
          role: "ADMIN",
        })
      ).status,
      400,
    );
  });
  test("legacy account login upgrades plaintext without exposing credentials", async () => {
    const legacy = await prisma.user.create({
      data: { name: "Synthetic Legacy HTTP", email: `legacy.${crypto.randomUUID()}@synthetic.local`, password },
    });
    users.push(legacy.id);
    const result = await login(legacy.email);
    assert.equal((await request("/api/auth/profile", "GET", result.cookie)).status, 200);
    const upgraded = await prisma.user.findUniqueOrThrow({ where: { id: legacy.id } });
    assert.ok(upgraded.password.startsWith("$2"));
    assert.equal(await bcrypt.compare(password, upgraded.password), true);
  });
  test("verification rejects arbitrary, expired, cross-user and reused tokens; accepts once", async () => {
    assert.equal((await request("/api/auth/verify-email", "POST", memberCookie, { code: "123456" })).status, 400);
    assert.equal(
      (await request("/api/auth/verify-email", "POST", memberCookie, { code: await proof(member, true) })).status,
      400,
    );
    const code = await proof(member);
    assert.equal((await request("/api/auth/verify-email", "POST", adminCookie, { code })).status, 400);
    assert.equal((await request("/api/auth/verify-email", "POST", memberCookie, { code })).status, 200);
    assert.equal((await request("/api/auth/verify-email", "POST", memberCookie, { code })).status, 400);
    const response = await request("/api/auth/verify-email", "POST", memberCookie, { action: "request" });
    assert.equal(response.status, 503, "Unconfigured delivery must never pretend to send mail.");
  });
  test("malformed input, unsafe URLs, privileged fields and oversized payloads return controlled errors", async () => {
    for (const body of [
      null,
      [],
      { name: 12 },
      { name: "Unsafe", url: "javascript:alert(1)" },
      { name: "Owned", userId: member.id },
    ]) {
      assert.equal((await request("/api/projects", "POST", adminCookie, body)).status, 400);
    }
    const malformed = await fetch(`${base}/api/auth/profile`, {
      method: "PUT",
      headers: { Origin: base, Cookie: memberCookie, "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal(
      (
        await request("/api/auth/profile", "PUT", memberCookie, {
          action: "update-username",
          username: "a".repeat(10000),
        })
      ).status,
      413,
    );
  });
  test("cross-site and missing-origin mutations denied; Auth.js CSRF still enforced", async () => {
    assert.equal(
      (await request("/api/projects", "POST", adminCookie, { name: "Blocked" }, { Origin: "https://attacker.invalid" }))
        .status,
      403,
    );
    const response = await fetch(`${base}/api/auth/profile`, {
      method: "PUT",
      headers: { Cookie: memberCookie, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-username", username: "Blocked" }),
    });
    assert.equal(response.status, 403);
    const csrf = await fetch(`${base}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { Origin: base, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ email: member.email, password }),
    });
    assert.ok(
      !csrf.headers
        .getSetCookie()
        .some(
          (value) =>
            value.startsWith("__Secure-authjs.session-token=") && !value.startsWith("__Secure-authjs.session-token=;"),
        ),
    );
  });
  test("authorized project/table/entry workflow preserved", async () => {
    const project = await request("/api/projects", "POST", adminCookie, {
      name: `Synthetic HTTP Project ${Date.now()}`,
      url: "https://example.com",
      logo: "",
    });
    assert.equal(project.status, 201);
    projectId = (await project.json()).id;
    const page = await request(`/dashboard/qa-boards/${projectId}`, "GET", adminCookie);
    assert.equal(page.status, 200);
    assert.equal((await page.text()).includes(password), false);
    const table = await request("/api/tables", "POST", adminCookie, {
      name: "Synthetic QA",
      projectId,
      tableType: "TEST_CASES",
    });
    assert.equal(table.status, 201);
    const tableId = (await table.json()).id;
    const response = await request("/api/entries", "POST", adminCookie, {
      tableId,
      username: "Synthetic",
      title: "Synthetic Test",
      description: "Description",
      stepsToReproduce: "Steps",
      status: "SUCCESS",
      result: "Actual",
      expectedResult: "Expected",
      fixStatus: "FIXED",
      screenshotClipUrl: "",
      screenshotClipName: "",
      assignedTo: "",
    });
    assert.equal(response.status, 201);
    const entry = await response.json();
    assert.equal((await request(`/api/entries?id=${entry.id}`, "DELETE", memberCookie)).status, 404);
    assert.equal((await request(`/api/entries?id=${entry.id}`, "DELETE", adminCookie)).status, 200);

    // Step 2.2: Bounded pagination and performance endpoints verification
    // 1. Projects pagination
    assert.equal((await request("/api/projects?page=invalid", "GET", adminCookie)).status, 400);
    assert.equal((await request("/api/projects?limit=999", "GET", adminCookie)).status, 400);
    const projRes = await request("/api/projects?page=1&limit=5", "GET", adminCookie);
    assert.equal(projRes.status, 200);
    const projData = await projRes.json();
    assert.ok(Array.isArray(projData.items));
    assert.equal(projData.pagination.page, 1);
    assert.equal(projData.pagination.limit, 5);
    assert.equal(typeof projData.pagination.total, "number");
    assert.ok(projRes.headers.get("X-Total-Count"));
    assert.equal(projRes.headers.get("X-Page"), "1");

    // Projects format=array fallback
    const projArrayRes = await request("/api/projects?format=array", "GET", adminCookie);
    assert.equal(projArrayRes.status, 200);
    assert.ok(Array.isArray(await projArrayRes.json()));

    // 2. Tables pagination
    assert.equal((await request("/api/tables", "GET", adminCookie)).status, 400);
    assert.equal((await request(`/api/tables?projectId=${projectId}&page=0`, "GET", adminCookie)).status, 400);
    const tablesRes = await request(`/api/tables?projectId=${projectId}&page=1&limit=10`, "GET", adminCookie);
    assert.equal(tablesRes.status, 200);
    const tablesData = await tablesRes.json();
    assert.ok(Array.isArray(tablesData.items));
    assert.equal(tablesData.pagination.page, 1);

    // 3. Entries pagination via /api/tables/[tableId]/entries
    assert.equal((await request("/api/tables/nonexistent-id/entries", "GET", adminCookie)).status, 404);
    assert.equal((await request(`/api/tables/${tableId}/entries?limit=999`, "GET", adminCookie)).status, 400);
    const entriesRes = await request(`/api/tables/${tableId}/entries?page=1&limit=10`, "GET", adminCookie);
    assert.equal(entriesRes.status, 200);
    const entriesData = await entriesRes.json();
    assert.ok(Array.isArray(entriesData.items));
    assert.equal(entriesData.pagination.page, 1);

    // 4. Entries pagination via GET /api/entries?tableId=...
    assert.equal((await request("/api/entries", "GET", adminCookie)).status, 400);
    const directEntriesRes = await request(`/api/entries?tableId=${tableId}&page=1&limit=10`, "GET", adminCookie);
    assert.equal(directEntriesRes.status, 200);
    const directEntriesData = await directEntriesRes.json();
    assert.ok(Array.isArray(directEntriesData.items));
    assert.equal(directEntriesData.pagination.page, 1);
  });
  test("password change requires current password and revokes the real old session cookie", async () => {
    const body = {
      action: "change-password",
      currentPassword: "WrongPassword!",
      newPassword: "ChangedPassword#2026!",
      confirmNewPassword: "ChangedPassword#2026!",
    };
    assert.equal((await request("/api/auth/profile", "PUT", memberCookie, body)).status, 400);
    body.currentPassword = password;
    assert.equal((await request("/api/auth/profile", "PUT", memberCookie, body)).status, 200);
    assert.equal((await request("/api/auth/profile", "GET", memberCookie)).status, 401);
    memberCookie = (await login(member.email, body.newPassword)).cookie;
    assert.equal((await request("/api/auth/profile", "GET", memberCookie)).status, 200);
  });
  test("sensitive administrative changes require recent reauthentication", async () => {
    const { encode } = await import("next-auth/jwt");
    const current = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    const cookieName = "__Secure-authjs.session-token";
    const token = await encode({
      secret: process.env.AUTH_SECRET,
      salt: cookieName,
      maxAge: 3600,
      token: {
        sub: String(current.id),
        sessionVersion: current.sessionVersion,
        authenticatedAt: Date.now() / 1000 - 601,
        absoluteExpiresAt: Date.now() / 1000 + 3600,
        role: "ADMIN",
      },
    });
    assert.equal(
      (
        await request("/api/users", "PUT", `${cookieName}=${token}`, {
          action: "set-role",
          id: member.id,
          role: "USER",
        })
      ).status,
      403,
    );
  });
  test("administrative reset revokes target session and login with old password fails", async () => {
    assert.equal(
      (
        await request("/api/users", "PUT", adminCookie, {
          action: "reset-password",
          id: member.id,
          newPassword: "AdminChanged#2026!",
        })
      ).status,
      200,
    );
    assert.equal((await request("/api/auth/profile", "GET", memberCookie)).status, 401);
    const old = await login(member.email, "ChangedPassword#2026!");
    assert.equal((await request("/api/auth/profile", "GET", old.cookie)).status, 401);
  });
  test("demoted, disabled and deleted accounts lose access with their real cookies", async () => {
    for (const operation of ["demote", "disable", "delete"]) {
      const victim = await createUser("ADMIN");
      const cookie = (await login(victim.email)).cookie;
      if (operation === "demote") await prisma.user.update({ where: { id: victim.id }, data: { role: "USER" } });
      if (operation === "disable") await prisma.user.update({ where: { id: victim.id }, data: { disabled: true } });
      if (operation === "delete") await prisma.user.delete({ where: { id: victim.id } });
      assert.equal((await request("/api/users", "GET", cookie)).status, 401);
    }
  });
  test("HTTP login attempts reach a real 429 with Retry-After", async () => {
    const email = `limited.${crypto.randomUUID()}@synthetic.local`;
    let result;
    for (let i = 0; i < 9; i++) result = await login(email, "InvalidSynthetic#2026!");
    assert.equal(result.response.status, 429);
    assert.ok(result.response.headers.has("Retry-After"));
  });
  test("registration does not enumerate accounts and rejects privileged properties", async () => {
    const body = {
      username: "Synthetic Register",
      email: `registered.${crypto.randomUUID()}@synthetic.local`,
      password,
    };
    const firstResponse = await request("/api/auth/register", "POST", "", body);
    assert.equal(firstResponse.status, 201);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: body.email } });
    users.push(user.id);
    const again = await request("/api/auth/register", "POST", "", { ...body, password: "DifferentSynthetic#2026!" });
    assert.equal(again.status, 201);
    assert.deepEqual(await again.json(), await firstResponse.json());
    const persisted = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.ok(persisted.password === user.password, "Existing registration must not replace credentials.");
    assert.equal((await request("/api/auth/register", "POST", "", { ...body, role: "ADMIN" })).status, 400);
  });
  test("browser headers are present; logout invalidates replayed session cookie", async () => {
    const response = await request("/api/auth/profile", "GET", adminCookie);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.ok(response.headers.get("content-security-policy").includes("frame-ancestors 'none'"));
    const csrf = await fetch(`${base}/api/auth/csrf`, { headers: { Cookie: adminCookie } });
    const { csrfToken } = await csrf.json();
    await fetch(`${base}/api/auth/signout`, {
      method: "POST",
      redirect: "manual",
      headers: {
        Origin: base,
        Cookie: `${adminCookie}; ${cookieParts(csrf)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken }),
    });
    assert.equal((await request("/api/auth/profile", "GET", adminCookie)).status, 401);
  });
});
