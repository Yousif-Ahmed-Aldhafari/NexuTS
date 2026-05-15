import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { validateAndNormalizeEntryInput } from "@/lib/qa-entry-schema";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { tableId } = body;

    if (!tableId) {
      return NextResponse.json({ error: "Table ID is required." }, { status: 400 });
    }

    const table = await prisma.table.findUnique({
      where: { id: tableId },
      select: { tableType: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const validated = validateAndNormalizeEntryInput(body, table.tableType as "TEST_CASES" | "ISSUE_LOGS");
    if (!validated.data) {
      return NextResponse.json({ error: validated.error || "Invalid entry payload." }, { status: 400 });
    }

    const entry = await prisma.entry.create({
      data: {
        tableId,
        ...validated.data,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create entry" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "Entry ID is required." }, { status: 400 });
    }

    const entryId = parseInt(id, 10);
    if (Number.isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid Entry ID." }, { status: 400 });
    }

    const existingEntry = await prisma.entry.findUnique({
      where: { id: entryId },
      select: { tableId: true },
    });

    if (!existingEntry) {
      return NextResponse.json({ error: "Entry not found." }, { status: 404 });
    }

    const table = await prisma.table.findUnique({
      where: { id: existingEntry.tableId },
      select: { tableType: true },
    });

    if (!table) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const validated = validateAndNormalizeEntryInput(body, table.tableType as "TEST_CASES" | "ISSUE_LOGS");
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
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const entryId = parseInt(id, 10);
    if (Number.isNaN(entryId)) {
      return NextResponse.json({ error: "Invalid Entry ID." }, { status: 400 });
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
