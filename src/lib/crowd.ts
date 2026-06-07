// Request-time orchestration: turn a live game state + MTA index + historical
// baseline into predicted crowd intensities for grid cells, venues, and
// stations. Routes call buildContext() once, then predictAt() per location.

import type { CrowdCell, GameState } from "@/types";
import { getGameState } from "./sources/nba";
import { mtaHourIndex } from "./sources/mta";
import { STATIONS } from "@/data/subway";
import { VENUES } from "@/data/venues";
import { currentCrowd, predictedCrowd, driftPhaseFor } from "./score";
import { historicalBaseline } from "./baselines";
import { MSG, clamp01, distanceMeters } from "./predict";

/** Typical minutes from tipoff to final buzzer — must match the build script. */
export const GAME_DURATION_MIN = 150;

export interface CrowdContext {
  gameState: GameState;
  tNowMs: number;
  tFutureMs: number;
  deltaMin: number;
  /** Estimated final-buzzer time (ms). */
  endMs: number;
  /** stationId -> live MTA index (0-1) at tNow, fetched once and reused. */
  stationIndex: Record<string, number>;
}

function parseTime(v: string | null): number | null {
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

/** Build the per-request context (one NBA call + one MTA call per station). */
export async function buildContext(
  searchParams: URLSearchParams,
): Promise<CrowdContext> {
  const gameState = await getGameState(searchParams.get("gameId") ?? undefined);
  const now = Date.now();
  const tNowMs = parseTime(searchParams.get("tNow")) ?? now;
  const tFutureMs = parseTime(searchParams.get("tFuture")) ?? tNowMs;
  const deltaMin = Math.max(0, (tFutureMs - tNowMs) / 60_000);
  const endMs =
    new Date(gameState.tipoffISO).getTime() + GAME_DURATION_MIN * 60_000;

  const tNowISO = new Date(tNowMs).toISOString();
  const stationIndex: Record<string, number> = {};
  await Promise.all(
    STATIONS.map(async (s) => {
      stationIndex[s.stationId] = await mtaHourIndex(s.stationId, tNowISO);
    }),
  );

  return { gameState, tNowMs, tFutureMs, deltaMin, endMs, stationIndex };
}

function nearestStationId(point: { lat: number; lng: number }): string {
  let best = STATIONS[0].stationId;
  let bestD = Infinity;
  for (const s of STATIONS) {
    const d = distanceMeters(s, point);
    if (d < bestD) {
      bestD = d;
      best = s.stationId;
    }
  }
  return best;
}

/**
 * predicted_crowd for one location at tFuture, 0-1.
 *
 *   current = mta_index(nearest station) × score_heat × spatial_decay
 *   predicted = blend(current × temporal_drift, historical_baseline) by recency
 */
export function predictAt(
  ctx: CrowdContext,
  locationId: string,
  point: { lat: number; lng: number },
  // Optional time override so one fetched context can be evaluated at many
  // future timestamps (e.g. the timeline series). Defaults to the single
  // tFuture baked into the context, so existing callers are unchanged.
  tFutureMs: number = ctx.tFutureMs,
): number {
  const mtaIdx = ctx.stationIndex[nearestStationId(point)] ?? 0.5;
  const currentNow = clamp01(currentCrowd(mtaIdx, ctx.gameState));

  // Same formula as buildContext, so the default path equals ctx.deltaMin.
  const deltaMin = Math.max(0, (tFutureMs - ctx.tNowMs) / 60_000);
  const minutesRelToEndFuture = (tFutureMs - ctx.endMs) / 60_000;
  const dowFuture = new Date(tFutureMs).getDay();
  const baselineFuture = historicalBaseline(
    locationId,
    minutesRelToEndFuture,
    dowFuture,
  );

  // Drift phase is intentionally derived from the CURRENT game state/timing,
  // not the future time — it reflects where we are in the game now.
  const minutesSinceEndNow = (ctx.tNowMs - ctx.endMs) / 60_000;
  const phase = driftPhaseFor(
    ctx.gameState.status,
    minutesSinceEndNow >= 0 ? minutesSinceEndNow : null,
  );

  return predictedCrowd(currentNow, baselineFuture, deltaMin, phase);
}

// Heat hotspots: a grid cell's intensity is a distance-weighted sum (kernel
// density) of the predicted crowd at the real crowd nodes — MSG plus every
// venue and station. Hot anchors and dense clusters (the Midtown bars around
// the Garden) pile up into hotspots; empty blocks stay cool. Tune the sigmas
// (falloff radius, meters), the MSG epicenter boost, and the overall scale.
const HEAT_SCALE = 0.62;
const MSG_SIGMA_M = 450;
const VENUE_SIGMA_M = 220;
const STATION_SIGMA_M = 320;
const MSG_BOOST = 1.3;

interface HeatAnchor {
  lat: number;
  lng: number;
  /** Predicted crowd 0-1 at this node, for the given time. */
  weight: number;
  /** Gaussian falloff radius in meters. */
  sigma: number;
}

/**
 * Build a square heat-map grid centered on MSG. `half` cells in each direction,
 * spanning ~`spanMeters`. Intensity is a kernel-density field over the crowd
 * anchors, so it shows spatial hotspots rather than a flat wash.
 */
export function predictGrid(
  ctx: CrowdContext,
  half = 6,
  spanMeters = 1600,
  tFutureMs: number = ctx.tFutureMs,
): CrowdCell[] {
  // Each real crowd node's predicted crowd at this time, with a falloff radius.
  const anchors: HeatAnchor[] = [
    {
      lat: MSG.lat,
      lng: MSG.lng,
      weight: clamp01(predictAt(ctx, "msg", MSG, tFutureMs) * MSG_BOOST),
      sigma: MSG_SIGMA_M,
    },
    ...VENUES.map((v) => ({
      lat: v.lat,
      lng: v.lng,
      weight: predictAt(ctx, v.id, v, tFutureMs),
      sigma: VENUE_SIGMA_M,
    })),
    ...STATIONS.map((s) => ({
      lat: s.lat,
      lng: s.lng,
      weight: predictAt(ctx, s.stationId, s, tFutureMs),
      sigma: STATION_SIGMA_M,
    })),
  ];

  const cells: CrowdCell[] = [];
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos((MSG.lat * Math.PI) / 180);
  const step = spanMeters / half;

  for (let i = -half; i <= half; i++) {
    for (let j = -half; j <= half; j++) {
      const lat = MSG.lat + (i * step) / mPerDegLat;
      const lng = MSG.lng + (j * step) / mPerDegLng;
      let sum = 0;
      for (const a of anchors) {
        const d = distanceMeters({ lat, lng }, a);
        sum += a.weight * Math.exp(-(d * d) / (2 * a.sigma * a.sigma));
      }
      cells.push({
        id: `cell-${i}-${j}`,
        lat,
        lng,
        intensity: clamp01(sum * HEAT_SCALE),
      });
    }
  }
  return cells;
}
