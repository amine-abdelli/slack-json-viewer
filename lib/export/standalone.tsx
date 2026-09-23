"use client";

import * as React from "react";

import { MessageList } from "@/components/slack/message-list";
import { INTL_TAGS } from "@/lib/i18n/config";
import { StaticI18nProvider, type I18n } from "@/lib/i18n/react";
import { resolveUser } from "@/lib/slack/users";
import type {
  ConversationMeta,
  NormalizedMessage,
  UserDirectory,
} from "@/lib/slack/types";

export interface ExportOptions {
  /** The language the page is written in — the one on screen when exporting. */
  i18n: I18n;
  meta: ConversationMeta;
  messages: NormalizedMessage[];
  directory: UserDirectory;
  overrides: Record<string, string>;
  showEmail: boolean;
  dark: boolean;
}

/* -------------------------------------------------------------------------- */
/*  CSS collection                                                             */
/* -------------------------------------------------------------------------- */

/** Reads every same-origin stylesheet currently applied to the document. */
function collectCss(): string {
  const chunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) chunks.push(rule.cssText);
    } catch {
      // cross-origin stylesheet — skipped, we ship no external CSS anyway
    }
  }
  return chunks.join("\n");
}

const FONT_OVERRIDE = `
:root{--font-lato:"Lato","Slack-Lato",-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
html,body{margin:0;padding:0}
@media print{
  .no-print{display:none!important}
  .slack-msg{break-inside:avoid}
  #slack-scroll{overflow:visible!important;height:auto!important}
}
`;

/* -------------------------------------------------------------------------- */
/*  Runtime script embedded in the exported page                               */
/* -------------------------------------------------------------------------- */

/**
 * The page's own script. Its wording comes from `window.SLACK_EXPORT_I18N`,
 * written next to it at export time: plural forms keyed by CLDR category, and
 * the language tag `Intl.PluralRules` picks them with.
 */
const RUNTIME = String.raw`
(function () {
  var I18N = window.SLACK_EXPORT_I18N;
  var rules = new Intl.PluralRules(I18N.tag);
  var numbers = new Intl.NumberFormat(I18N.tag);
  function plural(forms, n, extra) {
    var text = forms[rules.select(n)] || forms.other;
    text = text.replace('{n}', numbers.format(n));
    for (var key in (extra || {})) text = text.replace('{' + key + '}', extra[key]);
    return text;
  }

  var root = document.documentElement;
  var list = document.getElementById('slack-messages');
  // Only the main flow: thread replies live inside their root message.
  var msgs = Array.prototype.slice.call(list.querySelectorAll(':scope > [data-msg]'));
  var days = Array.prototype.slice.call(list.querySelectorAll(':scope > [data-day-divider]'));
  var search = document.getElementById('x-search');
  var author = document.getElementById('x-author');
  var count = document.getElementById('x-count');
  var themeBtn = document.getElementById('x-theme');
  var printBtn = document.getElementById('x-print');
  var topBtn = document.getElementById('x-top');
  var clearBtn = document.getElementById('x-clear');

  try {
    var saved = localStorage.getItem('slack-export-theme');
    if (saved === 'dark') root.classList.add('dark');
    if (saved === 'light') root.classList.remove('dark');
  } catch (e) {}

  function unmark(el) {
    var marks = el.querySelectorAll('mark.slack-hit-live');
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      m.replaceWith(document.createTextNode(m.textContent));
    }
    el.normalize();
  }

  function mark(el, needle) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var targets = [];
    var node;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.toLowerCase().indexOf(needle) !== -1) {
        targets.push(node);
      }
    }
    for (var i = 0; i < targets.length; i++) {
      var text = targets[i].nodeValue;
      var lower = text.toLowerCase();
      var frag = document.createDocumentFragment();
      var cursor = 0;
      var hit = lower.indexOf(needle);
      while (hit !== -1) {
        if (hit > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, hit)));
        var m = document.createElement('mark');
        m.className = 'slack-hit slack-hit-live';
        m.textContent = text.slice(hit, hit + needle.length);
        frag.appendChild(m);
        cursor = hit + needle.length;
        hit = lower.indexOf(needle, cursor);
      }
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      targets[i].parentNode.replaceChild(frag, targets[i]);
    }
  }

  function apply() {
    var q = (search.value || '').trim().toLowerCase();
    var who = author.value;
    var visible = 0;
    var shownDays = {};

    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      var ok = (!q || m.getAttribute('data-search').indexOf(q) !== -1) &&
               (!who || m.getAttribute('data-user') === who);
      m.hidden = !ok;
      unmark(m);
      if (ok) {
        visible++;
        shownDays[m.getAttribute('data-day')] = true;
        if (q.length > 1) mark(m, q);
      }
    }

    for (var j = 0; j < days.length; j++) {
      days[j].hidden = !shownDays[days[j].getAttribute('data-day-divider')];
    }

    list.classList.toggle('slack-filtering', Boolean(q || who));
    count.textContent = visible === msgs.length
      ? plural(I18N.messages, msgs.length)
      : plural(I18N.messagesFiltered, msgs.length, { shown: numbers.format(visible) });
    clearBtn.hidden = !(q || who);
  }

  /* --- thread panel ------------------------------------------------------ */

  var panel = document.getElementById('x-thread');
  var panelBody = document.getElementById('x-thread-body');
  var panelClose = document.getElementById('x-thread-close');

  function closeThread() {
    panel.hidden = true;
    panelBody.innerHTML = '';
  }

  function openThread(ts) {
    var source = list.querySelector(':scope > [data-msg][data-ts="' + ts + '"]');
    if (!source) return;
    var clone = source.cloneNode(true);
    clone.hidden = false;
    clone.setAttribute('data-grouped', 'false');
    var replies = clone.querySelector('[data-thread-replies]');
    if (replies) replies.remove();

    panelBody.innerHTML = '';
    panelBody.appendChild(clone);

    var count = replies ? replies.querySelectorAll('[data-msg]').length : 0;
    var divider = document.createElement('div');
    divider.className = 'slack-thread-divider';
    divider.textContent = plural(I18N.replies, count);
    panelBody.appendChild(divider);

    if (replies) {
      replies.hidden = false;
      panelBody.appendChild(replies);
    }
    panel.hidden = false;
    panelBody.scrollTop = 0;
  }

  list.addEventListener('click', function (e) {
    var bar = e.target.closest ? e.target.closest('[data-thread-open]') : null;
    if (!bar) return;
    openThread(bar.getAttribute('data-thread-open'));
  });
  panelClose.addEventListener('click', closeThread);

  search.addEventListener('input', apply);
  author.addEventListener('change', apply);
  clearBtn.addEventListener('click', function () {
    search.value = '';
    author.value = '';
    apply();
    search.focus();
  });
  themeBtn.addEventListener('click', function () {
    root.classList.toggle('dark');
    try {
      localStorage.setItem('slack-export-theme', root.classList.contains('dark') ? 'dark' : 'light');
    } catch (e) {}
  });
  printBtn.addEventListener('click', function () { window.print(); });
  topBtn.addEventListener('click', function () {
    document.getElementById('slack-scroll').scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); }
    if (e.key === 'Escape') {
      if (!panel.hidden) { closeThread(); return; }
      if (document.activeElement === search) { search.value = ''; apply(); }
    }
  });

  apply();
})();
`;

/* -------------------------------------------------------------------------- */
/*  Markup                                                                     */
/* -------------------------------------------------------------------------- */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toolbar(options: ExportOptions): string {
  const { i18n, meta, messages, directory, overrides } = options;
  const { m, fmt } = i18n;
  const authors = meta.participants
    .map((id) => {
      const user = resolveUser(id, directory, overrides);
      return `<option value="${escapeHtml(id)}">${escapeHtml(user.name)}</option>`;
    })
    .join("");

  const first = messages[0];
  const last = messages[messages.length - 1];
  const range =
    first && last
      ? `${fmt.full(first.date)} → ${fmt.full(last.date)}`
      : "";

  const icon =
    meta.kind === "channel"
      ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/></svg>`
      : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 1 1 8 0v4"/></svg>`;

  return `
<header class="no-print sticky top-0 z-10 flex h-[49px] shrink-0 items-center gap-3 border-b px-4" style="background:var(--slack-bg);border-color:var(--slack-border)">
  <div class="flex min-w-0 items-center gap-1.5" style="color:var(--slack-fg)">
    ${icon}
    <span class="truncate text-[18px] font-black">${escapeHtml(meta.displayName)}</span>
  </div>
  <span id="x-count" class="shrink-0 rounded-full border px-2 py-[2px] text-[11px] font-bold" style="border-color:var(--slack-border);color:var(--slack-fg-muted)"></span>
  <div class="ml-auto flex items-center gap-2">
    <input id="x-search" type="search" placeholder="${escapeHtml(m.exported.search)}" aria-label="${escapeHtml(m.exported.search)}" class="h-8 w-44 rounded-md border px-3 text-[13px] outline-none sm:w-64" style="background:var(--slack-bg);border-color:var(--slack-border);color:var(--slack-fg)" />
    <select id="x-author" class="h-8 rounded-md border px-2 text-[13px] outline-none" style="background:var(--slack-bg);border-color:var(--slack-border);color:var(--slack-fg)">
      <option value="">${escapeHtml(m.exported.allAuthors)}</option>
      ${authors}
    </select>
    <button id="x-clear" hidden class="h-8 rounded-md border px-2 text-[13px]" style="border-color:var(--slack-border);color:var(--slack-fg)">${escapeHtml(m.common.clear)}</button>
    <button id="x-theme" title="${escapeHtml(m.exported.theme)}" aria-label="${escapeHtml(m.exported.theme)}" class="flex h-8 w-8 items-center justify-center rounded-md border" style="border-color:var(--slack-border);color:var(--slack-fg)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg></button>
    <button id="x-print" title="${escapeHtml(m.exported.print)}" aria-label="${escapeHtml(m.exported.print)}" class="flex h-8 w-8 items-center justify-center rounded-md border" style="border-color:var(--slack-border);color:var(--slack-fg)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg></button>
    <button id="x-top" title="${escapeHtml(m.exported.top)}" aria-label="${escapeHtml(m.exported.top)}" class="flex h-8 w-8 items-center justify-center rounded-md border" style="border-color:var(--slack-border);color:var(--slack-fg)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
  </div>
</header>
<div class="no-print px-4 py-1 text-[11px]" style="background:var(--slack-bg);color:var(--slack-fg-muted);border-bottom:1px solid var(--slack-border-soft)">
  ${escapeHtml(range)}
</div>`;
}

/* -------------------------------------------------------------------------- */
/*  Entry point                                                                */
/* -------------------------------------------------------------------------- */

export async function buildStandaloneHtml(options: ExportOptions): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server.browser");

  const { i18n } = options;
  const { m } = i18n;

  const body = renderToStaticMarkup(
    <StaticI18nProvider value={i18n}>
      <MessageList
        messages={options.messages}
        directory={options.directory}
        overrides={options.overrides}
        showEmail={options.showEmail}
        isStatic
      />
    </StaticI18nProvider>
  );

  // Only what the page's script words itself; everything else is already in
  // the markup. `<` is escaped so no message can close the script element.
  const runtimeI18n = JSON.stringify({
    tag: INTL_TAGS[i18n.locale],
    messages: m.viewer.messages,
    messagesFiltered: m.viewer.messagesFiltered,
    replies: m.thread.replies,
  }).replace(/</g, "\\u003c");

  const css = collectCss();
  const title = `${options.meta.displayName} — Slack`;

  return `<!doctype html>
<html lang="${INTL_TAGS[i18n.locale]}"${options.dark ? ' class="dark"' : ""}>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="generator" content="Slack JSON Viewer" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
<style>${FONT_OVERRIDE}</style>
</head>
<body class="${options.showEmail ? "" : "slack-hide-emails"}">
<div class="flex h-svh flex-col" style="background:var(--slack-bg);color:var(--slack-fg)">
${toolbar(options)}
<div class="flex min-h-0 flex-1">
  <main id="slack-scroll" class="slack-scroll min-w-0 flex-1 overflow-y-auto">
${body}
  </main>
  <aside id="x-thread" hidden class="no-print flex w-full max-w-[420px] shrink-0 flex-col border-l" style="border-color:var(--slack-border)">
    <header class="flex h-[49px] shrink-0 items-center gap-2 border-b px-4" style="border-color:var(--slack-border)">
      <div class="min-w-0">
        <p class="text-[15px] font-black" style="color:var(--slack-fg)">${escapeHtml(m.thread.title)}</p>
        <p class="truncate text-[11px]" style="color:var(--slack-fg-muted)">${escapeHtml(
          options.meta.displayName
        )}</p>
      </div>
      <button id="x-thread-close" title="${escapeHtml(m.thread.close)}" aria-label="${escapeHtml(m.thread.close)}" class="ml-auto flex h-8 w-8 items-center justify-center rounded-md" style="color:var(--slack-fg)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </header>
    <div id="x-thread-body" class="slack-scroll slack-thread-panel min-h-0 flex-1 overflow-y-auto py-3"></div>
  </aside>
</div>
</div>
<script>window.SLACK_EXPORT_I18N = ${runtimeI18n};</script>
<script>${RUNTIME}</script>
</body>
</html>`;
}

function download(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Saves the page; returns its size in bytes. */
export function downloadHtml(fileName: string, html: string): number {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  download(fileName, blob);
  return blob.size;
}

/** The conversation as JSON — indented, and reloadable by this viewer. Returns its size. */
export function downloadJson(fileName: string, value: unknown): number {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  download(fileName, blob);
  return blob.size;
}
