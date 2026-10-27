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

async function main() {
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
    console.error(`Error: User with email "${targetEmail}" does not exist in the database.`);
    console.error("The user must complete standard registration before being granted administrative privileges.");
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`Notice: User "${user.email}" (ID: ${user.id}) is already an administrator.`);
    process.exit(0);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
  });

  console.log(
    `[audit] SUCCESS: User "${user.email}" (ID: ${user.id}) successfully elevated to ADMIN at ${new Date().toISOString()}`,
  );
}

main()
  .catch((err) => {
    console.error("Fatal error during administrator provisioning:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
