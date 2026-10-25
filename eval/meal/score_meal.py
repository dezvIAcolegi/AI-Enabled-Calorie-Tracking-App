"""Score meal photo predictions against weighed truth. Stdlib only.

    python eval/meal/score_meal.py
    python eval/meal/score_meal.py --truth my_truth.csv --predictions my_preds.json

Prints plate-level kcal and gram error, ingredient detection precision/recall and per-item
gram error, and writes one row per photo to scores_nutrition5k.csv for picking failure examples.

There is no food matching in /meal yet, so predicted kcal comes from looking up each predicted
name in nutrition5k_ingredients.csv (the dataset's own USDA-based table). Names are matched by
shared words, which is crude: "olive oil" matches "olives". Read detection numbers as a floor.
"""

import argparse
import csv
import difflib
import json
import re
import statistics
from pathlib import Path

HERE = Path(__file__).resolve().parent

MIN_DETECT_GRAMS = 10  # truth ingredients lighter than this (oil, salt, herbs) don't count for recall
MIN_WORD_OVERLAP = 0.5  # shared words / words in the shorter name, to call two names the same food
IGNORED_WORDS = {
    "a", "and", "of", "with", "in", "on", "fresh", "raw", "cooked", "plain", "whole", "small",
    "large", "grilled", "roasted", "steamed", "fried", "baked", "boiled", "sauteed", "sliced",
    "chopped", "diced", "shredded", "mixed", "piece", "pieces", "portion", "serving",
}


def singular(word: str) -> str:
    if word.endswith("ies") and len(word) > 4:
        return word[:-3] + "y"
    if word.endswith(("oes", "ches", "shes")):
        return word[:-2]
    if word.endswith("s") and not word.endswith("ss") and len(word) > 3:
        return word[:-1]
    return word


def words(name: str) -> set[str]:
    return {singular(w) for w in re.findall(r"[a-z]+", name.lower()) if w not in IGNORED_WORDS}


def similarity(a: str, b: str) -> float:
    """Share of the shorter name's words found in the other, plus a small spelling tiebreak."""
    wa, wb = words(a), words(b)
    if not wa or not wb:
        return 0.0
    overlap = len(wa & wb) / min(len(wa), len(wb))
    return overlap + 0.01 * difflib.SequenceMatcher(None, a.lower(), b.lower()).ratio()


def load_truth(path: Path) -> dict[str, list[dict]]:
    truth: dict[str, list[dict]] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            truth.setdefault(row["photo"], []).append(
                {"name": row["ingredient"], "grams": float(row["grams"]), "kcal": float(row["kcal"])}
            )
    return truth


def load_kcal_per_gram(path: Path) -> dict[str, float]:
    with path.open(newline="", encoding="utf-8") as f:
        return {row["ingr"]: float(row["cal/g"]) for row in csv.DictReader(f)}


def lookup_kcal_per_gram(name: str, table: dict[str, float]) -> tuple[float, bool]:
    """kcal/g of the closest table entry, and whether it shared enough words to trust."""
    best = max(table, key=lambda entry: similarity(name, entry))
    if similarity(name, best) >= MIN_WORD_OVERLAP:
        return table[best], True
    closest = difflib.get_close_matches(name.lower(), table, n=1, cutoff=0)
    return table[closest[0] if closest else best], False


def match_items(predicted: list[dict], truth: list[dict]) -> list[tuple[int, int]]:
    """Greedy one-to-one (pred index, truth index) pairs, most similar names first."""
    pairs = sorted(
        (
            (similarity(p["name"], t["name"]), -abs(p["grams"] - t["grams"]), i, j)
            for i, p in enumerate(predicted)
            for j, t in enumerate(truth)
        ),
        reverse=True,
    )
    used_pred, used_truth, matched = set(), set(), []
    for score, _, i, j in pairs:
        if score < MIN_WORD_OVERLAP:
            break
        if i not in used_pred and j not in used_truth:
            used_pred.add(i)
            used_truth.add(j)
            matched.append((i, j))
    return matched


def pct(x: float) -> str:
    return f"{100 * x:.0f}%"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--truth", type=Path, default=HERE / "truth_nutrition5k.csv")
    parser.add_argument("--predictions", type=Path, default=HERE / "predictions_nutrition5k.json")
    parser.add_argument("--ingredients", type=Path, default=HERE / "nutrition5k_ingredients.csv")
    parser.add_argument("--out", type=Path, default=HERE / "scores_nutrition5k.csv")
    args = parser.parse_args()

    truth = load_truth(args.truth)
    predictions = json.loads(args.predictions.read_text(encoding="utf-8"))
    table = load_kcal_per_gram(args.ingredients)

    rows, item_gram_errors, latencies = [], [], []
    detected = countable = correct_preds = n_preds = untrusted_lookups = 0
    failed = [p for p in truth if "items" not in predictions.get(p, {})]
    for photo, items in truth.items():
        pred = predictions.get(photo, {})
        if "items" not in pred:
            continue
        latencies.append(pred["seconds"])
        pred_items = pred["items"]
        pred_kcal = 0.0
        for p in pred_items:
            kcal_per_gram, trusted = lookup_kcal_per_gram(p["name"], table)
            pred_kcal += p["grams"] * kcal_per_gram
            untrusted_lookups += not trusted

        matched = match_items(pred_items, items)
        big = {j for j, t in enumerate(items) if t["grams"] >= MIN_DETECT_GRAMS}
        found = {j for _, j in matched} & big
        detected += len(found)
        countable += len(big)
        correct_preds += len(matched)
        n_preds += len(pred_items)
        item_gram_errors += [
            pred_items[i]["grams"] - items[j]["grams"] for i, j in matched if j in big
        ]

        rows.append({
            "photo": photo,
            "truth_kcal": round(sum(t["kcal"] for t in items)),
            "pred_kcal": round(pred_kcal),
            "truth_grams": round(sum(t["grams"] for t in items)),
            "pred_grams": round(sum(p["grams"] for p in pred_items)),
            "found": f"{len(found)}/{len(big)}",
            "truth_items": "; ".join(f"{t['name']} {t['grams']:g}" for t in items),
            "pred_items": "; ".join(f"{p['name']} {p['grams']:g}" for p in pred_items),
        })

    if not rows:
        raise SystemExit("No predictions to score.")

    def plate_errors(key: str) -> tuple[float, float]:
        errs = [abs(r[f"pred_{key}"] - r[f"truth_{key}"]) for r in rows]
        rel = [e / r[f"truth_{key}"] for e, r in zip(errs, rows) if r[f"truth_{key}"] > 0]
        return statistics.mean(errs), statistics.mean(rel)

    kcal_mae, kcal_rel = plate_errors("kcal")
    grams_mae, grams_rel = plate_errors("grams")
    mean_truth_kcal = statistics.mean(r["truth_kcal"] for r in rows)
    baseline_mae = statistics.mean(abs(mean_truth_kcal - r["truth_kcal"]) for r in rows)
    under = sum(r["pred_kcal"] < r["truth_kcal"] for r in rows)

    print(f"Scored {len(rows)} photos, {len(failed)} without a prediction")
    print(f"Latency: median {statistics.median(latencies):.1f}s, max {max(latencies):.1f}s\n")
    print("Plate totals                       mean abs error   mean % error")
    print(f"  kcal                             {kcal_mae:8.0f} kcal   {pct(kcal_rel):>8}")
    print(f"  grams                            {grams_mae:8.0f} g      {pct(grams_rel):>8}")
    print(f"  always guess the average plate   {baseline_mae:8.0f} kcal   (baseline)")
    print(f"  plates underestimated            {under}/{len(rows)}\n")
    print(f"Ingredients >= {MIN_DETECT_GRAMS} g")
    print(f"  recall    (weighed items found)  {pct(detected / countable)}  ({detected}/{countable})")
    print(f"  precision (predicted items real) {pct(correct_preds / n_preds)}  ({correct_preds}/{n_preds})")
    if item_gram_errors:
        print(f"  gram error per found item        mean abs {statistics.mean(map(abs, item_gram_errors)):.0f} g, "
              f"median signed {statistics.median(item_gram_errors):+.0f} g")
    print(f"\nkcal lookups without a word match: {untrusted_lookups}/{n_preds} (closest spelling used)")

    with args.out.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(sorted(rows, key=lambda r: -abs(r["pred_kcal"] - r["truth_kcal"])))
    print(f"Per-photo scores, worst first: {args.out}")


if __name__ == "__main__":
    main()
