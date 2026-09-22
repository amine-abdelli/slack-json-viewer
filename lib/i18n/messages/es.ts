import { plural } from "../format";
import type { Messages } from "./fr";

export const es: Messages = {
  language: {
    label: "Idioma",
    auto: "Idioma del navegador",
  },

  common: {
    cancel: "Cancelar",
    save: "Guardar",
    clear: "Borrar",
    back: "Atrás",
    unexpectedError: "Error inesperado.",
  },

  links: {
    readme: "¿Cómo archivar?",
    readmeTitle: "Cómo archivar una conversación de Slack — README del proyecto",
    githubTitle: "Código fuente y proyectos — github.com/amine-abdelli",
  },

  home: {
    intro:
      "Suelta una exportación de conversación de Slack (.json) para releerla con la interfaz original y luego expórtala como página HTML autónoma.",
    dropTitle: "Arrastra y suelta tu archivo aquí",
    dropHint: "o haz clic para explorar tus archivos — .json",
    directoryTitle: "Directorio de usuarios",
    directoryLoaded: plural({
      one: "{n} miembro cargado",
      other: "{n} miembros cargados",
    }),
    directoryOptional: "Opcional — un users.json o el archivo .txt de una exportación de Slack",
    choose: "Elegir",
    connectTitle: "Conectarse directamente a Slack",
    connectedTo: "Conectado · {workspaces}",
    connectHint: "Token y cookie, o código QR",
    connect: "Conectar",
    privacy:
      "Los archivos que sueltas se quedan en tu navegador. La conexión con Slack, en cambio, pasa por el servidor que aloja esta página.",
  },

  load: {
    notJson: "«{file}» no es un JSON válido.",
    noIds: "No se reconoce ningún ID de Slack en «{file}». Formato esperado: Name / ID / Email.",
    notObject: "El archivo no contiene un objeto JSON.",
    noMessages:
      "Falta la clave `messages` o no es válida: este JSON no es una exportación de conversación de Slack.",
    badMessages: "Los mensajes no tienen el formato esperado (falta la clave `ts`).",
    exportFailed: "Error en la exportación: {error}",
  },

  sidebar: {
    conversation: "Conversación",
    noFile: "Ningún archivo cargado",
    members: "Miembros · {n}",
    editNames: "Corregir los nombres",
    directory: plural({
      one: "Directorio: {n} usuario",
      other: "Directorio: {n} usuarios",
    }),
  },

  viewer: {
    backToList: "Volver a las conversaciones",
    close: "Cerrar la conversación",
    messages: plural({ one: "{n} mensaje", other: "{n} mensajes" }),
    messagesFiltered: plural({ one: "{shown} / {n} mensaje", other: "{shown} / {n} mensajes" }),
    search: "Buscar en la conversación",
    hideEmails: "Ocultar los correos",
    showEmails: "Mostrar los correos",
    lightTheme: "Tema claro",
    darkTheme: "Tema oscuro",
    openFile: "Abrir otro archivo",
    export: "Exportar",
    exportHtml: "Página HTML autónoma",
    exportHtmlHint: "Un solo archivo, navegable sin conexión",
    exportJson: "JSON de la conversación",
    exportJsonHint: "Los datos en bruto, recargables aquí",
    unknownIds: plural({
      one: "{n} ID no está en el directorio.",
      other: "{n} ID no están en el directorio.",
    }),
    nameThem: "Asignarles un nombre",
    noMatch: "Ningún mensaje coincide con esta búsqueda.",
    dropOverlay: "Suelta un .json o un directorio",
  },

  thread: {
    title: "Hilo",
    close: "Cerrar el hilo (Esc)",
    replies: plural({ one: "{n} respuesta", other: "{n} respuestas" }),
    lastReply: "Última respuesta el {date}",
    view: "Ver el hilo",
  },

  names: {
    title: "Nombres de los participantes",
    description:
      "Los ID que no están en el directorio se pueden nombrar a mano. Estos nombres se guardan en este navegador y se incluyen en la exportación HTML.",
    notInDirectory: "no encontrado en el directorio",
  },

  message: {
    reacted: "{who} reaccionó con :{emoji}:",
    people: plural({ one: "{n} persona", other: "{n} personas" }),
    file: "Archivo",
    openInSlack: "abrir en Slack",
    huddle: "Huddle",
    openCall: "Abrir la llamada en Slack",
    audioCall: "Llamada de audio",
    slackId: "ID de Slack {id}",
    app: "app",
    unresolved: "sin resolver",
    unresolvedTitle: "Este ID no está en el archivo de directorio",
    orphanReply: "Respuesta en un hilo cuyo mensaje original no está en la exportación",
    edited: "(editado)",
  },

  exported: {
    search: "Buscar…",
    allAuthors: "Todos los autores",
    theme: "Tema claro / oscuro",
    print: "Imprimir / PDF",
    top: "Volver arriba",
  },

  connect: {
    title: "Conectarse a Slack",
    channelsTitle: "Canales · {workspace}",
    description: "Obtiene tus conversaciones directamente de Slack, a través de su API.",
    channelsMember: plural({
      one: "{n} canal del que eres miembro — elige cuál abrir.",
      other: "{n} canales de los que eres miembro — elige cuál abrir.",
    }),
    channelsAll: plural({
      one: "{n} canal accesible — elige cuál abrir.",
      other: "{n} canales accesibles — elige cuál abrir.",
    }),
    connected: "Ya conectado",
    viewChannels: "Ver los canales",
    forget: "Olvidar este espacio de trabajo",
    forgetNamed: "Olvidar {workspace}",
    addWorkspace: "Conectar otro espacio de trabajo",
    newWorkspace: "Nuevo espacio de trabajo",
    hide: "Ocultar",
    workspace: "Espacio de trabajo",
    workspaceHint: "El subdominio, sin «.slack.com».",
    modeToken: "Token + cookie",
    modeQr: "Código QR",
    tokenLabel: "Token y cookie",
    tokenHelp: [
      "Abre Slack en un navegador (app.slack.com), con la sesión iniciada en el espacio de trabajo.",
      "Herramientas de desarrollo → pestaña Red, y recarga la página.",
      "Haz clic en una petición a «/api/…» → Carga útil → copia el valor «token».",
      "Pestaña Aplicación → Cookies → copia el valor de la cookie «d».",
    ],
    cookiePlaceholder: "xoxd-… (cookie «d»)",
    tokenNotice:
      "Estos valores dan acceso a tu Slack. No vuelven al navegador: se cifran en el servidor, vinculados a tu sesión.",
    qrLabel: "Imagen del código QR",
    qrHelp: [
      "Abre Slack (aplicación de escritorio o navegador), con la sesión iniciada en el espacio de trabajo.",
      "Haz clic en el nombre del espacio de trabajo, arriba a la izquierda — no en el logotipo.",
      "Elige «Iniciar sesión en el móvil».",
      "Clic derecho en el código QR → «Copiar dirección de la imagen» y pégala abajo.",
    ],
    qrRecognised:
      "Imagen reconocida ({size}). El código caduca enseguida — conéctate ahora. No se abrirá ninguna ventana: el navegador se ejecuta en el servidor.",
    filterPlaceholder: "Buscar un canal…",
    filterLabel: "Filtrar los canales por nombre o por ID",
    filterHintByName: "Por nombre",
    filterHintById: "o por ID",
    filterHintLink: "— un enlace de Slack también sirve.",
    filterCount: plural({ one: "{n} de {total} canal", other: "{n} de {total} canales" }),
    filterTruncated: " · se muestran los {max} primeros, afina la búsqueda",
    noChannel: "Ningún canal coincide.",
    archived: "archivado",
    directMessage: "Mensaje directo",
    memberOnly: "Solo los canales de los que soy miembro",
    resolveNames: "Resolver los nombres de los participantes",
    signIn: "Conectarse",
    open: "Abrir la conversación",
    busySignIn: "Conectando con Slack…",
    busyChannels: "Obteniendo los canales…",
    busyDump: "Obteniendo la conversación…",
    missingWorkspace: "Indica el espacio de trabajo.",
    missingQr: "Pega la imagen del código QR.",
    missingToken: "Pega el token.",
  },

  bridge: {
    requestFailed: "La petición ha fallado ({status}).",
    interrupted: "La conexión se interrumpió antes de terminar la operación.",
  },

  server: {
    invalidBody: "Cuerpo de la petición no válido.",
    invalidRequest: "Petición no válida.",
    logoutFailed: "No se pudo cerrar la sesión.",
    unexpectedError: "Error inesperado.",
    invalidWorkspace:
      "Nombre de espacio de trabajo no válido: «{value}». Se espera el subdominio, por ejemplo «acme».",
    invalidChannel: "ID de canal no válido: «{value}».",
    qrBinMissing: "SLACK_VIEWER_QRAUTH_BIN apunta a {path}, que no existe.",
    qrBinNotExecutable: "SLACK_VIEWER_QRAUTH_BIN apunta a {path}, que no es ejecutable.",
    qrUnavailableReason:
      "La conexión por código QR necesita el asistente «qrauth». Usa la imagen Docker, o instala Go y ejecuta «npm run build:qrauth». La conexión por token funciona en cualquier sitio.",
    qrUnavailable: "El asistente de conexión por código QR no está disponible.",
    qrUnavailableDetail:
      "Usa la imagen Docker, que lo incluye, o conéctate con un token y una cookie.",
    qrBuilding: "compilando el asistente de conexión (primer uso)…",
    spawnFailed: "no se pudo iniciar «{bin}»: {error}",
    processFailed: "{what} ha fallado (código {code})",
    signInLabel: "La conexión con Slack",
    checking: "comprobando las credenciales…",
    signedIn: "conectado como {user} en {team}",
    qrNotDataUrl: "La imagen del código QR debe ser una URL de datos que empiece por «data:image/».",
    qrNotDataUrlDetail:
      "En Slack: haz clic en el nombre del espacio de trabajo → «Iniciar sesión en el móvil» → clic derecho en el código QR → «Copiar dirección de la imagen».",
    readingQr: "leyendo el código QR…",
    qrBadOutput: "Respuesta inesperada del asistente de conexión.",
    qrNoToken: "La conexión no devolvió ningún token.",
    tokenPrefix: "El token debe empezar por «xox», por ejemplo «xoxc-…».",
    cookieRequired: "Un token «xoxc-» también necesita la cookie «d», que empieza por «xoxd-».",
    waitingSlot: "esperando un turno de conexión…",
    noCredentials: "No hay credenciales guardadas para «{workspace}» — vuelve a conectarte.",
    listingMine: "tus conversaciones…",
    listingAll: "todas las conversaciones visibles…",
    resolving: plural({ one: "resolviendo {n} miembro…", other: "resolviendo {n} miembros…" }),
    slackErrors: {
      invalid_auth: "Las credenciales de Slack ya no son válidas — vuelve a conectarte.",
      not_authed: "Las credenciales de Slack ya no son válidas — vuelve a conectarte.",
      token_revoked: "El token de Slack ha sido revocado — vuelve a conectarte.",
      token_expired: "El token de Slack ha caducado — vuelve a conectarte.",
      channel_not_found: "No se encuentra este canal, o tu cuenta no tiene acceso.",
      not_in_channel: "Tu cuenta no es miembro de este canal.",
      missing_scope: "Este token no tiene los permisos necesarios para esta petición.",
      ratelimited: "Slack está limitando las peticiones; inténtalo de nuevo en un momento.",
    },
    slackRefused: "Slack rechazó {method}: {code}.",
    slackHttp: "Slack respondió {status} a {method}.",
    rateLimitedWait: "Slack está limitando las peticiones, pausa de {seconds} s…",
    rateLimitedRetry: "Slack está limitando las peticiones, reintentando…",
    conversationsFetched: plural({
      one: "{n} conversación obtenida",
      other: "{n} conversaciones obtenidas",
    }),
    stoppedAfterPages: "detenido tras {max} páginas",
    usersResolved: "{done}/{total} miembros resueltos",
    emptyFirstPage: "Slack respondió sin errores, pero sin ningún mensaje.",
    messagesFetched: plural({ one: "{n} mensaje obtenido", other: "{n} mensajes obtenidos" }),
    stoppedAfterHistory: "detenido tras {max} páginas de historial",
    infoFailed: "conversations.info ha fallado ({code})",
    noChannelInfo: "Slack no describe el canal {channel} para este token.",
    emptyHistory:
      "Slack no devolvió ningún mensaje para esta conversación. Si no está vacía, este token no tiene acceso — en Enterprise Grid un token está vinculado a un espacio de trabajo concreto.",
    threadsToFetch: plural({
      one: "{n} hilo por obtener…",
      other: "{n} hilos por obtener…",
    }),
    threadsFetched: "{done}/{total} hilos obtenidos",
  },
};
