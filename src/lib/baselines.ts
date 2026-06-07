// Loaders for the precomputed historical baselines.
//
// Two products, both produced by `scripts/build-baselines.ts`:
//   1. mta-nongame.json  — per-station average ridership by hour-of-week on
//      non-game days. Used as the DENOMINATOR of mtaHourIndex.
//   2. historical.json   — per-location normalized (0-1) crowd by
//      (dayOfWeek, minutesRelativeToGameEnd). Used as the baseline term of
//      predicted_crowd.
//
// Both JSON files ship as `{}` placeholders; until the build script runs we
// synthesize physically-plausible curves so the model still works end to end.

import { clamp01 } from "./predict";
import mtaNonGameRaw from "@/data/baselines/mta-nongame.json";
import historicalRaw from "@/data/baselines/historical.json";

/** Record<stationId, number[168]> — avg ridership per hour-of-week (0=Sun 00:00). */
type MtaNonGame = Record<string, number[]>;
/** Record<locationId, Record<dayOfWeek, Record<minutesRelToEnd, number>>> */
type Historical = Record<string, Record<string, Record<string, number>>>;

const mtaNonGame = mtaNonGameRaw as MtaNonGame;
const historical = historicalRaw as Historical;

export const HOURS_IN_WEEK = 168;

/** Hour-of-week index (0..167), 0 = Sunday 00:00 local. */
export function hourOfWeek(d: Date): number {
  return ((d.getDay() * 24 + d.getHours()) % HOURS_IN_WEEK + HOURS_IN_WEEK) % HOURS_IN_WEEK;
}

/**
 * Synthetic non-game ridership for a Midtown station: overnight lull, AM/PM
 * commuter peaks, lighter weekends. Returns entries/hour in a realistic range.
 */
function syntheticHourly(how: number): number {
  const day = Math.floor(how / 24);
  const hour = how % 24;
  const weekend = day === 0 || day === 6;
  const amPeak = 1800 * Math.exp(-((hour - 8.5) ** 2) / (2 * 1.5 ** 2));
  const pmPeak = 1600 * Math.exp(-((hour - 18) ** 2) / (2 * 2 ** 2));
  const base = hour >= 1 && hour <= 4 ? 40 : 350;
  const raw = base + amPeak + pmPeak;
  return weekend ? raw * 0.55 : raw;
}

/** Average non-game ridership for a station at a given hour-of-week. */
export function nonGameHourlyBaseline(stationId: string, how: number): number {
  const arr = mtaNonGame[stationId];
  if (arr && arr.length === HOURS_IN_WEEK && arr[how] > 0) return arr[how];
  return syntheticHourly(how);
}

/**
 * Synthetic event-relative crowd curve, normalized 0-1. Ramps up over the ~2h
 * pre-game, peaks at let-out (m = 0), then decays over ~90 min.
 */
function syntheticHistorical(minutesRelToEnd: number): number {
  const m = minutesRelToEnd;
  if (m < -150) return 0.2;
  if (m < 0) {
    // Ramp from 0.2 (2.5h before end) to ~0.85 just before the buzzer.
    return clamp01(0.2 + 0.65 * ((m + 150) / 150));
  }
  // Post-buzzer: spike to 1.0 then exponential decay (~90 min half-life).
  const spike = 1.0 * Math.exp(-m / 12) + 0.05;
  const decay = Math.pow(0.5, m / 90);
  return clamp01(Math.max(spike, 0.9 * decay));
}

/** Normalized (0-1) historical baseline crowd for a location at a future time. */
export function historicalBaseline(
  locationId: string,
  minutesRelToEnd: number,
  dayOfWeek: number,
): number {
  const byDow = historical[locationId]?.[String(dayOfWeek)];
  if (byDow) {
    // Nearest precomputed minute bucket (curves are stored in 5-min steps).
    const bucket = Math.round(minutesRelToEnd / 5) * 5;
    const keys = Object.keys(byDow);
    if (keys.length) {
      let best = keys[0];
      let bestDist = Infinity;
      for (const k of keys) {
        const dist = Math.abs(Number(k) - bucket);
        if (dist < bestDist) {
          bestDist = dist;
          best = k;
        }
      }
      return clamp01(byDow[best]);
    }
  }
  return syntheticHistorical(minutesRelToEnd);
}
