"""The per-user daily scan cap: consume_scan() from contracts/db, run as the caller."""

import httpx
from fastapi import HTTPException

from app.config import get_settings

TIMEOUT_S = 3  # with the detector and matcher deadlines this stays inside the app's 30 s

_client = httpx.AsyncClient(timeout=TIMEOUT_S)


async def consume_scan(token: str) -> None:
    """Count one scan. 429 when today's are used up; fails closed when it can't tell."""
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_anon_key):
        raise HTTPException(status_code=502, detail="The scan limit isn't configured.")
    try:
        resp = await _client.post(
            settings.supabase_url.rstrip("/") + "/rest/v1/rpc/consume_scan",
            headers={"apikey": settings.supabase_anon_key, "Authorization": f"Bearer {token}"},
            json={},
        )
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Supabase rejected the token.")
        resp.raise_for_status()
        allowed = resp.json()["allowed"]
    except (httpx.HTTPError, ValueError, KeyError, TypeError) as e:
        raise HTTPException(status_code=502, detail="The scan limit can't be checked.") from e
    if allowed is False:
        raise HTTPException(status_code=429, detail="daily_scan_cap")
    if allowed is not True:
        raise HTTPException(status_code=502, detail="The scan limit can't be checked.")
