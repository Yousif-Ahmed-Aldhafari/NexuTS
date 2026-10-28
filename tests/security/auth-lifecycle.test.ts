import { PrismaClient } from "@prisma/client";

import { registrationSchema } from "../../src/lib/auth/account-schemas";
import { hashPassword } from "../../src/lib/auth/password";
import { enforceRateLimit } from "../../src/lib/auth/rate-limit";
import { checkOrigin, RequestError, readBody } from "../../src/lib/auth/request-security";
import { validateSessionToken } from "../../src/lib/auth/session-lifecycle";
import { consumeVerification, issueVerification, tokenDigest } from "../../src/lib/auth/verification";
import { prisma } from "../../src/lib/prisma";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import test, { after, before, describe } from "node:test";

const created: number[] = [];
let first: { id: number; email: string | null; sessionVersion: number };
let second: typeof first;
const password = "SyntheticPassword#2026!";
const claims = (user: typeof first) => ({
  sub: String(user.id),
  sessionVersion: user.sessionVersion,
  authenticatedAt: Date.now() / 1000,
  absoluteExpiresAt: Date.now() / 1000 + 3600,
});

describe("Step 1.5 authentication lifecycle", () => {
  before(async () => {
    const paths = await prisma.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
    assert.equal(paths[0].file, `${process.cwd()}/prisma/dev-isolated.db`);
    for (const label of ["first", "second"]) {
      const user = await prisma.user.create({
        data: {
          name: "Synthetic Lifecycle",
          email: `step15.${label}.${Date.now()}@synthetic.local`,
          password: await hashPassword(password),
        },
      });
      created.push(user.id);
      if (label === "first") first = user;
      else second = user;
    }
  });
  after(async () => {
    await prisma.verificationProof.deleteMany({ where: { userId: { in: created } } });
    await prisma.user.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });
  test("invalid token rejected without verifying account", async () => {
    await assert.rejects(consumeVerification(first.id, first.email ?? "", "0".repeat(64)), RequestError);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).emailVerified, null);
  });
  test("expired token rejected", async () => {
    const token = await issueVerification(first.id, first.email ?? "");
    await prisma.verificationProof.update({ where: { digest: tokenDigest(token) }, data: { expiresAt: new Date(0) } });
    await assert.rejects(consumeVerification(first.id, first.email ?? "", token), RequestError);
  });
  test("cross-user token rejected; valid token consumed exactly once", async () => {
    const token = await issueVerification(first.id, first.email ?? "");
    assert.notEqual(token, tokenDigest(token));
    await assert.rejects(consumeVerification(second.id, second.email ?? "", token), RequestError);
    const results = await Promise.allSettled([
      consumeVerification(first.id, first.email ?? "", token),
      consumeVerification(first.id, first.email ?? "", token),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    await assert.rejects(consumeVerification(first.id, first.email ?? "", token), RequestError);
    assert.ok((await prisma.user.findUniqueOrThrow({ where: { id: first.id } })).emailVerified);
  });
  test("reissue invalidates previous proof; mismatched email cannot verify", async () => {
    const old = await issueVerification(first.id, first.email ?? "");
    const token = await issueVerification(first.id, first.email ?? "");
    await assert.rejects(consumeVerification(first.id, first.email ?? "", old));
    await assert.rejects(consumeVerification(first.id, second.email ?? "", token));
  });
  test("password update revokes old sessions atomically", async () => {
    assert.ok(await validateSessionToken(claims(first)));
    await prisma.user.update({
      where: { id: first.id },
      data: { password: await hashPassword("ChangedSynthetic#2026!") },
    });
    assert.equal(await validateSessionToken(claims(first)), null);
  });
  test("role demotion revokes old JWT even with forged admin claims", async () => {
    const admin = await prisma.user.update({ where: { id: second.id }, data: { role: "ADMIN" } });
    const token = claims(await prisma.user.findUniqueOrThrow({ where: { id: admin.id } }));
    assert.equal((await validateSessionToken({ ...token, role: "USER" }))?.role, "ADMIN");
    await prisma.user.update({ where: { id: second.id }, data: { role: "USER" } });
    assert.equal(await validateSessionToken({ ...token, role: "ADMIN" }), null);
  });
  test("disabled/deleted accounts and expired/legacy sessions fail closed", async () => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: second.id } });
    assert.equal(await validateSessionToken({ ...claims(user), absoluteExpiresAt: 1 }), null);
    assert.equal(await validateSessionToken({ sub: String(user.id), role: "ADMIN" }), null);
    await prisma.user.update({ where: { id: user.id }, data: { disabled: true } });
    assert.equal(await validateSessionToken(claims(user)), null);
    await prisma.user.delete({ where: { id: user.id } });
    assert.equal(await validateSessionToken(claims(user)), null);
  });
  test("strict payloads reject privileged fields, wrong types, malformed JSON and oversize input", async () => {
    const make = (body: string) =>
      new Request(`${process.env.AUTH_URL || "http://localhost"}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: process.env.AUTH_URL || "http://localhost" },
        body,
      });
    for (const body of [
      "null",
      "{",
      JSON.stringify({ username: {}, email: [], password: 123 }),
      JSON.stringify({ username: "Test", email: "test@synthetic.local", password, role: "ADMIN" }),
    ]) {
      await assert.rejects(readBody(make(body), registrationSchema), RequestError);
    }
    await assert.rejects(
      readBody(make(`"${"a".repeat(10000)}"`), registrationSchema, 4096),
      (e: unknown) => e instanceof RequestError && e.status === 413,
    );
  });
  test("cross-origin mutation rejected; same-origin allowed", () => {
    assert.throws(
      () =>
        checkOrigin(
          new Request(`${process.env.AUTH_URL || "http://localhost"}/api/entries`, {
            headers: { Origin: "https://attacker.invalid" },
          }),
        ),
      RequestError,
    );
    assert.doesNotThrow(() =>
      checkOrigin(
        new Request(`${process.env.AUTH_URL || "http://localhost"}/api/entries`, {
          headers: { Origin: process.env.AUTH_URL || "http://localhost" },
        }),
      ),
    );
  });
  test("atomic rate limit permits normal traffic and rejects excessive attempts across workers", async () => {
    const scope = `test-${Date.now()}`;
    const results = await Promise.allSettled(Array.from({ length: 12 }, () => enforceRateLimit(scope, "synthetic", 5)));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
    assert.equal(results.filter((r) => r.status === "rejected" && r.reason.status === 429).length, 7);
  });
  test("provisioning requires explicit opt-in and does not log account email or password", async () => {
    const user = await prisma.user.create({
      data: { name: "Synthetic CLI", email: `cli.${Date.now()}@synthetic.local` },
    });
    created.push(user.id);
    const args = ["-r", "ts-node/register", "src/scripts/provision-admin.ts", user.email ?? ""];
    const denied = spawnSync(process.execPath, args, {
      env: { ...process.env, ALLOW_ADMIN_PROVISIONING: "false" },
      encoding: "utf8",
    });
    assert.notEqual(denied.status, 0);
    const allowed = spawnSync(process.execPath, args, {
      env: { ...process.env, ALLOW_ADMIN_PROVISIONING: "true" },
      encoding: "utf8",
    });
    assert.equal(allowed.status, 0);
    assert.equal(allowed.stdout.includes(user.email ?? "missing"), false);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role, "ADMIN");
    await prisma.user.update({ where: { id: user.id }, data: { role: "USER" } });
  });
  test("local verification delivery is explicit, synthetic-only and writes a private file without printing token", async () => {
    const file = `.local-verification/${first.id}.txt`;
    fs.rmSync(file, { force: true });
    try {
      const result = spawnSync(
        process.execPath,
        ["-r", "ts-node/register", "src/scripts/local-verification.ts", String(first.id)],
        { env: { ...process.env, ALLOW_LOCAL_VERIFICATION: "true" }, encoding: "utf8" },
      );
      assert.equal(result.status, 0);
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      const token = fs.readFileSync(file, "utf8");
      assert.match(token, /^[a-f0-9]{64}$/);
      assert.equal(result.stdout.includes(token), false);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
  test("SQLite invariant prevents concurrent last-admin demotion and deletion across connections", async () => {
    const anchor = await prisma.user.findUniqueOrThrow({ where: { email: "security.anchor@synthetic.local" } });
    const others = await prisma.user.count({ where: { role: "ADMIN", disabled: false, NOT: { id: anchor.id } } });
    assert.equal(others, 0, "Use the isolated fixture runner for concurrency tests.");
    const a = await prisma.user.create({
      data: { name: "Synthetic Admin A", email: `race.a.${Date.now()}@synthetic.local`, role: "ADMIN" },
    });
    const b = await prisma.user.create({
      data: { name: "Synthetic Admin B", email: `race.b.${Date.now()}@synthetic.local`, role: "ADMIN" },
    });
    const client = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "" } }, log: [] });
    try {
      await prisma.user.update({ where: { id: anchor.id }, data: { role: "USER" } });
      const demotions = await Promise.allSettled([
        prisma.user.update({ where: { id: a.id }, data: { role: "USER" } }),
        client.user.update({ where: { id: b.id }, data: { role: "USER" } }),
      ]);
      assert.equal(demotions.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await prisma.user.count({ where: { role: "ADMIN", disabled: false } }), 1);
      await prisma.user.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { role: "ADMIN" } });
      const deletions = await Promise.allSettled([
        prisma.user.delete({ where: { id: a.id } }),
        client.user.delete({ where: { id: b.id } }),
      ]);
      assert.equal(deletions.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(await prisma.user.count({ where: { role: "ADMIN", disabled: false } }), 1);
    } finally {
      await prisma.user.update({ where: { id: anchor.id }, data: { role: "ADMIN" } });
      await prisma.user.deleteMany({ where: { id: { in: [a.id, b.id] } } });
      await client.$disconnect();
    }
  });
});
