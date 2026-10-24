from fastapi.testclient import TestClient

from app.label.schemas import LabelResult
from app.main import app

client = TestClient(app)


def test_label_read_returns_valid_result():
    r = client.post("/label/read", files={"image": ("label.jpg", b"\xff\xd8fake", "image/jpeg")})
    assert r.status_code == 200
    LabelResult.model_validate(r.json())


def test_label_read_requires_image():
    assert client.post("/label/read").status_code == 422
