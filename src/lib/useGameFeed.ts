"use client";

// Drives the simulated live broadcast: advances through the curated Game 2
// highlight reel on a timer. Lifted to a hook so the score card and the events
// card render the same moment in lock-step.

import { useEffect, useMemo, useState } from "react";
import { GAME_FEED, type FeedMoment } from "@/data/gameFeed";

export interface GameFeedState {
  idx: number;
  current: FeedMoment;
  /** Latest moments, newest first. */
  recent: FeedMoment[];
  score: { nyk: number; sas: number };
  leading: "nyk" | "sas" | null;
}

function parseScore(score: string): { nyk: number; sas: number } {
  const [nyk, sas] = score.split("-").map((n) => parseInt(n, 10));
  return { nyk: nyk || 0, sas: sas || 0 };
}

export function useGameFeed(tickSeconds = 3.5): GameFeedState {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx((i) => (i + 1) % GAME_FEED.length);
    }, tickSeconds * 1000);
    return () => clearInterval(id);
  }, [tickSeconds]);

  return useMemo(() => {
    const current = GAME_FEED[idx];
    const recent: FeedMoment[] = [];
    for (let k = idx; k >= 0; k--) {
      recent.push(GAME_FEED[k]);
    }
    const score = parseScore(current.score);
    const leading =
      score.nyk === score.sas ? null : score.nyk > score.sas ? "nyk" : "sas";
    return { idx, current, recent, score, leading };
  }, [idx]);
}
