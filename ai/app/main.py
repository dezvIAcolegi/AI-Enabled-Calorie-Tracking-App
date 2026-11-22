from fastapi import Depends, FastAPI

from app.auth import current_user
from app.label.router import router as label_router
from app.meal.router import router as meal_router
from app.nutrition.router import router as nutrition_router

app = FastAPI(title="Calorie Tracker AI")

# Every router needs a valid Supabase access token; only /health is open.
for r in (meal_router, label_router, nutrition_router):
    app.include_router(r, dependencies=[Depends(current_user)])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
