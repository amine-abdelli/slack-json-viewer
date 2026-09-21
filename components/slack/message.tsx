import * as React from "react";

import { renderEmoji, normalizeShortcode } from "@/lib/slack/emoji";
import { formatDayShort, formatFull, formatTime } from "@/lib/slack/parse";
import { resolveUser } from "@/lib/slack/users";
import type {
  NormalizedMessage,
  SlackAttachment,
  SlackFile,
  UserDirectory,
} from "@/lib/slack/types";
import { MessageBody, type RenderContext } from "./rich-text";
import { cn } from "@/lib/utils";

export interface MessageProps {
  message: NormalizedMessage;
  directory: UserDirectory;
  overrides: Record<string, string>;
  highlight?: string;
  showEmail?: boolean;
  /** disables hover affordances for the static export */
  isStatic?: boolean;
  /** rendered inside a thread panel: no thread bar, tighter padding */
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
  size = 36,
}: {
  color: string;
  label: string;
  image?: string;
  size?: number;
}) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        width={size}
        height={size}
        className="rounded-[4px] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-[4px] font-bold text-white"
      style={{
        width: size,
        height: size,
        background: color,
        fontSize: size <= 24 ? 10 : 13,
        letterSpacing: "0.02em",
      }}
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
  if (message.reactions.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {message.reactions.map((r) => {
        const who = (r.users ?? [])
          .map((id) => resolveUser(id, directory, overrides).name)
          .join(", ");
        return (
          <span
            key={r.name}
            title={`${who || `${r.count} personne(s)`} a réagi avec :${normalizeShortcode(r.name)}:`}
            className="inline-flex h-[22px] items-center gap-1 rounded-full border px-[7px] text-[11px] font-bold leading-none"
            style={{
              background: "var(--slack-reaction-bg)",
              borderColor: "var(--slack-reaction-border)",
              color: "var(--slack-fg-muted)",
            }}
          >
            <span style={{ fontSize: 13 }}>{renderEmoji(r.name)}</span>
            {r.count}
          </span>
        );
      })}
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: SlackAttachment }) {
  const hasBody =
    attachment.title || attachment.text || attachment.service_name || attachment.image_url;
  if (!hasBody) return null;

  return (
    <div
      className="mt-2 flex max-w-[560px] gap-3 rounded-[4px] py-1 pl-3"
      style={{ borderLeft: `4px solid ${attachment.color ?? "var(--slack-border)"}` }}
    >
      <div className="min-w-0 flex-1">
        {attachment.service_name ? (
          <div
            className="mb-1 flex items-center gap-1.5 text-[13px] font-bold"
            style={{ color: "var(--slack-fg)" }}
          >
            {attachment.service_icon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attachment.service_icon}
                alt=""
                width={16}
                height={16}
                className="rounded-[2px]"
              />
            ) : null}
            {attachment.service_name}
          </div>
        ) : null}
        {attachment.title ? (
          <div className="text-[15px] font-bold leading-snug">
            {attachment.title_link ? (
              <a
                href={attachment.title_link}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--slack-blue)" }}
              >
                {attachment.title}
              </a>
            ) : (
              attachment.title
            )}
          </div>
        ) : null}
        {attachment.text ? (
          <div
            className="mt-0.5 text-[15px] leading-snug"
            style={{ color: "var(--slack-fg-muted)" }}
          >
            {attachment.text}
          </div>
        ) : null}
        {attachment.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.image_url}
            alt={attachment.title ?? ""}
            className="mt-2 max-h-80 rounded-[4px]"
          />
        ) : null}
      </div>
      {attachment.thumb_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.thumb_url}
          alt=""
          className="mt-1 size-16 shrink-0 rounded-[4px] object-contain"
        />
      ) : null}
    </div>
  );
}

const IMAGE_TYPES = new Set(["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"]);

function formatSize(size?: number): string {
  if (!size) return "";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function FileCard({ file }: { file: SlackFile }) {
  const label = file.title || file.name || "Fichier";
  const href = file.permalink || file.url_private;
  const kind = (file.filetype ?? "").toLowerCase();
  const isImage = IMAGE_TYPES.has(kind);
  const isSnippet = file.mode === "snippet" && Boolean(file.preview);

  if (isSnippet) {
    return (
      <div
        className="mt-2 max-w-[560px] overflow-hidden rounded-[8px] border"
        style={{ borderColor: "var(--slack-border)" }}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2"
          style={{ borderBottom: "1px solid var(--slack-border)" }}
        >
          <span className="truncate text-[15px] font-bold">
            {href ? (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--slack-fg)" }}
              >
                {label}
              </a>
            ) : (
              label
            )}
          </span>
          <span className="shrink-0 text-[12px]" style={{ color: "var(--slack-fg-muted)" }}>
            {file.pretty_type ?? kind.toUpperCase()} · {formatSize(file.size)}
          </span>
        </div>
        <pre
          className="m-0 max-h-56 overflow-auto px-3 py-2 text-[12px] leading-[1.5]"
          style={{
            fontFamily: "var(--font-mono)",
            background: "var(--slack-code-bg)",
            color: "var(--slack-fg)",
            whiteSpace: "pre-wrap",
          }}
        >
          {file.preview}
        </pre>
      </div>
    );
  }

  return (
    <div
      className="mt-2 flex max-w-[440px] items-center gap-3 rounded-[8px] border p-2.5"
      style={{ borderColor: "var(--slack-border)" }}
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-bold uppercase text-white"
        style={{ background: isImage ? "var(--slack-green)" : "var(--slack-blue)" }}
      >
        {isImage ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <circle cx="8.5" cy="9.5" r="1.5" />
            <path d="m21 16-5-5-4.5 4.5L9 13l-6 6" />
          </svg>
        ) : (
          (kind || "doc").slice(0, 4)
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold">
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--slack-fg)" }}
            >
              {label}
            </a>
          ) : (
            label
          )}
        </span>
        <span className="block text-[12px]" style={{ color: "var(--slack-fg-muted)" }}>
          {[file.pretty_type ?? kind.toUpperCase(), formatSize(file.size)]
            .filter(Boolean)
            .join(" · ")}
          {href ? " · ouvrir dans Slack" : ""}
        </span>
      </span>
    </div>
  );
}

function HuddleCard({ message }: { message: NormalizedMessage }) {
  return (
    <div
      className="mt-1 flex max-w-[440px] items-center gap-3 rounded-[8px] border p-2.5"
      style={{ borderColor: "var(--slack-border)" }}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full"
        style={{ background: "var(--slack-aubergine)", color: "#fff" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-bold">Huddle</span>
        <span className="block text-[12px]" style={{ color: "var(--slack-fg-muted)" }}>
          {message.permalink ? (
            <a
              href={message.permalink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--slack-blue)" }}
            >
              Ouvrir l&apos;appel dans Slack
            </a>
          ) : (
            "Appel audio"
          )}
        </span>
      </span>
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
      className="slack-thread-bar group/thread mt-1 flex w-full max-w-[560px] items-center gap-2 rounded-[6px] border border-transparent px-1 py-1 text-left transition-colors"
    >
      <span className="flex -space-x-1">
        {participants.map((id) => {
          const user = resolveUser(id, directory, overrides);
          return (
            <span
              key={id}
              className="flex size-5 items-center justify-center rounded-[4px] text-[9px] font-bold text-white ring-2"
              style={{
                background: user.color,
                ["--tw-ring-color" as string]: "var(--slack-bg)",
              }}
              title={user.name}
            >
              {user.initials}
            </span>
          );
        })}
      </span>
      <span
        className="text-[13px] font-bold"
        style={{ color: "var(--slack-blue)" }}
      >
        {message.replyCount} réponse{message.replyCount > 1 ? "s" : ""}
      </span>
      {message.latestReply ? (
        <span
          className="truncate text-[12px] group-hover/thread:hidden"
          style={{ color: "var(--slack-fg-muted)" }}
        >
          Dernière réponse le {formatDayShort(message.latestReply)}
        </span>
      ) : null}
      <span
        className="hidden text-[12px] group-hover/thread:inline"
        style={{ color: "var(--slack-fg-muted)" }}
      >
        Voir le fil
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Message                                                                    */
/* -------------------------------------------------------------------------- */

export function Message({
  message,
  directory,
  overrides,
  highlight,
  showEmail = true,
  isStatic = false,
  inThread = false,
  onOpenThread,
}: MessageProps) {
  const user = resolveUser(message.userId, directory, overrides);
  const ctx: RenderContext = { directory, overrides, highlight };
  const time = formatTime(message.date);
  const hasThread = !inThread && message.replies.length > 0;

  return (
    <div
      data-msg
      data-user={message.userId}
      data-ts={message.ts}
      data-day={message.dayKey}
      data-grouped={message.grouped ? "true" : "false"}
      data-search={message.searchText}
      className={cn(
        "slack-msg group relative flex gap-2 px-5 transition-colors",
        !isStatic && "hover:bg-[var(--slack-bg-hover)]"
      )}
    >
      <div className="w-9 shrink-0 pt-[2px]">
        <span className="slack-msg-time block pt-[3px] text-[11px] leading-[22px]">
          {time}
        </span>
        <span className="slack-msg-avatar">
          <UserAvatar color={user.color} label={user.initials} image={user.image} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="slack-msg-head flex flex-wrap items-baseline gap-x-2">
          <span
            className="text-[15px] font-black leading-[1.46668]"
            style={{ color: "var(--slack-fg)" }}
            title={user.known ? user.realName : `ID Slack ${user.id}`}
          >
            {user.name}
          </span>
          {user.isBot ? (
            <span
              className="rounded-[3px] px-1 text-[10px] font-bold uppercase text-white"
              style={{ background: "var(--slack-fg-muted)" }}
            >
              app
            </span>
          ) : null}
          {showEmail && user.email ? (
            <span
              className="slack-msg-email text-[11px]"
              style={{ color: "var(--slack-fg-muted)" }}
            >
              {user.email}
            </span>
          ) : null}
          {!user.known ? (
            <span
              className="rounded-[3px] px-1 text-[10px] font-bold uppercase"
              style={{
                background: "var(--slack-code-bg)",
                color: "var(--slack-fg-muted)",
              }}
              title="Cet identifiant n'est pas présent dans le fichier annuaire"
            >
              non résolu
            </span>
          ) : null}
          <span
            className="text-[12px]"
            style={{ color: "var(--slack-fg-muted)" }}
            title={formatFull(message.date)}
          >
            {time}
          </span>
        </div>

        {message.orphanReply ? (
          <div
            className="mb-0.5 text-[11px] italic"
            style={{ color: "var(--slack-fg-muted)" }}
          >
            Réponse dans un fil dont le message d&apos;origine est absent de
            l&apos;export
          </div>
        ) : null}

        <MessageBody blocks={message.blocks} text={message.text} ctx={ctx} />

        {message.edited ? (
          <span className="text-[11px]" style={{ color: "var(--slack-fg-muted)" }}>
            {" "}
            (modifié)
          </span>
        ) : null}

        {message.subtype === "huddle_thread" ? (
          <HuddleCard message={message} />
        ) : null}

        {message.attachments.map((a, i) => (
          <AttachmentCard key={a.id ?? i} attachment={a} />
        ))}
        {message.files.map((f, i) => (
          <FileCard key={f.id ?? i} file={f} />
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
}

export function DayDivider({ label, day }: { label: string; day: string }) {
  return (
    <div data-day-divider={day} className="slack-day relative my-3 px-5">
      <div
        className="absolute inset-x-5 top-1/2 h-px"
        style={{ background: "var(--slack-border)" }}
      />
      <div className="relative flex justify-center">
        <span
          className="rounded-full border px-4 py-[3px] text-[13px] font-bold"
          style={{
            background: "var(--slack-bg)",
            borderColor: "var(--slack-border)",
            color: "var(--slack-fg)",
          }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
