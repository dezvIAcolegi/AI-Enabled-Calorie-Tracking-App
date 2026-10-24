# Same cases as contracts/ts/macros.test.ts. Keep them in sync.
import pytest

from app.nutrition.macros import macros_for, sum_macros

EGGS = {"kcal": 148, "protein": 10.0, "carbs": 1.6, "fat": 11.0}
RICE = {"kcal": 130, "protein": 2.7, "carbs": 28.0, "fat": 0.3}
ZERO = {"kcal": 0, "protein": 0, "carbs": 0, "fat": 0}


def close(actual, expected):
    assert actual == {k: pytest.approx(v, abs=1e-9) for k, v in expected.items()}


def test_zero_grams():
    close(macros_for(EGGS, 0), ZERO)


def test_100_grams_equals_per_100g():
    close(macros_for(EGGS, 100), EGGS)


def test_250_grams():
    close(macros_for(EGGS, 250), {"kcal": 370, "protein": 25, "carbs": 4, "fat": 27.5})


def test_sum_of_several():
    total = sum_macros([
        {"per_100g": EGGS, "grams": 120},
        {"per_100g": RICE, "grams": 200},
        {"per_100g": EGGS, "grams": 0},
    ])
    close(total, {"kcal": 437.6, "protein": 17.4, "carbs": 57.92, "fat": 13.8})


def test_sum_of_nothing():
    close(sum_macros([]), ZERO)
