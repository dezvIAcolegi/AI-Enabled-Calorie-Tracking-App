from fastapi import Depends, FastAPI
from pydantic import BaseModel

from app.auth import current_user
from app.label.router import router as label_router
from app.meal.router import router as meal_router
from app.nutrition.router import router as nutrition_router


class ErrorResponse(BaseModel):
    detail: str


def _errors(*codes: int) -> dict:
    """Documented error responses, so they show up in openapi.yaml and api.ts."""
    text = {
        401: "Missing, invalid or expired Supabase access token",
        413: "Photo larger than 10 MB",
        415: "Not a readable image",
        429: 'detail "daily_scan_cap": the user\'s daily scans are used up (try tomorrow); '
        'detail "model_quota": the shared Gemini quota is exhausted (try later)',
        502: "An upstream service (Gemini or Supabase) failed or is unreachable",
        503: "The service or its auth keys aren't available",
    }
    return {c: {"model": ErrorResponse, "description": text[c]} for c in codes}


SCAN_ERRORS = _errors(401, 413, 415, 429, 502, 503)

app = FastAPI(title="Calorie Tracker AI")

# Every router needs a valid Supabase access token; only /health is open.
for r, errors in (
    (meal_router, SCAN_ERRORS),
    (label_router, SCAN_ERRORS),
    (nutrition_router, _errors(401, 502, 503)),
):
    app.include_router(r, dependencies=[Depends(current_user)], responses=errors)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
