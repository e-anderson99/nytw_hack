// Prewritten quick-reply messages the local user can tap to inject into the
// chat. Tapping appends a ChatMessage{kind:"user"} via useChat.sendQuickReply(id).
// Mirrors the getEvent helper pattern in src/data/events.ts.

import type { FeedTone } from "@/data/gameFeed";

export interface QuickReply {
  /** Stable id passed to sendQuickReply(id). */
  id: string;
  /** Label shown on the button AND used verbatim as the message text. */
  text: string;
  /** Optional tone for styling parity with bot messages. */
  tone?: FeedTone;
}

export const QUICK_REPLIES: QuickReply[] = [
  { id: "lets-go",  text: "LETS GO KNICKS", tone: "good" },
  { id: "defense",  text: "DEEE-FENSE", tone: "neutral" },
  { id: "fire",     text: "🔥🔥🔥", tone: "good" },
  { id: "nervous",  text: "im so nervous", tone: "bad" },
  { id: "mvp",      text: "BRUNSON MVP", tone: "good" },
  { id: "ref",      text: "refs ball!!", tone: "bad" },
  { id: "garden",   text: "MSG LOUD", tone: "neutral" },
  { id: "clutch",   text: "ICE COLD", tone: "good" },
];

export function getQuickReply(id: string): QuickReply | undefined {
  return QUICK_REPLIES.find((q) => q.id === id);
}

/**
 * Emoji-reaction palette. These are the emojis a user (or simulated bot) can
 * react to an individual chat message with — distinct from QUICK_REPLIES, which
 * post a whole new message. Order here is the order a UI picker should show.
 */
export const REACTION_EMOJIS: string[] = ["🔥", "🧡", "😂", "😱", "💪", "🙏", "🗽", "🪦"];

/** True if `emoji` is one of the supported reactions. */
export function isReactionEmoji(emoji: string): boolean {
  return REACTION_EMOJIS.includes(emoji);
}
