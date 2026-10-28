const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { after, before, describe, test } = require("node:test");

const {
  assertDeveloperDatabasesUnchanged,
  cleanupTestDatabase,
  createTestDatabase,
  deployMigrations,
  root,
  snapshotDeveloperDatabases,
} = require("../helpers/test-database.cjs");

const databases = [];
let snapshot;

function columns(database, table) {
  return database
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((column) => column.name);
}

describe("Prisma fresh and upgrade migrations", () => {
  before(() => {
    snapshot = snapshotDeveloperDatabases();
  });

  after(() => {
    for (const database of databases.reverse()) cleanupTestDatabase(database);
    assertDeveloperDatabasesUnchanged(snapshot);
  });

  test("all project migrations initialize a fresh disposable database", () => {
    const testDatabase = createTestDatabase("migration-fresh");
    databases.push(testDatabase);
    deployMigrations(testDatabase);
    const db = new DatabaseSync(testDatabase.database, { readOnly: true });
    try {
      assert.deepEqual(
        db
          .prepare("SELECT migration_name FROM _prisma_migrations ORDER BY migration_name")
          .all()
          .map((row) => row.migration_name),
        ["20260512000000_baseline", "20260512181500_add_user_language", "20261028010000_auth_lifecycle"],
      );
      assert.ok(columns(db, "User").includes("sessionVersion"));
      assert.ok(columns(db, "User").includes("disabled"));
      assert.ok(columns(db, "User").includes("language"));
      assert.ok(
        db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='protect_last_admin_update'").get(),
      );
    } finally {
      db.close();
    }
  });

  test("Step 1.5 migration upgrades a safe pre-Step-1.5 database without losing records", () => {
    const testDatabase = createTestDatabase("migration-upgrade");
    databases.push(testDatabase);
    const workspace = path.join(testDatabase.directory, "pre-step15");
    const migrations = path.join(workspace, "migrations");
    fs.mkdirSync(migrations, { recursive: true });
    fs.copyFileSync(path.join(root, "prisma/schema.prisma"), path.join(workspace, "schema.prisma"));
    fs.copyFileSync(
      path.join(root, "prisma/migrations/migration_lock.toml"),
      path.join(migrations, "migration_lock.toml"),
    );
    for (const name of ["20260512000000_baseline", "20260512181500_add_user_language"]) {
      fs.cpSync(path.join(root, "prisma/migrations", name), path.join(migrations, name), { recursive: true });
    }
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    let db = new DatabaseSync(testDatabase.database);
    db.exec("PRAGMA foreign_keys=ON");
    db.prepare("INSERT INTO User (name,email,role,password,language) VALUES (?,?,?,?,?)").run(
      "Synthetic Upgrade Admin",
      "upgrade.admin@synthetic.local",
      "ADMIN",
      "synthetic-legacy-value",
      "ar",
    );
    const userId = db.prepare("SELECT id FROM User WHERE email=?").get("upgrade.admin@synthetic.local").id;
    db.prepare("INSERT INTO Project (id,name,userId,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)").run(
      "upgradeproject0000000000001",
      "Preserved Upgrade Project",
      userId,
    );
    db.close();

    fs.cpSync(
      path.join(root, "prisma/migrations/20261028010000_auth_lifecycle"),
      path.join(migrations, "20261028010000_auth_lifecycle"),
      { recursive: true },
    );
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    db = new DatabaseSync(testDatabase.database);
    try {
      const user = db.prepare("SELECT id,email,role,language,sessionVersion,disabled FROM User WHERE id=?").get(userId);
      assert.deepEqual(
        { ...user },
        {
          id: userId,
          email: "upgrade.admin@synthetic.local",
          role: "ADMIN",
          language: "ar",
          sessionVersion: 0,
          disabled: 0,
        },
      );
      assert.equal(
        db.prepare("SELECT name FROM Project WHERE id=?").get("upgradeproject0000000000001").name,
        "Preserved Upgrade Project",
      );
      assert.throws(() => db.prepare("UPDATE User SET role='USER' WHERE id=?").run(userId), /LAST_ADMIN/);
    } finally {
      db.close();
    }
  });
});
