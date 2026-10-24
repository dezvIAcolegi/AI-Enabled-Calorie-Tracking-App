from fastapi.testclient import TestClient

from app.main import app
from app.nutrition.schemas import Candidate

client = TestClient(app)


def test_foods_search_returns_fixture():
    r = client.get("/foods/search", params={"q": "egg"})
    assert r.status_code == 200
    foods = [Candidate.model_validate(f) for f in r.json()]
    assert foods


def test_foods_search_requires_query():
    assert client.get("/foods/search").status_code == 422
    assert client.get("/foods/search", params={"q": ""}).status_code == 422
