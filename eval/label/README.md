# Label eval (Lucas)

Measures how well `POST /label/read` reads nutrition labels: per-field accuracy, accuracy by photo condition, and how often `flagged` catches a wrong value.

```
photos/           label photos (your own only; Gemini free tier may use prompts)
truth.csv         hand-checked values, one row per photo
predictions.json  {photo file name: /label/read result}
score.py          prints the accuracy table
test_score.py     self-check for score.py
```

## Run

```sh
python eval/label/score.py                        # uses truth.csv + predictions.json here
python eval/label/score.py my_truth.csv my_preds.json
python eval/label/test_score.py                   # self-check
```

The committed `truth.csv` and `predictions.json` hold 3 fake `example_*` rows. Delete them once real photos go in.

## truth.csv

| Column | Meaning |
|---|---|
| `photo` | File name in `photos/` |
| `condition` | `clear`, `blurry`, `curved` or `romanian` (anything else is rejected) |
| `language` | `en`, `ro`, … |
| `kcal`, `protein`, `carbs`, `fat` | **Per 100 g**, as printed. If the label shows only kJ, enter kJ / 4.184 |
| `serving_grams` | Serving size in grams; **leave blank** if the label has none |

A blank truth value means "not on the label": the prediction is correct only if it's `null` too.

## Scoring

- A value is correct within `max(absolute, 5% of truth)`: ±5 kcal, ±0.5 g for macros, ±1 g for serving size. That absorbs label rounding; a misread digit or decimal point is far outside it. Constants are at the top of `score.py`.
- A photo with no prediction scores every field as wrong.
- **Flagged caught** = wrong values whose field (`per_100g.fat`, `serving_grams`, …) is in `flagged`. **False flags** = correct values that were flagged anyway.
- `per_serving` isn't scored directly; it's derived from `per_100g` × `serving_grams`, which are.
