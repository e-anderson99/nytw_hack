// Shared projection from lat/lng to position on the static map image
// (/nyc-map.png), so the heat layer and the recommendation pins stay aligned.
// Anchored on the MSG pin (.map-pin at 47% / 44%); spanXm/spanYm are how many
// meters the image spans across its full width/height — tune to the art.

export const MSG = { lat: 40.7505, lng: -73.9934 };
export const MAP_FRAME = {
  leftPct: 47,
  topPct: 44,
  spanXm: 3800,
  spanYm: 3000,
};

/**
 * Project a lat/lng to { left, top } percentages on the map image.
 * `clamp` keeps the result inside the frame (good for pins); pass false for the
 * heat layer so edge blobs can extend past the border instead of piling up.
 */
export function projectToMap(
  lat: number,
  lng: number,
  opts: { clamp?: boolean } = {},
): { left: number; top: number } {
  const mPerLat = 111_320;
  const mPerLng = 111_320 * Math.cos((MSG.lat * Math.PI) / 180);
  const east = (lng - MSG.lng) * mPerLng;
  const north = (lat - MSG.lat) * mPerLat;
  const left = MAP_FRAME.leftPct + (east / MAP_FRAME.spanXm) * 100;
  const top = MAP_FRAME.topPct - (north / MAP_FRAME.spanYm) * 100;
  if (opts.clamp === false) return { left, top };
  return {
    left: Math.max(4, Math.min(96, left)),
    top: Math.max(5, Math.min(95, top)),
  };
}
