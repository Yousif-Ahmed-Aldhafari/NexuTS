-- Additive migration. Review before applying to a non-isolated database.
ALTER TABLE "User" ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "VerificationProof" (
 "digest" TEXT NOT NULL PRIMARY KEY, "userId" INTEGER NOT NULL, "email" TEXT NOT NULL,
 "purpose" TEXT NOT NULL, "expiresAt" DATETIME NOT NULL
);
CREATE INDEX "VerificationProof_userId_purpose_idx" ON "VerificationProof"("userId", "purpose");
CREATE TABLE "AuthRateLimit" ("key" TEXT NOT NULL PRIMARY KEY, "count" INTEGER NOT NULL, "expiresAt" DATETIME NOT NULL);
CREATE INDEX "AuthRateLimit_expiresAt_idx" ON "AuthRateLimit"("expiresAt");
-- SQLite serializes writers. These invariants also cover concurrent connections and CLI writes.
CREATE TRIGGER "protect_last_admin_update" BEFORE UPDATE OF role, disabled ON "User"
WHEN OLD.role = 'ADMIN' AND OLD.disabled = false AND (NEW.role <> 'ADMIN' OR NEW.disabled = true)
AND (SELECT COUNT(*) FROM "User" WHERE role = 'ADMIN' AND disabled = false) <= 1
BEGIN SELECT RAISE(ABORT, 'LAST_ADMIN'); END;
CREATE TRIGGER "protect_last_admin_delete" BEFORE DELETE ON "User"
WHEN OLD.role = 'ADMIN' AND OLD.disabled = false
AND (SELECT COUNT(*) FROM "User" WHERE role = 'ADMIN' AND disabled = false) <= 1
BEGIN SELECT RAISE(ABORT, 'LAST_ADMIN'); END;
-- All password writers, including maintenance scripts, revoke old sessions automatically.
CREATE TRIGGER "revoke_password_sessions" AFTER UPDATE OF password ON "User"
WHEN OLD.password IS NOT NEW.password
BEGIN UPDATE "User" SET sessionVersion = sessionVersion + 1 WHERE id = NEW.id; END;
CREATE TRIGGER "revoke_role_sessions" AFTER UPDATE OF role, disabled, email ON "User"
WHEN OLD.role IS NOT NEW.role OR OLD.disabled IS NOT NEW.disabled OR OLD.email IS NOT NEW.email
BEGIN
 UPDATE "User" SET sessionVersion = sessionVersion + 1,
 emailVerified = CASE WHEN OLD.email IS NOT NEW.email THEN NULL ELSE NEW.emailVerified END WHERE id = NEW.id;
 DELETE FROM "VerificationProof" WHERE userId = NEW.id;
END;
