import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { type AppLocale, LOCALE_VALUES } from "@/lib/i18n";
import { MIN_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH_MESSAGE } from "@/lib/password-rules";
import { prisma } from "@/lib/prisma";

const parseNumericId = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const isSupportedLocale = (value: unknown): value is AppLocale =>
  typeof value === "string" && LOCALE_VALUES.includes(value as AppLocale);

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

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      id: user.id,
      name: user.name || "",
      email: user.email || "",
      emailVerified: user.emailVerified,
      language: isSupportedLocale(user.language) ? user.language : "en",
    });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const action = typeof body?.action === "string" ? body.action : "";

    if (action === "update-username") {
      const username = typeof body?.username === "string" ? body.username.trim() : "";
      if (!username) {
        return NextResponse.json({ error: "Username is required." }, { status: 400 });
      }

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: { name: username },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          language: true,
          role: true,
        },
      });

      return NextResponse.json({ success: true, user: updated });
    }

    if (action === "change-password") {
      const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
      const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
      const confirmNewPassword = typeof body?.confirmNewPassword === "string" ? body.confirmNewPassword : "";

      if (!currentPassword || !newPassword || !confirmNewPassword) {
        return NextResponse.json({ error: "All password fields are required." }, { status: 400 });
      }

      if (newPassword.length < MIN_PASSWORD_LENGTH) {
        return NextResponse.json({ error: MIN_PASSWORD_LENGTH_MESSAGE }, { status: 400 });
      }

      if (newPassword !== confirmNewPassword) {
        return NextResponse.json({ error: "Confirm password does not match." }, { status: 400 });
      }

      const { valid } = await verifyPassword(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }

      const hashedPassword = await hashPassword(newPassword);

      await prisma.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return NextResponse.json({ success: true });
    }

    if (action === "update-language") {
      const language = body?.language;
      if (!isSupportedLocale(language)) {
        return NextResponse.json({ error: "Invalid language." }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { language },
      });

      return NextResponse.json({ success: true, language });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update profile." }, { status: 500 });
  }
}
