import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const parseNumericId = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const getCurrentUser = async () => {
  const session = await auth();
  if (!session?.user) return null;

  const sessionUserId = parseNumericId(session.user.id);
  if (sessionUserId !== null) {
    return prisma.user.findUnique({ where: { id: sessionUserId } });
  }

  if (session.user.email) {
    return prisma.user.findUnique({ where: { email: session.user.email } });
  }

  return null;
};

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!code) {
      return NextResponse.json({ error: "Verification code is required." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to verify email." }, { status: 500 });
  }
}
