/**
 * Precompute the historical baselines the crowd model reads at request time.
 *
 * Outputs (committed JSON, overwritten on each run):
 *   src/data/baselines/mta-nongame.json
 *     Record<stationId, number[168]> — average ridership by hour-of-week on
 *     NON-game days. The denominator of mtaHourIndex.
 *   src/data/baselines/historical.json
 *     Record<locationId, Record<dayOfWeek, Record<minutesRelToEnd, number>>>
 *     normalized 0-1 crowd curves around game let-out. The baseline term of
 *     predicted_crowd. Stations come from real MTA game-day ridership; venues
 *     from BestTime weekly curves mapped through a typical game-end clock time.
 *
 * Run:  npx tsx scripts/build-baselines.ts
 * Needs network; BESTTIME_API_KEY (venues) and SOCRATA_APP_TOKEN (optional) in env.
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Minimal .env.local loader — this standalone script doesn't get Next.js's
// automatic env loading, and we don't want a dotenv dependency. Only sets keys
// not already present in the environment (so inline `KEY=... npm run` wins).
(function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined && val !== "") process.env[key] = val;
  }
})();

import { EVENTS } from "@/data/events";
import { STATIONS } from "@/data/subway";
import { VENUES } from "@/data/venues";
import { fetchHourlyRidership, STATION_COMPLEX } from "@/lib/sources/mta";
import { fetchVenueWeeklyCurve } from "@/lib/sources/popularTimes";

const OUT_DIR = resolve(process.cwd(), "src/data/baselines");
const HOURS_IN_WEEK = 168;
/** Typical minutes from tipoff to final buzzer (incl. stoppages). */
const GAME_DURATION_MIN = 150;
/** How far back to sample non-game ridership. */
const LOOKBACK_DAYS = 120;

/** Parse a Socrata floating timestamp ("YYYY-MM-DDTHH:mm:ss") into parts. */
function parseWallClock(ts: string) {
  const [datePart, timePart = "00:00:00"] = ts.split("T");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, mi, s] = timePart.split(":").map(Number);
  const utcMs = Date.UTC(y, mo - 1, d, h, mi || 0, s || 0);
  const dow = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return { y, mo, d, h, dow, utcMs, dateKey: datePart };
}

function hourOfWeek(dow: number, hour: number) {
  return (dow * 24 + hour) % HOURS_IN_WEEK;
}

function isoFloating(ms: number) {
  return new Date(ms).toISOString().slice(0, 19);
}

/** Game-end wall-clock (ms, UTC-based) for each event. */
function eventEnds() {
  return EVENTS.map((e) => {
    const t = parseWallClock(e.tipoff.replace(/[+-]\d{2}:\d{2}$/, ""));
    return {
      id: e.id,
      endMs: t.utcMs + GAME_DURATION_MIN * 60_000,
      dateKey: t.dateKey,
    };
  });
}

async function buildMtaNonGame() {
  const ends = eventEnds();
  const gameDates = new Set(ends.map((e) => e.dateKey));
  const now = Date.now();
  const startISO = isoFloating(now - LOOKBACK_DAYS * 86_400_000);
  const endISO = isoFloating(now);

  const out: Record<string, number[]> = {};

  for (const s of STATIONS) {
    const complex = STATION_COMPLEX[s.stationId];
    if (!complex) continue;
    const rows = await fetchHourlyRidership(complex, startISO, endISO);
    const sums = new Array(HOURS_IN_WEEK).fill(0);
    const counts = new Array(HOURS_IN_WEEK).fill(0);
    for (const r of rows) {
      const p = parseWallClock(r.transit_timestamp);
      if (gameDates.has(p.dateKey)) continue; // exclude game days
      const how = hourOfWeek(p.dow, p.h);
      sums[how] += r.ridership;
      counts[how] += 1;
    }
    out[s.stationId] = sums.map((v, i) => (counts[i] ? v / counts[i] : 0));
    console.log(`[mta] ${s.stationId}: ${rows.length} rows`);
  }
  return out;
}

async function buildStationHistorical(
  historical: Record<string, Record<string, Record<string, number>>>,
) {
  const ends = eventEnds();
  for (const s of STATIONS) {
    const complex = STATION_COMPLEX[s.stationId];
    if (!complex) continue;
    // Accumulate (dow -> minuteBucket -> [values]) across all games.
    const acc: Record<string, Record<string, number[]>> = {};
    for (const ev of ends) {
      const winStart = isoFloating(ev.endMs - GAME_DURATION_MIN * 60_000);
      const winEnd = isoFloating(ev.endMs + 90 * 60_000);
      const rows = await fetchHourlyRidership(complex, winStart, winEnd);
      for (const r of rows) {
        const p = parseWallClock(r.transit_timestamp);
        const minutesRel = Math.round((p.utcMs - ev.endMs) / 60_000);
        const bucket = String(Math.round(minutesRel / 5) * 5);
        const dow = String(p.dow);
        (acc[dow] ??= {})[bucket] ??= [];
        acc[dow][bucket].push(r.ridership);
      }
    }
    // Average then normalize each dow curve to 0-1.
    const byDow: Record<string, Record<string, number>> = {};
    for (const dow of Object.keys(acc)) {
      const avg: Record<string, number> = {};
      let max = 0;
      for (const b of Object.keys(acc[dow])) {
        const arr = acc[dow][b];
        avg[b] = arr.reduce((a, x) => a + x, 0) / arr.length;
        max = Math.max(max, avg[b]);
      }
      byDow[dow] = {};
      for (const b of Object.keys(avg)) byDow[dow][b] = max ? avg[b] / max : 0;
    }
    if (Object.keys(byDow).length) historical[s.stationId] = byDow;
    console.log(`[mta-hist] ${s.stationId}: ${Object.keys(byDow).length} dows`);
  }
}

async function buildVenueHistorical(
  historical: Record<string, Record<string, Record<string, number>>>,
) {
  const ends = eventEnds();
  // Distinct (dow, endHour) pairs we actually have games for.
  const endProfiles = ends.map((e) => {
    const d = new Date(e.endMs);
    return { dow: d.getUTCDay(), endHour: d.getUTCHours() + d.getUTCMinutes() / 60 };
  });

  for (const v of VENUES) {
    const curve = await fetchVenueWeeklyCurve(v.name, v.address);
    if (!curve) {
      console.log(`[venue] ${v.id}: no BestTime data (skipped)`);
      continue;
    }
    const byDow: Record<string, Record<string, number>> = {};
    for (const prof of endProfiles) {
      const dowKey = String(prof.dow);
      byDow[dowKey] ??= {};
      for (let m = -GAME_DURATION_MIN; m <= 90; m += 15) {
        const clock = prof.endHour + m / 60;
        const day = (prof.dow + Math.floor(clock / 24) + 7) % 7;
        const hour = ((Math.round(clock) % 24) + 24) % 24;
        byDow[dowKey][String(m)] = curve.byDayHour[day]?.[hour] ?? 0;
      }
    }
    historical[v.id] = byDow;
    console.log(`[venue] ${v.id}: ${Object.keys(byDow).length} dows`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const mtaNonGame = await buildMtaNonGame();
  writeFileSync(
    resolve(OUT_DIR, "mta-nongame.json"),
    JSON.stringify(mtaNonGame, null, 2),
  );

  const historical: Record<string, Record<string, Record<string, number>>> = {};
  await buildStationHistorical(historical);
  await buildVenueHistorical(historical);
  writeFileSync(
    resolve(OUT_DIR, "historical.json"),
    JSON.stringify(historical, null, 2),
  );

  console.log("Baselines written to", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
