export const LOCALE_VALUES = ["en", "ar"] as const;

export type AppLocale = (typeof LOCALE_VALUES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const isRtlLocale = (locale: AppLocale): boolean => locale === "ar";

export const getLocaleDirection = (locale: AppLocale): "ltr" | "rtl" => (isRtlLocale(locale) ? "rtl" : "ltr");
