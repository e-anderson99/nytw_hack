"use client";

// Top bento card: the scoreboard, styled after Google's game-score panel —
// a "NBA · date / status" header row, then logos flanking the big score with
// team names edge-aligned underneath. Score tracks the simulated live feed.

import Image from "next/image";
import { AWAY, HOME } from "@/data/gameFeed";
import type { GameFeedState } from "@/lib/useGameFeed";

interface ScorePanelProps {
  feed: GameFeedState;
  league?: string;
  date?: string;
}

function statusLabel(feed: GameFeedState): string {
  const { current } = feed;
  if (current.tag === "FINAL") return "Final";
  return `Q${current.period} · ${current.clock}`;
}

export default function ScorePanel({
  feed,
  league = "NBA Finals",
  date = "June 8th",
}: ScorePanelProps) {
  const { score, leading } = feed;
  const status = statusLabel(feed);

  return (
    <section className="card glass card--score" aria-label="Live score">
      <div className="score-head">
        <span className="score-league">{league} · {date}</span>
        <span className="score-status">{status}</span>
      </div>

      <div className="score-board">
        <div className="score-team home">
          <div className="team-logo">
            <Image
              src="/knicks-logo.png"
              alt={`${HOME.fullName} logo`}
              fill
              sizes="96px"
              className="team-logo-img"
              priority
            />
          </div>
          <span className="team-name">{HOME.fullName}</span>
        </div>

        <div className="score-points">
          <span className={`num ${leading === "nyk" ? "is-leading" : leading ? "is-trailing" : ""}`}>
            {score.nyk}
          </span>
          <span className="dash">–</span>
          <span className={`num ${leading === "sas" ? "is-leading" : leading ? "is-trailing" : ""}`}>
            {score.sas}
          </span>
        </div>

        <div className="score-team away">
          <div className="team-logo">
            <Image
              src="/spurs-logo.png"
              alt={`${AWAY.fullName} logo`}
              fill
              sizes="96px"
              className="team-logo-img"
              priority
            />
          </div>
          <span className="team-name">{AWAY.fullName}</span>
        </div>
      </div>
    </section>
  );
}
