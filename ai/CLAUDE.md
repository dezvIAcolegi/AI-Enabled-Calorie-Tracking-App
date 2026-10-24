# /ai (Roles 3 & 4: FastAPI AI service)

One Python FastAPI service in `ai/app/`, one router per subfolder. Each router starts as a stub returning fixed sample JSON that matches `/contracts/ai`, then gets the real model.

| Path | Owner | Endpoint(s) |
|---|---|---|
| `app/` skeleton (entrypoint, config, auth check, deploy) | Lucas | none |
| `app/meal/`, `tests/meal/` | Sebi | `POST /meal/photo`, `POST /meal/text` |
| `app/label/` | Lucas | `POST /label/read` |
| `app/nutrition/` | Lucas | `GET /foods/search`, plus FDC lookup that `meal/` calls in-process |

Changes to the shared skeleton go through a PR that Sebi reviews.

## Every request

- **Auth:** verify the caller's Supabase access token before doing anything. No token, no model call.
- **Gemini:** Gemini Flash via the Gemini API, key from Google AI Studio in `.env` (never sent to the app). One model handles photos, text and labels; ask for structured JSON matching the `/contracts/ai` schemas.
- **Free-tier limits:** resize photos, cache results, enforce the per-user daily scan cap. Prompts may be used by Google, so test with your own photos only.
- The FastAPI-generated OpenAPI must match `/contracts/openapi.yaml` (checked in CI).

## meal/ (Sebi)

Gemini → foods + estimated grams → match each via `nutrition/` (not FDC directly) → per-item confidence → list of ingredient items. When matching is uncertain, return the top 3 candidates. Romanian dishes (sarmale, mici, ciorbă) aren't in FDC; how to handle them is decided after the first photo tests. Owns the meal test set (photos with weighed portions) in `/eval/meal`; report gram and kcal error.

## label/ (Lucas)

Gemini reads the label photo directly (no OCR library) into `per_100g`, `per_serving`, `serving_grams` → list unreadable fields → check kcal ≈ 4·protein + 4·carbs + 9·fat. Romanian and English labels. Owns the label test set (blurry, curved, Romanian/English) in `/eval/label`; report field accuracy.

## nutrition/ (Lucas)

FoodData Central search and lookup, used by `meal/` and exposed as `GET /foods/search`. Cache results.

## May not touch

`/app`, `/supabase`, `/contracts` (except Lucas's `contracts/ts/macros.ts`, still via an all-four PR).

## Commands

Run from `ai/` with Python 3.11:

```sh
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
cp .env.example .env                           # fill in keys; stubs run without them
uvicorn app.main:app --reload                  # http://127.0.0.1:8000/docs
python -m pytest
ruff check .
```
