/**
 * The language the bridge answers in, for the duration of one request.
 *
 * The browser sends the language it displays in `x-slack-viewer-locale` —
 * not `Accept-Language`, which only knows the browser's defaults, not a
 * language picked by hand. Route handlers run their work inside `withLocale`,
 * and anything below — however deep — reads the catalogue with `sm()`, so
 * the language never has to be threaded through every signature.
 */

import { AsyncLocalStorage } from "node:async_hooks";

import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, matchLocale, type Locale } from "./config";
import { formatPlural, interpolate, type Params, type Plural } from "./format";
import { MESSAGES, type Messages } from "./messages";

const storage = new AsyncLocalStorage<Locale>();

/** The locale a request asks for: our header, else `Accept-Language`, else the default. */
export function localeFromRequest(request: Request): Locale {
  const explicit = request.headers.get(LOCALE_HEADER);
  if (isLocale(explicit)) return explicit;
  const accept = request.headers.get("accept-language");
  return (accept && matchLocale(accept.split(","))) || DEFAULT_LOCALE;
}

export function withLocale<T>(locale: Locale, fn: () => T): T {
  return storage.run(locale, fn);
}

export function currentLocale(): Locale {
  return storage.getStore() ?? DEFAULT_LOCALE;
}

/** The server messages of the current request's language. */
export function sm(): Messages["server"] {
  return MESSAGES[currentLocale()].server;
}

/** Fills a server message's `{placeholders}`. */
export function st(template: string, params?: Params): string {
  return interpolate(template, params);
}

/** Picks a server message's plural form. */
export function sp(forms: Plural, n: number, params?: Params): string {
  return formatPlural(currentLocale(), forms, n, params);
}
