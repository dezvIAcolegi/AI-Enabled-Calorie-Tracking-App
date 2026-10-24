import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query

from app.schemas import FoodResult

router = APIRouter(prefix="/foods", tags=["nutrition"])

# Stub: fixed sample until t7 wires in FoodData Central.
_FIXTURE = [
    FoodResult.model_validate(f)
    for f in json.loads(
        (Path(__file__).parent.parent / "fixtures" / "foods_search.json").read_text()
    )
]


@router.get("/search", response_model=list[FoodResult])
def search_foods(q: Annotated[str, Query(min_length=1)]) -> list[FoodResult]:
    return _FIXTURE
