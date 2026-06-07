"use client";

// "In your map" bento card: watch-spots as picture cards showing crowd level +
// average crowd age. Pure mock data — hovering a card highlights it.

import Image from "next/image";
import { crowdLabel, type MockSpot } from "@/data/mockSpots";

interface RecommendationsListProps {
  spots: MockSpot[];
  focusedId?: string | null;
  onFocus?: (id: string | null) => void;
}

const GMAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

function streetViewUrl(lat: number, lng: number): string | null {
  if (!GMAPS_KEY) return null;
  const params = new URLSearchParams({
    size: "600x300",
    location: `${lat},${lng}`,
    fov: "80",
    pitch: "5",
    key: GMAPS_KEY,
  });
  return `https://maps.googleapis.com/maps/api/streetview?${params}`;
}

// Fallback gradient when no API key is configured.
function thumbGradient(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 17 + id.charCodeAt(i)) % 360;
  const h2 = (h + 40) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 45%), hsl(${h2} 60% 32%))`;
}

export default function RecommendationsList({
  spots,
  focusedId,
  onFocus,
}: RecommendationsListProps) {
  const top = spots.slice(0, 3);

  return (
    <section className="card glass card--places" aria-label="In your map">
      <span className="prefs-eyebrow">In your map</span>

      <div className="places-grid">
        {top.length === 0 && (
          <p className="places-empty">
            No spots match — loosen the crowd, price, or distance filters.
          </p>
        )}

        {top.map((spot, i) => {
          const walkMins = Math.max(1, Math.round(spot.distanceMeters / 80));
          const photoUrl = streetViewUrl(spot.lat, spot.lng);
          return (
            <button
              key={spot.id}
              type="button"
              className={`place-card ${spot.id === focusedId ? "is-focus" : ""}`}
              onMouseEnter={() => onFocus?.(spot.id)}
              onMouseLeave={() => onFocus?.(null)}
              onClick={() => onFocus?.(spot.id)}
            >
              <div
                className="place-thumb"
                style={photoUrl ? undefined : { background: thumbGradient(spot.id) }}
              >
                {photoUrl && (
                  <Image
                    src={photoUrl}
                    alt={spot.name}
                    fill
                    sizes="(max-width: 600px) 100vw, 33vw"
                    style={{ objectFit: "cover" }}
                    priority={i === 0}
                  />
                )}
                <span className="rank">{i + 1}</span>
                <span className="crowd-pill">{spot.price}</span>
                <span className="place-name-on-thumb">{spot.name}</span>
              </div>
              <span className="place-meta">
                {crowdLabel(spot.crowd)} · avg age {spot.avgAge} · {walkMins} min
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
