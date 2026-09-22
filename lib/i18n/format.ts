/**
 * Message formatting: placeholders, plurals, dates, numbers and sizes.
 *
 * Messages are plain data — strings with `{name}` placeholders, and plural
 * objects keyed by CLDR category — so they can also be serialised into the
 * exported HTML page, whose script formats them the same way.
 */

import { INTL_TAGS, type Locale } from "./config";

/** A message that varies with a count. `other` is always required. */
export type Plural = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

export type Params = Record<string, string | number>;

/** Types a plural entry in a message file. */
export function plural(forms: Plural): Plural {
  return forms;
}

/** Replaces `{name}` placeholders. Unknown placeholders are left as is. */
export function interpolate(template: string, params: Params = {}): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  );
}

const pluralRules = new Map<Locale, Intl.PluralRules>();
const numberFormats = new Map<Locale, Intl.NumberFormat>();

function rulesFor(locale: Locale): Intl.PluralRules {
  let rules = pluralRules.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(INTL_TAGS[locale]);
    pluralRules.set(locale, rules);
  }
  return rules;
}

export function formatNumber(locale: Locale, n: number): string {
  let format = numberFormats.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(INTL_TAGS[locale]);
    numberFormats.set(locale, format);
  }
  return format.format(n);
}

/**
 * Picks the plural form for `n` and fills it in. `{n}` is the count, formatted
 * for the locale; other placeholders come from `params`.
 */
export function formatPlural(locale: Locale, forms: Plural, n: number, params: Params = {}): string {
  const category = rulesFor(locale).select(n);
  const template = forms[category] ?? forms.other;
  return interpolate(template, { ...params, n: formatNumber(locale, n) });
}

function capitalise(value: string): string {
  return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export interface Formatters {
  number: (n: number) => string;
  /** 14:05 */
  time: (date: Date) => string;
  /** Today / Yesterday / Tuesday 10 February 2026 — the day dividers. */
  day: (date: Date) => string;
  /** 10 Feb 2026, 14:05 */
  dayShort: (date: Date) => string;
  /** Full date and time, for tooltips and the export's date range. */
  full: (date: Date) => string;
  /** 12 kB */
  size: (bytes?: number) => string;
}

const formattersCache = new Map<Locale, Formatters>();

export function formatters(locale: Locale): Formatters {
  const cached = formattersCache.get(locale);
  if (cached) return cached;

  const tag = INTL_TAGS[locale];
  const timeFmt = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit" });
  const dayFmt = new Intl.DateTimeFormat(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const shortFmt = new Intl.DateTimeFormat(tag, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const fullFmt = new Intl.DateTimeFormat(tag, { dateStyle: "full", timeStyle: "medium" });
  // "today" / "yesterday" come from the platform, in every language.
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const unit = (u: string, maximumFractionDigits = 0) =>
    new Intl.NumberFormat(tag, { style: "unit", unit: u, unitDisplay: "short", maximumFractionDigits });
  const bytes = unit("byte");
  const kilobytes = unit("kilobyte");
  const megabytes = unit("megabyte", 1);

  const result: Formatters = {
    number: (n) => formatNumber(locale, n),
    time: (date) => timeFmt.format(date),
    day: (date) => {
      const today = new Date();
      if (sameDay(date, today)) return capitalise(relative.format(0, "day"));
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      if (sameDay(date, yesterday)) return capitalise(relative.format(-1, "day"));
      return capitalise(dayFmt.format(date));
    },
    dayShort: (date) => shortFmt.format(date),
    full: (date) => fullFmt.format(date),
    size: (size) => {
      if (!size) return "";
      if (size < 1024) return bytes.format(size);
      if (size < 1024 * 1024) return kilobytes.format(Math.round(size / 1024));
      return megabytes.format(size / (1024 * 1024));
    },
  };
  formattersCache.set(locale, result);
  return result;
}
