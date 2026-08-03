"""
Persistence for classes (10-week workshops) and their participant rosters.

Layout: one folder per class under classes/, e.g.
    classes/spring-2026-level-one/
        class.json   -- name + participant list (birth info, last computed
                         signs, last assembled/edited text, gaps, pdf filename)
        pdfs/         -- generated PDFs for this class's participants

Keeping everything for a class in one folder (JSON + its PDFs) is simplest
for Amelia to reason about than splitting rosters into one global file.
Participants are tracked by a stable short id (not by name) so renaming
someone doesn't lose their saved reading/PDF association.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

CLASSES_DIR = Path(__file__).parent / "classes"
CLASSES_DIR.mkdir(exist_ok=True)


def slugify_class_name(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "class"


def _class_dir(slug: str) -> Path:
    return CLASSES_DIR / slug


def _class_json_path(slug: str) -> Path:
    return _class_dir(slug) / "class.json"


def pdf_dir(slug: str) -> Path:
    d = _class_dir(slug) / "pdfs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def class_exists(slug: str) -> bool:
    return _class_json_path(slug).exists()


def list_classes() -> list[dict]:
    classes = []
    if not CLASSES_DIR.exists():
        return classes
    for d in CLASSES_DIR.iterdir():
        cjson = d / "class.json"
        if cjson.exists():
            data = json.loads(cjson.read_text(encoding="utf-8"))
            classes.append({
                "slug": d.name,
                "name": data.get("name", d.name),
                "participant_count": len(data.get("participants", [])),
                "updated_at": data.get("updated_at", ""),
            })
    classes.sort(key=lambda c: c["updated_at"], reverse=True)
    return classes


def create_class(name: str) -> str:
    base_slug = slugify_class_name(name)
    slug = base_slug
    i = 2
    while class_exists(slug):
        slug = f"{base_slug}-{i}"
        i += 1
    now = datetime.now(timezone.utc).isoformat()
    _class_dir(slug).mkdir(parents=True, exist_ok=True)
    save_class(slug, {"name": name, "created_at": now, "participants": []})
    return slug


def load_class(slug: str) -> dict | None:
    p = _class_json_path(slug)
    if not p.exists():
        return None
    return json.loads(p.read_text(encoding="utf-8"))


def save_class(slug: str, data: dict) -> None:
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _class_json_path(slug).write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def new_participant_id() -> str:
    return uuid.uuid4().hex[:8]
