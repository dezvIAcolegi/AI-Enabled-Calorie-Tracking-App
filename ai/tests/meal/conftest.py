import io

import pytest
from PIL import Image

from app.config import Settings
from app.meal import detector, matcher, pipeline
from app.nutrition.schemas import Candidate


class FakeGemini:
    """Stands in for genai.Client. Pops the next reply; exceptions are raised."""

    def __init__(self):
        self.replies, self.calls = [], []
        self.aio = self.models = self

    async def generate_content(self, **kwargs):
        self.calls.append(kwargs)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return type("Response", (), {"text": reply})()


class FakeFoods:
    """Stands in for app.nutrition.search_foods."""

    def __init__(self):
        self.results, self.calls, self.error = {}, [], None

    def add(self, query, *food_ids):
        self.results[query] = [
            Candidate(
                food_id=food_id,
                name=f"{query} ({food_id})",
                per_100g={"kcal": 100, "protein": 5, "carbs": 10, "fat": 4},
            )
            for food_id in food_ids
        ]

    async def __call__(self, query, token, limit=10):
        self.calls.append((query, token, limit))
        if self.error:
            raise self.error
        return self.results.get(query, [])[:limit]


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Meal tests never read ai/.env or share a cache."""
    settings = Settings(_env_file=None, gemini_api_key="", gemini_model="test-model")
    monkeypatch.setattr(detector, "get_settings", lambda: settings)
    monkeypatch.setattr(pipeline, "get_settings", lambda: settings)
    monkeypatch.setattr(pipeline, "_cache", {})


@pytest.fixture(autouse=True)
def scans(monkeypatch):
    """Stands in for consume_scan. Set "error" to refuse."""
    state = {"used_by": [], "error": None}

    async def consume(token):
        if state["error"]:
            raise state["error"]
        state["used_by"].append(token)

    monkeypatch.setattr(pipeline, "consume_scan", consume)
    return state


@pytest.fixture
def gemini(monkeypatch):
    fake = FakeGemini()
    monkeypatch.setattr(detector, "_gemini", lambda: fake)
    return fake


@pytest.fixture
def foods(monkeypatch):
    fake = FakeFoods()
    monkeypatch.setattr(matcher, "search_foods", fake)
    return fake


@pytest.fixture
def make_food():
    def make(**fields):
        base = {
            "name": "fried egg",
            "generic_name": "egg",
            "local_name": None,
            "grams": 50,
            "confidence": 0.8,
        }
        return detector.DetectedFood(**(base | fields))

    return make


@pytest.fixture
def make_photo():
    def make(width=400, height=300, fmt="JPEG", mode="RGB", **save):
        out = io.BytesIO()
        Image.new(mode, (width, height)).save(out, fmt, **save)
        return out.getvalue()

    return make
