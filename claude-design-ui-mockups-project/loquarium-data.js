// Sample content + Slack-mrkdwn → HTML formatter shared by the app, the export page and message rows.
export const PEOPLE = {
  U01: { name: 'Sarah Lemaire', email: 'sarah.lemaire@acme.fr', color: '#9b4d3a', title: 'Cheffe de produit' },
  U02: { name: 'Marc Dubois', email: 'marc.dubois@acme.fr', color: '#2f6a8a', title: 'Responsable mobile' },
  U03: { name: 'Inès Haddad', email: 'ines.haddad@acme.fr', color: '#a13a5f', title: 'Juriste' },
  U04: { name: 'Tom Becker', email: 'tom.becker@acme.fr', color: '#3c7457', title: 'Ingénieur plateforme' },
  B01: { name: 'Deploy Bot', bot: true, color: '#56606e' },
  U09MJ41Q0RJ: { unresolved: true },
  U08KQ22ZP1C: { unresolved: true },
  U07TT93LM4D: { unresolved: true },
};
export const SUGGEST = {
  U09MJ41Q0RJ: [
    { name: 'Julie Moreau', why: 'julie.moreau@acme.fr · auteure de 14 messages dans #support-clients' },
    { name: 'Jules Morel', why: 'cité par ce nom dans #general, le 3 mars' },
  ],
  U08KQ22ZP1C: [{ name: 'Nadia Benali', why: 'nadia.benali@acme.fr · services généraux' }],
  U07TT93LM4D: [{ name: 'Paul Girard', why: 'paul.girard@acme.fr · direction' }],
};
export const CONVS = [
  { id: 'C0AE23W6W0J', kind: 'public', name: 'general', members: 248, total: 3 },
  { id: 'C04PL7K2QXA', kind: 'public', name: 'product-launch', members: 18, total: 12 },
  { id: 'C06INC12M03', kind: 'private', name: 'incident-2026-03-12', members: 9, total: 5 },
  { id: 'C03DR8K1ZTQ', kind: 'public', name: 'design-reviews', archived: true, total: 0 },
  { id: 'D07SLM4R2QA', kind: 'dm', name: 'Sarah Lemaire', with: 'U01', total: 2 },
  { id: 'G05MIT7TB9K', kind: 'group', name: 'Marc, Inès, Tom', total: 2 },
];
export const DAYS = {
  '2026-01-12': 'Lundi 12 janvier 2026', '2026-02-10': 'Mardi 10 février 2026', '2026-02-11': 'Mercredi 11 février 2026',
  '2026-02-12': 'Jeudi 12 février 2026', '2026-02-20': 'Vendredi 20 février 2026', '2026-03-12': 'Jeudi 12 mars 2026', '2026-03-13': 'Vendredi 13 mars 2026',
};
const PL = 'C04PL7K2QXA';
export const MESSAGES = {
  C04PL7K2QXA: [
    { id: 'm1', u: 'U01', day: '2026-02-10', ts: '08:29', text: "Bonjour à tous 👋 Le lancement d'*Atlas 2* est confirmé pour le *jeudi 12 mars*. Ce canal devient le fil de référence : décisions, livrables et validations.", reactions: [{ e: '👍', who: ['U02', 'U03', 'U04'] }, { e: '🎉', who: ['U02', 'U04'] }] },
    { id: 'm2', u: 'U01', day: '2026-02-10', ts: '08:31', text: "Récapitulatif du plan :\n• Gel des fonctionnalités le _2 mars_\n• Recette interne du 3 au 6 mars\n• Communication clients le 10 mars\n> Rappel : aucune annonce publique avant la validation du service juridique.", thread: 'T1' },
    { id: 'm3', u: 'U02', day: '2026-02-10', ts: '09:02', text: '<@U03> peux-tu partager la dernière version du dossier de conformité ? On en a besoin pour le comité de jeudi.' },
    { id: 'm4', u: 'U03', day: '2026-02-10', ts: '09:14', text: 'Voici la v3, relue par le juridique. Les changements sont en section 4.', edited: true, files: [{ kind: 'doc', name: 'Dossier-conformite-Atlas2-v3.pdf', type: 'PDF', size: '2,4 Mo' }] },
    { id: 'm5', u: 'U03', day: '2026-02-10', ts: '09:16', text: 'Et le calendrier détaillé : <https://docs.acme.fr/atlas-2/calendrier|docs.acme.fr/atlas-2/calendrier>', preview: { service: 'Acme Docs', title: 'Atlas 2 — Calendrier de lancement', text: 'Jalons, responsables et dépendances pour le lancement du 12 mars 2026. Mis à jour le 9 février.', url: 'https://docs.acme.fr/atlas-2/calendrier' } },
    { id: 'm6', u: 'U04', day: '2026-02-11', ts: '14:03', text: "J'ai préparé le script de migration des comptes, relectures bienvenues avant ~vendredi~ jeudi :", files: [{ kind: 'snippet', name: 'migrate_accounts.py', type: 'Python', size: '1 Ko', lines: ['def migrate(account):', '    plan = LEGACY_PLANS[account.plan]', '    account.plan = plan.successor', '    account.migrated_at = now()', '    return account.save()'] }] },
    { id: 'm7', u: 'U09MJ41Q0RJ', day: '2026-02-11', ts: '14:20', text: "Côté support, il nous faudra la FAQ au plus tard le 9 mars pour former l'équipe." },
    { id: 'm8', u: 'B01', day: '2026-02-11', ts: '14:22', text: 'Déploiement `atlas-web@2.0.0-rc.4` en préproduction terminé en 4 min 12 s. ✅' },
    { id: 'm9', u: 'U02', day: '2026-02-12', ts: '10:00', text: '', huddle: { dur: '32 min', people: ['U02', 'U01', 'U03'] } },
    { id: 'm10', u: 'U01', day: '2026-02-12', ts: '10:40', text: "Décisions du huddle :\n1. Date de lancement maintenue au *12 mars*\n2. La recette mobile passe au 4 mars\n3. <@U03> valide la FAQ avec le support\n```\nrelease: 2026-03-12\nfreeze:  2026-03-02\nqa:      2026-03-04 → 2026-03-06\n```\n<!here> merci de confirmer d'ici vendredi.", reactions: [{ e: '👀', who: ['U04'] }] },
    { id: 'm11', u: 'U04', day: '2026-02-12', ts: '10:52', text: 'Validé de mon côté pour la recette le 4.', orphan: true },
    { id: 'm12', u: 'U02', day: '2026-02-12', ts: '11:05', text: "Maquette finale de la page d'accueil :", files: [{ kind: 'image', name: 'maquette-accueil-atlas2.png', type: 'PNG', size: '1,1 Mo' }] },
  ],
  C0AE23W6W0J: [
    { id: 'g1', u: 'U01', day: '2026-01-12', ts: '09:12', text: "Bienvenue à <@U04> qui rejoint l'équipe plateforme !", reactions: [{ e: '🎉', who: ['U02', 'U03', 'U08KQ22ZP1C'] }] },
    { id: 'g2', u: 'U08KQ22ZP1C', day: '2026-01-12', ts: '11:40', text: "Rappel : l'inventaire du matériel est à rendre avant vendredi." },
    { id: 'g3', u: 'U07TT93LM4D', day: '2026-02-20', ts: '16:05', text: 'Les bureaux seront fermés le vendredi 1er mai.' },
  ],
  C06INC12M03: [
    { id: 'i1', u: 'B01', day: '2026-03-12', ts: '09:14', text: 'Alerte : taux d’erreur 5xx à 7,4 % sur `api-gateway` (seuil 2 %).' },
    { id: 'i2', u: 'U02', day: '2026-03-12', ts: '09:16', text: '<!here> incident déclaré, on centralise tout ici.' },
    { id: 'i3', u: 'U04', day: '2026-03-12', ts: '09:18', text: 'Je regarde. Rollback en préparation :\n```\nkubectl rollout undo deploy/api-gateway -n prod\n```' },
    { id: 'i4', u: 'B01', day: '2026-03-12', ts: '09:31', text: 'Rollback terminé, taux d’erreur revenu à 0,3 %. ✅' },
    { id: 'i5', u: 'U01', day: '2026-03-13', ts: '17:02', text: 'Post-mortem planifié lundi. <@U04> merci pour la réactivité.', reactions: [{ e: '👍', who: ['U02', 'U04'] }] },
  ],
  D07SLM4R2QA: [
    { id: 'd1', u: 'U01', day: '2026-02-12', ts: '18:10', text: 'Tu peux relire le communiqué avant envoi demain matin ?' },
    { id: 'd2', u: 'U01', day: '2026-02-12', ts: '18:11', text: 'Version _quasi_ finale, il reste le paragraphe prix.' },
  ],
  G05MIT7TB9K: [
    { id: 'x1', u: 'U02', day: '2026-02-11', ts: '12:30', text: 'Déjeuner de lancement le 12 mars ?' },
    { id: 'x2', u: 'U03', day: '2026-02-11', ts: '12:34', text: 'Partante 👍' },
  ],
};
export const THREADS = {
  T1: { conv: PL, root: 'm2', last: '10 févr. 2026, 10:12', replies: [
    { id: 'r1', u: 'U02', day: '2026-02-10', ts: '08:45', text: 'Le 2 mars me paraît serré pour l’équipe mobile.' },
    { id: 'r2', u: 'U03', day: '2026-02-10', ts: '09:10', text: 'Juridique d’accord sur le principe. Je confirme la date par écrit demain.' },
    { id: 'r3', u: 'U04', day: '2026-02-10', ts: '10:12', text: 'On peut décaler la recette mobile au 4 si besoin.' },
  ] },
};
export const CATALOG = [
  { kind: 'public', name: 'general', id: 'C0AE23W6W0J', members: 248, member: true },
  { kind: 'public', name: 'product-launch', id: 'C04PL7K2QXA', members: 18, member: true },
  { kind: 'private', name: 'incident-2026-03-12', id: 'C06INC12M03', members: 9, member: true },
  { kind: 'public', name: 'design-reviews', id: 'C03DR8K1ZTQ', archived: true, member: true },
  { kind: 'public', name: 'support-clients', id: 'C02SUP44K9L', members: 64, member: true },
  { kind: 'public', name: 'rh-annonces', id: 'C01RHA9PQ2M', members: 231, member: true },
  { kind: 'private', name: 'juridique-contrats', id: 'C05JUR73XBV', members: 6, member: true },
  { kind: 'dm', name: 'Sarah Lemaire', uid: 'U01SL4R2QA7', id: 'D07SLM4R2QA', member: true },
  { kind: 'dm', name: 'U09MJ41Q0RJ', uid: 'U09MJ41Q0RJ', id: 'D08UNK55Z1P', member: true, unresolved: true },
  { kind: 'group', name: 'Marc, Inès, Tom', id: 'G05MIT7TB9K', members: 4, member: true },
  { kind: 'public', name: 'marketing', id: 'C03MKT55N1R', members: 27 },
  { kind: 'public', name: 'ventes-emea', id: 'C04VEM81D6S', members: 42 },
  { kind: 'private', name: 'comite-direction', id: 'C01CDR20XK4', members: 7 },
];
export const ARCHIVES = [
  { id: 'acme', name: 'acme', initial: 'A', source: 'Connexion Slack', sourceIcon: 'icon-plug', sub: 'acme.slack.com', range: '12 janv. → 13 mars 2026', ch: '6', msgs: '18 402', size: '142 Mo', opened: 'il y a 2 h' },
  { id: 'hold', name: 'acme — conservation 2025', initial: 'A', source: 'Export ZIP', sourceIcon: 'icon-file-archive', sub: 'acme-export-2025.zip', range: '2 janv. → 31 déc. 2025', ch: '12', msgs: '96 118', size: '154 Mo', opened: 'hier' },
  { id: 'rh', name: 'Enquête RH — dossier 14', initial: 'E', source: 'Fichiers JSON', sourceIcon: 'icon-file-json', sub: '3 fichiers .json', range: '4 → 28 nov. 2025', ch: '3', msgs: '1 204', size: '16 Mo', opened: '12 sept.' },
];
export const RECENTS = [
  { conv: 'C04PL7K2QXA', icon: 'icon-hash', name: 'product-launch', archive: 'acme', when: 'il y a 2 h', meta: '12 messages · 10 → 12 févr. 2026' },
  { conv: 'D07SLM4R2QA', icon: 'icon-user', name: 'Sarah Lemaire', archive: 'acme', when: 'hier', meta: '2 messages · 12 févr. 2026' },
  { conv: 'C06INC12M03', icon: 'icon-lock', name: 'incident-2026-03-12', archive: 'acme', when: 'lundi', meta: '5 messages · 12 → 13 mars 2026' },
];
export const EXPORTS = [
  { file: 'acme_product-launch_2026-02-10_2026-02-12.html', fmt: 'HTML', scope: '#product-launch', archive: 'acme', date: '13 mars 2026, 17:40', size: '1,2 Mo' },
  { file: 'acme_incident-2026-03-12.json', fmt: 'JSON', scope: '#incident-2026-03-12', archive: 'acme', date: '13 mars 2026, 11:02', size: '84 Ko' },
  { file: 'dossier14_marc-ines-tom.html', fmt: 'HTML', scope: 'Marc, Inès, Tom', archive: 'Enquête RH — dossier 14', date: '28 nov. 2025, 16:15', size: '640 Ko' },
];

export function person(id, names) {
  const p = PEOPLE[id] || { unresolved: true };
  const fixed = names && names[id];
  if (p.unresolved && !fixed) return { id, name: id, initials: '?', color: '#8b929c', unresolved: true };
  const name = fixed || p.name;
  const initials = name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  return { id, name, initials, color: p.color || '#6b7482', email: p.email || '', bot: !!p.bot, unresolved: false, fixed: !!fixed };
}
const chName = id => (CONVS.find(c => c.id === id) || { name: id }).name;
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const S = {
  m: 'background:var(--c-mention-bg);color:var(--c-mention-fg);padding:0 2px;border-radius:3px',
  h: 'background:var(--c-here-bg);color:var(--c-here-fg);padding:0 2px;border-radius:3px',
  a: 'color:var(--c-link);text-decoration:none',
  code: 'font-family:var(--font-mono);font-size:12px;padding:1px 4px;border-radius:3px;background:var(--c-code-bg);border:1px solid var(--c-code-border);color:var(--c-code-fg)',
  pre: 'font-family:var(--font-mono);font-size:12px;line-height:1.55;margin:4px 0;padding:8px 10px;border-radius:4px;background:var(--c-code-bg);border:1px solid var(--c-code-border);color:var(--c-text);white-space:pre-wrap;overflow-wrap:anywhere',
  q: 'border-left:4px solid var(--c-quote);padding-left:12px;margin:2px 0',
  list: 'margin:2px 0;padding-left:24px',
  mark: 'background:var(--c-hl);color:var(--c-hl-fg);border-radius:2px;padding:0 1px',
};
function inline(s, names) {
  return esc(s)
    .replace(/&lt;@(\w+)&gt;/g, (_, id) => `<span style="${S.m}">@${esc(person(id, names).name)}</span>`)
    .replace(/&lt;#(\w+)&gt;/g, (_, id) => `<span style="${S.m}">#${esc(chName(id))}</span>`)
    .replace(/&lt;!here&gt;/g, `<span style="${S.h}">@here</span>`)
    .replace(/&lt;(https?:\/\/[^|]+?)\|(.+?)&gt;/g, (_, u, t) => `<a href="${u}" style="${S.a}">${t}</a>`)
    .replace(/`([^`]+)`/g, `<code style="${S.code}">$1</code>`)
    .replace(/\*([^*\n]+)\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1<i>$2</i>')
    .replace(/~([^~\n]+)~/g, '<s>$1</s>');
}
function lines(t, names) {
  const out = []; let buf = null;
  const flush = () => { if (!buf) return; const tag = buf.k === 'ol' ? 'ol' : 'ul'; out.push(buf.k === 'q' ? `<div style="${S.q}">${buf.items.join('<br>')}</div>` : buf.k === 'p' ? `<div>${buf.items.join('<br>')}</div>` : `<${tag} style="${S.list}">${buf.items.map(i => `<li>${i}</li>`).join('')}</${tag}>`); buf = null; };
  t.split('\n').forEach(l => {
    let k = 'p', c = l;
    if (/^> /.test(l)) { k = 'q'; c = l.slice(2); } else if (/^[•-] /.test(l)) { k = 'ul'; c = l.slice(2); } else if (/^\d+\. /.test(l)) { k = 'ol'; c = l.replace(/^\d+\. /, ''); }
    if (!l.trim() && k === 'p') { flush(); return; }
    if (!buf || buf.k !== k) { flush(); buf = { k, items: [] }; }
    buf.items.push(inline(c, names));
  });
  flush(); return out.join('');
}
export function rich(text, q, names) {
  if (!text) return '';
  let html = text.split('```').map((p, i) => i % 2 ? `<pre style="${S.pre}">${esc(p.replace(/^\n|\n$/g, ''))}</pre>` : lines(p.replace(/^\n|\n$/g, ''), names)).join('');
  if (q) {
    const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    html = ('<span>' + html + '</span>').replace(/>([^<]+)</g, (m, t) => '>' + t.replace(re, x => `<mark style="${S.mark}">${x}</mark>`) + '<');
  }
  return html;
}
export function plain(m, names) {
  return (m.text || '').replace(/<@(\w+)>/g, (_, id) => '@' + person(id, names).name).replace(/<!here>/g, '@here').replace(/<[^|>]+\|([^>]+)>/g, '$1').replace(/[*_~`]/g, '').toLowerCase();
}
const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const MON = { '01': 'janv.', '02': 'févr.', '03': 'mars' };
export function enrich(m, grouped, ql, o) {
  const p = person(m.u, o.names);
  const th = m.thread && THREADS[m.thread];
  const [y, mo, d] = m.day.split('-');
  const avatars = th ? [...new Set(th.replies.map(r => r.u))].slice(0, 5).map(u => { const x = person(u, o.names); return { initials: x.initials, color: x.color, name: x.name }; }) : [];
  return {
    id: m.id, full: !grouped, grouped: !!grouped, name: p.name, initials: p.initials, color: p.color, email: p.email,
    showEmail: !!(o.showEmail && p.email), bot: p.bot, unresolved: p.unresolved,
    time: m.ts, fullTime: `${DAYS[m.day]} à ${m.ts}`, shortDate: `${+d} ${MON[mo]} ${y}`,
    html: rich(m.text, ql, o.names), hasText: !!m.text, edited: !!m.edited,
    reactions: (m.reactions || []).map(r => ({ e: r.e, n: r.who.length, title: r.who.map(u => person(u, o.names).name).join(', ') + ' ' + (r.who.length > 1 ? 'ont' : 'a') + ' réagi avec ' + r.e })),
    hasReactions: !!(m.reactions && m.reactions.length),
    files: (m.files || []).map(f => ({ ...f, isImage: f.kind === 'image', isDoc: f.kind === 'doc', isSnippet: f.kind === 'snippet', badge: f.type.slice(0, 4).toUpperCase(), meta: `${f.type} · ${f.size}` })),
    hasFiles: !!(m.files && m.files.length),
    preview: m.preview || null, hasPreview: !!m.preview,
    huddle: m.huddle ? { dur: m.huddle.dur, people: m.huddle.people.map(u => person(u, o.names)), names: m.huddle.people.map(u => person(u, o.names).name).join(', ') } : null,
    hasHuddle: !!m.huddle,
    thread: th ? { label: `${th.replies.length} réponses`, last: `Dernière réponse le ${th.last}`, avatars } : null,
    hasThread: !!th && !o.inThread, onThread: th && o.onThread ? () => o.onThread(m.thread) : null,
    orphan: !!m.orphan,
  };
}
export function buildRows(convId, o) {
  const src = MESSAGES[convId] || [];
  const ql = (o.q || '').trim().toLowerCase();
  const filtering = !!ql || !!o.author;
  const list = src.filter(m => (!o.author || m.u === o.author) && (!ql || plain(m, o.names).includes(ql)));
  const rows = []; let pd = null, prev = null;
  list.forEach(m => {
    if (m.day !== pd) { rows.push({ key: 'd' + m.day, divider: true, isMsg: false, label: DAYS[m.day] }); pd = m.day; prev = null; }
    const grouped = !filtering && prev && prev.u === m.u && mins(m.ts) - mins(prev.ts) <= 5 && !m.orphan && !prev.huddle;
    rows.push({ key: m.id, divider: false, isMsg: true, msg: enrich(m, grouped, ql, o) });
    prev = m;
  });
  const participants = [...new Set(src.map(m => m.u))];
  return { rows, total: src.length, shown: list.length, filtering, participants, first: src[0], last: src[src.length - 1] };
}
export function threadView(tid, o) {
  const th = THREADS[tid]; if (!th) return null;
  const root = MESSAGES[th.conv].find(m => m.id === th.root);
  const ql = (o.q || '').trim().toLowerCase();
  return { conv: chName(th.conv), count: `${th.replies.length} réponses`, root: enrich(root, false, ql, { ...o, inThread: true }), replies: th.replies.map(r => ({ key: r.id, msg: enrich(r, false, ql, { ...o, inThread: true }) })) };
}
export function counts(convId) { return (MESSAGES[convId] || []).reduce((a, m) => (a[m.u] = (a[m.u] || 0) + 1, a), {}); }
