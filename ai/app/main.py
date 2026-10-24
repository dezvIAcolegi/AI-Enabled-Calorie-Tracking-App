from fastapi import FastAPI

from app.label.router import router as label_router
from app.nutrition.router import router as nutrition_router

app = FastAPI(title="Calorie Tracker AI")
app.include_router(label_router)
app.include_router(nutrition_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
