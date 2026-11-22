"""Token check: real PyJWT verification against a throwaway key set, no network."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.security import HTTPAuthorizationCredentials
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings
from app.label import router as label_router
from app.label.schemas import LabelResult
from app.main import app
from app.nutrition import router as nutrition_router

URL = "https://test-ref.supabase.co"
ISSUER = URL + "/auth/v1"
KID = "test-key"

KEY = ec.generate_private_key(ec.SECP256R1())
OTHER_KEY = ec.generate_private_key(ec.SECP256R1())

ROUTES = [
    (
        "post",
        "/meal/photo",
        {"files": {"image": ("m.jpg", b"\xff\xd8\xff", "image/jpeg")}},
    ),
    ("post", "/meal/text", {"json": {"text": "two eggs"}}),
    (
        "post",
        "/label/read",
        {"files": {"image": ("l.jpg", b"\xff\xd8\xff", "image/jpeg")}},
    ),
    ("get", "/foods/search", {"params": {"q": "egg"}}),
]


async def _no_foods(q, token):
    return []


async def _fixture_label(data, token):
    return LabelResult(
        per_100g=None, per_serving=None, serving_grams=None, flagged=["per_100g"]
    )


def make_token(key=KEY, alg="ES256", kid=KID, **overrides) -> str:
    claims = {
        "sub": "user-1",
        "aud": "authenticated",
        "iss": ISSUER,
        "exp": int(time.time()) + 600,
    }
    claims.update(overrides)
    return jwt.encode(claims, key, algorithm=alg, headers={"kid": kid})


@pytest.fixture
def client(monkeypatch):
    jwk = jwt.algorithms.ECAlgorithm.to_jwk(KEY.public_key(), as_dict=True) | {
        "kid": KID,
        "alg": "ES256",
    }
    keys = jwt.PyJWKClient(URL + "/auth/v1/.well-known/jwks.json", cache_keys=False)
    monkeypatch.setattr(keys, "fetch_data", lambda: {"keys": [jwk]})
    monkeypatch.setattr(auth, "jwks_client", lambda url: keys)
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(supabase_url=URL))
    monkeypatch.setattr(
        nutrition_router, "_search", _no_foods
    )  # foods DB is tested in tests/nutrition
    monkeypatch.setattr(
        label_router.reader, "read_label", _fixture_label
    )  # reader is tested in tests/label
    return TestClient(app)


def call(client, method, path, kwargs, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return getattr(client, method)(path, headers=headers, **kwargs)


@pytest.mark.parametrize(("method", "path", "kwargs"), ROUTES)
def test_missing_token_is_401(client, method, path, kwargs):
    r = call(client, method, path, kwargs)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(("method", "path", "kwargs"), ROUTES)
def test_valid_token_passes(client, method, path, kwargs):
    assert call(client, method, path, kwargs, make_token()).status_code == 200


@pytest.mark.parametrize(
    "token",
    [
        "not-a-jwt",
        make_token(key=OTHER_KEY),  # bad signature
        make_token(kid="unknown"),  # key not in the JWKS
        make_token(exp=int(time.time()) - 10),  # expired
        make_token(aud="anon"),
        make_token(iss="https://evil.supabase.co/auth/v1"),
        make_token(key="s" * 32, alg="HS256"),  # symmetric alg must never be accepted
    ],
    ids=[
        "garbage",
        "bad-signature",
        "unknown-kid",
        "expired",
        "wrong-aud",
        "wrong-iss",
        "hs256",
    ],
)
def test_invalid_token_is_401(client, token):
    assert call(client, *ROUTES[-1][:2], ROUTES[-1][2], token).status_code == 401


def test_non_bearer_scheme_is_401(client):
    r = client.get(
        "/foods/search",
        params={"q": "egg"},
        headers={"Authorization": f"Basic {make_token()}"},
    )
    assert r.status_code == 401


def test_missing_sub_is_401(client):
    token = jwt.encode(
        {"aud": "authenticated", "iss": ISSUER, "exp": int(time.time()) + 600},
        KEY,
        algorithm="ES256",
        headers={"kid": KID},
    )
    assert call(client, *ROUTES[-1][:2], ROUTES[-1][2], token).status_code == 401


def test_unconfigured_fails_closed(client, monkeypatch):
    monkeypatch.setattr(auth, "get_settings", lambda: Settings(supabase_url=""))
    assert call(client, *ROUTES[-1][:2], ROUTES[-1][2], make_token()).status_code == 401


def test_jwks_unreachable_is_503(client, monkeypatch):
    class Down:
        def get_signing_key_from_jwt(self, token):
            raise jwt.PyJWKClientConnectionError("down")

    monkeypatch.setattr(auth, "jwks_client", lambda url: Down())
    assert call(client, *ROUTES[-1][:2], ROUTES[-1][2], make_token()).status_code == 503


def test_returns_user_id(client):
    creds = HTTPAuthorizationCredentials(
        scheme="Bearer", credentials=make_token(sub="abc-123")
    )
    assert auth.current_user(creds) == "abc-123"


def test_access_token_returns_verified_token(client):
    token = make_token()
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    assert auth.access_token(auth.current_user(creds), creds) == token


def test_health_needs_no_token(client):
    assert client.get("/health").status_code == 200
