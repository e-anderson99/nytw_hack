import { NextRequest, NextResponse } from "next/server";
import type { PriceTier, Recommendation, SubwayState, Venue } from "@/types";
import { VENUES } from "@/data/venues";
import { STATIONS } from "@/data/subway";
import { buildContext, predictAt } from "@/lib/crowd";
import { MSG, distanceMeters } from "@/lib/predict";

// GET /api/recommend?tNow=&tFuture=&gameId=&maxCrowd=&prices=&maxWalkMeters=&vibes=&limit=
// Ranks venues against the user's filters and returns the top `limit` (default
// 3), each with lat/lng for map pins and a less-crowded station to exit by.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);

  const maxCrowd = numParam(searchParams.get("maxCrowd"), 1);
  const maxWalkMeters = numParam(searchParams.get("maxWalkMeters"), 1500);
  const prices = listParam(searchParams.get("prices")) as PriceTier[];
  const vibes = listParam(searchParams.get("vibes"));
  const limit = Math.max(1, numParam(searchParams.get("limit"), 3));

  // Predicted congestion per station once, for exit suggestions.
  const stationStates: SubwayState[] = STATIONS.map((s) => {
    const congestion = predictAt(ctx, s.stationId, s);
    return { ...s, congestion, recommended: congestion < 0.6 };
  });

  const recommendations: Recommendation[] = VENUES.map((base) => {
    const crowd = predictAt(ctx, base.id, base);
    const waitMins = Math.round(crowd * (base.capacity / 20));
    const venue: Venue = { ...base, crowd, waitMins };
    const dist = distanceMeters(MSG, venue);
    return { venue, dist };
  })
    .filter(({ venue, dist }) => {
      if (venue.crowd > maxCrowd) return false;
      if (dist > maxWalkMeters) return false;
      if (prices.length && !prices.includes(venue.price)) return false;
      if (vibes.length && !venue.vibe.some((v) => vibes.includes(v))) return false;
      return true;
    })
    .map(({ venue, dist }) => {
      const subway = leastCrowdedNearStation(venue, stationStates);
      const score = matchScore(venue, dist, maxWalkMeters, vibes);
      return {
        venue,
        score,
        distanceMeters: Math.round(dist),
        subway,
        reason: reasonFor(venue, dist, subway),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return NextResponse.json({
    gameState: ctx.gameState,
    tFuture: new Date(ctx.tFutureMs).toISOString(),
    recommendations,
  });
}

function numParam(v: string | null, fallback: number): number {
  const n = v == null ? NaN : Number(v);
  return isNaN(n) ? fallback : n;
}

function listParam(v: string | null): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

function matchScore(
  venue: Venue,
  dist: number,
  maxWalkMeters: number,
  vibes: string[],
): number {
  const quiet = 1 - venue.crowd; // less crowded is better
  const close = 1 - Math.min(1, dist / maxWalkMeters);
  const vibeMatch = vibes.length
    ? venue.vibe.filter((v) => vibes.includes(v)).length / vibes.length
    : 0.5;
  return Math.max(0, Math.min(1, 0.55 * quiet + 0.3 * close + 0.15 * vibeMatch));
}

function leastCrowdedNearStation(
  venue: Venue,
  stations: SubwayState[],
  radius = 900,
): SubwayState | null {
  const near = stations.filter((s) => distanceMeters(s, venue) <= radius);
  const pool = near.length ? near : stations;
  if (!pool.length) return null;
  return pool.reduce((a, b) => (b.congestion < a.congestion ? b : a));
}

function reasonFor(venue: Venue, dist: number, subway: SubwayState | null): string {
  const crowdLabel =
    venue.crowd < 0.33 ? "Quiet" : venue.crowd < 0.66 ? "Moderate" : "Packed";
  const walkMins = Math.max(1, Math.round(dist / 80));
  const parts = [crowdLabel, venue.price, `${walkMins} min walk`];
  if (subway) parts.push(`exit via ${subway.name}`);
  return parts.join(", ");
}
