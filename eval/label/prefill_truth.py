"""Draft truth rows from Gemini for new photos -> truth_draft.csv (for you to check by hand).

    ai/.venv/Scripts/python eval/label/prefill_truth.py

For every photo in photos/ that isn't in truth.csv or truth_draft.csv yet, reads the label
with the same reader as run_label.py and appends a draft row: condition from the file name
prefix (`curved_03.jpg` -> curved), language `ro` for romanian photos (else blank), values
as Gemini read them. The result also goes into predictions.json, so run_label.py won't call
Gemini again for it.

The draft IS the model's answer, so a row you don't check scores 100% by construction.
Check every value against the package, fix what's wrong, then move the row to truth.csv.
"""

import asyncio
import csv
import json

from run_label import HERE, read  # also sets up ai/ on sys.path and the working directory

from app.label.checks import NUTRIENTS  # noqa: E402

PHOTOS = HERE / "photos"
TRUTH, DRAFT, PREDS = HERE / "truth.csv", HERE / "truth_draft.csv", HERE / "predictions.json"
COLUMNS = ["photo", "condition", "language", *NUTRIENTS, "serving_grams"]
CONDITIONS = ("clear", "blurry", "curved", "romanian")
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp", ".heic"}


def photos_in(path) -> set[str]:
    if not path.exists():
        return set()
    with open(path, newline="", encoding="utf-8") as f:
        return {r["photo"] for r in csv.DictReader(f)}


def fmt(v) -> str:
    return "" if v is None else f"{v:g}"


async def main() -> None:
    done = photos_in(TRUTH) | photos_in(DRAFT)
    new = sorted(
        p.name for p in PHOTOS.iterdir() if p.suffix.lower() in IMAGE_TYPES and p.name not in done
    )
    if not new:
        print("no new photos in photos/")
        return
    preds = json.loads(PREDS.read_text("utf-8")) if PREDS.exists() else {}
    fresh = not DRAFT.exists()
    with open(DRAFT, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if fresh:
            w.writerow(COLUMNS)
        for i, name in enumerate(new, 1):
            cond = name.split("_", 1)[0]
            if cond not in CONDITIONS:
                print(f"[{i}/{len(new)}] {name}: skipped, name must start with one of {CONDITIONS}")
                continue
            try:
                r = preds.get(name) or await read(PHOTOS / name)
            except Exception as e:  # noqa: BLE001
                print(f"[{i}/{len(new)}] {name}: FAILED {getattr(e, 'detail', e)}")
                if getattr(e, "status_code", None) == 429:
                    break
                continue
            preds[name] = r
            per = r["per_100g"] or {}
            w.writerow([name, cond, "ro" if cond == "romanian" else "",
                        *(fmt(per.get(k)) for k in NUTRIENTS), fmt(r["serving_grams"])])  # fmt: skip
            f.flush()
            PREDS.write_text(json.dumps(preds, indent=2, ensure_ascii=False) + "\n", "utf-8")
            note = f" flagged={r['flagged']}" if r["flagged"] else ""
            print(f"[{i}/{len(new)}] {name}: drafted{note}")
    print(f"\nCheck every row of {DRAFT.name} against the package, then move it to {TRUTH.name}.")


if __name__ == "__main__":
    asyncio.run(main())
