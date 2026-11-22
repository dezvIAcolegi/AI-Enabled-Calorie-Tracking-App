import json
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.auth import access_token
from app.meal import router
from app.meal.detector import Detection
from app.meal.image import MAX_UPLOAD_BYTES
from app.meal.schemas import MealResponse

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[access_token] = lambda: "user-jwt"
    return TestClient(app)


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def detected(*items) -> str:
    return Detection(items=list(items), warnings=[]).model_dump_json()


@pytest.mark.parametrize("name", ["meal-photo.response.json", "meal-text.response.json"])
def test_fixtures_match_pydantic_models(name):
    MealResponse.model_validate(load(name))


def test_item_must_match_first_candidate():
    data = load("meal-photo.response.json")
    data["items"][0]["food_id"] = "fdc:999"
    with pytest.raises(ValueError):
        MealResponse.model_validate(data)


def test_photo_runs_the_pipeline_as_the_caller(client, gemini, foods, scans, make_food, make_photo):
    gemini.replies = [detected(make_food())]
    foods.add("fried egg", "fdc:1", "fdc:2", "fdc:3")
    resp = client.post("/meal/photo", files={"image": ("meal.jpg", make_photo(), "image/jpeg")})
    assert resp.status_code == 200
    assert resp.json()["items"][0]["food_id"] == "fdc:1"
    assert scans["used_by"] == ["user-jwt"]
    assert foods.calls[0][1] == "user-jwt"


def test_text_runs_the_pipeline_as_the_caller(client, gemini, foods, scans, make_food):
    gemini.replies = [detected(make_food())]
    foods.add("fried egg", "fdc:1")
    resp = client.post("/meal/text", json={"text": "a fried egg"})
    assert resp.status_code == 200
    assert resp.json()["items"][0]["food_id"] == "fdc:1"
    assert scans["used_by"] == ["user-jwt"]


@pytest.mark.parametrize(
    ("data", "content_type", "status"),
    [
        (b"hello", "text/plain", 415),
        (b"\xff\xd8\xff", "image/jpeg", 415),
        (b"\0" * (MAX_UPLOAD_BYTES + 1), "image/jpeg", 413),
    ],
    ids=["not-an-image-type", "unreadable", "too-large"],
)
def test_bad_upload_uses_no_scan(client, gemini, scans, data, content_type, status):
    resp = client.post("/meal/photo", files={"image": ("meal.jpg", data, content_type)})
    assert resp.status_code == status
    assert gemini.calls == []
    assert scans["used_by"] == []


def test_photo_requires_image(client):
    assert client.post("/meal/photo").status_code == 422


@pytest.mark.parametrize(
    "body", [{}, {"text": ""}, {"text": "x" * 501}, {"text": "eggs", "extra": 1}]
)
def test_text_rejects_bad_body(client, body):
    assert client.post("/meal/text", json=body).status_code == 422


def test_cap_reaches_the_app_as_detail(client, gemini, scans):
    scans["error"] = HTTPException(status_code=429, detail="daily_scan_cap")
    resp = client.post("/meal/text", json={"text": "eggs"})
    assert (resp.status_code, resp.json()) == (429, {"detail": "daily_scan_cap"})
