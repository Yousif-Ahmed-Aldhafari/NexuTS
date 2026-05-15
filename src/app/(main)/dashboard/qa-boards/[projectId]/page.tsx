import type { Metadata } from "next";

import { prisma } from "@/lib/prisma";

import { ProjectWorkspace } from "../_components/project-workspace";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });

  return {
    title: project?.name ? `${project.name} | Projects` : "Project | Projects",
  };
}

export default async function QABoardProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  return (
    <div className="flex h-full w-full min-w-0 max-w-full flex-col gap-6 overflow-x-hidden p-6">
      <ProjectWorkspace projectId={projectId} />
    </div>
  );
}
