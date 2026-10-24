"""Sanity checks on a label read. Plain dicts in, flagged dotted field names out.

A nutrient block is a dict with keys kcal, protein, carbs, fat (grams), plus an optional
kj for labels that print energy only in kJ. Missing or None values are flagged, never raised.
"""

KJ_PER_KCAL = 4.184
NUTRIENTS = ("kcal", "protein", "carbs", "fat")

# 4/4/9 tolerance. The Atwater factors are approximate: EU labels count fibre at 2 kcal/g and
# polyols at 2.4 kcal/g, and neither is one of our four fields. Every printed value is rounded
# too. 20% still passes high-fibre foods (bran cereal comes out about 20% above 4/4/9). The
# absolute floor keeps near-zero foods (diet drinks, tea) from being flagged over rounding.
ATWATER_REL_TOL = 0.20
ATWATER_ABS_TOL_KCAL = 15.0

# per_serving vs per_100g * serving_grams / 100. On a correct label only rounding separates
# them (EU: 1 kcal; 0.1 g below 10 g, 1 g above), so these stay tight.
SERVING_REL_TOL = 0.10
SERVING_ABS_TOL = 1.0


def kj_to_kcal(kj: float) -> float:
    return kj / KJ_PER_KCAL


def energy_kcal(block: dict) -> float | None:
    """kcal if printed, else converted from kJ, else None."""
    if block.get("kcal") is not None:
        return block["kcal"]
    if block.get("kj") is not None:
        return kj_to_kcal(block["kj"])
    return None


def _close(actual: float, expected: float, rel: float, abs_tol: float) -> bool:
    return abs(actual - expected) <= max(abs_tol, rel * abs(expected))


def check_label(
    per_100g: dict | None, per_serving: dict | None, serving_grams: float | None
) -> list[str]:
    """Return dotted names of fields to show the user for review, e.g. "per_100g.fat"."""
    flags = []
    if per_100g is None:
        flags.append("per_100g")

    values = {}
    for name, block in (("per_100g", per_100g), ("per_serving", per_serving)):
        if block is None:
            continue
        v = {k: energy_kcal(block) if k == "kcal" else block.get(k) for k in NUTRIENTS}
        values[name] = v
        flags += [f"{name}.{k}" for k in NUTRIENTS if v[k] is None]
        if None not in v.values():
            atwater = 4 * v["protein"] + 4 * v["carbs"] + 9 * v["fat"]
            if not _close(v["kcal"], atwater, ATWATER_REL_TOL, ATWATER_ABS_TOL_KCAL):
                # Can't tell which number was misread, so the whole block goes to review.
                flags += [f"{name}.{k}" for k in NUTRIENTS]

    if per_serving is not None:
        if serving_grams is None or serving_grams <= 0:
            flags.append("serving_grams")
        elif per_100g is not None:
            # ponytail: inline per_100g * g / 100 so t3 doesn't wait on t2;
            # switch to nutrition.macros.macros_for once it lands.
            off = [
                k
                for k in NUTRIENTS
                if values["per_serving"][k] is not None
                and values["per_100g"][k] is not None
                and not _close(
                    values["per_serving"][k],
                    values["per_100g"][k] * serving_grams / 100,
                    SERVING_REL_TOL,
                    SERVING_ABS_TOL,
                )
            ]
            flags += [f"per_serving.{k}" for k in off]
            if len(off) == len(NUTRIENTS):
                # Every column is off by the same factor: the serving size was misread.
                flags.append("serving_grams")

    return list(dict.fromkeys(flags))
