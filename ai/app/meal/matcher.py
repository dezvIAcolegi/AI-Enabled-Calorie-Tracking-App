"""Detected food -> up to three catalogue entries, through nutrition/."""

import asyncio

from fastapi import HTTPException

from app.meal.detector import DetectedFood
from app.meal.schemas import Candidate, IngredientItem
from app.nutrition import search_foods

MAX_CANDIDATES = 3
DEADLINE_S = 9  # scan cap + detector + this stays inside the app's 30 s


def search_terms(food: DetectedFood) -> list[str]:
    """Most specific first. A Romanian name finds the Romanian generic foods in the catalogue."""
    terms: dict[str, str] = {}
    for term in (food.local_name, food.name, food.generic_name):
        if term and len(term) >= 2:  # search_foods returns nothing for shorter queries
            terms.setdefault(term.casefold(), term)
    return list(terms.values())


async def match_food(food: DetectedFood, token: str) -> IngredientItem | None:
    found: dict[str, Candidate] = {}
    for term in search_terms(food):
        for hit in await search_foods(term, token, limit=MAX_CANDIDATES):
            # nutrition's Candidate has the same fields but is another class; Pydantic wants ours.
            found.setdefault(hit.food_id, Candidate.model_validate(hit.model_dump()))
        if len(found) >= MAX_CANDIDATES:
            break
    if not found:
        return None
    candidates = list(found.values())[:MAX_CANDIDATES]
    return IngredientItem(
        name=food.name,
        food_id=candidates[0].food_id,
        grams=food.grams,
        confidence=food.confidence,
        per_100g=candidates[0].per_100g,
        candidates=candidates,
    )


async def match_foods(foods: list[DetectedFood], token: str) -> list[IngredientItem | None]:
    """Same order as `foods`; None where the catalogue has nothing.

    A failed search raises: returning a partial meal would silently undercount calories.
    """
    try:
        async with asyncio.timeout(DEADLINE_S):
            return await asyncio.gather(*(match_food(food, token) for food in foods))
    except TimeoutError as e:
        raise HTTPException(status_code=502, detail="Food search took too long.") from e
