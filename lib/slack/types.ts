/** Types describing the Slack conversation export consumed by this viewer. */

export interface SlackEdited {
  user?: string;
  ts?: string;
}

export interface SlackReaction {
  name: string;
  count: number;
  users?: string[];
}

export interface SlackAttachment {
  id?: number;
  fallback?: string;
  title?: string;
  title_link?: string;
  text?: string;
  pretext?: string;
  color?: string;
  author_name?: string;
  author_link?: string;
  image_url?: string;
  thumb_url?: string;
  service_name?: string;
  service_icon?: string;
  from_url?: string;
  original_url?: string;
  footer?: string;
  ts?: string | number;
  blocks?: SlackBlock[] | null;
}

export interface SlackFile {
  id?: string;
  name?: string;
  title?: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  mode?: string;
  size?: number;
  url_private?: string;
  url_private_download?: string;
  permalink?: string;
  preview?: string;
  thumb_360?: string;
  thumb_480?: string;
  thumb_720?: string;
  thumb_800?: string;
  thumb_960?: string;
  thumb_1024?: string;
  original_w?: number;
  original_h?: number;
  /** Hosted elsewhere (Google Drive…): nothing to download from Slack. */
  is_external?: boolean;
}

export type SlackRichTextStyle = {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  highlight?: boolean;
};

export interface SlackRichTextElement {
  type: string;
  text?: string;
  name?: string;
  unicode?: string;
  url?: string;
  user_id?: string;
  channel_id?: string;
  usergroup_id?: string;
  team_id?: string;
  range?: string;
  value?: string;
  style?: SlackRichTextStyle | string;
  border?: number;
  indent?: number;
  offset?: number;
  elements?: SlackRichTextElement[];
}

export interface SlackBlock {
  type: string;
  block_id?: string;
  text?: { type?: string; text?: string; emoji?: boolean };
  fields?: { type?: string; text?: string }[];
  image_url?: string;
  alt_text?: string;
  elements?: SlackRichTextElement[];
}

export interface SlackMessage {
  client_msg_id?: string;
  type?: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  username?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  parent_user_id?: string;
  reply_count?: number;
  reply_users?: string[];
  latest_reply?: string;
  team?: string;
  edited?: SlackEdited | null;
  reactions?: SlackReaction[];
  attachments?: SlackAttachment[];
  files?: SlackFile[];
  blocks?: SlackBlock[] | null;
  metadata?: { event_type?: string; event_payload?: unknown } | null;
  permalink?: string;
  /** Slack API / official export shape. */
  replies?: SlackMessage[];
  /** slackdump shape: the root message repeated, followed by its replies. */
  slackdump_thread_replies?: SlackMessage[];
  [key: string]: unknown;
}

export interface SlackConversation {
  channel_id: string;
  name: string;
  messages: SlackMessage[];
}

/** A user resolved from the directory file (Name / ID / Email). */
export interface SlackUser {
  id: string;
  name: string;
  email?: string;
  realName?: string;
  image?: string;
  isBot?: boolean;
  deleted?: boolean;
}

export type UserDirectory = Record<string, SlackUser>;

/** A message after normalisation, ready for rendering. */
export interface NormalizedMessage {
  key: string;
  raw: SlackMessage;
  userId: string;
  ts: string;
  date: Date;
  dayKey: string;
  text: string;
  searchText: string;
  edited: boolean;
  reactions: SlackReaction[];
  attachments: SlackAttachment[];
  files: SlackFile[];
  blocks: SlackBlock[];
  subtype?: string;
  permalink?: string;
  /** `ts` of the thread root, when this message belongs to a thread */
  threadTs?: string;
  /** true when this message is a reply rather than the thread root */
  isThreadReply: boolean;
  replyCount: number;
  replyUsers: string[];
  latestReply?: Date;
  /** replies attached to a thread root, in chronological order */
  replies: NormalizedMessage[];
  /** a reply whose root is missing from the export */
  orphanReply: boolean;
  /** true when this message continues the previous author's group */
  grouped: boolean;
}

export interface ConversationMeta {
  channelId: string;
  rawName: string;
  displayName: string;
  kind: "channel" | "dm" | "group-dm";
  participants: string[];
  messageCount: number;
  firstTs?: string;
  lastTs?: string;
}
