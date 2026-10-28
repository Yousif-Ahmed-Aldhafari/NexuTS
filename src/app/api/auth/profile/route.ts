import { NextResponse } from "next/server";

import { profileSchema } from "@/lib/auth/account-schemas";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { RequestError, readBody, requestFailure } from "@/lib/auth/request-security";
import { isStrongPassword, MIN_PASSWORD_LENGTH_MESSAGE } from "@/lib/password-rules";
import { prisma } from "@/lib/prisma";

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
      language: user.language === "ar" ? "ar" : "en",
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

    const body = await readBody(req, profileSchema, 8192);
    await enforceRateLimit("profile-change", String(user.id), 10);
    const action = body.action;

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

      if (!isStrongPassword(newPassword)) {
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

      const changed = await prisma.user.updateMany({
        where: { id: user.id, password: user.password, sessionVersion: user.sessionVersion, disabled: false },
        data: { password: hashedPassword },
      });
      if (changed.count !== 1) throw new RequestError(409, "Account changed. Sign in again.");

      return NextResponse.json({ success: true });
    }

    if (action === "update-language") {
      const language = body?.language;
      if (language !== "en" && language !== "ar") {
        return NextResponse.json({ error: "Invalid language." }, { status: 400 });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { language },
      });

      return NextResponse.json({ success: true, language });
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  } catch (error) {
    return requestFailure(error);
  }
}
