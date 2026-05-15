"use client";

import { HandCoins } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/use-i18n";

export function SavingsRate() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center gap-2">
            <span className="grid size-7 place-content-center rounded-sm bg-muted">
              <HandCoins className="size-5" />
            </span>
            {t("finance.savingsRate.title")}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-0.5">
          <div className="flex items-center justify-between">
            <p className="font-medium text-xl tabular-nums">32%</p>
            <span className="text-xs">{t("finance.common.mom", { value: "+3.5%" })}</span>
          </div>
          <p className="text-muted-foreground text-xs">{t("finance.savingsRate.thisMonthAfterExpenses")}</p>
        </div>

        <Separator />

        <p className="text-muted-foreground text-xs">{t("finance.savingsRate.aboveAverage")}</p>
      </CardContent>
    </Card>
  );
}
