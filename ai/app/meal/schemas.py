"""Pydantic models for contracts/ai/meal-response.schema.json and ingredient-item.schema.json.

Keep these in step with the JSON schemas; tests/meal checks the fixtures against both.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

FoodId = Annotated[str, StringConstraints(pattern=r"^(fdc|off|label|manual):.+$")]

Warning = Literal["no_food_detected", "image_unclear", "mixed_dish", "text_unclear"]


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


class IngredientItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    food_id: FoodId
    grams: float = Field(gt=0)
    confidence: float = Field(ge=0, le=1)
    per_100g: Macros
    candidates: list[Candidate] = Field(min_length=1, max_length=3)

    @model_validator(mode="after")
    def matches_first_candidate(self) -> "IngredientItem":
        best = self.candidates[0]
        if best.food_id != self.food_id or best.per_100g != self.per_100g:
            raise ValueError("food_id and per_100g must equal candidates[0]")
        return self


class MealResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[IngredientItem]
    warnings: list[Warning]


class MealTextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=500, examples=["two eggs and a slice of toast"])
