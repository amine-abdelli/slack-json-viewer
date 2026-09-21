# Slack JSON Viewer

Relit un export JSON de conversation Slack avec l'interface d'origine, puis
l'exporte en **page HTML autonome** qu'on ouvre d'un double-clic, hors ligne.

Tout se passe dans le navigateur : aucun fichier n'est envoyé à un serveur,
aucune API route, aucune base de données.

## Préparer les sources

Extraire les sources avec `slackdump`, puis dézipper l'archive pour récupérer le
fichier JSON de la conversation :

```bash
slackdump dump https://<workspace-name>.slack.com/archives/C0AE23W6W0J
```

Pour récupérer la liste des utilisateurs :

```bash
slackdump list users
```

## Fonctionnalités

- **Chargement** par glisser-déposer ou via l'explorateur de fichiers.
- **Design system Slack** : barre latérale aubergine, groupage des messages par
  auteur (fenêtre de 5 minutes), séparateurs de jour, réactions, aperçus de
  liens, fichiers joints, mentions, listes, citations, blocs de code, `(modifié)`.
- **Rendu complet des blocs `rich_text`** (sections, listes, quotes,
  preformatted, liens, mentions `@user` / `#channel` / `@here`, emojis) avec
  repli sur le `mrkdwn` quand le message n'a pas de blocs.
- **Annuaire utilisateurs** : mappe les identifiants Slack (`U09MJ41Q0RJ`) vers
  un nom et un e-mail. Les identifiants introuvables sont signalés et peuvent
  être nommés à la main (proposition automatique à partir du nom de canal
  `mpdm-…`). L'annuaire et les noms manuels sont mémorisés dans le navigateur.
- **Recherche** plein texte avec surlignage + **filtre par auteur**.
- **Thème clair / sombre** (palettes Slack).
- **Export HTML autonome** : un seul fichier, CSS et JS inclus, qui conserve la
  recherche, le filtre par auteur, le thème et une mise en page imprimable.

## Formats acceptés

### Conversation (obligatoire)

```jsonc
{
  "channel_id": "C0AE23W6W0J",
  "name": "mpdm-alice--bob--carol-1",
  "messages": [
    {
      "client_msg_id": "…",
      "type": "message",
      "user": "U09MJ41Q0RJ",
      "text": "Hello",
      "ts": "1770708541.969069",
      "blocks": [/* rich_text */],
      "reactions": [{ "name": "+1", "count": 1, "users": ["UCR66AFS4"] }],
      "attachments": [/* aperçus de liens */],
      "edited": { "user": "…", "ts": "…" }
    }
  ]
}
```

Un tableau nu de messages est également accepté.

### Annuaire (optionnel)

Le dump colonné des exports admin Slack :

```
Name                   ID                 Email
martin_dupont           T09MJ41Q0ZX        alice.martin@gmail.com
```

Sont aussi reconnus : TSV, CSV, et le `users.json` d'un export Slack complet.

## Développement

```bash
npm install
npm run dev     # http://localhost:3000
npm run build
```

## Déploiement sur Vercel

Le projet est un Next.js 16 (App Router) entièrement statique, donc aucune
configuration n'est nécessaire.

```bash
npm i -g vercel
vercel          # preview
vercel --prod   # production
```

Ou via l'interface : *New Project* → importer le dépôt Git → Vercel détecte
Next.js et déploie sans réglage supplémentaire.

## Stack

- Next.js 16 (App Router, Turbopack), React 19
- Tailwind CSS v4 + shadcn/ui (Radix), lucide-react
- `react-dom/server.browser` pour l'export : la page téléchargée est rendue par
  **les mêmes composants** que l'application, avec la feuille de style de
  l'application inlinée — le fichier exporté est donc au pixel près identique.
# slack-json-viewer
