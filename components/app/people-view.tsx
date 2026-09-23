"use client";

import * as React from "react";
import { ChevronLeft, HardDrive, Pencil } from "lucide-react";

import { IconButton, LqButton, TableHead } from "@/components/app/ui";
import { useI18n } from "@/lib/i18n/react";
import { isBuiltinUser, resolveUser } from "@/lib/slack/users";
import type { UserDirectory } from "@/lib/slack/types";
import { cn } from "@/lib/utils";

type Status = "directory" | "named" | "unresolved";
type Filter = "all" | Status;

const COLUMNS = "minmax(0,1.6fr) 130px minmax(0,1.3fr) 70px 120px";

/**
 * Everyone who wrote in the conversation, with where their name comes from.
 * IDs missing from the directory can be named here; the names stay on this
 * device and are used in exports.
 */
export function PeopleView({
  ids,
  scope,
  counts,
  directory,
  overrides,
  candidates,
  onSave,
  editing,
  onEditing,
  onBack,
}: {
  ids: string[];
  /** What the list covers: the conversation's or the archive's name. */
  scope: string;
  /** Messages per person; null when no conversation is open. */
  counts: Map<string, number> | null;
  directory: UserDirectory;
  overrides: Record<string, string>;
  /** Names read from a group DM's name, offered for unknown IDs. */
  candidates: string[];
  onSave: (next: Record<string, string>) => void;
  editing: string | null;
  onEditing: (id: string | null) => void;
  onBack: () => void;
}) {
  const { m, fmt } = useI18n();
  const [filter, setFilter] = React.useState<Filter>("all");
  const [draft, setDraft] = React.useState("");

  const statusOf = (id: string): Status =>
    directory[id] || isBuiltinUser(id) ? "directory" : overrides[id] ? "named" : "unresolved";

  const rows = [...ids].sort((a, b) => {
    const rank = { unresolved: 0, named: 1, directory: 2 };
    const d = rank[statusOf(a)] - rank[statusOf(b)];
    return d || (counts ? (counts.get(b) ?? 0) - (counts.get(a) ?? 0) : 0);
  });
  const total = (s: Status) => ids.filter((id) => statusOf(id) === s).length;
  const shown = filter === "all" ? rows : rows.filter((id) => statusOf(id) === filter);

  const startEdit = (id: string) => {
    setDraft(overrides[id] ?? "");
    onEditing(id);
  };
  const save = (id: string, value: string) => {
    const next = { ...overrides };
    if (value.trim()) next[id] = value.trim();
    else delete next[id];
    onSave(next);
    onEditing(null);
  };

  // Opening the tab from a "name this person" shortcut starts the edit.
  const [started, setStarted] = React.useState<string | null>(null);
  if (editing && editing !== started) {
    setStarted(editing);
    setDraft(overrides[editing] ?? "");
  }

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: `${m.people.all} · ${ids.length}` },
    { value: "unresolved", label: `${m.people.unresolved} · ${total("unresolved")}` },
    { value: "named", label: `${m.people.named} · ${total("named")}` },
    { value: "directory", label: `${m.people.fromDirectory} · ${total("directory")}` },
  ];

  return (
    <div className="min-h-0 flex-1 overflow-auto bg-bg">
      <div className="flex max-w-[1000px] flex-col gap-[18px] px-4 py-6 sm:px-10 sm:py-8">
        <div className="flex items-start gap-2">
          <IconButton className="md:hidden" onClick={onBack} aria-label={m.common.back}>
            <ChevronLeft className="!size-[18px]" />
          </IconButton>
          <div className="min-w-0">
            <h1 className="m-0 text-[20px] font-semibold">
              {m.people.title}
              <span className="ml-2 text-[14px] font-normal text-fg-3">{scope}</span>
            </h1>
            <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-fg-2">
              <HardDrive className="size-[13px] shrink-0 text-fg-3" />
              {m.people.subtitle}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => {
            const on = filter === c.value;
            return (
              <button
                key={c.value}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(c.value)}
                className={cn(
                  "h-7 rounded-[14px] border px-2.5 text-[12.5px] font-medium",
                  on
                    ? "border-brand bg-brand-soft text-brand-text"
                    : "border-border-strong bg-surface text-fg-2 hover:text-fg",
                )}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        <div className="rounded-[10px] border border-border bg-surface">
          <div className="overflow-hidden rounded-t-[10px]">
            <TableHead columns={COLUMNS}>
              <span>{m.people.colPerson}</span>
              <span>{m.people.colId}</span>
              <span>{m.people.colEmail}</span>
              <span className="text-right">{m.people.colMessages}</span>
              <span>{m.people.colStatus}</span>
            </TableHead>
          </div>
          {shown.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-fg-3">{m.people.none}</p>
          ) : null}
          {shown.map((id) => {
            const user = resolveUser(id, directory, overrides);
            const status = statusOf(id);
            const isEditing = editing === id;
            return (
              <div
                key={id}
                className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3.5 border-b border-border px-4 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.6fr)_130px_minmax(0,1.3fr)_70px_120px]"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="grid size-7 shrink-0 place-items-center rounded-[6px] font-read text-[11px] font-bold text-white"
                    style={{ background: user.color }}
                  >
                    {user.initials}
                  </span>
                  {isEditing ? (
                    <div className="relative min-w-0 flex-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") save(id, draft);
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            onEditing(null);
                          }
                        }}
                        placeholder={m.people.placeholder}
                        aria-label={`${m.people.name} — ${id}`}
                        className="h-8 w-full rounded-[6px] border border-focus bg-surface px-2.5 text-[13px] text-fg shadow-[0_0_0_3px_var(--accent-soft)] outline-none"
                      />
                      <div className="absolute top-[38px] left-0 z-10 w-[340px] max-w-[80vw] rounded-[8px] border border-border bg-surface p-1 shadow-3">
                        {candidates.length > 0 ? (
                          <>
                            <div className="px-2.5 pt-1.5 pb-1 text-[11.5px] font-semibold text-fg-3">
                              {m.people.suggestions}
                            </div>
                            {candidates.map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => save(id, c)}
                                className="flex w-full flex-col gap-px rounded-[5px] px-2.5 py-[7px] text-left hover:bg-surface-2"
                              >
                                <span className="text-[13px] font-medium">{c}</span>
                                <span className="text-[12px] text-fg-3">{m.people.fromGroupName}</span>
                              </button>
                            ))}
                          </>
                        ) : null}
                        <div
                          className={cn(
                            "flex justify-end gap-1.5 px-1.5 pt-1.5 pb-1",
                            candidates.length > 0 && "mt-1 border-t border-border",
                          )}
                        >
                          <LqButton variant="ghost" size="sm" className="h-7" onClick={() => onEditing(null)}>
                            {m.common.cancel}
                          </LqButton>
                          <LqButton size="sm" className="h-7" onClick={() => save(id, draft)}>
                            {m.common.save}
                          </LqButton>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="flex min-w-0 flex-col">
                        <span
                          className={cn(
                            "truncate font-medium",
                            status === "unresolved" && "font-mono text-[12.5px] text-fg-2",
                          )}
                        >
                          {user.name}
                        </span>
                        <span className="font-mono text-[11px] text-fg-3 md:hidden">{id}</span>
                      </span>
                      {status === "unresolved" ? (
                        <LqButton variant="secondary" size="sm" className="h-[26px] px-2 text-[12px]" onClick={() => startEdit(id)}>
                          <Pencil />
                          {m.people.name}
                        </LqButton>
                      ) : status === "named" ? (
                        <IconButton
                          className="size-6"
                          aria-label={m.people.rename}
                          title={m.people.rename}
                          onClick={() => startEdit(id)}
                        >
                          <Pencil className="!size-3" />
                        </IconButton>
                      ) : null}
                    </>
                  )}
                </div>
                <span className="hidden font-mono text-[12px] text-fg-2 md:inline">{id}</span>
                <span className="hidden truncate text-[13px] text-fg-2 md:inline">{user.email ?? "—"}</span>
                <span className="hidden text-right text-[13px] tabular-nums md:inline">
                  {counts ? fmt.number(counts.get(id) ?? 0) : "—"}
                </span>
                <span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-[10px] px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
                      status === "directory" && "bg-success-soft text-success",
                      status === "named" && "bg-brand-soft text-brand-text",
                      status === "unresolved" && "bg-warning-soft text-warning",
                    )}
                  >
                    {status === "directory"
                      ? m.people.statusDirectory
                      : status === "named"
                        ? m.people.statusNamed
                        : m.people.statusUnresolved}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
