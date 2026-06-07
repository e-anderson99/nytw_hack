"use client";

// Slider over the heat timeline frames (now -> 2am). Frame 0 is the current
// heat map; dragging right shows predicted heat at later times. Drives the
// HeatLayer in the parent — this component is presentational.

import type { TimelineFrame } from "@/lib/api";

interface TimeScrubberProps {
  frames: TimelineFrame[];
  index: number;
  onChange: (index: number) => void;
}

function clockLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TimeScrubber({
  frames,
  index,
  onChange,
}: TimeScrubberProps) {
  if (frames.length === 0) return null;
  const safeIndex = Math.min(index, frames.length - 1);
  const frame = frames[safeIndex];
  const isNow = safeIndex === 0;
  const endLabel = clockLabel(frames[frames.length - 1].tFuture);

  return (
    <div className="scrubber glass">
      <div className="scrubber-head">
        <span className="scrubber-time">
          {isNow ? "Now" : clockLabel(frame.tFuture)}
        </span>
        <span className={`scrubber-tag ${isNow ? "is-live" : ""}`}>
          {isNow ? "live crowd" : "predicted"}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={frames.length - 1}
        value={safeIndex}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Time of night"
      />
      <div className="scrubber-scale">
        <span>Now</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
