import * as React from "react";

import { renderEmoji, normalizeShortcode } from "@/lib/slack/emoji";
import { formatFull, formatTime } from "@/lib/slack/parse";
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
}

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
          .map((id) => overrides[id] ?? directory[id]?.name ?? id)
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

function FileCard({ file }: { file: SlackFile }) {
  const label = file.title || file.name || "Fichier";
  return (
    <div
      className="mt-2 flex max-w-[420px] items-center gap-3 rounded-[8px] border p-3"
      style={{ borderColor: "var(--slack-border)" }}
    >
      <span
        className="flex size-9 items-center justify-center rounded-[4px] text-[11px] font-bold uppercase text-white"
        style={{ background: "var(--slack-blue)" }}
      >
        {(file.filetype ?? "doc").slice(0, 4)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-bold">
          {file.permalink || file.url_private ? (
            <a
              href={file.permalink ?? file.url_private}
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
        <span className="block text-[13px]" style={{ color: "var(--slack-fg-muted)" }}>
          {file.size ? `${Math.round(file.size / 1024)} Ko` : (file.mimetype ?? "")}
        </span>
      </span>
    </div>
  );
}

export function Message({
  message,
  directory,
  overrides,
  highlight,
  showEmail = true,
  isStatic = false,
}: MessageProps) {
  const user = resolveUser(message.userId, directory, overrides);
  const ctx: RenderContext = { directory, overrides, highlight };
  const time = formatTime(message.date);

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

        <MessageBody blocks={message.blocks} text={message.text} ctx={ctx} />

        {message.edited ? (
          <span className="text-[11px]" style={{ color: "var(--slack-fg-muted)" }}>
            {" "}
            (modifié)
          </span>
        ) : null}

        {message.attachments.map((a, i) => (
          <AttachmentCard key={a.id ?? i} attachment={a} />
        ))}
        {message.files.map((f, i) => (
          <FileCard key={f.id ?? i} file={f} />
        ))}

        <Reactions message={message} directory={directory} overrides={overrides} />
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
