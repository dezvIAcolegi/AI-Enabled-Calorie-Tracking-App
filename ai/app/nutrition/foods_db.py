"""Food search and lookup against the Supabase `foods` catalogue (USDA, OFF, CIQUAL, Romanian, user foods).

In-process interface for meal/ (and GET /foods/search):

    from app.nutrition import search_foods, get_food
    candidates = await search_foods("ou fiert", token, limit=3)   # best first, [] if nothing
    food = await get_food("fdc:173424", token)                    # Candidate | None

`token` is the caller's Supabase access token (app.auth.AccessToken), so RLS applies:
the user sees the shared catalogue plus their own foods. Never pass the service key.
Errors surface as HTTPException (401 if Supabase rejects the token, 502 otherwise).
"""

import time
from typing import Any

import httpx
from fastapi import HTTPException

from app.config import get_settings
from app.nutrition.schemas import Candidate

COLUMNS = "id,name,brand,kcal,protein,carbs,fat"
CACHE_TTL = 300  # s
CACHE_MAX = 1000

_client = httpx.AsyncClient(timeout=10)
# ponytail: in-process TTL dict, per worker; move to Redis if we run several instances.
# Keyed by token, so a user's newly created food can take up to CACHE_TTL to show up.
_cache: dict[tuple, tuple[float, list[Candidate]]] = {}


def _to_candidate(row: dict) -> Candidate:
    name = f"{row['name']}, {row['brand']}" if row.get("brand") else row["name"]
    return Candidate(
        food_id=row["id"],
        name=name,
        per_100g={k: float(row[k]) for k in ("kcal", "protein", "carbs", "fat")},
    )


async def supabase_request(method: str, path: str, token: str, **kwargs) -> Any:
    """PostgREST call as the caller (their token + publishable key). Shared with label/ for consume_scan."""
    s = get_settings()
    if not (s.supabase_url and s.supabase_anon_key):
        raise HTTPException(status_code=502, detail="foods database not configured")
    headers = {"apikey": s.supabase_anon_key, "Authorization": f"Bearer {token}"}
    try:
        r = await _client.request(
            method, s.supabase_url.rstrip("/") + path, headers=headers, **kwargs
        )
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="foods database unreachable") from e
    if r.status_code in (401, 403):
        raise HTTPException(status_code=401, detail="token rejected by foods database")
    if r.is_error:
        raise HTTPException(status_code=502, detail="foods database error")
    return r.json()


async def search_foods(query: str, token: str, limit: int = 10) -> list[Candidate]:
    """Best matches first. Ignores case and diacritics; queries under 2 chars return []."""
    query = query.strip()
    key = (token, query.lower(), limit)
    hit = _cache.get(key)
    if hit and time.monotonic() - hit[0] < CACHE_TTL:
        return hit[1]
    rows = await supabase_request(
        "POST",
        "/rest/v1/rpc/search_foods",
        token,
        params={"select": COLUMNS},
        json={"query": query, "max_results": limit},
    )
    result = [_to_candidate(r) for r in rows]
    if len(_cache) >= CACHE_MAX:
        _cache.pop(next(iter(_cache)))  # oldest insert
    _cache[key] = (time.monotonic(), result)
    return result


async def get_food(food_id: str, token: str) -> Candidate | None:
    rows = await supabase_request(
        "GET",
        "/rest/v1/foods",
        token,
        params={"id": f"eq.{food_id}", "select": COLUMNS},
    )
    return _to_candidate(rows[0]) if rows else None
