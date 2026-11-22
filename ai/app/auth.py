"""Supabase access-token check, applied to every route except /health.

Tokens are verified against the project's public signing keys (JWKS), so no secret is needed.
"""

from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_settings

# Supabase asymmetric keys only; never HS256 (that would need the shared secret).
ALGORITHMS = ["ES256", "RS256"]

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str) -> HTTPException:
    return HTTPException(
        status_code=401, detail=detail, headers={"WWW-Authenticate": "Bearer"}
    )


@lru_cache
def jwks_client(url: str) -> jwt.PyJWKClient:
    # PyJWKClient caches the key set and refetches when it meets an unknown kid (key rotation).
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600, timeout=10)


def current_user(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    """Return the caller's Supabase user id, or raise 401."""
    if creds is None:
        raise _unauthorized("missing bearer token")
    settings = get_settings()
    if not settings.supabase_url:
        raise _unauthorized("auth not configured")  # fail closed
    token = creds.credentials
    try:
        key = jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as e:
        raise HTTPException(status_code=503, detail="can't reach auth keys") from e
    except (jwt.PyJWKClientError, jwt.DecodeError) as e:
        raise _unauthorized("invalid token") from e
    try:
        claims = jwt.decode(
            token,
            key.key,
            algorithms=ALGORITHMS,
            audience="authenticated",
            issuer=settings.supabase_issuer,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError as e:
        raise _unauthorized("token expired") from e
    except jwt.InvalidTokenError as e:
        raise _unauthorized("invalid token") from e
    return claims["sub"]


CurrentUser = Annotated[str, Depends(current_user)]
