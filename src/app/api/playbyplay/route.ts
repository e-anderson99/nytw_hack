import { NextRequest, NextResponse } from "next/server";
import { getLiveFeed } from "@/lib/sources/playbyplay";

// GET /api/playbyplay?gameId= — live, normalized play-by-play for the scoreboard
// + ticker + map shockwave. Returns a single 0-0 moment before tip-off.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") ?? undefined;
  const feed = await getLiveFeed(gameId);
  return NextResponse.json(feed);
}
