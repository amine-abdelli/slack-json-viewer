"use client";

import dynamic from "next/dynamic";

/**
 * The viewer reads `localStorage` while initialising its state, so it is
 * mounted on the client only — that keeps the prerendered HTML and the first
 * client render in sync.
 */
const Viewer = dynamic(() => import("./viewer").then((m) => m.Viewer), {
  ssr: false,
  loading: () => <div className="min-h-svh bg-background" />,
});

export function ViewerClient() {
  return <Viewer />;
}
