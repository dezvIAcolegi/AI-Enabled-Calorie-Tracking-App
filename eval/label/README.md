# Label eval (Lucas)

Measures how well `POST /label/read` reads nutrition labels: per-field accuracy, accuracy by photo condition, and how often `flagged` catches a wrong value.

```
photos/           label photos (your own only; Gemini free tier may use prompts)
truth.csv         hand-checked values, one row per photo
predictions.json  {photo file name: /label/read result}, written by run_label.py
run_label.py      runs every photo in truth.csv through the label reader
score.py          prints the accuracy table
test_score.py     self-check for score.py
```

## Run

```sh
ai/.venv/Scripts/python eval/label/run_label.py   # needs GEMINI_API_KEY in ai/.env
python eval/label/score.py                        # uses truth.csv + predictions.json here
python eval/label/score.py my_truth.csv my_preds.json
python eval/label/test_score.py                   # self-check
```

`run_label.py` calls the reader in-process: same resize, prompt, model and checks as `POST /label/read`, but no cache and no daily scan cap, so it never uses a user's scans. It saves after every photo and skips photos already done, so after a free-tier stop just run it again (`--redo` starts over). It adds `_latency_s` (Gemini call only) to each result.

The committed `truth.csv` and `predictions.json` hold 3 fake `example_*` rows. Delete them once real photos go in.

## Taking the photos

Target: **about 40 photos**, 10 per condition. Use your own packages at home: only the nutrition table, no people, receipts or anything personal in frame.

| Condition | How |
|---|---|
| `clear` | Flat box or bag, good light, phone held straight over the table |
| `blurry` | Slightly out of focus or with motion blur, the way a rushed scan looks. Still a photo a person could read |
| `curved` | Bottles, cans, yoghurt pots: the table bends around the package |
| `romanian` | Romanian-only labels (Valoare energetică, Grăsimi, Glucide, Proteine), any lighting |

Also include a few of each: kJ-only energy, a label with no serving size, per-serving-only (US-style), glare on plastic.

For each photo:
1. Name it `<condition>_<nn>.jpg` (e.g. `curved_03.jpg`) and drop it in `photos/`. Phone photos can be committed as they are; the reader resizes them.
2. Add a row to `truth.csv`, typing the values **from the package itself, not from the app**. Per 100 g; blank `serving_grams` when there is none.
3. Run `run_label.py`, then `score.py`.

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
