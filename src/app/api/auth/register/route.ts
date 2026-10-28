import { NextResponse } from "next/server";

import { registrationSchema } from "@/lib/auth/account-schemas";
import { hashPassword } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/auth/rate-limit";
import { readBody, requestFailure } from "@/lib/auth/request-security";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const body = await readBody(req, registrationSchema, 8192);
    await enforceRateLimit("register-global", "all", 50, 3600);
    await enforceRateLimit("register-email", body.email, 3, 3600);
    const password = await hashPassword(body.password);
    // Equal expensive work and identical response for existing/nonexistent accounts.
    await prisma.user.upsert({
      where: { email: body.email },
      update: {},
      create: {
        email: body.email,
        name: body.username,
        password,
        role: "USER",
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, email: body.email }, { status: 201 });
  } catch (error) {
    return requestFailure(error);
  }
}
