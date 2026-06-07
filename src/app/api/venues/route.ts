import { NextRequest, NextResponse } from "next/server";
import type { Venue } from "@/types";
import { VENUES } from "@/data/venues";
import { buildContext, predictAt } from "@/lib/crowd";

// GET /api/venues?tNow=&tFuture=&gameId= — venues with predicted crowd + wait.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);

  const venues: Venue[] = VENUES.map((v) => {
    const crowd = predictAt(ctx, v.id, v);
    const waitMins = Math.round(crowd * (v.capacity / 20));
    return { ...v, crowd, waitMins };
  });

  return NextResponse.json({
    gameState: ctx.gameState,
    tFuture: new Date(ctx.tFutureMs).toISOString(),
    venues,
  });
}
