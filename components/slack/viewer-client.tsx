"use client";

import dynamic from "next/dynamic";

import { I18nProvider } from "@/lib/i18n/react";

/**
 * The viewer reads `localStorage` while initialising its state, so it is
 * mounted on the client only — that keeps the prerendered HTML and the first
 * client render in sync. The same goes for the language, which depends on
 * the browser and on a choice stored in `localStorage`.
 */
const Viewer = dynamic(() => import("./viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => <div className="min-h-svh bg-background" />,
});

export function ViewerClient() {
  return (
    <I18nProvider>
      <Viewer />
    </I18nProvider>
  );
}
