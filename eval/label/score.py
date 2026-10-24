"""Score label reads against hand-checked truth. Stdlib only.

Usage: python eval/label/score.py [truth.csv] [predictions.json]
Defaults to truth.csv and predictions.json next to this file.
predictions.json maps photo file name -> POST /label/read result.
"""

import csv
import json
import sys
from collections import namedtuple
from pathlib import Path

HERE = Path(__file__).parent
CONDITIONS = {"clear", "blurry", "curved", "romanian"}
MACROS = ("kcal", "protein", "carbs", "fat")
FIELDS = (*(f"per_100g.{m}" for m in MACROS), "serving_grams")

# A value counts as correct within max(absolute, 5% of truth). EU labels round energy
# to 1 kcal and macros to 0.1 g (1 g above 10 g), so the absolute slack absorbs
# rounding and the 5% absorbs it on big values. A misread digit or decimal point
# is far outside both.
ABS_TOL = {"per_100g.kcal": 5.0, "serving_grams": 1.0}
ABS_TOL_DEFAULT = 0.5  # grams, for protein/carbs/fat
REL_TOL = 0.05

Hit = namedtuple("Hit", "photo condition field correct flagged")


def num(s):
    s = s.strip()
    return float(s) if s else None


def load_truth(path):
    truth = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r["condition"] not in CONDITIONS:
                raise ValueError(f"{r['photo']}: condition {r['condition']!r} not in {sorted(CONDITIONS)}")
            vals = {f"per_100g.{m}": num(r[m]) for m in MACROS}
            vals["serving_grams"] = num(r["serving_grams"])
            truth[r["photo"]] = (r["condition"], vals)
    return truth


def predicted(result):
    per = result.get("per_100g") or {}
    vals = {f"per_100g.{m}": per.get(m) for m in MACROS}
    vals["serving_grams"] = result.get("serving_grams")
    return vals


def is_correct(field, truth, pred):
    if truth is None or pred is None:
        return truth is None and pred is None  # blank in truth means "not on the label"
    return abs(pred - truth) <= max(ABS_TOL.get(field, ABS_TOL_DEFAULT), REL_TOL * abs(truth))


def score(truth, preds):
    hits = []
    for photo, (condition, vals) in truth.items():
        result = preds.get(photo)
        pred = predicted(result or {})
        flagged = set((result or {}).get("flagged") or [])
        for field in FIELDS:
            ok = result is not None and is_correct(field, vals[field], pred[field])  # no prediction: all wrong
            hits.append(Hit(photo, condition, field, ok, field in flagged))
    return hits


def pct(k, n):
    return f"{k}/{n}  {100 * k / n:3.0f}%" if n else "n/a"


def report(hits, missing):
    def acc(sel):
        return pct(sum(h.correct for h in sel), len(sel))

    print(f"{'field':<20}correct")
    for field in FIELDS:
        print(f"{field:<20}{acc([h for h in hits if h.field == field])}")
    print(f"{'overall':<20}{acc(hits)}")

    print(f"\n{'condition':<12}{'photos':>6}  correct fields")
    for c in sorted({h.condition for h in hits}):
        sel = [h for h in hits if h.condition == c]
        print(f"{c:<12}{len({h.photo for h in sel}):>6}  {acc(sel)}")

    wrong = [h for h in hits if not h.correct]
    right = [h for h in hits if h.correct]
    print(f"\nflagged caught  {pct(sum(h.flagged for h in wrong), len(wrong))} of wrong values")
    print(f"false flags     {pct(sum(h.flagged for h in right), len(right))} of correct values")
    if missing:
        print(f"\nno prediction for {len(missing)} photo(s), scored as wrong: {', '.join(missing)}")


def main(argv):
    truth_path = Path(argv[1]) if len(argv) > 1 else HERE / "truth.csv"
    preds_path = Path(argv[2]) if len(argv) > 2 else HERE / "predictions.json"
    truth = load_truth(truth_path)
    preds = json.loads(preds_path.read_text(encoding="utf-8"))
    report(score(truth, preds), sorted(set(truth) - set(preds)))


if __name__ == "__main__":
    main(sys.argv)
