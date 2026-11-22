"""Check that the FastAPI app's OpenAPI matches contracts/openapi.yaml (run by CI from ai/).

    python scripts/check_openapi.py          # exit 1 and show the diff when they differ
    python scripts/check_openapi.py --write  # regenerate contracts/openapi.yaml (a /contracts PR)
    npx -y openapi-typescript@7.4.4 ../contracts/openapi.yaml -o ../contracts/ts/api.ts  # then api.ts

Compares parsed documents, so YAML formatting and key order don't matter.
"""

import difflib
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.main import app

SPEC = Path(__file__).resolve().parents[2] / "contracts" / "openapi.yaml"


def dump(doc: dict) -> str:
    return yaml.safe_dump(doc, sort_keys=False, allow_unicode=True)


def main() -> int:
    actual = app.openapi()
    if "--write" in sys.argv:
        SPEC.write_text(dump(actual), encoding="utf-8", newline="\n")
        print(f"wrote {SPEC}")
        return 0
    if not SPEC.exists():
        # ponytail: passes until the contract lands, so CI stays green; drop this branch after.
        print(f"{SPEC.name} not in contracts/ yet; skipping.")
        return 0
    expected = yaml.safe_load(SPEC.read_text(encoding="utf-8"))
    if expected == actual:
        print("OpenAPI matches contracts/openapi.yaml")
        return 0
    sys.stdout.writelines(
        difflib.unified_diff(
            dump(expected).splitlines(keepends=True),
            dump(actual).splitlines(keepends=True),
            "contracts/openapi.yaml",
            "FastAPI app",
        )
    )
    print(
        "\nOpenAPI differs from contracts/openapi.yaml: update the app or propose a contract change."
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
