import assert from "node:assert/strict";
import path from "node:path";

export function assertDisposableDatabasePath(physicalFile: string) {
  const directory = process.env.NEXUTS_TEST_DATABASE_DIR;
  assert.ok(directory, "NEXUTS_TEST_DATABASE_DIR must be set by the disposable test runner.");
  assert.equal(path.resolve(physicalFile), path.join(path.resolve(directory), "test.db"));
  assert.notEqual(path.basename(physicalFile), "dev.db");
  assert.notEqual(path.basename(physicalFile), "dev-isolated.db");
}
