"""Meal photo -> upright, resized JPEG for Gemini."""

import io

from fastapi import HTTPException
from PIL import Image, ImageOps

MAX_SIDE = 1024  # the size the Phase 0 and Nutrition5k evals used
MAX_UPLOAD_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 64_000_000  # a small file can decode to gigabytes; 48-50 MP phone photos still fit


def prepare_photo(data: bytes) -> bytes:
    """413 if the photo is too large, 415 if it isn't a readable image."""
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="The photo is larger than 10 MB.")
    try:
        img = Image.open(io.BytesIO(data))  # reads only the header
        if img.width * img.height > MAX_PIXELS:
            raise HTTPException(status_code=413, detail="The photo has too many pixels.")
        img = ImageOps.exif_transpose(img)  # phone photos are often stored sideways
        img = img.convert("RGBA" if img.mode == "P" else img.mode).convert("RGB")
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as e:
        raise HTTPException(status_code=415, detail="That file isn't a readable image.") from e
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=85)
    return out.getvalue()
