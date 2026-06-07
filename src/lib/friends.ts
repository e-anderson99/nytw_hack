// Mock "people to watch with" overlay. The social graph / real check-ins are a
// backend concern; for the demo this scatters a believable cohort of fans
// around the watch spots, filtered by the user's age / school preferences.

import type { Venue } from "@/types";
import type { FriendsPrefs } from "@/components/FilterPanel";

export interface FriendPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  age: number;
  school: string;
  /** Venue they're currently at. */
  venueName: string;
}

const FIRST = [
  "Maya", "Jordan", "Priya", "Liam", "Sofia", "Andre", "Chloe", "Marcus",
  "Nina", "Theo", "Aisha", "Diego", "Hana", "Owen", "Zara", "Kai",
];
const SCHOOLS = ["NYU", "Columbia", "Fordham", "Baruch", "Pace", "The New School"];

/** Stable, believable average crowd age for a venue (24–34), keyed by id. */
export function avgAgeForVenue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000;
  return 24 + (h % 11);
}

// Deterministic pseudo-random so the overlay is stable across renders.
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function makeFriends(venues: Venue[], prefs: FriendsPrefs): FriendPin[] {
  if (!venues.length) return [];
  const rand = seeded(1337);
  const pins: FriendPin[] = [];

  venues.forEach((v, vi) => {
    const count = 1 + Math.floor(rand() * 3); // 1-3 people per venue
    for (let i = 0; i < count; i++) {
      const age = 18 + Math.floor(rand() * 22); // 18-39
      const school = SCHOOLS[Math.floor(rand() * SCHOOLS.length)];
      const name = FIRST[Math.floor(rand() * FIRST.length)];
      // Jitter around the venue so pins don't stack.
      const lat = v.lat + (rand() - 0.5) * 0.0012;
      const lng = v.lng + (rand() - 0.5) * 0.0012;
      pins.push({
        id: `${v.id}-f${vi}-${i}`,
        name,
        lat,
        lng,
        age,
        school,
        venueName: v.name,
      });
    }
  });

  return pins.filter((p) => {
    if (Math.abs(p.age - prefs.age) > 5) return false;
    if (prefs.school.trim()) {
      return p.school.toLowerCase().includes(prefs.school.trim().toLowerCase());
    }
    return true;
  });
}
