from fastapi.testclient import TestClient

from app.label.schemas import LabelResult
from app.main import app
from app.schemas import FoodResult

client = TestClient(app)


def test_health():
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_label_read_returns_valid_result():
    r = client.post("/label/read", files={"image": ("label.jpg", b"\xff\xd8fake", "image/jpeg")})
    assert r.status_code == 200
    LabelResult.model_validate(r.json())


def test_label_read_requires_image():
    assert client.post("/label/read").status_code == 422


def test_foods_search_returns_valid_list():
    r = client.get("/foods/search", params={"q": "egg"})
    assert r.status_code == 200
    foods = [FoodResult.model_validate(f) for f in r.json()]
    assert foods


def test_foods_search_requires_query():
    assert client.get("/foods/search").status_code == 422
    assert client.get("/foods/search", params={"q": ""}).status_code == 422
