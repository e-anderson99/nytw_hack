import type { SubwayState } from "@/types";
import { STATION_SEEDS } from "./stations";

// Every subway complex in the city (generated from the MTA ridership CSV — see
// src/data/stations.ts). `congestion` / `recommended` are computed per request
// by the prediction layer; the seed carries only identity + map position.
export const STATIONS: Omit<SubwayState, "congestion" | "recommended">[] =
  STATION_SEEDS;
