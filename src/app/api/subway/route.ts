import { NextRequest, NextResponse } from "next/server";
import type { SubwayState } from "@/types";
import { STATIONS } from "@/data/subway";
import { buildContext, predictAt } from "@/lib/crowd";

// GET /api/subway?tNow=&tFuture=&gameId= — station congestion + route hints.
// `recommended` flags below-threshold stations as better (less-crowded) exits.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);

  const stations: SubwayState[] = STATIONS.map((s) => {
    const congestion = predictAt(ctx, s.stationId, s);
    return { ...s, congestion, recommended: congestion < 0.6 };
  });

  return NextResponse.json({
    gameState: ctx.gameState,
    tFuture: new Date(ctx.tFutureMs).toISOString(),
    stations,
  });
}
