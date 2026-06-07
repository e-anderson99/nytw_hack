// Notable play-by-play moments for the Events panel, curated from Game 2
// (Knicks vs. Spurs, MSG). This is presentation data for the live-feed ticker;
// the crowd model itself reads the score/clock from /api/gamestate. Each moment
// is tagged good/bad from a Knicks fan's POV, matching the project's event
// taxonomy (Knicks buckets / dunks / and-1s = good; Spurs scores / fouls = bad).

export type FeedTone = "good" | "bad" | "neutral";

export interface FeedMoment {
  /** Game period (1-4). */
  period: number;
  /** Game clock at the moment, e.g. "8:41". */
  clock: string;
  /** Score as NYK-SAS at the moment. */
  score: string;
  /** Short, fan-facing description. */
  text: string;
  tone: FeedTone;
  /** Optional emphasis label, e.g. "DUNK", "AND-1", "DAGGER". */
  tag?: string;
}

export const FINAL_SCORE = { nyk: 105, sas: 104 } as const;

export const HOME = { name: "Knicks", fullName: "New York Knicks", tricode: "NYK" } as const;
export const AWAY = { name: "Spurs", fullName: "San Antonio Spurs", tricode: "SAS" } as const;

// Ordered chronologically. The ticker plays through these to simulate the feed.
export const GAME_FEED: FeedMoment[] = [
  { period: 1, clock: "11:36", score: "0-3", text: "Vassell drills a 25-footer for the Spurs", tone: "bad", tag: "SAS 3" },
  { period: 1, clock: "11:08", score: "2-3", text: "Brunson step-back jumper gets the Knicks on the board", tone: "good", tag: "NYK 2" },
  { period: 1, clock: "8:41", score: "10-13", text: "Anunoby pull-up three — MSG wakes up", tone: "good", tag: "NYK 3" },
  { period: 1, clock: "7:42", score: "10-15", text: "Wembanyama cutting dunk over the top", tone: "bad", tag: "SAS DUNK" },
  { period: 1, clock: "5:11", score: "16-20", text: "Towns answers from deep, 27 feet", tone: "good", tag: "NYK 3" },
  { period: 2, clock: "11:15", score: "28-37", text: "Towns step-back triple keeps the Knicks alive", tone: "good", tag: "NYK 3" },
  { period: 2, clock: "9:45", score: "32-37", text: "Towns driving DUNK — the Garden erupts", tone: "good", tag: "NYK DUNK" },
  { period: 2, clock: "7:03", score: "39-42", text: "Bridges from three, Knicks within one possession", tone: "good", tag: "NYK 3" },
  { period: 2, clock: "0:10", score: "56-52", text: "Towns buzzer-beating three to close the half", tone: "good", tag: "BUZZER" },
  { period: 3, clock: "10:28", score: "61-54", text: "Anunoby triple pushes the Knicks lead to 7", tone: "good", tag: "NYK 3" },
  { period: 3, clock: "9:21", score: "64-54", text: "Brunson running pull-up three — Knicks up 10", tone: "good", tag: "NYK 3" },
  { period: 3, clock: "7:30", score: "67-59", text: "Wembanyama dunk pulls San Antonio back", tone: "bad", tag: "SAS DUNK" },
  { period: 3, clock: "0:35", score: "84-73", text: "Robinson alley-oop DUNK off the Bridges feed", tone: "good", tag: "NYK ALLEY-OOP" },
  { period: 4, clock: "11:01", score: "87-75", text: "Shamet from way downtown to open the 4th", tone: "good", tag: "NYK 3" },
  { period: 4, clock: "10:44", score: "87-78", text: "Wembanyama 27-foot three keeps it close", tone: "bad", tag: "SAS 3" },
  { period: 4, clock: "6:45", score: "95-83", text: "McBride three — Knicks stretch it to 12", tone: "good", tag: "NYK 3" },
  { period: 4, clock: "0:09", score: "105-104", text: "Brunson clutch free throw, Knicks cling to a 1-point lead", tone: "good", tag: "CLUTCH" },
  { period: 4, clock: "0:02", score: "105-104", text: "Wembanyama misses the dagger — Knicks survive!", tone: "good", tag: "FINAL" },
];
