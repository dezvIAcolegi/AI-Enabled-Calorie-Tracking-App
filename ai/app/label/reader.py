"""Label photo -> LabelResult: resize, Gemini reads the label, then checks.py flags what to review."""

import asyncio
import hashlib
import io

from fastapi import HTTPException
from google import genai
from google.genai import errors, types
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

from app.config import get_settings
from app.label.checks import NUTRIENTS, check_label, energy_kcal
from app.label.schemas import LabelResult
from app.nutrition.foods_db import supabase_request

MAX_SIDE = 1600  # labels have small print; meal photos use 1024
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

PROMPT = """You read the nutrition facts table on a food package photo for a calorie tracking app.
The label may be in Romanian or English (or both). Copy the printed numbers exactly; never estimate.

- per_100g: the "per 100 g" / "100 ml" / "la 100 g" column. null if the label has no such column.
- per_serving: the "per serving" / "per portion" / "per porție" column. null if there is none.
- serving_grams: the serving size in grams (or ml), e.g. "Serving size 40 g", "1 porție = 30 g".
  null if not printed.
In each column:
- kcal: energy in kcal; kj: energy in kJ. Fill whichever is printed (often both).
- protein: "Protein" / "Proteine".
- carbs: TOTAL carbohydrate, "Carbohydrate" / "Glucide", not the "of which sugars" / "din care zaharuri" line.
- fat: TOTAL fat, "Fat" / "Grăsimi", not the "of which saturates" / "din care acizi grași saturați" line.
Use null for any value you can't read clearly (blurry, cut off, glare). Use a dot as the decimal
separator ("6,5 g" is 6.5). If the photo shows no nutrition table, return null for everything."""


# Gemini's response_schema can't take bounds, so everything is optional and checked afterwards.
class GeminiBlock(BaseModel):
    kcal: float | None
    kj: float | None
    protein: float | None
    carbs: float | None
    fat: float | None


class GeminiLabel(BaseModel):
    per_100g: GeminiBlock | None
    per_serving: GeminiBlock | None
    serving_grams: float | None


def prepare_image(data: bytes) -> bytes:
    """Any image -> upright JPEG, longest side <= MAX_SIDE. 415 if it isn't an image."""
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img)  # phone photos are often stored sideways
        img = img.convert("RGBA" if img.mode == "P" else img.mode).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as e:
        raise HTTPException(status_code=415, detail="not a readable image") from e
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=90)
    return buf.getvalue()


def _clean(block: GeminiBlock | None) -> dict | None:
    """Negative values count as unreadable. kJ-only energy is converted to kcal."""
    if block is None:
        return None
    raw = {
        k: v if v is not None and v >= 0 else None
        for k, v in block.model_dump().items()
    }
    if all(v is None for v in raw.values()):
        return None
    return {"kcal": energy_kcal(raw), **{k: raw[k] for k in NUTRIENTS[1:]}}


def to_result(label: GeminiLabel) -> LabelResult:
    per_100g, per_serving = _clean(label.per_100g), _clean(label.per_serving)
    grams = (
        label.serving_grams if label.serving_grams and label.serving_grams > 0 else None
    )

    # US-style labels print per serving only: derive per 100 g from the serving size.
    if per_100g is None and per_serving and grams:
        per_100g = {
            k: None if v is None else v * 100 / grams for k, v in per_serving.items()
        }

    flagged = check_label(per_100g, per_serving, grams)

    # An unreadable value stays null and is listed in `flagged`; the app asks the user for it.
    return LabelResult(
        per_100g=per_100g,
        per_serving=per_serving,
        serving_grams=grams,
        flagged=flagged,
    )


_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    key = get_settings().gemini_api_key
    if not key:
        raise HTTPException(status_code=503, detail="label reader not configured")
    if _client is None:
        _client = genai.Client(api_key=key)
    return _client


async def ask_gemini(jpeg: bytes) -> GeminiLabel:
    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=GeminiLabel,
        thinking_config=types.ThinkingConfig(thinking_level="minimal"),
        temperature=0,
    )
    contents = [types.Part.from_bytes(data=jpeg, mime_type="image/jpeg"), PROMPT]
    client = _gemini()
    for attempt in range(3):
        try:
            resp = await client.aio.models.generate_content(
                model=get_settings().gemini_model, contents=contents, config=config
            )
            return GeminiLabel.model_validate_json(resp.text)
        except errors.ServerError as e:  # 503 "high demand" happens; back off and retry
            if attempt == 2:
                raise HTTPException(
                    status_code=502, detail="label reader unavailable"
                ) from e
            await asyncio.sleep(2 * (attempt + 1))
        except errors.ClientError as e:
            if e.code == 429:
                raise HTTPException(status_code=429, detail="model_quota") from e
            raise HTTPException(status_code=502, detail="label reader error") from e
        except ValueError as e:  # malformed JSON from the model
            raise HTTPException(
                status_code=502, detail="label reader returned bad data"
            ) from e
    raise AssertionError("unreachable")


# ponytail: per-worker dict keyed by photo hash, so a re-sent photo skips Gemini (free-tier quota).
_cache: dict[str, LabelResult] = {}
CACHE_MAX = 256


async def consume_scan(token: str) -> None:
    """Count one scan against the user's daily cap (Supabase consume_scan); 429 when it's used up."""
    usage = await supabase_request("POST", "/rest/v1/rpc/consume_scan", token, json={})
    if not usage.get("allowed"):
        raise HTTPException(status_code=429, detail="daily_scan_cap")


async def read_label(data: bytes, token: str) -> LabelResult:
    """Bad uploads and cached photos don't count against the daily cap."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="image larger than 10 MB")
    key = hashlib.sha256(data).hexdigest()
    if key in _cache:
        return _cache[key]
    jpeg = await asyncio.to_thread(prepare_image, data)
    await consume_scan(token)
    result = to_result(await ask_gemini(jpeg))
    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)))
    _cache[key] = result
    return result
