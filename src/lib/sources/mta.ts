// MTA subway ridership adapter (real data via NY Open Data / Socrata).
//
// Dataset: "MTA Subway Hourly Ridership: Beginning 2025" (id 5wq4-mkjj)
//   https://data.ny.gov/resource/5wq4-mkjj.json
// Columns we use: station_complex, transit_timestamp (hourly), ridership.
//
// IMPORTANT: this dataset is HOURLY and lags by several days — there is no
// real-time turnstile feed. So mtaHourIndex compares the most recent AVAILABLE
// hour at/just-before the requested time against the non-game-day baseline for
// that station + hour-of-week. The live "freshness" of the model comes from the
// NBA game-state multiplier, not from real-time MTA counts.

import { clamp01 } from "@/lib/predict";
import { hourOfWeek, nonGameHourlyBaseline } from "@/lib/baselines";

const SOCRATA_BASE = "https://data.ny.gov/resource/5wq4-mkjj.json";

/** Ratio of current/baseline ridership treated as "unusually high" (→ index 1). */
const HIGH_RATIO = 2.5;

/**
 * Map our internal station ids (src/data/subway.ts) to the dataset's
 * `station_complex` strings. These may need tuning against the live dataset's
 * exact labels; adjust here if a query returns no rows.
 */
// A station may map to multiple dataset complexes (summed together). Penn is
// split into the IRT (1,2,3) and IND (A,C,E) complexes in this dataset.
export const STATION_COMPLEX: Record<string, string | string[]> = {
  "34st-penn": [
    "34 St-Penn Station (1,2,3)",
    "34 St-Penn Station (A,C,E)",
  ],
  "34st-herald": "34 St-Herald Sq (B,D,F,M,N,Q,R,W)",
  "28st": "28 St (1)",
};

function appToken(): Record<string, string> {
  const t = process.env.SOCRATA_APP_TOKEN;
  return t ? { "X-App-Token": t } : {};
}

export interface RidershipRow {
  station_complex: string;
  transit_timestamp: string;
  ridership: number;
}

/** Truncate a Date to the top of its hour, as a Socrata floating timestamp. */
function hourFloorISO(d: Date): string {
  const h = new Date(d);
  h.setMinutes(0, 0, 0);
  // Socrata floating timestamps have no timezone suffix.
  return h.toISOString().slice(0, 19);
}

/**
 * Fetch hourly ridership rows for a station_complex within [startISO, endISO).
 * Used both by mtaHourIndex (small windows) and the baseline build script.
 */
export async function fetchHourlyRidership(
  stationComplex: string | string[],
  startISO: string,
  endISO: string,
  limit = 50000,
): Promise<RidershipRow[]> {
  const complexes = Array.isArray(stationComplex)
    ? stationComplex
    : [stationComplex];
  const inList = complexes
    .map((c) => `'${c.replace(/'/g, "''")}'`)
    .join(",");
  // Sum across all mapped complexes per timestamp (group by timestamp only).
  const where = `station_complex IN (${inList}) AND transit_timestamp >= '${startISO}' AND transit_timestamp < '${endISO}'`;
  const params = new URLSearchParams({
    $select: "transit_timestamp,sum(ridership) as ridership",
    $where: where,
    $group: "transit_timestamp",
    $order: "transit_timestamp ASC",
    $limit: String(limit),
  });
  const url = `${SOCRATA_BASE}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...appToken() },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as Array<Record<string, string>>;
    const label = complexes.join(" + ");
    return rows.map((r) => ({
      station_complex: label,
      transit_timestamp: r.transit_timestamp,
      ridership: Number(r.ridership ?? 0),
    }));
  } catch {
    return [];
  }
}

/**
 * mta_index(station, t): entries for the station over the most recent available
 * hour at/before `t`, normalized against the non-game-day baseline for that
 * hour-of-week. Output 0-1 (1 = unusually high for this time).
 *
 * Falls back to a neutral 0.5 when no live rows are available (e.g. the dataset
 * has not yet published the requested window).
 */
export async function mtaHourIndex(stationId: string, atISO: string): Promise<number> {
  const complex = STATION_COMPLEX[stationId];
  const at = new Date(atISO);
  if (!complex || isNaN(at.getTime())) return 0.5;

  // Look back up to 7 days to find the latest published hour at/before `at`.
  const start = new Date(at.getTime() - 7 * 24 * 3600 * 1000);
  const rows = await fetchHourlyRidership(
    complex,
    hourFloorISO(start),
    hourFloorISO(new Date(at.getTime() + 3600 * 1000)),
  );
  if (!rows.length) return 0.5;

  const latest = rows[rows.length - 1];
  const current = latest.ridership;
  const how = hourOfWeek(new Date(latest.transit_timestamp));
  const baseline = nonGameHourlyBaseline(stationId, how);
  if (baseline <= 0) return 0.5;

  return clamp01(current / baseline / HIGH_RATIO);
}
