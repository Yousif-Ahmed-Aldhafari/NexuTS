import { ProjectsDashboard } from "@/app/(main)/dashboard/qa-boards/_components/projects-dashboard";
import { auth } from "@/auth";

export default async function NexumindProjectsPage() {
  const session = await auth();

  return <ProjectsDashboard session={session} variant="nexumind" />;
}
