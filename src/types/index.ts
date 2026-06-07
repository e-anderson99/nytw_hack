// Core domain types for the NYC Sporting Event Crowd Intelligence Map.
// These define the contract between the API routes and the UI. The model is
// continuous-time and score-aware: crowd intensity is derived from a live game
// state (score gap + clock) blended with a precomputed historical baseline,
// rather than a handful of discrete phases.

/**
 * Live state of a game, the score-heat input to the crowd model.
 * `clockMinRemaining` counts down across the whole game (0 at the final buzzer).
 */
export interface GameState {
  status: "pre" | "live" | "final";
  /** ISO 8601 tipoff time. */
  tipoffISO: string;
  /** Absolute score gap between the two teams (0 = tied). */
  scoreDiff: number;
  /** Minutes left in the game across all remaining periods (0 at buzzer). */
  clockMinRemaining: number;
  /** Total game length in minutes (48 regulation; grows with OT). */
  gameLengthMin: number;
}

/**
 * Coarse phase relative to the game, used only to pick a temporal-drift curve.
 * Derived from timing, not a user-facing scrubber position.
 */
export type DriftPhase = "pre" | "during" | "post";

export type PriceTier = "$" | "$$" | "$$$";

/** A single cell in the predictive heat-map grid. */
export interface CrowdCell {
  id: string;
  lat: number;
  lng: number;
  /** Normalized crowd intensity, 0 (empty) → 1 (packed). */
  intensity: number;
}

export interface Venue {
  id: string;
  name: string;
  /** Street address — used for BestTime venue matching and display. */
  address: string;
  lat: number;
  lng: number;
  price: PriceTier;
  /** e.g. ["sports bar", "dive", "rooftop"] */
  vibe: string[];
  /** Normalized crowd level for the requested time, 0 → 1. */
  crowd: number;
  /** Estimated wait / line in minutes. */
  waitMins: number;
  /** Approximate standing capacity, used to derive wait from crowd. */
  capacity: number;

  // --- Google Places enrichment (populated by scripts/enrich-venues.ts) ---
  // The static seed ships without these; running the enrichment script overlays
  // them so the interactive Google map can pin exact locations and show ratings.
  /** Google Places place ID — the stable join key to Google's data. */
  placeId?: string;
  /** Google star rating, 0–5. */
  rating?: number;
  /** Number of Google ratings backing `rating`. */
  userRatingsTotal?: number;
  /** Deep link to the venue on Google Maps. */
  googleMapsUri?: string;
  /** Neighborhood label (e.g. "Hell's Kitchen"), for grouping/filtering. */
  neighborhood?: string;
}

export interface SubwayState {
  stationId: string;
  name: string;
  lines: string[];
  lat: number;
  lng: number;
  /** Normalized platform congestion for the requested time, 0 → 1. */
  congestion: number;
  /** True if this station is a recommended (less-crowded) exit/route. */
  recommended: boolean;
}

export interface GameEvent {
  id: string;
  team: string;
  opponent: string;
  /** Venue code — MSG for the MVP. */
  venue: "MSG";
  /** ISO 8601 tipoff time. */
  tipoff: string;
  soldOut: boolean;
}

/** User personalization filters. */
export interface CrowdFilters {
  /** Max crowd tolerance, 0 (dead only) → 1 (packed is fine). */
  maxCrowd: number;
  /** Acceptable price tiers. */
  prices: PriceTier[];
  /** Max walking distance from MSG, in meters. */
  maxWalkMeters: number;
  /** Preferred vibe tags (empty = no preference). */
  vibes: string[];
}

export interface Recommendation {
  venue: Venue;
  /** 0 → 1 match score against the user's filters. */
  score: number;
  /** Walking distance from MSG in meters. */
  distanceMeters: number;
  /** Suggested subway station to head to after. */
  subway: SubwayState | null;
  /** Human-readable rationale, e.g. "Quiet, $6 beers, 4 min walk". */
  reason: string;
}
