"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import type { CrowdFilters } from "@/types";
import { useGameFeed } from "@/lib/useGameFeed";
import ScorePanel from "@/components/ScorePanel";
import EventsCard from "@/components/EventsCard";
import FilterPanel, { type FriendsPrefs } from "@/components/FilterPanel";
import RecommendationsList from "@/components/RecommendationsList";
import { MOCK_SPOTS, type MockSpot } from "@/data/mockSpots";

const DEFAULT_FILTERS: CrowdFilters = {
  maxCrowd: 0.7,
  prices: [],
  maxWalkMeters: 1500,
  vibes: [],
};

const DEFAULT_FRIENDS: FriendsPrefs = {
  enabled: false,
  school: "",
  age: 26,
};

// Mock ranking: respect the filters, then favor quiet + close + on-age spots.
function rankSpots(filters: CrowdFilters, friends: FriendsPrefs): MockSpot[] {
  return MOCK_SPOTS.filter((s) => {
    if (s.crowd > filters.maxCrowd + 0.05) return false;
    if (s.distanceMeters > filters.maxWalkMeters) return false;
    if (filters.prices.length && !filters.prices.includes(s.price)) return false;
    return true;
  })
    .map((s) => {
      const quiet = 1 - s.crowd;
      const close = 1 - Math.min(1, s.distanceMeters / filters.maxWalkMeters);
      const ageFit = 1 - Math.min(1, Math.abs(s.avgAge - friends.age) / 12);
      const social = friends.enabled ? Math.min(1, s.friendsHere / 8) : 0;
      const score = 0.4 * quiet + 0.25 * close + 0.2 * ageFit + 0.15 * social;
      return { s, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(({ s }) => s);
}

export default function Home() {
  const feed = useGameFeed();

  const [filters, setFilters] = useState<CrowdFilters>(DEFAULT_FILTERS);
  const [friends, setFriends] = useState<FriendsPrefs>(DEFAULT_FRIENDS);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const spots = useMemo(() => rankSpots(filters, friends), [filters, friends]);

  return (
    <main className="stage">
      <div className="bento">
        <ScorePanel feed={feed} />
        <EventsCard feed={feed} />
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          friends={friends}
          onFriendsChange={setFriends}
        />
        <RecommendationsList
          spots={spots}
          showFriends={friends.enabled}
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
