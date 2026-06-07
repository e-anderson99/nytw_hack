// Pure selection logic for the simulated live chat. Given a FeedMoment and a
// derived game-state snapshot, picks scripted bot lines (tone + tag + state
// buckets) and mixes in ambient chatter. No React, no side effects — fully
// deterministic given an `rng`, so it can be unit-tested with a seeded source.

import type { FeedMoment, FeedTone } from "@/data/gameFeed";
import type { ChatMessage, ChatReactions } from "@/types";
import {
  BOT_HANDLES,
  TONE_LINES,
  TAG_LINES,
  STATE_LINES,
  AMBIENT_LINES,
  type GameStateCondition,
} from "@/data/chatBots";
import { REACTION_EMOJIS } from "@/data/chatQuickReplies";

/** A random source in [0, 1). Defaults to Math.random; inject for determinism. */
export type Rng = () => number;

/**
 * Small self-contained LCG. Kept local to the chat feature (deliberately not
 * shared with friends.ts) so deterministic tests/smoke scripts can seed it.
 */
export function seeded(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

/** Minimal score/clock snapshot the selector reasons about. */
export interface ChatGameSnapshot {
  nyk: number;
  sas: number;
  /** Leader of the *previous* moment, for lead-change detection. */
  prevLeading: "nyk" | "sas" | null;
  leading: "nyk" | "sas" | null;
  /** Game period (1-4+), from FeedMoment. */
  period: number;
  /** Game clock "m:ss", from FeedMoment. */
  clock: string;
  /** True at the final buzzer. */
  isFinalMoment: boolean;
}

/** A bot message before it gets an id/seq (assigned by the hook). */
export interface BotDraft {
  author: string;
  text: string;
  tone?: FeedTone;
}

function pick<T>(arr: T[], rng: Rng): T {
  return arr[Math.floor(rng() * arr.length)];
}

function handle(rng: Rng): string {
  return pick(BOT_HANDLES, rng);
}

/** Parse the leading minutes off a "m:ss" clock; NaN-safe. */
function clockMinutes(clock: string): number {
  const m = parseInt(clock.split(":")[0] ?? "", 10);
  return Number.isNaN(m) ? 99 : m;
}

/** Detect which game-state conditions currently apply (can be several). */
export function detectStateConditions(s: ChatGameSnapshot): GameStateCondition[] {
  const out: GameStateCondition[] = [];
  const gap = Math.abs(s.nyk - s.sas);
  const lateGame = s.period >= 4 && clockMinutes(s.clock) <= 4;

  if (s.isFinalMoment) out.push("final");
  if (lateGame && gap <= 5 && !s.isFinalMoment) out.push("close-late");
  if (gap >= 15) out.push("blowout");
  if (s.prevLeading !== null && s.leading !== null && s.prevLeading !== s.leading) {
    out.push("lead-change");
  }
  return out;
}

/**
 * Build the burst of bot drafts to emit when the feed advances to `moment`.
 * Combines tag lines (strongest signal), one line per active state condition,
 * and a probabilistic tone line; shuffles and caps the burst so chat doesn't
 * flood on a single tick.
 */
export function selectBotBurst(
  moment: FeedMoment,
  snap: ChatGameSnapshot,
  opts: { maxBurst?: number; rng?: Rng } = {},
): BotDraft[] {
  const rng = opts.rng ?? Math.random;
  const maxBurst = opts.maxBurst ?? 3;
  const candidates: BotDraft[] = [];

  // Tag bucket (specific play) — strongest signal, 1-2 lines.
  const tagPool = moment.tag ? TAG_LINES[moment.tag] : undefined;
  if (tagPool?.length) {
    const n = 1 + (rng() < 0.5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      candidates.push({ author: handle(rng), text: pick(tagPool, rng), tone: moment.tone });
    }
  }

  // State conditions — one line per active condition.
  for (const cond of detectStateConditions(snap)) {
    candidates.push({
      author: handle(rng),
      text: pick(STATE_LINES[cond], rng),
      tone: cond === "blowout" || cond === "final" ? "good" : undefined,
    });
  }

  // Tone bucket — baseline reaction, usually present.
  if (rng() < 0.8) {
    candidates.push({ author: handle(rng), text: pick(TONE_LINES[moment.tone], rng), tone: moment.tone });
  }

  // Fisher-Yates shuffle, then cap.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, maxBurst);
}

/** One ambient filler line — for staggered between-tick chatter. */
export function selectAmbient(rng: Rng = Math.random): BotDraft {
  return { author: handle(rng), text: pick(AMBIENT_LINES, rng) };
}

/**
 * Enforce the free-text limit on a user message. Trims, clamps to `max` chars,
 * and returns null if nothing meaningful remains (so empty sends are no-ops).
 */
export function sanitizeUserText(raw: string, max = 40): string | null {
  const t = raw.trim().slice(0, max);
  return t.length ? t : null;
}

/**
 * Return a new reactions map with `emoji` incremented by `delta` (default +1).
 * Pure — never mutates the input. A count that drops to ≤0 is removed so the
 * map stays clean for rendering.
 */
export function applyReaction(
  reactions: ChatReactions | undefined,
  emoji: string,
  delta = 1,
): ChatReactions {
  const next: ChatReactions = { ...(reactions ?? {}) };
  const count = (next[emoji] ?? 0) + delta;
  if (count > 0) next[emoji] = count;
  else delete next[emoji];
  return next;
}

/**
 * Simulated bot reactions for a hype moment: pile a few random emoji onto a
 * recent message so the chat "lights up" on big plays. Returns the emoji to
 * apply (with repeats meaning multiple bots reacted with the same one).
 * Good plays skew positive; bad plays lean to the sadder set.
 */
export function selectBotReactions(
  tone: FeedTone,
  opts: { count?: number; rng?: Rng } = {},
): string[] {
  const rng = opts.rng ?? Math.random;
  const count = opts.count ?? 1 + Math.floor(rng() * 3); // 1-3
  const pool =
    tone === "bad"
      ? REACTION_EMOJIS.filter((e) => ["😱", "🙏", "🪦"].includes(e))
      : REACTION_EMOJIS.filter((e) => ["🔥", "🧡", "😂", "💪", "🗽"].includes(e));
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(pick(pool, rng));
  return out;
}

/** Pick the seq of a recent message to slap reactions on, or null if none. */
export function pickRecentMessageSeq(messages: ChatMessage[], rng: Rng = Math.random): number | null {
  if (!messages.length) return null;
  // Bias toward the newest few so reactions land on what just happened.
  const window = messages.slice(-Math.min(4, messages.length));
  return pick(window, rng).seq;
}
