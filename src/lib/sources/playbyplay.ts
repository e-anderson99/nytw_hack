// Live play-by-play adapter. Turns the keyless NBA live pbp feed into the same
// FeedMoment shape the simulated broadcast used (src/data/gameFeed.ts), so the
// scoreboard / ticker / map shockwave can run off the REAL game.
//
//   pbp: https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gameId}.json
//
// The offline generator (scripts/genGameFeed.mjs) read a precomputed
// `impact_score` column. There's no such column live, so we derive a comparable
// signal here: points scored (or a virtual weight for steals/blocks/turnovers),
// scaled by how late and how close the game is, signed from a Knicks-fan POV.

import type { FeedMoment, FeedTone } from "@/data/gameFeed";
import { fetchNbaJson, findKnicksGameId, getGameState } from "@/lib/sources/nba";

const KNICKS_TRICODE = "NYK";

const PBP_URL = (gameId: string) =>
  `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${gameId}.json`;
const BOXSCORE_URL = (gameId: string) =>
  `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_${gameId}.json`;

interface PbpAction {
  actionNumber: number;
  period: number;
  clock: string;
  scoreHome: string;
  scoreAway: string;
  teamTricode: string | null;
  actionType: string;
  subType?: string;
  description?: string;
  shotResult?: string | null;
}
interface PbpResponse {
  game?: { gameId: string; actions?: PbpAction[] };
}
interface BoxLite {
  game?: {
    gameStatus: number;
    homeTeam: { teamTricode: string };
    awayTeam: { teamTricode: string };
  };
}

export interface LiveFeed {
  status: "pre" | "live" | "final";
  /** Whether the Knicks are the home team for this game (score-column mapping). */
  nykIsHome: boolean;
  moments: FeedMoment[];
}

/** "PT11M38.00S" -> "11:38", "PT00M07.50S" -> "0:07". */
function fmtClock(iso: string | undefined): string {
  if (!iso) return "";
  const m = /PT(\d+)M(\d+)(?:\.\d+)?S/.exec(iso);
  if (!m) return "";
  return `${parseInt(m[1], 10)}:${m[2].padStart(2, "0")}`;
}

/** Drop running point totals so chips stay short, like the offline feed did. */
const cleanText = (t: string) => t.replace(/\s*\(\d+\s+PTS\)/g, "").trim();

const SCORING = new Set(["2pt", "3pt", "freethrow"]);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function normalize(a: PbpAction, nykIsHome: boolean): FeedMoment {
  const desc = a.description ?? "";
  const team = a.teamTricode;
  const isNyk = team === KNICKS_TRICODE;

  const scoring = SCORING.has(a.actionType);
  const missed = a.shotResult === "Missed" || /^MISS\b/i.test(desc);
  const made = scoring && !missed;

  let tone: FeedTone = "neutral";
  if (made) tone = isNyk ? "good" : "bad";
  else if (a.actionType === "turnover") tone = isNyk ? "bad" : "good";
  else if (a.actionType === "steal" || a.actionType === "block")
    tone = isNyk ? "good" : "bad";

  const pfx = team ? `${team} ` : "";
  let tag: string | undefined;
  if (/alley\s*oop/i.test(desc)) tag = `${pfx}ALLEY-OOP`;
  else if (/dunk/i.test(desc)) tag = `${pfx}DUNK`;
  else if (made && a.actionType === "3pt") tag = `${pfx}3`;
  else if (made && a.actionType === "2pt") tag = `${pfx}2`;
  else if (made && a.actionType === "freethrow") tag = `${pfx}FT`;
  else if (a.actionType === "steal") tag = `${pfx}STEAL`;
  else if (a.actionType === "block") tag = `${pfx}BLOCK`;
  else if (a.actionType === "turnover") tag = `${pfx}TOV`;
  else if (/timeout/i.test(desc) || a.actionType === "timeout") tag = "TIMEOUT";

  const nyk = Number(nykIsHome ? a.scoreHome : a.scoreAway) || 0;
  const sas = Number(nykIsHome ? a.scoreAway : a.scoreHome) || 0;
  const margin = Math.abs(nyk - sas);

  const points =
    a.actionType === "3pt" ? 3 : a.actionType === "2pt" ? 2 : a.actionType === "freethrow" ? 1 : 0;
  const base = made
    ? points
    : a.actionType === "steal" || a.actionType === "block" || a.actionType === "turnover"
      ? 1.5
      : 0;
  const periodW = a.period >= 4 ? 2.5 : 1 + 0.3 * (a.period - 1);
  const closeW = margin <= 3 ? 1.6 : margin <= 6 ? 1.3 : margin <= 10 ? 1.1 : 1;
  const sign = tone === "good" ? 1 : tone === "bad" ? -1 : 0;
  const impact = clamp(sign * base * periodW * closeW, -16, 16);

  return {
    period: a.period,
    clock: fmtClock(a.clock),
    score: `${nyk}-${sas}`,
    text: cleanText(desc) || "—",
    tone,
    tag,
    impact: Math.round(impact * 100) / 100,
  };
}

const preGameFeed = (nykIsHome: boolean): LiveFeed => ({
  status: "pre",
  nykIsHome,
  moments: [
    {
      period: 1,
      clock: "12:00",
      score: "0-0",
      text: "Tip-off soon — Knicks vs. Spurs at Madison Square Garden",
      tone: "neutral",
      impact: 0,
    },
  ],
});

/**
 * Build the live FeedMoment[] for a game. Resolves the game id the same way
 * getGameState does (explicit -> NBA_GAME_ID -> today's Knicks game), and falls
 * back to a single 0-0 pre-game moment when the game hasn't started (or the pbp
 * feed isn't published yet), so the scoreboard reads a true 0-0 before tip.
 */
export async function getLiveFeed(gameId?: string): Promise<LiveFeed> {
  const state = await getGameState(gameId);
  const box = await fetchNbaJson<BoxLite>(
    BOXSCORE_URL(gameId ?? process.env.NBA_GAME_ID ?? ""),
  );
  const homeTri = box?.game?.homeTeam?.teamTricode;
  const nykIsHome = homeTri ? homeTri === KNICKS_TRICODE : true;

  if (state.status === "pre") return preGameFeed(nykIsHome);

  const id = gameId ?? process.env.NBA_GAME_ID;
  // The id is needed for the pbp URL; if it wasn't passed/pinned, re-discover via
  // the same path getGameState used. getGameState already proved a game exists.
  const resolvedId = id ?? (await findKnicksGameId());
  if (!resolvedId) return preGameFeed(nykIsHome);

  const pbp = await fetchNbaJson<PbpResponse>(PBP_URL(resolvedId));
  const actions = pbp?.game?.actions ?? [];
  if (!actions.length) return preGameFeed(nykIsHome);

  const moments = actions
    .filter((a) => (a.description ?? "").trim().length > 0)
    .map((a) => normalize(a, nykIsHome));

  if (state.status === "final" && moments.length) {
    const last = moments[moments.length - 1];
    const [nyk, sas] = last.score.split("-").map((n) => parseInt(n, 10));
    const won = nyk > sas;
    moments.push({
      period: last.period,
      clock: "0:00",
      score: last.score,
      text: won ? "Final buzzer — Knicks win it!" : "Final buzzer — Spurs take it",
      tone: won ? "good" : "bad",
      tag: "FINAL",
      impact: 0,
    });
  }

  return { status: state.status, nykIsHome, moments };
}
