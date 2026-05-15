"use client";

import { useI18n } from "@/lib/i18n/use-i18n";

export function QaLoadingFallback() {
  const { t } = useI18n();

  return <div className="flex h-full w-full min-w-0 max-w-full items-center justify-center">{t("common.loading")}</div>;
}
