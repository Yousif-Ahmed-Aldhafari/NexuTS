"use client";

import { addDays } from "date-fns";
import { Home, Receipt, Sparkles, Zap } from "lucide-react";
import { siApple, siMastercard } from "simple-icons";

import { SimpleIcon } from "@/components/simple-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatCurrency } from "@/lib/utils";

export function CardOverview() {
  const { t, locale } = useI18n();
  const localeCode = locale === "ar" ? "ar-SA" : "en-US";
  const now = new Date();

  const formatDueDate = (days: number) =>
    new Intl.DateTimeFormat(localeCode, {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(addDays(now, days));

  const upcomingPayments = [
    {
      id: 1,
      icon: Home,
      title: t("finance.cardOverview.payment.rent"),
      amount: 1200,
      date: t("finance.cardOverview.dueOn", { date: formatDueDate(2) }),
    },
    {
      id: 2,
      icon: Zap,
      title: t("finance.cardOverview.payment.electricity"),
      amount: 75,
      date: t("finance.cardOverview.dueOn", { date: formatDueDate(2) }),
    },
    {
      id: 3,
      icon: Sparkles,
      title: t("finance.cardOverview.payment.chatgpt"),
      amount: 20,
      date: t("finance.cardOverview.dueOn", { date: formatDueDate(7) }),
    },
    {
      id: 4,
      icon: Receipt,
      title: t("finance.cardOverview.payment.creditCard"),
      amount: 420,
      date: t("finance.cardOverview.dueOn", { date: formatDueDate(9) }),
    },
  ];

  return (
    <Card className="shadow-xs">
      <CardHeader className="items-center">
        <CardTitle>{t("finance.cardOverview.myCard")}</CardTitle>
        <CardDescription>{t("finance.cardOverview.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid w-full place-items-center">
            <div className="relative flex aspect-8/5 w-full max-w-100 flex-col justify-between overflow-hidden rounded-container bg-primary p-6">
              <div className="flex items-start justify-between">
                <SimpleIcon icon={siApple} className="size-5 fill-primary-foreground sm:size-8" />
              </div>

              <div className="space-y-1">
                <p className="font-mono text-primary-foreground/90 text-sm tracking-[0.15em] sm:text-lg">
                  **** **** **** 2301
                </p>
              </div>

              <div className="flex items-end justify-between">
                <div className="space-y-2">
                  <p className="font-medium font-mono text-primary-foreground text-sm uppercase tracking-wide">
                    Arham Khan
                  </p>
                  <div className="flex gap-6">
                    <div>
                      <p className="text-[10px] text-primary-foreground/80 uppercase tracking-wider">
                        {t("finance.cardOverview.validThru")}
                      </p>
                      <p className="font-mono text-primary-foreground/80 text-xs">06/30</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-primary-foreground/80 uppercase tracking-wider">
                        {t("finance.cardOverview.cvv")}
                      </p>
                      <p className="font-mono text-primary-foreground/80 text-xs">***</p>
                    </div>
                  </div>
                </div>
                <SimpleIcon icon={siMastercard} className="size-7 fill-primary-foreground/80 sm:size-10" />
              </div>
            </div>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("finance.cardOverview.cardType")}</span>
              <span className="font-medium tabular-nums">{t("finance.cardOverview.virtual")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("finance.cardOverview.billingCycle")}</span>
              <span className="font-medium tabular-nums">{t("finance.cardOverview.billingCycleValue")}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("finance.cardOverview.cardLimit")}</span>
              <span className="font-medium tabular-nums">$62,000.00</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("finance.cardOverview.availableBalance")}</span>
              <span className="font-medium tabular-nums">$13,100.06</span>
            </div>
          </div>

          <div className="space-y-1">
            <Button className="w-full" size="sm">
              {t("finance.cardOverview.manageCard")}
            </Button>

            <Button className="w-full" variant="outline" size="sm">
              {t("finance.cardOverview.addCard")}
            </Button>
          </div>
          <Separator />

          <div className="space-y-4">
            <h6 className="text-muted-foreground text-sm uppercase">{t("finance.cardOverview.upcomingPayments")}</h6>

            <div className="space-y-4">
              {upcomingPayments.map((transaction) => (
                <div key={transaction.id} className="flex items-center gap-2">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
                    <transaction.icon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="flex w-full items-end justify-between">
                    <div>
                      <p className="font-medium text-sm">{transaction.title}</p>
                      <p className="text-muted-foreground text-xs">{transaction.date}</p>
                    </div>
                    <div>
                      <span className="font-medium text-destructive text-sm tabular-nums leading-none">
                        {formatCurrency(transaction.amount, {
                          noDecimals: true,
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button className="w-full" size="sm" variant="outline">
              {t("finance.cardOverview.viewAllPayments")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
