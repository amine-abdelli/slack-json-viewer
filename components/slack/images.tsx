"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Where messages find their images: a Slack file ID → a URL the page can show
 * (an object URL in the app, a `data:` URL in the exported page). Without a
 * provider there are none, and image files show as a card with a link.
 */
const ImagesContext = React.createContext<ReadonlyMap<string, string> | null>(null);

export function ImagesProvider({
  images,
  children,
}: {
  images: ReadonlyMap<string, string> | null;
  children: React.ReactNode;
}) {
  return <ImagesContext.Provider value={images}>{children}</ImagesContext.Provider>;
}

export function useImageUrl(fileId: string | undefined): string | undefined {
  const images = React.useContext(ImagesContext);
  return fileId ? images?.get(fileId) : undefined;
}

/**
 * Object URLs for a set of blobs, revoked when the set changes or the
 * component goes away.
 */
export function useObjectUrls(blobs: ReadonlyMap<string, Blob> | null): ReadonlyMap<string, string> | null {
  const urls = React.useMemo(() => {
    if (!blobs || blobs.size === 0) return null;
    const out = new Map<string, string>();
    for (const [id, blob] of blobs) out.set(id, URL.createObjectURL(blob));
    return out;
  }, [blobs]);
  React.useEffect(
    () => () => {
      if (urls) for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );
  return urls;
}

/** The image full size over the page; a click or Escape closes it. */
export function ImageZoom({
  src,
  alt,
  closeLabel,
  onClose,
}: {
  src: string;
  alt: string;
  closeLabel: string;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[100] grid cursor-zoom-out place-items-center bg-black/85 p-6"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="max-h-full max-w-full rounded-[6px] object-contain shadow-2xl" />
      <span className="sr-only">{closeLabel}</span>
    </div>,
    document.body,
  );
}
