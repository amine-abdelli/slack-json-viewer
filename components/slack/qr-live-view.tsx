"use client";

import * as React from "react";
import { MonitorSmartphone } from "lucide-react";

import { useI18n } from "@/lib/i18n/react";
import { QR_INPUT_KEYS, QR_VIEWPORT, type QrInput, type QrInputKey } from "@/lib/slack/bridge-types";
import { cn } from "@/lib/utils";

const SPECIAL_KEYS = new Set<string>(QR_INPUT_KEYS);

/**
 * The QR sign-in's server-side browser, shown and driven from the panel.
 *
 * Slack may hand the sign-in over to the company's identity provider (SSO):
 * that page needs a person, and the browser showing it runs on the server.
 * This shows its frames; clicks, keystrokes, pasted text and the wheel go
 * back through `onInput`, in page coordinates.
 */
export function QrLiveView({
  frame,
  onInput,
}: {
  /** `data:image/jpeg;base64,…`, or null until the first frame arrives. */
  frame: string | null;
  onInput: (input: QrInput) => void;
}) {
  const { m } = useI18n();
  const boxRef = React.useRef<HTMLDivElement>(null);
  const [focused, setFocused] = React.useState(false);

  // Typing is batched into short runs of text, flushed before any other input
  // so the order the person typed in is the order the page receives.
  const pendingText = React.useRef("");
  const textTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingScroll = React.useRef(0);
  const scrollTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushText = React.useCallback(() => {
    if (textTimer.current) clearTimeout(textTimer.current);
    textTimer.current = null;
    if (pendingText.current) {
      onInput({ t: "text", v: pendingText.current });
      pendingText.current = "";
    }
  }, [onInput]);

  const send = React.useCallback(
    (input: QrInput) => {
      flushText();
      onInput(input);
    },
    [flushText, onInput],
  );

  React.useEffect(
    () => () => {
      if (textTimer.current) clearTimeout(textTimer.current);
      if (scrollTimer.current) clearTimeout(scrollTimer.current);
    },
    [],
  );

  // Focus the view as soon as there is something to act on.
  const hasFrame = frame !== null;
  React.useEffect(() => {
    if (hasFrame) boxRef.current?.focus({ preventScroll: true });
  }, [hasFrame]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * QR_VIEWPORT.width;
    const y = ((event.clientY - rect.top) / rect.height) * QR_VIEWPORT.height;
    send({ t: "click", x: Math.round(x), y: Math.round(y) });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return; // paste arrives via onPaste
    if (SPECIAL_KEYS.has(event.key)) {
      // Tab and Escape are the page's here, not the dialog's.
      event.preventDefault();
      event.stopPropagation();
      send({ t: "key", k: event.key as QrInputKey });
      return;
    }
    if (event.key.length === 1) {
      event.preventDefault();
      pendingText.current += event.key;
      if (!textTimer.current) textTimer.current = setTimeout(flushText, 80);
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    send({ t: "text", v: text.slice(0, 2000) });
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    pendingScroll.current += event.deltaY;
    if (scrollTimer.current) return;
    scrollTimer.current = setTimeout(() => {
      scrollTimer.current = null;
      const dy = Math.round(pendingScroll.current);
      pendingScroll.current = 0;
      if (dy) send({ t: "scroll", dy });
    }, 120);
  };

  return (
    <section className="space-y-2" aria-labelledby="qr-live-title">
      <div className="flex items-center gap-2">
        <MonitorSmartphone className="size-4 text-[var(--slack-green)]" />
        <p id="qr-live-title" className="text-sm font-medium">
          {m.connect.liveTitle}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">{m.connect.liveHint}</p>

      <div
        ref={boxRef}
        role="application"
        aria-label={m.connect.liveTitle}
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onWheel={handleWheel}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          flushText();
          setFocused(false);
        }}
        className={cn(
          "relative w-full cursor-pointer overflow-hidden rounded-md border bg-muted outline-none transition-shadow",
          focused && "ring-[3px] ring-[var(--slack-green)]/50",
        )}
        style={{ aspectRatio: `${QR_VIEWPORT.width} / ${QR_VIEWPORT.height}` }}
      >
        {frame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={frame}
            alt=""
            draggable={false}
            className="pointer-events-none size-full select-none object-contain"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            {m.connect.liveWaiting}
          </div>
        )}
        {frame && !focused ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/60 px-3 py-1.5 text-center text-xs text-white">
            {m.connect.liveFocus}
          </div>
        ) : null}
      </div>
    </section>
  );
}
