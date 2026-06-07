"use client";

// "Your preferences" bento card — sliders stacked vertically and spaced to
// fill the cell height (title top, controls middle, price chips bottom).

import type { CrowdFilters, PriceTier } from "@/types";

const PRICE_TIERS: PriceTier[] = ["$", "$$", "$$$"];

interface FilterPanelProps {
  filters: CrowdFilters;
  onChange: (next: CrowdFilters) => void;
}

function chaosLabel(maxCrowd: number): string {
  if (maxCrowd < 0.33) return "Chill";
  if (maxCrowd < 0.66) return "Lively";
  return "Chaotic";
}

export default function FilterPanel({
  filters,
  onChange,
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
      <span className="prefs-eyebrow">Your preferences</span>

      <div className="prefs-sliders">
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
            <span className="pref-val">~{filters.preferredAge}</span>
          </div>
          <input
            id="age"
            type="range"
            min={18}
            max={45}
            step={1}
            value={filters.preferredAge}
            onChange={(e) =>
              onChange({ ...filters, preferredAge: Number(e.target.value) })
            }
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

      <div className="prefs-footer">
        <div className="chip-row">
          {PRICE_TIERS.map((tier) => (
            <button
              key={tier}
              type="button"
              className={`chip chip--sm ${filters.prices.includes(tier) ? "is-on" : ""}`}
              onClick={() => togglePrice(tier)}
            >
              {tier}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
