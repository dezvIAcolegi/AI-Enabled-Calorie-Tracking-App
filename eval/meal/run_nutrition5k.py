"""Run the Nutrition5k test photos through Gemini and save what it detects.

Uses the Phase 0 prompt and model choice (phase0_model_check.py). Results are saved after every
photo, so an interrupted run (free-tier daily cap, Ctrl+C) picks up where it stopped.

    ai/.venv/Scripts/python eval/meal/run_nutrition5k.py
    ai/.venv/Scripts/python eval/meal/run_nutrition5k.py --model gemini-3.5-flash-lite

Reads GEMINI_API_KEY from ai/.env. Needs google-genai, pillow, pydantic.
"""

import argparse
import csv
import json
import time
from pathlib import Path

from google import genai
from google.genai import errors, types
from phase0_model_check import PROMPT, Detection, GeminiDetection, api_key, load_jpeg
from pydantic import ValidationError

HERE = Path(__file__).resolve().parent
MIN_INTERVAL_S = 6.5  # stay under ~10 requests per minute on the free tier
RATE_LIMIT_WAIT_S = 60
MAX_RATE_LIMIT_RETRIES = 4  # after this many 429s in a row, assume the daily cap and stop


class DailyCapReached(Exception):
    pass


def detect(client: genai.Client, model: str, jpeg: bytes) -> tuple[Detection, float]:
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=GeminiDetection,
        thinking_config=types.ThinkingConfig(thinking_level="minimal"),
    )
    contents = [types.Part.from_bytes(data=jpeg, mime_type="image/jpeg"), PROMPT]
    rate_limited = 0
    server_errors = 0
    while True:
        start = time.monotonic()
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            return Detection.model_validate_json(resp.text), time.monotonic() - start
        except errors.ClientError as e:
            if e.code != 429:
                raise
            rate_limited += 1
            if rate_limited > MAX_RATE_LIMIT_RETRIES:
                raise DailyCapReached(str(e)[:200]) from e
            print(f"  429, waiting {RATE_LIMIT_WAIT_S}s")
            time.sleep(RATE_LIMIT_WAIT_S)
        except errors.ServerError:  # 503 "high demand"
            server_errors += 1
            if server_errors > 2:
                raise
            time.sleep(10 * server_errors)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default="gemini-3.5-flash")
    parser.add_argument("--photos", type=Path, default=HERE / "photos" / "nutrition5k")
    parser.add_argument("--truth", type=Path, default=HERE / "truth_nutrition5k.csv")
    parser.add_argument("--out", type=Path, default=HERE / "predictions_nutrition5k.json")
    args = parser.parse_args()

    with args.truth.open(encoding="utf-8") as f:
        photos = sorted({row["photo"] for row in csv.DictReader(f)})
    results = json.loads(args.out.read_text(encoding="utf-8")) if args.out.exists() else {}
    todo = [p for p in photos if "items" not in results.get(p, {})]
    print(f"{len(photos)} photos, {len(photos) - len(todo)} already done, {len(todo)} to run")

    client = genai.Client(api_key=api_key())
    last_call = 0.0
    for n, photo in enumerate(todo, 1):
        time.sleep(max(0.0, MIN_INTERVAL_S - (time.monotonic() - last_call)))
        last_call = time.monotonic()
        try:
            detection, seconds = detect(client, args.model, load_jpeg(args.photos / photo))
            results[photo] = {"model": args.model, "seconds": round(seconds, 1), **detection.model_dump()}
            foods = ", ".join(f"{f.name} {f.grams:g}g" for f in detection.items)
            print(f"[{n}/{len(todo)}] {photo} {seconds:4.1f}s  {foods}")
        except DailyCapReached as e:
            print(f"Stopped: still rate limited ({e}). Run again later to continue.")
            break
        except (errors.APIError, ValidationError) as e:  # keep going; a rerun retries it
            results[photo] = {"model": args.model, "error": str(e)[:300]}
            print(f"[{n}/{len(todo)}] {photo} ERROR {str(e)[:120]}")
        args.out.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    done = sum("items" in results.get(p, {}) for p in photos)
    print(f"{done}/{len(photos)} photos have predictions in {args.out}")


if __name__ == "__main__":
    main()
