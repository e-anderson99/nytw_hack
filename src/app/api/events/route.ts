import { NextResponse } from "next/server";
import { EVENTS } from "@/data/events";

// GET /api/events — the (static) Knicks home schedule.
export function GET() {
  return NextResponse.json({ events: EVENTS });
}
