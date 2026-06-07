"use client";

// Top bento card: the scoreboard. "NBA Finals" eyebrow, team crests, big
// score. Score tracks the simulated live feed passed in from the page.

import { AWAY, HOME } from "@/data/gameFeed";
import type { GameFeedState } from "@/lib/useGameFeed";

interface ScorePanelProps {
  feed: GameFeedState;
  subtitle?: string;
}

export default function ScorePanel({
  feed,
  subtitle = "NBA Finals, June 8th",
}: ScorePanelProps) {
  const { score, leading } = feed;

  return (
    <section className="card glass card--score" aria-label="Live score">
      <span className="card-eyebrow">{subtitle}</span>

      <div className="score-scoreboard">
        <div className="score-team home">
          <span className="team-crest nyk">NY</span>
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
          <span className="team-crest sas">SA</span>
          <span className="team-name">{AWAY.fullName}</span>
        </div>
      </div>
    </section>
  );
}
