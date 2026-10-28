import { NextResponse } from "next/server";

import { requireAuth, resolveTableAccess } from "@/lib/auth/access-control";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ tableId: string }> | { tableId: string };
};

export async function GET(_req: Request, { params }: RouteContext) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { tableId } = await params;
    const table = await resolveTableAccess(tableId, user);
    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const entries = await prisma.entry.findMany({
      where: {
        tableId,
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(entries);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}
