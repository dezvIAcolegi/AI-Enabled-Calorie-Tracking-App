"""foods_db + GET /foods/search against a mocked Supabase (httpx.MockTransport)."""

import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.nutrition import foods_db, get_food, search_foods

ROWS = [
    {"id": "manual:ro-ou-fiert", "name": "Ou fiert", "brand": None,
     "kcal": "155.00", "protein": "12.60", "carbs": "1.10", "fat": "10.60"},
    {"id": "off:5941234567890", "name": "Oua", "brand": "Agricola",
     "kcal": 143, "protein": 12.5, "carbs": 0.7, "fat": 9.9},
]  # fmt: skip


pytestmark = pytest.mark.anyio


class FakeSupabase:
    def __init__(self):
        self.status, self.rows, self.calls = 200, ROWS, []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        self.calls.append(req)
        return httpx.Response(self.status, json=self.rows)


@pytest.fixture
def supabase(monkeypatch):
    fake = FakeSupabase()
    monkeypatch.setattr(
        foods_db, "_client", httpx.AsyncClient(transport=httpx.MockTransport(fake))
    )
    monkeypatch.setattr(foods_db, "_cache", {})
    monkeypatch.setattr(
        foods_db, "get_settings",
        lambda: Settings(supabase_url="https://x.supabase.co", supabase_anon_key="anon"),
    )  # fmt: skip
    return fake


async def test_search_maps_rows_and_sends_user_token(supabase):
    result = await search_foods("  ou fiert ", "user-jwt", limit=3)
    assert [c.food_id for c in result] == ["manual:ro-ou-fiert", "off:5941234567890"]
    assert result[0].per_100g.kcal == 155.0  # numeric strings from PostgREST
    assert result[1].name == "Oua, Agricola"
    req = supabase.calls[0]
    assert req.url.path == "/rest/v1/rpc/search_foods"
    assert req.headers["authorization"] == "Bearer user-jwt"
    assert req.headers["apikey"] == "anon"
    assert req.read() == b'{"query":"ou fiert","max_results":3}'


async def test_search_is_cached_per_token(supabase):
    await search_foods("ou", "a")
    await search_foods("OU", "a")
    assert len(supabase.calls) == 1
    await search_foods("ou", "b")  # other user: own foods differ, no shared cache
    assert len(supabase.calls) == 2


async def test_search_empty(supabase):
    supabase.rows = []
    assert await search_foods("zzzz", "t") == []


@pytest.mark.parametrize(("status", "expected"), [(401, 401), (403, 401), (500, 502)])
async def test_supabase_errors(supabase, status, expected):
    supabase.status = status
    with pytest.raises(HTTPException) as e:
        await search_foods("ou", "t")
    assert e.value.status_code == expected


async def test_not_configured_is_502(supabase, monkeypatch):
    monkeypatch.setattr(
        foods_db,
        "get_settings",
        lambda: Settings(supabase_url="", supabase_anon_key=""),
    )
    with pytest.raises(HTTPException) as e:
        await search_foods("ou", "t")
    assert e.value.status_code == 502


async def test_get_food(supabase):
    supabase.rows = ROWS[:1]
    food = await get_food("manual:ro-ou-fiert", "t")
    assert food.name == "Ou fiert"
    assert dict(supabase.calls[0].url.params)["id"] == "eq.manual:ro-ou-fiert"
    supabase.rows = []
    assert await get_food("fdc:0", "t") is None


def test_route_returns_candidates(authed_client, supabase):
    r = authed_client.get("/foods/search", params={"q": "ou"})
    assert r.status_code == 200
    assert [f["food_id"] for f in r.json()] == [
        "manual:ro-ou-fiert",
        "off:5941234567890",
    ]
    assert supabase.calls[0].headers["authorization"] == "Bearer test-token"


def test_route_requires_query(authed_client):
    assert authed_client.get("/foods/search").status_code == 422
    assert authed_client.get("/foods/search", params={"q": ""}).status_code == 422
