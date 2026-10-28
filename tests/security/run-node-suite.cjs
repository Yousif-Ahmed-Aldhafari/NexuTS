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

async function main() {
  const snapshot = snapshotDeveloperDatabases();
  const testDatabase = createTestDatabase("security-node");
  try {
    deployMigrations(testDatabase);
    await seedSecurityFixture(testDatabase.url);
    const files = fs
      .readdirSync(path.join(root, "tests/security"))
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => `tests/security/${file}`);
    run(process.execPath, ["-r", "ts-node/register", "--test", "--test-concurrency=1", ...files], {
      env: {
        ...testDatabase.env,
        NODE_ENV: "test",
        TS_NODE_COMPILER_OPTIONS: '{"module":"CommonJS"}',
        AUTH_SECRET: "synthetic-node-suite-secret-not-for-production",
        AUTH_URL: "http://127.0.0.1:3105",
      },
    });
  } finally {
    cleanupTestDatabase(testDatabase);
    assertDeveloperDatabasesUnchanged(snapshot);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
