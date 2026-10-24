# Using the foods database from the AI service

For Lucas (`nutrition/`, `label/`) and Sebi (`meal/`). Written by Kevin; the schema is in `contracts/db`. The code below is an example for `/ai`, which is Lucas's folder: adapt it freely.

## The idea

The full food catalogue (~104k foods: USDA, Open Food Facts, CIQUAL, Romanian generic foods) now lives in the Supabase table `foods`, with a fast search function. So `GET /foods/search` and meal matching can query our own database instead of calling the FDC API: no FDC key, no rate limit, Romanian foods and barcodes included.

**Proposal:** `nutrition/` calls `search_foods` in Supabase. Your call, Lucas. The FDC API can stay as a fallback if you want.

## Rules

1. **Call Supabase with the user's token**, not the service key. Send the publishable key as `apikey` and the user's access token (the one the app sent you) as `Authorization`. RLS then applies: the user sees the shared catalogue plus their own foods, nothing else.
2. The service key never goes into the AI service.
3. All values are **per 100 g** (per 100 ml when `basis` is `ml`), which is exactly the `per_100g` of the ingredient item.

`ai/.env` needs `SUPABASE_URL` (already listed) and `SUPABASE_ANON_KEY` (the shared project's publishable key; add it to `ai/.env.example`).

## Example: `ai/app/nutrition/foods_db.py`

```python
import os
import uuid

import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]  # publishable key, safe on the server

FOOD_COLUMNS = (
    "id,origin,name,brand,barcode,basis,kcal,protein,carbs,fat,fiber,"
    "serving_name,serving_grams"
)


def _headers(user_token: str) -> dict[str, str]:
    return {"apikey": SUPABASE_ANON_KEY, "Authorization": f"Bearer {user_token}"}


async def search_foods(
    client: httpx.AsyncClient, user_token: str, query: str, limit: int = 10
) -> list[dict]:
    """Best matches first; ignores case and diacritics ("albus" finds "Albuș de ou")."""
    r = await client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/search_foods",
        headers=_headers(user_token),
        params={"select": FOOD_COLUMNS},
        json={"query": query, "max_results": limit},
    )
    r.raise_for_status()
    return r.json()


async def get_food(client: httpx.AsyncClient, user_token: str, food_id: str) -> dict | None:
    r = await client.get(
        f"{SUPABASE_URL}/rest/v1/foods",
        headers=_headers(user_token),
        params={"id": f"eq.{food_id}", "select": FOOD_COLUMNS},
    )
    r.raise_for_status()
    rows = r.json()
    return rows[0] if rows else None


def to_ingredient_item(
    food: dict, grams: float, confidence: float, name: str | None = None
) -> dict:
    """A foods row → the ingredient item from contracts/ai."""
    return {
        "name": name or food["name"],
        "food_id": food["id"],
        "grams": grams,
        "confidence": confidence,
        "per_100g": {k: float(food[k]) for k in ("kcal", "protein", "carbs", "fat")},
    }
```

## Example: the `GET /foods/search` route

```python
import httpx
from fastapi import APIRouter, Depends, Query

from app.auth import require_user  # your Supabase token check
from app.nutrition.foods_db import search_foods

router = APIRouter()


@router.get("/foods/search")
async def foods_search(
    q: str = Query(min_length=2, max_length=100),
    limit: int = Query(10, ge=1, le=50),
    user=Depends(require_user),
):
    async with httpx.AsyncClient(timeout=5) as client:
        return await search_foods(client, user.token, q, limit)
```

The response shape must match `contracts/openapi.yaml`, so map the rows there if the spec differs.

## Example: meal matching (Sebi's `meal/`)

Gemini returns names and estimated grams; each one is matched through `nutrition/`, as CLAUDE.md requires:

```python
async def match_detected_food(client, user_token, detected: dict) -> dict:
    # detected = {"name": "scrambled eggs", "grams": 120, "confidence": 0.8}
    candidates = await search_foods(client, user_token, detected["name"], limit=3)
    if not candidates:
        return {"name": detected["name"], "grams": detected["grams"], "unmatched": True}
    item = to_ingredient_item(candidates[0], detected["grams"], detected["confidence"])
    item["alternatives"] = [to_ingredient_item(c, detected["grams"], 0.0) for c in candidates[1:]]
    return item
```

Tip: ask Gemini for both a Romanian and an English name; search finds *mici*, *sarmale* or *ciorbă* when they are in the Romanian generic foods.

## Example: saving a food from a label photo

`POST /label/read` returns values for the user to review. Once confirmed, the food is stored as the user's own `label` food. That insert is normally done by the app after review, but it looks like this from any client:

```python
async def save_label_food(client, user_token: str, label: dict) -> dict:
    r = await client.post(
        f"{SUPABASE_URL}/rest/v1/foods",
        headers={**_headers(user_token), "Prefer": "return=representation"},
        json={
            "id": f"label:{uuid.uuid4()}",
            "origin": "label",
            "name": label["name"],
            "brand": label.get("brand"),
            "barcode": label.get("barcode"),
            "kcal": label["per_100g"]["kcal"],
            "protein": label["per_100g"]["protein"],
            "carbs": label["per_100g"]["carbs"],
            "fat": label["per_100g"]["fat"],
            "serving_grams": label.get("serving_grams"),
            "missing_fields": label.get("missing_fields", []),
        },
    )
    r.raise_for_status()
    return r.json()[0]
```

`owner_id` is filled in automatically from the token. The database rejects values outside 0–900 kcal or 0–100 g per macro.

## Try it

After the catalogue import, with a real access token for the test user:

```powershell
$h = @{ apikey = "<publishable key>"; Authorization = "Bearer <user access token>" }
Invoke-RestMethod -Method Post -Headers $h -ContentType "application/json" `
  -Uri "https://xbowjaompnlqjvoimxpa.supabase.co/rest/v1/rpc/search_foods?select=id,name,kcal" `
  -Body '{"query": "albus", "max_results": 5}'
```

## What I need back

- Lucas: does this `foods` format cover what `nutrition/` and `label/` need? Will `GET /foods/search` use `search_foods`?
- Sebi: is top-3 candidates per detected food enough for the alternatives in the app?
