"""POST /meal/photo and POST /meal/text.

Phase 0 stubs: both return the fixed samples from contracts/fixtures. The Gemini
pipeline replaces them in Phase 1. Auth is added by the app skeleton when it
includes this router.
"""

import json
from functools import cache
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.meal.schemas import MealResponse, MealTextRequest

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"

router = APIRouter(prefix="/meal", tags=["meal"])


@cache
def _fixture(name: str) -> MealResponse:
    return MealResponse.model_validate(json.loads((FIXTURES / name).read_text(encoding="utf-8")))


@router.post("/photo", response_model=MealResponse)
async def meal_photo(
    image: Annotated[UploadFile, File(description="Meal photo, JPEG or PNG")],
) -> MealResponse:
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="image must be an image file")
    return _fixture("meal-photo.response.json")


@router.post("/text", response_model=MealResponse)
async def meal_text(body: MealTextRequest) -> MealResponse:
    return _fixture("meal-text.response.json")
