"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/use-i18n";
import { formatCurrency } from "@/lib/utils";

const chartData = [
  { month: "Jan", income: 5900, expenses: -4200 },
  { month: "Feb", income: 3800, expenses: -6100 },
  { month: "Mar", income: 5200, expenses: -5600 },
  { month: "Apr", income: 7100, expenses: -3200 },
  { month: "May", income: 4500, expenses: -4400 },
  { month: "Jun", income: 6100, expenses: -3600 },
  { month: "Jul", income: 3300, expenses: -5200 },
  { month: "Aug", income: 4300, expenses: -4000 },
  { month: "Sep", income: 7200, expenses: -5800 },
  { month: "Oct", income: 5600, expenses: -4600 },
  { month: "Nov", income: 3600, expenses: -6400 },
  { month: "Dec", income: 4700, expenses: -3400 },
];

export function CashFlowOverview() {
  const { t } = useI18n();
  const chartConfig = {
    income: {
      label: t("finance.cashFlow.income"),
      color: "var(--chart-1)",
    },
    expenses: {
      label: t("finance.cashFlow.expenses"),
      color: "var(--chart-2)",
    },
  } as ChartConfig;
  const totalIncome = chartData.reduce((acc, item) => acc + item.income, 0);
  const totalExpenses = chartData.reduce((acc, item) => acc + Math.abs(item.expenses), 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("finance.cashFlow.title")}</CardTitle>
        <CardDescription>{t("finance.cashFlow.description")}</CardDescription>
        <CardAction>
          <Select defaultValue="this-year">
            <SelectTrigger className="w-37">
              <SelectValue placeholder={t("finance.cashFlow.selectPeriod")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">{t("finance.cashFlow.thisMonth")}</SelectItem>
              <SelectItem value="last-6-months">{t("finance.cashFlow.lastSixMonths")}</SelectItem>
              <SelectItem value="ytd">{t("finance.cashFlow.ytd")}</SelectItem>
              <SelectItem value="this-year">{t("finance.cashFlow.thisYear")}</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Separator />
        <div className="flex items-start justify-between gap-2 py-5 md:items-stretch md:gap-0">
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-1">
              <ArrowDownLeft className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">{t("finance.cashFlow.income")}</p>
              <p className="font-medium tabular-nums">{formatCurrency(totalIncome, { noDecimals: true })}</p>
            </div>
          </div>
          <Separator orientation="vertical" className="h-auto! self-stretch" />
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-2">
              <ArrowUpRight className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">{t("finance.cashFlow.expenses")}</p>
              <p className="font-medium tabular-nums">{formatCurrency(totalExpenses, { noDecimals: true })}</p>
            </div>
          </div>
        </div>
        <Separator />
        <ChartContainer className="max-h-72 w-full" config={chartConfig}>
          <BarChart
            stackOffset="sign"
            margin={{ left: -25, right: 0, top: 25, bottom: 0 }}
            accessibilityLayer
            data={chartData}
          >
            <CartesianGrid vertical={false} />
            <XAxis dataKey="month" tickLine={false} tickMargin={10} axisLine={false} />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                const abs = Math.abs(value);
                const formatted = abs >= 1000 ? `${abs / 1000}k` : `${abs}`;
                return value < 0 ? `-${formatted}` : formatted;
              }}
              ticks={[-8000, -4000, 0, 4000, 8000]}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Bar dataKey="income" stackId="a" fill={chartConfig.income.color} radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" stackId="a" fill={chartConfig.expenses.color} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
