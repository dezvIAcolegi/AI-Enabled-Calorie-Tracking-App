# Meal eval (Sebi)

Measures how well `POST /meal/photo` finds the foods on a plate and estimates their grams and kcal.

```
fetch_nutrition5k.py          downloads the Nutrition5k test set (photos + truth)
truth_nutrition5k.csv         weighed truth for those photos, one row per ingredient
nutrition5k_ingredients.csv   the dataset's per-gram nutrition table, for scoring
photos/nutrition5k/           the downloaded photos (git-ignored; re-run the script)
run_nutrition5k.py            sends the photos to Gemini → predictions_nutrition5k.json
score_meal.py                 prints the accuracy table → scores_nutrition5k.csv (worst first)
phase0_model_check.*          Phase 0 model choice, see phase0_model_check.md
```

## Run

```sh
py eval/meal/fetch_nutrition5k.py                          # stdlib only
ai/.venv/Scripts/python eval/meal/run_nutrition5k.py       # needs GEMINI_API_KEY in ai/.env
py eval/meal/score_meal.py                                 # stdlib only
```

`run_nutrition5k.py` saves after every photo and skips photos already done, so after a free-tier stop just run it again.

## Nutrition5k

[Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) (Thames et al., CVPR 2021, CC BY 4.0) is ~5k plates from Google cafeterias in California with every ingredient weighed. It contains no people and no personal data, so it doesn't conflict with the "own photos only" rule, which is about personal data reaching the Gemini free tier.

```sh
py eval/meal/fetch_nutrition5k.py                 # 150 plates, seed 1
py eval/meal/fetch_nutrition5k.py --count 50 --seed 2
```

It uses the official test split, keeps only dishes with an overhead photo, drops partial scans (the rig scanned each plate after every ingredient was added) and plates under 20 kcal.

Limits: 640×480 photos taken straight down by a fixed rig, so they're easier than phone photos, and no Romanian food. Our own weighed photos cover both.

## Results (25 Oct 2026, Phase 0 prompt, no food matching)

The free tier allows only **20 requests/day per project for `gemini-3.5-flash`**, so Flash has 20 plates; Flash-lite ran all 150 (`predictions_nutrition5k_lite.json`, `scores_nutrition5k_lite.csv`).

| | Flash, 20 plates | Flash-lite, same 20 | Flash-lite, 150 plates |
|---|---|---|---|
| Plate kcal error | 43 kcal (23%) | 53 kcal (26%) | 109 kcal (32%) |
| Baseline: always guess the average plate | 155 kcal | 155 kcal | 207 kcal |
| Plate gram error | 28 g (25%) | 29 g (30%) | 67 g (26%) |
| Plates underestimated | 5/20 | 16/20 | 103/150 |
| Recall / precision (items ≥ 10 g) | 78% / 74% | 78% / 74% | 63% / 75% |
| Median latency | 2.5 s | 1.1 s | 1.9 s |

The first 20 plates are easier than the average plate (baseline 155 vs 207 kcal). Flash-lite underestimates big plates most: hidden oil (one plate had 45 g of olive oil, ~400 kcal) and portions guessed too small.

## truth CSV

| Column | Meaning |
|---|---|
| `photo` | File name of the photo |
| `source` | `nutrition5k`, or `own` for our weighed photos |
| `ingredient` | Ingredient name |
| `grams` | Weighed grams |
| `kcal`, `protein`, `carbs`, `fat` | For those grams (not per 100 g). May be blank for `own` rows |

## Scoring

- **Plate kcal and grams:** mean absolute and mean % error of the plate total. Every ingredient counts, including oil and salt. The "always guess the average plate" line is a baseline any model must beat.
- **Recall:** share of weighed ingredients of at least 10 g that the model found. Half of the Nutrition5k ingredients weigh under 5 g (oil, salt, herbs), and nobody can see those in a photo.
- **Precision:** share of predicted items that match any weighed ingredient.
- **Name matching** is by shared words ("grilled chicken breast" = "chicken"), so it's crude: "olive oil" matches "olives", and "lettuce" doesn't match "mixed greens". Read detection numbers as a rough floor.
- **Predicted kcal** = grams × kcal/g of the closest name in `nutrition5k_ingredients.csv`, because `/meal` has no food matching yet. Once it does, score the endpoint's own `per_100g` instead.
