import type { Locale } from "../config";
import { en } from "./en";
import { es } from "./es";
import { fr, type Messages } from "./fr";
import { ru } from "./ru";
import { zh } from "./zh";

export type { Messages };

/** Every catalogue must match `Messages` exactly: a missing key fails the build. */
export const MESSAGES: Record<Locale, Messages> = { fr, en, es, zh, ru };
