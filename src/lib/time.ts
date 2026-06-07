// Time helpers for the heat timeline. The slider runs from "now" to the next
// 2 AM in New York (end of the night), so we need a TZ-correct boundary that
// handles DST and the case where "now" is already past midnight.

const NY_TZ = "America/New_York";

const NY_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: NY_TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface WallClock {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Read the New York wall-clock time for an instant. */
function nyWallClock(ms: number): WallClock {
  const parts = NY_PARTS.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = get("hour");
  if (hour === 24) hour = 0; // some ICU builds emit "24" at midnight
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour,
    minute: get("minute"),
    second: get("second"),
  };
}

/**
 * New York's UTC offset (in ms) at the given instant. Derived by comparing the
 * NY wall-clock reading to the instant's UTC value — DST-correct, no library.
 */
function nyOffsetMs(ms: number): number {
  const w = nyWallClock(ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  // Round to the nearest minute to absorb sub-minute drift.
  return Math.round((asUtc - ms) / 60_000) * 60_000;
}

/**
 * Epoch ms for the next `endHour`:00 New York wall-clock time at or after
 * `fromMs`. e.g. nextNightEndMs(7pm) -> 2am the next day; at 12:30am -> 2am the
 * same day; at 3am -> 2am the next day.
 */
export function nextNightEndMs(fromMs: number, endHour = 2): number {
  const w = nyWallClock(fromMs);

  // Candidate: today's NY date at endHour:00:00. Advance a day if NY local time
  // has already reached/passed endHour.
  let day = w.day;
  const pastBoundary =
    w.hour > endHour || (w.hour === endHour && (w.minute > 0 || w.second > 0));
  if (pastBoundary) day += 1; // Date.UTC normalizes month/year rollover

  // Build the candidate as if NY were UTC, then shift by NY's offset to get the
  // true instant. Use the offset at `fromMs` (the boundary is within ~24h, so
  // any DST transition in between is a rare, acceptable ~1h edge for the demo).
  const candidateAsUtc = Date.UTC(w.year, w.month - 1, day, endHour, 0, 0);
  return candidateAsUtc - nyOffsetMs(fromMs);
}
