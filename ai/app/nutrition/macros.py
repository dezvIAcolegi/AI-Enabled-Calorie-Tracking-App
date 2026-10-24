"""The one macro rule: macros = per_100g * grams / 100.

TS twin: contracts/ts/macros.ts. Change both together.
Rounding: never here. Round only when displaying (kcal to 0 decimals, grams to 1).
Takes plain dicts; pass Pydantic models through .model_dump().
"""

from collections.abc import Iterable, Mapping

KEYS = ("kcal", "protein", "carbs", "fat")


def macros_for(per_100g: Mapping[str, float], grams: float) -> dict[str, float]:
    return {k: per_100g[k] * grams / 100 for k in KEYS}


def sum_macros(items: Iterable[Mapping]) -> dict[str, float]:
    """items: [{"per_100g": {...}, "grams": float}, ...]"""
    total = dict.fromkeys(KEYS, 0.0)
    for item in items:
        m = macros_for(item["per_100g"], item["grams"])
        for k in KEYS:
            total[k] += m[k]
    return total
