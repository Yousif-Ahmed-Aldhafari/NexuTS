import { Suspense } from "react";

import { auth } from "@/auth";

import { ProjectsDashboard } from "./_components/projects-dashboard";
import { QaLoadingFallback } from "./_components/qa-loading-fallback";

export default async function QABoardsPage() {
  const session = await auth();

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col gap-6 overflow-x-hidden">
      <Suspense fallback={<QaLoadingFallback />}>
        <ProjectsDashboard session={session} />
      </Suspense>
    </div>
  );
}
