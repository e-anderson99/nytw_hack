import { NextRequest, NextResponse } from "next/server";
import { getGameState } from "@/lib/sources/nba";

// GET /api/gamestate?gameId= — live NBA game state (score gap + clock).
// The only per-request live call; everything else reads precomputed baselines.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get("gameId") ?? undefined;
  const gameState = await getGameState(gameId);
  return NextResponse.json({ gameState });
}
