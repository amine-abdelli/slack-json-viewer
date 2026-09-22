import * as React from "react";

import { useI18n } from "@/lib/i18n/react";
import type { NormalizedMessage, UserDirectory } from "@/lib/slack/types";
import { DayDivider, Message } from "./message";
import { cn } from "@/lib/utils";

export interface MessageListProps {
  messages: NormalizedMessage[];
  directory: UserDirectory;
  overrides: Record<string, string>;
  highlight?: string;
  showEmail?: boolean;
  filtering?: boolean;
  isStatic?: boolean;
  className?: string;
  onOpenThread?: (message: NormalizedMessage) => void;
}

export function MessageList({
  messages,
  directory,
  overrides,
  highlight,
  showEmail = true,
  filtering = false,
  isStatic = false,
  className,
  onOpenThread,
}: MessageListProps) {
  const { fmt } = useI18n();
  const rows: React.ReactNode[] = [];
  let currentDay: string | null = null;

  for (const message of messages) {
    if (message.dayKey !== currentDay) {
      currentDay = message.dayKey;
      rows.push(
        <DayDivider
          key={`day-${currentDay}`}
          day={currentDay}
          label={fmt.day(message.date)}
        />
      );
    }
    rows.push(
      <Message
        key={message.key}
        message={message}
        directory={directory}
        overrides={overrides}
        highlight={highlight}
        showEmail={showEmail}
        isStatic={isStatic}
        onOpenThread={onOpenThread}
      />
    );
  }

  return (
    <div
      id="slack-messages"
      className={cn("pb-6 pt-4", filtering && "slack-filtering", className)}
    >
      {rows}
    </div>
  );
}
