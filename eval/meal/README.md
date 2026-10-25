# Meal eval (Sebi)

Measures how well `POST /meal/photo` finds the foods on a plate and estimates their grams and kcal.

```
fetch_nutrition5k.py      downloads the Nutrition5k test set (photos + truth)
truth_nutrition5k.csv     weighed truth for those photos, one row per ingredient
photos/nutrition5k/       the downloaded photos (git-ignored; re-run the script)
phase0_model_check.*      Phase 0 model choice, see phase0_model_check.md
```

## Nutrition5k

[Nutrition5k](https://github.com/google-research-datasets/Nutrition5k) (Thames et al., CVPR 2021, CC BY 4.0) is ~5k plates from Google cafeterias in California with every ingredient weighed. It contains no people and no personal data, so it doesn't conflict with the "own photos only" rule, which is about personal data reaching the Gemini free tier.

```sh
py eval/meal/fetch_nutrition5k.py                 # 150 plates, seed 1
py eval/meal/fetch_nutrition5k.py --count 50 --seed 2
```

It uses the official test split, keeps only dishes with an overhead photo, drops partial scans (the rig scanned each plate after every ingredient was added) and plates under 20 kcal.

Limits: 640×480 photos taken straight down by a fixed rig, so they're easier than phone photos, and no Romanian food. Our own weighed photos cover both.

## truth CSV

| Column | Meaning |
|---|---|
| `photo` | File name of the photo |
| `source` | `nutrition5k`, or `own` for our weighed photos |
| `ingredient` | Ingredient name |
| `grams` | Weighed grams |
| `kcal`, `protein`, `carbs`, `fat` | For those grams (not per 100 g). May be blank for `own` rows |

Half of the Nutrition5k ingredients weigh under 5 g (oil, salt, herbs). Scoring should ignore small ingredients for detection but keep them in the kcal total.
