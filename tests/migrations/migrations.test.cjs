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
        [
          "20260512000000_baseline",
          "20260512181500_add_user_language",
          "20261028010000_auth_lifecycle",
          "20261028020000_performance_indexes",
          "20261028030000_normalize_entry_priority_and_constraints",
        ],
      );
      assert.ok(columns(db, "User").includes("sessionVersion"));
      assert.ok(columns(db, "User").includes("disabled"));
      assert.ok(columns(db, "User").includes("language"));
      assert.ok(columns(db, "Entry").includes("priority"));
      assert.ok(
        db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='protect_last_admin_update'").get(),
      );

      // Verify validation triggers
      const expectedTriggers = [
        "validate_table_table_type_insert",
        "validate_table_table_type_update",
        "validate_entry_status_insert",
        "validate_entry_status_update",
        "validate_entry_fix_status_insert",
        "validate_entry_fix_status_update",
      ];
      for (const triggerName of expectedTriggers) {
        assert.ok(
          db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?").get(triggerName),
          `Expected trigger ${triggerName} to exist`,
        );
      }

      // Verify performance indexes
      const expectedIndexes = [
        "Account_userId_idx",
        "Session_userId_idx",
        "Project_userId_idx",
        "Table_projectId_idx",
        "Entry_tableId_isDeleted_idx",
      ];
      for (const indexName of expectedIndexes) {
        assert.ok(
          db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(indexName),
          `Expected index ${indexName} to exist`,
        );
      }
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

  test("Step 2.2 performance indexes migration upgrades existing database preserving data and adding indexes", () => {
    const testDatabase = createTestDatabase("migration-upgrade-2.2");
    databases.push(testDatabase);
    const workspace = path.join(testDatabase.directory, "pre-step22");
    const migrations = path.join(workspace, "migrations");
    fs.mkdirSync(migrations, { recursive: true });
    fs.copyFileSync(path.join(root, "prisma/schema.prisma"), path.join(workspace, "schema.prisma"));
    fs.copyFileSync(
      path.join(root, "prisma/migrations/migration_lock.toml"),
      path.join(migrations, "migration_lock.toml"),
    );
    for (const name of [
      "20260512000000_baseline",
      "20260512181500_add_user_language",
      "20261028010000_auth_lifecycle",
    ]) {
      fs.cpSync(path.join(root, "prisma/migrations", name), path.join(migrations, name), { recursive: true });
    }
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    let db = new DatabaseSync(testDatabase.database);
    db.exec("PRAGMA foreign_keys=ON");
    db.prepare("INSERT INTO User (name,email,role,password,language) VALUES (?,?,?,?,?)").run(
      "Index Upgrade User",
      "index.upgrade@synthetic.local",
      "ADMIN",
      "synthetic-hash",
      "en",
    );
    const userId = db.prepare("SELECT id FROM User WHERE email=?").get("index.upgrade@synthetic.local").id;
    db.prepare("INSERT INTO Project (id,name,userId,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)").run(
      "proj-index-upgrade-1",
      "Index Upgrade Project",
      userId,
    );
    db.prepare("INSERT INTO \"Table\" (id,projectId,name,tableType,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)").run(
      "tbl-index-upgrade-1",
      "proj-index-upgrade-1",
      "Test Cases",
      "TEST_CASES",
    );
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(
      1001,
      "tbl-index-upgrade-1",
      "Test Entry 1",
      "Description 1",
      "NEW",
      0,
    );
    db.prepare(
      "INSERT INTO Account (id,userId,type,provider,providerAccountId) VALUES (?,?,?,?,?)",
    ).run("acc-upgrade-1", userId, "oauth", "github", "gh-12345");
    db.prepare(
      "INSERT INTO Session (id,sessionToken,userId,expires) VALUES (?,?,?,?)",
    ).run("sess-upgrade-1", "token-upgrade-123", userId, new Date(Date.now() + 86400000).toISOString());

    // Before upgrade: verify indexes do not exist yet
    assert.equal(
      db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='Entry_tableId_isDeleted_idx'").get(),
      undefined,
    );
    db.close();

    // Deploy Step 2.2 migration
    fs.cpSync(
      path.join(root, "prisma/migrations/20261028020000_performance_indexes"),
      path.join(migrations, "20261028020000_performance_indexes"),
      { recursive: true },
    );
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    db = new DatabaseSync(testDatabase.database);
    try {
      // Verify data preserved
      assert.equal(
        db.prepare("SELECT name FROM Project WHERE id=?").get("proj-index-upgrade-1").name,
        "Index Upgrade Project",
      );
      assert.equal(
        db.prepare("SELECT name FROM \"Table\" WHERE id=?").get("tbl-index-upgrade-1").name,
        "Test Cases",
      );
      assert.equal(
        db.prepare("SELECT title FROM Entry WHERE id=?").get(1001).title,
        "Test Entry 1",
      );
      assert.equal(
        db.prepare("SELECT provider FROM Account WHERE id=?").get("acc-upgrade-1").provider,
        "github",
      );
      assert.equal(
        db.prepare("SELECT sessionToken FROM Session WHERE id=?").get("sess-upgrade-1").sessionToken,
        "token-upgrade-123",
      );

      // Verify new indexes exist
      for (const indexName of [
        "Account_userId_idx",
        "Session_userId_idx",
        "Project_userId_idx",
        "Table_projectId_idx",
        "Entry_tableId_isDeleted_idx",
      ]) {
        assert.ok(
          db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?").get(indexName),
          `Expected index ${indexName} to exist after upgrade`,
        );
      }

      // Verify query plan uses new index
      const plan = db.prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM Entry WHERE tableId='tbl-index-upgrade-1' AND isDeleted=0",
      ).all();
      assert.ok(
        plan.some((p) => p.detail.includes("Entry_tableId_isDeleted_idx")),
        "Expected query plan to use Entry_tableId_isDeleted_idx",
      );
    } finally {
      db.close();
    }
  });

  test("Step 2.3 schema consistency & priority normalization upgrades existing database preserving test cases, backfilling issue priorities, and activating constraints", () => {
    const testDatabase = createTestDatabase("migration-upgrade-2.3");
    databases.push(testDatabase);
    const workspace = path.join(testDatabase.directory, "pre-step23");
    const migrations = path.join(workspace, "migrations");
    fs.mkdirSync(migrations, { recursive: true });
    fs.copyFileSync(path.join(root, "prisma/schema.prisma"), path.join(workspace, "schema.prisma"));
    fs.copyFileSync(
      path.join(root, "prisma/migrations/migration_lock.toml"),
      path.join(migrations, "migration_lock.toml"),
    );
    for (const name of [
      "20260512000000_baseline",
      "20260512181500_add_user_language",
      "20261028010000_auth_lifecycle",
      "20261028020000_performance_indexes",
    ]) {
      fs.cpSync(path.join(root, "prisma/migrations", name), path.join(migrations, name), { recursive: true });
    }
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    let db = new DatabaseSync(testDatabase.database);
    db.exec("PRAGMA foreign_keys=ON");
    db.prepare("INSERT INTO User (name,email,role,password,language) VALUES (?,?,?,?,?)").run(
      "Schema Upgrade User",
      "schema.upgrade@synthetic.local",
      "ADMIN",
      "synthetic-hash",
      "en",
    );
    const userId = db.prepare("SELECT id FROM User WHERE email=?").get("schema.upgrade@synthetic.local").id;
    db.prepare("INSERT INTO Project (id,name,userId,updatedAt) VALUES (?,?,?,CURRENT_TIMESTAMP)").run(
      "proj-schema-upgrade-1",
      "Schema Upgrade Project",
      userId,
    );
    db.prepare("INSERT INTO \"Table\" (id,projectId,name,tableType,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)").run(
      "tbl-tc-upgrade-1",
      "proj-schema-upgrade-1",
      "Test Cases Table",
      "TEST_CASES",
    );
    db.prepare("INSERT INTO \"Table\" (id,projectId,name,tableType,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)").run(
      "tbl-issues-upgrade-1",
      "proj-schema-upgrade-1",
      "Issue Logs Table",
      "ISSUE_LOGS",
    );

    // Legacy test case entries
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,result,expectedResult,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(2001, "tbl-tc-upgrade-1", "Pass Test", "Desc 1", "SUCCESS", "FIXED", "Pass", "Pass", 0);
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,result,expectedResult,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(2002, "tbl-tc-upgrade-1", "Fail Test", "Desc 2", "FAIL", "NEEDS_FIX", "Fail", "Pass", 0);

    // Legacy issue log entries where status held priority values
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(2003, "tbl-issues-upgrade-1", "High Issue", "Desc 3", "HIGH", "NEEDS_FIX", 0);
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(2004, "tbl-issues-upgrade-1", "Medium Issue", "Desc 4", "MEDIUM", "NEEDS_RETEST", 0);
    db.prepare(
      "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,isDeleted,updatedAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)",
    ).run(2005, "tbl-issues-upgrade-1", "Low Fixed Issue", "Desc 5", "LOW", "FIXED", 0);

    db.close();

    // Deploy Step 2.3 migration
    fs.cpSync(
      path.join(root, "prisma/migrations/20261028030000_normalize_entry_priority_and_constraints"),
      path.join(migrations, "20261028030000_normalize_entry_priority_and_constraints"),
      { recursive: true },
    );
    deployMigrations(testDatabase, path.join(workspace, "schema.prisma"));

    db = new DatabaseSync(testDatabase.database);
    try {
      // 1. Verify test case entries remained intact with priority null
      const tc1 = db.prepare("SELECT status, priority, fixStatus FROM Entry WHERE id=?").get(2001);
      assert.equal(tc1.status, "SUCCESS");
      assert.equal(tc1.priority, null);
      assert.equal(tc1.fixStatus, "FIXED");

      const tc2 = db.prepare("SELECT status, priority, fixStatus FROM Entry WHERE id=?").get(2002);
      assert.equal(tc2.status, "FAIL");
      assert.equal(tc2.priority, null);
      assert.equal(tc2.fixStatus, "NEEDS_FIX");

      // 2. Verify issue log entries migrated priority from status and updated status to OPEN/CLOSED
      const issue1 = db.prepare("SELECT status, priority, fixStatus FROM Entry WHERE id=?").get(2003);
      assert.equal(issue1.priority, "HIGH");
      assert.equal(issue1.status, "OPEN");
      assert.equal(issue1.fixStatus, "NEEDS_FIX");

      const issue2 = db.prepare("SELECT status, priority, fixStatus FROM Entry WHERE id=?").get(2004);
      assert.equal(issue2.priority, "MEDIUM");
      assert.equal(issue2.status, "OPEN");
      assert.equal(issue2.fixStatus, "NEEDS_RETEST");

      const issue3 = db.prepare("SELECT status, priority, fixStatus FROM Entry WHERE id=?").get(2005);
      assert.equal(issue3.priority, "LOW");
      assert.equal(issue3.status, "CLOSED");
      assert.equal(issue3.fixStatus, "FIXED");

      // 3. Verify SQLite CHECK constraint rejects invalid priority
      assert.throws(
        () =>
          db.prepare(
            "INSERT INTO Entry (id,tableId,title,description,status,priority,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
          ).run(2006, "tbl-issues-upgrade-1", "Invalid Priority", "Desc", "OPEN", "CRITICAL"),
        /CHECK constraint failed/,
      );

      // 4. Verify SQLite trigger rejects invalid Table tableType
      assert.throws(
        () =>
          db.prepare(
            "INSERT INTO \"Table\" (id,projectId,name,tableType,updatedAt) VALUES (?,?,?,?,CURRENT_TIMESTAMP)",
          ).run("tbl-invalid", "proj-schema-upgrade-1", "Invalid Table", "KANBAN"),
        /INVALID_TABLE_TYPE/,
      );
      assert.throws(
        () =>
          db.prepare("UPDATE \"Table\" SET tableType=? WHERE id=?").run("SPRINT_BOARD", "tbl-tc-upgrade-1"),
        /INVALID_TABLE_TYPE/,
      );

      // 5. Verify SQLite trigger rejects invalid Entry status
      assert.throws(
        () =>
          db.prepare(
            "INSERT INTO Entry (id,tableId,title,description,status,updatedAt) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP)",
          ).run(2007, "tbl-tc-upgrade-1", "Invalid Status", "Desc", "IN_PROGRESS"),
        /INVALID_ENTRY_STATUS/,
      );
      assert.throws(
        () => db.prepare("UPDATE Entry SET status=? WHERE id=?").run("BLOCKED", 2001),
        /INVALID_ENTRY_STATUS/,
      );

      // 6. Verify SQLite trigger rejects invalid Entry fixStatus
      assert.throws(
        () =>
          db.prepare(
            "INSERT INTO Entry (id,tableId,title,description,status,fixStatus,updatedAt) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)",
          ).run(2008, "tbl-tc-upgrade-1", "Invalid Fix", "Desc", "FAIL", "WONT_FIX"),
        /INVALID_FIX_STATUS/,
      );
      assert.throws(
        () => db.prepare("UPDATE Entry SET fixStatus=? WHERE id=?").run("CANNOT_REPRODUCE", 2002),
        /INVALID_FIX_STATUS/,
      );
    } finally {
      db.close();
    }
  });
});
