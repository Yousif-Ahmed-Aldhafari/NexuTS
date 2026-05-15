import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const users = await prisma.user.findMany({
      where: {
        OR: [{ name: { not: null } }, { email: { not: null } }],
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    });

    return NextResponse.json(users);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to load users." }, { status: 500 });
  }
}
