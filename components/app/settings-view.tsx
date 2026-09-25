"use client";

import * as React from "react";
import { LogOut, Plug } from "lucide-react";

import { LanguageSwitcher } from "@/components/slack/language-switcher";
import { IconButton, LqButton, PageTitle, Segmented, Switch } from "@/components/app/ui";
import { useI18n } from "@/lib/i18n/react";
import { clearLibrary, archiveBytes, type Archive } from "@/lib/library/store";
import { fetchStatus, logoutWorkspace } from "@/lib/slack/bridge-client";
import type { BridgeStatus } from "@/lib/slack/bridge-types";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5 rounded-[10px] border border-border bg-surface p-5">
      <h2 className="m-0 text-[15px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{label}</div>
        {hint ? <div className="text-[12px] text-fg-3">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsView({
  bridge,
  onBridgeChange,
  dark,
  onDarkChange,
  showEmail,
  onShowEmailChange,
  directorySize,
  directoryName,
  onClearDirectory,
  overridesCount,
  onClearOverrides,
  archives,
  onLibraryChanged,
}: {
  bridge: BridgeStatus | null;
  onBridgeChange: (status: BridgeStatus) => void;
  dark: boolean;
  onDarkChange: (value: boolean) => void;
  showEmail: boolean;
  onShowEmailChange: (value: boolean) => void;
  directorySize: number;
  directoryName: string | null;
  onClearDirectory: () => void;
  overridesCount: number;
  onClearOverrides: () => void;
  archives: Archive[] | null;
  onLibraryChanged: () => void;
}) {
  const { m, p, fmt } = useI18n();
  const conversations = archives?.reduce((s, a) => s + a.conversations.length, 0) ?? 0;
  const bytes = archives?.reduce((s, a) => s + archiveBytes(a), 0) ?? 0;

  const forget = async (workspace: string) => {
    await logoutWorkspace(workspace);
    const next = await fetchStatus();
    if (next) onBridgeChange(next);
  };

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[760px] flex-col gap-5 px-4 py-6 sm:px-10 sm:py-8">
        <PageTitle title={m.settings.title} />

        <Card title={m.settings.preferences}>
          <Row label={m.language.label}>
            <LanguageSwitcher />
          </Row>
          <Row label={m.settings.theme}>
            <Segmented
              size="sm"
              value={dark ? "dark" : "light"}
              onChange={(v) => onDarkChange(v === "dark")}
              options={[
                { value: "light", label: m.exportSheet.light },
                { value: "dark", label: m.exportSheet.dark },
              ]}
            />
          </Row>
          <Switch checked={showEmail} onChange={onShowEmailChange} label={m.viewer.showEmails} />
        </Card>

        <Card title={m.settings.data}>
          <Row
            label={m.settings.library}
            hint={p(m.settings.libraryHint, conversations, { size: fmt.size(bytes) || "0" })}
          >
            <LqButton
              variant="danger"
              size="sm"
              disabled={!conversations}
              onClick={async () => {
                if (!window.confirm(m.settings.clearLibraryConfirm)) return;
                await clearLibrary();
                onLibraryChanged();
              }}
            >
              {m.settings.clear}
            </LqButton>
          </Row>
          <Row
            label={m.settings.directory}
            hint={
              directorySize
                ? `${p(m.sidebar.directory, directorySize)}${directoryName ? ` · ${directoryName}` : ""}`
                : m.settings.directoryEmpty
            }
          >
            <LqButton variant="danger" size="sm" disabled={!directorySize} onClick={onClearDirectory}>
              {m.settings.clear}
            </LqButton>
          </Row>
          <Row label={m.settings.names} hint={p(m.settings.namesHint, overridesCount)}>
            <LqButton
              variant="danger"
              size="sm"
              disabled={!overridesCount}
              onClick={() => {
                if (window.confirm(m.settings.clearNamesConfirm)) onClearOverrides();
              }}
            >
              {m.settings.clear}
            </LqButton>
          </Row>
        </Card>

        <Card title={m.settings.connections}>
          {!bridge?.available ? (
            <p className="m-0 text-[13px] text-fg-3">{m.settings.bridgeOff}</p>
          ) : bridge.workspaces.length === 0 ? (
            <p className="m-0 text-[13px] text-fg-3">{m.settings.noConnection}</p>
          ) : (
            bridge.workspaces.map((w) => (
              <div key={w} className="flex items-center gap-3">
                <span className="grid size-8 place-items-center rounded-[7px] bg-surface-3 font-semibold uppercase">
                  {w.charAt(0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{w}</span>
                  <span className="block font-mono text-[12px] text-fg-3">{w}.slack.com</span>
                </span>
                <IconButton
                  title={m.connect.forget}
                  aria-label={`${m.connect.forget} — ${w}`}
                  className="hover:bg-danger-soft hover:text-danger"
                  onClick={() => void forget(w)}
                >
                  <LogOut />
                </IconButton>
              </div>
            ))
          )}
          <p className="m-0 flex items-center gap-1.5 text-[12px] text-fg-3">
            <Plug className="size-3" />
            {m.home.privacy}
          </p>
        </Card>

      </div>
    </main>
  );
}
