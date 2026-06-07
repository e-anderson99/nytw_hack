// NBA live game-state adapter.
//
// Uses the free, keyless NBA live JSON feeds:
//   scoreboard: https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json
//   boxscore:   https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json
//
// gameStatus: 1 = not started, 2 = live, 3 = final.
// gameClock is an ISO 8601 duration like "PT05M30.00S" (time left in `period`).

import type { GameState } from "@/types";
import {
  clockMinRemaining,
  gameLengthMinutes,
  parseGameClockMinutes,
} from "@/lib/score";

const SCOREBOARD_URL =
  "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json";
const BOXSCORE_URL = (gameId: string) =>
  `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;

const KNICKS_TRICODE = "NYK";

interface ScoreboardTeam {
  teamTricode: string;
  score: number;
}
interface ScoreboardGame {
  gameId: string;
  gameStatus: number;
  gameStatusText: string;
  gameTimeUTC: string;
  homeTeam: ScoreboardTeam;
  awayTeam: ScoreboardTeam;
}
interface ScoreboardResponse {
  scoreboard?: { games?: ScoreboardGame[] };
}

interface BoxscoreResponse {
  game?: {
    gameId: string;
    gameStatus: number;
    gameTimeUTC: string;
    period: number;
    regulationPeriods?: number;
    gameClock: string;
    homeTeam: { teamTricode: string; score: number };
    awayTeam: { teamTricode: string; score: number };
  };
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      // Live data — never cache.
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Map an NBA gameStatus int to our coarse status. */
function statusFrom(gameStatus: number): GameState["status"] {
  if (gameStatus === 3) return "final";
  if (gameStatus === 2) return "live";
  return "pre";
}

/**
 * Find today's Knicks game id from the scoreboard, if any. Returns null when
 * the Knicks aren't playing today.
 */
export async function findKnicksGameId(): Promise<string | null> {
  const data = await fetchJson<ScoreboardResponse>(SCOREBOARD_URL);
  const games = data?.scoreboard?.games ?? [];
  const game = games.find(
    (g) =>
      g.homeTeam?.teamTricode === KNICKS_TRICODE ||
      g.awayTeam?.teamTricode === KNICKS_TRICODE,
  );
  return game?.gameId ?? null;
}

/**
 * Resolve the current live GameState. Pass an explicit `gameId` (e.g. for a
 * demo) or let it discover today's Knicks game. Falls back to a pre-game state
 * when no live data is available so the model still produces sane output.
 */
export async function getGameState(gameId?: string): Promise<GameState> {
  const id = gameId ?? process.env.NBA_GAME_ID ?? (await findKnicksGameId());

  if (!id) return preGameFallback();

  const box = await fetchJson<BoxscoreResponse>(BOXSCORE_URL(id));
  const g = box?.game;
  if (!g) return preGameFallback();

  const status = statusFrom(g.gameStatus);
  const regulationPeriods = g.regulationPeriods ?? 4;
  const perPeriodClock = parseGameClockMinutes(g.gameClock);
  const scoreDiff = Math.abs((g.homeTeam?.score ?? 0) - (g.awayTeam?.score ?? 0));

  const gameLengthMin = gameLengthMinutes(g.period || 1, regulationPeriods);
  const remaining =
    status === "final"
      ? 0
      : status === "pre"
        ? gameLengthMin
        : clockMinRemaining(g.period || 1, perPeriodClock, regulationPeriods);

  return {
    status,
    tipoffISO: g.gameTimeUTC,
    scoreDiff,
    clockMinRemaining: remaining,
    gameLengthMin,
  };
}

function preGameFallback(): GameState {
  return {
    status: "pre",
    tipoffISO: new Date().toISOString(),
    scoreDiff: 0,
    clockMinRemaining: 48,
    gameLengthMin: 48,
  };
}
