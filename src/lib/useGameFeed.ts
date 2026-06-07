"use client";

// Drives the simulated live broadcast: advances through the full Game 2
// play-by-play on a timer. Lifted to a hook so the score card, the events card,
// and the scrubber all render / control the same moment in lock-step.

import { useCallback, useEffect, useMemo, useState } from "react";
import { GAME_FEED, type FeedMoment } from "@/data/gameFeed";

export interface GameFeedState {
  idx: number;
  current: FeedMoment;
  /** Latest moments, newest first. */
  recent: FeedMoment[];
  score: { nyk: number; sas: number };
  leading: "nyk" | "sas" | null;
  /** Total number of moments in the game (for the scrubber range). */
  total: number;
  /** Whether the feed is auto-advancing. */
  playing: boolean;
  /** Jump to a specific moment (used by the scrubber). Clamped to range. */
  seek: (idx: number) => void;
  setPlaying: (playing: boolean) => void;
}

function parseScore(score: string): { nyk: number; sas: number } {
  const [nyk, sas] = score.split("-").map((n) => parseInt(n, 10));
  return { nyk: nyk || 0, sas: sas || 0 };
}

export function useGameFeed(tickSeconds = 3.5): GameFeedState {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % GAME_FEED.length);
    }, tickSeconds * 1000);
    return () => clearInterval(id);
  }, [tickSeconds, playing]);

  const seek = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(GAME_FEED.length - 1, Math.round(next)));
    setIdx(clamped);
  }, []);

  return useMemo(() => {
    const current = GAME_FEED[idx];
    // Newest-first, capped to a sliding window — the full game is 520 moments,
    // so rendering every prior chip would bloat the DOM as the feed advances.
    const WINDOW = 40;
    const recent: FeedMoment[] = [];
    for (let k = idx; k >= Math.max(0, idx - WINDOW + 1); k--) {
      recent.push(GAME_FEED[k]);
    }
    const score = parseScore(current.score);
    const leading =
      score.nyk === score.sas ? null : score.nyk > score.sas ? "nyk" : "sas";
    return {
      idx,
      current,
      recent,
      score,
      leading,
      total: GAME_FEED.length,
      playing,
      seek,
      setPlaying,
    };
  }, [idx, playing, seek]);
}
