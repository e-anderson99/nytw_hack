import { NextRequest, NextResponse } from "next/server";
import type { CrowdCell } from "@/types";

// GET /api/crowd?eventId=&scoreDiff=&clockMinRemaining=&status= — heat-map grid.
// Stub: returns an empty grid with the correct shape. The prediction pass fills
// this from the score-aware GameState model blended with a historical baseline
// and distance decay from MSG (see @/lib/predict).
export function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId") ?? "";

  const cells: CrowdCell[] = [];

  return NextResponse.json({ eventId, cells });
}
