"""POST /meal/photo and POST /meal/text: scan cap, Gemini, then food matching (pipeline.py)."""

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.auth import AccessToken
from app.meal import pipeline
from app.meal.image import MAX_UPLOAD_BYTES
from app.meal.schemas import MealResponse, MealTextRequest

router = APIRouter(prefix="/meal", tags=["meal"])


@router.post("/photo", response_model=MealResponse)
async def meal_photo(
    image: Annotated[UploadFile, File(description="Meal photo, JPEG or PNG")],
    token: AccessToken,
) -> MealResponse:
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="image must be an image file")
    return await pipeline.photo_meal(await image.read(MAX_UPLOAD_BYTES + 1), token)


@router.post("/text", response_model=MealResponse)
async def meal_text(body: MealTextRequest, token: AccessToken) -> MealResponse:
    return await pipeline.text_meal(body.text, token)
