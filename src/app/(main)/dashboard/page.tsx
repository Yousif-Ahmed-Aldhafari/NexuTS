"use client";

import { useI18n } from "@/lib/i18n/use-i18n";

export default function Page() {
  const { t } = useI18n();

  return <>{t("nav.soon")}</>;
}
