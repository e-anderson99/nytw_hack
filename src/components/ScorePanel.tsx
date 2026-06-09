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
  date = "June 10th",
}: ScorePanelProps) {
  const { score, leading } = feed;
  const status = statusLabel(feed);
  const isLive = feed.current.tag !== "FINAL";

  return (
    <section className="card glass card--score" aria-label="Live score">
      <div className="score-head">
        <span className="score-league">{league} · {date}</span>
        <span className="score-status">
          {isLive && (
            <span className="score-live" aria-label="Live">
              <span className="score-livedot" />
              LIVE
            </span>
          )}
          {status}
        </span>
      </div>

      <div className="score-board">
        <div className="score-team home">
          <Image
            src="/knicks-logo.png"
            alt={`${HOME.fullName} logo`}
            width={696}
            height={572}
            className="team-logo-img"
            priority
          />
          <span className="team-name">{HOME.fullName}</span>
        </div>

        <div className="score-points">
          {/* key on the value so the element re-mounts and replays score-pop on each change */}
          <span
            key={`nyk-${score.nyk}`}
            className={`num ${leading === "nyk" ? "is-leading" : leading ? "is-trailing" : ""}`}
          >
            {score.nyk}
          </span>
          <span className="dash">–</span>
          <span
            key={`sas-${score.sas}`}
            className={`num ${leading === "sas" ? "is-leading is-away" : leading ? "is-trailing" : ""}`}
          >
            {score.sas}
          </span>
        </div>

        <div className="score-team away">
          {/* unoptimized — Next.js recompression washes out the silver spur */}
          <Image
            src="/spurs-logo.png"
            alt={`${AWAY.fullName} logo`}
            width={409}
            height={336}
            className="team-logo-img team-logo-img--spurs"
            priority
            unoptimized
          />
          <span className="team-name">{AWAY.fullName}</span>
        </div>
      </div>
    </section>
  );
}
