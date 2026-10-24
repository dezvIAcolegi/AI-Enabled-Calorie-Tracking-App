"""Phase 0: run meal photos through candidate Gemini Flash models and record what they see.

No FDC matching yet; this only checks detection, gram estimates, confidence and speed.
Photos stay outside the repo; only results are saved.

    python eval/meal/phase0_model_check.py "D:/Project IA/meal-photos"
    python eval/meal/phase0_model_check.py PHOTOS --models gemini-3.5-flash --out results.json

Reads GEMINI_API_KEY from ai/.env. Needs google-genai, pillow, pydantic.
"""

import argparse
import io
import json
import re
import time
from pathlib import Path
from typing import Literal

from google import genai
from google.genai import errors, types
from PIL import Image
from pydantic import BaseModel, Field, ValidationError

ROOT = Path(__file__).resolve().parents[2]
MAX_SIDE = 1024  # resize before upload to stay inside free-tier limits
IMAGE_TYPES = {".jpg", ".jpeg", ".png", ".webp"}

PROMPT = """You estimate what is in a meal photo for a calorie tracking app.

List every distinct food or drink visible that someone is about to eat.
- name: short generic English name that a nutrition database (USDA FoodData Central) would know,
  e.g. "fried egg", "white bread", "ham", "cheddar cheese". Include the cooking method when visible.
- grams: estimated edible weight of the portion shown, in grams. Use the plate, bowl, cutlery
  or packaging for scale.
- confidence: 0 to 1, how sure you are about both the food and the grams.

Split foods you can see separately (a sandwich into bread, ham, cheese, ...). Keep a dish as one
item when its parts can't be told apart (soup, stew, pizza), and add the warning "mixed_dish".
Warnings: "no_food_detected" if there is nothing edible, "image_unclear" if the photo is too
blurry or dark to be sure, "mixed_dish" as above. Return an empty list when there are none."""


Warning = Literal["no_food_detected", "image_unclear", "mixed_dish"]


# Gemini's response_schema rejects bounds like exclusiveMinimum, so it gets these
# plain shapes and the bounds are checked afterwards by Detection.
class GeminiFood(BaseModel):
    name: str
    grams: float
    confidence: float


class GeminiDetection(BaseModel):
    items: list[GeminiFood]
    warnings: list[Warning]


class DetectedFood(BaseModel):
    name: str = Field(min_length=1)
    grams: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)


class Detection(BaseModel):
    items: list[DetectedFood]
    warnings: list[Warning]


def api_key() -> str:
    match = re.search(r"^GEMINI_API_KEY=(.+)$", (ROOT / "ai" / ".env").read_text(), re.MULTILINE)
    if not match:
        raise SystemExit("GEMINI_API_KEY missing from ai/.env")
    return match.group(1).strip()


def load_jpeg(path: Path) -> bytes:
    img = Image.open(path)
    img = img.convert("RGBA" if img.mode == "P" else img.mode).convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    return buf.getvalue()


def detect(client: genai.Client, model: str, jpeg: bytes) -> tuple[Detection, float]:
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=GeminiDetection,
        thinking_config=types.ThinkingConfig(thinking_level="minimal"),
    )
    contents = [types.Part.from_bytes(data=jpeg, mime_type="image/jpeg"), PROMPT]
    for attempt in range(3):
        start = time.monotonic()
        try:
            resp = client.models.generate_content(model=model, contents=contents, config=config)
            return Detection.model_validate_json(resp.text), time.monotonic() - start
        except errors.ServerError:  # 503 "high demand" happens; back off and retry
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    raise AssertionError("unreachable")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photos", type=Path)
    parser.add_argument("--models", nargs="+", default=["gemini-3.5-flash", "gemini-3.5-flash-lite"])
    parser.add_argument("--out", type=Path, default=Path(__file__).with_name("phase0_results.json"))
    args = parser.parse_args()

    client = genai.Client(api_key=api_key())
    photos = sorted(p for p in args.photos.iterdir() if p.suffix.lower() in IMAGE_TYPES)
    results: dict[str, dict] = {}
    for photo in photos:
        jpeg = load_jpeg(photo)
        results[photo.name] = {}
        for model in args.models:
            try:
                detection, seconds = detect(client, model, jpeg)
                results[photo.name][model] = {"seconds": round(seconds, 1), **detection.model_dump()}
                foods = ", ".join(f"{f.name} {f.grams:g}g ({f.confidence:.2f})" for f in detection.items)
                print(f"{photo.name:<16} {model:<22} {seconds:5.1f}s  {foods}  {detection.warnings or ''}")
            except (errors.APIError, ValidationError) as e:  # keep going; record the failure
                results[photo.name][model] = {"error": str(e)[:300]}
                print(f"{photo.name:<16} {model:<22} ERROR {str(e)[:120]}")

    args.out.write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\nSaved {args.out}")


if __name__ == "__main__":
    main()
