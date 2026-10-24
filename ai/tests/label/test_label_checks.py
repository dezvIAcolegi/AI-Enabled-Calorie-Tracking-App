import pytest

from app.label.checks import check_label, energy_kcal, kj_to_kcal

# Chocolate biscuit: 4*6.5 + 4*65 + 9*21.5 = 479.5. Serving 25 g, values rounded as printed.
PER_100G = {"kcal": 480, "protein": 6.5, "carbs": 65, "fat": 21.5}
PER_SERVING = {"kcal": 120, "protein": 1.6, "carbs": 16.3, "fat": 5.4}
ALL_100G = [f"per_100g.{k}" for k in ("kcal", "protein", "carbs", "fat")]


def test_clean_label():
    assert check_label(PER_100G, PER_SERVING, 25) == []


def test_clean_label_per_100g_only():
    assert check_label(PER_100G, None, None) == []


def test_near_zero_food_not_flagged_on_rounding():
    diet_cola = {"kcal": 0.3, "protein": 0, "carbs": 0, "fat": 0}
    assert check_label(diet_cola, None, None) == []


def test_misread_fat_flags_block():
    misread = {**PER_100G, "fat": 2.15}  # decimal slip
    assert check_label(misread, None, None) == ALL_100G


def test_misread_fat_also_flags_serving_mismatch():
    flags = check_label({**PER_100G, "fat": 2.15}, PER_SERVING, 25)
    assert set(ALL_100G) <= set(flags)
    assert "per_serving.fat" in flags
    assert "serving_grams" not in flags


def test_kj_to_kcal():
    assert kj_to_kcal(4184) == pytest.approx(1000)


def test_kj_only_energy():
    kj_only = {"kj": 2008, "protein": 6.5, "carbs": 65, "fat": 21.5}
    assert energy_kcal(kj_only) == pytest.approx(479.9, abs=0.1)
    assert check_label(kj_only, None, None) == []


def test_kj_value_read_as_kcal_is_flagged():
    assert check_label({**PER_100G, "kcal": 2008}, None, None) == ALL_100G


def test_missing_serving_size():
    assert check_label(PER_100G, PER_SERVING, None) == ["serving_grams"]
    assert check_label(PER_100G, PER_SERVING, 0) == ["serving_grams"]


def test_per_serving_single_mismatch():
    # 20 g still passes 4/4/9 for the serving, but 65 * 25 / 100 = 16.25.
    assert check_label(PER_100G, {**PER_SERVING, "carbs": 20}, 25) == ["per_serving.carbs"]


def test_per_serving_all_off_flags_serving_grams():
    # Serving really 25 g, misread as 50 g.
    flags = check_label(PER_100G, PER_SERVING, 50)
    assert flags == [f"per_serving.{k}" for k in ("kcal", "protein", "carbs", "fat")] + [
        "serving_grams"
    ]


def test_missing_values_flagged_not_crashed():
    assert check_label({**PER_100G, "fat": None}, None, None) == ["per_100g.fat"]
    assert check_label({"protein": 6.5}, None, None) == [
        "per_100g.kcal",
        "per_100g.carbs",
        "per_100g.fat",
    ]


def test_missing_per_100g():
    assert check_label(None, PER_SERVING, 25) == ["per_100g"]
