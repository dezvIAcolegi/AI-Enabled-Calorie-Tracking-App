"""POST /label/read with Gemini mocked: image prep, result building, error mapping, route."""

import io
import json
from pathlib import Path

import pytest
from fastapi import HTTPException
from google.genai import errors
from PIL import Image

from app.config import Settings
from app.label import reader
from app.label.reader import GeminiBlock, GeminiLabel, prepare_image, to_result
from app.label.reader import consume_scan as _real_consume

FIXTURE = json.loads(
    (
        Path(__file__).resolve().parents[3]
        / "contracts/fixtures/label-read.response.json"
    ).read_text(encoding="utf-8")
)


def jpeg(w=400, h=300, **save) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), "white").save(buf, "JPEG", **save)
    return buf.getvalue()


def block(**kw) -> GeminiBlock:
    return GeminiBlock(
        **({"kcal": None, "kj": None, "protein": None, "carbs": None, "fat": None} | kw)
    )


# Oat cereal from the fixture: 4*13 + 4*66 + 9*7 = 379 ≈ 389.
OATS_100 = block(kcal=389, kj=1628, protein=13, carbs=66, fat=7)
OATS_40 = block(kcal=156, kj=651, protein=5.2, carbs=26.4, fat=2.8)


# ── image prep ──────────────────────────────────────────────────────────────


def test_prepare_image_resizes_large_photo():
    out = Image.open(io.BytesIO(prepare_image(jpeg(4000, 3000))))
    assert out.format == "JPEG"
    assert out.size == (1600, 1200)


def test_prepare_image_keeps_small_photo_and_converts_png():
    buf = io.BytesIO()
    Image.new("RGBA", (300, 200)).save(buf, "PNG")
    out = Image.open(io.BytesIO(prepare_image(buf.getvalue())))
    assert (out.format, out.size, out.mode) == ("JPEG", (300, 200), "RGB")


def test_prepare_image_applies_exif_rotation():
    exif = Image.Exif()
    exif[0x0112] = 6  # orientation: rotate 90° when displayed
    out = Image.open(io.BytesIO(prepare_image(jpeg(400, 300, exif=exif))))
    assert out.size == (300, 400)


def test_prepare_image_rejects_garbage():
    with pytest.raises(HTTPException) as e:
        prepare_image(b"\xff\xd8not really a jpeg")
    assert e.value.status_code == 415


# ── result building ─────────────────────────────────────────────────────────


def test_clean_label_matches_fixture():
    r = to_result(GeminiLabel(per_100g=OATS_100, per_serving=OATS_40, serving_grams=40))
    assert r.model_dump() == FIXTURE


def test_kj_only_label_converts_energy():
    r = to_result(
        GeminiLabel(
            per_100g=block(kj=1628, protein=13, carbs=66, fat=7),
            per_serving=None,
            serving_grams=None,
        )
    )
    assert r.per_100g.kcal == pytest.approx(389.1, abs=0.1)
    assert r.flagged == []


def test_us_label_derives_per_100g_from_serving():
    r = to_result(GeminiLabel(per_100g=None, per_serving=OATS_40, serving_grams=40))
    assert r.per_100g.kcal == pytest.approx(390)
    assert r.per_100g.fat == pytest.approx(7)
    assert r.flagged == []


def test_unreadable_value_is_null_and_flagged():
    r = to_result(
        GeminiLabel(
            per_100g=block(kcal=389, protein=13, carbs=66, fat=None),
            per_serving=None,
            serving_grams=None,
        )
    )
    assert r.per_100g.fat is None
    assert r.flagged == ["per_100g.fat"]


def test_negative_value_counts_as_unreadable():
    r = to_result(
        GeminiLabel(
            per_100g=block(kcal=389, protein=-1, carbs=66, fat=7),
            per_serving=None,
            serving_grams=None,
        )
    )
    assert "per_100g.protein" in r.flagged


def test_no_table_found():
    r = to_result(GeminiLabel(per_100g=block(), per_serving=None, serving_grams=None))
    assert r.model_dump() == {
        "per_100g": None,
        "per_serving": None,
        "serving_grams": None,
        "flagged": ["per_100g"],
    }


def test_zero_serving_grams_is_dropped_and_flagged():
    r = to_result(GeminiLabel(per_100g=OATS_100, per_serving=OATS_40, serving_grams=0))
    assert r.serving_grams is None
    assert r.flagged == ["serving_grams"]


def test_misread_fat_is_flagged():
    r = to_result(
        GeminiLabel(
            per_100g=block(kcal=389, protein=13, carbs=66, fat=70),
            per_serving=None,
            serving_grams=None,
        )
    )
    assert set(r.flagged) == {
        "per_100g.kcal",
        "per_100g.protein",
        "per_100g.carbs",
        "per_100g.fat",
    }


# ── Gemini call ─────────────────────────────────────────────────────────────

GOOD_JSON = GeminiLabel(
    per_100g=OATS_100, per_serving=OATS_40, serving_grams=40
).model_dump_json()


class FakeGemini:
    """Stands in for genai.Client: .aio.models.generate_content pops the next reply."""

    def __init__(self, *replies):
        self.replies, self.calls = list(replies), []
        self.aio = self
        self.models = self

    async def generate_content(self, model, contents, config):
        self.calls.append(model)
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply

        class Resp:
            text = reply

        return Resp()


@pytest.fixture
def gemini(monkeypatch):
    def install(*replies):
        fake = FakeGemini(*replies)
        monkeypatch.setattr(reader, "_gemini", lambda: fake)
        return fake

    async def no_sleep(_):
        pass

    async def scan_ok(token):
        install.scans.append(token)

    install.scans = []
    monkeypatch.setattr(reader.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(reader, "_cache", {})
    monkeypatch.setattr(reader, "consume_scan", scan_ok)
    return install


@pytest.mark.anyio
async def test_ask_gemini_parses_reply(gemini):
    fake = gemini(GOOD_JSON)
    label = await reader.ask_gemini(b"jpeg")
    assert label.serving_grams == 40
    assert fake.calls == ["gemini-3.5-flash-lite"]


@pytest.mark.anyio
async def test_ask_gemini_retries_server_errors(gemini):
    busy = errors.ServerError(503, {"error": {"code": 503, "message": "busy"}})
    fake = gemini(busy, busy, GOOD_JSON)
    assert (await reader.ask_gemini(b"jpeg")).serving_grams == 40
    assert len(fake.calls) == 3


@pytest.mark.anyio
@pytest.mark.parametrize(
    ("reply", "status"),
    [
        ([errors.ServerError(503, {"error": {"code": 503}})] * 3, 502),
        ([errors.ClientError(429, {"error": {"code": 429}})], 429),
        ([errors.ClientError(400, {"error": {"code": 400}})], 502),
        (["{not json"], 502),
    ],
    ids=["server-down", "quota", "bad-request", "bad-json"],
)
async def test_ask_gemini_errors(gemini, reply, status):
    gemini(*reply)
    with pytest.raises(HTTPException) as e:
        await reader.ask_gemini(b"jpeg")
    assert e.value.status_code == status


def test_missing_key_is_503(monkeypatch):
    monkeypatch.setattr(reader, "get_settings", lambda: Settings(gemini_api_key=""))
    with pytest.raises(HTTPException) as e:
        reader._gemini()
    assert e.value.status_code == 503


# ── route ───────────────────────────────────────────────────────────────────


def post(client, data=None, ctype="image/jpeg"):
    return client.post(
        "/label/read", files={"image": ("label.jpg", data or jpeg(), ctype)}
    )


def test_route_reads_label(authed_client, gemini):
    gemini(GOOD_JSON)
    r = post(authed_client)
    assert r.status_code == 200
    assert r.json() == FIXTURE


def test_route_caches_same_photo(authed_client, gemini):
    fake = gemini(GOOD_JSON)
    photo = jpeg()
    assert post(authed_client, photo).status_code == 200
    assert post(authed_client, photo).status_code == 200
    assert len(fake.calls) == 1
    assert gemini.scans == ["test-token"]  # the cached repeat doesn't count a scan


@pytest.mark.parametrize(
    ("data", "ctype", "status"),
    [
        (b"hello", "text/plain", 415),
        (b"\xff\xd8garbage", "image/jpeg", 415),
        (b"\0" * (reader.MAX_UPLOAD_BYTES + 1), "image/jpeg", 413),
    ],
    ids=["not-image-type", "undecodable", "too-large"],
)
def test_route_rejects_bad_upload(authed_client, gemini, data, ctype, status):
    fake = gemini()
    assert post(authed_client, data, ctype).status_code == status
    assert fake.calls == []  # never reaches Gemini
    assert gemini.scans == []  # and doesn't count a scan


def test_route_requires_image(authed_client):
    assert authed_client.post("/label/read").status_code == 422


# ── daily scan cap ──────────────────────────────────────────────────────────


class FakeSupabase:
    def __init__(self, reply):
        self.reply, self.calls = reply, []

    async def __call__(self, method, path, token, **kwargs):
        self.calls.append((method, path, token))
        return self.reply


@pytest.mark.anyio
@pytest.mark.parametrize("allowed", [True, False])
async def test_consume_scan(monkeypatch, allowed):
    fake = FakeSupabase({"allowed": allowed, "used": 30, "limit": 30})
    monkeypatch.setattr(reader, "supabase_request", fake)
    if allowed:
        await reader.consume_scan("user-jwt")
    else:
        with pytest.raises(HTTPException) as e:
            await reader.consume_scan("user-jwt")
        assert (e.value.status_code, e.value.detail) == (429, "daily_scan_cap")
    assert fake.calls == [("POST", "/rest/v1/rpc/consume_scan", "user-jwt")]


def test_route_cap_reached_skips_gemini(authed_client, gemini, monkeypatch):
    fake = gemini(GOOD_JSON)
    monkeypatch.setattr(reader, "supabase_request", FakeSupabase({"allowed": False}))
    monkeypatch.setattr(reader, "consume_scan", _real_consume)  # undo the fixture stub
    r = post(authed_client)
    assert (r.status_code, r.json()["detail"]) == (429, "daily_scan_cap")
    assert fake.calls == []


def test_gemini_quota_detail(authed_client, gemini):
    gemini(errors.ClientError(429, {"error": {"code": 429}}))
    r = post(authed_client)
    assert (r.status_code, r.json()["detail"]) == (429, "model_quota")
