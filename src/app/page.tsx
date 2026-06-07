"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { CrowdFilters } from "@/types";
import { useGameFeed } from "@/lib/useGameFeed";
import ScorePanel from "@/components/ScorePanel";
import EventsCard from "@/components/EventsCard";
import FilterPanel from "@/components/FilterPanel";
import RecommendationsList from "@/components/RecommendationsList";
import LiveChat from "@/components/LiveChat";
import { MOCK_SPOTS, type MockSpot } from "@/data/mockSpots";

// MapLibre needs the browser; load the custom map view client-side only.
const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

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
        <MapView
          eventKey={feed.idx}
          impact={feed.current.impact}
          tone={feed.current.tone}
          text={feed.current.text}
          tag={feed.current.tag}
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

      <LiveChat feed={feed} />
    </main>
  );
}
