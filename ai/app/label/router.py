"""POST /label/read. Phase 0 stub: returns the fixed sample from contracts/fixtures."""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, UploadFile

from app.label.schemas import LabelResult

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"

router = APIRouter(prefix="/label", tags=["label"])

_FIXTURE = LabelResult.model_validate(
    json.loads((FIXTURES / "label-read.response.json").read_text(encoding="utf-8"))
)


@router.post("/read", response_model=LabelResult)
async def read_label(image: Annotated[UploadFile, File()]) -> LabelResult:
    return _FIXTURE
