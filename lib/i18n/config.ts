/**
 * The languages the app speaks, and how one is picked.
 *
 * Kept free of React and Node imports: the browser, the route handlers and the
 * exported page's builder all read it.
 */

export const LOCALES = ["fr", "en", "es", "zh", "ru"] as const;
export type Locale = (typeof LOCALES)[number];

/** Used when none of the browser's languages is supported. */
export const DEFAULT_LOCALE: Locale = "en";

/** Each language in its own words — that is how people look for theirs. */
export const LOCALE_NAMES: Record<Locale, string> = {
  fr: "Français",
  en: "English",
  es: "Español",
  zh: "中文",
  ru: "Русский",
};

/** Full tags for `Intl` (dates, numbers, plurals) and `<html lang>`. */
export const INTL_TAGS: Record<Locale, string> = {
  fr: "fr-FR",
  en: "en-US",
  es: "es-ES",
  zh: "zh-CN",
  ru: "ru-RU",
};

/** Where the chosen language is remembered. Absent means "follow the browser". */
export const LOCALE_STORAGE_KEY = "slack-viewer:locale";

/** The browser tells the bridge which language to answer in with this header. */
export const LOCALE_HEADER = "x-slack-viewer-locale";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The first supported language in a preference list such as
 * `navigator.languages` or an `Accept-Language` header: `fr-CA` → `fr`,
 * `zh-TW` → `zh`.
 */
export function matchLocale(tags: readonly string[]): Locale | null {
  for (const tag of tags) {
    const primary = tag.trim().toLowerCase().split(/[-_;]/)[0];
    if (isLocale(primary)) return primary;
  }
  return null;
}

/** The browser's preferred supported language, or the default. */
export function detectBrowserLocale(): Locale {
  if (typeof navigator === "undefined") return DEFAULT_LOCALE;
  const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
  return matchLocale(tags.filter(Boolean)) ?? DEFAULT_LOCALE;
}
