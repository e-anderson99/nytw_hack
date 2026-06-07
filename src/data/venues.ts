import type { Venue } from "@/types";

// Base venue list near MSG. `crowd` and `waitMins` here are baseline values;
// the prediction layer scales them per game phase. Seed with real lat/lng,
// price, and vibe during data seeding (~25 bars target).
export const VENUES: Omit<Venue, "crowd" | "waitMins">[] = [
  {
    id: "stout-nyc",
    name: "Stout NYC",
    lat: 40.7505,
    lng: -73.9912,
    price: "$$",
    vibe: ["sports bar", "pub"],
    capacity: 300,
  },
];
