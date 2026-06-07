"use client";

// Right-side live-chat drawer. A pinned edge tab slides the panel in/out; while
// closed, the tab gently pulses when fresh chatter arrives. Open, it shows a
// Twitch-style scrolling message list (newest at the bottom, auto-scrolled) with
// a glass composer docked at the base: 40-char free text, quick-reply chips, and
// an emoji-reaction bar. Driven by the shared game feed via useChat so chatter
// reacts to the play-by-play in lock-step.

import { useEffect, useRef, useState } from "react";
import type { GameFeedState } from "@/lib/useGameFeed";
import { useChat } from "@/lib/useChat";
import { QUICK_REPLIES } from "@/data/chatQuickReplies";

interface LiveChatProps {
  feed: GameFeedState;
}

export default function LiveChat({ feed }: LiveChatProps) {
  const chat = useChat(feed);
  const { messages, sendUserMessage, sendQuickReply, react, reactionEmojis, charLimit } = chat;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // Seconds left on the post-send cooldown (0 = can send). Ticks down each second.
  const [cooldown, setCooldown] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);

  const latestSeq = messages.length ? messages[messages.length - 1].seq : 0;

  // Auto-scroll the list to the newest message whenever it grows (only matters
  // while open; the ref is null when closed so this is a cheap no-op then).
  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, open]);

  // Tick the cooldown down once per second until it hits 0.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const latestId = messages.length ? messages[messages.length - 1].id : null;
  const COOLDOWN_SECONDS = 3;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (cooldown > 0) return;
    const clean = draft.trim();
    if (!clean) return;
    sendUserMessage(draft);
    setDraft("");
    setCooldown(COOLDOWN_SECONDS);
  }

  function quickReply(id: string) {
    if (cooldown > 0) return;
    sendQuickReply(id);
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className={`chatdrawer ${open ? "is-open" : ""}`}>
      <button
        type="button"
        className="chatdrawer-tab"
        aria-expanded={open}
        aria-label={open ? "Close live chat" : "Open live chat"}
        onClick={() => setOpen((v) => !v)}
      >
        {/* glow overlay: keyed on the latest seq so each new message re-mounts
            just this layer and replays its one-shot glow — without re-mounting
            the button, so the open/close slide transition stays smooth */}
        {!open && (
          <span key={latestSeq} className="chatdrawer-tab-glow" aria-hidden />
        )}
        <span className="chatdrawer-tab-icon" aria-hidden>
          {open ? "›" : "‹"}
        </span>
        <span className="chatdrawer-tab-label">LIVE CHAT</span>
      </button>

      <aside className="chatdrawer-panel glass" aria-label="Live chat" aria-hidden={!open}>
        <header className="chatdrawer-head">
          <h2 className="card-title">Live Chat</h2>
          <span className="chatdrawer-live">
            <i className="chatdrawer-livedot" aria-hidden /> MSG
          </span>
        </header>

        <div className="chatdrawer-list" ref={listRef} aria-live="polite">
          {messages.length === 0 && (
            <p className="chatdrawer-empty">Waiting for the crowd…</p>
          )}
          {messages.map((m) => (
            <article
              key={m.id}
              className={`chat-row tone-${m.tone ?? "neutral"} ${m.kind === "user" ? "is-you" : ""}`}
            >
              <span className="chat-row-line">
                <span className="chat-author">{m.author}</span>
                <span className="chat-text">{m.text}</span>
              </span>
              {m.reactions && Object.keys(m.reactions).length > 0 && (
                <span className="chat-reactions">
                  {Object.entries(m.reactions).map(([emoji, count]) => (
                    <span key={emoji} className="chat-reaction">
                      {emoji}
                      {count > 1 && <b>{count}</b>}
                    </span>
                  ))}
                </span>
              )}
            </article>
          ))}
        </div>

        <div className="chatdrawer-dock">
          <div className="chat-emoji-bar" role="group" aria-label="React to latest">
            {reactionEmojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="chat-emoji"
                disabled={!latestId}
                onClick={() => latestId && react(latestId, emoji)}
                aria-label={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="chat-quick-row">
            {QUICK_REPLIES.map((q) => (
              <button
                key={q.id}
                type="button"
                className="chip"
                disabled={cooldown > 0}
                onClick={() => quickReply(q.id)}
              >
                {q.text}
              </button>
            ))}
          </div>

          <form className="chat-composer" onSubmit={submit}>
            <input
              className="chat-input"
              type="text"
              value={draft}
              maxLength={charLimit}
              disabled={cooldown > 0}
              placeholder={cooldown > 0 ? "Slow down…" : "Say something…"}
              onChange={(e) => setDraft(e.target.value)}
              aria-label="Chat message"
            />
            <span className="chat-count" aria-hidden>
              {draft.length}/{charLimit}
            </span>
            <button
              type="submit"
              className="chat-send"
              disabled={cooldown > 0 || !draft.trim()}
            >
              {cooldown > 0 ? `${cooldown}s` : "Send"}
            </button>
          </form>
        </div>
      </aside>
    </div>
  );
}
