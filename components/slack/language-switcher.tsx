"use client";

import * as React from "react";
import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { detectBrowserLocale, isLocale, LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/react";
import { cn } from "@/lib/utils";

const AUTO = "auto";

/**
 * Picks the interface language. "Browser language" follows the browser again
 * — the default until someone chooses by hand.
 *
 * `compact` is the icon-only form for the conversation header; otherwise the
 * trigger also shows the active language's name.
 */
export function LanguageSwitcher({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, m, setLocale, followsBrowser } = useI18n();
  const browserLocale = React.useMemo(() => detectBrowserLocale(), []);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon-sm" : "sm"}
          className={cn(!compact && "gap-1.5 text-muted-foreground", className)}
          title={m.language.label}
          aria-label={`${m.language.label} — ${LOCALE_NAMES[locale]}`}
        >
          <Languages />
          {compact ? null : <span>{LOCALE_NAMES[locale]}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {m.language.label}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={followsBrowser ? AUTO : locale}
          onValueChange={(value) => setLocale(isLocale(value) ? value : null)}
        >
          <DropdownMenuRadioItem value={AUTO}>
            <span className="flex-1">{m.language.auto}</span>
            <span className="text-xs text-muted-foreground">{LOCALE_NAMES[browserLocale]}</span>
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {LOCALES.map((code) => (
            <DropdownMenuRadioItem key={code} value={code} lang={code}>
              {LOCALE_NAMES[code]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
