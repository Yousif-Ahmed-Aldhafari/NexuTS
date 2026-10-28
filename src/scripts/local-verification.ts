/** Local-only trusted test delivery. Writes a token to a private file; never prints it. */

import { issueVerification } from "../lib/auth/verification";
import { prisma } from "../lib/prisma";
import fs from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_LOCAL_VERIFICATION !== "true")
    throw new Error("Local delivery is disabled.");
  const databases = await prisma.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
  if (fs.realpathSync(databases[0].file) !== fs.realpathSync(path.resolve("prisma/dev-isolated.db")))
    throw new Error("Isolated database required.");
  const id = Number(process.argv[2]);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Numeric account ID required.");
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user?.email || user.disabled || !user.email.endsWith("@synthetic.local"))
    throw new Error("Only synthetic local accounts are permitted.");
  const token = await issueVerification(id, user.email);
  const directory = path.resolve(".local-verification");
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(directory, `${id}.txt`), token, { mode: 0o600, flag: "wx" });
  console.log("Verification token delivered to a protected local file. No email was sent.");
}
main()
  .catch(() => {
    console.error("Local verification delivery failed.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
