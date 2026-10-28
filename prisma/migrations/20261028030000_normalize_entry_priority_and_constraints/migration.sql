-- AlterTable: Add priority column to Entry with CHECK constraint
ALTER TABLE "Entry" ADD COLUMN "priority" TEXT CHECK ("priority" IS NULL OR "priority" IN ('HIGH', 'MEDIUM', 'LOW'));

-- Backfill legacy issue-log entries where status held priority values
UPDATE "Entry"
SET
  "priority" = "status",
  "status" = CASE
    WHEN "fixStatus" = 'FIXED' THEN 'CLOSED'
    ELSE 'OPEN'
  END
WHERE "tableId" IN (SELECT "id" FROM "Table" WHERE "tableType" = 'ISSUE_LOGS')
  AND "status" IN ('HIGH', 'MEDIUM', 'LOW');

-- Triggers for Table.tableType validation
CREATE TRIGGER IF NOT EXISTS "validate_table_table_type_insert"
BEFORE INSERT ON "Table" FOR EACH ROW
WHEN NEW."tableType" NOT IN ('TEST_CASES', 'ISSUE_LOGS')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_TABLE_TYPE: tableType must be TEST_CASES or ISSUE_LOGS');
END;

CREATE TRIGGER IF NOT EXISTS "validate_table_table_type_update"
BEFORE UPDATE OF "tableType" ON "Table" FOR EACH ROW
WHEN NEW."tableType" NOT IN ('TEST_CASES', 'ISSUE_LOGS')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_TABLE_TYPE: tableType must be TEST_CASES or ISSUE_LOGS');
END;

-- Triggers for Entry.status validation
CREATE TRIGGER IF NOT EXISTS "validate_entry_status_insert"
BEFORE INSERT ON "Entry" FOR EACH ROW
WHEN NEW."status" NOT IN ('SUCCESS', 'FAIL', 'OPEN', 'CLOSED', 'NEW')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ENTRY_STATUS: status must be SUCCESS, FAIL, OPEN, CLOSED, or NEW');
END;

CREATE TRIGGER IF NOT EXISTS "validate_entry_status_update"
BEFORE UPDATE OF "status" ON "Entry" FOR EACH ROW
WHEN NEW."status" NOT IN ('SUCCESS', 'FAIL', 'OPEN', 'CLOSED', 'NEW')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_ENTRY_STATUS: status must be SUCCESS, FAIL, OPEN, CLOSED, or NEW');
END;

-- Triggers for Entry.fixStatus validation
CREATE TRIGGER IF NOT EXISTS "validate_entry_fix_status_insert"
BEFORE INSERT ON "Entry" FOR EACH ROW
WHEN NEW."fixStatus" IS NOT NULL AND NEW."fixStatus" != '' AND NEW."fixStatus" NOT IN ('NEEDS_FIX', 'NEEDS_RETEST', 'FIXED')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_FIX_STATUS: fixStatus must be NEEDS_FIX, NEEDS_RETEST, or FIXED');
END;

CREATE TRIGGER IF NOT EXISTS "validate_entry_fix_status_update"
BEFORE UPDATE OF "fixStatus" ON "Entry" FOR EACH ROW
WHEN NEW."fixStatus" IS NOT NULL AND NEW."fixStatus" != '' AND NEW."fixStatus" NOT IN ('NEEDS_FIX', 'NEEDS_RETEST', 'FIXED')
BEGIN
  SELECT RAISE(ABORT, 'INVALID_FIX_STATUS: fixStatus must be NEEDS_FIX, NEEDS_RETEST, or FIXED');
END;
