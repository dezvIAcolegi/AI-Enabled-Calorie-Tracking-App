"""Pydantic mirror of contracts/ai/label-result.schema.json."""

from pydantic import BaseModel, ConfigDict, Field

from app.nutrition.schemas import Macros


class LabelResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    per_100g: Macros | None
    per_serving: Macros | None
    serving_grams: float | None = Field(gt=0)
    flagged: list[str]  # dotted field names, e.g. "per_100g.fat"
