"use client";

import { Languages } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/use-i18n";
import type { AppLocale } from "@/lib/i18n";

type LanguageSwitcherProps = {
  className?: string;
  triggerClassName?: string;
  showLabel?: boolean;
};

export function LanguageSwitcher({ className, triggerClassName, showLabel = false }: LanguageSwitcherProps) {
  const { locale, t, setLocale } = useI18n();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {showLabel ? <span className="text-muted-foreground text-sm">{t("language.label")}</span> : null}
      <Select
        value={locale}
        onValueChange={(value) => {
          void setLocale(value as AppLocale);
        }}
      >
        <SelectTrigger className={cn("h-9 min-w-[128px]", triggerClassName)}>
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="en">{t("language.english")}</SelectItem>
          <SelectItem value="ar">{t("language.arabic")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
