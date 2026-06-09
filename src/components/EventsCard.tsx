"use client";

// Bento card for the play-by-play. Title reacts to who's leading ("Knicks are
// up!"), and moments stack newest-first in a scrollable glass feed.

import type { FeedMoment } from "@/data/gameFeed";
import type { GameFeedState } from "@/lib/useGameFeed";

interface EventsCardProps {
  feed: GameFeedState;
}

function headline(leading: GameFeedState["leading"], isFinal: boolean): string {
  if (isFinal) {
    if (leading === "nyk") return "Knicks win it!";
    if (leading === "sas") return "Spurs take it";
    return "Final";
  }
  if (leading === "nyk") return "Knicks are up!";
  if (leading === "sas") return "Knicks fighting back";
  return "All tied up!";
}

function timeLabel(m: FeedMoment): string {
  return m.tag === "FINAL" ? "FINAL · MSG" : `Q${m.period} · ${m.clock} · MSG`;
}

export default function EventsCard({ feed }: EventsCardProps) {
  const { recent, leading, current } = feed;
  const isFinal = current.tag === "FINAL";

  return (
    <section className="card glass card--events" aria-label="Game events">
      <h2 className="card-title events-title">{headline(leading, isFinal)}</h2>

      <div className="events-scroll">
        <div className="events-list" role="list">
          {recent.map((m, k) => (
            <article
              key={`${m.period}-${m.clock}-${m.text}-${k}`}
              role="listitem"
              className={`event-chip tone-${m.tone} ${k === 0 ? "is-new" : ""}`}
            >
              <div className="label">
                {m.tag && <span className="tag">{m.tag}</span>}
                <span className="text">{m.text}</span>
              </div>
              <span className="time">{timeLabel(m)}</span>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
