"use client";

import * as React from "react";
import {
  ChevronDown,
  Hash,
  Lock,
  MessagesSquare,
  Pencil,
  Users,
} from "lucide-react";

import { GithubLink, ReadmeLink } from "@/components/slack/github-link";
import { useI18n } from "@/lib/i18n/react";
import { resolveUser } from "@/lib/slack/users";
import type { ConversationMeta, UserDirectory } from "@/lib/slack/types";
import { cn } from "@/lib/utils";

export interface SidebarProps {
  meta: ConversationMeta | null;
  directory: UserDirectory;
  overrides: Record<string, string>;
  activeUser: string | null;
  onSelectUser: (id: string | null) => void;
  onEditNames: () => void;
  directorySize: number;
}

export function Sidebar({
  meta,
  directory,
  overrides,
  activeUser,
  onSelectUser,
  onEditNames,
  directorySize,
}: SidebarProps) {
  const { m, t, p } = useI18n();
  return (
    <aside
      className="hidden w-[260px] shrink-0 flex-col md:flex"
      style={{ background: "var(--slack-aubergine)", color: "var(--slack-sidebar-fg)" }}
    >
      <div
        className="flex h-[49px] items-center justify-between border-b px-4"
        style={{ borderColor: "rgba(255,255,255,.12)" }}
      >
        <span className="truncate text-[15px] font-black text-white">
          Slack JSON Viewer
        </span>
        <ChevronDown className="size-4 opacity-70" />
      </div>

      <div className="flex-1 overflow-y-auto py-2 text-[15px]">
        <SectionLabel icon={<MessagesSquare className="size-3.5" />}>
          {m.sidebar.conversation}
        </SectionLabel>

        {meta ? (
          <button
            type="button"
            onClick={() => onSelectUser(null)}
            className={cn(
              "flex w-full items-center gap-2 px-3 py-[5px] text-left transition-colors",
              activeUser === null
                ? "text-white"
                : "hover:bg-[var(--slack-aubergine-hover)]"
            )}
            style={activeUser === null ? { background: "var(--slack-active)" } : undefined}
          >
            {meta.kind === "channel" ? (
              <Hash className="size-4 shrink-0 opacity-80" />
            ) : (
              <Lock className="size-4 shrink-0 opacity-80" />
            )}
            <span className="truncate">{meta.displayName}</span>
          </button>
        ) : (
          <p className="px-3 py-1 text-[13px] opacity-60">{m.sidebar.noFile}</p>
        )}

        {meta && meta.participants.length > 0 ? (
          <>
            <div className="mt-4 flex items-center justify-between pr-2">
              <SectionLabel icon={<Users className="size-3.5" />}>
                {t(m.sidebar.members, { n: meta.participants.length })}
              </SectionLabel>
              <button
                type="button"
                onClick={onEditNames}
                title={m.sidebar.editNames}
                aria-label={m.sidebar.editNames}
                className="rounded p-1 opacity-70 hover:bg-[var(--slack-aubergine-hover)] hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
            {meta.participants.map((id) => {
              const user = resolveUser(id, directory, overrides);
              const active = activeUser === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectUser(active ? null : id)}
                  title={user.email ?? id}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-[5px] text-left transition-colors",
                    active ? "text-white" : "hover:bg-[var(--slack-aubergine-hover)]"
                  )}
                  style={active ? { background: "var(--slack-active)" } : undefined}
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold text-white"
                    style={{ background: user.color }}
                  >
                    {user.initials}
                  </span>
                  <span className="truncate">{user.name}</span>
                </button>
              );
            })}
          </>
        ) : null}
      </div>

      <div
        className="border-t px-4 py-2 text-[11px]"
        style={{ borderColor: "rgba(255,255,255,.12)" }}
      >
        <p className="opacity-60">
          {p(m.sidebar.directory, directorySize)}
        </p>
        <div className="mt-1 flex items-center gap-2 opacity-45">
          <ReadmeLink />
          <span aria-hidden="true">·</span>
          <GithubLink />
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 text-[13px] font-bold opacity-80">
      {icon}
      {children}
    </div>
  );
}
