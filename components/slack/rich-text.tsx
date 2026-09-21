import * as React from "react";

import { renderEmoji } from "@/lib/slack/emoji";
import type {
  SlackBlock,
  SlackRichTextElement,
  SlackRichTextStyle,
  UserDirectory,
} from "@/lib/slack/types";

export interface RenderContext {
  directory: UserDirectory;
  overrides?: Record<string, string>;
  highlight?: string;
}

/* -------------------------------------------------------------------------- */
/*  Highlighting                                                               */
/* -------------------------------------------------------------------------- */

function withHighlight(text: string, needle?: string): React.ReactNode {
  if (!needle || needle.length < 2) return text;
  const lower = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  let found = lower.indexOf(target);
  let i = 0;
  while (found !== -1) {
    if (found > cursor) parts.push(text.slice(cursor, found));
    parts.push(
      <mark className="slack-hit" key={`h-${i++}`}>
        {text.slice(found, found + target.length)}
      </mark>
    );
    cursor = found + target.length;
    found = lower.indexOf(target, cursor);
  }
  if (cursor === 0) return text;
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/* -------------------------------------------------------------------------- */
/*  Leaf elements                                                              */
/* -------------------------------------------------------------------------- */

function styleClasses(style?: SlackRichTextStyle | string): string {
  if (!style || typeof style === "string") return "";
  const classes: string[] = [];
  if (style.bold) classes.push("font-bold");
  if (style.italic) classes.push("italic");
  if (style.strike) classes.push("line-through");
  return classes.join(" ");
}

function Mention({
  id,
  ctx,
  prefix = "@",
}: {
  id: string;
  ctx: RenderContext;
  prefix?: string;
}) {
  const name = ctx.overrides?.[id] ?? ctx.directory[id]?.name ?? id;
  return (
    <span
      className="rounded-[3px] px-[2px] font-medium"
      style={{
        background: "var(--slack-mention-bg)",
        color: "var(--slack-mention-fg)",
      }}
    >
      {prefix}
      {name}
    </span>
  );
}

function Leaf({
  element,
  ctx,
  index,
}: {
  element: SlackRichTextElement;
  ctx: RenderContext;
  index: number;
}) {
  switch (element.type) {
    case "text": {
      const content = withHighlight(element.text ?? "", ctx.highlight);
      const style = element.style as SlackRichTextStyle | undefined;
      if (style?.code) {
        return <code>{content}</code>;
      }
      const cls = styleClasses(style);
      return cls ? <span className={cls}>{content}</span> : <>{content}</>;
    }

    case "link": {
      const label = element.text || element.url || "";
      const style = element.style as SlackRichTextStyle | undefined;
      return (
        <a
          href={element.url}
          target="_blank"
          rel="noopener noreferrer"
          className={styleClasses(style)}
        >
          {withHighlight(label, ctx.highlight)}
        </a>
      );
    }

    case "user":
      return <Mention id={element.user_id ?? ""} ctx={ctx} />;

    case "usergroup":
      return (
        <Mention
          id={element.usergroup_id ?? ""}
          ctx={ctx}
          prefix="@"
        />
      );

    case "channel":
      return (
        <span
          className="rounded-[3px] px-[2px] font-medium"
          style={{
            background: "var(--slack-mention-bg)",
            color: "var(--slack-mention-fg)",
          }}
        >
          #{element.channel_id}
        </span>
      );

    case "broadcast":
      return (
        <span
          className="rounded-[3px] px-[2px] font-medium"
          style={{
            background: "var(--slack-mention-bg)",
            color: "var(--slack-mention-fg)",
          }}
        >
          @{element.range ?? "channel"}
        </span>
      );

    case "emoji":
      return (
        <span title={element.name ? `:${element.name}:` : undefined}>
          {renderEmoji(element.name, element.unicode)}
        </span>
      );

    case "date":
      return <>{element.text ?? ""}</>;

    default:
      if (element.elements) {
        return <Elements elements={element.elements} ctx={ctx} />;
      }
      return <>{withHighlight(element.text ?? "", ctx.highlight)}</>;
  }
  void index;
}

function Elements({
  elements,
  ctx,
}: {
  elements: SlackRichTextElement[];
  ctx: RenderContext;
}) {
  return (
    <>
      {elements.map((el, i) => (
        <Leaf key={i} element={el} ctx={ctx} index={i} />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Containers                                                                 */
/* -------------------------------------------------------------------------- */

function RichTextChild({
  element,
  ctx,
}: {
  element: SlackRichTextElement;
  ctx: RenderContext;
}) {
  switch (element.type) {
    case "rich_text_section":
      return (
        <div>
          <Elements elements={element.elements ?? []} ctx={ctx} />
        </div>
      );

    case "rich_text_quote":
      return (
        <blockquote>
          <Elements elements={element.elements ?? []} ctx={ctx} />
        </blockquote>
      );

    case "rich_text_preformatted":
      return (
        <pre>
          <Elements elements={element.elements ?? []} ctx={ctx} />
        </pre>
      );

    case "rich_text_list": {
      const ordered = element.style === "ordered";
      const Tag = ordered ? "ol" : "ul";
      return (
        <Tag style={{ marginLeft: `${22 + (element.indent ?? 0) * 18}px` }}>
          {(element.elements ?? []).map((item, i) => (
            <li key={i}>
              <Elements elements={item.elements ?? []} ctx={ctx} />
            </li>
          ))}
        </Tag>
      );
    }

    default:
      return <Elements elements={element.elements ?? []} ctx={ctx} />;
  }
}

/* -------------------------------------------------------------------------- */
/*  mrkdwn fallback (for messages without rich_text blocks)                    */
/* -------------------------------------------------------------------------- */

const MRKDWN_PATTERN =
  "(<[^>]+>)|(```[\\s\\S]*?```)|(`[^`\\n]+`)|(\\*[^*\\n]+\\*)|(_[^_\\n]+_)|(~[^~\\n]+~)|(:[a-z0-9_+-]+:)";

export function Mrkdwn({ text, ctx }: { text: string; ctx: RenderContext }) {
  const pattern = new RegExp(MRKDWN_PATTERN, "gi");
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(
        <React.Fragment key={key++}>
          {withHighlight(text.slice(last, match.index), ctx.highlight)}
        </React.Fragment>
      );
    }
    const token = match[0];

    if (token.startsWith("<") && token.endsWith(">")) {
      const inner = token.slice(1, -1);
      if (inner.startsWith("@")) {
        nodes.push(
          <Mention key={key++} id={inner.slice(1).split("|")[0]} ctx={ctx} />
        );
      } else if (inner.startsWith("#")) {
        const label = inner.split("|")[1] ?? inner.slice(1);
        nodes.push(
          <span
            key={key++}
            className="rounded-[3px] px-[2px] font-medium"
            style={{
              background: "var(--slack-mention-bg)",
              color: "var(--slack-mention-fg)",
            }}
          >
            #{label}
          </span>
        );
      } else if (inner.startsWith("!")) {
        nodes.push(
          <span
            key={key++}
            className="rounded-[3px] px-[2px] font-medium"
            style={{
              background: "var(--slack-mention-bg)",
              color: "var(--slack-mention-fg)",
            }}
          >
            @{inner.slice(1).split("|")[0]}
          </span>
        );
      } else {
        const [url, label] = inner.split("|");
        nodes.push(
          <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
            {withHighlight(label ?? url, ctx.highlight)}
          </a>
        );
      }
    } else if (token.startsWith("```")) {
      nodes.push(<pre key={key++}>{token.slice(3, -3).replace(/^\n/, "")}</pre>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("*")) {
      nodes.push(
        <span key={key++} className="font-bold">
          {withHighlight(token.slice(1, -1), ctx.highlight)}
        </span>
      );
    } else if (token.startsWith("_")) {
      nodes.push(
        <span key={key++} className="italic">
          {withHighlight(token.slice(1, -1), ctx.highlight)}
        </span>
      );
    } else if (token.startsWith("~")) {
      nodes.push(
        <span key={key++} className="line-through">
          {withHighlight(token.slice(1, -1), ctx.highlight)}
        </span>
      );
    } else if (token.startsWith(":")) {
      nodes.push(<span key={key++}>{renderEmoji(token)}</span>);
    }

    last = match.index + token.length;
  }

  if (last < text.length) {
    nodes.push(
      <React.Fragment key={key++}>
        {withHighlight(text.slice(last), ctx.highlight)}
      </React.Fragment>
    );
  }

  return <div style={{ whiteSpace: "pre-wrap" }}>{nodes}</div>;
}

/* -------------------------------------------------------------------------- */
/*  Public entry point                                                         */
/* -------------------------------------------------------------------------- */

export function MessageBody({
  blocks,
  text,
  ctx,
}: {
  blocks: SlackBlock[];
  text: string;
  ctx: RenderContext;
}) {
  const richText = blocks.filter((b) => b.type === "rich_text");

  if (richText.length > 0) {
    return (
      <div className="slack-body">
        {richText.map((block, i) => (
          <React.Fragment key={block.block_id ?? i}>
            {(block.elements ?? []).map((el, j) => (
              <RichTextChild key={j} element={el} ctx={ctx} />
            ))}
          </React.Fragment>
        ))}
      </div>
    );
  }

  const others = blocks.filter((b) => b.type !== "rich_text");
  if (others.length > 0) {
    return (
      <div className="slack-body">
        {others.map((block, i) => {
          if (block.type === "image" && block.image_url) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={block.image_url}
                alt={block.alt_text ?? ""}
                className="mt-1 max-h-96 rounded border"
              />
            );
          }
          if (block.type === "divider") {
            return <hr key={i} className="my-2 border-t" />;
          }
          const content = block.text?.text ?? "";
          return (
            <React.Fragment key={i}>
              {content ? <Mrkdwn text={content} ctx={ctx} /> : null}
              {block.fields?.map((f, j) => (
                <Mrkdwn key={j} text={f.text ?? ""} ctx={ctx} />
              ))}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  if (!text) return null;
  return (
    <div className="slack-body">
      <Mrkdwn text={text} ctx={ctx} />
    </div>
  );
}
