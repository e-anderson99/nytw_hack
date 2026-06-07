"use client";

// Canvas heat overlay drawn on top of the static map image. Each crowd-grid
// cell becomes a soft radial blob colored by intensity; overlapping blobs blend
// into a continuous heat field. Positions come from the shared map projection,
// so the heat lines up with the recommendation pins.

import { useEffect, useRef } from "react";
import type { CrowdCell } from "@/types";
import { projectToMap } from "@/lib/mapProjection";

// Crowd ramp matching the map legend: blue -> green -> yellow -> orange -> red.
const RAMP: { t: number; c: [number, number, number] }[] = [
  { t: 0.0, c: [0, 120, 255] },
  { t: 0.35, c: [40, 200, 140] },
  { t: 0.6, c: [245, 200, 40] },
  { t: 0.8, c: [243, 109, 29] },
  { t: 1.0, c: [214, 33, 33] },
];

function heatColor(t: number): [number, number, number] {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (x <= RAMP[i].t) {
      const lo = RAMP[i - 1];
      const hi = RAMP[i];
      const f = (x - lo.t) / (hi.t - lo.t);
      return [
        Math.round(lo.c[0] + f * (hi.c[0] - lo.c[0])),
        Math.round(lo.c[1] + f * (hi.c[1] - lo.c[1])),
        Math.round(lo.c[2] + f * (hi.c[2] - lo.c[2])),
      ];
    }
  }
  return RAMP[RAMP.length - 1].c;
}

export default function HeatLayer({ cells }: { cells: CrowdCell[] }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;

    const draw = () => {
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Blob radius ~1.5× the grid spacing so neighbors overlap smoothly.
      const radius = Math.max(w, h) * 0.11;
      for (const c of cells) {
        const { left, top } = projectToMap(c.lat, c.lng, { clamp: false });
        const x = (left / 100) * w;
        const y = (top / 100) * h;
        const [r, g, b] = heatColor(c.intensity);
        // Hotter cells are more opaque; quiet cells nearly invisible.
        const alpha = 0.62 * Math.min(1, Math.max(0, c.intensity - 0.05) * 1.2);
        if (alpha <= 0.01) continue;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [cells]);

  return <canvas ref={ref} className="heat-canvas" aria-hidden />;
}
