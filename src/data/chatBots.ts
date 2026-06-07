// Scripted fake-fan chatter for the simulated MSG live chat. Buckets are keyed by
// the same tone/tag taxonomy as GAME_FEED, plus a few derived game-state
// conditions and an always-available ambient pool. This is pure data — the
// selection logic that picks lines lives in src/lib/chat.ts.

import type { FeedTone } from "@/data/gameFeed";

/** Pool of believable Knicks-fan handles used as bot authors. */
export const BOT_HANDLES: string[] = [
  "KnicksInFour", "BrunsonBurner", "MSG_Mike", "ThibsTime", "GardenFaithful",
  "VillanovaKnicks", "OG_Defense", "TownsHype", "BocketBall", "NewYorkForever",
  "OrangeAndBlue", "DeuceMcBride", "HartAttack", "WembyStopper", "RangeRoseNYK",
  "BridgesTo6", "SpikeLeeStan", "TheGardenIsLoud", "ClydeFrazier", "EmpireHoops",
];

/** Derived score/clock conditions the selector can react to (beyond tone/tag). */
export type GameStateCondition =
  | "close-late"   // small gap, late in the 4th
  | "blowout"      // large gap
  | "lead-change"  // leader flipped vs. the previous moment
  | "final";       // game over

/** Baseline reactions bucketed by FeedMoment.tone. */
export const TONE_LINES: Record<FeedTone, string[]> = {
  good: [
    "LETS GO BABY 🔥", "MSG IS ROCKING 🗽", "thats what im talking about 💪",
    "Brunson cooking again 👨‍🍳", "WE ARE SO BACK 🙌", "bucketssss 🪣", "huge 😤",
  ],
  bad: [
    "noooo come on 😩", "ugh defense?? 🤦", "we need a stop 🛑",
    "Thibs call timeout ⏱️", "that hurt 😣", "stay locked in fellas 🔒", "breathe 😮‍💨",
  ],
  neutral: [
    "long game tonight 🕰️", "good possession 👌", "settle it down 🧘",
    "love this team 🧡", "Garden energy unmatched ⚡", "here we go 🍿",
  ],
};

/** Reactions bucketed by FeedMoment.tag (specific play types). */
export const TAG_LINES: Record<string, string[]> = {
  "NYK DUNK":      ["POSTERR 💥", "OOOOH HE DUNKED IT 😱", "throw it down!! 🔨"],
  "NYK ALLEY-OOP": ["LOB CITY MSG 🌆", "Mitch with the oop! 🤝", "ALLEY OOP LETS GO 🆙"],
  "NYK 3":         ["BANG! 💣", "from deeep 🎯", "splash 💦", "count it 🟢"],
  "SAS DUNK":      ["Wemby is a problem ngl 👽", "yikes 😬", "get back on D 🏃"],
  "SAS 3":         ["ehh let them shoot it 🙄", "ok ok we good 😅", "ice cold... for us 🥶"],
  "BUZZER":        ["BUZZERRR 🚨", "TOUGH SHOT 🎯", "what a way to end it 🎬"],
  "CLUTCH":        ["ICE IN HIS VEINS 🧊", "CAPTAIN CLUTCH 🫡", "knock em down 🎯"],
  "FINAL":         ["KNICKS WIN!!!! 🎉", "SURVIVED 😮‍💨", "GAME. NEW YORK. 🗽", "ONE MORE W ✅"],
};

/** Reactions bucketed by derived game-state condition. */
export const STATE_LINES: Record<GameStateCondition, string[]> = {
  "close-late":   ["this is so stressful 😰", "HEART RATE 1000 💓", "win the game fellas 🙏", "i cant watch 🙈"],
  "blowout":      ["BLOWOUT MODE 💨", "garbage time lets go 🗑️", "rest the starters Thibs 😴", "easy money 💰"],
  "lead-change":  ["LEAD CHANGE 🔄", "back and forth game 🏓", "momentum swing 🎢", "buckle up 🎢"],
  "final":        ["GG 🤝", "what a game 🍿", "see yall next one 👋", "MSG erupting rn 🌋"],
};

/** Always-available filler chatter for the between-play moments. */
export const AMBIENT_LINES: string[] = [
  "who else here from the garden 🙋", "beers are $18 lmao 🍺", "this crowd is electric ⚡",
  "first time at MSG, insane 🤯", "Spike courtside again 🎬", "transit gonna be brutal after 🚇",
  "anyone else nervous 😬", "Knicks in 6 ✊", "defense wins championships 🛡️",
  "love this city ❤️", "stream laggin for anyone else 📺", "GO KNICKS 🧡",
];
