"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { Protocol } from "pmtiles";
import "maplibre-gl/dist/maplibre-gl.css";

// Madison Square Garden
const MSG: [number, number] = [-73.9935, 40.7505];

interface MapViewProps {
  /** Index of the current feed moment. Changing it fires one shockwave. */
  eventKey?: number;
  /** Signed swing impact of the moment (+ good / − bad). Drives size & craziness. */
  impact?: number;
  /** Knicks-fan tone of the moment; picks the shockwave color. */
  tone?: "good" | "bad" | "neutral";
  /** Play description, flashed on-screen for huge Knicks-favored plays. */
  text?: string;
  /** Short emphasis label, e.g. "CLUTCH", "DAGGER". */
  tag?: string;
}

// A notable play *in the Knicks' favor* triggers the on-screen flash notification.
const FLASH_THRESHOLD = 4;

const GOOD_COLOR = "255, 122, 26"; // Knicks orange
const BAD_COLOR = "56, 160, 255"; // Spurs ice-blue

interface Pulse {
  id: number;
  /** rgb triplet string for use in rgba(). */
  color: string;
  /** Number of staggered shockwave rings. */
  rings: number;
  /** Final scale the rings expand to (how far the wave travels). */
  scale: number;
  /** Animation duration in seconds. */
  dur: number;
  /** Huge play: adds a screen-blend bloom flash + map shake. */
  mega: boolean;
}

// Map a signed impact score (~0–16) onto shockwave drama.
function buildPulse(id: number, impact: number, tone: string): Pulse {
  const mag = Math.abs(impact);
  const norm = Math.min(1, mag / 14); // clutch plays (13+) max out
  const color = tone === "bad" ? BAD_COLOR : GOOD_COLOR;
  return {
    id,
    color,
    rings: 1 + Math.round(norm * 4), // 1 → 5 rings
    scale: 1.6 + norm * 4.4, // reach: covers MSG block → blankets the metro
    dur: 1.3 + norm * 1.6, // 1.3s → 2.9s
    mega: mag >= 6,
  };
}

// Base style: black canvas, dim-gray main roads only. The five-borough outline,
// labels, and the everything-else mask are layered on at runtime from
// public/nyc-boroughs.geojson (see addBoroughs()), so only NYC is visible.
function buildStyle(pmtilesUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf",
    sources: {
      nyc: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution: "© OpenStreetMap",
      },
    },
    layers: [
      {
        id: "bg",
        type: "background",
        paint: { "background-color": "#000000" },
      },
      {
        id: "water-fill",
        type: "fill",
        source: "nyc",
        "source-layer": "water",
        paint: { "fill-color": "#060606" },
      },
      // Main roads only (major + highway), dim gray so they recede into the bg.
      {
        id: "roads-major",
        type: "line",
        source: "nyc",
        "source-layer": "roads",
        filter: ["in", ["get", "kind"], ["literal", ["major_road", "highway"]]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: {
          "line-color": "#5a5a5a",
          "line-opacity": 0.85,
          "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 13, 1.4, 15, 2.6],
        },
      },
    ],
  };
}

interface HoodFeature {
  type: "Feature";
  properties: { name?: string; boro?: string; t?: string };
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] };
}
interface HoodFeatureCollection {
  type: "FeatureCollection";
  features: HoodFeature[];
}

// Boroughs we don't want on the map.
const EXCLUDED_BOROS = new Set(["Staten Island"]);

// Build a "world with NYC-shaped holes" polygon: filled black everywhere except
// the included neighborhoods, masking out NJ / Westchester / LI / Staten Island.
function buildMask(features: HoodFeature[]) {
  const world = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  const holes: number[][][] = [];
  for (const f of features) {
    const g = f.geometry;
    if (g.type === "Polygon") holes.push(g.coordinates[0]);
    else for (const poly of g.coordinates) holes.push(poly[0]);
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "Polygon" as const, coordinates: [world, ...holes] },
  };
}

// Tight lng/lat bounds around a set of features, so we can frame the camera on
// the actual city footprint instead of a fixed center/zoom.
function boundsOf(features: HoodFeature[]) {
  const b = new maplibregl.LngLatBounds();
  for (const f of features) {
    const g = f.geometry;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (const rings of polys)
      for (const ring of rings)
        for (const pt of ring) b.extend(pt as [number, number]);
  }
  return b;
}

// Fetch the neighborhood (NTA) geometry and layer on: the everything-else mask,
// the white neighborhood borders, and per-neighborhood name labels.
async function addNeighborhoods(map: maplibregl.Map) {
  const [hoodRaw, boroRaw] = await Promise.all([
    fetch("/nyc-neighborhoods.geojson").then((r) => r.json() as Promise<HoodFeatureCollection>),
    fetch("/nyc-boroughs.geojson").then((r) => r.json() as Promise<HoodFeatureCollection>),
  ]);
  const features = hoodRaw.features.filter((f) => !EXCLUDED_BOROS.has(f.properties.boro ?? ""));
  const fc: HoodFeatureCollection = { type: "FeatureCollection", features };

  // Frame the camera on the actual NYC footprint and make that the most
  // zoomed-out view, so the city fills the panel instead of floating in black.
  const nyc = boundsOf(
    boroRaw.features.filter((f) => !EXCLUDED_BOROS.has(f.properties.boro ?? "")),
  );
  map.fitBounds(nyc, { padding: 12, animate: false });
  const zMin = map.getZoom(); // the framed, most-zoomed-out view
  const zMax = 15;
  const zMid = zMin + (zMax - zMin) * 0.5;
  map.setMinZoom(zMin - 0.05); // can't zoom out past the framed city
  const pad = 0.04; // small lng/lat cushion so panning doesn't hit a hard wall
  map.setMaxBounds([
    [nyc.getWest() - pad, nyc.getSouth() - pad],
    [nyc.getEast() + pad, nyc.getNorth() + pad],
  ]);

  map.addSource("hoods", { type: "geojson", data: fc });
  // The mask is built from the clean borough outlines (not the 197-piece
  // neighborhood partition, whose coincident edges break hole triangulation).
  map.addSource("hood-mask", { type: "geojson", data: buildMask(boroRaw.features) });

  // Black mask over everything outside the included boroughs.
  map.addLayer({
    id: "hood-mask",
    type: "fill",
    source: "hood-mask",
    paint: { "fill-color": "#000000", "fill-opacity": 1 },
  });

  // White borders between neighborhoods, drawn on top of the mask. The mesh is
  // nearly invisible at the framed-out view and fades in as you zoom, so the
  // whole-city view isn't a cluttered net of every NTA boundary.
  map.addLayer({
    id: "hood-outline",
    type: "line",
    source: "hoods",
    layout: { "line-join": "round" },
    paint: {
      "line-color": "#ffffff",
      "line-opacity": ["interpolate", ["linear"], ["zoom"], zMin, 0.04, zMid, 0.38, zMax, 0.7],
      "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 13, 1, 15, 1.8],
    },
  });

  // Neighborhood names — residential NTAs only (skip parks/cemeteries/airports).
  // Hidden at the framed-out view, fading in (and growing) as you zoom toward
  // street level, where the full label detail is the maximum.
  map.addLayer({
    id: "hood-labels",
    type: "symbol",
    source: "hoods",
    filter: ["==", ["get", "t"], "0"],
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Medium"],
      "text-size": ["interpolate", ["linear"], ["zoom"], 10, 8, 13, 12, 15, 15],
      "text-transform": "uppercase",
      "text-letter-spacing": 0.1,
      "text-max-width": 7,
      "text-padding": 4,
    },
    paint: {
      "text-color": "#ffffff",
      "text-opacity": ["interpolate", ["linear"], ["zoom"], zMin + 0.2, 0, zMid, 0.5, zMax, 0.85],
      "text-halo-color": "#000000",
      "text-halo-width": 1.4,
    },
  });
}

export default function MapView({
  eventKey,
  impact = 0,
  tone = "good",
  text,
  tag,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const pulseIdRef = useRef(0);
  const firstEventRef = useRef(true);
  // Per-event timers (pulse removal, shake reset, flash dismiss). Tracked so we
  // can clear them on unmount — but NOT on every new event, otherwise a fast
  // cadence cancels a pulse's removal before it fires and pulses leak forever.
  const timersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  // MSG's position in map-pixel space; keeps the pulse anchored as you pan/zoom.
  const [msgPos, setMsgPos] = useState<{ x: number; y: number } | null>(null);
  // Active shockwaves.
  const [pulses, setPulses] = useState<Pulse[]>([]);
  // Brief map shake for clutch plays.
  const [shaking, setShaking] = useState(false);
  // On-screen flash notification for huge Knicks-favored plays.
  const [flash, setFlash] = useState<{ id: number; tag?: string; text?: string } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    const pmtilesUrl = `${window.location.origin}/nyc.pmtiles`;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(pmtilesUrl),
      center: [-73.92, 40.72], // refined by fitBounds() once geometry loads
      zoom: 9.6,
      minZoom: 9.5,
      maxZoom: 15,
      attributionControl: false,
      maxBounds: [
        [-74.32, 40.46],
        [-73.68, 40.94],
      ],
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    // Layer on the neighborhood borders + labels + mask once the style is ready.
    map.on("load", () => {
      addNeighborhoods(map).catch((err) => console.error("neighborhood overlay failed", err));
    });

    // MSG marker.
    const el = document.createElement("div");
    el.className = "msg-marker";
    el.innerHTML = '<span class="msg-dot"></span><span class="msg-label">MSG</span>';
    new maplibregl.Marker({ element: el, anchor: "left" }).setLngLat(MSG).addTo(map);

    const syncMsg = () => setMsgPos(map.project(MSG));
    map.on("load", syncMsg);
    map.on("move", syncMsg);
    map.on("resize", syncMsg);

    return () => {
      map.remove();
      mapRef.current = null;
      maplibregl.removeProtocol("pmtiles");
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
  }, []);

  // Fire a shockwave on every new event (skip the initial mount).
  useEffect(() => {
    if (eventKey === undefined) return;
    if (firstEventRef.current) {
      firstEventRef.current = false;
      return;
    }
    // Only positive Knicks moments get a burst/notification — never Spurs plays.
    if (impact <= 0) return;

    const pulse = buildPulse(++pulseIdRef.current, impact, tone);
    setPulses((p) => [...p, pulse]);

    // Schedule a one-shot timer that self-removes from the tracking set when it
    // fires. We do NOT cancel these on the next event — each pulse/flash/shake
    // must run its full course no matter how fast moments tick by.
    const track = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timersRef.current.delete(t);
        fn();
      }, ms);
      timersRef.current.add(t);
    };

    const lifetime = pulse.dur * 1000 + 400;
    track(() => setPulses((p) => p.filter((x) => x.id !== pulse.id)), lifetime);

    if (pulse.mega) {
      setShaking(true);
      track(() => setShaking(false), 700);
    }

    // Huge play in the Knicks' favor → flash a notification of what happened.
    if (impact >= FLASH_THRESHOLD) {
      const flashId = pulse.id;
      setFlash({ id: flashId, tag, text });
      track(() => setFlash((f) => (f && f.id === flashId ? null : f)), 3200);
    }
    // Re-fire whenever the moment changes, even if impact/tone repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventKey]);

  return (
    <>
      <div
        ref={containerRef}
        className={`map-canvas${shaking ? " is-shaking" : ""}`}
      />
      <div className="pulse-layer" aria-hidden>
        {msgPos &&
          pulses.map((pulse) =>
            Array.from({ length: pulse.rings }).map((_, i) => (
              <span
                key={`${pulse.id}-${i}`}
                className="score-ring"
                style={
                  {
                    left: msgPos.x,
                    top: msgPos.y,
                    "--ring-color": pulse.color,
                    "--ring-scale": pulse.scale,
                    "--ring-dur": `${pulse.dur}s`,
                    "--ring-delay": `${i * 0.13}s`,
                  } as CSSProperties
                }
              />
            ))
          )}
      </div>
      <div className="bloom-layer" aria-hidden>
        {msgPos &&
          pulses.map((pulse) => (
            <span
              key={pulse.id}
              className={`score-core${pulse.mega ? " is-mega" : ""}`}
              style={
                {
                  left: msgPos.x,
                  top: msgPos.y,
                  "--ring-color": pulse.color,
                  "--ring-scale": pulse.scale,
                  "--ring-dur": `${pulse.dur}s`,
                } as CSSProperties
              }
            />
          ))}
      </div>
      {flash && (
        <div className="score-flash" role="status" key={flash.id}>
          <div className="score-flash-card">
            {flash.tag && <span className="score-flash-tag">{flash.tag}</span>}
            <span className="score-flash-text">{flash.text}</span>
          </div>
        </div>
      )}
    </>
  );
}
