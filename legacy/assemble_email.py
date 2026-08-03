"""
Assembles a finished "Your Inner Marriage according to Shamanic Astrology"
email from a person's Venus/Mars/Sun signs, using the copy blocks stored in
content_library.json (editable through the app's library editor screen —
see content_store.py).

Where the library has a documented gap (no verbatim Pisces identity
paragraph; no masculine archetypes for Scorpio/Aquarius; no feminine
archetypes for Capricorn, as of the initial transcription), this
deliberately does NOT invent replacement copy — it flags the gap inline in
the output so Amelia can write that part herself (in the editor, or per
this specific reading), per her preference: guessing at her voice risks a
reading that doesn't sound like her.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from content_store import load_library

GAP_MARKER = "⚠️ NEEDS AMELIA'S INPUT"


@dataclass
class AssembledEmail:
    text: str
    gaps: list[str] = field(default_factory=list)


def _archetype_list(archetypes: list[str] | None) -> str:
    return ", ".join(archetypes) if archetypes else ""


def _sign_block(signs: dict, sign: str, polarity: str, gaps: list[str]) -> str:
    """polarity is 'feminine' (Venus) or 'masculine' (Mars)."""
    data = signs[sign]
    label = "Venus" if polarity == "feminine" else "Mars"
    lines = [f"## {sign.upper()} — your {polarity} (represented by {label})", ""]

    if data.get("identity"):
        lines.append(data["identity"])
    else:
        gap = f"No full {sign} identity paragraph on file — only a short fragment exists."
        gaps.append(gap)
        lines.append(f"*{GAP_MARKER}: {gap} Write the full \"I am {sign}...\" paragraph here before sending.*")
        fragment = data.get("identity_fragment")
        if fragment:
            lines.append(f"\n(Fragment on file, for reference: \"{fragment}\")")

    if data.get("descriptive"):
        lines.append("")
        lines.append(data["descriptive"])

    archetypes = data.get(f"{polarity}_archetypes")
    lines.append("")
    if archetypes:
        lines.append(f"**{polarity.capitalize()} archetypes:** {_archetype_list(archetypes)}")
    else:
        gap = f"No {polarity} archetype list on file for {sign}."
        gaps.append(gap)
        lines.append(f"*{GAP_MARKER}: {gap} Fill in a short archetype list here before sending.*")

    return "\n".join(lines)


def _small_note(signs: dict, structural: dict, sun_sign: str | None, venus_sign: str, mars_sign: str) -> str | None:
    if not sun_sign:
        return None
    keywords = signs[sun_sign].get("fuel_keywords")
    template = structural["small_note_with_keywords"] if keywords else structural["small_note_without_keywords"]
    note = template.format(sun_sign=sun_sign, keywords=keywords or "")

    # Per the library: call it out explicitly if Venus or Mars also lands in the Sun sign.
    if venus_sign == sun_sign:
        note += structural["small_note_echo"].format(planet="Venus", sun_sign=sun_sign)
    elif mars_sign == sun_sign:
        note += structural["small_note_echo"].format(planet="Mars", sun_sign=sun_sign)

    return note


def _reflection_questions(signs: dict, venus_sign: str, mars_sign: str) -> str:
    lines = [
        "## Some questions to reflect on",
        "",
        f"Do you relate to one of these — {venus_sign} or {mars_sign} — more than the other? "
        f"Who has gotten the most attention/airtime during your life?",
    ]
    venus_archetypes = signs[venus_sign].get("feminine_archetypes")
    mars_archetypes = signs[mars_sign].get("masculine_archetypes")
    if venus_archetypes and mars_archetypes:
        lines.append("")
        lines.append(
            f"Is your inner {mars_archetypes[0]} serving your inner {venus_archetypes[0]}?"
        )
    lines.append("")
    lines.append("(And whatever else comes to you about their relationship!)")
    return "\n".join(lines)


def assemble_email(
    name: str,
    venus_sign: str,
    mars_sign: str,
    sun_sign: str | None = None,
    male_bodied: bool = False,
) -> AssembledEmail:
    library = load_library()
    signs, structural = library["signs"], library["structural"]

    if venus_sign not in signs:
        raise ValueError(f"Unknown Venus sign: {venus_sign!r}")
    if mars_sign not in signs:
        raise ValueError(f"Unknown Mars sign: {mars_sign!r}")

    gaps: list[str] = []
    parts = [structural["opening"].format(name=name)]

    small_note = _small_note(signs, structural, sun_sign, venus_sign, mars_sign)
    if small_note:
        parts.append(small_note)

    parts.append(structural["section_header"].format(venus_sign=venus_sign, mars_sign=mars_sign))

    if venus_sign == mars_sign:
        element = signs[venus_sign]["element"]
        parts.append(structural["double_sign_framing"].format(sign=venus_sign, element=element))

    parts.append(_sign_block(signs, venus_sign, "feminine", gaps))
    parts.append(_sign_block(signs, mars_sign, "masculine", gaps))

    right_relationship = structural["right_relationship"]
    if male_bodied:
        right_relationship += structural["right_relationship_male_addon"]
    parts.append("## Right Relationship")
    parts.append(right_relationship)

    parts.append(_reflection_questions(signs, venus_sign, mars_sign))
    parts.append(structural["closing"])

    text = "\n\n".join(parts)
    return AssembledEmail(text=text, gaps=list(dict.fromkeys(gaps)))


def extract_signs(positions) -> dict:
    """positions is the list of (planet, sign, degree, retro) tuples from
    fetch_charts.generate_chart(). Returns {'Sun': sign, 'Venus': sign, 'Mars': sign}
    for whichever of those three are present."""
    wanted = {"Sun", "Venus", "Mars"}
    return {planet: sign for planet, sign, _degree, _retro in positions if planet in wanted}
