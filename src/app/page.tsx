"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { CrowdFilters } from "@/types";
import { useGameFeed } from "@/lib/useGameFeed";
import { useHeatTimeline } from "@/lib/useHeatTimeline";
import { projectToMap } from "@/lib/mapProjection";
import ScorePanel from "@/components/ScorePanel";
import EventsCard from "@/components/EventsCard";
import FilterPanel from "@/components/FilterPanel";
import RecommendationsList from "@/components/RecommendationsList";
import HeatLayer from "@/components/HeatLayer";
import TimeScrubber from "@/components/TimeScrubber";
import { MOCK_SPOTS, type MockSpot } from "@/data/mockSpots";

const DEFAULT_FILTERS: CrowdFilters = {
  maxCrowd: 0.7,
  preferredAge: 26,
  prices: [],
  maxWalkMeters: 1500,
  vibes: [],
};

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

  // Heat timeline (now -> 2am); the scrubber picks which frame to render.
  const heat = useHeatTimeline({ stepMin: 2 });
  const frames = heat.data?.frames ?? [];
  const [frameIdx, setFrameIdx] = useState(0);
  const safeFrameIdx = frames.length ? Math.min(frameIdx, frames.length - 1) : 0;
  const heatCells = frames[safeFrameIdx]?.cells ?? [];

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

        {/* Predictive heat field for the selected time. */}
        {heatCells.length > 0 && <HeatLayer cells={heatCells} />}

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

        <TimeScrubber
          frames={frames}
          index={safeFrameIdx}
          onChange={setFrameIdx}
        />
      </div>
    </main>
  );
}
