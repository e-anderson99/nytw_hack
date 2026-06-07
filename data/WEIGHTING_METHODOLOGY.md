# Swing-Aware, Time-Weighted Impact Score — Methodology

This document fully specifies how `game_2_weighted_score.csv` is produced, so
the **exact same scores** can be recreated for any game from only the five raw
columns:

```
period, clock, abs_seconds_elapsed, score, event_text
```

Everything is deterministic and rule-based — no model, no manual tuning per
row. The single source of truth is [`weight_impact.py`](weight_impact.py); this
file explains every rule and constant in it so the output is auditable.

> **Score column convention (critical):** in this dataset `score` is
> **`NYK-SAS`** — the rooting team (Knicks) is listed **first**. Positive impact
> = good for the Knicks. If your data lists the opponent first, set
> `ROOT_TEAM_FIRST = False`.

---

## Why this exists

A made free throw is base `1`. But the *go-ahead* free throw that puts the
Knicks up 105-104 with 9 seconds left is one of the most important events of the
whole game. A scoring system keyed only to *event type* can't see that. So the
base impact must encode **game-state swings** (who's winning, by how much, how
late), and the multiplier then amplifies by *when* it happened and *how close*
the game is.

Final formula, per row:

```
impact_score = (event_magnitude + swing_bonus) x time_closeness_weight
```

---

## Pipeline

```
(period, clock, abs_seconds_elapsed, score, event_text)
   |
   |  STAGE 1  classify(event_text, prev_margin, new_margin, f)
   |           -> bucket, base_impact (= magnitude + swing), reason_code
   v
   |  STAGE 2  base_impact x weight(f, margin)  -> impact_score
   v
game_2_weighted_score.csv
```

Run it:

```bash
python3 data/weight_impact.py
```

It reads the raw columns from `game_2_raw_score.csv`, **recomputes** `bucket`,
`impact_score`, and `reason_code` from scratch, and writes the weighted CSV
plus a sanity printout.

Common symbols:
- `f = abs_seconds_elapsed / TOTAL_SECONDS` — fraction of game elapsed (0→1;
  `TOTAL_SECONDS = 2880` for regulation, raise for OT).
- `margin` = signed point gap `NYK - SAS`, carried forward from the last row
  whose `score` was not `-`.
- `L = lateness(f) = f**4` — concentrates "lateness" near the buzzer (≈0 in Q1,
  →1 at the end).

---

## STAGE 1 — base impact = event magnitude + game-state swing

### 1a. Which team benefits → the sign
Determined from the actor named in `event_text`. NYK roster names (Brunson,
Towns, Bridges, Anunoby, Hart, McBride, Shamet, Robinson, Kornet, …, or
"Knicks") ⇒ a Knicks action. Everything else ⇒ a Spurs action.

Sign rules (good = `+`, helps NYK):
- NYK made shot / FT / steal / block / rebound / *forced* turnover ⇒ `+`.
- The same by SAS ⇒ `−`.
- **Defense flips it:** a *NYK miss* is `−` (good for SAS); a *SAS miss* is `+`.
  A *NYK turnover* is `−`; a *SAS turnover* is `+`. A rebound credits the team
  that grabbed it.
- Timeouts: opponent timeout slightly `+`, own timeout slightly `−`.

### 1b. Event magnitude (the `MAG_*` constants)

| event class            | constant       | value | reason_code stem |
| ---------------------- | -------------- | ----- | ---------------- |
| made 3PT               | `MAG_MADE_3`   | 4     | `…_MADE_3`       |
| made 2PT               | `MAG_MADE_2`   | 3     | `…_MADE_2`       |
| steal                  | `MAG_STEAL`    | 3     | `…_STEAL`        |
| turnover (forced)      | `MAG_TOV`      | 3     | `…_TOV`          |
| missed FG (defense)    | `MAG_MISS_FG`  | 2     | `…_MISS_FG`      |
| block                  | `MAG_BLOCK`    | 2     | `…_BLOCK`        |
| made FT                | `MAG_MADE_FT`  | 1     | `…_MADE_FT`      |
| missed FT              | `MAG_MISS_FT`  | 1     | `…_MISS_FT`      |
| rebound                | `MAG_REB`      | 1     | `…_REB_D/_TEAM`  |
| timeout                | `MAG_TIMEOUT`  | 1     | `…_TIMEOUT`      |
| foul / sub / period / replay / jump ball / violation | — | 0 | `NEUTRAL` / `FOUL_NEUTRAL` |

Detection is keyword-based on `event_text`: a `(N PTS)` tally with no `MISS`
and no `Free Throw` ⇒ a made FG (3 if `3PT` present, else 2); `Free Throw`,
`MISS`, `STEAL`, `Turnover`, `BLOCK`, `REBOUND`/`Rebound`, `Timeout` map as
above; bookkeeping lines (`Start of`, `End of`, `SUB:`, `Instant Replay`,
`Violation`, `FOUL`, `Jump Ball`) are neutral.

### 1c. Game-state swing bonus (the heart of the fix)
Only applies to rows where the **score actually changed**
(`new_margin != prev_margin`). The bonus is added to the magnitude *before*
signing, and is scaled by `L = f**4` so it is negligible early and large late.
Constants are the **end-of-game (L=1) values**:

| transition (on the margin)                              | constant            | end value | tag        |
| ------------------------------------------------------- | ------------------- | --------- | ---------- |
| **Tie** — a non-tied game becomes tied (margin → 0)     | `SWING_TIE`         | 4         | `_TIE`     |
| **Lead change** — margin sign flips, **or** a tie is broken (someone takes the lead) | `SWING_LEAD_CHANGE` | 6 | `_LEADCHG` |
| **One-possession** — margin ends ≤ 3 (and late), no flip | `SWING_ONE_POSS`    | 2         | `_1POSS`   |

Checked in that order (tie first, then lead change, then one-possession).
"Breaking a tie" counts as a lead change — that is exactly the go-ahead bucket
(e.g. `104-104 → 105-104` late = `_LEADCHG`). Actual bonus = `constant * L`, so
the same lead change in Q1 adds almost nothing; in the final seconds it adds
nearly the full amount. A swing bonus is dropped if its direction doesn't match
the beneficiary of the event (a guard against mislabeled actors).

A `_CLUTCH` tag is appended whenever `L > 0.05` and `|margin| ≤ 6` (a close,
late event), independent of the swing tags.

`base_impact = (magnitude + swing_bonus)`, signed per 1a.

### 1d. Leverage of a missed shot / "stop" (score did NOT change)
A made shot that changes the lead is caught by 1c. But a **missed** shot leaves
the score unchanged, so 1c sees nothing — yet a late miss of a potential
tying/go-ahead shot is one of the biggest game-state swings there is (it's the
*stop* that effectively decides the game). We value it **symmetrically** with
the make it denied, credited to the **defending** (benefiting) side.

Applies only to missed field goals (`MISS …`, not FTs), and only when the score
didn't move. The logic (`missed_shot_leverage()`):

1. **Shooter's deficit before the shot:** `deficit = -prev_margin` if the
   shooter is NYK, else `+prev_margin` (how many points the shooting team was
   behind). If `deficit < 0` the shooter was already ahead → no leverage.
2. **Infer the shot value from the score (user's rule):** assume the *smallest*
   shot that ties-or-wins. If the text says `3PT`, or a **3** is required to tie
   (`deficit == 3`), treat it as a 3PT attempt; if a **2** ties/wins
   (`deficit ≤ 2`), treat it as a 2PT attempt. If no single shot could tie/win
   (`deficit > shot_val`), there's no special leverage.
3. **What the make would have done:**
   - `deficit == shot_val` → the make would have **tied** → denied value
     `SWING_TIE`, tag `_STOP_TIE`.
   - `deficit < shot_val` → the make would have **taken the lead** → denied
     value `SWING_LEAD_CHANGE`, tag `_STOP_LEADCHG`.
4. **Value:** `denied * L * LEVERAGE_SCALE`, added to the **defending** side
   (the miss benefits whoever the shooter was playing against).
   `LEVERAGE_SCALE = 1.0` = full symmetric value (set `< 1` for partial, e.g.
   0.65, since misses are more common than makes).

> Symmetry note: a NYK *make* taking the lead and a SAS *miss* of a go-ahead
> shot both produce a large **positive** NYK impact; a NYK *miss* of a potential
> go-ahead shot produces a large **negative** (a blown chance). Sign always
> follows the defending/benefiting side.

---

## STAGE 2 — time + closeness weight (asymmetric "U")

`weight(f, margin) = FLOOR + open_boost + end_ramp * close_blend`

1. **Floor** — `FLOOR = 0.8`. Middle-of-game baseline (slight damping).
2. **Opening energy** (first 1/16) —
   `open_boost = OPEN_AMP * exp(-f / (OPEN_WINDOW/2))`, `OPEN_AMP = 0.7`,
   `OPEN_WINDOW = 1/16`. ≈ +0.7 at tip-off (→1.5×), gone by ~1/16 in.
3. **End ramp** (clutch) — `end_ramp = END_AMP * f**END_POW`, `END_AMP = 1.2`,
   `END_POW = 3`. Near 0 through the middle, ≈ +1.2 at the buzzer (→2.0× peak).
4. **Closeness gate on the end ramp** — from `|margin|`:
   `close = clamp(1 - |margin|/MARGIN_FULL, CMIN, 1)`, `MARGIN_FULL = 15`,
   `CMIN = 0.35`; faded in by time: `close_blend = 1 - (1-close)*f**2`. A tight
   finish keeps the full ramp; a late blowout collapses it toward the floor.

### Verified envelope (printed each run)
```
time weight (tied):  f=0.0:1.50  f=0.5:0.95  f=0.9:1.67  f=1.0:2.00
closeness:           m=0:1.00  m=5:0.67  m=10:0.35  m=20:0.35
```

---

## Worked examples (from this game's clutch sequence)

| event                                         | t (s)  | score   | base | impact  | tag        |
| --------------------------------------------- | ------ | ------- | ---- | ------- | ---------- |
| Anunoby go-ahead FT                           | 2723   | 98-97   | ~+5  | **+10.15** | `_LEADCHG`       |
| Wembanyama go-ahead layup (SAS leads)         | 2822.7 | 102-103 | ~−8  | **−15.86** | `_LEADCHG`       |
| Brunson game-tying jumper                     | 2840.7 | 104-104 | ~+7  | **+13.25** | `_TIE`           |
| Brunson go-ahead FT (earlier flagged row)     | 2870.5 | 105-104 | ~+7  | **+13.21** | `_LEADCHG`       |
| **Wembanyama final miss (the flagged stop)**  | 2878.0 | (104-105)| ~+7 | **+15.30** | `_STOP_LEADCHG`  |
| Brunson missed go-ahead jumper (tied)         | 2866.5 | (tied)  | ~−7  | **−15.65** | `_STOP_LEADCHG`  |
| (for contrast) routine clutch rebound         | ~2762  | —       | 1    | ~+1.8      | `_CLUTCH`        |

The go-ahead FT went from **1.91** to **13.21**, and the game-sealing
Wembanyama miss went from **3.84** to **+15.30** — both now among the biggest
plays in the game, dwarfing routine events, exactly as a game-deciding point /
stop should.

---

## Reproducing on a new game from the 5 raw columns

1. Ensure your CSV has `period, clock, abs_seconds_elapsed, score, event_text`
   (the script reads only these; it regenerates the other three columns).
2. Set conventions at the top of `weight_impact.py`:
   - `ROOT_TEAM_FIRST` — is the rooting team listed first in `score`?
   - `TOTAL_SECONDS` — 2880, plus 300 per OT period.
   - Roster regex in `classify()` — list the rooting team's player surnames.
3. Run `python3 data/weight_impact.py`. Inspect the printed envelope + clutch
   rows to confirm the curve and swing detection look right.
4. Re-tune via the labeled constant block only; every score is a pure function
   of those constants + the raw columns, so results are fully reproducible.

### All tunable constants (one block at the top of the script)
`TOTAL_SECONDS, ROOT_TEAM_FIRST` ·
`MAG_MADE_3/2/FT, MAG_STEAL, MAG_TOV, MAG_BLOCK, MAG_MISS_FG, MAG_MISS_FT,
MAG_REB, MAG_TIMEOUT` ·
`SWING_LEAD_CHANGE, SWING_TIE, SWING_ONE_POSS, LATE_POW` ·
`LEVERAGE_SCALE` (missed-shot/stop leverage; 1.0 = full symmetric) ·
`FLOOR, OPEN_AMP, OPEN_WINDOW, END_AMP, END_POW` ·
`MARGIN_FULL, CMIN`.
