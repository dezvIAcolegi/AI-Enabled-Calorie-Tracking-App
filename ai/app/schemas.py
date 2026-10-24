from pydantic import BaseModel, Field

FOOD_ID_PATTERN = r"^(fdc|off|label|manual):.+$"


class Nutrients(BaseModel):
    """Grams of each macro (kcal for energy)."""

    kcal: float
    protein: float
    carbs: float
    fat: float


class IngredientItem(BaseModel):
    name: str
    food_id: str = Field(pattern=FOOD_ID_PATTERN)
    grams: float = Field(ge=0)
    confidence: float = Field(ge=0, le=1)
    per_100g: Nutrients


class FoodResult(BaseModel):
    food_id: str = Field(pattern=FOOD_ID_PATTERN)
    name: str
    per_100g: Nutrients
