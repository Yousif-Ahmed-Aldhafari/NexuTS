/** Runs synthetic fixtures only in dev-isolated.db, restoring its previous contents afterward. */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const root = process.cwd();
const database = path.join(root, "prisma/dev-isolated.db");
const original = path.join(root, "prisma/dev.db");
const expectedHash = "bfc6da8e0911483c70cebda47dd1b041e09cb4a68ffe03ba755cd7ebfb5c2615";
const hash = (file) => require("node:crypto").createHash("sha256").update(fs.readFileSync(file)).digest("hex");
if (fs.realpathSync(database) !== database || hash(original) !== expectedHash)
  throw Error("Database safety check failed.");
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "nexuts-step15-"));
fs.chmodSync(directory, 0o700);
const backup = path.join(directory, "isolated-backup.db");
const env = {
  ...process.env,
  DATABASE_URL: `file:${database}`,
  TS_NODE_COMPILER_OPTIONS: '{"module":"CommonJS"}',
  AUTH_SECRET: "synthetic-step15-test-secret-not-for-production",
  AUTH_URL: "http://localhost:3105",
};
delete env.RESEND_API_KEY;
delete env.EMAIL_FROM;
let server;
let serverLog;
function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
  if (result.status !== 0) throw Error(`Security check failed (exit ${result.status}).`);
}
async function main() {
  // Copy schema only into the same isolated path. The protected original DB is read only for SHA-256.
  run("python3", [
    "-c",
    `import sqlite3, pathlib
p=pathlib.Path(${JSON.stringify(database)})
c=sqlite3.connect(p)
assert pathlib.Path(c.execute('pragma database_list').fetchone()[2]).resolve()==p
b=sqlite3.connect(${JSON.stringify(backup)}); c.backup(b); b.close()
schema=[r[0] for r in c.execute("select sql from sqlite_master where sql is not null and name not like 'sqlite_%' order by case type when 'table' then 0 when 'index' then 1 else 2 end")]
c.close();p.unlink()
c=sqlite3.connect(p)
c.executescript(';\\n'.join(schema)+';');c.close()
`,
  ]);
  try {
    const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } }, log: [] });
    try {
      const anchor = await prisma.user.create({
        data: {
          name: "Synthetic Test Anchor",
          email: "security.anchor@synthetic.local",
          role: "ADMIN",
          password: await bcrypt.hash("SyntheticAnchor#2026!", 12),
        },
      });
      await prisma.project.create({ data: { name: "Synthetic Fixture Project", userId: anchor.id } });
    } finally {
      await prisma.$disconnect();
    }
    const files = fs
      .readdirSync("tests/security")
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => `tests/security/${file}`);
    run(process.execPath, ["-r", "ts-node/register", "--test", "--test-concurrency=1", ...files], {
      env: { ...env, NODE_ENV: "test" },
    });
    if (process.env.SECURITY_HTTP_TESTS !== "false") {
      serverLog = fs.openSync(path.join(directory, "server.log"), "w", 0o600);
      server = cp.spawn(
        process.execPath,
        ["node_modules/next/dist/bin/next", "start", "-p", "3105", "-H", "127.0.0.1"],
        { cwd: root, env: { ...env, NODE_ENV: "production" }, stdio: ["ignore", serverLog, serverLog] },
      );
      let ready = false;
      for (let attempt = 0; attempt < 120; attempt++) {
        if (server.exitCode !== null) throw Error("Production test server failed to start.");
        try {
          const response = await fetch(`${env.AUTH_URL}/api/auth/csrf`);
          if (response.ok) {
            ready = true;
            break;
          }
        } catch {
          /* Server startup. */
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready) throw Error("Production test server readiness timed out.");
      run(process.execPath, ["--test", "--test-concurrency=1", "tests/security/auth-http.test.cjs"], {
        env: { ...env, NODE_ENV: "production", SECURITY_TEST_URL: env.AUTH_URL },
      });
    }
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => server.once("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ]);
      if (server.exitCode === null) {
        server.kill("SIGKILL");
        await new Promise((resolve) => server.once("exit", resolve));
      }
    }
    if (serverLog !== undefined) fs.closeSync(serverLog);
    // Restore only the isolated database, even after a failed test.
    for (const suffix of ["-wal", "-shm", "-journal"]) fs.rmSync(`${database}${suffix}`, { force: true });
    fs.copyFileSync(backup, database);
    if (hash(original) !== expectedHash) {
      console.error("Protected database hash changed.");
      process.exitCode = 1;
    } else {
      console.log("Original database hash verified; isolated pre-test data restored.");
    }
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
