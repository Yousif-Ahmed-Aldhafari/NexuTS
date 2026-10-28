"use client";

import { Badge } from "@/components/ui/badge";
import type { TranslationKey } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/use-i18n";

type BadgeTone = "red" | "amber" | "green" | "blue" | "slate";

const toneClassByType: Record<BadgeTone, string> = {
  red: "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
  amber: "border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  blue: "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const STATUS_META = {
  SUCCESS: { labelKey: "status.success", tone: "green" as const },
  FAIL: { labelKey: "status.fail", tone: "red" as const },
  OPEN: { labelKey: "status.open", tone: "blue" as const },
  CLOSED: { labelKey: "status.closed", tone: "green" as const },
  HIGH: { labelKey: "status.high", tone: "red" as const },
  MEDIUM: { labelKey: "status.medium", tone: "amber" as const },
  LOW: { labelKey: "status.low", tone: "blue" as const },
  NEEDS_FIX: { labelKey: "status.needsFix", tone: "red" as const },
  NEEDS_RETEST: { labelKey: "status.needsRetest", tone: "amber" as const },
  FIXED: { labelKey: "status.fixed", tone: "green" as const },
} as const satisfies Record<string, { labelKey: TranslationKey; tone: BadgeTone }>;

type MetaKey = keyof typeof STATUS_META;

const getBadgeToneClass = (value: string) => toneClassByType[STATUS_META[value as MetaKey]?.tone || "slate"];

export function QaStatusBadge({ value }: { value: string }) {
  const { t } = useI18n();
  const statusMeta = STATUS_META[value as MetaKey];
  const label = statusMeta ? t(statusMeta.labelKey) : value ? `${value[0]}${value.slice(1).toLowerCase()}` : "-";

  return (
    <Badge variant="outline" className={getBadgeToneClass(value)}>
      {label}
    </Badge>
  );
}
