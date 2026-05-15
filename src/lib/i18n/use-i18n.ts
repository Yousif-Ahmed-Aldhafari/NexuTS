"use client";

import { useMemo } from "react";

import { translate, type TranslationKey, type AppLocale } from "./index";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { getLocaleDirection, isRtlLocale } from "./types";

const applyLocaleToDocument = (locale: AppLocale) => {
  const root = document.documentElement;
  root.setAttribute("lang", locale);
  root.setAttribute("dir", getLocaleDirection(locale));
  root.setAttribute("data-language", locale);
};

export function useI18n() {
  const language = usePreferencesStore((state) => state.language);
  const setLanguage = usePreferencesStore((state) => state.setLanguage);

  const helpers = useMemo(
    () => ({
      t: (key: TranslationKey, params?: Record<string, string | number | null | undefined>) =>
        translate(language, key, params),
      locale: language,
      isRtl: isRtlLocale(language),
      setLocale: async (nextLocale: AppLocale) => {
        setLanguage(nextLocale);
        applyLocaleToDocument(nextLocale);

        // Keep client preference in sync immediately.
        void persistPreference("language", nextLocale);

        // Best effort sync for authenticated users; guests can rely on cookies only.
        try {
          const response = await fetch("/api/auth/profile", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update-language",
              language: nextLocale,
            }),
          });

          if (response.status === 401 || response.status === 403) {
            return;
          }
        } catch (_error) {
          // Ignore sync errors so UI preference changes stay responsive.
        }
      },
    }),
    [language, setLanguage],
  );

  return helpers;
}
