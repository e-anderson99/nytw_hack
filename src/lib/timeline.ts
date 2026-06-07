// Heat timeline: evaluate the crowd model at a series of future timestamps
// (now -> end of night) reusing a single fetched context. Each frame carries
// the grid + per-venue crowd + per-station congestion at that time, so a slider
// UI can index frames without re-fetching live data per tick.

import type { CrowdCell, SubwayState, Venue } from "@/types";
import type { CrowdContext } from "./crowd";
import { predictAt, predictHeatCells } from "./crowd";
import { VENUES } from "@/data/venues";
import { STATIONS } from "@/data/subway";

export interface TimelineFrame {
  /** ISO time this frame predicts. */
  tFuture: string;
  cells: CrowdCell[];
  venues: Venue[];
  stations: SubwayState[];
}

/** Hard ceiling on frames, to protect payload regardless of step/window. */
export const MAX_FRAMES = 400;

interface BuildOpts {
  /** Decimals to round normalized values (intensity/crowd/congestion). */
  round?: number;
}

export function buildTimeline(
  ctx: CrowdContext,
  stepMin: number,
  nightEndMs: number,
  opts: BuildOpts = {},
): TimelineFrame[] {
  const decimals = opts.round ?? 3;
  const r = (n: number) => Number(n.toFixed(decimals));
  const stepMs = Math.max(1, stepMin) * 60_000;

  const frames: TimelineFrame[] = [];
  for (
    let t = ctx.tNowMs;
    t <= nightEndMs && frames.length < MAX_FRAMES;
    t += stepMs
  ) {
    // Citywide heat at this time (round only the intensity, never lat/lng).
    const cells = predictHeatCells(ctx, t).map((c) => ({
      ...c,
      intensity: r(c.intensity),
    }));

    // Venues: wait derives from the un-rounded crowd (matches venues route).
    const venues: Venue[] = VENUES.map((v) => {
      const crowd = predictAt(ctx, v.id, v, t);
      const waitMins = Math.round(crowd * (v.capacity / 20));
      return { ...v, crowd: r(crowd), waitMins };
    });

    // Stations: `recommended` derives from un-rounded congestion (matches subway route).
    const stations: SubwayState[] = STATIONS.map((s) => {
      const congestion = predictAt(ctx, s.stationId, s, t);
      return { ...s, congestion: r(congestion), recommended: congestion < 0.6 };
    });

    frames.push({ tFuture: new Date(t).toISOString(), cells, venues, stations });
  }

  return frames;
}
