import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.meal import router
from app.meal.schemas import MealResponse

FIXTURES = Path(__file__).resolve().parents[3] / "contracts" / "fixtures"


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(router)
    return TestClient(app)


def load(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.mark.parametrize("name", ["meal-photo.response.json", "meal-text.response.json"])
def test_fixtures_match_pydantic_models(name):
    MealResponse.model_validate(load(name))


def test_photo_returns_fixture(client):
    resp = client.post("/meal/photo", files={"image": ("meal.jpg", b"\xff\xd8\xff", "image/jpeg")})
    assert resp.status_code == 200
    assert resp.json() == load("meal-photo.response.json")


def test_photo_rejects_non_image(client):
    resp = client.post("/meal/photo", files={"image": ("notes.txt", b"hello", "text/plain")})
    assert resp.status_code == 415


def test_photo_requires_image(client):
    assert client.post("/meal/photo").status_code == 422


def test_text_returns_fixture(client):
    resp = client.post("/meal/text", json={"text": "two eggs and a slice of toast"})
    assert resp.status_code == 200
    assert resp.json() == load("meal-text.response.json")


@pytest.mark.parametrize("body", [{}, {"text": ""}, {"text": "x" * 501}, {"text": "eggs", "extra": 1}])
def test_text_rejects_bad_body(client, body):
    assert client.post("/meal/text", json=body).status_code == 422


def test_item_must_match_first_candidate():
    data = load("meal-photo.response.json")
    data["items"][0]["food_id"] = "fdc:999"
    with pytest.raises(ValueError):
        MealResponse.model_validate(data)
