import * as React from "react";
import {
  ChevronRight,
  CornerDownRight,
  ExternalLink,
  FileCode2,
  Headphones,
} from "lucide-react";

import { renderEmoji, normalizeShortcode } from "@/lib/slack/emoji";
import { useI18n } from "@/lib/i18n/react";
import { resolveUser } from "@/lib/slack/users";
import type {
  NormalizedMessage,
  SlackAttachment,
  SlackFile,
  UserDirectory,
} from "@/lib/slack/types";
import { MessageBody, type RenderContext } from "./rich-text";
import { cn } from "@/lib/utils";

/*
 * One message, as in the `Loquarium Message` mock-up. The same component
 * renders the live archive and the standalone export, so everything here must
 * work as static markup: hover states are CSS, never React state.
 */

export interface MessageProps {
  message: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
  highlight?: string;
  showEmail?: boolean;
  /** disables hover affordances for the static export */
  isStatic?: boolean;
  /** rendered inside a thread panel: no thread bar */
  inThread?: boolean;
  /** opens the thread panel in the live app */
  onOpenThread?: (message: NormalizedMessage) => void;
}

/* -------------------------------------------------------------------------- */
/*  Pieces                                                                     */
/* -------------------------------------------------------------------------- */

function UserAvatar({
  color,
  label,
  image,
  title,
}: {
  color: string;
  label: string;
  image?: string;
  title: string;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        title={title}
        width={36}
        height={36}
        className="mt-[3px] size-9 rounded-[6px] object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      title={title}
      className="mt-[3px] grid size-9 shrink-0 place-items-center rounded-[6px] font-read text-[14px] leading-none font-bold text-white"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

/** Small square avatar used in thread bars and huddle cards. */
function MiniAvatar({
  color,
  label,
  title,
  ring,
}: {
  color: string;
  label: string;
  title: string;
  ring?: boolean;
}) {
  return (
    <span
      title={title}
      className={cn(
        "grid size-[22px] shrink-0 place-items-center rounded-[5px] font-read text-[9px] font-bold text-white",
        ring && "-ml-1 border-2 border-[var(--c-bg)]",
      )}
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

function Reactions({
  message,
  directory,
  overrides,
}: {
  message: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
}) {
  const { m, t, p } = useI18n();
  if (message.reactions.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {message.reactions.map((r) => {
        const who = (r.users ?? [])
          .map((id) => resolveUser(id, directory, overrides).name)
          .join(", ");
        return (
          <span
            key={r.name}
            title={t(m.message.reacted, {
              who: who || p(m.message.people, r.count),
              emoji: normalizeShortcode(r.name),
            })}
            className="inline-flex h-6 cursor-default items-center gap-1 rounded-full border px-2 font-read text-[12px] font-bold text-[var(--c-text)]"
            style={{
              background: "var(--c-reaction-bg)",
              borderColor: "var(--c-reaction-border)",
            }}
          >
            <span className="text-[14px] leading-none">{renderEmoji(r.name)}</span>
            {r.count}
          </span>
        );
      })}
    </div>
  );
}

/** Slack sends `36a64f`, `#36a64f` or a name (`good`, `danger`). */
function attachmentColor(color?: string): string {
  if (!color) return "var(--c-quote)";
  if (/^[0-9a-f]{3,8}$/i.test(color)) return `#${color}`;
  return ({ good: "#2eb67d", warning: "#ecb22e", danger: "#e01e5a" } as Record<string, string>)[color] ?? color;
}

function AttachmentCard({ attachment }: { attachment: SlackAttachment }) {
  const hasBody =
    attachment.title || attachment.text || attachment.service_name || attachment.image_url;
  if (!hasBody) return null;

  return (
    <div
      className="mt-1.5 flex max-w-[520px] gap-3 pl-3"
      style={{ borderLeft: `4px solid ${attachmentColor(attachment.color)}` }}
    >
      <div className="min-w-0 flex-1">
        {attachment.service_name ? (
          <div className="flex items-center gap-1.5 text-[13px] font-bold">
            {attachment.service_icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachment.service_icon}
                alt=""
                width={16}
                height={16}
                className="rounded-[3px]"
              />
            ) : null}
            {attachment.service_name}
          </div>
        ) : null}
        {attachment.title ? (
          <div className="mt-0.5 font-bold">
            {attachment.title_link ? (
              <a
                href={attachment.title_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--c-link)] no-underline hover:underline"
              >
                {attachment.title}
              </a>
            ) : (
              attachment.title
            )}
          </div>
        ) : null}
        {attachment.text ? (
          <div className="mt-px text-[14px] text-[var(--c-text)]">{attachment.text}</div>
        ) : null}
        {attachment.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.image_url}
            alt={attachment.title ?? ""}
            className="mt-2 max-h-80 rounded-[8px] border border-[var(--c-card-border)]"
          />
        ) : null}
      </div>
      {attachment.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.thumb_url}
          alt=""
          className="size-20 shrink-0 rounded-[6px] border border-[var(--c-card-border)] object-cover"
        />
      ) : null}
    </div>
  );
}

const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"]);
const BADGE_COLORS: Record<string, string> = {
  pdf: "#b8352c",
  doc: "#2b5797",
  docx: "#2b5797",
  xls: "#1f7244",
  xlsx: "#1f7244",
  csv: "#1f7244",
  ppt: "#c4501f",
  pptx: "#c4501f",
  zip: "#5f6773",
};

function FileCard({ file }: { file: SlackFile }) {
  const { m, fmt } = useI18n();
  const label = file.title || file.name || m.message.file;
  const href = file.permalink || file.url_private;
  const kind = (file.filetype ?? "").toLowerCase();
  const isImage = IMAGE_TYPES.has(kind);
  const isSnippet = file.mode === "snippet" && Boolean(file.preview);
  const typeLabel = file.pretty_type ?? kind.toUpperCase();
  const meta = [typeLabel, fmt.size(file.size)].filter(Boolean).join(" · ");

  if (isSnippet) {
    return (
      <div className="max-w-[560px] overflow-hidden rounded-[8px] border border-[var(--c-card-border)] bg-[var(--c-bg)]">
        <div className="flex items-center gap-2 border-b border-[var(--c-card-border)] px-2.5 py-[7px]">
          <FileCode2 className="size-[15px] shrink-0 text-[var(--c-muted)]" />
          <span className="min-w-0 truncate text-[13px] font-bold">{label}</span>
          <span className="shrink-0 text-[12px] text-[var(--c-muted)]">{meta}</span>
          <span className="flex-1" />
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[12px] text-[var(--c-link)] no-underline hover:underline"
            >
              {m.message.openInSlack}
            </a>
          ) : null}
        </div>
        <pre
          className="m-0 max-h-56 overflow-auto px-3 py-2 font-mono text-[12px] leading-[1.6] text-[var(--c-text)]"
          style={{ background: "var(--c-code-bg)", whiteSpace: "pre" }}
        >
          {file.preview}
        </pre>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="max-w-[360px]">
        <div className="mb-1 text-[13px] text-[var(--c-muted)]">
          {label}
          {file.size ? <span> · {fmt.size(file.size)}</span> : null}
        </div>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="grid h-[120px] place-items-center rounded-[8px] border border-[var(--c-card-border)] font-mono text-[12px] text-[var(--c-muted)] no-underline"
            style={{
              background:
                "repeating-linear-gradient(135deg,var(--c-hover) 0 10px,var(--c-code-bg) 10px 20px)",
            }}
          >
            {m.message.image}
          </a>
      </div>
    );
  }

  return (
    <div className="flex max-w-[420px] items-center gap-3 rounded-[8px] border border-[var(--c-card-border)] bg-[var(--c-bg)] px-3 py-2.5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-[6px] font-read text-[10px] font-bold tracking-[.04em] text-white uppercase"
        style={{ background: BADGE_COLORS[kind] ?? "#4b3f72" }}
      >
        {(kind || "doc").slice(0, 4)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-bold">{label}</span>
        <span className="block text-[13px] text-[var(--c-muted)]">{meta}</span>
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={m.message.openInSlack}
          aria-label={m.message.openInSlack}
          className="grid size-7 shrink-0 place-items-center rounded-[6px] text-[var(--c-muted)] hover:bg-[var(--c-hover)]"
        >
          <ExternalLink className="size-[15px]" />
        </a>
      ) : null}
    </div>
  );
}

function HuddleCard({
  message,
  directory,
  overrides,
}: {
  message: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
}) {
  const { m } = useI18n();
  const raw = message.raw as { room?: { participant_history?: string[]; participants?: string[] } };
  const ids = raw.room?.participant_history ?? raw.room?.participants ?? [];
  const people = ids.slice(0, 6).map((id) => resolveUser(id, directory, overrides));

  return (
    <div className="mt-1 flex max-w-[420px] items-center gap-3 rounded-[8px] border border-[var(--c-card-border)] bg-[var(--c-bg)] px-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-[8px] bg-[var(--c-reaction-bg)] text-[var(--c-muted)]">
        <Headphones className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold">{m.message.huddle}</span>
        <span className="block truncate text-[13px] text-[var(--c-muted)]">
          {people.length > 0 ? (
            people.map((u) => u.name).join(", ")
          ) : message.permalink ? (
            <a
              href={message.permalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--c-link)] no-underline hover:underline"
            >
              {m.message.openCall}
            </a>
          ) : (
            m.message.audioCall
          )}
        </span>
      </span>
      {people.length > 0 ? (
        <span className="flex pl-1">
          {people.map((u) => (
            <MiniAvatar key={u.id} color={u.color} label={u.initials} title={u.name} ring />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Thread summary bar                                                         */
/* -------------------------------------------------------------------------- */

function ThreadBar({
  message,
  directory,
  overrides,
  onOpenThread,
}: {
  message: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
  onOpenThread?: (message: NormalizedMessage) => void;
}) {
  const { m, t, p, fmt } = useI18n();
  const participants = Array.from(
    new Set(
      message.replyUsers.length > 0
        ? message.replyUsers
        : message.replies.map((r) => r.userId)
    )
  ).slice(0, 5);

  return (
    <button
      type="button"
      data-thread-open={message.ts}
      onClick={onOpenThread ? () => onOpenThread(message) : undefined}
      className="slack-thread-bar mt-1 -ml-1.5 flex w-[calc(100%+6px)] max-w-[600px] items-center gap-2 rounded-[6px] border border-transparent px-1.5 py-1 text-left font-read"
    >
      <span className="flex gap-[3px]">
        {participants.map((id) => {
          const user = resolveUser(id, directory, overrides);
          return <MiniAvatar key={id} color={user.color} label={user.initials} title={user.name} />;
        })}
      </span>
      <span className="text-[13px] font-bold text-[var(--c-link)]">
        {p(m.thread.replies, message.replyCount)}
      </span>
      {message.latestReply ? (
        <span className="slack-thread-idle truncate text-[13px] text-[var(--c-muted)]">
          {t(m.thread.lastReply, { date: fmt.dayShort(message.latestReply) })}
        </span>
      ) : null}
      <span className="slack-thread-hover flex-1 items-center gap-2 text-[13px] text-[var(--c-muted)]">
        {m.thread.view}
        <span className="flex-1" />
        <ChevronRight className="size-3.5" />
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Message                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * One message. Memoised: when older messages are added above in the viewer,
 * the ones already on screen keep the same props and are not rendered again.
 */
export const Message = React.memo(function Message({
  message,
  directory,
  overrides,
  highlight,
  showEmail = true,
  isStatic = false,
  inThread = false,
  onOpenThread,
}: MessageProps) {
  const { m, t, fmt } = useI18n();
  const user = resolveUser(message.userId, directory, overrides);
  const ctx: RenderContext = { directory, overrides, highlight };
  const time = fmt.time(message.date);
  const fullTime = fmt.full(message.date);
  const hasThread = !inThread && message.replies.length > 0;
  const hasCards = message.files.length > 0;

  return (
    <div
      data-msg
      data-user={message.userId}
      data-ts={message.ts}
      data-day={message.dayKey}
      data-grouped={message.grouped ? "true" : "false"}
      data-search={message.searchText}
      className={cn(
        "slack-msg group relative flex gap-2 px-5 text-[15px] leading-[1.4667]",
        !isStatic && "hover:bg-[var(--c-hover)]"
      )}
    >
      <div className="flex w-9 shrink-0 justify-end">
        <span
          className="slack-msg-time text-[11px] leading-[22px] whitespace-nowrap"
          title={fullTime}
        >
          {time}
        </span>
        <span className="slack-msg-avatar">
          <UserAvatar
            color={user.color}
            label={user.initials}
            image={user.image}
            title={user.name}
          />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {message.orphanReply ? (
          <div className="mb-0.5 flex items-center gap-1.5 text-[13px] text-[var(--c-muted)]">
            <CornerDownRight className="size-[13px]" />
            {m.message.orphanReply}
          </div>
        ) : null}

        <div className="slack-msg-head flex flex-wrap items-baseline gap-x-1.5">
          <span
            className="text-[15px] font-black text-[var(--c-text)]"
            title={user.known ? user.realName : t(m.message.slackId, { id: user.id })}
          >
            {user.name}
          </span>
          {user.isBot ? (
            <span className="self-center rounded-[3px] bg-[var(--c-reaction-bg)] px-1 py-[3px] font-read text-[10px] leading-none font-bold tracking-[.02em] text-[var(--c-muted)] uppercase">
              {m.message.app}
            </span>
          ) : null}
          {!user.known ? (
            <span
              className="cursor-help self-center rounded-[10px] bg-warning-soft px-1.5 py-[3px] font-app text-[11px] leading-none font-semibold text-warning"
              title={m.message.unresolvedTitle}
            >
              {m.message.unresolved}
            </span>
          ) : null}
          {showEmail && user.email ? (
            <span className="slack-msg-email text-[13px] text-[var(--c-muted)]">{user.email}</span>
          ) : null}
          <span className="cursor-default text-[12px] text-[var(--c-muted)]" title={fullTime}>
            {time}
          </span>
        </div>

        <MessageBody blocks={message.blocks} text={message.text} ctx={ctx} />

        {message.edited ? (
          <span className="text-[12px] text-[var(--c-muted)]">{m.message.edited}</span>
        ) : null}

        {message.subtype === "huddle_thread" ? (
          <HuddleCard message={message} directory={directory} overrides={overrides} />
        ) : null}

        {hasCards ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {message.files.map((f, i) => (
              <FileCard key={f.id ?? i} file={f} />
            ))}
          </div>
        ) : null}

        {message.attachments.map((a, i) => (
          <AttachmentCard key={a.id ?? i} attachment={a} />
        ))}

        <Reactions message={message} directory={directory} overrides={overrides} />

        {hasThread ? (
          <>
            <ThreadBar
              message={message}
              directory={directory}
              overrides={overrides}
              onOpenThread={onOpenThread}
            />
            {/* Pre-rendered so the exported page can open the thread panel
                without re-rendering anything. */}
            <div className="slack-thread-source" data-thread-replies={message.ts} hidden>
              {message.replies.map((reply) => (
                <Message
                  key={reply.key}
                  message={reply}
                  directory={directory}
                  overrides={overrides}
                  highlight={highlight}
                  showEmail={showEmail}
                  isStatic={isStatic}
                  inThread
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
});

/** A day separator; it sticks to the top while its messages scroll by. */
export function DayDivider({ label, day }: { label: string; day: string }) {
  return (
    <div
      data-day-divider={day}
      className="slack-day sticky top-0 z-[2] mt-3.5 mb-1 flex justify-center"
    >
      <span className="absolute inset-x-0 top-1/2 border-t border-[var(--c-divider)]" />
      <span className="relative rounded-[14px] border border-[var(--c-divider)] bg-[var(--c-bg)] px-3.5 py-[3px] font-read text-[13px] font-bold text-[var(--c-text)]">
        {label}
      </span>
    </div>
  );
}
