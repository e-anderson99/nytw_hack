// Continuous-time, score-aware crowd model.
//
//   current_crowd(location, t)   = mta_index_30(station, t) × impact_scaler
//   predicted_crowd(location, tF) = blend(current × temporal_drift, historical)
//
// All functions here are pure so they can be unit-tested and reused by the API
// routes and the baseline build script. Live inputs (MTA index, game state,
// historical baseline) are resolved by the source adapters and passed in.

import type { DriftPhase, GameState } from "@/types";
import { clamp01 } from "./predict";

/** Regulation game length in minutes (4 × 12). OT extends gameLengthMin. */
export const REGULATION_MIN = 48;

/**
 * Score-heat multiplier. The closer the game and the later the clock, the more
 * people stay through the buzzer and the more frenzied the simultaneous exodus.
 * A blowout lets out early and spread thin (multiplier → ~1.0).
 *
 * Implemented exactly as specified:
 *   closeness = 1 / (1 + |diff| * 0.1)      tightest (→1) when tied
 *   urgency   = 1 + (1 - clock/gameLength)   grows as the clock winds down
 *   return    = 1.0 + closeness * urgency * 0.5
 *
 * Note: with the `+1` in urgency this peaks near ~2.0× (tied, buzzer); the
 * spec's "~1.5×" comment implies urgency without the `+1`. Kept as written —
 * flip `URGENCY_BASE` to 0 to get the 1.5× ceiling.
 */
export const URGENCY_BASE = 1;

export function scoreHeatMultiplier(
  diff: number,
  clockMinRemaining: number,
  gameLengthMin: number = REGULATION_MIN,
  live: boolean = true,
): number {
  if (!live) return 1.0;
  const closeness = 1 / (1 + Math.abs(diff) * 0.1);
  const clockFrac = clamp01(clockMinRemaining / gameLengthMin);
  const urgency = URGENCY_BASE + (1 - clockFrac);
  return 1.0 + closeness * urgency * 0.5;
}

/**
 * Impact scaler — the event-driven multiplier applied to the raw 30-min MTA
 * index to turn "unusually busy turnstiles" into a crowd level. This is where
 * the game-impact signal will live: score-heat, sellout, opponent draw,
 * weather, day-of-week, etc.
 *
 * PLACEHOLDER — to be built out soon. Returns 1.0 (identity) for now, so
 * current_crowd == mta_index_30. `scoreHeatMultiplier` above is the prime
 * candidate ingredient for the first real version:
 *   scoreHeatMultiplier(game.scoreDiff, game.clockMinRemaining,
 *                       game.gameLengthMin, game.status === "live")
 */
export function impactScaler(game: GameState): number {
  void game; // referenced so the param survives until the real impl lands
  return 1.0;
}

/**
 * current_crowd at a single location:
 *
 *   current_crowd = mta_index_30 × impact_scaler
 *
 * `mtaIndex30` is the live 30-minute MTA index (0→1, "unusually high for this
 * time"); `impactScaler` is the event-impact multiplier (stubbed for now).
 */
export function currentCrowd(mtaIndex30: number, game: GameState): number {
  return mtaIndex30 * impactScaler(game);
}

/**
 * Temporal drift: how the current state decays or grows over `deltaMin` minutes
 * into the future, depending on game phase.
 *   pre   — crowds ramp up toward tipoff
 *   during— relatively stable
 *   post  — sharp spike then exponential decay (~90 min) after the buzzer
 */
export const POST_DECAY_HALF_LIFE_MIN = 90;

export function temporalDrift(deltaMin: number, phase: DriftPhase): number {
  const dt = Math.max(0, deltaMin);
  switch (phase) {
    case "pre":
      // Ramp up ~+1% per minute toward tipoff, capped at +50%.
      return 1 + Math.min(0.5, dt * 0.01);
    case "during":
      // Near-flat with a gentle drift up as the game progresses.
      return 1 + Math.min(0.15, dt * 0.003);
    case "post": {
      // Brief surge in the first few minutes, then exponential decay.
      const surge = 1 + 0.4 * Math.exp(-dt / 10);
      const decay = Math.pow(0.5, dt / POST_DECAY_HALF_LIFE_MIN);
      return surge * decay;
    }
  }
}

/**
 * Recency weight: how much to trust the current signal vs. the historical
 * baseline at `deltaMin` into the future. Piecewise-linear through the spec
 * anchors (5→0.90, 30→0.50, 60→0.20), clamped to [0.1, 1].
 */
const RECENCY_ANCHORS: { t: number; w: number }[] = [
  { t: 0, w: 1.0 },
  { t: 5, w: 0.9 },
  { t: 30, w: 0.5 },
  { t: 60, w: 0.2 },
];

export function recencyWeight(deltaMin: number): number {
  const dt = Math.max(0, deltaMin);
  const a = RECENCY_ANCHORS;
  if (dt <= a[0].t) return a[0].w;
  for (let i = 1; i < a.length; i++) {
    if (dt <= a[i].t) {
      const lo = a[i - 1];
      const hi = a[i];
      const frac = (dt - lo.t) / (hi.t - lo.t);
      return lo.w + frac * (hi.w - lo.w);
    }
  }
  // Beyond the last anchor, decay toward (but not below) 0.1.
  const last = a[a.length - 1];
  return Math.max(0.1, last.w - (dt - last.t) * 0.002);
}

/**
 * predicted_crowd at a location at some future time.
 *
 * Blends the drifted current signal with the historical baseline by recency:
 *   w = recencyWeight(deltaMin)
 *   predicted = w * (current * temporal_drift) + (1 - w) * historical_baseline
 *
 * (The written spec adds the historical term without weighting the current
 * term; the t+5/t+30/t+60 description is a blend, so the blend form is used.)
 */
export function predictedCrowd(
  currentNow: number,
  baselineFuture: number,
  deltaMin: number,
  phase: DriftPhase,
): number {
  const w = recencyWeight(deltaMin);
  const drifted = currentNow * temporalDrift(deltaMin, phase);
  return clamp01(w * drifted + (1 - w) * baselineFuture);
}

/** Parse an ISO 8601 duration like "PT05M30.00S" into minutes (float). */
export function parseGameClockMinutes(iso: string): number {
  const m = /PT(?:(\d+)M)?(?:([\d.]+)S)?/.exec(iso ?? "");
  if (!m) return 0;
  const mins = m[1] ? parseInt(m[1], 10) : 0;
  const secs = m[2] ? parseFloat(m[2]) : 0;
  return mins + secs / 60;
}

/**
 * Convert NBA period + per-period game clock into minutes remaining across the
 * whole game. Regulation periods are 12 min; OT periods 5 min.
 */
export function clockMinRemaining(
  period: number,
  perPeriodClockMin: number,
  regulationPeriods: number = 4,
): number {
  if (period <= regulationPeriods) {
    const fullPeriodsLeft = regulationPeriods - period;
    return fullPeriodsLeft * 12 + perPeriodClockMin;
  }
  // In OT: only the current 5-min period remains.
  return perPeriodClockMin;
}

/** Total game length in minutes given how many OT periods were played. */
export function gameLengthMinutes(
  period: number,
  regulationPeriods: number = 4,
): number {
  const otPeriods = Math.max(0, period - regulationPeriods);
  return regulationPeriods * 12 + otPeriods * 5;
}

/** Pick the temporal-drift phase from game timing. */
export function driftPhaseFor(
  status: GameState["status"],
  minutesSinceGameEnd: number | null,
): DriftPhase {
  if (status === "pre") return "pre";
  if (status === "live") return "during";
  // final: if we know it ended recently, treat as post; otherwise during.
  if (minutesSinceGameEnd !== null && minutesSinceGameEnd >= 0) return "post";
  return "during";
}
