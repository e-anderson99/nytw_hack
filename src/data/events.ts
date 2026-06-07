import type { GameEvent } from "@/types";

// Static Knicks home slate for the MVP. Hand-entered; expand as needed.
// (Seed sample — fill in the real schedule during data seeding.)
export const EVENTS: GameEvent[] = [
  {
    id: "knicks-2026-01-15",
    team: "New York Knicks",
    opponent: "Boston Celtics",
    venue: "MSG",
    tipoff: "2026-01-15T19:30:00-05:00",
    soldOut: true,
  },
];

export function getEvent(id: string): GameEvent | undefined {
  return EVENTS.find((e) => e.id === id);
}
