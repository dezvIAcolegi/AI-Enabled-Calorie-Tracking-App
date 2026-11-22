"""What /meal/photo and /meal/text do: scan cap -> detect -> match -> MealResponse.

`token` is the caller's verified Supabase token (app.auth.AccessToken).
"""

import asyncio
import hashlib
from collections.abc import Awaitable, Callable

from app.config import get_settings
from app.meal import detector, image, matcher
from app.meal.scan_cap import consume_scan
from app.meal.schemas import MealResponse, Warning

CACHE_MAX = 256
# Per worker and in memory only. Holds what Gemini saw, never matches: those depend on the
# caller's own foods. Keys are hashes, so no photo or text is kept.
_cache: dict[str, detector.Detection] = {}


async def _detect_cached(
    kind: str, data: bytes, detect: Callable[[], Awaitable[detector.Detection]]
) -> detector.Detection:
    key = f"{kind}:{get_settings().gemini_model}:{hashlib.sha256(data).hexdigest()}"
    if key in _cache:
        return _cache[key]
    result = await detect()
    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)), None)
    _cache[key] = result
    return result


async def _respond(detection: detector.Detection, token: str, unclear: Warning) -> MealResponse:
    matched = await matcher.match_foods(detection.items, token)
    items = [item for item in matched if item is not None]
    warnings = list(detection.warnings)
    if len(items) < len(matched) and unclear not in warnings:
        # An item needs a food_id, so a food missing from the catalogue can't be returned. The
        # contract has no "unmatched" warning; this is the closest one, so the user still checks.
        warnings.append(unclear)
    return MealResponse(items=items, warnings=warnings)


async def photo_meal(data: bytes, token: str) -> MealResponse:
    async def detect() -> detector.Detection:
        jpeg = await asyncio.to_thread(image.prepare_photo, data)
        detector.ensure_configured()
        await consume_scan(token)
        return await detector.detect_photo(jpeg)

    return await _respond(await _detect_cached("photo", data, detect), token, "image_unclear")


async def text_meal(text: str, token: str) -> MealResponse:
    text = " ".join(text.split())
    if not text:
        return MealResponse(items=[], warnings=["no_food_detected"])

    async def detect() -> detector.Detection:
        detector.ensure_configured()
        await consume_scan(token)
        return await detector.detect_text(text)

    detection = await _detect_cached("text", text.encode(), detect)
    return await _respond(detection, token, "text_unclear")
