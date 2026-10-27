import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { isAdminRole } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";

const normalizeText = (value: string) => value.trim().toLowerCase();
const parseNumericId = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      include: {
        tables: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(projects);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: "You must be signed in to create a project" }, { status: 401 });
    }
    if (!isAdminRole(session.user.role)) {
      return NextResponse.json({ error: "Only admins can add projects." }, { status: 403 });
    }

    const body = await req.json();
    const { name, url, logo } = body;
    const normalizedName = typeof name === "string" ? name.trim() : "";
    const normalizedUrl = typeof url === "string" ? url.trim() : "";

    if (!normalizedName) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    if (logo && (typeof logo !== "string" || !logo.startsWith("data:image/png;base64,"))) {
      return NextResponse.json({ error: "Project logo must be a PNG file." }, { status: 400 });
    }

    const existingProjects = await prisma.project.findMany({
      select: {
        id: true,
        name: true,
        url: true,
      },
    });

    const hasDuplicateName = existingProjects.some(
      (project) => normalizeText(project.name) === normalizeText(normalizedName),
    );
    if (hasDuplicateName) {
      return NextResponse.json({ error: "A project with this name already exists." }, { status: 409 });
    }

    if (normalizedUrl) {
      const hasDuplicateUrl = existingProjects.some(
        (project) => typeof project.url === "string" && normalizeText(project.url) === normalizeText(normalizedUrl),
      );
      if (hasDuplicateUrl) {
        return NextResponse.json({ error: "A project with this URL already exists." }, { status: 409 });
      }
    }

    let dbUser: { id: number; name: string | null; email: string | null } | null = null;
    const sessionUserId = parseNumericId(session.user.id);

    if (sessionUserId !== null) {
      dbUser = await prisma.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true, name: true, email: true },
      });
    } else if (session.user.email) {
      dbUser = await prisma.user.findUnique({
        where: { email: session.user.email },
        select: { id: true, name: true, email: true },
      });
    }

    const createdByUsername =
      dbUser?.name || session.user.name || dbUser?.email?.split("@")[0] || session.user.email?.split("@")[0];

    if (!createdByUsername) {
      return NextResponse.json(
        { error: "Could not determine username for project creator. Please update your profile name." },
        { status: 400 },
      );
    }

    const baseData = {
      name: normalizedName,
      url: normalizedUrl || null,
      logo: logo || null,
    };
    const creatorUserId = dbUser?.id ?? sessionUserId ?? null;
    const userConnectData = creatorUserId
      ? {
          user: {
            connect: {
              id: creatorUserId,
            },
          },
        }
      : {};

    let project: Awaited<ReturnType<typeof prisma.project.create>>;
    try {
      project = await prisma.project.create({
        data: {
          ...baseData,
          ...userConnectData,
          createdBy: createdByUsername,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const hasLogoClientMismatch =
        message.includes("Unknown argument `logo`") ||
        message.includes("Unknown arg `logo`") ||
        message.includes("Did you mean `url`");
      const hasCreatedByClientMismatch =
        message.includes("Unknown argument `createdBy`") ||
        message.includes("Unknown arg `createdBy`") ||
        message.includes("Did you mean `createdAt`");

      if (!hasCreatedByClientMismatch && !hasLogoClientMismatch) {
        throw error;
      }

      // Fallback for stale Prisma Client: create first with guaranteed fields, then persist extra columns via raw SQL.
      project = await prisma.project.create({
        data: {
          name: normalizedName,
          url: normalizedUrl || null,
          ...userConnectData,
        },
      });

      try {
        await prisma.$executeRaw`
          UPDATE "Project"
          SET "createdBy" = ${createdByUsername}, "logo" = ${logo || null}
          WHERE "id" = ${project.id}
        `;
      } catch (_rawUpdateError) {
        // Ignore fallback update errors so project creation still succeeds.
      }
    }

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ error: "Failed to add project", details }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const body = await req.json();
  const { id, name, url, logo } = body;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedUrl = typeof url === "string" ? url.trim() : "";

  if (!id || !normalizedName) {
    return NextResponse.json({ error: "Project ID and name are required" }, { status: 400 });
  }

  if (logo && (typeof logo !== "string" || !logo.startsWith("data:image/png;base64,"))) {
    return NextResponse.json({ error: "Project logo must be a PNG file." }, { status: 400 });
  }

  const existingProjects = await prisma.project.findMany({
    where: {
      NOT: { id },
    },
    select: {
      id: true,
      name: true,
      url: true,
    },
  });

  const hasDuplicateName = existingProjects.some(
    (project) => normalizeText(project.name) === normalizeText(normalizedName),
  );
  if (hasDuplicateName) {
    return NextResponse.json({ error: "A project with this name already exists." }, { status: 409 });
  }

  if (normalizedUrl) {
    const hasDuplicateUrl = existingProjects.some(
      (project) => typeof project.url === "string" && normalizeText(project.url) === normalizeText(normalizedUrl),
    );
    if (hasDuplicateUrl) {
      return NextResponse.json({ error: "A project with this URL already exists." }, { status: 409 });
    }
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: {
        name: normalizedName,
        url: normalizedUrl || null,
        logo: logo || null,
      },
    });

    return NextResponse.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const hasLogoClientMismatch =
      message.includes("Unknown argument `logo`") ||
      message.includes("Unknown arg `logo`") ||
      message.includes("Did you mean `url`");

    if (!hasLogoClientMismatch) {
      return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }

    try {
      const project = await prisma.project.update({
        where: { id },
        data: {
          name: normalizedName,
          url: normalizedUrl || null,
        },
      });

      try {
        await prisma.$executeRaw`
          UPDATE "Project"
          SET "logo" = ${logo || null}
          WHERE "id" = ${project.id}
        `;
      } catch (_rawUpdateError) {
        // Ignore logo fallback update errors so update still succeeds.
      }

      return NextResponse.json(project);
    } catch (_fallbackError) {
      return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
    }
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
