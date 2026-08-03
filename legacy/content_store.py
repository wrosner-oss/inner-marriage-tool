"""
Load/save for the Inner Marriage copy library, stored as JSON so Amelia can
edit it herself (through the app's editor screen) without touching code.

Loads fresh from disk on every call rather than caching, since this is a
low-traffic local app and it means an edit takes effect immediately without
restarting anything.
"""
import json
from pathlib import Path

LIBRARY_PATH = Path(__file__).parent / "content_library.json"

SIGN_NAMES = [
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo",
    "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
]

SIGN_FIELDS = ["element", "identity", "identity_fragment", "descriptive",
               "feminine_archetypes", "masculine_archetypes", "fuel_keywords"]

STRUCTURAL_FIELDS = [
    "opening", "small_note_with_keywords", "small_note_without_keywords",
    "small_note_echo", "section_header", "right_relationship",
    "right_relationship_male_addon", "closing", "double_sign_framing",
]


def load_library() -> dict:
    with open(LIBRARY_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_library(data: dict) -> None:
    with open(LIBRARY_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def sign_is_complete(sign_data: dict) -> bool:
    return bool(sign_data.get("identity") and sign_data.get("feminine_archetypes") and sign_data.get("masculine_archetypes"))
