import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { adminCreateSchema, adminUpdateSchema } from "@/lib/auth/account-schemas";
import { getCurrentUser, parseNumericId } from "@/lib/auth/current-user";
import { hashPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { checkOrigin, RequestError, readBody, requestFailure } from "@/lib/auth/request-security";
import { isAdminRole, isValidRole, normalizeRole, USER_ROLES } from "@/lib/auth/roles";
import { requireRecentAuthentication } from "@/lib/auth/session-lifecycle";
import { isStrongPassword, MIN_PASSWORD_LENGTH_MESSAGE } from "@/lib/password-rules";
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

async function requireAdmin(req?: Request) {
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

  if (req) {
    try {
      checkOrigin(req);
      const session = await auth();
      requireRecentAuthentication(session?.authenticatedAt);
      await enforceRateLimit("admin-account-change", String(user.id), 30);
    } catch (error) {
      return { ok: false as const, response: requestFailure(error) };
    }
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
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await readBody(req, adminCreateSchema, 8192);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!name || !email || !password) {
      return NextResponse.json({ error: "Name, email, and password are required." }, { status: 400 });
    }

    if (!isStrongPassword(password)) {
      return NextResponse.json({ error: MIN_PASSWORD_LENGTH_MESSAGE }, { status: 400 });
    }

    if (body?.role !== undefined && !isValidRole(body.role)) {
      return NextResponse.json({ error: "Invalid role specified." }, { status: 400 });
    }
    const resolvedRole = isValidRole(body?.role) ? body.role : USER_ROLES.USER;

    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existingUser) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password);
    const createdUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
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
  } catch (error) {
    if (error instanceof Error && error.message.includes("LAST_ADMIN"))
      return requestFailure(new RequestError(409, "Cannot remove the last active administrator."));
    return requestFailure(error);
  }
}

export async function PUT(req: Request) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const body = await readBody(req, adminUpdateSchema, 8192);
    const action = body.action;
    const userId = parseNumericId(String(body.id));

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

      if (!nextName || !nextEmail) {
        return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
      }

      if (body?.role !== undefined && !isValidRole(body.role)) {
        return NextResponse.json({ error: "Invalid role value." }, { status: 400 });
      }

      const nextRole = isValidRole(body?.role) ? body.role : targetUser.role;

      if (isSelfTarget && nextRole !== targetUser.role) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
      }

      if (targetUser.role === USER_ROLES.ADMIN && nextRole === USER_ROLES.USER) {
        const adminCount = await prisma.user.count({
          where: { role: USER_ROLES.ADMIN },
        });
        if (adminCount <= 1) {
          return NextResponse.json({ error: "Cannot demote the last remaining administrator." }, { status: 400 });
        }
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
      if (!isStrongPassword(newPassword)) {
        return NextResponse.json({ error: MIN_PASSWORD_LENGTH_MESSAGE }, { status: 400 });
      }

      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "set-role") {
      if (isSelfTarget) {
        return NextResponse.json({ error: "You cannot change your own role." }, { status: 403 });
      }

      if (!isValidRole(body?.role)) {
        return NextResponse.json({ error: "Invalid role value." }, { status: 400 });
      }

      const nextRole = body.role;

      if (targetUser.role === USER_ROLES.ADMIN && nextRole === USER_ROLES.USER) {
        const adminCount = await prisma.user.count({
          where: { role: USER_ROLES.ADMIN },
        });
        if (adminCount <= 1) {
          return NextResponse.json({ error: "Cannot demote the last remaining administrator." }, { status: 400 });
        }
      }

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
  } catch (error) {
    if (error instanceof Error && error.message.includes("LAST_ADMIN"))
      return requestFailure(new RequestError(409, "Cannot remove the last active administrator."));
    return requestFailure(error);
  }
}

export async function DELETE(req: Request) {
  const adminCheck = await requireAdmin(req);
  if (!adminCheck.ok) return adminCheck.response;

  try {
    const { searchParams } = new URL(req.url);
    const userId = parseNumericId(searchParams.get("id"));
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

    if (targetUser.id === adminCheck.user.id) {
      return NextResponse.json({ error: "You cannot delete your own account." }, { status: 403 });
    }

    if (targetUser.role === USER_ROLES.ADMIN) {
      const adminCount = await prisma.user.count({
        where: { role: USER_ROLES.ADMIN },
      });
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cannot delete the last remaining administrator." }, { status: 400 });
      }
    }

    await prisma.user.delete({ where: { id: userId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("LAST_ADMIN"))
      return requestFailure(new RequestError(409, "Cannot remove the last active administrator."));
    return requestFailure(error);
  }
}
