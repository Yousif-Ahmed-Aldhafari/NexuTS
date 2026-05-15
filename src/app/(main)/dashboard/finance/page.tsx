"use client";

import { useI18n } from "@/lib/i18n/use-i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { CardOverview } from "./_components/card-overview";
import { CashFlowOverview } from "./_components/cash-flow-overview";
import { IncomeReliability } from "./_components/income-reliability";
import { MonthlyCashFlow } from "./_components/kpis/monthly-cash-flow";
import { NetWorth } from "./_components/kpis/net-worth";
import { PrimaryAccount } from "./_components/kpis/primary-account";
import { SavingsRate } from "./_components/kpis/savings-rate";
import { SpendingBreakdown } from "./_components/spending-breakdown";

export default function Page() {
  const { t } = useI18n();

  return (
    <div>
      <Tabs className="gap-4" defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("finance.tabs.overview")}</TabsTrigger>
          <TabsTrigger disabled value="activity">
            {t("finance.tabs.activity")}
          </TabsTrigger>
          <TabsTrigger disabled value="insights">
            {t("finance.tabs.insights")}
          </TabsTrigger>
          <TabsTrigger disabled value="utilities">
            {t("finance.tabs.utilities")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="flex flex-col gap-4 **:data-[slot=card]:shadow-xs">
            <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:gap-2 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
              <PrimaryAccount />
              <NetWorth />
              <MonthlyCashFlow />
              <SavingsRate />
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
              <div className="flex flex-col gap-4">
                <CashFlowOverview />

                <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-2">
                  <SpendingBreakdown />
                  <IncomeReliability />
                </div>
              </div>

              <CardOverview />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
