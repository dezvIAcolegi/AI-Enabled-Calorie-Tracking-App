"""Download a meal test set from Nutrition5k: overhead photos plus weighed per-ingredient truth.

Nutrition5k (Google Research, CVPR 2021, CC BY 4.0) has ~5k cafeteria plates with every
ingredient weighed. This picks finished plates from the official test split, downloads their
overhead photo to photos/nutrition5k/ (git-ignored) and writes truth_nutrition5k.csv.

    python eval/meal/fetch_nutrition5k.py
    python eval/meal/fetch_nutrition5k.py --count 50 --seed 2

Standard library only. Re-running skips photos already downloaded.
"""

import argparse
import csv
import random
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
BASE = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset"
METADATA = ["metadata/dish_metadata_cafe1.csv", "metadata/dish_metadata_cafe2.csv"]
# The depth split is the dishes that have an overhead RGB-D photo.
TEST_IDS = "dish_ids/splits/depth_test_ids.txt"

MIN_KCAL = 20  # below this the "dish" is a few leaves or a drink, not a meal
# Plates were scanned after each ingredient was added, about 30 s apart. A scan whose
# ingredients are all in the next scan, taken within this many seconds, is a partial plate.
INCREMENT_GAP_S = 120

TRUTH_COLUMNS = ["photo", "source", "ingredient", "grams", "kcal", "protein", "carbs", "fat"]


def fetch(path: str) -> bytes:
    with urllib.request.urlopen(f"{BASE}/{path}", timeout=60) as response:
        return response.read()


def load_dishes() -> dict[str, dict]:
    """dish_id → {kcal, ingredients: [(name, grams, kcal, fat, carbs, protein)]}."""
    dishes = {}
    for path in METADATA:
        for row in csv.reader(fetch(path).decode().splitlines()):
            # dish_id, kcal, mass, fat, carbs, protein, then 7 fields per ingredient
            ingredients = [
                (row[i + 1], *(float(v) for v in row[i + 2 : i + 7]))
                for i in range(6, len(row), 7)
            ]
            dishes[row[0]] = {"kcal": float(row[1]), "ingredients": ingredients}
    return dishes


def timestamp(dish_id: str) -> int:
    return int(dish_id.removeprefix("dish_"))


def partial_scans(dishes: dict[str, dict]) -> set[str]:
    """Dishes that are an earlier step of the next scan of the same plate."""
    ordered = sorted(dishes, key=timestamp)
    partial = set()
    for current, following in zip(ordered, ordered[1:]):
        names = {i[0] for i in dishes[current]["ingredients"]}
        next_names = {i[0] for i in dishes[following]["ingredients"]}
        close = timestamp(following) - timestamp(current) <= INCREMENT_GAP_S
        if close and names <= next_names and dishes[following]["kcal"] > dishes[current]["kcal"]:
            partial.add(current)
    return partial


def download_photo(dish_id: str, folder: Path) -> str | None:
    """Returns the dish id if its overhead photo is missing from the bucket."""
    target = folder / f"{dish_id}.png"
    if target.exists():
        return None
    try:
        target.write_bytes(fetch(f"imagery/realsense_overhead/{dish_id}/rgb.png"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return dish_id
        raise
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--count", type=int, default=150, help="number of plates (default 150)")
    parser.add_argument("--seed", type=int, default=1, help="random seed for the selection")
    parser.add_argument("--photos", type=Path, default=HERE / "photos" / "nutrition5k")
    parser.add_argument("--truth", type=Path, default=HERE / "truth_nutrition5k.csv")
    args = parser.parse_args()

    dishes = load_dishes()
    test_ids = fetch(TEST_IDS).decode().split()
    partial = partial_scans(dishes)
    candidates = sorted(
        d for d in test_ids if d not in partial and dishes[d]["kcal"] >= MIN_KCAL
    )
    print(
        f"{len(test_ids)} test dishes, {len(partial & set(test_ids))} partial scans dropped, "
        f"{len(candidates)} finished plates with at least {MIN_KCAL} kcal"
    )

    chosen = sorted(random.Random(args.seed).sample(candidates, min(args.count, len(candidates))))
    args.photos.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=8) as pool:
        missing = {d for d in pool.map(lambda d: download_photo(d, args.photos), chosen) if d}
    if missing:
        print(f"No overhead photo for {len(missing)} dishes, left out: {', '.join(sorted(missing))}")
    chosen = [d for d in chosen if d not in missing]

    with args.truth.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(TRUTH_COLUMNS)
        for dish_id in chosen:
            for name, grams, kcal, fat, carbs, protein in dishes[dish_id]["ingredients"]:
                writer.writerow([
                    f"{dish_id}.png", "nutrition5k", name, round(grams, 1), round(kcal, 1),
                    round(protein, 2), round(carbs, 2), round(fat, 2),
                ])
    print(f"{len(chosen)} photos in {args.photos}, truth in {args.truth}")


if __name__ == "__main__":
    main()
