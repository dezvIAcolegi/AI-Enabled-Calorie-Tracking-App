"""GET /foods/search. Phase 0 stub: returns the fixed sample from contracts/fixtures."""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query

from app.nutrition.schemas import Candidate

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"

router = APIRouter(prefix="/foods", tags=["nutrition"])

_FIXTURE = [
    Candidate.model_validate(f)
    for f in json.loads((FIXTURES / "foods-search.response.json").read_text(encoding="utf-8"))
]


@router.get("/search", response_model=list[Candidate])
def search_foods(q: Annotated[str, Query(min_length=1)]) -> list[Candidate]:
    return _FIXTURE
