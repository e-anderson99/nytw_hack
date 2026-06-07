#!/usr/bin/env python3
"""Compute a swing-aware, time-weighted impact_score for play-by-play data.

Deterministic, two-stage pipeline that runs from the five raw columns
(period, clock, abs_seconds_elapsed, score, event_text):

  STAGE 1  classify each event -> bucket, base_impact, reason_code
           (event type + game-state SWING: lead change / tie / possession state)
  STAGE 2  multiply base_impact by a time + closeness weight (asymmetric "U")

Reads  data/game_2_raw_score.csv   (uses its raw columns; recomputes the rest)
Writes data/game_2_weighted_score.csv

Score column convention for this dataset: "NYK-SAS" (Knicks first = home/rooting
team). Positive impact = good for NYK. Edit ROOT_TEAM_FIRST if that flips.

Every number below is produced by an auditable rule; see WEIGHTING_METHODOLOGY.md.
"""

import csv
import math
import os
import re

# =============================== CONSTANTS ==================================
TOTAL_SECONDS = 2880.0   # regulation 4x12min; raise for OT
ROOT_TEAM_FIRST = True   # True => score is "ROOT-OPP" (NYK-SAS here)

# --- Stage 1: base event magnitudes (sign applied by which team benefits) ---
MAG_MADE_3 = 4
MAG_MADE_2 = 3
MAG_MADE_FT = 1
MAG_STEAL = 3
MAG_TOV = 3
MAG_BLOCK = 2
MAG_MISS_FG = 2          # credit the defending (rooting-favoring) side
MAG_MISS_FT = 1
MAG_REB = 1
MAG_TIMEOUT = 1

# --- Stage 1: game-state SWING bonuses (added to a scoring event's base) ----
# Each is scaled by a "lateness" factor L in [0,1] (see lateness()), so a swing
# is worth little early and a lot at the end. Magnitudes below are the value at
# the very end of the game (L=1); they fade to ~0 in the 1st quarter.
SWING_LEAD_CHANGE = 6    # event flips who is winning (incl. taking lead from tie)
SWING_TIE = 4           # event ties a previously untied game
SWING_ONE_POSS = 2      # event makes/keeps it a one-possession game (<=3) late
LATE_POW = 4            # how sharply swing bonuses concentrate at the end

# --- Stage 1: LEVERAGE of a missed shot / stop (the score did NOT change) ---
# A late miss of a potential tying/go-ahead shot is a huge swing in game state
# even though no points were scored. We value it symmetrically with the make
# it denied: the bonus equals the make's swing bonus, applied to the DEFENDING
# (benefiting) side. Only misses/stops get this; makes are handled by 1c.
LEVERAGE_FULL = True     # full (symmetric) value; set scale below if partial
LEVERAGE_SCALE = 1.0     # 1.0 = full symmetric; lower (e.g. 0.65) = partial

# --- Stage 2: time weight (asymmetric U) ---
FLOOR = 0.8
OPEN_AMP = 0.7
OPEN_WINDOW = 1 / 16
END_AMP = 1.2
END_POW = 3

# --- Stage 2: closeness gate on the end ramp ---
MARGIN_FULL = 15
CMIN = 0.35

SRC = os.path.join(os.path.dirname(__file__), "game_2_raw_score.csv")
DST = os.path.join(os.path.dirname(__file__), "game_2_weighted_score.csv")


# ============================ SHARED HELPERS ===============================
def signed_margin(score, prev):
    """Return (root - opp) signed point margin; carry prev forward on '-'."""
    if not score or "-" not in score or score.strip() == "-":
        return prev
    try:
        a, b = (int(x) for x in score.split("-"))
    except ValueError:
        return prev
    root, opp = (a, b) if ROOT_TEAM_FIRST else (b, a)
    return root - opp


def lateness(f):
    """0 early -> 1 at the final buzzer, concentrated at the end."""
    return f ** LATE_POW


def missed_shot_leverage(shooter_is_nyk, prev_margin, is_three_text, f):
    """Swing value DENIED by a missed shot (a 'stop'), and its tag.

    The score didn't change, so we ask what the make WOULD have done. Margin is
    NYK-SAS; from the shooter's view the deficit they faced before the shot is:
        deficit = -prev_margin  if shooter is NYK   (NYK behind => prev_margin<0)
                  +prev_margin  if shooter is SAS
    Shot value is inferred from the score per the user's rule: assume the
    smallest shot that ties-or-wins. If a 3 is needed to tie/win, it's a 3PT
    attempt (>=3 leverage band); if a 2 ties/wins, it's a 2PT attempt. The make
    would have tied (deficit == shot_val) or taken the lead (deficit < shot_val).
    The miss benefits the DEFENDING side; value mirrors the make's swing bonus,
    scaled by lateness L and LEVERAGE_SCALE. Returns (value>=0, tag).
    """
    L = lateness(f)
    if L <= 0:
        return 0.0, ""
    deficit = -prev_margin if shooter_is_nyk else prev_margin
    if deficit < 0:
        return 0.0, ""          # shooter was already ahead: not a tie/go-ahead try
    # smallest shot value that ties or wins; respect explicit 3PT text
    shot_val = 3 if (is_three_text or deficit == 3) else (2 if deficit <= 2 else None)
    if shot_val is None or deficit > shot_val:
        return 0.0, ""          # a single shot couldn't tie/win -> no special leverage
    if deficit == shot_val:                         # make would have TIED
        denied = SWING_TIE
        tag = "_STOP_TIE"
    else:                                           # make would have taken the LEAD
        denied = SWING_LEAD_CHANGE
        tag = "_STOP_LEADCHG"
    return denied * L * LEVERAGE_SCALE, tag


# ===================== STAGE 1: classify -> base impact ====================
def classify(text, prev_margin, new_margin, f):
    """Return (bucket, base_impact, reason_code) from event_text + state.

    Sign convention: '+' good for the rooting team (NYK), '-' good for opp.
    A scoring play's base = event magnitude + game-state swing bonus.
    """
    t = text
    nyk_acts = bool(re.search(r"\b(Brunson|Towns|Bridges|Anunoby|Hart|McBride|"
                              r"Shamet|Robinson|Kornet|Achiuwa|Payne|Knicks|"
                              r"Dadiet)\b", t))
    # ---- neutral, non-impact bookkeeping ----
    if re.search(r"Start of|End of|SUB:|Instant Replay|Heave|Violation|"
                 r"FOUL|Jump Ball|Foul\b", t) and "Turnover" not in t:
        return "neutral", 0, "NEUTRAL" if "FOUL" not in t else "FOUL_NEUTRAL"

    benefits_nyk = None      # True good, False bad, None neutral
    mag = 0
    code = "NEUTRAL"
    is_missed_fg = False      # set in the missed-FG branch; gates leverage below

    # ---- made shots (drive the score; get swing bonus) ----
    m = re.search(r"\((\d+) PTS\)", t)
    is_made = bool(m) and "MISS" not in t and "Free Throw" not in t
    if is_made:
        three = "3PT" in t
        mag = MAG_MADE_3 if three else MAG_MADE_2
        benefits_nyk = nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + ("_MADE_3" if three else "_MADE_2")
    elif "Free Throw" in t and "MISS" not in t:
        mag = MAG_MADE_FT
        benefits_nyk = nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_MADE_FT"
    elif t.startswith("MISS") and "Free Throw" in t:
        mag = MAG_MISS_FT          # a miss helps the *other* side
        benefits_nyk = not nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_MISS_FT"
    elif t.startswith("MISS"):
        mag = MAG_MISS_FG
        benefits_nyk = not nyk_acts
        is_missed_fg = True
        code = ("NYK" if nyk_acts else "SAS") + "_MISS_FG"
    elif "STEAL" in t:
        mag = MAG_STEAL
        benefits_nyk = nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_STEAL"
    elif "Turnover" in t:
        # a turnover helps the team that did NOT commit it
        mag = MAG_TOV
        benefits_nyk = not nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_TOV"
    elif "BLOCK" in t:
        mag = MAG_BLOCK
        benefits_nyk = nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_BLOCK"
    elif "REBOUND" in t or "Rebound" in t:
        mag = MAG_REB
        benefits_nyk = nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_REB" + ("_D" if "REBOUND" in t else "_TEAM")
    elif "Timeout" in t:
        mag = MAG_TIMEOUT
        # opponent timeout slightly good for us; our timeout slightly bad
        benefits_nyk = not nyk_acts
        code = ("NYK" if nyk_acts else "SAS") + "_TIMEOUT"
    else:
        return "neutral", 0, "NEUTRAL"

    # ---- game-state swing bonus (scoring plays that moved the margin) ----
    swing = 0.0
    swing_tag = ""
    if new_margin != prev_margin:        # the score actually changed
        L = lateness(f)
        # lead change = sign of the margin flips, OR a tied game is broken
        # (tied -> someone now leads). Both are "who's winning" transitions.
        crossed = (prev_margin < 0 <= new_margin) or (prev_margin > 0 >= new_margin) \
            or (prev_margin == 0 and new_margin != 0)
        became_tie = (new_margin == 0 and prev_margin != 0)
        if became_tie:
            swing = SWING_TIE * L
            swing_tag = "_TIE"
        elif crossed:                              # lead change (incl. breaking a tie)
            swing = SWING_LEAD_CHANGE * L
            swing_tag = "_LEADCHG"
        elif abs(new_margin) <= 3 and L > 0:       # one-possession crunch
            swing = SWING_ONE_POSS * L
            swing_tag = "_1POSS"
        # swing helps whoever the margin moved toward
        moved_toward_nyk = new_margin > prev_margin
        if swing and (moved_toward_nyk != bool(benefits_nyk)):
            # swing direction should match the beneficiary; if mismatch, drop it
            swing = 0.0
            swing_tag = ""

    # ---- leverage of a missed shot / stop (score did NOT change) ----
    # A late miss of a potential tying/go-ahead shot is a big game-state swing
    # for the DEFENSE. The shooter is the acting team; benefits_nyk is already
    # the defending side. We add the denied swing to the defenders' side.
    if is_missed_fg and new_margin == prev_margin:
        lev, lev_tag = missed_shot_leverage(
            shooter_is_nyk=nyk_acts,            # the team that took (and missed) the shot
            prev_margin=prev_margin,
            is_three_text=("3PT" in t),
            f=f,
        )
        if lev > 0:
            swing += lev                         # benefits_nyk is the defender -> sign is right
            swing_tag = lev_tag

    base = mag + swing
    signed = base if benefits_nyk else -base
    if lateness(f) > 0.05 and abs(new_margin) <= 6:
        code += "_CLUTCH"
    code += swing_tag
    bucket = "good" if signed > 0 else ("bad" if signed < 0 else "neutral")
    return bucket, round(signed, 2), code


# ===================== STAGE 2: time + closeness weight ====================
def time_weight_parts(f):
    open_boost = OPEN_AMP * math.exp(-f / (OPEN_WINDOW / 2.0))
    end_ramp = END_AMP * (f ** END_POW)
    return FLOOR, open_boost, end_ramp


def closeness(margin):
    return max(CMIN, min(1.0, 1.0 - (abs(margin) / MARGIN_FULL)))


def weight(f, margin):
    floor, open_boost, end_ramp = time_weight_parts(f)
    close = closeness(margin)
    close_blend = 1.0 - (1.0 - close) * (f ** 2)
    return floor + open_boost + end_ramp * close_blend


# =============================== DRIVER ====================================
def main():
    with open(SRC, newline="") as fh:
        rows = list(csv.DictReader(fh))
    fieldnames = ["period", "clock", "abs_seconds_elapsed", "score",
                  "event_text", "bucket", "impact_score", "reason_code"]

    margin = 0
    for r in rows:
        f = float(r["abs_seconds_elapsed"]) / TOTAL_SECONDS
        new_margin = signed_margin(r["score"], margin)
        bucket, base, code = classify(r["event_text"], margin, new_margin, f)
        r["bucket"] = bucket
        r["reason_code"] = code
        r["impact_score"] = round(base * weight(f, new_margin), 2)
        margin = new_margin

    with open(DST, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    # ------------------------------ sanity ---------------------------------
    print(f"wrote {len(rows)} rows -> {DST}\n")
    print("time weight (tied):  "
          + "  ".join(f"f={f}:{weight(f,0):.2f}" for f in (0.0, 0.5, 0.9, 1.0)))
    print("closeness:  " + "  ".join(f"m={m}:{closeness(m):.2f}" for m in (0, 5, 10, 20)))
    print("\nkey clutch rows:")
    for r in rows:
        if r["reason_code"].endswith(("_LEADCHG", "_TIE")) and float(r["abs_seconds_elapsed"]) > 2600:
            print(f"  t={r['abs_seconds_elapsed']:>7} {r['score']:>8} "
                  f"impact={r['impact_score']:>7}  {r['reason_code']:<28} "
                  f"{r['event_text'][:42]}")


if __name__ == "__main__":
    main()
