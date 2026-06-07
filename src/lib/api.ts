// Typed client for the backend API routes (built by the data/backend team).
// The UI only talks to the app's own /api/* endpoints; this module centralizes
// query-string building and response typing so components stay declarative.

import type {
  CrowdCell,
  CrowdFilters,
  GameEvent,
  GameState,
  Recommendation,
  SubwayState,
  Venue,
} from "@/types";

export interface CrowdResponse {
  gameState: GameState;
  tNow: string;
  tFuture: string;
  cells: CrowdCell[];
}

export interface VenuesResponse {
  gameState: GameState;
  tFuture: string;
  venues: Venue[];
}

export interface SubwayResponse {
  gameState: GameState;
  tFuture: string;
  stations: SubwayState[];
}

export interface RecommendResponse {
  gameState: GameState;
  tFuture: string;
  recommendations: Recommendation[];
}

/** One sampled moment in the heat timeline. */
export interface TimelineFrame {
  tFuture: string;
  cells: CrowdCell[];
  venues: Venue[];
  stations: SubwayState[];
}

export interface TimelineResponse {
  gameState: GameState;
  tNow: string;
  nightEndsAt: string;
  stepMin: number;
  frames: TimelineFrame[];
}

/** Shared timing/game params accepted by the predictive endpoints. */
export interface PredictParams {
  /** "Now" reference time (ISO or epoch ms). Defaults server-side to real now. */
  tNow?: string;
  /** Future time to predict for. Defaults to tNow. */
  tFuture?: string;
  /** Pin a specific NBA game for demos. */
  gameId?: string;
}

function qs(params: Record<string, string | number | undefined | string[]>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      if (value.length) sp.set(key, value.join(","));
    } else if (value !== "") {
      sp.set(key, String(value));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function getGameState(gameId?: string): Promise<{ gameState: GameState }> {
  return getJson(`/api/gamestate${qs({ gameId })}`);
}

export function getEvents(): Promise<{ events: GameEvent[] }> {
  return getJson(`/api/events`);
}

export function getCrowd(params: PredictParams = {}): Promise<CrowdResponse> {
  return getJson(`/api/crowd${qs({ ...params })}`);
}

export function getCrowdTimeline(
  params: PredictParams & { stepMin?: number } = {},
): Promise<TimelineResponse> {
  return getJson(`/api/crowd/timeline${qs({ ...params })}`);
}

export function getVenues(params: PredictParams = {}): Promise<VenuesResponse> {
  return getJson(`/api/venues${qs({ ...params })}`);
}

export function getSubway(params: PredictParams = {}): Promise<SubwayResponse> {
  return getJson(`/api/subway${qs({ ...params })}`);
}

export function getRecommendations(
  filters: CrowdFilters,
  params: PredictParams = {},
): Promise<RecommendResponse> {
  return getJson(
    `/api/recommend${qs({
      ...params,
      maxCrowd: filters.maxCrowd,
      maxWalkMeters: filters.maxWalkMeters,
      prices: filters.prices,
      vibes: filters.vibes,
    })}`,
  );
}
