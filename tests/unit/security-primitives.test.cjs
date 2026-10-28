const assert = require("node:assert/strict");
const cp = require("node:child_process");
const path = require("node:path");
const { describe, test } = require("node:test");

const { registrationSchema } = require("../../src/lib/auth/account-schemas");
const { isStrongPassword } = require("../../src/lib/password-rules");

const root = path.resolve(__dirname, "../..");

function loadPrismaWith(env) {
  return cp.spawnSync(process.execPath, ["-r", "ts-node/register", "-e", "require('./src/lib/prisma')"], {
    cwd: root,
    env,
    encoding: "utf8",
  });
}

describe("security primitives and database fail-closed behavior", () => {
  test("password and strict registration validation reject weak or privileged input", () => {
    assert.equal(isStrongPassword("Weakpass"), false);
    assert.equal(isStrongPassword("StrongSynthetic#2026"), true);
    assert.equal(
      registrationSchema.safeParse({
        username: "Synthetic",
        email: "unit@synthetic.local",
        password: "StrongSynthetic#2026",
        role: "ADMIN",
      }).success,
      false,
    );
  });

  test("runtime refuses missing and nonexistent database routing", () => {
    const missing = { ...process.env, NODE_ENV: "test" };
    delete missing.DATABASE_URL;
    assert.notEqual(loadPrismaWith(missing).status, 0);
    const invalid = {
      ...process.env,
      NODE_ENV: "test",
      DATABASE_URL: `file:${path.join(root, "does-not-exist-test.db")}`,
    };
    assert.notEqual(loadPrismaWith(invalid).status, 0);
  });

  test("runtime refuses the protected original even in production mode", () => {
    const result = loadPrismaWith({
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: `file:${path.join(root, "prisma/dev.db")}`,
    });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /protected original database/);
  });
});
