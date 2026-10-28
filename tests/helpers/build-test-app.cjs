const {
  assertDeveloperDatabasesUnchanged,
  cleanupTestDatabase,
  createTestDatabase,
  deployMigrations,
  run,
  snapshotDeveloperDatabases,
} = require("./test-database.cjs");

const snapshot = snapshotDeveloperDatabases();
const testDatabase = createTestDatabase("build");
try {
  deployMigrations(testDatabase);
  run("npm", ["run", "build"], {
    env: {
      ...testDatabase.env,
      AUTH_SECRET: "synthetic-build-secret-not-for-production",
      AUTH_URL: "http://127.0.0.1:3105",
    },
  });
} finally {
  cleanupTestDatabase(testDatabase);
  assertDeveloperDatabasesUnchanged(snapshot);
}
