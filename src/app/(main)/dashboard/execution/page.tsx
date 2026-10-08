"use client";

import { useI18n } from "@/lib/i18n/use-i18n";

import { AICommandPrompt } from "./_components/ai-prompt";
import { VisualExecutionTree } from "./_components/visual-tree";

export default function ExecutionPage() {
  const { t } = useI18n();

  return (
    <div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-5">
          <section className="h-full rounded-container border border-slate-100 bg-white p-6 shadow-sm transition-all duration-500 dark:border-slate-800 dark:bg-[#161B22]">
            <h2 className="mb-4 font-semibold text-slate-800 text-xl dark:text-slate-100">
              {t("execution.promptMode")}
            </h2>
            <AICommandPrompt />
          </section>
        </div>

        <div className="col-span-12 lg:col-span-7">
          <section className="h-full rounded-container border border-slate-100 bg-white p-6 shadow-sm transition-all duration-500 dark:border-slate-800 dark:bg-[#161B22]">
            <h2 className="mb-4 font-semibold text-slate-800 text-xl dark:text-slate-100">
              {t("execution.visualTracking")}
            </h2>
            <VisualExecutionTree />
          </section>
        </div>
      </div>
    </div>
  );
}
