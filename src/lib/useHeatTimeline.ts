"use client";

// Fetches the heat timeline (now -> 2am) once on mount. The slider then scrubs
// through the returned frames client-side — no per-tick refetch. Pass tNow /
// gameId to pin a specific moment for demos.

import { useEffect, useState } from "react";
import { getCrowdTimeline, type TimelineResponse } from "@/lib/api";

interface Options {
  stepMin?: number;
  tNow?: string;
  gameId?: string;
}

export interface HeatTimelineState {
  data: TimelineResponse | null;
  loading: boolean;
  error: string | null;
}

export function useHeatTimeline(opts: Options = {}): HeatTimelineState {
  const { stepMin, tNow, gameId } = opts;
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    getCrowdTimeline({ stepMin, tNow, gameId })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [stepMin, tNow, gameId]);

  return { data, loading: !data && !error, error };
}
