"use client";

import { Analytics as VercelAnalytics } from "@vercel/analytics/next";

/**
 * Vercel Web Analytics: page views, without cookies.
 *
 * The app routes in the URL hash (`#/archive/slack:acme/C0123…`), which would
 * name a workspace and a conversation: it is cut off before anything is sent.
 */
export function Analytics() {
  return <VercelAnalytics beforeSend={(event) => ({ ...event, url: event.url.split("#")[0] })} />;
}
