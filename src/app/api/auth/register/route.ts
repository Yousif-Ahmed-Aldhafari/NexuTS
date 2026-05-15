import { NextResponse } from "next/server";

import { normalizeEmail, resolveRoleFromEmail } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { username, email, password } = await req.json();
    const normalizedEmail = normalizeEmail(email);

    if (!username || !normalizedEmail || !password) {
      return NextResponse.json({ error: "Username, email and password are required" }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json({ error: "User already exists" }, { status: 400 });
    }

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password, // In a true production app, use bcrypt to hash this securely here
        name: username,
        role: resolveRoleFromEmail(normalizedEmail),
      },
    });

    return NextResponse.json({ success: true, email: user.email }, { status: 201 });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
