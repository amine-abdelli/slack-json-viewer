/**
 * The server's Slack Web API client: the shared one (`lib/slack/api-core.ts`)
 * with a transport that sends the token and `d` cookie the person signed in
 * with, and messages worded in the request's language.
 *
 * Everything the bridge does — validating credentials, listing conversations,
 * resolving names, dumping a channel — goes through here.
 */

import { currentLocale, sm } from "@/lib/i18n/server";
import * as core from "@/lib/slack/api-core";
import { wordApiText } from "@/lib/slack/api-text";

import type { SlackCredentials } from "./credentials";

export {
  ALL_CHANNEL_TYPES,
  isAuthError,
  isUserId,
  SlackApiError,
  summariseChannels,
  type AuthTest,
  type Conversation,
  type LogFn,
  type RawChannel,
  type RawMessage,
  type RawUser,
} from "@/lib/slack/api-core";

/** Overridable so tests can point at a stub. */
const API_BASE = process.env.SLACK_API_BASE ?? "https://slack.com/api";

function contextFor(creds: SlackCredentials): core.ApiContext {
  return {
    transport: async (method, params, signal) => {
      const res = await fetch(`${API_BASE}/${method}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${creds.token}`,
          // Slack sets `d` URL-encoded; it must go back exactly as received.
          cookie: `d=${creds.cookie}`,
          "content-type": "application/x-www-form-urlencoded; charset=utf-8",
        },
        // The Slack web client posts the token as a form field; some methods are
        // picky about `xoxc` tokens arriving only in the header, so send both.
        body: new URLSearchParams({ token: creds.token, ...params }).toString(),
        signal,
      });
      return {
        status: res.status,
        retryAfter: Number(res.headers.get("retry-after")) || undefined,
        body: res.ok ? await res.json() : undefined,
      };
    },
    word: (text) => wordApiText(currentLocale(), sm(), text),
  };
}

export function authTest(creds: SlackCredentials, signal?: AbortSignal) {
  return core.authTest(contextFor(creds), signal);
}

export function usersConversations(
  creds: SlackCredentials,
  types?: string,
  onLog?: core.LogFn,
  signal?: AbortSignal,
) {
  return core.usersConversations(contextFor(creds), types, onLog, signal);
}

export function conversationsList(
  creds: SlackCredentials,
  types?: string,
  onLog?: core.LogFn,
  signal?: AbortSignal,
) {
  return core.conversationsList(contextFor(creds), types, onLog, signal);
}

export function conversationsInfo(creds: SlackCredentials, channel: string, signal?: AbortSignal) {
  return core.conversationsInfo(contextFor(creds), channel, signal);
}

export function usersInfo(
  creds: SlackCredentials,
  ids: string[],
  onLog?: core.LogFn,
  signal?: AbortSignal,
) {
  return core.usersInfo(contextFor(creds), ids, onLog, signal);
}

export function dumpConversation(
  creds: SlackCredentials,
  channel: string,
  onLog?: core.LogFn,
  signal?: AbortSignal,
  options?: core.DumpOptions,
) {
  return core.dumpConversation(contextFor(creds), channel, onLog, signal, options);
}
