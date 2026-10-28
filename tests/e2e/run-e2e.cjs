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
const { seedE2eFixture } = require("../helpers/seed-security.cjs");

const port = process.env.E2E_PORT || "3106";
const baseUrl = `http://127.0.0.1:${port}`;

async function main() {
  const snapshot = snapshotDeveloperDatabases();
  const testDatabase = createTestDatabase("playwright");
  let server;
  let serverLog;
  try {
    deployMigrations(testDatabase);
    const fixture = await seedE2eFixture(testDatabase.url);
    const env = {
      ...testDatabase.env,
      AUTH_SECRET: "synthetic-playwright-secret-not-for-production",
      AUTH_URL: baseUrl,
      E2E_BASE_URL: baseUrl,
      E2E_FOREIGN_PROJECT_ID: fixture.foreignProject.id,
    };
    if (!process.env.CI && fs.existsSync("/usr/bin/google-chrome")) {
      env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "/usr/bin/google-chrome";
    }
    const productionBuild = fs.existsSync(path.join(root, ".next/BUILD_ID"));
    const args = productionBuild
      ? ["node_modules/next/dist/bin/next", "start", "-p", port, "-H", "127.0.0.1"]
      : ["node_modules/next/dist/bin/next", "dev", "-p", port, "-H", "127.0.0.1"];
    serverLog = fs.openSync(path.join(testDatabase.directory, "server.log"), "w", 0o600);
    server = cp.spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", serverLog, serverLog] });
    let ready = false;
    for (let attempt = 0; attempt < 180; attempt++) {
      if (server.exitCode !== null) throw new Error("Playwright test server failed to start.");
      try {
        if ((await fetch(`${baseUrl}/auth/v2/login`)).ok) {
          ready = true;
          break;
        }
      } catch {
        // The server is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error("Playwright test server readiness timed out.");
    run("npx", ["--no-install", "playwright", "test"], { env });
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
