import type { SubwayState } from "@/types";

// MSG-area stations. `congestion` / `recommended` here are baseline; the
// prediction layer adjusts them per game phase.
export const STATIONS: Omit<SubwayState, "congestion" | "recommended">[] = [
  {
    stationId: "34st-penn",
    name: "34 St–Penn Station",
    lines: ["1", "2", "3", "A", "C", "E"],
    lat: 40.7506,
    lng: -73.9909,
  },
  {
    stationId: "34st-herald",
    name: "34 St–Herald Sq",
    lines: ["B", "D", "F", "M", "N", "Q", "R", "W"],
    lat: 40.7497,
    lng: -73.9876,
  },
  {
    stationId: "28st",
    name: "28 St",
    lines: ["1"],
    lat: 40.7476,
    lng: -73.9938,
  },
];
