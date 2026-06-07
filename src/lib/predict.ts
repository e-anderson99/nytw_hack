// Madison Square Garden centroid — origin for distance-decay calculations.
export const MSG = { lat: 40.7505, lng: -73.9934 };

/** Great-circle distance between two lat/lng points, in meters. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Gaussian falloff of event impact with distance from MSG (0 → 1). */
export function distanceDecay(point: { lat: number; lng: number }): number {
  const d = distanceMeters(MSG, point);
  const sigma = 600; // meters; ~3 blocks
  return Math.exp(-(d ** 2) / (2 * sigma ** 2));
}

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
