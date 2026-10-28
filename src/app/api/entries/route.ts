import { NextResponse } from "next/server";

import type { Prisma } from "@prisma/client";

import { requireAuth, resolveEntryAccess, resolveTableAccess } from "@/lib/auth/access-control";
import { entryInput, secureMutation } from "@/lib/auth/mutation-guard";
import { buildPaginatedResponse, parsePaginationParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";
import { validateAndNormalizeEntryInput } from "@/lib/qa-entry-schema";

export async function GET(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { searchParams } = new URL(req.url);
    const tableId = searchParams.get("tableId");
    if (!tableId) {
      return NextResponse.json({ error: "Table ID is required." }, { status: 400 });
    }

    const table = await resolveTableAccess(tableId, user);
    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const paginationResult = parsePaginationParams(searchParams);
    if (!paginationResult.ok) {
      return NextResponse.json({ error: paginationResult.error }, { status: 400 });
    }
    const { page, limit, skip, take } = paginationResult.params;
    const format = searchParams.get("format");

    const search = searchParams.get("search")?.trim();
    const status = searchParams.get("status")?.trim();
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

async function postHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const { tableId } = body;

    if (!tableId || typeof tableId !== "string") {
      return NextResponse.json({ error: "Table ID is required." }, { status: 400 });
    }

    const table = await resolveTableAccess(tableId, user);
    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const validated = validateAndNormalizeEntryInput(body, table.tableType as "TEST_CASES" | "ISSUE_LOGS");
    if (!validated.data) {
      return NextResponse.json({ error: validated.error || "Invalid entry payload." }, { status: 400 });
    }

    const entry = await prisma.entry.create({
      data: {
        tableId: table.id,
        ...validated.data,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}

async function putHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
    }

    const entryId = Number(id);
    if (!Number.isSafeInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid Entry ID." }, { status: 400 });
    }

    const existingEntry = await resolveEntryAccess(entryId, user);
    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const validated = validateAndNormalizeEntryInput(
      body,
      existingEntry.table.tableType as "TEST_CASES" | "ISSUE_LOGS",
    );
    if (!validated.data) {
      return NextResponse.json({ error: validated.error || "Invalid entry payload." }, { status: 400 });
    }

    const updated = await prisma.entry.update({
      where: { id: entryId },
      data: {
        ...validated.data,
      },
    });
    return NextResponse.json(updated);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update entry" }, { status: 500 });
  }
}

async function deleteHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const entryId = Number(id);
    if (!Number.isSafeInteger(entryId) || entryId <= 0) {
      return NextResponse.json({ error: "Invalid Entry ID." }, { status: 400 });
    }

    const existingEntry = await resolveEntryAccess(entryId, user);
    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    // Soft Delete
    await prisma.entry.update({
      where: { id: entryId },
      data: { isDeleted: true },
    });
    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete entry" }, { status: 500 });
  }
}

export const POST = secureMutation(postHandler, entryInput);

export const PUT = secureMutation(putHandler, entryInput);

export const DELETE = secureMutation(deleteHandler, undefined, true);
