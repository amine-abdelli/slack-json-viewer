"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChevronRight,
  FileOutput,
  Import,
  Library,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Sun,
  Upload,
} from "lucide-react";

import { LanguageSwitcher } from "@/components/slack/language-switcher";
import { IconButton } from "@/components/app/ui";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LibraryView } from "@/components/app/library-view";
import { ImportView } from "@/components/app/import-view";
import { ArchiveView } from "@/components/app/archive-view";
import { ExportsView } from "@/components/app/exports-view";
import { SettingsView } from "@/components/app/settings-view";
import { WelcomeView } from "@/components/app/welcome-view";
import { useI18n } from "@/lib/i18n/react";
import { useRoute, type Route } from "@/lib/app/route";
import { readExports, type ExportRecord } from "@/lib/app/exports-history";
import { listArchives, type Archive } from "@/lib/library/store";
import { archiveName, conversationTitle } from "@/lib/library/summary";
import { fetchStatus } from "@/lib/slack/bridge-client";
import type { BridgeStatus } from "@/lib/slack/bridge-types";
import { resolveUser } from "@/lib/slack/users";
import type { UserDirectory } from "@/lib/slack/types";
import { cn } from "@/lib/utils";

const LS_DIRECTORY = "slack-viewer:directory";
const LS_DIRECTORY_NAME = "slack-viewer:directory-name";
const LS_OVERRIDES = "slack-viewer:overrides";
const LS_PREFS = "slack-viewer:prefs";
const LS_RAIL = "loquarium:rail-expanded";

/** Reads a JSON value from localStorage; returns the fallback when unavailable. */
function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  } catch {
    /* full or blocked: kept in memory only */
  }
}

/**
 * Loquarium: the application shell (rail, header) and its screens. Holds what
 * every screen shares — the library, the people directory, preferences, the
 * Slack bridge's status — and routes between screens with the URL hash.
 */
export function App() {
  const i18n = useI18n();
  const { m } = i18n;
  const [route, navigate] = useRoute();

  const [bridge, setBridge] = React.useState<BridgeStatus | null>(null);
  const [archives, setArchives] = React.useState<Archive[] | null>(null);
  const [directory, setDirectory] = React.useState<UserDirectory>(() =>
    readStorage<UserDirectory>(LS_DIRECTORY, {}),
  );
  const [directoryName, setDirectoryName] = React.useState<string | null>(() =>
    readStorage<string | null>(LS_DIRECTORY_NAME, null),
  );
  const [overrides, setOverrides] = React.useState<Record<string, string>>(() =>
    readStorage<Record<string, string>>(LS_OVERRIDES, {}),
  );
  const [prefs] = React.useState(() =>
    readStorage<{ dark?: boolean; showEmail?: boolean }>(LS_PREFS, {}),
  );
  const [dark, setDark] = React.useState(prefs.dark === true);
  const [showEmail, setShowEmail] = React.useState(prefs.showEmail !== false);
  const [exportsList, setExportsList] = React.useState<ExportRecord[]>(readExports);
  const [exportOpen, setExportOpen] = React.useState(false);
  /** The rail shows its labels; otherwise icons only, named by a tooltip. */
  const [railExpanded, setRailExpanded] = React.useState(() => readStorage(LS_RAIL, false));
  const toggleRail = React.useCallback(() => {
    setRailExpanded((v) => {
      writeStorage(LS_RAIL, !v);
      return !v;
    });
  }, []);

  /** Files dropped or picked anywhere, handed to the import screen. */
  const [pendingFiles, setPendingFiles] = React.useState<File[] | null>(null);
  const [dragging, setDragging] = React.useState(false);
  const dragDepth = React.useRef(0);
  const fileInput = React.useRef<HTMLInputElement>(null);

  /* ------------------------------------------------------------- loading */

  const refreshArchives = React.useCallback(async () => {
    const list = await listArchives();
    setArchives(list);
    return list;
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void listArchives().then((list) => {
      if (!cancelled) setArchives(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void fetchStatus(controller.signal).then((next) => {
      if (!controller.signal.aborted) setBridge(next);
    });
    return () => controller.abort();
  }, []);

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = dark ? "dark" : "light";
    root.classList.toggle("dark", dark);
    writeStorage(LS_PREFS, { dark, showEmail });
  }, [dark, showEmail]);

  /* ----------------------------------------------------------- directory */

  /** New people are added to those already known; a newer entry wins. */
  const applyDirectory = React.useCallback((dir: UserDirectory, name: string) => {
    setDirectory((prev) => {
      const next = { ...prev, ...dir };
      writeStorage(LS_DIRECTORY, next);
      return next;
    });
    setDirectoryName(name);
    writeStorage(LS_DIRECTORY_NAME, name);
  }, []);

  const clearDirectory = React.useCallback(() => {
    setDirectory({});
    setDirectoryName(null);
    writeStorage(LS_DIRECTORY, null);
    writeStorage(LS_DIRECTORY_NAME, null);
  }, []);

  const saveOverrides = React.useCallback((next: Record<string, string>) => {
    setOverrides(next);
    writeStorage(LS_OVERRIDES, next);
  }, []);

  /* --------------------------------------------------------------- files */

  const openFiles = React.useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setPendingFiles(files);
      navigate({ name: "import" });
    },
    [navigate],
  );

  const pickFiles = React.useCallback(() => fileInput.current?.click(), []);

  /* ------------------------------------------------------------- routing */

  const currentArchive =
    route.name === "archive" ? archives?.find((a) => a.id === route.archiveId) : undefined;
  const nameOf = React.useCallback(
    (id: string) => resolveUser(id, directory, overrides).name,
    [directory, overrides],
  );
  const currentConversation =
    route.name === "archive" && currentArchive
      ? currentArchive.conversations.find((c) => c.id === route.conversationId)
      : undefined;

  const go = (r: Route) => () => navigate(r);
  const library: Route = { name: "library" };

  type Crumb = { label: string; go?: () => void };
  let crumbs: Crumb[] = [];
  let primary: { label: string; icon: React.ReactNode; go: () => void } | null = null;

  switch (route.name) {
    case "library":
      crumbs = [{ label: m.app.nav.library }];
      primary = { label: m.app.importAction, icon: <Import />, go: go({ name: "import" }) };
      break;
    case "import":
      crumbs = [{ label: m.app.nav.library, go: go(library) }, { label: m.app.nav.import }];
      break;
    case "archive":
      crumbs = [
        { label: m.app.nav.library, go: go(library) },
        {
          label: currentArchive ? archiveName(currentArchive, m.app.localFiles) : "…",
          go: currentConversation
            ? go({ name: "archive", archiveId: route.archiveId, tab: "conversations" })
            : undefined,
        },
      ];
      if (currentConversation) {
        crumbs.push({ label: conversationTitle(currentConversation, nameOf) });
        primary = { label: m.app.exportAction, icon: <FileOutput />, go: () => setExportOpen(true) };
      } else {
        primary = { label: m.app.importAction, icon: <Import />, go: go({ name: "import" }) };
      }
      break;
    case "exports":
      crumbs = [{ label: m.app.nav.exports }];
      primary = { label: m.app.importAction, icon: <Import />, go: go({ name: "import" }) };
      break;
    case "settings":
      crumbs = [{ label: m.app.nav.settings }];
      break;
  }
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2].go : undefined;

  const navItems: { key: Route["name"]; label: string; icon: React.ReactNode }[] = [
    { key: "library", label: m.app.nav.library, icon: <Library /> },
    { key: "import", label: m.app.nav.import, icon: <Import /> },
    { key: "exports", label: m.app.nav.exports, icon: <FileOutput /> },
  ];
  const isActive = (key: Route["name"]) =>
    route.name === key || (key === "library" && route.name === "archive");

  if (route.name === "welcome") {
    return (
      <div className="flex h-svh w-full overflow-hidden bg-bg text-fg">
        <WelcomeView
          archiveCount={archives ? archives.length : null}
          onStart={() =>
            navigate(archives && archives.length > 0 ? { name: "library" } : { name: "import" })
          }
        />
      </div>
    );
  }

  /* ---------------------------------------------------------------- view */

  return (
    <div
      className="relative flex h-svh w-full overflow-hidden bg-bg text-fg"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        openFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <nav
        aria-label={m.app.mainNav}
        className={cn(
          "hidden shrink-0 flex-col gap-1 border-r border-border bg-rail py-3 transition-[width] duration-150 sm:flex",
          railExpanded ? "w-[208px] items-stretch px-2" : "w-14 items-center",
        )}
      >
        <button
          type="button"
          onClick={go(library)}
          aria-label="Loquarium"
          className={cn(
            "mb-3.5 flex items-center gap-2.5 rounded-[7px]",
            railExpanded && "px-[5px]",
          )}
        >
          <span className="grid size-[30px] shrink-0 place-items-center rounded-[7px] bg-brand text-[15px] leading-none font-semibold text-brand-fg">
            L
          </span>
          {railExpanded ? (
            <span className="text-[15px] font-semibold tracking-[-.01em]">Loquarium</span>
          ) : null}
        </button>
        {navItems.map((n) => (
          <RailButton
            key={n.key}
            label={n.label}
            expanded={railExpanded}
            active={isActive(n.key)}
            onClick={go({ name: n.key } as Route)}
          >
            {n.icon}
          </RailButton>
        ))}
        <div className="flex-1" />
        <RailButton
          label={m.app.nav.settings}
          expanded={railExpanded}
          active={route.name === "settings"}
          onClick={go({ name: "settings" })}
        >
          <Settings />
        </RailButton>
        <RailButton
          label={railExpanded ? m.app.collapseNav : m.app.expandNav}
          expanded={railExpanded}
          active={false}
          onClick={toggleRail}
          ariaExpanded={railExpanded}
        >
          {railExpanded ? <PanelLeftClose /> : <PanelLeftOpen />}
        </RailButton>
      </nav>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-surface pr-3 pl-4">
          {back ? (
            <IconButton onClick={back} aria-label={m.common.back} title={m.common.back}>
              <ArrowLeft className="!size-[18px]" />
            </IconButton>
          ) : null}
          <nav
            aria-label={m.app.breadcrumb}
            className="flex min-w-0 flex-1 items-center gap-0.5 text-[13px] text-fg-3"
          >
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <React.Fragment key={i}>
                  {i > 0 ? <ChevronRight className="size-[13px] shrink-0" /> : null}
                  {last || !c.go ? (
                    <span
                      aria-current={last ? "page" : undefined}
                      className={cn(
                        "min-w-0 truncate px-1.5 py-[3px]",
                        last ? "font-medium text-fg" : "text-fg-2",
                      )}
                    >
                      {c.label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={c.go}
                      className="rounded-[5px] px-1.5 py-[3px] whitespace-nowrap text-fg-2 hover:bg-surface-2 hover:text-fg"
                    >
                      {c.label}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
          {primary ? (
            <button
              type="button"
              onClick={primary.go}
              className="flex h-[34px] items-center gap-[7px] rounded-[6px] bg-brand px-3.5 text-[13px] font-medium whitespace-nowrap text-brand-fg hover:bg-brand-hover [&_svg]:size-[15px]"
            >
              {primary.icon}
              <span className="hidden sm:inline">{primary.label}</span>
            </button>
          ) : null}
          <IconButton
            onClick={() => setDark((v) => !v)}
            title={dark ? m.viewer.lightTheme : m.viewer.darkTheme}
            aria-label={dark ? m.viewer.lightTheme : m.viewer.darkTheme}
          >
            {dark ? <Sun /> : <Moon />}
          </IconButton>
          <LanguageSwitcher compact />
        </header>

        <div className="flex min-h-0 flex-1 flex-col">
          {route.name === "library" ? (
            <LibraryView
              archives={archives}
              nameOf={nameOf}
              onOpen={(archiveId, conversationId) =>
                navigate({ name: "archive", archiveId, conversationId, tab: "conversations" })
              }
              onImport={go({ name: "import" })}
              onPickFiles={pickFiles}
              onChanged={refreshArchives}
            />
          ) : route.name === "import" ? (
            <ImportView
              bridge={bridge}
              onBridgeChange={setBridge}
              archives={archives ?? []}
              pendingFiles={pendingFiles}
              onPendingConsumed={() => setPendingFiles(null)}
              onPickFiles={pickFiles}
              directory={directory}
              applyDirectory={applyDirectory}
              onImported={refreshArchives}
              onOpen={(archiveId, conversationId) =>
                navigate({ name: "archive", archiveId, conversationId, tab: "conversations" })
              }
            />
          ) : route.name === "archive" ? (
            <ArchiveView
              key={route.archiveId}
              archives={archives}
              route={route}
              navigate={navigate}
              directory={directory}
              directorySize={Object.keys(directory).length}
              overrides={overrides}
              onSaveOverrides={saveOverrides}
              showEmail={showEmail}
              onShowEmailChange={setShowEmail}
              dark={dark}
              exportOpen={exportOpen}
              onExportOpenChange={setExportOpen}
              onExported={setExportsList}
              onChanged={refreshArchives}
            />
          ) : route.name === "exports" ? (
            <ExportsView exports={exportsList} onCleared={() => setExportsList([])} />
          ) : (
            <SettingsView
              bridge={bridge}
              onBridgeChange={setBridge}
              dark={dark}
              onDarkChange={setDark}
              showEmail={showEmail}
              onShowEmailChange={setShowEmail}
              directorySize={Object.keys(directory).length}
              directoryName={directoryName}
              onClearDirectory={clearDirectory}
              overridesCount={Object.keys(overrides).length}
              onClearOverrides={() => saveOverrides({})}
              archives={archives}
              onLibraryChanged={refreshArchives}
            />
          )}
        </div>

        {/* Phones: the rail becomes a bottom bar. */}
        <nav
          aria-label={m.app.mainNav}
          className="grid h-[60px] shrink-0 grid-cols-4 border-t border-border bg-surface sm:hidden"
        >
          {[...navItems, { key: "settings" as const, label: m.app.nav.settings, icon: <Settings /> }].map(
            (n) => (
              <button
                key={n.key}
                type="button"
                onClick={go({ name: n.key } as Route)}
                className={cn(
                  "flex flex-col items-center justify-center gap-[3px] text-[10.5px] font-medium [&_svg]:size-[19px]",
                  isActive(n.key) ? "text-brand-text" : "text-fg-3",
                )}
              >
                {n.icon}
                {n.label}
              </button>
            ),
          )}
        </nav>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".json,.txt,.tsv,.csv"
        className="hidden"
        onChange={(e) => {
          openFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-[60] bg-scrim p-4">
          <div className="flex h-full flex-col items-center justify-center gap-2.5 rounded-[14px] border-2 border-dashed border-brand-line bg-surface p-5 text-center">
            <div className="grid size-[52px] place-items-center rounded-[12px] bg-brand-soft text-brand-text">
              <Upload className="size-6" />
            </div>
            <div className="text-[18px] font-semibold">{m.app.dropTitle}</div>
            <div className="text-[13px] text-fg-2">{m.app.dropHint}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RailButton({
  label,
  active,
  expanded,
  onClick,
  ariaExpanded,
  children,
}: {
  label: string;
  active: boolean;
  expanded: boolean;
  onClick: () => void;
  ariaExpanded?: boolean;
  children: React.ReactNode;
}) {
  const button = (
    <button
      type="button"
      aria-label={expanded ? undefined : label}
      aria-current={active ? "page" : undefined}
      aria-expanded={ariaExpanded}
      onClick={onClick}
      className={cn(
        "flex h-10 shrink-0 items-center rounded-[8px] transition-colors [&_svg]:size-[19px] [&_svg]:shrink-0",
        expanded ? "w-full gap-3 px-2.5 text-[13.5px] font-medium" : "w-10 justify-center",
        active ? "bg-brand-soft text-brand-text" : "text-fg-3 hover:bg-surface-2 hover:text-fg",
      )}
    >
      {children}
      {expanded ? <span className="truncate">{label}</span> : null}
    </button>
  );
  if (expanded) return button;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
