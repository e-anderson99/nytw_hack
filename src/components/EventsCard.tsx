"use client";

// Bento card for the play-by-play. Title reacts to who's leading ("Knicks are
// up!"), and the most recent moments stack as glass chips beneath it.

import type { FeedMoment } from "@/data/gameFeed";
import type { GameFeedState } from "@/lib/useGameFeed";

interface EventsCardProps {
  feed: GameFeedState;
}

function headline(leading: GameFeedState["leading"], isFinal: boolean): string {
  if (isFinal) return "Knicks win it!";
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
      <h2 className="card-title">{headline(leading, isFinal)}</h2>

      <div className="events-list">
        {recent.map((m, k) => (
          <article
            key={`${m.period}-${m.clock}-${m.text}-${k}`}
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
    </section>
  );
}
