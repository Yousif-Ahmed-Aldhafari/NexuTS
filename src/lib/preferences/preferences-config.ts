/**
 * How each preference should be saved.
 *
 * "client-cookie"  -> write cookie on the browser only.
 * "server-cookie"  -> write cookie through a Server Action.
 * "localStorage"   -> save only on the client (non-layout preferences).
 * "none"           -> no persistence, resets on reload.
 *
 * Layout-critical preferences (sidebar_variant / sidebar_collapsible)
 * must stay consistent during SSR, so they cannot use localStorage.
 */

import type { AppLocale } from "@/lib/i18n";
import type { FontKey } from "@/lib/fonts/registry";

import type { ContentLayout, NavbarStyle, SidebarCollapsible, SidebarVariant } from "./layout";
import type { ThemeMode, ThemePreset } from "./theme";

export type PreferencePersistence = "none" | "client-cookie" | "server-cookie" | "localStorage";

/**
 * All available preference keys and their value types.
 */
export type PreferenceValueMap = {
  language: AppLocale;
  theme_mode: ThemeMode;
  theme_preset: ThemePreset;
  font: FontKey;
  content_layout: ContentLayout;
  navbar_style: NavbarStyle;
  sidebar_variant: SidebarVariant;
  sidebar_collapsible: SidebarCollapsible;
};

export type PreferenceKey = keyof PreferenceValueMap;

/**
 * Layout-critical keys affect SSR UI, so they must be accessible on the server.
 */
export const LAYOUT_CRITICAL_KEYS = ["sidebar_variant", "sidebar_collapsible"] as const;
export type LayoutCriticalKey = (typeof LAYOUT_CRITICAL_KEYS)[number];

/**
 * Everything else is non-critical and can be read from the client.
 */
export type NonCriticalKey = Exclude<PreferenceKey, LayoutCriticalKey>;

/**
 * Layout-critical keys cannot use localStorage because SSR needs the values.
 */
type LayoutCriticalPersistence = Exclude<PreferencePersistence, "localStorage">;

type PreferencePersistenceConfig = {
  [K in LayoutCriticalKey]: LayoutCriticalPersistence;
} & {
  [K in NonCriticalKey]: PreferencePersistence;
};

/**
 * Default preference values on first load.
 */
export const PREFERENCE_DEFAULTS: PreferenceValueMap = {
  language: "en",
  theme_mode: "light",
  theme_preset: "default",
  font: "readexPro",
  content_layout: "centered",
  navbar_style: "sticky",
  sidebar_variant: "inset",
  sidebar_collapsible: "icon",
};

/**
 * How each preference is persisted.
 */
export const PREFERENCE_PERSISTENCE: PreferencePersistenceConfig = {
  language: "client-cookie",
  theme_mode: "client-cookie",
  theme_preset: "client-cookie",
  font: "client-cookie",
  content_layout: "client-cookie",
  navbar_style: "client-cookie",
  sidebar_variant: "client-cookie",
  sidebar_collapsible: "client-cookie",
};
