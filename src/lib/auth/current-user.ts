import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

import { isAdminRole } from "./roles";

export const parseNumericId = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) {
    return null;
  }

  let dbUser: Awaited<ReturnType<typeof prisma.user.findUnique>> | null = null;
  const sessionUserId = parseNumericId(session.user.id);

  if (sessionUserId !== null) {
    dbUser = await prisma.user.findUnique({ where: { id: sessionUserId } });
  }

  if (!dbUser && session.user.email) {
    dbUser = await prisma.user.findUnique({ where: { email: session.user.email } });
  }

  if (!dbUser) {
    return null;
  }

  return dbUser;
}

export async function isCurrentUserAdmin() {
  const user = await getCurrentUser();
  return Boolean(user && isAdminRole(user.role));
}
