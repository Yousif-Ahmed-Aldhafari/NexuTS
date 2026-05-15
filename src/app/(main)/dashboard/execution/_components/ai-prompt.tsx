"use client";

import { useState } from "react";

import { Code2, Globe, Play, Radio, Sparkles } from "lucide-react";

import { useI18n } from "@/lib/i18n/use-i18n";

export function AICommandPrompt() {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [isRecording, setIsRecording] = useState(false);

  return (
    <div className="space-y-4">
      <div className="group relative">
        <div className="-translate-y-1/2 absolute start-4 top-1/2 text-slate-400 transition-colors group-focus-within:text-blue-500">
          <Globe className="h-4 w-4" />
        </div>
        <input
          type="url"
          placeholder={t("execution.urlPlaceholder")}
          className="w-full rounded-xl border border-slate-100 bg-slate-50 py-3 ps-11 pe-4 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>

      <div className="relative">
        <textarea
          placeholder={t("execution.scenarioPlaceholder")}
          className="h-32 w-full resize-none rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm outline-none transition-all focus:ring-2 focus:ring-blue-500/20 dark:border-slate-800 dark:bg-slate-900"
        />
        <div className="absolute end-3 bottom-3 text-blue-500 opacity-50">
          <Sparkles className="h-4 w-4" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setIsRecording((previous) => !previous)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl border py-3 font-medium transition-all ${
              isRecording
                ? "animate-pulse border-rose-200 bg-rose-50 text-rose-600"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            <Radio className={`h-4 w-4 ${isRecording ? "fill-rose-600" : ""}`} />
            {isRecording ? t("execution.stopRecording") : t("execution.recordSession")}
          </button>

          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 font-medium text-white transition-all hover:opacity-90 dark:bg-white dark:text-slate-900"
          >
            <Code2 className="h-4 w-4" /> {t("execution.generateScript")}
          </button>
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-bold text-white shadow-blue-500/20 shadow-lg transition-all hover:bg-blue-700"
        >
          <Play className="h-4 w-4 fill-white" /> {t("execution.runAutomation")}
        </button>
      </div>
    </div>
  );
}
