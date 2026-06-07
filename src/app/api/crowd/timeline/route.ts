import { NextRequest, NextResponse } from "next/server";
import { buildContext } from "@/lib/crowd";
import { buildTimeline, MAX_FRAMES } from "@/lib/timeline";
import { nextNightEndMs } from "@/lib/time";

// GET /api/crowd/timeline?tNow=&stepMin=&gameId=
// Predicted heat from `tNow` to the next 2 AM (New York), sampled every
// `stepMin` minutes (default 2). Each frame = grid + venues + stations at that
// time. One NBA + MTA fetch powers every frame; `tFuture` is ignored here.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ctx = await buildContext(searchParams);

  // Default 2 when absent/empty/invalid; otherwise clamp to [1, 30].
  // (Number("") and Number(null) are both 0, so guard for a positive number.)
  const rawStep = searchParams.get("stepMin");
  const parsedStep = rawStep == null ? NaN : Number(rawStep);
  const stepMin =
    Number.isFinite(parsedStep) && parsedStep > 0
      ? Math.min(30, Math.max(1, parsedStep))
      : 2;

  const nightEndMs = nextNightEndMs(ctx.tNowMs);
  const frames = buildTimeline(ctx, stepMin, nightEndMs, { round: 3 }).slice(
    0,
    MAX_FRAMES,
  );

  return NextResponse.json({
    gameState: ctx.gameState,
    tNow: new Date(ctx.tNowMs).toISOString(),
    nightEndsAt: new Date(nightEndMs).toISOString(),
    stepMin,
    frames,
  });
}
