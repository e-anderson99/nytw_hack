import { NextRequest, NextResponse } from "next/server";
import type { Venue } from "@/types";
import { VENUES } from "@/data/venues";
import { clamp01, distanceDecay } from "@/lib/predict";

// GET /api/venues?eventId=&scoreDiff=&clockMinRemaining=&status= — venues with
// time-adjusted crowd + wait. Stub: crowd is a proximity-only baseline; the
// prediction pass folds in the score-aware GameState heat model.
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId") ?? "";

  const venues: Venue[] = VENUES.map((v) => {
    // TODO: scale by GameState score-heat (blowout vs. nail-biter, clock).
    const crowd = clamp01(0.4 * (0.5 + distanceDecay(v)));
    const waitMins = Math.round(crowd * (v.capacity / 20));
    return { ...v, crowd, waitMins };
  });

  return NextResponse.json({ eventId, venues });
}
