import { TestStatusHeader } from "./_components/test-status-header";
import { getHomePageKpiStats } from "./_lib/get-home-page-kpi-stats";

export default async function Page() {
  const stats = await getHomePageKpiStats();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <TestStatusHeader stats={stats} />
    </div>
  );
}
