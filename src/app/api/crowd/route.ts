import { NextRequest, NextResponse } from "next/server";
import { buildContext, predictHeatCells } from "@/lib/crowd";

// GET /api/crowd?tNow=&tFuture=&gameId= — citywide predictive heat field.
// One cell per crowd node (MSG + venues + every station); intensity =
// predicted_crowd(current × temporal_drift, baseline).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);
  const cells = predictHeatCells(ctx);

  return NextResponse.json({
    gameState: ctx.gameState,
    tNow: new Date(ctx.tNowMs).toISOString(),
    tFuture: new Date(ctx.tFutureMs).toISOString(),
    cells,
  });
}
