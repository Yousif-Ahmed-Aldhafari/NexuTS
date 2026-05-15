"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatCurrency } from "@/lib/utils";

export function IncomeReliability() {
  const { t } = useI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("finance.incomeReliability.title")}</CardTitle>
        <CardDescription>{t("finance.incomeReliability.description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Separator />
        <div className="space-y-0.5">
          <p className="font-medium text-xl">{t("finance.incomeReliability.highReliability")}</p>
          <p className="text-muted-foreground text-xs">{t("finance.incomeReliability.basedOnSixMonths")}</p>
        </div>
        <Separator />
        <div className="flex justify-between">
          <div className="space-y-0.5">
            <p className="font-medium text-lg">{t("finance.incomeReliability.fixedIncome")}</p>
            <p className="text-muted-foreground text-xs">{t("finance.incomeReliability.recurringPredictable")}</p>
          </div>
          <p className="font-medium text-lg">{formatCurrency(90000, { noDecimals: true })}</p>
        </div>
        <Separator />
        <div className="flex justify-between">
          <div className="space-y-0.5">
            <p className="font-medium text-lg">{t("finance.incomeReliability.variableIncome")}</p>
            <p className="text-muted-foreground text-xs">{t("finance.incomeReliability.fluctuatingSources")}</p>
          </div>
          <p className="font-medium text-lg">{formatCurrency(46500, { noDecimals: true })}</p>
        </div>
        <Separator />
        <p className="text-muted-foreground text-xs">
          {t("finance.incomeReliability.consistencyTrend")}:{" "}
          <span className="font-medium text-primary">{t("finance.incomeReliability.stable")}</span>
        </p>
      </CardContent>
    </Card>
  );
}
