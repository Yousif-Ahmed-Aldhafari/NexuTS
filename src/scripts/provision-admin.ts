/**
 * Explicit Administrator Provisioning CLI Script
 *
 * Usage:
 *   npx ts-node src/scripts/provision-admin.ts <user-email>
 *
 * Security:
 *   - Only callable via server-side CLI execution (never exposed to HTTP).
 *   - Fails closed if user does not exist or arguments are missing.
 *   - Logs an explicit, auditable timestamp of administrative role elevation.
 */

import { prisma } from "../lib/prisma";
import fs from "node:fs";
import path from "node:path";

async function main() {
  if (process.env.ALLOW_ADMIN_PROVISIONING !== "true" || !process.env.DATABASE_URL) {
    throw new Error("Explicit DATABASE_URL and ALLOW_ADMIN_PROVISIONING=true are required.");
  }
  const databases = await prisma.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
  if (fs.realpathSync(databases[0].file) === fs.realpathSync(path.resolve("prisma/dev.db"))) {
    throw new Error("Provisioning against the protected original database is prohibited.");
  }
  const targetEmail = process.argv[2]?.trim().toLowerCase();

  if (!targetEmail) {
    console.error("Error: Target user email address is required.");
    console.error("Usage: npx ts-node src/scripts/provision-admin.ts <user-email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email: targetEmail },
    select: { id: true, email: true, name: true, role: true },
  });

  if (!user) {
    console.error("Error: Target account does not exist.");
    console.error("The user must complete standard registration before being granted administrative privileges.");
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`Notice: Account ${user.id} is already an administrator.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(`[audit] Administrator provisioned: accountId=${user.id} at ${new Date().toISOString()}`);
}

main()
  .catch(() => {
    console.error("Administrator provisioning failed. Check explicit configuration and account identifier.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
