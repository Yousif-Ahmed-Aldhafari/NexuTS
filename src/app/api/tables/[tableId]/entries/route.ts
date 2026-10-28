import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { requireAuth, resolveTableAccess } from "@/lib/auth/access-control";
import { buildPaginatedResponse, parsePaginationParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ tableId: string }> | { tableId: string };
};

export async function GET(req: Request, { params }: RouteContext) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { tableId } = await params;
    const table = await resolveTableAccess(tableId, user);
    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const { searchParams } = new URL(req.url);
    const paginationResult = parsePaginationParams(searchParams);
    if (!paginationResult.ok) {
      return NextResponse.json({ error: paginationResult.error }, { status: 400 });
    }
    const { page, limit, skip, take } = paginationResult.params;
    const format = searchParams.get("format");

    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status")?.trim();
    const priority = searchParams.get("priority")?.trim();
    const assignedTo = searchParams.get("assignedTo")?.trim();
    const username = searchParams.get("username")?.trim();

    const where: Prisma.EntryWhereInput = {
      tableId,
      isDeleted: false,
    };

    if (search) {
      where.OR = [{ title: { contains: search } }, { description: { contains: search } }];
    }
    if (status && status !== "ALL") {
      where.status = status;
    }
    if (priority && priority !== "ALL") {
      where.priority = priority;
    }
    if (assignedTo && assignedTo !== "ALL") {
      where.assignedTo = assignedTo;
    }
    if (username && username !== "ALL") {
      where.username = username;
    }

    const [total, entries] = await Promise.all([
      prisma.entry.count({ where }),
      prisma.entry.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
    ]);

    return buildPaginatedResponse(entries, total, { page, limit }, format);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch entries" }, { status: 500 });
  }
}
