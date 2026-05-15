import { arMessages } from "./messages/ar";
import { enMessages, type TranslationKey } from "./messages/en";
import type { AppLocale } from "./types";

const dictionaries = {
  en: enMessages,
  ar: arMessages,
} as const;

type TranslationParams = Record<string, string | number | null | undefined>;

const interpolate = (template: string, params?: TranslationParams): string => {
  if (!params) return template;

  return Object.entries(params).reduce((value, [paramKey, paramValue]) => {
    const normalized = paramValue === null || paramValue === undefined ? "" : String(paramValue);
    return value.replaceAll(`{${paramKey}}`, normalized);
  }, template);
};

export const translate = (locale: AppLocale, key: TranslationKey, params?: TranslationParams): string => {
  const value = dictionaries[locale]?.[key] ?? dictionaries.en[key] ?? key;
  return interpolate(value, params);
};

export type { TranslationKey };
export type { AppLocale } from "./types";
export { DEFAULT_LOCALE, LOCALE_VALUES, getLocaleDirection, isRtlLocale } from "./types";
