"use client";

import { ArrowUpRight, CheckCircle2, Clock, Filter, Search, XCircle } from "lucide-react";

import { useI18n } from "@/lib/i18n/use-i18n";

const historyData = [
  { id: "#8821", name: "User Auth Flow", date: "Mar 8, 2026", status: "PASSED", duration: "1.2m", type: "Regression" },
  { id: "#8820", name: "Checkout API", date: "Mar 8, 2026", status: "FAILED", duration: "45s", type: "Smoke" },
  { id: "#8819", name: "Sidebar Hydration", date: "Mar 7, 2026", status: "PASSED", duration: "2.1m", type: "UAT" },
];

export default function HistoryPage() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen p-8">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-bold text-2xl text-slate-900 dark:text-white">{t("history.title")}</h1>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="-translate-y-1/2 absolute start-3 top-1/2 h-4 w-4 text-slate-400" />
            <input
              className="w-64 rounded-xl border border-slate-200 bg-white py-2 ps-10 pe-4 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
              placeholder={t("history.searchPlaceholder")}
            />
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white p-2 transition-all hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
          >
            <Filter className="h-4 w-4 text-slate-600 dark:text-slate-400" />
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-container border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-[#161B22]">
        <table className="w-full border-collapse text-start">
          <thead className="border-slate-100 border-b bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="p-6 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                {t("history.header.testId")}
              </th>
              <th className="p-6 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                {t("history.header.scenario")}
              </th>
              <th className="p-6 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                {t("history.header.status")}
              </th>
              <th className="p-6 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                {t("history.header.duration")}
              </th>
              <th className="p-6 font-semibold text-slate-500 text-xs uppercase tracking-wider">
                {t("history.header.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {historyData.map((test) => {
              const isPassed = test.status === "PASSED";
              return (
                <tr key={test.id} className="group transition-colors hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="p-6 font-mono text-slate-400 text-sm">{test.id}</td>
                  <td className="p-6">
                    <div className="font-medium text-slate-700 dark:text-slate-200">{test.name}</div>
                    <div className="text-slate-400 text-xs">
                      {test.date} • {test.type}
                    </div>
                  </td>
                  <td className="p-6">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-xs ${
                        isPassed
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
                          : "bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400"
                      }`}
                    >
                      {isPassed ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                      {isPassed ? t("history.status.passed") : t("history.status.failed")}
                    </span>
                  </td>
                  <td className="flex items-center gap-1 p-6 text-slate-500 text-sm dark:text-slate-400">
                    <Clock className="h-3 w-3" /> {test.duration}
                  </td>
                  <td className="p-6">
                    <button
                      type="button"
                      className="p-2 text-slate-400 transition-colors duration-300 hover:text-blue-500 group-hover:translate-x-1"
                    >
                      <ArrowUpRight className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
