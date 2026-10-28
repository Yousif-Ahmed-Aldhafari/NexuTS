const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const {
  assertDeveloperDatabasesUnchanged,
  cleanupTestDatabase,
  createTestDatabase,
  deployMigrations,
  root,
  run,
  snapshotDeveloperDatabases,
} = require("../helpers/test-database.cjs");
const { seedSecurityFixture } = require("../helpers/seed-security.cjs");

const port = process.env.SECURITY_TEST_PORT || "3105";
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const snapshot = snapshotDeveloperDatabases();
  const testDatabase = createTestDatabase("security-http");
  let server;
  let serverLog;
  try {
    deployMigrations(testDatabase);
    await seedSecurityFixture(testDatabase.url);
    const env = {
      ...testDatabase.env,
      NODE_ENV: "production",
      AUTH_SECRET: "synthetic-http-suite-secret-not-for-production",
      AUTH_URL: baseUrl,
    };
    delete env.RESEND_API_KEY;
    delete env.EMAIL_FROM;
    serverLog = fs.openSync(path.join(testDatabase.directory, "server.log"), "w", 0o600);
    server = cp.spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", port, "-H", "127.0.0.1"], {
      cwd: root,
      env,
      stdio: ["ignore", serverLog, serverLog],
    });
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (server.exitCode !== null) throw new Error("Production security server failed to start.");
      try {
        if ((await fetch(`${baseUrl}/api/auth/csrf`)).ok) {
          ready = true;
          break;
        }
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Production security server readiness timed out.");
    run(process.execPath, ["--test", "--test-concurrency=1", "tests/security/auth-http.test.cjs"], {
      env: { ...env, SECURITY_TEST_URL: baseUrl },
    });
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
    cleanupTestDatabase(testDatabase);
    assertDeveloperDatabasesUnchanged(snapshot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
