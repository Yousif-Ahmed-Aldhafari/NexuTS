const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const protectedFiles = [path.join(root, "prisma/dev.db"), path.join(root, "prisma/dev-isolated.db")];
const markerName = ".nexuts-disposable-test-database";

function hash(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function snapshotDeveloperDatabases() {
  return protectedFiles.map((file) => {
    if (!fs.existsSync(file)) return { file, exists: false };
    return { file: fs.realpathSync(file), exists: true, hash: hash(file), stat: fs.statSync(file) };
  });
}

function assertDeveloperDatabasesUnchanged(snapshot) {
  for (const before of snapshot) {
    if (!before.exists) {
      if (fs.existsSync(before.file)) throw new Error(`Test created a developer database: ${before.file}`);
      continue;
    }
    const after = fs.statSync(before.file);
    if (after.dev !== before.stat.dev || after.ino !== before.stat.ino || hash(before.file) !== before.hash) {
      throw new Error(`Protected developer database changed: ${before.file}`);
    }
  }
}

function createTestDatabase(label) {
  const safeLabel = label.replace(/[^a-z0-9-]/gi, "-").slice(0, 40);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `nexuts-${safeLabel}-`));
  fs.chmodSync(directory, 0o700);
  fs.writeFileSync(path.join(directory, markerName), `${process.pid}\n`, { mode: 0o600, flag: "wx" });
  const database = path.join(directory, "test.db");
  fs.writeFileSync(database, "", { mode: 0o600, flag: "wx" });
  return {
    directory,
    database,
    url: `file:${database}`,
    env: {
      ...process.env,
      DATABASE_URL: `file:${database}`,
      NEXUTS_TEST_DATABASE_DIR: directory,
      NEXUTS_TEST_MODE: "1",
    },
  };
}

function run(command, args, options = {}) {
  const result = cp.spawnSync(command, args, { cwd: root, stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(`${command} failed with exit ${result.status}.`);
}

function deployMigrations(testDatabase, schema = path.join(root, "prisma/schema.prisma")) {
  run("npx", ["--no-install", "prisma", "migrate", "deploy", "--schema", schema], { env: testDatabase.env });
}

function cleanupTestDatabase(testDatabase) {
  const realTemp = fs.realpathSync(os.tmpdir());
  const realDirectory = fs.realpathSync(testDatabase.directory);
  const marker = path.join(realDirectory, markerName);
  if (!realDirectory.startsWith(`${realTemp}${path.sep}`) || !fs.existsSync(marker)) {
    throw new Error(`Refusing to clean unowned test directory: ${realDirectory}`);
  }
  fs.rmSync(realDirectory, { recursive: true, force: false });
}

module.exports = {
  assertDeveloperDatabasesUnchanged,
  cleanupTestDatabase,
  createTestDatabase,
  deployMigrations,
  hash,
  markerName,
  root,
  run,
  snapshotDeveloperDatabases,
};
