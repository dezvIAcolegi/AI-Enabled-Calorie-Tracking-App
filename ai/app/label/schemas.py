from pydantic import BaseModel

from app.schemas import Nutrients


class LabelResult(BaseModel):
    per_100g: Nutrients | None
    per_serving: Nutrients | None
    serving_grams: float | None
    flagged: list[str]  # dotted field names, e.g. "per_100g.fat"
