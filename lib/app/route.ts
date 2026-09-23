"use client";

import * as React from "react";

/**
 * Screens live in the URL hash, so the browser's back and forward buttons move
 * between them, and a reload stays where it was.
 *
 *   #/library
 *   #/import
 *   #/archive/<archive id>/<conversation id>[/people]
 *   #/exports
 *   #/settings
 */
export type Route =
  | { name: "library" }
  | { name: "import" }
  | { name: "archive"; archiveId: string; conversationId?: string; tab: "conversations" | "people" }
  | { name: "exports" }
  | { name: "settings" };

/** Holds the conversation's place in `#/archive/<id>/_/people`. */
const NO_CONVERSATION = "_";

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(safeDecode);
  switch (parts[0]) {
    case "import":
      return { name: "import" };
    case "exports":
      return { name: "exports" };
    case "settings":
      return { name: "settings" };
    case "archive":
      if (parts[1]) {
        return {
          name: "archive",
          archiveId: parts[1],
          conversationId: parts[2] && parts[2] !== NO_CONVERSATION ? parts[2] : undefined,
          tab: parts[3] === "people" ? "people" : "conversations",
        };
      }
      return { name: "library" };
    default:
      return { name: "library" };
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case "archive": {
      const segments = ["archive", route.archiveId];
      if (route.conversationId) segments.push(route.conversationId);
      if (route.tab === "people") {
        if (!route.conversationId) segments.push(NO_CONVERSATION);
        segments.push("people");
      }
      return `#/${segments.map(encodeURIComponent).join("/")}`;
    }
    default:
      return `#/${route.name}`;
  }
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function currentRoute(): Route {
  return parseHash(typeof window === "undefined" ? "" : window.location.hash);
}

/** The current screen, and a way to go elsewhere (`replace` skips history). */
export function useRoute(): [Route, (route: Route, options?: { replace?: boolean }) => void] {
  const [route, setRoute] = React.useState<Route>(currentRoute);

  React.useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = React.useCallback((next: Route, options?: { replace?: boolean }) => {
    const hash = routeHash(next);
    if (hash === window.location.hash) return;
    if (options?.replace) {
      window.history.replaceState(window.history.state, "", hash);
      setRoute(parseHash(hash));
    } else {
      window.location.hash = hash;
    }
  }, []);

  return [route, navigate];
}
