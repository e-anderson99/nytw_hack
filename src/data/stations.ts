// Citywide subway station dataset, generated from data/mta_data.csv by
// `npm run build:stations` (see scripts/build-stations.ts). This is the source
// of truth for every station on the map — all 424 complexes across the five
// boroughs — and for each station's CSV-derived crowd index.

import type { SubwayState } from "@/types";
import { clamp01 } from "@/lib/predict";
import raw from "./stations.generated.json";

interface RawStation {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  /** hour-of-day (string key) -> summed ridership in the CSV snapshot. */
  r: Record<string, number>;
  peak: number;
}

interface StationData {
  /** Ridership that maps to heat index 1.0 (92nd-percentile station peak). */
  norm: number;
  /** Hours present in the snapshot, ascending (e.g. [19,20,21,22,23]). */
  hours: number[];
  stations: RawStation[];
}

const DATA = raw as StationData;
const BY_ID = new Map(DATA.stations.map((s) => [s.id, s]));

/** Seed list for the API/model — one entry per station complex. */
export const STATION_SEEDS: Omit<SubwayState, "congestion" | "recommended">[] =
  DATA.stations.map((s) => ({
    stationId: s.id,
    name: s.name,
    lines: s.lines,
    lat: s.lat,
    lng: s.lng,
  }));

/**
 * The CSV is an evening snapshot (hours 19–23). Pick the snapshot hour to read
 * for an arbitrary moment, clamping daytime down to the first available hour
 * and the small hours up to the last, so the index is always defined.
 */
function snapshotHour(at: Date): number {
  const h = at.getHours();
  const hours = DATA.hours;
  if (!hours.length) return h;
  let best = hours[0];
  let bestDist = Infinity;
  for (const hr of hours) {
    const dist = Math.abs(hr - h);
    if (dist < bestDist) {
      bestDist = dist;
      best = hr;
    }
  }
  return best;
}

/**
 * mta_index(station, t) from the bundled CSV: this station's ridership at the
 * snapshot hour nearest `at`, normalized so a typical hub reads mid-ramp and the
 * busiest complexes saturate at 1.0. Unknown stations return 0.
 */
export function stationRidershipIndex(stationId: string, at: Date): number {
  const s = BY_ID.get(stationId);
  if (!s) return 0;
  const r = s.r[String(snapshotHour(at))] ?? s.peak;
  return clamp01(r / DATA.norm);
}
