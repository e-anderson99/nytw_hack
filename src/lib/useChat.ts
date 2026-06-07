"use client";

// Drives the simulated live chat in lock-step with the game feed. Watches the
// feed index, emits scripted bot bursts plus a few staggered ambient lines on
// each advance, and accepts locally-injected user messages (free text or quick
// replies). The rolling buffer is capped, newest-last. Mirrors useGameFeed:
// pure selection lives in src/lib/chat.ts, this hook only handles React state.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameFeedState } from "@/lib/useGameFeed";
import type { ChatMessage } from "@/types";
import {
  applyReaction,
  pickRecentMessageSeq,
  sanitizeUserText,
  selectAmbient,
  selectBotBurst,
  selectBotReactions,
  type ChatGameSnapshot,
} from "@/lib/chat";
import { getQuickReply, REACTION_EMOJIS } from "@/data/chatQuickReplies";

export interface UseChatOptions {
  /** Max messages retained in the rolling buffer (older dropped). Default 60. */
  maxMessages?: number;
  /** Max ambient fillers scheduled per feed tick. Default 2. */
  maxAmbientPerTick?: number;
  /** Free-text character cap. Default 40. */
  charLimit?: number;
}

export interface UseChatState {
  /** Rolling buffer, oldest → newest. UI maps over this directly. */
  messages: ChatMessage[];
  /** Append a free-text user message (auto-trimmed to charLimit). No-op if empty. */
  sendUserMessage: (text: string) => void;
  /** Append a prewritten quick reply by id. No-op if id unknown. */
  sendQuickReply: (id: string) => void;
  /** Add an emoji reaction to a message by id. No-op if id/emoji unknown. */
  react: (messageId: string, emoji: string) => void;
  /** The supported emoji-reaction palette, for the UI reaction picker. */
  reactionEmojis: string[];
  /** The enforced free-text limit, for the composer to display/validate. */
  charLimit: number;
}

interface AppendInput {
  author: string;
  text: string;
  kind: ChatMessage["kind"];
  tone?: ChatMessage["tone"];
}

export function useChat(feed: GameFeedState, opts: UseChatOptions = {}): UseChatState {
  const maxMessages = opts.maxMessages ?? 60;
  const maxAmbient = opts.maxAmbientPerTick ?? 2;
  const charLimit = opts.charLimit ?? 40;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const seqRef = useRef(0); // monotonic ordering + id source
  const prevLeadingRef = useRef<GameFeedState["leading"]>(null);

  // Single append helper: assigns seq/id, kind prefix, and caps the buffer.
  const append = useCallback(
    (d: AppendInput) => {
      setMessages((prev) => {
        const seq = ++seqRef.current;
        const msg: ChatMessage = { id: `${d.kind[0]}-${seq}`, seq, ...d };
        const next = [...prev, msg];
        return next.length > maxMessages ? next.slice(next.length - maxMessages) : next;
      });
    },
    [maxMessages],
  );

  // React to the feed advancing: emit a bot burst now, stagger ambient fillers,
  // and on tagged hype plays pile a few simulated emoji reactions onto a recent
  // message. Keyed on feed.idx only so it fires once per play-by-play advance.
  useEffect(() => {
    const m = feed.current;
    const snap: ChatGameSnapshot = {
      nyk: feed.score.nyk,
      sas: feed.score.sas,
      prevLeading: prevLeadingRef.current,
      leading: feed.leading,
      period: m.period,
      clock: m.clock,
      isFinalMoment: m.tag === "FINAL",
    };
    prevLeadingRef.current = feed.leading;

    for (const d of selectBotBurst(m, snap)) append({ ...d, kind: "bot" });

    const timers: ReturnType<typeof setTimeout>[] = [];
    const ambientCount = Math.floor(Math.random() * (maxAmbient + 1));
    for (let i = 0; i < ambientCount; i++) {
      timers.push(
        setTimeout(() => append({ ...selectAmbient(), kind: "bot" }), 700 + Math.random() * 1800),
      );
    }

    // Hype moments (tagged plays) light up the chat with emoji reactions.
    if (m.tag) {
      for (const emoji of selectBotReactions(m.tone)) {
        timers.push(
          setTimeout(() => {
            setMessages((prev) => {
              const seq = pickRecentMessageSeq(prev);
              if (seq == null) return prev;
              return prev.map((msg) =>
                msg.seq === seq ? { ...msg, reactions: applyReaction(msg.reactions, emoji) } : msg,
              );
            });
          }, 500 + Math.random() * 2200),
        );
      }
    }

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lock-step on idx only
  }, [feed.idx]);

  const sendUserMessage = useCallback(
    (text: string) => {
      const clean = sanitizeUserText(text, charLimit);
      if (clean) append({ author: "You", text: clean, kind: "user" });
    },
    [append, charLimit],
  );

  const sendQuickReply = useCallback(
    (id: string) => {
      const q = getQuickReply(id);
      if (q) append({ author: "You", text: q.text, kind: "user", tone: q.tone });
    },
    [append],
  );

  const react = useCallback(
    (messageId: string, emoji: string) => {
      if (!REACTION_EMOJIS.includes(emoji)) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, reactions: applyReaction(m.reactions, emoji) } : m,
        ),
      );
    },
    [],
  );

  return useMemo(
    () => ({ messages, sendUserMessage, sendQuickReply, react, reactionEmojis: REACTION_EMOJIS, charLimit }),
    [messages, sendUserMessage, sendQuickReply, react, charLimit],
  );
}
