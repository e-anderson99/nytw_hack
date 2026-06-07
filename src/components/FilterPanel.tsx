"use client";

// "Your preferences" bento card. Three sliders — Crowd (how chaotic), Age
// (which crowd to find friends in), Distance (how far you'll walk) — plus price
// chips and the friends overlay toggle. Drives /api/recommend.

import type { CrowdFilters, PriceTier } from "@/types";

const PRICE_TIERS: PriceTier[] = ["$", "$$", "$$$"];

export interface FriendsPrefs {
  enabled: boolean;
  /** Filter the friend overlay to a school/university (empty = anyone). */
  school: string;
  /** Approximate age, used to match a similar cohort. */
  age: number;
}

interface FilterPanelProps {
  filters: CrowdFilters;
  onChange: (next: CrowdFilters) => void;
  friends: FriendsPrefs;
  onFriendsChange: (next: FriendsPrefs) => void;
}

function chaosLabel(maxCrowd: number): string {
  if (maxCrowd < 0.33) return "Chill";
  if (maxCrowd < 0.66) return "Lively";
  return "Chaotic";
}

export default function FilterPanel({
  filters,
  onChange,
  friends,
  onFriendsChange,
}: FilterPanelProps) {
  const togglePrice = (tier: PriceTier) => {
    const has = filters.prices.includes(tier);
    const prices = has
      ? filters.prices.filter((p) => p !== tier)
      : [...filters.prices, tier];
    onChange({ ...filters, prices });
  };

  return (
    <section className="card glass card--prefs" aria-label="Your preferences">
      <h2 className="card-title">Your preferences</h2>

      <div className="prefs-inner">
        <div className="pref-row">
          <div className="pref-head">
            <label htmlFor="crowd">Crowd</label>
            <span className="pref-val">{chaosLabel(filters.maxCrowd)}</span>
          </div>
          <input
            id="crowd"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={filters.maxCrowd}
            onChange={(e) => onChange({ ...filters, maxCrowd: Number(e.target.value) })}
          />
        </div>

        <div className="pref-row">
          <div className="pref-head">
            <label htmlFor="age">Age</label>
            <span className="pref-val">~{friends.age}</span>
          </div>
          <input
            id="age"
            type="range"
            min={18}
            max={45}
            step={1}
            value={friends.age}
            onChange={(e) => onFriendsChange({ ...friends, age: Number(e.target.value) })}
          />
        </div>

        <div className="pref-row">
          <div className="pref-head">
            <label htmlFor="walk">Distance</label>
            <span className="pref-val">{(filters.maxWalkMeters / 1000).toFixed(1)} km</span>
          </div>
          <input
            id="walk"
            type="range"
            min={300}
            max={2500}
            step={100}
            value={filters.maxWalkMeters}
            onChange={(e) =>
              onChange({ ...filters, maxWalkMeters: Number(e.target.value) })
            }
          />
        </div>
      </div>

      <div className="chip-row">
        {PRICE_TIERS.map((tier) => (
          <button
            key={tier}
            type="button"
            className={`chip ${filters.prices.includes(tier) ? "is-on" : ""}`}
            onClick={() => togglePrice(tier)}
          >
            {tier}
          </button>
        ))}
      </div>

      <button
        type="button"
        className={`friends-toggle ${friends.enabled ? "is-on" : ""}`}
        onClick={() => onFriendsChange({ ...friends, enabled: !friends.enabled })}
        aria-pressed={friends.enabled}
      >
        <span className="friends-label">Find friends to watch with</span>
        <span className="friends-switch" />
      </button>
    </section>
  );
}
