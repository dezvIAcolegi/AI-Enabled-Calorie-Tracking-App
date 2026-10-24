"""Run: python eval/label/test_score.py (or pytest eval/label)."""

import json

from score import FIELDS, HERE, is_correct, load_truth, score


def test_score():
    assert is_correct("per_100g.kcal", 250, 254)
    assert not is_correct("per_100g.fat", 7, 70)
    assert is_correct("serving_grams", None, None)
    assert not is_correct("serving_grams", None, 30)

    truth = load_truth(HERE / "truth.csv")
    preds = json.loads((HERE / "predictions.json").read_text(encoding="utf-8"))
    hits = score(truth, preds)
    wrong = {(h.photo, h.field) for h in hits if not h.correct}
    assert wrong == {("example_blurry_en.jpg", "per_100g.fat"), ("example_romanian.jpg", "per_100g.protein")}
    assert sum(h.flagged for h in hits if not h.correct) == 1  # fat caught, protein missed
    assert sum(h.flagged for h in hits if h.correct) == 1  # carbs false alarm

    missing = score(truth, {})  # no predictions: everything wrong, even blank-in-truth fields
    assert sum(h.correct for h in missing) == 0
    assert len(missing) == len(truth) * len(FIELDS)


if __name__ == "__main__":
    test_score()
    print("ok")
