/**
 * Where an import reads from: the server bridge (token and cookie), or
 * the browser extension (the Slack session open in this browser). The import
 * wizard only sees this interface.
 */

import type { I18n } from "@/lib/i18n/react";
import * as core from "./api-core";
import { wordApiText } from "./api-text";
import { runJob } from "./bridge-client";
import type { ChannelSummary } from "./bridge-types";
import { extensionCall, type ExtensionTeam } from "./extension-client";

type Log = (line: string) => void;

export interface SlackSource {
  kind: "bridge" | "extension";
  /** The workspace subdomain; names the archive (`slack:<workspace>`). */
  workspace: string;
  channels(memberOnly: boolean, onLog: Log, signal: AbortSignal): Promise<ChannelSummary[]>;
  /** `known`: threads already in the library (`core.knownThreads`), skipped. */
  dump(
    channel: string,
    onLog: Log,
    signal: AbortSignal,
    known?: Record<string, string>,
  ): Promise<unknown>;
  users(ids: string[], onLog: Log, signal: AbortSignal): Promise<unknown[]>;
}

/** Through `/api/slack/run`, with the credentials stored for this session. */
export function bridgeSource(workspace: string): SlackSource {
  return {
    kind: "bridge",
    workspace,
    channels: (memberOnly, onLog, signal) =>
      runJob<ChannelSummary[]>({ action: "channels", workspace, memberOnly }, onLog, signal),
    dump: (channel, onLog, signal, known) =>
      runJob<unknown>({ action: "dump", workspace, channel, known }, onLog, signal),
    users: (userIds, onLog, signal) =>
      runJob<unknown[]>({ action: "resolve-users", workspace, userIds }, onLog, signal),
  };
}

/** In this page, each request made by the extension with the browser's session. */
export function extensionSource(team: ExtensionTeam, i18n: I18n): SlackSource {
  const ctx: core.ApiContext = {
    transport: (method, params) => extensionCall(team.id, method, params),
    word: (text) => wordApiText(i18n.locale, i18n.m.server, text),
  };
  const server = i18n.m.server;
  return {
    kind: "extension",
    workspace: team.domain || team.id.toLowerCase(),
    channels: async (memberOnly, onLog, signal) => {
      onLog(memberOnly ? server.listingMine : server.listingAll);
      const list = memberOnly ? core.usersConversations : core.conversationsList;
      return core.summariseChannels(await list(ctx, core.ALL_CHANNEL_TYPES, onLog, signal));
    },
    dump: (channel, onLog, signal, known) =>
      core.dumpConversation(ctx, channel, onLog, signal, { known }),
    users: (ids, onLog, signal) => {
      onLog(i18n.p(server.resolving, ids.length));
      return core.usersInfo(ctx, ids, onLog, signal);
    },
  };
}
