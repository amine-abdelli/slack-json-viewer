import { plural } from "../format";

/**
 * French — the reference catalogue. Its shape is `Messages`: every other
 * language must provide exactly the same keys, or the build fails.
 *
 * `{name}` is a placeholder. Plural entries are keyed by CLDR category
 * (`one`, `few`, `many`, `other`…); `{n}` is the count.
 */
export const fr = {
  language: {
    label: "Langue",
    auto: "Langue du navigateur",
  },

  common: {
    cancel: "Annuler",
    save: "Enregistrer",
    clear: "Effacer",
    back: "Retour",
    unexpectedError: "Erreur inattendue.",
  },

  links: {
    readme: "Comment archiver ?",
    readmeTitle: "Comment archiver une conversation Slack — README du projet",
    githubTitle: "Code source & projets — github.com/amine-abdelli",
  },

  home: {
    intro:
      "Déposez un export de conversation Slack (.json) pour le relire avec l'interface d'origine, puis exportez-le en page HTML autonome.",
    dropTitle: "Glissez-déposez votre fichier ici",
    dropHint: "ou cliquez pour parcourir vos fichiers — .json",
    directoryTitle: "Annuaire des utilisateurs",
    directoryLoaded: plural({
      one: "{n} membre chargé",
      other: "{n} membres chargés",
    }),
    directoryOptional: "Optionnel — un users.json, ou le fichier .txt d'un export Slack",
    choose: "Choisir",
    connectTitle: "Se connecter directement à Slack",
    connectedTo: "Connecté · {workspaces}",
    connectHint: "Jeton et cookie, ou QR code",
    connect: "Connecter",
    privacy:
      "Les fichiers déposés restent dans votre navigateur. La connexion à Slack, elle, passe par le serveur qui héberge cette page.",
  },

  load: {
    notJson: "« {file} » n'est pas un JSON valide.",
    noIds: "Aucun identifiant Slack reconnu dans « {file} ». Format attendu : Name / ID / Email.",
    notObject: "Le fichier ne contient pas un objet JSON.",
    noMessages:
      "Clé `messages` absente ou invalide : ce JSON n'est pas un export de conversation Slack.",
    badMessages: "Les messages n'ont pas le format attendu (clé `ts` manquante).",
    exportFailed: "Échec de l'export : {error}",
  },

  sidebar: {
    conversation: "Conversation",
    noFile: "Aucun fichier chargé",
    members: "Membres · {n}",
    editNames: "Corriger les noms",
    directory: plural({
      one: "Annuaire : {n} utilisateur",
      other: "Annuaire : {n} utilisateurs",
    }),
  },

  viewer: {
    backToList: "Retour aux conversations",
    close: "Fermer la conversation",
    messages: plural({ one: "{n} message", other: "{n} messages" }),
    messagesFiltered: plural({ one: "{shown} / {n} message", other: "{shown} / {n} messages" }),
    search: "Rechercher dans la conversation",
    hideEmails: "Masquer les e-mails",
    showEmails: "Afficher les e-mails",
    lightTheme: "Thème clair",
    darkTheme: "Thème sombre",
    openFile: "Ouvrir un autre fichier",
    export: "Exporter",
    exportHtml: "Page HTML autonome",
    exportHtmlHint: "Un seul fichier, cliquable hors ligne",
    exportJson: "JSON de la conversation",
    exportJsonHint: "Les données brutes, rechargeables ici",
    unknownIds: plural({
      one: "{n} identifiant absent de l'annuaire.",
      other: "{n} identifiants absents de l'annuaire.",
    }),
    nameThem: "Leur attribuer un nom",
    noMatch: "Aucun message ne correspond à cette recherche.",
    dropOverlay: "Déposez un .json ou un annuaire",
  },

  thread: {
    title: "Fil de discussion",
    close: "Fermer le fil (Échap)",
    replies: plural({ one: "{n} réponse", other: "{n} réponses" }),
    lastReply: "Dernière réponse le {date}",
    view: "Voir le fil",
  },

  names: {
    title: "Noms des participants",
    description:
      "Les identifiants absents de l'annuaire peuvent être nommés à la main. Ces noms sont conservés dans ce navigateur et repris dans l'export HTML.",
    notInDirectory: "non trouvé dans l'annuaire",
  },

  message: {
    reacted: "{who} a réagi avec :{emoji}:",
    people: plural({ one: "{n} personne", other: "{n} personnes" }),
    file: "Fichier",
    openInSlack: "ouvrir dans Slack",
    huddle: "Huddle",
    openCall: "Ouvrir l'appel dans Slack",
    audioCall: "Appel audio",
    slackId: "ID Slack {id}",
    app: "app",
    unresolved: "non résolu",
    unresolvedTitle: "Cet identifiant n'est pas présent dans le fichier annuaire",
    orphanReply: "Réponse dans un fil dont le message d'origine est absent de l'export",
    edited: "(modifié)",
  },

  exported: {
    search: "Rechercher…",
    allAuthors: "Tous les auteurs",
    theme: "Thème clair / sombre",
    print: "Imprimer / PDF",
    top: "Remonter",
  },

  connect: {
    title: "Se connecter à Slack",
    channelsTitle: "Canaux · {workspace}",
    description: "Récupère vos conversations directement depuis Slack, via son API.",
    channelsMember: plural({
      one: "{n} canal dont vous êtes membre — choisissez celui à ouvrir.",
      other: "{n} canaux dont vous êtes membre — choisissez celui à ouvrir.",
    }),
    channelsAll: plural({
      one: "{n} canal accessible — choisissez celui à ouvrir.",
      other: "{n} canaux accessibles — choisissez celui à ouvrir.",
    }),
    connected: "Déjà connecté",
    viewChannels: "Voir les canaux",
    forget: "Oublier cet espace de travail",
    forgetNamed: "Oublier {workspace}",
    addWorkspace: "Connecter un autre espace de travail",
    newWorkspace: "Nouvel espace de travail",
    hide: "Masquer",
    workspace: "Espace de travail",
    workspaceHint: "Le sous-domaine, sans « .slack.com ».",
    modeToken: "Jeton + cookie",
    modeQr: "QR code",
    tokenLabel: "Jeton et cookie",
    tokenHelp: [
      "Ouvrez Slack dans un navigateur (app.slack.com), connecté à l'espace de travail.",
      "Outils de développement → onglet Réseau, puis rechargez la page.",
      "Cliquez une requête vers « /api/… » → Charge utile → copiez la valeur « token ».",
      "Onglet Application → Cookies → copiez la valeur du cookie « d ».",
    ],
    cookiePlaceholder: "xoxd-… (cookie « d »)",
    tokenNotice:
      "Ces valeurs donnent accès à votre Slack. Elles ne passent pas par le navigateur : elles sont chiffrées côté serveur, liées à votre session.",
    qrLabel: "Image du QR code",
    qrHelp: [
      "Ouvrez Slack (application de bureau ou navigateur), connecté à l'espace de travail.",
      "Cliquez sur le nom de l'espace de travail, en haut à gauche — pas sur le logo.",
      "Choisissez « Se connecter sur mobile ».",
      "Clic droit sur le QR code → « Copier l'adresse de l'image », puis collez-la ci-dessous.",
    ],
    qrRecognised:
      "Image reconnue ({size}). Le code expire vite — connectez-vous maintenant. Si Slack vous renvoie vers la page de connexion de votre entreprise, elle s'affichera ici.",
    liveTitle: "Navigateur de connexion",
    liveHint: "Ce navigateur tourne sur le serveur. Si une page de connexion s'affiche (SSO de votre entreprise), cliquez et tapez directement dans l'image pour vous authentifier.",
    liveWaiting: "Ouverture du navigateur…",
    liveFocus: "Cliquez dans l'image pour interagir avec la page",
    filterPlaceholder: "Rechercher un canal…",
    filterLabel: "Filtrer les canaux par nom ou par ID",
    filterHintByName: "Par nom",
    filterHintById: "ou par ID",
    filterHintLink: "— un lien Slack marche aussi.",
    filterCount: plural({ one: "{n} sur {total} canal", other: "{n} sur {total} canaux" }),
    filterTruncated: " · {max} premiers affichés, affinez la recherche",
    noChannel: "Aucun canal ne correspond.",
    archived: "archivé",
    directMessage: "Message direct",
    memberOnly: "Seulement les canaux dont je suis membre",
    resolveNames: "Résoudre les noms des participants",
    signIn: "Se connecter",
    open: "Ouvrir la conversation",
    busySignIn: "Connexion à Slack…",
    busyChannels: "Récupération des canaux…",
    busyDump: "Récupération de la conversation…",
    missingWorkspace: "Renseignez l'espace de travail.",
    missingQr: "Collez l'image du QR code.",
    missingToken: "Collez le jeton.",
  },

  bridge: {
    requestFailed: "La requête a échoué ({status}).",
    interrupted: "La connexion s'est interrompue avant la fin de l'opération.",
  },

  /** Sent by the server: progress lines and errors from the Slack bridge. */
  server: {
    invalidBody: "Corps de requête invalide.",
    invalidRequest: "Requête invalide.",
    logoutFailed: "Échec de la déconnexion.",
    unexpectedError: "Erreur inattendue.",
    invalidWorkspace:
      "Nom d'espace de travail invalide : « {value} ». Attendu : le sous-domaine, par exemple « acme ».",
    invalidChannel: "Identifiant de canal invalide : « {value} ».",
    qrBinMissing: "SLACK_VIEWER_QRAUTH_BIN pointe vers {path}, introuvable.",
    qrBinNotExecutable: "SLACK_VIEWER_QRAUTH_BIN pointe vers {path}, qui n'est pas exécutable.",
    qrUnavailableReason:
      "La connexion par QR code exige l'assistant « qrauth ». Utilisez l'image Docker, ou installez Go puis lancez « npm run build:qrauth ». La connexion par jeton, elle, fonctionne partout.",
    qrUnavailable: "L'assistant d'authentification par QR code n'est pas disponible.",
    qrUnavailableDetail:
      "Utilisez l'image Docker, qui l'embarque, ou connectez-vous avec un jeton et un cookie.",
    qrBuilding: "compilation de l'assistant d'authentification (première utilisation)…",
    spawnFailed: "impossible de lancer « {bin} » : {error}",
    processFailed: "{what} a échoué (code {code})",
    signInLabel: "La connexion à Slack",
    checking: "vérification des identifiants…",
    signedIn: "connecté en tant que {user} sur {team}",
    qrNotDataUrl: "L'image du QR code doit être une URL de données commençant par « data:image/ ».",
    qrNotDataUrlDetail:
      "Dans Slack : cliquez sur le nom de l'espace de travail → « Se connecter sur mobile » → clic droit sur le QR code → « Copier l'adresse de l'image ».",
    readingQr: "lecture du QR code…",
    qrBadOutput: "Réponse inattendue de l'assistant d'authentification.",
    qrNoToken: "L'authentification n'a pas renvoyé de jeton.",
    liveGone: "Cette connexion est terminée ou introuvable.",
    tokenPrefix: "Le jeton doit commencer par « xox », par exemple « xoxc-… ».",
    cookieRequired: "Un jeton « xoxc- » exige aussi le cookie « d », qui commence par « xoxd- ».",
    waitingSlot: "en attente d'un créneau de connexion…",
    noCredentials: "Aucun identifiant enregistré pour « {workspace} » — reconnectez-vous.",
    listingMine: "vos conversations…",
    listingAll: "toutes les conversations visibles…",
    resolving: plural({ one: "résolution de {n} membre…", other: "résolution de {n} membres…" }),
    slackErrors: {
      invalid_auth: "Les identifiants Slack ne sont plus valides — reconnectez-vous.",
      not_authed: "Les identifiants Slack ne sont plus valides — reconnectez-vous.",
      token_revoked: "Le jeton Slack a été révoqué — reconnectez-vous.",
      token_expired: "Le jeton Slack a expiré — reconnectez-vous.",
      channel_not_found: "Ce canal est introuvable, ou votre compte n'y a pas accès.",
      not_in_channel: "Votre compte n'est pas membre de ce canal.",
      missing_scope: "Ce jeton n'a pas les droits nécessaires pour cette requête.",
      ratelimited: "Slack limite les requêtes ; réessayez dans un instant.",
    },
    slackRefused: "Slack a refusé {method} : {code}.",
    slackHttp: "Slack a répondu {status} à {method}.",
    rateLimitedWait: "Slack limite les requêtes, pause de {seconds} s…",
    rateLimitedRetry: "Slack limite les requêtes, nouvelle tentative…",
    conversationsFetched: plural({
      one: "{n} conversation récupérée",
      other: "{n} conversations récupérées",
    }),
    stoppedAfterPages: "arrêt après {max} pages",
    usersResolved: "{done}/{total} membres résolus",
    emptyFirstPage: "Slack a répondu sans erreur, mais sans aucun message.",
    messagesFetched: plural({ one: "{n} message récupéré", other: "{n} messages récupérés" }),
    stoppedAfterHistory: "arrêt après {max} pages d'historique",
    infoFailed: "conversations.info a échoué ({code})",
    noChannelInfo: "Slack ne décrit pas le canal {channel} pour ce jeton.",
    emptyHistory:
      "Slack n'a renvoyé aucun message pour cette conversation. Si elle n'est pas vide, ce jeton n'y a pas accès — sur Enterprise Grid un jeton est lié à un espace de travail précis.",
    threadsToFetch: plural({
      one: "{n} fil de discussion à récupérer…",
      other: "{n} fils de discussion à récupérer…",
    }),
    threadsFetched: "{done}/{total} fils récupérés",
  },
};

export type Messages = typeof fr;
