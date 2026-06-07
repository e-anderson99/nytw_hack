import { NextRequest, NextResponse } from "next/server";
import type { SubwayState } from "@/types";
import { STATIONS } from "@/data/subway";

// GET /api/subway?eventId=&scoreDiff=&clockMinRemaining=&status= — station
// congestion + route recommendations. Stub: returns a flat baseline; the
// prediction pass peaks congestion near the final buzzer (GameState) and flags
// below-threshold stations as better exits.
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId") ?? "";

  const stations: SubwayState[] = STATIONS.map((s) => {
    // TODO: drive congestion from GameState (let-out surge near buzzer).
    const congestion = 0.2;
    return { ...s, congestion, recommended: congestion < 0.6 };
  });

  return NextResponse.json({ eventId, stations });
}
