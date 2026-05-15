"use client";

import { AlertCircle, CheckCircle2, Clock, PlayCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n/use-i18n";

export function TestStatusHeader() {
  const { t } = useI18n();

  const stats = [
    {
      label: t("home.totalTests"),
      value: "1,284",
      icon: PlayCircle,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-500/10",
    },
    {
      label: t("home.successRate"),
      value: "98.2%",
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-50 dark:bg-emerald-500/10",
    },
    {
      label: t("home.avgDuration"),
      value: "42s",
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-500/10",
    },
    {
      label: t("home.failed"),
      value: "12",
      icon: AlertCircle,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-50 dark:bg-rose-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-4 rounded-[2rem] border border-slate-100 bg-white p-5 shadow-sm transition-all duration-300 dark:border-slate-800 dark:bg-[#161B22]"
        >
          <div className={`rounded-2xl p-3 ${stat.bgColor} ${stat.color} transition-colors`}>
            <stat.icon className="h-6 w-6" />
          </div>

          <div>
            <p className="whitespace-nowrap font-medium text-slate-500 text-sm dark:text-slate-400">{stat.label}</p>
            <p className="font-bold text-slate-900 text-xl dark:text-slate-50">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
