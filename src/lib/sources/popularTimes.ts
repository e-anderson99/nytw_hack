// Google Popular Times is not exposed by the official Places API, so we use
// BestTime.app for venue busyness curves. Values are normalized 0-100 relative
// to each venue's weekly peak; we rescale to 0-1.
//
// This client is BUILD-TIME ONLY: scripts/build-baselines.ts calls it once to
// snapshot the weekly forecast per venue into historical.json. Request paths
// read the precomputed JSON and never hit BestTime.

const FORECAST_URL = "https://besttime.app/api/v1/forecasts";

/** Day index 0=Mon..6=Sun in BestTime; we convert to JS 0=Sun..6=Sat. */
interface BestTimeDay {
  day_int: number;
  day_raw: number[]; // 24 hourly values, 0-100
}
interface BestTimeForecastResponse {
  analysis?: { week_raw?: number[] }; // 168 values (some plans)
  week?: BestTimeDay[];
}

export interface VenueWeeklyCurve {
  /** [dayOfWeek 0=Sun..6=Sat][hour 0..23] normalized 0-1 busyness. */
  byDayHour: number[][];
}

/** Convert BestTime day_int (0=Mon) to JS getDay() (0=Sun). */
function toJsDay(dayIntMon0: number): number {
  return (dayIntMon0 + 1) % 7;
}

/**
 * Fetch a venue's weekly foot-traffic forecast from BestTime and normalize to
 * 0-1. Returns null when no key is set or the API has no data for the venue.
 */
export async function fetchVenueWeeklyCurve(
  venueName: string,
  venueAddress: string,
): Promise<VenueWeeklyCurve | null> {
  const apiKey = process.env.BESTTIME_API_KEY;
  if (!apiKey) return null;

  const params = new URLSearchParams({
    api_key_private: apiKey,
    venue_name: venueName,
    venue_address: venueAddress,
  });

  try {
    const res = await fetch(`${FORECAST_URL}?${params.toString()}`, {
      method: "POST",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as BestTimeForecastResponse;

    const byDayHour: number[][] = Array.from({ length: 7 }, () =>
      new Array(24).fill(0),
    );

    if (data.week?.length) {
      for (const d of data.week) {
        const js = toJsDay(d.day_int);
        for (let h = 0; h < 24 && h < d.day_raw.length; h++) {
          byDayHour[js][h] = Math.max(0, Math.min(1, d.day_raw[h] / 100));
        }
      }
      return { byDayHour };
    }

    if (data.analysis?.week_raw?.length === 168) {
      const raw = data.analysis.week_raw;
      for (let i = 0; i < 168; i++) {
        const js = toJsDay(Math.floor(i / 24));
        byDayHour[js][i % 24] = Math.max(0, Math.min(1, raw[i] / 100));
      }
      return { byDayHour };
    }

    return null;
  } catch {
    return null;
  }
}
