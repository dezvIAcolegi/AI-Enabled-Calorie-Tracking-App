from app.label.schemas import LabelResult


def test_label_read_returns_valid_result(authed_client):
    r = authed_client.post(
        "/label/read", files={"image": ("label.jpg", b"\xff\xd8fake", "image/jpeg")}
    )
    assert r.status_code == 200
    LabelResult.model_validate(r.json())


def test_label_read_requires_image(authed_client):
    assert authed_client.post("/label/read").status_code == 422
