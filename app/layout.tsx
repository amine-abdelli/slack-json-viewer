import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Slack JSON Viewer",
  description:
    "Read a Slack conversation JSON export in Slack's own interface, then export it as a self-contained HTML page.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` is a placeholder: the page picks its language in the browser
    // (see `lib/i18n/react.tsx`) and updates this attribute.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Lato is Slack's UI typeface. Loaded at runtime so the build stays
            offline-friendly; the system stack takes over if it is unavailable. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- App Router: this lives in the root layout, so it is loaded once for every route. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
