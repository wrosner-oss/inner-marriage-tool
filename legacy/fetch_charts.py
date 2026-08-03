#!/usr/bin/env python3
"""
Batch-generate natal charts from astro.cafeastrology.com and export the
planetary positions (+ ascendant/houses + chart wheel image) to Markdown.

Usage:
    .venv/bin/python fetch_charts.py people.csv -o output

CSV columns (header row required):
    name   - required. Shown as the report title.
    date   - required. YYYY-MM-DD
    time   - optional. HH:MM (24h, local birth time). Leave blank for unknown time.
    place  - required. City, with enough detail to disambiguate, e.g.
             "Denver, Colorado, United States" or "Paris, France".
             If just "Denver" matches multiple cities, the script will list
             the candidates and ask you to be more specific.

Notes:
    - Only factual chart data (positions/houses) and the chart wheel image
      are captured. The site's interpretive paragraphs are copyrighted
      prose and are intentionally NOT scraped/reproduced here.
    - Runs a real (headed) browser by default since the site runs Cloudflare
      bot-detection; pass --headless to try without a visible window.
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

BASE_URL = "https://astro.cafeastrology.com/natal.php"


@dataclass
class Person:
    name: str
    date: str
    time: str
    place: str


def parse_csv(path: Path) -> list[Person]:
    people = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        required = {"name", "date", "place"}
        missing = required - {(h or "").strip().lower() for h in (reader.fieldnames or [])}
        if missing:
            sys.exit(f"CSV is missing required column(s): {', '.join(sorted(missing))}")
        for row in reader:
            row = {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}
            if not row.get("name"):
                continue
            people.append(Person(
                name=row["name"],
                date=row["date"],
                time=row.get("time", ""),
                place=row["place"],
            ))
    return people


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "chart"


def fill_birthplace(page, place: str) -> None:
    """Type into the city autocomplete and select the best-matching option.

    The site backs its autocomplete with a hidden <select id="citylistid">
    that only populates after real keystrokes (not a programmatic value set),
    so we use press_sequentially to simulate actual typing.
    """
    search_term = place.split(",")[0].strip()
    field = page.locator("#cityid")
    field.click()
    field.fill("")
    field.press_sequentially(search_term, delay=40)

    try:
        page.wait_for_function(
            "document.getElementById('citylistid') && document.getElementById('citylistid').options.length > 0",
            timeout=5000,
        )
    except PWTimeout:
        raise ChartError(f"No birthplace matches found for '{place}'. Try a different spelling.")

    options = page.eval_on_selector_all(
        "#citylistid option",
        "els => els.map((o, i) => ({i, text: o.text}))",
    )

    wanted_parts = [p.strip().lower() for p in place.split(",") if p.strip()]

    def matches(text: str, parts: list[str]) -> bool:
        t = text.lower()
        return all(p in t for p in parts)

    candidates = [o for o in options if matches(o["text"], wanted_parts)]
    if not candidates and len(wanted_parts) > 1:
        # relax to just the city name if the fuller match found nothing
        candidates = [o for o in options if matches(o["text"], wanted_parts[:1])]

    if len(candidates) == 1:
        chosen = candidates[0]
    elif len(candidates) > 1:
        exact = [o for o in candidates if o["text"].lower() == place.lower()]
        if exact:
            chosen = exact[0]
        else:
            listing = "\n".join(f"  - {o['text']}" for o in candidates)
            raise ChartError(
                f"'{place}' is ambiguous, matched {len(candidates)} cities:\n{listing}\n"
                f"Add more detail (state/country) and retry."
            )
    else:
        listing = "\n".join(f"  - {o['text']}" for o in options)
        raise ChartError(f"'{place}' didn't match any suggested city:\n{listing}")

    page.eval_on_selector(
        "#citylistid",
        "(el, idx) => { el.selectedIndex = idx; el.dispatchEvent(new Event('change', {bubbles:true})); }",
        chosen["i"],
    )


def submit_and_wait(page) -> None:
    page.click('input[type="submit"]')
    page.wait_for_load_state("domcontentloaded")
    # Some historical dates/locations trigger a "Time Zone Not Sure" re-prompt;
    # the site's own guidance is that the default offered value is fine to accept.
    if "Time Zone Not Sure" in page.content():
        print("    (time zone was ambiguous for this date/place - accepting the site's default offset)")
        page.click('input[type="submit"]')
        page.wait_for_load_state("domcontentloaded")


ZODIAC_SIGNS = {
    "Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra",
    "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces",
}
HOUSE_LABEL_RE = re.compile(r"^[IVX]+(\s|$)")


def parse_report(html: str):
    """Classify each table row by shape rather than table position, since
    the set/order of tables shifts when birth time is unknown:
      - house row:      cells[0] is a roman-numeral house label ("I ASC", "X MC", "II")
      - position row:    cells[0] is not a house label and cells[1] is a zodiac sign
      - planet-in-house: exactly 3 cells with cells[1] == "in"
    Aspect-table rows (cells[1] is an aspect name like "Trine") match none
    of these and are correctly ignored.
    """
    soup = BeautifulSoup(html, "html.parser")

    positions = []
    houses = []
    planet_houses = []

    for table in soup.find_all("table"):
        for tr in table.find_all("tr"):
            cells = [c.get_text(strip=True) for c in tr.find_all("td")]
            cells = [c for c in cells if c]
            if len(cells) < 2:
                continue

            if HOUSE_LABEL_RE.match(cells[0]) and len(cells) >= 3:
                houses.append((cells[0], cells[1], cells[2]))
            elif len(cells) == 3 and cells[1] == "in":
                planet_houses.append((cells[0], cells[2]))
            elif len(cells) >= 3 and cells[1] in ZODIAC_SIGNS:
                planet, sign, degree = cells[0], cells[1], cells[2]
                # The site duplicates this row in a mobile-responsive table that
                # embeds the house label instead of the retrograde flag in the
                # 4th cell; normalize so the two duplicate rows dedupe cleanly.
                retro = cells[3] if len(cells) > 3 and cells[3] == "R" else ""
                positions.append((planet, sign, degree, retro))

    def dedupe(seq):
        seen = set()
        out = []
        for item in seq:
            if item not in seen:
                seen.add(item)
                out.append(item)
        return out

    return dedupe(positions), dedupe(houses), dedupe(planet_houses)


def find_wheel_image_url(html: str, page_url: str) -> str | None:
    # The site emits this as a page-relative src; prefer the variant that
    # carries the actual birth data (d1year=...) over any print/cached-size
    # variant that references an opaque saved-profile index instead.
    candidates = re.findall(r'graphic\.php\?[^"\'\s]+', html)
    candidates = [c.replace("&amp;", "&") for c in candidates]
    for c in candidates:
        if "d1year=" in c:
            return urljoin(page_url, c)
    return urljoin(page_url, candidates[0]) if candidates else None


def to_markdown(person: Person, positions, houses, planet_houses, image_rel_path: str | None) -> str:
    lines = [f"## {person.name}", ""]
    time_str = person.time if person.time else "time unknown"
    lines.append(f"**Birth data:** {person.date} at {time_str} — {person.place}")
    lines.append("")

    if positions:
        lines.append("### Planetary Positions")
        lines.append("")
        lines.append("| Planet | Sign | Degree | |")
        lines.append("|---|---|---|---|")
        for planet, sign, degree, retro in positions:
            lines.append(f"| {planet} | {sign} | {degree} | {retro} |")
        lines.append("")

    if houses:
        lines.append("### Ascendant & Houses")
        lines.append("")
        lines.append("| House | Sign | Degree |")
        lines.append("|---|---|---|")
        for house, sign, degree in houses:
            lines.append(f"| {house} | {sign} | {degree} |")
        lines.append("")

    if planet_houses:
        lines.append("### Planets in Houses")
        lines.append("")
        lines.append("| Planet | House |")
        lines.append("|---|---|")
        for planet, house in planet_houses:
            lines.append(f"| {planet} | {house} |")
        lines.append("")

    if image_rel_path:
        lines.append(f"![{person.name} chart wheel]({image_rel_path})")
        lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


class ChartError(Exception):
    """Raised for problems the caller should show to a user (bad city, etc.)."""


def generate_chart(page, person: Person) -> dict:
    """Drive the form for one person on an already-open Playwright page and
    return {positions, houses, planet_houses, image_bytes}. Shared by both
    the CLI batch runner and the single-person web UI.
    """
    page.goto(BASE_URL, wait_until="domcontentloaded")
    page.fill('input[name="name"]', person.name)

    year, month, day = person.date.split("-")
    page.select_option('select[name="d1month"]', str(int(month)))
    page.select_option('select[name="d1day"]', str(int(day)))
    page.select_option('select[name="d1year"]', year)

    if person.time:
        hour, minute = person.time.split(":")
        page.select_option('select[name="d1hour"]', str(int(hour)))
        page.select_option('select[name="d1min"]', str(int(minute)))
    else:
        page.check('input[name="nohouses"]')

    fill_birthplace(page, person.place)
    submit_and_wait(page)

    html = page.content()
    positions, houses, planet_houses = parse_report(html)

    image_bytes = None
    wheel_url = find_wheel_image_url(html, page.url)
    if wheel_url:
        resp = page.request.get(wheel_url)
        if resp.ok:
            image_bytes = resp.body()

    return {
        "positions": positions,
        "houses": houses,
        "planet_houses": planet_houses,
        "image_bytes": image_bytes,
    }


def run(csv_path: Path, out_dir: Path, headless: bool) -> None:
    people = parse_csv(csv_path)
    if not people:
        sys.exit("No people found in CSV.")

    out_dir.mkdir(parents=True, exist_ok=True)
    img_dir = out_dir / "images"
    img_dir.mkdir(exist_ok=True)

    sections = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=headless)
        page = browser.new_page()

        for person in people:
            print(f"-> {person.name} ({person.date} {person.time or 'time unknown'}, {person.place})")
            try:
                result = generate_chart(page, person)
            except ChartError as e:
                print(f"   SKIPPED: {e}")
                continue
            positions, houses, planet_houses = result["positions"], result["houses"], result["planet_houses"]

            if not positions:
                print(f"   WARNING: couldn't parse a positions table for {person.name} — skipping data, check manually.")

            image_rel_path = None
            if result["image_bytes"]:
                slug = slugify(person.name)
                img_path = img_dir / f"{slug}.png"
                img_path.write_bytes(result["image_bytes"])
                image_rel_path = f"images/{slug}.png"

            sections.append(to_markdown(person, positions, houses, planet_houses, image_rel_path))

        browser.close()

    md_path = out_dir / "charts.md"
    md_path.write_text("# Natal Charts\n\n" + "\n".join(sections), encoding="utf-8")
    print(f"\nWrote {md_path} ({len(people)} chart(s)) and images to {img_dir}/")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("csv", type=Path, help="Path to input CSV (name,date,time,place)")
    parser.add_argument("-o", "--out", type=Path, default=Path("output"), help="Output directory (default: ./output)")
    parser.add_argument("--headless", action="store_true", help="Run browser headless (may be more likely to hit bot detection)")
    args = parser.parse_args()
    run(args.csv, args.out, args.headless)


if __name__ == "__main__":
    main()
