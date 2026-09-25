import type { Metadata } from "next";
import { Analytics } from "@/components/app/analytics";

import "./globals.css";

export const metadata: Metadata = {
  title: "Loquarium",
  description:
    "Import Slack conversations, read them as they happened, and export them as self-contained pages.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` is a placeholder: the page picks its language in the browser
    // (see `lib/i18n/react.tsx`) and updates this attribute.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* IBM Plex for the application, Lato for message text (Slack's
            typeface). Loaded at runtime so the build stays offline-friendly;
            the system stack takes over if they are unavailable. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: this lives in the root layout, so it is loaded once for every route. */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Lato:ital,wght@0,400;0,700;0,900;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">
        {children}
        {/* Page views only, without cookies, the URL hash stripped. */}
        <Analytics />
      </body>
    </html>
  );
}
