import httpx
import pytest
from fastapi import HTTPException

from app.config import Settings
from app.meal import scan_cap

pytestmark = pytest.mark.anyio


@pytest.fixture
def supabase(monkeypatch):
    state = {"response": httpx.Response(200, json={"allowed": True, "used": 4, "limit": 30})}

    def handle(request):
        state["request"] = request
        if isinstance(state["response"], Exception):
            raise state["response"]
        return state["response"]

    client = httpx.AsyncClient(transport=httpx.MockTransport(handle))
    monkeypatch.setattr(scan_cap, "_client", client)
    settings = Settings(_env_file=None, supabase_url="https://x.test/", supabase_anon_key="anon")
    monkeypatch.setattr(scan_cap, "get_settings", lambda: settings)
    return state


async def test_counts_as_the_caller(supabase):
    await scan_cap.consume_scan("user-jwt")
    request = supabase["request"]
    assert str(request.url) == "https://x.test/rest/v1/rpc/consume_scan"
    assert request.headers["authorization"] == "Bearer user-jwt"
    assert request.headers["apikey"] == "anon"


async def test_cap_reached_is_429(supabase):
    supabase["response"] = httpx.Response(200, json={"allowed": False, "used": 30, "limit": 30})
    with pytest.raises(HTTPException) as e:
        await scan_cap.consume_scan("jwt")
    assert (e.value.status_code, e.value.detail) == (429, "daily_scan_cap")


@pytest.mark.parametrize(
    ("response", "status"),
    [
        (httpx.Response(401), 401),
        (httpx.Response(403), 502),
        (httpx.Response(404), 502),  # migration not applied yet
        (httpx.Response(500), 502),
        (httpx.Response(200, text="<html>paused</html>"), 502),
        (httpx.Response(200, json=[]), 502),
        (httpx.Response(200, json={}), 502),
        (httpx.Response(200, json={"allowed": None}), 502),
        (httpx.Response(200, json={"allowed": "yes"}), 502),
        (httpx.ConnectError("down"), 502),
        (httpx.ReadTimeout("slow"), 502),
    ],
)
async def test_fails_closed(supabase, response, status):
    supabase["response"] = response
    with pytest.raises(HTTPException) as e:
        await scan_cap.consume_scan("jwt")
    assert e.value.status_code == status


async def test_unconfigured_fails_closed(supabase, monkeypatch):
    empty = Settings(_env_file=None, supabase_url="", supabase_anon_key="")
    monkeypatch.setattr(scan_cap, "get_settings", lambda: empty)
    with pytest.raises(HTTPException) as e:
        await scan_cap.consume_scan("jwt")
    assert e.value.status_code == 502
