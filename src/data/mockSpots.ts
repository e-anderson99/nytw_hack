// Mock watch-spots for the "In your map" bento card. Self-contained demo data
// (no backend) — each spot carries a crowd level and average crowd age so the
// preferences sliders can filter/sort them client-side.

import type { PriceTier } from "@/types";

export interface MockSpot {
  id: string;
  name: string;
  /** Normalized crowd level, 0 (quiet) → 1 (packed). */
  crowd: number;
  /** Average age of the crowd, for the age filter. */
  avgAge: number;
  price: PriceTier;
  /** Walking distance from MSG, in meters. */
  distanceMeters: number;
  vibe: string;
  /** Approximate location, for placing numbered pins on the map. */
  lat: number;
  lng: number;
}

export const MOCK_SPOTS: MockSpot[] = [
  { id: "stout", name: "Stout NYC", crowd: 0.82, avgAge: 26, price: "$$", distanceMeters: 240, vibe: "sports bar", lat: 40.7486, lng: -73.9878 },
  { id: "blarney", name: "Blarney Rock Pub", crowd: 0.45, avgAge: 31, price: "$", distanceMeters: 300, vibe: "dive", lat: 40.7491, lng: -73.9887 },
  { id: "legends", name: "Legends NYC", crowd: 0.71, avgAge: 24, price: "$$", distanceMeters: 520, vibe: "sports bar", lat: 40.7479, lng: -73.9856 },
  { id: "mustang", name: "Mustang Harry's", crowd: 0.58, avgAge: 28, price: "$$", distanceMeters: 410, vibe: "pub", lat: 40.7497, lng: -73.9914 },
  { id: "smithfield", name: "Smithfield Hall", crowd: 0.9, avgAge: 23, price: "$$", distanceMeters: 880, vibe: "sports bar", lat: 40.7443, lng: -73.993 },
  { id: "ginger", name: "The Ginger Man", crowd: 0.33, avgAge: 34, price: "$$$", distanceMeters: 980, vibe: "beer bar", lat: 40.7489, lng: -73.9828 },
  { id: "pony", name: "The Pony Bar", crowd: 0.27, avgAge: 29, price: "$", distanceMeters: 1500, vibe: "dive", lat: 40.76, lng: -73.993 },
  { id: "social", name: "Social Bar & Lounge", crowd: 0.64, avgAge: 27, price: "$$", distanceMeters: 1700, vibe: "lounge", lat: 40.7616, lng: -73.9856 },
];

export function crowdLabel(crowd: number): string {
  if (crowd < 0.34) return "Quiet";
  if (crowd < 0.67) return "Buzzing";
  return "Packed";
}
