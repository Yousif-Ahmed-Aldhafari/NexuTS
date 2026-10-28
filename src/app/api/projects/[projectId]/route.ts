import { NextResponse } from "next/server";

import { canAccessProject, requireAuth } from "@/lib/auth/access-control";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ projectId: string }> | { projectId: string };
};

export async function GET(_req: Request, { params }: RouteContext) {
  const authCheck = await requireAuth();
  if (!authCheck.authenticated) return authCheck.response;
  const { user } = authCheck;

  try {
    const { projectId } = await params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        tables: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!project || !canAccessProject(user, project)) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (_error) {
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}
