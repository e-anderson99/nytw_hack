import { NextRequest, NextResponse } from "next/server";
import { buildContext, predictGrid } from "@/lib/crowd";

// GET /api/crowd?tNow=&tFuture=&gameId= — predictive heat-map grid around MSG.
// Each cell intensity = predicted_crowd(current × temporal_drift, baseline).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);
  const cells = predictGrid(ctx);

  return NextResponse.json({
    gameState: ctx.gameState,
    tNow: new Date(ctx.tNowMs).toISOString(),
    tFuture: new Date(ctx.tFutureMs).toISOString(),
    cells,
  });
}
