/**
 * Types shared between the Slack bridge's route handlers and the page.
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

export interface BridgeStatus {
  /** the bridge can run at all — it needs only network */
  available: boolean;
  /** workspaces this browser has signed in to with a token and cookie */
  workspaces: string[];
  reason?: string;
}

/** A unit of work the `/api/slack/run` endpoint can perform. */
export type RunRequest =
  | { action: "auth-token"; workspace: string; token: string; cookie: string }
  | { action: "channels"; workspace: string; memberOnly?: boolean }
  | { action: "resolve-users"; workspace: string; userIds: string[] }
  | {
      action: "dump";
      workspace: string;
      channel: string;
      /** Threads the library already holds, `root ts → stamp`: not fetched again. */
      known?: Record<string, string>;
    };

/** One line of the NDJSON stream returned by `/api/slack/run`. */
export type RunEvent =
  | { t: "log"; m: string }
  | { t: "done"; data: unknown }
  | { t: "error"; m: string; detail?: string };
