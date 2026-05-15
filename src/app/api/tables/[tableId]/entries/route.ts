import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ tableId: string }> | { tableId: string };
};

export async function GET(_req: Request, { params }: RouteContext) {
  try {
    const { tableId } = await params;
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
