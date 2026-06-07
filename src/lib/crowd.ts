// Request-time orchestration: turn a live game state + MTA index + historical
// baseline into predicted crowd intensities for grid cells, venues, and
// stations. Routes call buildContext() once, then predictAt() per location.

import type { CrowdCell, GameState } from "@/types";
import { getGameState } from "./sources/nba";
import { STATIONS } from "@/data/subway";
import { stationRidershipIndex } from "@/data/stations";
import { VENUES } from "@/data/venues";
import { impactScaler, predictedCrowd, driftPhaseFor } from "./score";
import { historicalBaseline } from "./baselines";
import { MSG, clamp01, distanceMeters, distanceDecay } from "./predict";

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

  // Live crowd index per station, read once from the bundled MTA snapshot at
  // tNow and reused across every future frame (the time variation comes from
  // temporal drift + baseline, not a re-read).
  const tNow = new Date(tNowMs);
  const stationIndex: Record<string, number> = {};
  for (const s of STATIONS) {
    stationIndex[s.stationId] = stationRidershipIndex(s.stationId, tNow);
  }

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
  // The game's crowd surge is centered on MSG — let it amplify nearby stations
  // but fade to the raw ridership index out in the boroughs, so a close game
  // doesn't falsely light up the whole map. (decay = 1 at MSG → 0 far away.)
  const localImpact = 1 + (impactScaler(ctx.gameState) - 1) * distanceDecay(point);
  const currentNow = clamp01(mtaIdx * localImpact);

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

// Epicenter boost so MSG itself reads as the hottest point during the game.
const MSG_BOOST = 1.3;

/**
 * Citywide heat field: one cell per real crowd node — MSG, every venue, and
 * every subway complex in the dataset — with intensity = predicted crowd there.
 * The map's heatmap layer smooths these points into a continuous field, so the
 * heat now covers the whole system (every station, all five boroughs) instead
 * of a fixed box around the Garden. Outer stations read at their own ridership
 * level; the game surge concentrates around MSG via predictAt's distance decay.
 */
export function predictHeatCells(
  ctx: CrowdContext,
  tFutureMs: number = ctx.tFutureMs,
): CrowdCell[] {
  const cells: CrowdCell[] = [
    {
      id: "msg",
      lat: MSG.lat,
      lng: MSG.lng,
      intensity: clamp01(predictAt(ctx, "msg", MSG, tFutureMs) * MSG_BOOST),
    },
    ...VENUES.map((v) => ({
      id: `venue-${v.id}`,
      lat: v.lat,
      lng: v.lng,
      intensity: predictAt(ctx, v.id, v, tFutureMs),
    })),
    ...STATIONS.map((s) => ({
      id: `station-${s.stationId}`,
      lat: s.lat,
      lng: s.lng,
      intensity: predictAt(ctx, s.stationId, s, tFutureMs),
    })),
  ];
  return cells;
}
