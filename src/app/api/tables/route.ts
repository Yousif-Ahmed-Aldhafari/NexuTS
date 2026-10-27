import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const TABLE_TYPES = ["TEST_CASES", "ISSUE_LOGS"] as const;
const normalizeText = (value: string) => value.trim().toLowerCase();

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const tables = await prisma.table.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(tables);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch tables" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "You must be signed in to create a table." }, { status: 401 });
    }
    if (!isAdminRole(session.user.role)) {
      return NextResponse.json({ error: "Only admins can create tables." }, { status: 403 });
    }

    const createdBy = session?.user?.name || session?.user?.email?.split("@")[0] || "Unknown";
    const body = await req.json();
    const { name, projectId, tableType } = body;
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (!normalizedName || !projectId) {
      return NextResponse.json({ error: "Table name and project ID are required" }, { status: 400 });
    }

    if (!TABLE_TYPES.includes(tableType)) {
      return NextResponse.json({ error: "Table Type is required." }, { status: 400 });
    }

    const normalizedTableType = tableType;

    const existingTables = await prisma.table.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
      },
    });

    const hasDuplicateName = existingTables.some(
      (table) => normalizeText(table.name) === normalizeText(normalizedName),
    );
    if (hasDuplicateName) {
      return NextResponse.json({ error: "A table with this name already exists in this project." }, { status: 409 });
    }

    const table = await prisma.table.create({
      data: {
        name: normalizedName,
        projectId,
        tableType: normalizedTableType,
        createdBy,
      },
    });

    return NextResponse.json(table, { status: 201 });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to create table" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { id, name, tableType } = body;
    const normalizedName = typeof name === "string" ? name.trim() : "";

    if (!id || !normalizedName) {
      return NextResponse.json({ error: "Table ID and name are required" }, { status: 400 });
    }

    const existingTable = await prisma.table.findUnique({
      where: { id },
      select: { id: true, projectId: true },
    });

    if (!existingTable) {
      return NextResponse.json({ error: "Table not found." }, { status: 404 });
    }

    const normalizedTableType = TABLE_TYPES.includes(tableType) ? tableType : "TEST_CASES";

    const siblingTables = await prisma.table.findMany({
      where: {
        projectId: existingTable.projectId,
        NOT: { id },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const hasDuplicateName = siblingTables.some((table) => normalizeText(table.name) === normalizeText(normalizedName));
    if (hasDuplicateName) {
      return NextResponse.json({ error: "A table with this name already exists in this project." }, { status: 409 });
    }

    const table = await prisma.table.update({
      where: { id },
      data: {
        name: normalizedName,
        tableType: normalizedTableType,
      },
    });

    return NextResponse.json(table);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to update table" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Table ID is required" }, { status: 400 });
    }

    await prisma.table.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete table" }, { status: 500 });
  }
}
