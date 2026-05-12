"""Catalog of accessibility-standard violation codes per ObstacleCategory.

The JSON file shipped alongside this module is a copy of the repo's
`context/accessibility_standards.json` (source of truth, kept uncommitted).
Any update to that file must be reflected here too.
"""
import json
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "accessibility_standards.json"

with _CATALOG_PATH.open(encoding="utf-8") as _f:
    _CATALOG = json.load(_f)

# {category: [entry, ...]} — entries kept as full dicts so callers (e.g. tests
# or future docs endpoint) can read requirement/why/pdfRef if needed.
STANDARDS_BY_CATEGORY: dict[str, list[dict]] = _CATALOG.get("standards", {})

# {category: {code1, code2, ...}} — used for fast category-scoped validation.
CODES_BY_CATEGORY: dict[str, set[str]] = {
    category: {entry["code"] for entry in entries}
    for category, entries in STANDARDS_BY_CATEGORY.items()
}
