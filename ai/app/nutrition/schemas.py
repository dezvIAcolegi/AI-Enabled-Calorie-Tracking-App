"""Pydantic mirror of contracts/ai/ingredient-item.schema.json $defs (macros, candidate).

Same shapes as Sebi's Macros/Candidate in app/meal/schemas.py; once both branches
are merged, one of them should import the other's.
"""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

FoodId = Annotated[str, StringConstraints(pattern=r"^(fdc|off|label|manual):.+$")]


class Macros(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kcal: float = Field(ge=0)
    protein: float = Field(ge=0)
    carbs: float = Field(ge=0)
    fat: float = Field(ge=0)


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food_id: FoodId
    name: str = Field(min_length=1)
    per_100g: Macros
