"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileCode2,
  FileJson,
  FileText,
  HardDrive,
  Loader,
  ShieldCheck,
  X,
} from "lucide-react";

import { IconButton, LqButton, Segmented, Switch, Tag } from "@/components/app/ui";
import { useI18n } from "@/lib/i18n/react";
import { recordExport, type ExportFormat, type ExportRecord } from "@/lib/app/exports-history";
import { buildStandaloneHtml, downloadHtml, downloadJson } from "@/lib/export/standalone";
import { tsToDate } from "@/lib/slack/parse";
import type {
  ConversationMeta,
  NormalizedMessage,
  SlackConversation,
  UserDirectory,
} from "@/lib/slack/types";
import { cn } from "@/lib/utils";

type FormatChoice = ExportFormat | "pdf" | "evidence";
type Phase =
  | { t: "idle" }
  | { t: "generating" }
  | { t: "done"; file: string }
  | { t: "error"; message: string };

/** A file name every system accepts. */
function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|#\s]+/g, "-").replace(/^-+|-+$/g, "") || "conversation";
}

/**
 * The export side sheet: scope, format, options, then a file generated in
 * this browser. Every export is recorded in the Exports history.
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The page is a single file: its images go in as `data:` URLs. */
async function toDataUrls(images: ReadonlyMap<string, Blob>): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [id, blob] of images) out.set(id, await blobToDataUrl(blob));
  return out;
}

export function ExportSheet({
  open,
  onOpenChange,
  title,
  archiveLabel,
  meta,
  conversation,
  messages,
  images,
  directory,
  overrides,
  showEmail,
  dark,
  onExported,
  onHistory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  archiveLabel: string;
  meta: ConversationMeta;
  conversation: SlackConversation;
  messages: NormalizedMessage[];
  /** Screenshots kept with the conversation: embedded in the HTML page. */
  images: ReadonlyMap<string, Blob> | null;
  directory: UserDirectory;
  overrides: Record<string, string>;
  showEmail: boolean;
  dark: boolean;
  onExported: (list: ExportRecord[]) => void;
  onHistory: () => void;
}) {
  const i18n = useI18n();
  const { m, t, p, fmt } = i18n;
  const [format, setFormat] = React.useState<FormatChoice>("html");
  const [emails, setEmails] = React.useState(showEmail);
  const [darkPage, setDarkPage] = React.useState(dark);
  const [phase, setPhase] = React.useState<Phase>({ t: "idle" });

  // Each opening starts from the screen's current settings.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEmails(showEmail);
      setDarkPage(dark);
      setPhase({ t: "idle" });
    }
  }

  const replies = messages.reduce((s, msg) => s + msg.replies.length, 0);
  const base = safeFileName(title);
  const fileName = `${base}.${format === "json" ? "json" : "html"}`;
  const available = format === "html" || format === "json";

  const generate = async () => {
    if (!available) return;
    setPhase({ t: "generating" });
    try {
      let bytes: number;
      if (format === "html") {
        const html = await buildStandaloneHtml({
          i18n,
          meta,
          messages,
          images: images ? await toDataUrls(images) : undefined,
          directory,
          overrides,
          showEmail: emails,
          dark: darkPage,
        });
        bytes = downloadHtml(fileName, html);
      } else {
        bytes = downloadJson(fileName, conversation);
      }
      onExported(
        recordExport({
          file: fileName,
          format,
          scope: title,
          archive: archiveLabel,
          at: Date.now(),
          bytes,
        }),
      );
      setPhase({ t: "done", file: fileName });
    } catch (err) {
      setPhase({ t: "error", message: err instanceof Error ? err.message : String(err) });
    }
  };

  const formats: {
    value: FormatChoice;
    icon: React.ReactNode;
    name: string;
    desc: string;
    soon?: boolean;
  }[] = [
    { value: "html", icon: <FileCode2 />, name: m.exportSheet.html, desc: m.exportSheet.htmlDesc },
    { value: "json", icon: <FileJson />, name: m.exportSheet.json, desc: m.exportSheet.jsonDesc },
    { value: "pdf", icon: <FileText />, name: m.exportSheet.pdf, desc: m.exportSheet.pdfDesc, soon: true },
    {
      value: "evidence",
      icon: <ShieldCheck />,
      name: m.exportSheet.evidence,
      desc: m.exportSheet.evidenceDesc,
      soon: true,
    },
  ];

  const period =
    meta.firstTs && meta.lastTs ? fmt.range(tsToDate(meta.firstTs), tsToDate(meta.lastTs)) : "—";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-scrim" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="data-[state=open]:animate-in data-[state=open]:slide-in-from-right data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right fixed inset-y-0 right-0 z-[51] flex w-full max-w-[440px] flex-col bg-surface text-fg shadow-3 outline-none"
        >
          <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border pr-3 pl-5">
            <DialogPrimitive.Title className="m-0 flex-1 text-[16px] font-semibold">
              {m.exportSheet.title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <IconButton title={m.exportSheet.close} aria-label={m.exportSheet.close}>
                <X className="!size-[17px]" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-auto px-5 py-[18px] [&>*]:shrink-0">
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-[12px] font-semibold text-fg-3">{m.exportSheet.scope}</h3>
              <div className="flex items-center gap-2.5 rounded-[8px] border-[1.5px] border-brand bg-brand-soft px-3 py-2.5">
                <span className="size-4 shrink-0 rounded-full border-[5px] border-brand bg-surface" />
                <span className="flex-1 font-medium">{m.exportSheet.thisConversation}</span>
                <span className="min-w-0 truncate text-[12px] text-fg-2">
                  {title} · {p(m.viewer.messages, messages.length)}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
                <Tag tone="dashed">{m.exportSheet.scopeSelection}</Tag>
                <Tag tone="dashed">{m.exportSheet.scopeDates}</Tag>
                <Tag tone="dashed">{m.exportSheet.scopeChannels}</Tag>
                <span>{m.app.comingSoon}</span>
              </div>
            </section>

            <section role="radiogroup" aria-label={m.exportSheet.format} className="flex flex-col gap-2">
              <h3 className="m-0 text-[12px] font-semibold text-fg-3">{m.exportSheet.format}</h3>
              {formats.map((f) => {
                const selected = f.value === format;
                return (
                  <button
                    key={f.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setFormat(f.value);
                      setPhase({ t: "idle" });
                    }}
                    className={cn(
                      "flex items-start gap-3 rounded-[8px] border-[1.5px] px-3 py-[11px] text-left text-fg [&>svg]:mt-px [&>svg]:size-[18px] [&>svg]:shrink-0",
                      selected
                        ? "border-brand bg-brand-soft [&>svg]:text-brand-text"
                        : "border-border bg-surface hover:border-border-strong [&>svg]:text-fg-3",
                    )}
                  >
                    {f.icon}
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{f.name}</span>
                        {f.soon ? <Tag>{m.app.comingSoon}</Tag> : <Tag tone="success">{m.exportSheet.free}</Tag>}
                      </span>
                      <span className="mt-0.5 block text-[12.5px] text-fg-2 [text-wrap:pretty]">{f.desc}</span>
                    </span>
                  </button>
                );
              })}
            </section>

            {available ? (
              <>
                {format === "html" ? (
                  <section className="flex flex-col gap-2.5">
                    <h3 className="m-0 text-[12px] font-semibold text-fg-3">{m.exportSheet.options}</h3>
                    <Switch checked={emails} onChange={setEmails} label={m.exportSheet.includeEmails} />
                    <div className="flex items-center gap-2.5 text-[13px]">
                      <span className="w-[110px] text-fg-2">{m.exportSheet.theme}</span>
                      <Segmented
                        size="sm"
                        value={darkPage ? "dark" : "light"}
                        onChange={(v) => setDarkPage(v === "dark")}
                        options={[
                          { value: "light", label: m.exportSheet.light },
                          { value: "dark", label: m.exportSheet.dark },
                        ]}
                      />
                    </div>
                  </section>
                ) : null}
                <section className="flex flex-col overflow-hidden rounded-[8px] border border-border">
                  {[
                    { k: m.exportSheet.sumFile, v: fileName, mono: true },
                    {
                      k: m.exportSheet.sumContent,
                      v: `${p(m.viewer.messages, messages.length)} · ${p(m.thread.replies, replies)}`,
                    },
                    { k: m.exportSheet.sumPeriod, v: period },
                    { k: m.exportSheet.sumPeople, v: fmt.number(meta.participants.length) },
                  ].map((row) => (
                    <div
                      key={row.k}
                      className="flex gap-3 border-b border-border px-3 py-2 text-[12.5px] last:border-b-0"
                    >
                      <span className="w-[84px] shrink-0 text-fg-3">{row.k}</span>
                      <span className={cn("min-w-0 break-words", row.mono && "font-mono")}>{row.v}</span>
                    </div>
                  ))}
                </section>
              </>
            ) : (
              <section className="flex flex-col gap-2 rounded-[10px] bg-brand-soft p-4 text-[13px]">
                <div className="font-semibold text-brand-text">{m.exportSheet.soonTitle}</div>
                <p className="m-0 text-fg-2">{m.exportSheet.soonBody}</p>
                <div>
                  <LqButton variant="ghost" size="sm" className="px-0 text-brand-text" onClick={() => setFormat("html")}>
                    {m.exportSheet.backToHtml}
                  </LqButton>
                </div>
              </section>
            )}
          </div>

          <div className="flex min-h-9 shrink-0 items-center gap-2.5 border-t border-border px-5 py-3.5">
            {phase.t === "generating" ? (
              <>
                <Loader className="size-4 animate-spin text-brand-text" />
                <span className="flex-1 text-[13px]">
                  {t(m.exportSheet.generating, {
                    messages: p(m.viewer.messages, messages.length),
                    replies: p(m.thread.replies, replies),
                  })}
                </span>
              </>
            ) : phase.t === "done" ? (
              <>
                <CircleCheck className="size-[17px] text-success" />
                <span className="min-w-0 flex-1 text-[13px]">
                  <b className="font-semibold">{m.exportSheet.downloaded}</b>
                  <span className="block truncate font-mono text-[11.5px] text-fg-3">{phase.file}</span>
                </span>
                <LqButton variant="secondary" onClick={onHistory}>
                  {m.exportSheet.history}
                </LqButton>
              </>
            ) : phase.t === "error" ? (
              <>
                <CircleAlert className="size-[17px] shrink-0 text-danger" />
                <span className="min-w-0 flex-1 text-[13px] break-words text-danger">
                  {t(m.load.exportFailed, { error: phase.message })}
                </span>
                <LqButton onClick={() => void generate()}>{m.exportSheet.retry}</LqButton>
              </>
            ) : (
              <>
                <span className="flex flex-1 items-center gap-1.5 text-[12px] text-fg-3">
                  <HardDrive className="size-3" />
                  {m.exportSheet.local}
                </span>
                <LqButton variant="secondary" onClick={() => onOpenChange(false)}>
                  {m.common.cancel}
                </LqButton>
                <LqButton disabled={!available} onClick={() => void generate()}>
                  <Download />
                  {format === "json" ? m.exportSheet.downloadJson : m.exportSheet.downloadHtml}
                </LqButton>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
