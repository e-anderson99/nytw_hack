/**
 * Build the citywide station dataset the heat model reads at request time.
 *
 * Input:  data/mta_data.csv — MTA Subway Hourly Ridership snapshot. One row per
 *         (station_complex, hour, payment_method, fare_class), with the station
 *         coordinates and ridership count. ~424 distinct station complexes
 *         across all five boroughs, for the evening hours of a single game day.
 *
 * Output (committed JSON, overwritten on each run):
 *   src/data/stations.generated.json
 *     {
 *       norm: number,                  // ridership that maps to heat index 1.0
 *       hours: number[],               // hours present in the snapshot, ascending
 *       stations: Array<{
 *         id, name, lines[], lat, lng, // identity + map position
 *         r: Record<hour, ridership>,  // summed ridership per hour-of-day
 *         peak: number                 // max hourly ridership
 *       }>
 *     }
 *
 * Run:  npm run build:stations   (no network needed)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

const CSV_PATH = resolve(process.cwd(), "data/mta_data.csv");
const OUT_PATH = resolve(process.cwd(), "src/data/stations.generated.json");

/** Parse one CSV line into fields, honoring "double-quoted, comma, fields". */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Pull the line bullets out of a complex name, e.g. "103 St (1)" -> ["1"]. */
function parseLines(name: string): string[] {
  const m = /\(([^)]*)\)\s*$/.exec(name);
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

interface Acc {
  id: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  r: Record<number, number>;
}

function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  const header = parseCsvLine(lines[0]);
  const col = (name: string) => header.indexOf(name);
  const I = {
    ts: col("transit_timestamp"),
    id: col("station_complex_id"),
    complex: col("station_complex"),
    ridership: col("ridership"),
    lat: col("latitude"),
    lng: col("longitude"),
  };
  for (const [k, v] of Object.entries(I)) {
    if (v < 0) throw new Error(`CSV missing column for ${k}`);
  }

  const byId = new Map<string, Acc>();
  const hours = new Set<number>();

  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const id = f[I.id];
    if (!id) continue;
    const hour = Number(f[I.ts].slice(11, 13)); // "...T19:00..." -> 19
    const ridership = Number(f[I.ridership]) || 0;
    hours.add(hour);

    let acc = byId.get(id);
    if (!acc) {
      const name = f[I.complex];
      acc = {
        id,
        name,
        lines: parseLines(name),
        lat: Number(f[I.lat]),
        lng: Number(f[I.lng]),
        r: {},
      };
      byId.set(id, acc);
    }
    acc.r[hour] = (acc.r[hour] ?? 0) + ridership;
  }

  const stations = [...byId.values()]
    .map((a) => {
      const peak = Math.max(0, ...Object.values(a.r));
      // Round coordinates to ~1m; trims payload without visible drift.
      return {
        id: a.id,
        name: a.name,
        lines: a.lines,
        lat: Number(a.lat.toFixed(5)),
        lng: Number(a.lng.toFixed(5)),
        r: a.r,
        peak,
      };
    })
    .filter((s) => Number.isFinite(s.lat) && Number.isFinite(s.lng))
    .sort((a, b) => Number(a.id) - Number(b.id));

  // Normalization: map the 92nd-percentile per-station peak to index 1.0, so the
  // major hubs saturate hot while typical and outer stations still read on the
  // ramp (rather than letting a single mega-hub flatten everyone else to ~0).
  const peaks = stations.map((s) => s.peak).sort((a, b) => a - b);
  const norm = peaks[Math.floor(peaks.length * 0.92)] || 1;

  const out = {
    norm,
    hours: [...hours].sort((a, b) => a - b),
    stations,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out));

  // Stats for sanity.
  const idx = (p: number) => peaks[Math.floor(peaks.length * p)];
  console.log(`stations: ${stations.length}`);
  console.log(`hours: ${out.hours.join(", ")}`);
  console.log(
    `peak ridership percentiles  p50=${idx(0.5)}  p75=${idx(0.75)}  p92=${norm}  p99=${idx(0.99)}  max=${peaks[peaks.length - 1]}`,
  );
  console.log(`norm (index=1.0 at): ${norm}`);
  console.log(`wrote ${OUT_PATH}`);
}

main();
