/**
 * Types shared between the Slack bridge's route handlers and the client panel.
 *
 * Kept free of Node imports so the browser bundle can use them.
 */

export interface ChannelSummary {
  id: string;
  name: string;
  isPrivate: boolean;
  isIM: boolean;
  isMPIM: boolean;
  isArchived: boolean;
  memberCount: number;
  topic?: string;
  user?: string;
}

export interface QrauthAvailability {
  /** the QR login helper is present and executable */
  ready: boolean;
  /** it is missing, but Go is installed so it can be built on first use */
  buildable: boolean;
  reason?: string;
}

export interface BridgeStatus {
  /** the bridge can run at all — the API path needs only network */
  available: boolean;
  qrauth: QrauthAvailability;
  /** workspaces this session has already signed in to */
  workspaces: string[];
  reason?: string;
}

/** A unit of work the `/api/slack/run` endpoint can perform. */
export type RunRequest =
  | { action: "auth-qr"; workspace: string; qrImage: string }
  | { action: "auth-token"; workspace: string; token: string; cookie: string }
  | { action: "channels"; workspace: string; memberOnly?: boolean }
  | { action: "resolve-users"; workspace: string; userIds: string[] }
  | { action: "dump"; workspace: string; channel: string };

/**
 * An input for the QR sign-in's live view — what the person does on the
 * picture of the server-side browser.
 */
export type QrInput =
  | { t: "click"; x: number; y: number }
  | { t: "text"; v: string }
  | { t: "key"; k: QrInputKey }
  | { t: "scroll"; dy: number };

export const QR_INPUT_KEYS = [
  "Enter",
  "Tab",
  "Backspace",
  "Delete",
  "Escape",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
] as const;
export type QrInputKey = (typeof QR_INPUT_KEYS)[number];

/** Size of the server-side browser's page; live-view clicks use these coordinates. */
export const QR_VIEWPORT = { width: 1280, height: 800 } as const;

/** One line of the NDJSON stream returned by `/api/slack/run`. */
export type RunEvent =
  | { t: "log"; m: string }
  /** QR sign-in: the live view is up; inputs go to `/api/slack/qr-input` with this id. */
  | { t: "live"; id: string }
  /** QR sign-in: the server-side page, as a base64 JPEG. */
  | { t: "frame"; data: string }
  | { t: "done"; data: unknown }
  | { t: "error"; m: string; detail?: string };
