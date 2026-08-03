# Handoff: Inner Marriage email assembly

Context for picking up work in this repo. Goal: build an app/process that takes a
participant's **name, birthdate, birth time, and location**, determines their
**Venus sign** and **Mars sign**, and assembles a finished "Your Inner Marriage
according to Shamanic Astrology" email using the copy blocks in this repo.

## What already exists here

- **`fetch_charts.py`** — drives a Playwright browser against
  `astro.cafeastrology.com/natal.php`, submits one person's birth data, and
  scrapes back planetary positions. The relevant piece:
  - `generate_chart(page, person)` returns a dict with `positions`, a list of
    `(planet, sign, degree, retro)` tuples — this includes rows for `"Venus"`
    and `"Mars"`, e.g. `("Venus", "Scorpio", "12°34'", "")`. **Pulling that
    person's Venus sign and Mars sign is just filtering this list** — no new
    scraping logic needed.
  - `Person` dataclass: `name`, `date` (`YYYY-MM-DD`), `time` (`HH:MM` or
    empty if unknown), `place` (city string).
  - Only factual positions are scraped — the site's own interpretive prose is
    copyrighted and deliberately not pulled. All interpretive/reading text
    comes from the library file below instead.
  - CLI batch mode (`fetch_charts.py people.csv -o output`) and a single-person
    Flask UI (`webapp.py`) both already exist and both call
    `generate_chart`/`to_markdown`. `to_markdown` currently just dumps a
    positions table — it does **not** currently do anything with the Inner
    Marriage copy blocks.

- **`inner_marriage_sign_library.md`** — the reusable copy library, built by
  reading ~15+ of Amelia's actual sent "Inner Marriage" emails in Gmail and
  extracting the parts that repeat across readings. Structure:
  - **Reusable structural blocks** (not sign-specific): opening paragraph (in
    two voices — "classic" used in ~180+ emails, and a newer "2026" voice),
    the "Small note" Sun-sign framing line, section headers, the recurring
    Tantra "Right Relationship" paragraph, a reflection-questions template,
    and closing/signature.
  - **One block per zodiac sign** (all 12): a quoted "I am [Sign]..." identity
    paragraph — reused **verbatim** whether that sign is playing Venus or
    Mars, only the framing sentence and archetype list change — plus a
    descriptive paragraph and separate feminine/masculine archetype lists.
  - **Known gaps**, flagged inline in the file: no full Pisces identity
    paragraph was found in the sent-mail sample (only a short rising-sign
    blurb); Scorpio-masculine, Capricorn-feminine, and Aquarius-masculine
    archetype lists also weren't found verbatim. The app should handle these
    gracefully (e.g. fall back to a generic phrasing, or flag for manual
    fill-in) rather than assume every sign × polarity combo has a match.

## The assembly logic, conceptually

For each participant:
1. Run `generate_chart` (or reuse its `positions` output) → filter for the
   `"Venus"` and `"Mars"` rows → get their signs.
2. Look up that Venus sign's block and Mars sign's block in
   `inner_marriage_sign_library.md` (feminine framing for Venus, masculine
   framing for Mars).
3. Stitch together: opening → "Small note" (Sun sign, if wanted) → section
   header naming both signs → Venus sign block → Mars sign block → Right
   Relationship paragraph → reflection questions (these need the specific
   archetype names swapped in, so treat as templated, not literal copy-paste)
   → closing.
4. Handle the same-sign case (Venus == Mars) — the library notes a couple of
   one-line framings for this ("double Leo," "They share the same fire") worth
   surfacing rather than treating as an error.

## Files (absolute paths)

- `/Users/amelia/Documents/Projects/astrology-charts/fetch_charts.py`
- `/Users/amelia/Documents/Projects/astrology-charts/webapp.py`
- `/Users/amelia/Documents/Projects/astrology-charts/inner_marriage_sign_library.md`
- `/Users/amelia/Documents/Projects/astrology-charts/people.example.csv`

## Open questions for this session to resolve with the user

- Batch (CSV of participants → N emails) vs. one-at-a-time (extend the
  existing Flask single-person UI)?
- Output format: plain text/Markdown to copy-paste into Gmail, or something
  that generates a ready-to-send draft?
- How to handle the library's gaps (Pisces, missing archetype lists) when a
  real participant lands on one — block generation and ask Amelia to fill it
  in, or ship a reasonable placeholder?
