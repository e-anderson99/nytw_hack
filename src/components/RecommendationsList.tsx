"use client";

// "In your map" bento card: watch-spots as picture cards showing crowd level +
// average crowd age. Pure mock data — hovering a card highlights it.

import { crowdLabel, type MockSpot } from "@/data/mockSpots";

interface RecommendationsListProps {
  spots: MockSpot[];
  showFriends: boolean;
  focusedId?: string | null;
  onFocus?: (id: string | null) => void;
}

// A stable, pleasant gradient per spot so cards feel like distinct "pictures".
function thumbGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 45%), hsl(${h2} 60% 32%))`;
}

export default function RecommendationsList({
  spots,
  showFriends,
  focusedId,
  onFocus,
}: RecommendationsListProps) {
  const top = spots.slice(0, 3);

  return (
    <section className="card glass card--places" aria-label="In your map">
      <h2 className="card-title">In your map</h2>

      <div className="places-grid">
        {top.length === 0 && (
          <p className="places-empty">
            No spots match — loosen the crowd, price, or distance filters.
          </p>
        )}

        {top.map((spot, i) => {
          const walkMins = Math.max(1, Math.round(spot.distanceMeters / 80));
          return (
            <button
              key={spot.id}
              type="button"
              className={`place-card ${spot.id === focusedId ? "is-focus" : ""}`}
              onMouseEnter={() => onFocus?.(spot.id)}
              onMouseLeave={() => onFocus?.(null)}
              onClick={() => onFocus?.(spot.id)}
            >
              <div className="place-thumb" style={{ background: thumbGradient(spot.id) }}>
                <span className="rank">{i + 1}</span>
                <span className="crowd-pill">{spot.price}</span>
                <span className="place-name-on-thumb">{spot.name}</span>
              </div>
              <span className="place-meta">
                {crowdLabel(spot.crowd)} · avg age {spot.avgAge} · {walkMins} min
                {showFriends && spot.friendsHere > 0
                  ? ` · ${spot.friendsHere} friends`
                  : ""}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
