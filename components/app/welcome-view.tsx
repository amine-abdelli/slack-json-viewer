"use client";

import * as React from "react";
import { ArrowRight, FileCode2, HardDrive, QrCode, ShieldCheck } from "lucide-react";

import { LanguageSwitcher } from "@/components/slack/language-switcher";
import { Message } from "@/components/slack/message";
import { useI18n } from "@/lib/i18n/react";
import { normalizeMessages } from "@/lib/slack/parse";
import type { SlackMessage, UserDirectory } from "@/lib/slack/types";

/** The people of the sample conversation. */
const SAMPLE_DIRECTORY: UserDirectory = {
  U0SARAHLEM: { id: "U0SARAHLEM", name: "Sarah Lemaire" },
  U0MARCDUBO: { id: "U0MARCDUBO", name: "Marc Dubois" },
  U0INESHADD: { id: "U0INESHADD", name: "Inès Haddad" },
};

/** A Slack timestamp for 10 February 2026 at hh:mm, in the viewer's time zone. */
function ts(hours: number, minutes: number): string {
  return `${Math.floor(new Date(2026, 1, 10, hours, minutes).getTime() / 1000)}.000100`;
}

/**
 * The first screen: what Loquarium does, shown with a real conversation
 * rendered by the same components as the app, and one way in.
 */
export function WelcomeView({
  archiveCount,
  onStart,
}: {
  /** null while the library loads. */
  archiveCount: number | null;
  onStart: () => void;
}) {
  const { m, p, fmt } = useI18n();
  const s = m.welcome.sample;

  const messages = React.useMemo(() => {
    const raw: SlackMessage[] = [
      {
        type: "message",
        user: "U0SARAHLEM",
        text: s.first,
        ts: ts(8, 29),
        thread_ts: ts(8, 29),
        reply_count: 2,
        reactions: [
          { name: "+1", count: 3, users: ["U0MARCDUBO", "U0INESHADD"] },
          { name: "tada", count: 2, users: ["U0INESHADD"] },
        ],
      },
      { type: "message", user: "U0MARCDUBO", text: s.reply1, ts: ts(8, 41), thread_ts: ts(8, 29) },
      { type: "message", user: "U0INESHADD", text: s.reply2, ts: ts(8, 52), thread_ts: ts(8, 29) },
      { type: "message", user: "U0MARCDUBO", text: s.second, ts: ts(9, 2) },
      {
        type: "message",
        user: "U0INESHADD",
        text: s.third,
        ts: ts(9, 14),
        edited: { user: "U0INESHADD", ts: ts(9, 15) },
        files: [
          {
            id: "F0SAMPLE",
            name: s.file,
            title: s.file,
            filetype: "pdf",
            pretty_type: "PDF",
            size: 2_516_582,
          },
        ],
      },
    ];
    return normalizeMessages(raw, SAMPLE_DIRECTORY);
  }, [s]);

  const hasLibrary = (archiveCount ?? 0) > 0;
  const points = [
    { icon: <QrCode />, text: m.welcome.points[0] },
    { icon: <HardDrive />, text: m.welcome.points[1] },
    { icon: <FileCode2 />, text: m.welcome.points[2] },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-auto bg-bg">
      <main className="flex min-w-0 flex-[1_1_560px] flex-col bg-surface px-6 py-7 sm:px-12 sm:py-10">
        <div className="flex items-center gap-2.5">
          <span className="grid size-[30px] place-items-center rounded-[7px] bg-brand text-[15px] leading-none font-semibold text-brand-fg">
            L
          </span>
          <span className="text-[16px] font-semibold tracking-[-.01em]">Loquarium</span>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="flex w-full max-w-[440px] flex-col gap-7">
            <div className="flex flex-col gap-3">
              <span className="animate-in fade-in slide-in-from-bottom-1 self-start rounded-full bg-brand-soft px-2.5 py-1 text-[12px] font-medium text-brand-text duration-500">
                {m.welcome.eyebrow}
              </span>
              <h1 className="animate-in fade-in slide-in-from-bottom-2 m-0 text-[30px] leading-[1.15] font-semibold tracking-[-.02em] [text-wrap:balance] duration-500">
                {m.welcome.title}
              </h1>
              <p className="animate-in fade-in slide-in-from-bottom-2 m-0 text-[15px] leading-relaxed text-fg-2 [text-wrap:pretty] delay-100 duration-500 fill-mode-both">
                {m.welcome.body}
              </p>
            </div>

            <ul className="animate-in fade-in m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px] text-fg-2 delay-200 duration-500 fill-mode-both">
              {points.map((point) => (
                <li key={point.text} className="flex items-center gap-3">
                  <span className="grid size-7 shrink-0 place-items-center rounded-[7px] bg-surface-2 text-fg-3 [&_svg]:size-[15px]">
                    {point.icon}
                  </span>
                  {point.text}
                </li>
              ))}
            </ul>

            <div className="animate-in fade-in slide-in-from-bottom-1 flex flex-col gap-2.5 delay-300 duration-500 fill-mode-both">
              <button
                type="button"
                onClick={onStart}
                className="group flex h-11 items-center justify-center gap-2 rounded-[8px] bg-brand px-5 text-[15px] font-medium text-brand-fg shadow-1 transition-colors hover:bg-brand-hover"
              >
                {hasLibrary ? m.welcome.ctaLibrary : m.welcome.cta}
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <p className="m-0 min-h-[18px] text-center text-[12.5px] text-fg-3">
                {hasLibrary ? p(m.welcome.onDevice, archiveCount!) : m.welcome.noAccount}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-fg-3">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="size-[13px]" />
            {m.welcome.footer}
          </span>
          <LanguageSwitcher />
        </div>
      </main>

      <aside
        aria-hidden="true"
        className="hidden min-w-0 flex-[1_1_560px] flex-col justify-center border-l border-border bg-bg px-14 py-12 lg:flex"
      >
        <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3.5">
          <div className="font-mono text-[12px] text-fg-3">
            {s.meta} · {fmt.day(new Date(2026, 1, 10))}
          </div>
          <div className="pointer-events-none rounded-[10px] border border-border bg-c-bg pt-2 pb-3 shadow-2 select-none">
            {messages.map((message, i) => (
              <div
                key={message.key}
                className="animate-in fade-in slide-in-from-bottom-2 duration-700 fill-mode-both"
                style={{ animationDelay: `${250 + i * 220}ms` }}
              >
                <Message
                  message={message}
                  directory={SAMPLE_DIRECTORY}
                  overrides={{}}
                  showEmail={false}
                  isStatic
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 mb-0 max-w-[460px] text-[15px] leading-[1.55] text-fg-2 [text-wrap:pretty]">
            {m.welcome.caption}
          </p>
        </div>
      </aside>
    </div>
  );
}
