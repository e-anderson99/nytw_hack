"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { CrowdFilters } from "@/types";
import { useGameFeed } from "@/lib/useGameFeed";
import ScorePanel from "@/components/ScorePanel";
import EventsCard from "@/components/EventsCard";
import FilterPanel from "@/components/FilterPanel";
import RecommendationsList from "@/components/RecommendationsList";
import { MOCK_SPOTS, type MockSpot } from "@/data/mockSpots";

const DEFAULT_FILTERS: CrowdFilters = {
  maxCrowd: 0.7,
  preferredAge: 26,
  prices: [],
  maxWalkMeters: 1500,
  vibes: [],
};

// Project a lat/lng onto the static map image as left/top percentages, anchored
// on the MSG pin (.map-pin is at 47% / 44%). spanM = meters the image spans
// across its full width/height — tune to match /nyc-map.png framing.
const MSG = { lat: 40.7505, lng: -73.9934 };
const MAP_FRAME = { leftPct: 47, topPct: 44, spanXm: 3800, spanYm: 3000 };

function projectToMap(lat: number, lng: number): { left: number; top: number } {
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos((MSG.lat * Math.PI) / 180);
  const east = (lng - MSG.lng) * mPerLng;
  const north = (lat - MSG.lat) * mPerLat;
  const left = MAP_FRAME.leftPct + (east / MAP_FRAME.spanXm) * 100;
  const top = MAP_FRAME.topPct - (north / MAP_FRAME.spanYm) * 100;
  // Keep pins inside the frame.
  return {
    left: Math.max(4, Math.min(96, left)),
    top: Math.max(5, Math.min(95, top)),
  };
}

// Mock ranking: respect the filters, then favor quiet + close + on-age spots.
function rankSpots(filters: CrowdFilters): MockSpot[] {
  return MOCK_SPOTS.filter((s) => {
    if (s.crowd > filters.maxCrowd + 0.05) return false;
    if (s.distanceMeters > filters.maxWalkMeters) return false;
    if (filters.prices.length && !filters.prices.includes(s.price)) return false;
    return true;
  })
    .map((s) => {
      const quiet = 1 - s.crowd;
      const close = 1 - Math.min(1, s.distanceMeters / filters.maxWalkMeters);
      const ageFit = 1 - Math.min(1, Math.abs(s.avgAge - filters.preferredAge) / 12);
      const score = 0.45 * quiet + 0.3 * close + 0.25 * ageFit;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
}

export default function Home() {
  const feed = useGameFeed();

  const [filters, setFilters] = useState<CrowdFilters>(DEFAULT_FILTERS);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const spots = useMemo(() => rankSpots(filters), [filters]);

  return (
    <main className="stage">
      <div className="bento">
        <ScorePanel feed={feed} />
        <EventsCard feed={feed} />
        <FilterPanel filters={filters} onChange={setFilters} />
        <RecommendationsList
          spots={spots}
          focusedId={focusedId}
          onFocus={setFocusedId}
        />
      </div>

      <div className="map-wrap">
        <Image
          src="/nyc-map.png"
          alt="Map of New York City around Madison Square Garden"
          fill
          priority
          sizes="50vw"
          className="map-image"
        />
        <div className="map-pin" aria-hidden>
          <span className="map-pin-dot" />
          <span className="map-pin-label">MSG</span>
        </div>

        {/* Numbered recommendation pins — top 3, synced with the "In your map" list. */}
        {spots.slice(0, 3).map((spot, i) => {
          const pos = projectToMap(spot.lat, spot.lng);
          return (
            <button
              key={spot.id}
              type="button"
              className={`rec-pin ${spot.id === focusedId ? "is-focus" : ""}`}
              style={{ left: `${pos.left}%`, top: `${pos.top}%` }}
              onMouseEnter={() => setFocusedId(spot.id)}
              onMouseLeave={() => setFocusedId(null)}
              onClick={() => setFocusedId(spot.id)}
              aria-label={`${i + 1}. ${spot.name}`}
            >
              <span className="rec-pin-num">{i + 1}</span>
              <span className="rec-pin-label">{spot.name}</span>
            </button>
          );
        })}

        <div className="map-legend">
          <span className="legend-title">Crowd</span>
          <div className="legend-bar" />
          <div className="legend-scale">
            <span>Quiet</span>
            <span>Packed</span>
          </div>
        </div>
      </div>
    </main>
  );
}
