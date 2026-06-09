"use client";

// YouTube-style progress bar for the simulated broadcast. The filled (played)
// portion is Knicks orange, the remaining track is black. Dragging scrubs to
// any moment in the game; auto-advance pauses while you drag and resumes after
// if it was playing (mirrors a video scrubber).

import { useRef, useState } from "react";
import type { GameFeedState } from "@/lib/useGameFeed";

interface GameScrubberProps {
  feed: GameFeedState;
}

export default function GameScrubber({ feed }: GameScrubberProps) {
  const { idx, total, current, moments, playing, seek, setPlaying } = feed;
  const wasPlaying = useRef(playing);
  // While the user drags, we hold the position locally and DON'T commit it to
  // the feed — so the map/score/events don't re-render or refetch on every
  // intermediate frame. The drag value is committed once, on release.
  const [dragIdx, setDragIdx] = useState<number | null>(null);

  const max = Math.max(0, total - 1);
  const displayIdx = dragIdx ?? idx;
  const pct = max === 0 ? 0 : (displayIdx / max) * 100;

  const beginScrub = () => {
    wasPlaying.current = playing;
    setPlaying(false);
    setDragIdx(idx);
  };
  const endScrub = () => {
    if (dragIdx !== null) {
      seek(dragIdx);
      setDragIdx(null);
    }
    if (wasPlaying.current) setPlaying(true);
  };

  const displayMoment =
    dragIdx === null ? current : moments[displayIdx] ?? current;
  const label =
    displayMoment.tag === "FINAL"
      ? "FINAL"
      : `Q${displayMoment.period} · ${displayMoment.clock}`;

  return (
    <div className="scrubber" aria-label="Game timeline">
      <button
        type="button"
        className="scrubber-toggle"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>

      <div className="scrubber-track-wrap">
        <input
          type="range"
          className="scrubber-range"
          min={0}
          max={max}
          step={1}
          value={displayIdx}
          style={{ ["--pct" as string]: `${pct}%` }}
          onChange={(e) => setDragIdx(Number(e.target.value))}
          onMouseDown={beginScrub}
          onTouchStart={beginScrub}
          onMouseUp={endScrub}
          onTouchEnd={endScrub}
          onBlur={endScrub}
          aria-valuetext={label}
        />
      </div>

      <span className="scrubber-time">{label}</span>
    </div>
  );
}
