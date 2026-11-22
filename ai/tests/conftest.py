import pytest
from fastapi.testclient import TestClient

from app.auth import current_user
from app.main import app


@pytest.fixture
def authed_client():
    """Client for the full app with the token check bypassed (auth itself is tested in test_auth.py)."""
    app.dependency_overrides[current_user] = lambda: "test-user"
    yield TestClient(app)
    app.dependency_overrides.pop(current_user, None)
