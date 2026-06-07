"use client";

// YouTube-style progress bar for the simulated broadcast. The filled (played)
// portion is Knicks orange, the remaining track is black. Dragging scrubs to
// any moment in the game; auto-advance pauses while you drag and resumes after
// if it was playing (mirrors a video scrubber).

import { useRef } from "react";
import type { GameFeedState } from "@/lib/useGameFeed";

interface GameScrubberProps {
  feed: GameFeedState;
}

export default function GameScrubber({ feed }: GameScrubberProps) {
  const { idx, total, current, playing, seek, setPlaying } = feed;
  const wasPlaying = useRef(playing);

  const max = Math.max(0, total - 1);
  const pct = max === 0 ? 0 : (idx / max) * 100;

  const beginScrub = () => {
    wasPlaying.current = playing;
    setPlaying(false);
  };
  const endScrub = () => {
    if (wasPlaying.current) setPlaying(true);
  };

  const label =
    current.tag === "FINAL"
      ? "FINAL"
      : `Q${current.period} · ${current.clock}`;

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
          value={idx}
          style={{ ["--pct" as string]: `${pct}%` }}
          onChange={(e) => seek(Number(e.target.value))}
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
