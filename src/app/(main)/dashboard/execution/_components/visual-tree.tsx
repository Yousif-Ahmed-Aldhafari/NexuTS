"use client";

import { Check, Terminal } from "lucide-react";

import { useI18n } from "@/lib/i18n/use-i18n";

export function VisualExecutionTree() {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-slate-900 p-4 font-mono text-blue-400 text-sm dark:bg-[#010409]">
        <Terminal className="h-4 w-4 text-slate-400" />
        <span>{t("execution.command")}</span>
      </div>

      <div className="relative ms-4 space-y-8 border-slate-100 border-s-2 ps-8 dark:border-slate-800">
        <div className="relative">
          <div className="-start-[41px] absolute top-0 rounded-full border-4 border-white bg-emerald-500 p-1.5 shadow-sm dark:border-[#161B22]">
            <Check className="h-3 w-3 text-white" />
          </div>
          <span className="font-medium text-slate-700 dark:text-slate-200">{t("execution.stepNavigateLogin")}</span>
        </div>
      </div>
    </div>
  );
}
