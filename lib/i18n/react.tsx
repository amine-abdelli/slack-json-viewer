"use client";

import * as React from "react";

import {
  DEFAULT_LOCALE,
  detectBrowserLocale,
  INTL_TAGS,
  isLocale,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "./config";
import { formatPlural, formatters, interpolate, type Formatters, type Params, type Plural } from "./format";
import { MESSAGES, type Messages } from "./messages";

export interface I18n {
  locale: Locale;
  /** The catalogue of the active language: `m.viewer.export`. */
  m: Messages;
  /** Fills `{placeholders}`: `t(m.thread.lastReply, { date })`. */
  t: (template: string, params?: Params) => string;
  /** Picks the plural form for `n`: `p(m.thread.replies, 3)`. */
  p: (forms: Plural, n: number, params?: Params) => string;
  /** Dates, numbers and sizes in the active language. */
  fmt: Formatters;
  /** `null` goes back to following the browser. */
  setLocale: (locale: Locale | null) => void;
  /** True when no language was chosen by hand. */
  followsBrowser: boolean;
}

export function createI18n(
  locale: Locale,
  setLocale: (locale: Locale | null) => void = () => {},
  followsBrowser = true,
): I18n {
  return {
    locale,
    m: MESSAGES[locale],
    t: interpolate,
    p: (forms, n, params) => formatPlural(locale, forms, n, params),
    fmt: formatters(locale),
    setLocale,
    followsBrowser,
  };
}

const I18nContext = React.createContext<I18n>(createI18n(DEFAULT_LOCALE));

export function useI18n(): I18n {
  return React.useContext(I18nContext);
}

function readStoredLocale(): Locale | null {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Picks the language: the one chosen by hand if any, else the browser's.
 * Mounted client-side only (see `viewer-client.tsx`), so reading the browser
 * during the first render is safe.
 */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [chosen, setChosen] = React.useState<Locale | null>(readStoredLocale);
  const [browser, setBrowser] = React.useState<Locale>(detectBrowserLocale);
  const locale = chosen ?? browser;

  // Follow the browser if its languages change while the page is open.
  React.useEffect(() => {
    const onChange = () => setBrowser(detectBrowserLocale());
    window.addEventListener("languagechange", onChange);
    return () => window.removeEventListener("languagechange", onChange);
  }, []);

  React.useEffect(() => {
    document.documentElement.lang = INTL_TAGS[locale];
  }, [locale]);

  const setLocale = React.useCallback((next: Locale | null) => {
    setChosen(next);
    try {
      if (next) localStorage.setItem(LOCALE_STORAGE_KEY, next);
      else localStorage.removeItem(LOCALE_STORAGE_KEY);
    } catch {
      /* the choice then lasts for this visit only */
    }
  }, []);

  const value = React.useMemo(
    () => createI18n(locale, setLocale, chosen === null),
    [locale, setLocale, chosen],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Wraps a subtree in a fixed language — used to render the exported page. */
export function StaticI18nProvider({ value, children }: { value: I18n; children: React.ReactNode }) {
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
