"""POST /label/read: nutrition label photo -> per_100g, per_serving, serving_grams, flagged."""

from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.label.reader import MAX_UPLOAD_BYTES, read_label
from app.label.schemas import LabelResult

router = APIRouter(prefix="/label", tags=["label"])


@router.post("/read", response_model=LabelResult)
async def read_label_route(
    image: Annotated[
        UploadFile, File(description="Nutrition label photo, JPEG or PNG")
    ],
) -> LabelResult:
    if not (image.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="image must be an image file")
    return await read_label(await image.read(MAX_UPLOAD_BYTES + 1))
