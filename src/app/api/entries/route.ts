import { NextResponse } from "next/server";

import { requireAuth, resolveEntryAccess, resolveTableAccess } from "@/lib/auth/access-control";
import { prisma } from "@/lib/prisma";
import { validateAndNormalizeEntryInput } from "@/lib/qa-entry-schema";

export async function POST(req: Request) {
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

export async function PUT(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const body = await req.json().catch(() => ({}));
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
    }

    const entryId = Number.parseInt(String(id), 10);
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

export async function DELETE(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const entryId = Number.parseInt(id, 10);
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
