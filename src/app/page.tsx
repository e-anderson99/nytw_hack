"use client";

import { useMemo, useState } from "react";
import type { CrowdFilters } from "@/types";
import { useGameFeed } from "@/lib/useGameFeed";
import { useHeatTimeline } from "@/lib/useHeatTimeline";
import ScorePanel from "@/components/ScorePanel";
import EventsCard from "@/components/EventsCard";
import FilterPanel from "@/components/FilterPanel";
import RecommendationsList from "@/components/RecommendationsList";
import MapView from "@/components/MapView";
import GameScrubber from "@/components/GameScrubber";
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
        <div className="map-stage">
          <MapView
            eventKey={feed.idx}
            impact={feed.current.impact}
            tone={feed.current.tone}
            text={feed.current.text}
            tag={feed.current.tag}
            heatCells={heatCells}
            spots={spots}
            focusedId={focusedId}
            onFocusSpot={setFocusedId}
          />
          <div className="map-legend">
            <span className="legend-title">Crowd</span>
            <div className="legend-bar" />
            <div className="legend-scale">
              <span>Quiet</span>
              <span>Packed</span>
            </div>
          </div>
        </div>
        <GameScrubber feed={feed} />
        <TimeScrubber
          frames={frames}
          index={safeFrameIdx}
          onChange={setFrameIdx}
        />
      </div>
    </main>
  );
}
