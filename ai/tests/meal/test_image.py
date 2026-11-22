import io

import pytest
from fastapi import HTTPException
from PIL import Image

from app.meal import image


def opened(data):
    return Image.open(io.BytesIO(image.prepare_photo(data)))


@pytest.mark.parametrize(
    ("size", "expected"),
    [((4000, 3000), (1024, 768)), ((3000, 4000), (768, 1024)), ((300, 200), (300, 200))],
)
def test_resizes_to_1024_and_never_enlarges(make_photo, size, expected):
    assert opened(make_photo(*size)).size == expected


@pytest.mark.parametrize("mode", ["RGB", "RGBA", "P", "L", "LA"])
def test_png_becomes_rgb_jpeg(make_photo, mode):
    out = opened(make_photo(fmt="PNG", mode=mode))
    assert (out.format, out.mode) == ("JPEG", "RGB")


def test_applies_exif_rotation(make_photo):
    exif = Image.Exif()
    exif[0x0112] = 6  # rotate 90 degrees for display
    assert opened(make_photo(400, 300, exif=exif)).size == (300, 400)


@pytest.mark.parametrize("data", [b"", b"hello", b"\xff\xd8\xff"])
def test_unreadable_is_415(data):
    with pytest.raises(HTTPException) as e:
        image.prepare_photo(data)
    assert e.value.status_code == 415


def test_truncated_is_415(make_photo):
    data = make_photo()
    with pytest.raises(HTTPException) as e:
        image.prepare_photo(data[: len(data) // 2])
    assert e.value.status_code == 415


def test_too_many_bytes_is_413():
    with pytest.raises(HTTPException) as e:
        image.prepare_photo(b"\0" * (image.MAX_UPLOAD_BYTES + 1))
    assert e.value.status_code == 413


def test_too_many_pixels_is_413(make_photo, monkeypatch):
    monkeypatch.setattr(image, "MAX_PIXELS", 1000)
    with pytest.raises(HTTPException) as e:
        image.prepare_photo(make_photo())
    assert e.value.status_code == 413
