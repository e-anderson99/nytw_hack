// Google Popular Times is not exposed by the official Places API, so we use
// BestTime.app for venue busyness curves. Values are normalized 0-100 relative
// to each venue's weekly peak; we rescale to 0-1.
//
// This client is BUILD-TIME ONLY: scripts/build-baselines.ts calls it once to
// snapshot the weekly forecast per venue into historical.json. Request paths
// read the precomputed JSON and never hit BestTime.

const FORECAST_URL = "https://besttime.app/api/v1/forecasts";

// BestTime POST /forecasts returns `analysis` as a 7-element array (one per
// day). Each entry carries `day_info.day_int` (0=Mon..6=Sun) and `day_raw`,
// 24 hourly busyness values 0-100 relative to the venue's weekly peak.
interface BestTimeAnalysisDay {
  day_info?: { day_int: number };
  day_raw?: number[];
}
interface BestTimeForecastResponse {
  status?: string;
  analysis?: BestTimeAnalysisDay[];
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

    if (!data.analysis?.length) return null;
    for (const d of data.analysis) {
      const dayInt = d.day_info?.day_int;
      const raw = d.day_raw;
      if (dayInt == null || !raw) continue;
      const js = toJsDay(dayInt);
      for (let h = 0; h < 24 && h < raw.length; h++) {
        byDayHour[js][h] = Math.max(0, Math.min(1, raw[h] / 100));
      }
    }
    return { byDayHour };
  } catch {
    return null;
  }
}
