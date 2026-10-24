from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.label.schemas import LabelResult

router = APIRouter(prefix="/label", tags=["label"])

# Stub: fixed sample until t8 wires in Gemini.
_FIXTURE = LabelResult.model_validate_json(
    (Path(__file__).parent.parent / "fixtures" / "label_read.json").read_text()
)


@router.post("/read", response_model=LabelResult)
async def read_label(image: Annotated[UploadFile, File()]) -> LabelResult:
    return _FIXTURE
