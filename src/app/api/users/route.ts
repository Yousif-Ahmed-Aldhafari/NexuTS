import { NextResponse } from "next/server";

import { getCurrentUser, parseNumericId } from "@/lib/auth/current-user";
import { isAdminEmail, isAdminRole, normalizeRole, resolveRoleFromEmail, USER_ROLES } from "@/lib/auth/roles";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_MESSAGE } from "@/lib/password-rules";
import { prisma } from "@/lib/prisma";

const toSafeUserPayload = (user: {
  id: number;
  name: string | null;
  email: string | null;
  role: string;
  emailVerified: Date | null;
}) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: normalizeRole(user.role),
  emailVerified: user.emailVerified,
});

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminRole(user.role)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { ok: true as const, user };
}

export async function GET() {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const users = await prisma.user.findMany({
      where: {
        OR: [{ name: { not: null } }, { email: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json(users.map(toSafeUserPayload));
  } catch (_error) {
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json().catch(() => ({}));
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    const requestedRole = typeof body?.role === "string" ? body.role : USER_ROLES.USER;

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: MIN_PASSWORD_LENGTH_MESSAGE }, { status: 400 });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    const resolvedRole = isAdminEmail(email) ? USER_ROLES.ADMIN : normalizeRole(requestedRole);
    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        password,
        role: resolvedRole,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({ success: true, user: toSafeUserPayload(createdUser) }, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create user." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await req.json().catch(() => ({}));
    const action = typeof body?.action === "string" ? body.action : "";
    const userId = parseNumericId(body?.id);

    if (userId === null) {
      return NextResponse.json({ error: "A valid user id is required." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const isSelfTarget = adminCheck.user.id === userId;

    if (action === "update-user") {
      const nextName = typeof body?.name === "string" ? body.name.trim() : "";
      const nextEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const requestedRole = typeof body?.role === "string" ? body.role : targetUser.role;
      const normalizedRequestedRole = normalizeRole(requestedRole);

      if (!nextName || !nextEmail) {
        return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
      }

      if (isSelfTarget && normalizedRequestedRole !== normalizeRole(targetUser.role)) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
      }

      const duplicateUser = await prisma.user.findFirst({
        where: {
          email: nextEmail,
          NOT: { id: userId },
        },
        select: { id: true },
      });
      if (duplicateUser) {
        return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
      }

      const enforcedRole = resolveRoleFromEmail(nextEmail);
      const nextRole =
        enforcedRole === USER_ROLES.ADMIN
          ? USER_ROLES.ADMIN
          : normalizedRequestedRole === USER_ROLES.ADMIN
            ? USER_ROLES.ADMIN
            : USER_ROLES.USER;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          name: nextName,
          email: nextEmail,
          role: nextRole,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
        },
      });

      return NextResponse.json({ success: true, user: toSafeUserPayload(updatedUser) });
    }

    if (action === "reset-password") {
      const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: MIN_PASSWORD_LENGTH_MESSAGE }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: userId },
        data: { password: newPassword },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "set-role") {
      if (isSelfTarget) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
      }

      const requestedRole = normalizeRole(typeof body?.role === "string" ? body.role : USER_ROLES.USER);
      const nextRole = isAdminEmail(targetUser.email)
        ? USER_ROLES.ADMIN
        : requestedRole === USER_ROLES.ADMIN
          ? USER_ROLES.ADMIN
          : USER_ROLES.USER;

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { role: nextRole },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          emailVerified: true,
        },
      });

      return NextResponse.json({ success: true, user: toSafeUserPayload(updatedUser) });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update user." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const adminCheck = await requireAdmin();
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const { searchParams } = new URL(req.url);
    const userId = parseNumericId(searchParams.get("id"));
    if (userId === null) {
      return NextResponse.json({ error: "A valid user id is required." }, { status: 400 });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (isAdminEmail(targetUser.email)) {
      return NextResponse.json(
        { error: "This admin account cannot be deleted because it is protected by email policy." },
        { status: 403 },
      );
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete user." }, { status: 500 });
  }
}
