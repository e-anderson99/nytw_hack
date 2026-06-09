"use client";

// Live counterpart to useGameFeed: instead of looping a canned Game 2 replay,
// it polls /api/playbyplay for the REAL game and exposes the identical
// GameFeedState shape, so ScorePanel / EventsCard / GameScrubber / LiveChat /
// MapView all work unchanged.
//
// "playing" here means "follow live": when on, each poll snaps the view to the
// newest moment. Scrubbing back (via GameScrubber, which sets playing=false)
// holds the view so you can review earlier plays, then resumes at the live tip.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FeedMoment } from "@/data/gameFeed";
import type { GameFeedState } from "@/lib/useGameFeed";

const PRE_GAME: FeedMoment[] = [
  {
    period: 1,
    clock: "12:00",
    score: "0-0",
    text: "Tip-off soon — Knicks vs. Spurs at Madison Square Garden",
    tone: "neutral",
    impact: 0,
  },
];

function parseScore(score: string): { nyk: number; sas: number } {
  const [nyk, sas] = score.split("-").map((n) => parseInt(n, 10));
  return { nyk: nyk || 0, sas: sas || 0 };
}

interface UseLiveGameFeedOptions {
  /** Pin a specific game id; otherwise the server discovers today's Knicks game. */
  gameId?: string;
  /** Poll interval in ms (live data; defaults to 12s). */
  pollMs?: number;
}

export function useLiveGameFeed(opts: UseLiveGameFeedOptions = {}): GameFeedState {
  const { gameId, pollMs = 12_000 } = opts;
  const [moments, setMoments] = useState<FeedMoment[]>(PRE_GAME);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  // Read "playing" inside the interval without resubscribing every toggle.
  const followLive = useRef(playing);
  followLive.current = playing;

  useEffect(() => {
    let cancelled = false;
    const url = `/api/playbyplay${gameId ? `?gameId=${encodeURIComponent(gameId)}` : ""}`;

    async function poll() {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { moments?: FeedMoment[] };
        if (cancelled || !data.moments?.length) return;
        const next = data.moments;
        setMoments(next);
        // Snap to the newest moment only while following live.
        if (followLive.current) setIdx(next.length - 1);
      } catch {
        /* transient network error — keep last good state, try again next tick */
      }
    }

    poll();
    const id = setInterval(poll, pollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [gameId, pollMs]);

  // The scrubber clamps to [0, total-1] via its range input; the memo below
  // clamps the upper bound against the live moment count, so seek just floors.
  const seek = useCallback((next: number) => {
    setIdx(Math.max(0, Math.round(next)));
  }, []);

  // Resuming "follow live" should jump to the current tip immediately, not wait
  // for the next poll.
  useEffect(() => {
    if (playing) setIdx((cur) => Math.max(cur, moments.length - 1));
  }, [playing, moments.length]);

  return useMemo(() => {
    const safeIdx = Math.min(Math.max(0, idx), moments.length - 1);
    const current = moments[safeIdx];

    const WINDOW = 40;
    const recent: FeedMoment[] = [];
    for (let k = safeIdx; k >= Math.max(0, safeIdx - WINDOW + 1); k--) {
      recent.push(moments[k]);
    }

    const score = parseScore(current.score);
    const leading =
      score.nyk === score.sas ? null : score.nyk > score.sas ? "nyk" : "sas";

    return {
      idx: safeIdx,
      current,
      recent,
      score,
      leading,
      total: moments.length,
      moments,
      playing,
      seek,
      setPlaying,
    };
  }, [idx, moments, playing, seek]);
}
