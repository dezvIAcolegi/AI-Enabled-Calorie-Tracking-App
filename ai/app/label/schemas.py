"""Pydantic mirror of contracts/ai/label-result.schema.json."""

from pydantic import BaseModel, ConfigDict, Field


class LabelMacros(BaseModel):
    """Like Macros, but a value the model couldn't read is null (and listed in flagged)."""

    model_config = ConfigDict(extra="forbid")

    kcal: float | None = Field(ge=0)
    protein: float | None = Field(ge=0)
    carbs: float | None = Field(ge=0)
    fat: float | None = Field(ge=0)


class LabelResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    per_100g: LabelMacros | None
    per_serving: LabelMacros | None
    serving_grams: float | None = Field(gt=0)
    flagged: list[str]  # dotted field names, e.g. "per_100g.fat"
