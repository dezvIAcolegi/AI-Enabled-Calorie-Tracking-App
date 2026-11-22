from app.nutrition.schemas import Candidate


def test_foods_search_returns_fixture(authed_client):
    r = authed_client.get("/foods/search", params={"q": "egg"})
    assert r.status_code == 200
    foods = [Candidate.model_validate(f) for f in r.json()]
    assert foods


def test_foods_search_requires_query(authed_client):
    assert authed_client.get("/foods/search").status_code == 422
    assert authed_client.get("/foods/search", params={"q": ""}).status_code == 422
