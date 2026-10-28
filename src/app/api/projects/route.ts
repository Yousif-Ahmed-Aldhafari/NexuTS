import { NextResponse } from "next/server";

import { canManageProject, requireAuth } from "@/lib/auth/access-control";
import { projectInput, secureMutation } from "@/lib/auth/mutation-guard";
import { buildPaginatedResponse, parsePaginationParams } from "@/lib/pagination";
import { prisma } from "@/lib/prisma";

const normalizeText = (value: string) => value.trim().toLowerCase();

export async function GET(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { searchParams } = new URL(req.url);
    const paginationResult = parsePaginationParams(searchParams);
    if (!paginationResult.ok) {
      return NextResponse.json({ error: paginationResult.error }, { status: 400 });
    }
    const { page, limit, skip, take } = paginationResult.params;
    const format = searchParams.get("format");

    const whereClause = user.isAdmin ? {} : { userId: user.id };
    const [total, projects] = await Promise.all([
      prisma.project.count({ where: whereClause }),
      prisma.project.findMany({
        where: whereClause,
        include: {
          tables: true,
          user: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
    ]);
    return buildPaginatedResponse(projects, total, { page, limit }, format);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

async function postHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  if (!user.isAdmin) {
    return NextResponse.json({ error: "Only admins can add projects." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
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

    const createdByUsername = user.name || user.email?.split("@")[0] || "Unknown";

    const baseData = {
      name: normalizedName,
      url: normalizedUrl || null,
      logo: logo || null,
    };
    const userConnectData = {
      user: {
        connect: {
          id: user.id,
        },
      },
    };

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
    console.error("[api/projects] Failed to add project:", error);
    return NextResponse.json({ error: "Failed to add project" }, { status: 500 });
  }
}

async function putHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  const body = await req.json().catch(() => ({}));
  const { id, name, url, logo } = body;
  const normalizedName = typeof name === "string" ? name.trim() : "";
  const normalizedUrl = typeof url === "string" ? url.trim() : "";

  if (!id || !normalizedName) {
    return NextResponse.json({ error: "Project ID and name are required" }, { status: 400 });
  }

  if (logo && (typeof logo !== "string" || !logo.startsWith("data:image/png;base64,"))) {
    return NextResponse.json({ error: "Project logo must be a PNG file." }, { status: 400 });
  }

  const existingProject = await prisma.project.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });

  if (!existingProject || !canManageProject(user, existingProject)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
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

async function deleteHandler(req: Request) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 });
    }

    const existingProject = await prisma.project.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!existingProject || !canManageProject(user, existingProject)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await prisma.project.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (_error) {
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}

export const POST = secureMutation(postHandler, projectInput);

export const PUT = secureMutation(putHandler, projectInput);

export const DELETE = secureMutation(deleteHandler, undefined);
