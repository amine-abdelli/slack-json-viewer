import { formatPlural, interpolate, type Params, type Plural } from "@/lib/i18n/format";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import type { ApiText } from "./api-core";

/**
 * Words a progress line or an error of the API client in a given language,
 * from the `server` catalogue — the same one the bridge answers in.
 */
export function wordApiText(
  locale: Locale,
  server: Messages["server"],
  text: ApiText,
): string {
  if (text.key === "slackRefused") {
    // A known Slack error gets a sentence; others name the method and code.
    const known = server.slackErrors as Record<string, string>;
    if (Object.prototype.hasOwnProperty.call(known, text.params.code)) {
      return known[text.params.code];
    }
  }
  const template = server[text.key] as string | Plural;
  const params = ("params" in text ? text.params : {}) as Params;
  if ("count" in text) return formatPlural(locale, template as Plural, text.count, params);
  return interpolate(template as string, params);
}
