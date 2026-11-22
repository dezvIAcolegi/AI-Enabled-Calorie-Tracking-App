import pytest
from fastapi import HTTPException

from app.meal import pipeline
from app.meal.detector import Detection
from app.meal.schemas import MealResponse

pytestmark = pytest.mark.anyio


def reply(*items, warnings=()):
    return Detection(items=list(items), warnings=list(warnings)).model_dump_json()


async def test_photo_end_to_end(gemini, foods, make_food, make_photo):
    gemini.replies = [reply(make_food(), warnings=["mixed_dish"])]
    foods.add("fried egg", "fdc:1")
    result = await pipeline.photo_meal(make_photo(), "jwt")
    assert [i.food_id for i in result.items] == ["fdc:1"]
    assert result.warnings == ["mixed_dish"]
    MealResponse.model_validate_json(result.model_dump_json())


async def test_text_end_to_end(gemini, foods, make_food):
    gemini.replies = [reply(make_food(grams=100))]
    foods.add("fried egg", "fdc:1")
    result = await pipeline.text_meal("  two   fried eggs ", "jwt")
    assert (result.items[0].grams, result.warnings) == (100, [])
    assert gemini.calls[0]["contents"][0].text == "two fried eggs"


async def test_detection_is_cached_but_matching_is_per_caller(gemini, foods, make_food):
    gemini.replies = [reply(make_food())]
    foods.add("fried egg", "fdc:1", "fdc:2", "fdc:3")
    await pipeline.text_meal("an egg", "alice")
    await pipeline.text_meal("an  egg", "bob")
    assert len(gemini.calls) == 1
    assert [token for _, token, _ in foods.calls] == ["alice", "bob"]


async def test_same_photo_skips_gemini(gemini, foods, make_food, make_photo):
    gemini.replies = [reply(make_food())]
    photo = make_photo()
    await pipeline.photo_meal(photo, "jwt")
    await pipeline.photo_meal(photo, "jwt")
    assert len(gemini.calls) == 1


async def test_failed_search_does_not_repeat_gemini(gemini, foods, make_food):
    gemini.replies = [reply(make_food())]
    foods.error = HTTPException(status_code=502)
    for _ in range(2):
        with pytest.raises(HTTPException):
            await pipeline.text_meal("an egg", "jwt")
    assert len(gemini.calls) == 1


async def test_failed_detection_is_not_cached(gemini, foods):
    gemini.replies = ["{not json", reply()]
    with pytest.raises(HTTPException):
        await pipeline.text_meal("an egg", "jwt")
    assert (await pipeline.text_meal("an egg", "jwt")).warnings == ["no_food_detected"]


async def test_cache_is_bounded(gemini, foods, monkeypatch):
    monkeypatch.setattr(pipeline, "CACHE_MAX", 2)
    gemini.replies = [reply()] * 3
    for text in ("a", "b", "c"):
        await pipeline.text_meal(text, "jwt")
    assert len(pipeline._cache) == 2


async def test_unmatched_text_food_warns(gemini, foods, make_food):
    gemini.replies = [reply(make_food(), make_food(name="unicorn", generic_name="unicorn"))]
    foods.add("fried egg", "fdc:1")
    result = await pipeline.text_meal("egg and unicorn", "jwt")
    assert len(result.items) == 1
    assert result.warnings == ["text_unclear"]


async def test_unmatched_photo_food_warns(gemini, foods, make_food, make_photo):
    gemini.replies = [reply(make_food())]
    result = await pipeline.photo_meal(make_photo(), "jwt")
    assert (result.items, result.warnings) == ([], ["image_unclear"])


async def test_blank_text_skips_gemini(gemini):
    assert (await pipeline.text_meal("  \n ", "jwt")).warnings == ["no_food_detected"]
    assert gemini.calls == []


async def test_each_gemini_request_costs_one_scan(gemini, foods, scans, make_photo):
    gemini.replies = [reply(), reply()]
    await pipeline.photo_meal(make_photo(), "alice")
    await pipeline.text_meal("water", "bob")
    assert scans["used_by"] == ["alice", "bob"]


async def test_cached_result_costs_no_scan(gemini, foods, scans):
    gemini.replies = [reply()]
    await pipeline.text_meal("water", "alice")
    await pipeline.text_meal("water", "bob")
    assert scans["used_by"] == ["alice"]


async def test_cap_reached_never_reaches_gemini(gemini, scans, make_photo):
    scans["error"] = HTTPException(status_code=429, detail="daily_scan_cap")
    for call in (pipeline.photo_meal(make_photo(), "jwt"), pipeline.text_meal("eggs", "jwt")):
        with pytest.raises(HTTPException) as e:
            await call
        assert e.value.detail == "daily_scan_cap"
    assert gemini.calls == []


async def test_invalid_input_costs_no_scan(gemini, scans):
    with pytest.raises(HTTPException):
        await pipeline.photo_meal(b"nope", "jwt")
    await pipeline.text_meal("   ", "jwt")
    assert scans["used_by"] == []


async def test_missing_key_costs_no_scan(scans):
    with pytest.raises(HTTPException) as e:
        await pipeline.text_meal("eggs", "jwt")
    assert e.value.status_code == 503
    assert scans["used_by"] == []


async def test_bad_photo_never_reaches_gemini(gemini):
    with pytest.raises(HTTPException) as e:
        await pipeline.photo_meal(b"nope", "jwt")
    assert e.value.status_code == 415
    assert gemini.calls == []
