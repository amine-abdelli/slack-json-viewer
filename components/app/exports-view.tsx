"use client";

import * as React from "react";
import { FileCode2, FileJson, FileOutput, ShieldCheck } from "lucide-react";

import { LqButton, PageTitle, TableHead, Tag } from "@/components/app/ui";
import { useI18n } from "@/lib/i18n/react";
import { clearExports, type ExportRecord } from "@/lib/app/exports-history";

const COLUMNS = "minmax(0,2.4fr) 70px minmax(0,1.2fr) minmax(0,1.2fr) 150px 70px";

export function ExportsView({
  exports,
  onCleared,
}: {
  exports: ExportRecord[];
  onCleared: () => void;
}) {
  const { m, fmt } = useI18n();

  return (
    <main className="min-h-0 flex-1 overflow-auto">
      <div className="mx-auto flex max-w-[1120px] flex-col gap-5 px-4 py-6 sm:px-10 sm:py-8">
        <PageTitle title={m.exportsPage.title} subtitle={<span className="text-fg-3">{m.exportsPage.subtitle}</span>}>
          {exports.length > 0 ? (
            <LqButton
              variant="ghost"
              size="sm"
              onClick={() => {
                if (!window.confirm(m.exportsPage.clearConfirm)) return;
                clearExports();
                onCleared();
              }}
            >
              {m.exportsPage.clear}
            </LqButton>
          ) : null}
        </PageTitle>

        <div className="overflow-hidden rounded-[10px] border border-border bg-surface">
          <TableHead columns={COLUMNS}>
            <span>{m.exportsPage.colFile}</span>
            <span>{m.exportsPage.colFormat}</span>
            <span>{m.exportsPage.colScope}</span>
            <span>{m.exportsPage.colArchive}</span>
            <span>{m.exportsPage.colDate}</span>
            <span className="text-right">{m.exportsPage.colSize}</span>
          </TableHead>
          {exports.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-fg-3">
              <FileOutput className="size-6" />
              <p className="m-0 text-[13px]">{m.exportsPage.empty}</p>
            </div>
          ) : (
            exports.map((e, i) => (
              <div
                key={`${e.at}-${i}`}
                className="grid grid-cols-1 items-center gap-3.5 border-b border-border px-4 py-[11px] text-[13px] last:border-b-0 md:grid-cols-[minmax(0,2.4fr)_70px_minmax(0,1.2fr)_minmax(0,1.2fr)_150px_70px]"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="text-fg-3">
                    {e.format === "json" ? <FileJson className="size-4" /> : <FileCode2 className="size-4" />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-[12.5px]">{e.file}</span>
                    <span className="text-[12px] text-fg-3 md:hidden">
                      {e.format.toUpperCase()} · {e.scope} · {fmt.dayShort(new Date(e.at))}
                    </span>
                  </span>
                </span>
                <span className="hidden md:inline">
                  <span className="rounded-[4px] bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-fg-2 uppercase">
                    {e.format}
                  </span>
                </span>
                <span className="hidden truncate md:inline">{e.scope}</span>
                <span className="hidden truncate text-fg-2 md:inline">{e.archive}</span>
                <span className="hidden text-fg-2 tabular-nums md:inline">{fmt.dayShort(new Date(e.at))}</span>
                <span className="hidden text-right text-fg-2 tabular-nums md:inline">{fmt.size(e.bytes)}</span>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-dashed border-border-strong px-4 py-3.5">
          <ShieldCheck className="size-[18px] text-fg-3" />
          <div className="min-w-[220px] flex-1">
            <div className="text-[13px] font-semibold">{m.exportSheet.evidence}</div>
            <div className="text-[12.5px] text-fg-2">{m.exportSheet.evidenceDesc}</div>
          </div>
          <Tag>{m.app.comingSoon}</Tag>
        </div>
      </div>
    </main>
  );
}
