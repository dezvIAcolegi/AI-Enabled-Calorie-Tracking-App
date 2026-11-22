import asyncio

import pytest
from fastapi import HTTPException

from app.meal import matcher

pytestmark = pytest.mark.anyio


async def test_best_hit_becomes_the_item(foods, make_food):
    foods.add("fried egg", "fdc:1", "fdc:2", "fdc:3")
    item = await matcher.match_food(make_food(), "jwt")
    assert (item.name, item.food_id, item.grams) == ("fried egg", "fdc:1", 50)
    assert [c.food_id for c in item.candidates] == ["fdc:1", "fdc:2", "fdc:3"]
    assert item.per_100g == item.candidates[0].per_100g
    assert foods.calls == [("fried egg", "jwt", 3)]  # stops once it has three


async def test_romanian_name_is_searched_first(foods, make_food):
    foods.add("sărmăluțe", "manual:ro-sarmale")
    foods.add("sarmale", "fdc:9")
    food = make_food(name="sarmale", generic_name="cabbage rolls", local_name="sărmăluțe")
    item = await matcher.match_food(food, "jwt")
    assert [c.food_id for c in item.candidates] == ["manual:ro-sarmale", "fdc:9"]


async def test_falls_back_to_generic_name(foods, make_food):
    foods.add("egg", "fdc:7")
    assert (await matcher.match_food(make_food(), "jwt")).food_id == "fdc:7"


async def test_candidates_are_unique_and_at_most_three(foods, make_food):
    foods.add("fried egg", "fdc:1", "fdc:2")
    foods.add("egg", "fdc:2", "fdc:3", "fdc:4")
    item = await matcher.match_food(make_food(), "jwt")
    assert [c.food_id for c in item.candidates] == ["fdc:1", "fdc:2", "fdc:3"]


async def test_repeated_and_short_terms_are_skipped(make_food):
    food = make_food(name="Egg", generic_name="egg", local_name="o")
    assert matcher.search_terms(food) == ["Egg"]


async def test_no_hit_is_none_and_order_is_kept(foods, make_food):
    foods.add("rice", "fdc:5")
    result = await matcher.match_foods([make_food(), make_food(name="rice")], "jwt")
    assert result[0] is None
    assert result[1].food_id == "fdc:5"


@pytest.mark.parametrize("status", [401, 502])
async def test_search_failure_is_not_a_partial_meal(foods, make_food, status):
    foods.error = HTTPException(status_code=status)
    with pytest.raises(HTTPException) as e:
        await matcher.match_foods([make_food()], "jwt")
    assert e.value.status_code == status


async def test_deadline_is_502(monkeypatch, make_food):
    async def hang(*_, **__):
        await asyncio.Event().wait()

    monkeypatch.setattr(matcher, "search_foods", hang)
    monkeypatch.setattr(matcher, "DEADLINE_S", 0.01)
    with pytest.raises(HTTPException) as e:
        await matcher.match_foods([make_food()], "jwt")
    assert e.value.status_code == 502
