/**
 * Resolve each seeded venue against Google Places and write the overlay that
 * src/data/venues.ts merges onto the static seed.
 *
 * For every venue in src/data/venues.ts we run a Places API "Text Search (New)"
 * biased to the MSG area, then keep the top match's exact coordinates, place ID,
 * rating, review count, Maps link, and neighborhood. Output:
 *
 *   src/data/venues.google.json
 *     Record<venueId, { lat, lng, placeId, rating, userRatingsTotal,
 *                       googleMapsUri, neighborhood }>
 *
 * The static seed stays the source of truth for recommendations; this overlay
 * just sharpens the map. Venues without a confident match are left out, so they
 * fall back to their hand-tuned seed values.
 *
 * Run:  npm run enrich:venues
 * Needs:  GOOGLE_PLACES_API_KEY in .env.local (or the environment).
 */

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { VENUES } from "@/data/venues";
import { MSG } from "@/lib/predict";

// Minimal .env.local loader (mirrors scripts/build-baselines.ts) — standalone
// scripts don't get Next.js's automatic env loading. Only fills unset keys.
(function loadEnvLocal() {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined && val !== "") process.env[key] = val;
  }
})();

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const OUT_PATH = resolve(process.cwd(), "src/data/venues.google.json");
/** Bias matches to within this radius (meters) of MSG. */
const BIAS_RADIUS_M = 2500;

interface PlaceResult {
  id: string;
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  formattedAddress?: string;
  displayName?: { text?: string };
  addressComponents?: {
    longText: string;
    shortText: string;
    types: string[];
  }[];
}

interface VenueOverlay {
  lat?: number;
  lng?: number;
  placeId?: string;
  rating?: number;
  userRatingsTotal?: number;
  googleMapsUri?: string;
  neighborhood?: string;
}

/** Pull a human neighborhood label from Google's address components. */
function neighborhoodFrom(place: PlaceResult): string | undefined {
  const comps = place.addressComponents ?? [];
  const byType = (t: string) =>
    comps.find((c) => c.types.includes(t))?.longText;
  return (
    byType("neighborhood") ||
    byType("sublocality_level_1") ||
    byType("sublocality") ||
    undefined
  );
}

async function searchPlace(
  query: string,
  apiKey: string,
): Promise<PlaceResult | null> {
  const res = await fetch(SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.id",
        "places.location",
        "places.rating",
        "places.userRatingCount",
        "places.googleMapsUri",
        "places.formattedAddress",
        "places.displayName",
        "places.addressComponents",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      maxResultCount: 1,
      locationBias: {
        circle: {
          center: { latitude: MSG.lat, longitude: MSG.lng },
          radius: BIAS_RADIUS_M,
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Places API ${res.status}: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { places?: PlaceResult[] };
  return data.places?.[0] ?? null;
}

async function main() {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.error(
      "GOOGLE_PLACES_API_KEY is not set. Add it to .env.local and retry.",
    );
    process.exit(1);
  }

  const overlay: Record<string, VenueOverlay> = {};
  let matched = 0;

  for (const v of VENUES) {
    try {
      const place = await searchPlace(`${v.name} ${v.address}`, apiKey);
      if (!place) {
        console.log(`[miss] ${v.id}: no Google match (kept seed values)`);
        continue;
      }
      const entry: VenueOverlay = { placeId: place.id };
      if (place.location) {
        entry.lat = place.location.latitude;
        entry.lng = place.location.longitude;
      }
      if (typeof place.rating === "number") entry.rating = place.rating;
      if (typeof place.userRatingCount === "number")
        entry.userRatingsTotal = place.userRatingCount;
      if (place.googleMapsUri) entry.googleMapsUri = place.googleMapsUri;
      const hood = neighborhoodFrom(place);
      if (hood) entry.neighborhood = hood;

      overlay[v.id] = entry;
      matched++;
      console.log(
        `[ok]   ${v.id} -> ${place.displayName?.text ?? "?"}` +
          ` (${entry.rating ?? "—"}★, ${entry.userRatingsTotal ?? 0} reviews)`,
      );
    } catch (err) {
      console.error(`[err]  ${v.id}: ${(err as Error).message}`);
    }
  }

  writeFileSync(OUT_PATH, JSON.stringify(overlay, null, 2) + "\n");
  console.log(`\nWrote ${matched}/${VENUES.length} venues to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
