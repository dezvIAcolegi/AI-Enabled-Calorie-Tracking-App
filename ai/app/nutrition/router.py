"""GET /foods/search: the Supabase foods catalogue, best match first."""

from typing import Annotated

from fastapi import APIRouter, Query

from app.auth import AccessToken
from app.nutrition.foods_db import search_foods as _search
from app.nutrition.schemas import Candidate

router = APIRouter(prefix="/foods", tags=["nutrition"])


@router.get("/search", response_model=list[Candidate])
async def search_foods(
    q: Annotated[str, Query(min_length=1, max_length=100)], token: AccessToken
) -> list[Candidate]:
    return await _search(q, token)
