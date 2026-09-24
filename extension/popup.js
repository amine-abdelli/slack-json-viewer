import { CONFIG } from "./config.js";

const TEXT = {
  fr: {
    found: (n) => (n === 1 ? "1 espace Slack trouvé dans ce navigateur :" : `${n} espaces Slack trouvés dans ce navigateur :`),
    none: "Aucune session Slack trouvée. Connectez-vous à Slack sur app.slack.com dans ce navigateur, puis actualisez.",
    reading: "Lecture de votre session Slack…",
    refresh: "Actualiser",
    open: "Ouvrir Loquarium",
  },
  en: {
    found: (n) => (n === 1 ? "1 Slack workspace found in this browser:" : `${n} Slack workspaces found in this browser:`),
    none: "No Slack session found. Sign in to Slack at app.slack.com in this browser, then refresh.",
    reading: "Reading your Slack session…",
    refresh: "Refresh",
    open: "Open Loquarium",
  },
};
const t = navigator.language.toLowerCase().startsWith("fr") ? TEXT.fr : TEXT.en;

const status = document.getElementById("status");
const list = document.getElementById("teams");
const refresh = document.getElementById("refresh");
const open = document.getElementById("open");
refresh.textContent = t.refresh;
open.textContent = t.open;

async function load(openTab) {
  status.textContent = t.reading;
  list.replaceChildren();
  const res = await chrome.runtime.sendMessage({ type: "teams", open: openTab });
  const teams = res?.teams ?? [];
  status.textContent = teams.length ? t.found(teams.length) : t.none;
  for (const team of teams) {
    const li = document.createElement("li");
    const dot = document.createElement("span");
    dot.className = "dot";
    const name = document.createElement("span");
    name.textContent = team.name;
    const domain = document.createElement("small");
    domain.textContent = team.domain;
    li.append(dot, name, domain);
    list.append(li);
  }
}

refresh.addEventListener("click", () => void load(true));
open.addEventListener("click", () => chrome.tabs.create({ url: CONFIG.loquariumUrl }));
void load(false);
