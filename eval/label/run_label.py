"""Run every photo in truth.csv through the label reader -> predictions.json.

    ai/.venv/Scripts/python eval/label/run_label.py            # needs GEMINI_API_KEY in ai/.env
    ai/.venv/Scripts/python eval/label/run_label.py --redo     # ignore earlier results

Calls the reader in-process (same resize, prompt, model and checks as POST /label/read) but
skips its cache and the daily scan cap, so eval runs don't use anyone's scans. Saves after
every photo and skips photos already in predictions.json, so after a free-tier stop just run
it again. Each result also gets `_latency_s` (Gemini call only); score.py ignores it.
"""

import argparse
import asyncio
import csv
import json
import os
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
AI = HERE.parents[1] / "ai"
os.chdir(AI)  # app.config reads .env from the working directory
sys.path.insert(0, str(AI))

from app.config import get_settings  # noqa: E402
from app.label.reader import ask_gemini, prepare_image, to_result  # noqa: E402


async def read(photo: Path) -> dict:
    jpeg = prepare_image(photo.read_bytes())
    start = time.monotonic()
    label = await ask_gemini(jpeg)
    result = to_result(label).model_dump()
    result["_latency_s"] = round(time.monotonic() - start, 2)
    return result


async def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--truth", type=Path, default=HERE / "truth.csv")
    p.add_argument("--out", type=Path, default=HERE / "predictions.json")
    p.add_argument("--photos", type=Path, default=HERE / "photos")
    p.add_argument("--redo", action="store_true")
    args = p.parse_args()

    with open(args.truth, newline="", encoding="utf-8") as f:
        photos = [r["photo"] for r in csv.DictReader(f)]
    preds = {} if args.redo or not args.out.exists() else json.loads(args.out.read_text("utf-8"))
    todo = [ph for ph in photos if ph not in preds and (args.photos / ph).exists()]
    missing = [ph for ph in photos if not (args.photos / ph).exists()]
    if missing:
        print(f"skipping {len(missing)} photo(s) not in photos/: {', '.join(missing)}")
    print(f"model {get_settings().gemini_model}: {len(todo)} to read, {len(preds)} already done")

    for i, ph in enumerate(todo, 1):
        try:
            preds[ph] = await read(args.photos / ph)
            r = preds[ph]
            print(f"[{i}/{len(todo)}] {ph}: {r['_latency_s']}s flagged={r['flagged']}")
        except Exception as e:  # noqa: BLE001 - keep going; HTTPException carries the reason
            print(f"[{i}/{len(todo)}] {ph}: FAILED {getattr(e, 'detail', e)}")
            if getattr(e, "status_code", None) == 429:
                print("Gemini quota reached; run again later to continue.")
                break
        args.out.write_text(json.dumps(preds, indent=2, ensure_ascii=False) + "\n", "utf-8")


if __name__ == "__main__":
    asyncio.run(main())
