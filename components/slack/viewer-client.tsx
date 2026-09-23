"use client";

import dynamic from "next/dynamic";

import { I18nProvider } from "@/lib/i18n/react";

/**
 * The app reads `localStorage` and IndexedDB while initialising its state, so
 * it is mounted on the client only — that keeps the prerendered HTML and the
 * first client render in sync. The same goes for the language, which depends
 * on the browser and on a choice stored in `localStorage`.
 */
const App = dynamic(() => import("@/components/app/app").then((m) => m.App), {
  ssr: false,
  loading: () => <div className="min-h-svh bg-bg" />,
});

export function ViewerClient() {
  return (
    <I18nProvider>
      <App />
    </I18nProvider>
  );
}
