"use client";

import * as React from "react";
import {
  ArrowRight,
  FolderOpen,
  HardDrive,
  Hash,
  Lock,
  MessageSquare,
  Plug,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";

import { LqButton, PageTitle, SectionTitle, TableHead, Tag } from "@/components/app/ui";
import { useI18n } from "@/lib/i18n/react";
import {
  archiveBytes,
  deleteArchive,
  isVolatile,
  type Archive,
  type ConversationKind,
} from "@/lib/library/store";
import { archiveName, conversationTitle } from "@/lib/library/summary";
import { tsToDate } from "@/lib/slack/parse";

const ARCHIVE_COLUMNS = "minmax(0,2.4fr) minmax(0,1.5fr) 70px 90px 80px minmax(0,1fr) 32px";

export function ConversationIcon({
  kind,
  className = "size-[15px]",
}: {
  kind: ConversationKind;
  className?: string;
}) {
  if (kind === "dm") return <MessageSquare className={className} />;
  if (kind === "group-dm") return <Users className={className} />;
  if (kind === "private") return <Lock className={className} />;
  return <Hash className={className} />;
}

/** "12 Jan – 3 Mar 2026" over every conversation of an archive. */
export function archiveRange(
  archive: Archive,
  range: (from: Date, to: Date) => string,
): string {
  const first = archive.conversations
    .map((c) => c.firstTs)
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => Number(a) - Number(b))[0];
  const last = archive.conversations
    .map((c) => c.lastTs)
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => Number(b) - Number(a))[0];
  if (!first || !last) return "—";
  return range(tsToDate(first), tsToDate(last));
}

export function LibraryView({
  archives,
  nameOf,
  onOpen,
  onImport,
  onPickFiles,
  onChanged,
}: {
  archives: Archive[] | null;
  nameOf: (id: string) => string;
  onOpen: (archiveId: string, conversationId?: string) => void;
  onImport: () => void;
  onPickFiles: () => void;
  onChanged: () => void;
}) {
  const { m, t, p, fmt } = useI18n();

  if (!archives) {
    return (
      <div aria-busy="true" className="flex flex-1 flex-col gap-3.5 px-10 py-8">
        <div className="lq-shimmer h-[22px] w-[220px] rounded-[5px]" />
        <div className="h-3 w-[360px] max-w-full rounded-[4px] bg-surface-2" />
        <div className="mt-4 h-16 rounded-[8px] bg-surface-2" />
        <div className="h-16 rounded-[8px] bg-surface-2" />
      </div>
    );
  }

  const totalBytes = archives.reduce((s, a) => s + archiveBytes(a), 0);
  const recents = archives
    .flatMap((a) =>
      a.conversations
        .filter((c) => c.openedAt)
        .map((c) => ({ archive: a, conversation: c })),
    )
    .sort((x, y) => (y.conversation.openedAt ?? 0) - (x.conversation.openedAt ?? 0))
    .slice(0, 6);

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-7 px-4 py-6 sm:px-10 sm:py-8">
        <PageTitle
          title={m.library.title}
          subtitle={
            <>
              <HardDrive className="size-3.5 text-fg-3" />
              <span className="text-fg-3">
                {p(m.library.meta, archives.length, { size: fmt.size(totalBytes) || "0" })}
              </span>
            </>
          }
        />

        {isVolatile() ? (
          <p className="rounded-[8px] bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning">
            {m.library.volatile}
          </p>
        ) : null}

        {archives.length === 0 ? (
          <div className="flex flex-col items-center gap-3.5 rounded-[12px] border border-border bg-surface px-6 py-14 text-center">
            <div className="grid size-12 place-items-center rounded-[12px] bg-brand-soft text-brand-text">
              <Plug className="size-[22px]" />
            </div>
            <h2 className="m-0 text-[18px] font-semibold">{m.library.emptyTitle}</h2>
            <p className="m-0 max-w-[440px] text-fg-2 [text-wrap:pretty]">{m.library.emptyBody}</p>
            <LqButton size="lg" className="mt-1.5" onClick={onImport}>
              {m.library.emptyCta}
              <ArrowRight />
            </LqButton>
            <button
              type="button"
              onClick={onPickFiles}
              className="border-0 bg-transparent text-[13px] text-fg-3 underline underline-offset-[3px] hover:text-fg-2"
            >
              {m.library.emptyFile}
            </button>
          </div>
        ) : (
          <>
            {recents.length > 0 ? (
              <section className="flex flex-col gap-2.5">
                <SectionTitle>{m.library.recent}</SectionTitle>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2.5">
                  {recents.map(({ archive, conversation }) => (
                    <button
                      key={`${archive.id}/${conversation.id}`}
                      type="button"
                      onClick={() => onOpen(archive.id, conversation.id)}
                      className="flex flex-col gap-1.5 rounded-[8px] border border-border bg-surface p-3.5 text-left text-fg transition-shadow hover:border-border-strong hover:shadow-2"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                        <span className="text-fg-3">
                          <ConversationIcon kind={conversation.kind} />
                        </span>
                        <span className="truncate">{conversationTitle(conversation, nameOf)}</span>
                      </span>
                      <span className="text-[12px] text-fg-3">
                        {p(m.library.messages, conversation.messageCount)}
                        {conversation.lastTs
                          ? ` · ${fmt.date(tsToDate(conversation.lastTs))}`
                          : ""}
                      </span>
                      <span className="text-[12px] text-fg-3">
                        {t(m.library.openedIn, {
                          archive: archiveName(archive, m.app.localFiles),
                          when: fmt.ago(new Date(conversation.openedAt!)),
                        })}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-2.5">
              <SectionTitle>{m.library.archives}</SectionTitle>
              <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
                <TableHead columns={ARCHIVE_COLUMNS}>
                  <span>{m.library.colArchive}</span>
                  <span>{m.library.colPeriod}</span>
                  <span className="text-right">{m.library.colConversations}</span>
                  <span className="text-right">{m.library.colMessages}</span>
                  <span className="text-right">{m.library.colSize}</span>
                  <span>{m.library.colOpened}</span>
                  <span />
                </TableHead>
                {archives.map((a) => (
                  <ArchiveRow
                    key={a.id}
                    archive={a}
                    onOpen={() => onOpen(a.id)}
                    onDeleted={onChanged}
                  />
                ))}
              </div>
              <p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-3">
                <ShieldCheck className="size-[13px]" />
                {m.library.privacy}
              </p>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function ArchiveRow({
  archive,
  onOpen,
  onDeleted,
}: {
  archive: Archive;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const { m, t, p, fmt } = useI18n();
  const name = archiveName(archive, m.app.localFiles);
  const messages = archive.conversations.reduce((s, c) => s + c.messageCount, 0);
  const range = archiveRange(archive, fmt.range);
  const opened = archive.openedAt ? fmt.ago(new Date(archive.openedAt)) : m.library.never;

  const remove = async (event: React.MouseEvent) => {
    event.stopPropagation();
    const ok = window.confirm(
      p(m.library.deleteConfirm, archive.conversations.length, { name }),
    );
    if (!ok) return;
    await deleteArchive(archive.id);
    onDeleted();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group grid cursor-pointer grid-cols-[minmax(0,1fr)_32px] items-center gap-4 border-b border-border px-4 py-3 text-left last:border-b-0 hover:bg-surface-2 md:grid-cols-[minmax(0,2.4fr)_minmax(0,1.5fr)_70px_90px_80px_minmax(0,1fr)_32px]"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[7px] bg-surface-3 font-semibold text-fg-2 uppercase">
          {archive.source === "slack" ? name.charAt(0) : <FolderOpen className="size-4" />}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{name}</span>
            <Tag title={m.app.onDeviceTitle}>
              <HardDrive className="size-[11px]" />
              {m.app.onDevice}
            </Tag>
          </span>
          <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-3">
            {archive.source === "slack" ? (
              <>
                <Plug className="size-[13px]" />
                Slack · <span className="font-mono text-[11.5px]">{archive.workspace}.slack.com</span>
              </>
            ) : (
              <>
                <FolderOpen className="size-[13px]" />
                {m.app.fileSource}
              </>
            )}
          </span>
          <span className="text-[12px] text-fg-3 md:hidden">
            {range} · {p(m.library.messages, messages)} · {fmt.size(archiveBytes(archive))}
          </span>
        </span>
      </span>
      <span className="hidden text-[13px] text-fg-2 md:inline">{range}</span>
      <span className="hidden text-right text-[13px] tabular-nums md:inline">
        {fmt.number(archive.conversations.length)}
      </span>
      <span className="hidden text-right text-[13px] tabular-nums md:inline">
        {fmt.number(messages)}
      </span>
      <span className="hidden text-right text-[13px] text-fg-2 tabular-nums md:inline">
        {fmt.size(archiveBytes(archive))}
      </span>
      <span className="hidden text-[13px] whitespace-nowrap text-fg-2 md:inline">{opened}</span>
      <button
        type="button"
        onClick={(e) => void remove(e)}
        title={m.library.delete}
        aria-label={t(m.library.deleteNamed, { name })}
        className="grid size-7 place-items-center rounded-[6px] text-fg-3 opacity-0 group-hover:opacity-100 hover:bg-danger-soft hover:text-danger focus-visible:opacity-100"
      >
        <Trash2 className="size-[14px]" />
      </button>
    </div>
  );
}
