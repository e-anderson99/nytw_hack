import { NextRequest, NextResponse } from "next/server";
import type { Recommendation } from "@/types";

// GET /api/recommend?eventId=&maxCrowd=&prices=&maxWalkMeters=&vibes=
//   &scoreDiff=&clockMinRemaining=&status=
// Ranks venues against the user's filters and attaches a suggested subway exit.
// Stub: returns an empty ranked list with the correct shape. The scoring
// function (weighted distance over filter prefs, against the score-aware crowd
// model) lands in the prediction pass.
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId") ?? "";

  const recommendations: Recommendation[] = [];

  return NextResponse.json({ eventId, recommendations });
}
