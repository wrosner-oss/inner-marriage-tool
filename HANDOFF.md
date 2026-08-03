# Handoff: Inner Marriage Reading Tool

This supersedes the earlier `HANDOFF_email_assembly.md` (that one was written
mid-build, before most of this existed — safe to ignore/delete it now).

**Who this is for:** a fresh Claude Code session (or any dev) picking this up
with zero prior context, possibly rebuilding parts of it with different
tools/stack (e.g. containerized on a different server). This doc is written
for that: it prioritizes *why* things work the way they do over the specific
Python/Flask/Playwright implementation, so the reasoning survives even if the
tooling doesn't.

## Who this is for (the people, not just the code)

- **Amelia** runs a shamanic-astrology practice — workshops, readings,
  ongoing 10-week classes. She's the actual end user of everything here.
  She is **not particularly technical** — every design decision about the UI
  (a double-click launcher, no terminal, no CSV editing, pretty styling) was
  made because of this. Optimize for her being able to use it alone.
- **Her boyfriend** (that's likely you, if you're reading this after a
  migration) has been driving the Claude Code sessions that built this, on
  her machine, to help her business. He's comfortable with code; she isn't.
  Keep that asymmetry in mind: things only *he* touches (deployment, the
  reading-library JSON schema) can be as technical as needed; things *she*
  touches need to stay simple.

## The business problem

Amelia sends each workshop participant a personalized "Your Inner Marriage
according to Shamanic Astrology" reading — an email built from that person's
**Venus sign** (their "feminine") and **Mars sign** (their "masculine"),
using paragraphs and archetype lists that recur across her ~200+ sent emails
on the topic. Two things made this worth automating:

1. Getting Venus/Mars signs requires a natal chart calculation, which she was
   doing by hand on a free site (astro.cafeastrology.com).
2. Assembling the actual reading text is mostly recombining reusable copy
   she's already written many times, per sign, with light customization.

This project automates both, end to end, organized around her actual
workflow: she runs 10-week classes with a roster of participants, and wants
to generate/regenerate/tweak readings for that roster over time, not
one-and-done.

## The conceptual pipeline

```
birth data (name, date, time, place)
        │
        ▼
[1] CHART LOOKUP — scrape a natal chart calculator site
        │  → planetary positions, specifically Venus/Mars/Sun signs
        ▼
[2] ASSEMBLY — template Amelia's own reusable copy blocks with those signs
        │  → a draft reading (Markdown-ish text), flagged if the library
        │    has a gap for that sign/polarity
        ▼
[3] HUMAN REVIEW — Amelia reads/edits the text before anything is final
        │
        ▼
[4] PDF EXPORT — render the (possibly edited) text as a styled PDF
        │
        ▼
[5] SEND — NOT YET BUILT. Get the PDF to the participant somehow.
```

Steps 1–4 are built and working. Wrapping all of it is a **class/roster
concept** (see below) since this always happens in the context of a specific
10-week cohort, not one-off.

## Step 1: Chart lookup — the part that's actually hard

This is browser automation against a third-party site, not an API, and it
has real sharp edges worth knowing before you rebuild it:

- The site (astro.cafeastrology.com's free natal chart calculator) runs
  Cloudflare bot-detection. A real browser engine (we used Playwright +
  Chromium) gets through fine, both headed and headless. A plain HTTP
  client almost certainly will not.
- The birthplace field is a custom autocomplete backed by a hidden
  `<select>` that **only populates after real keystrokes** — setting the
  input's value programmatically (no synthetic keydown/keyup) leaves the
  dropdown empty. Whatever automation tool you use needs to actually type,
  character by character, into that field.
- City names are often ambiguous ("Denver" alone matches 20+ places). The
  right behavior is to require enough detail (city + state/country) and
  **fail loudly with the candidate list** if it's still ambiguous — never
  silently guess, since a wrong city silently corrupts the whole chart.
- The result page's HTML has a **duplicate, mobile-responsive version of the
  positions table** baked into the DOM (both render regardless of viewport;
  CSS just toggles visibility). If you scrape positions, dedupe carefully or
  you'll double-count rows with slightly different formatting.
- Only the **factual, computed data** (planet positions, ascendant/houses,
  the chart-wheel image) gets scraped. The site's own interpretive prose is
  their copyrighted content and was deliberately never touched — all
  interpretive text in the final product is Amelia's own, from the library
  below.
- Occasionally a date/place triggers a "Time Zone Not Sure" re-prompt from
  the site; accepting its offered default and resubmitting once is fine
  (that's what the site's own instructions say to do).

**Output of this step:** a list of (planet, sign, degree, retrograde) tuples.
Venus/Mars/Sun are just filtered out of that list — no separate lookup.

## Step 2: Assembly — templating, not generation

There is **no AI-generated content** in the reading itself. Everything is
Amelia's own previously-written copy, recombined. This was a deliberate
choice: guessing at her voice for a client-facing document is worse than
clearly saying "this part is missing, please write it."

The copy library has two kinds of content:
- **Structural blocks**, not sign-specific: an opening (`Dear {name}, ...`),
  a "Small note" about the Sun sign, a section header naming both signs, the
  recurring "Right Relationship" Tantra paragraph, a closing/signature. A
  couple of these have small conditional variants (e.g. an extra line if
  Venus or Mars lands in the person's own Sun sign; a different framing if
  Venus and Mars are the *same* sign). All of these live in the editable
  JSON library (see below).
- **Reflection questions** — a closing "questions to sit with" section,
  referencing the specific archetype pairing. Conceptually the same kind of
  structural block, but as of this handoff it's **still hardcoded in Python**
  (`_reflection_questions()`), not yet moved into the editable library. If
  you rebuild the library-editing UI, worth folding this in too rather than
  leaving it as the one piece Amelia can't self-edit.
- **Per-sign blocks**, one for each of the 12 zodiac signs: a verbatim "I am
  [Sign]..." identity paragraph (reused as-is whether that sign is playing
  Venus or Mars — only the framing sentence changes), a descriptive line,
  and separate feminine/masculine archetype lists.

**Known content gaps** (as of this handoff): no full Pisces identity
paragraph, and the masculine archetype list is missing for Scorpio and
Aquarius, feminine missing for Capricorn. When assembly hits a gap, it
inserts a clearly marked placeholder in the output (⚠️ NEEDS AMELIA'S INPUT)
rather than inventing text — and a person's reading can have gaps in some
sections while the rest assembles normally.

**Where the library lives:** originally as Python literals, but we migrated
it to a JSON file (`content_library.json`) specifically so a simple web form
could let Amelia edit it herself — fill in a missing identity paragraph, fix
a typo, adjust wording — without anyone touching code. This turned out to be
important: it's the difference between "gaps get fixed once, ever" and
"every session hits the same permanent gaps forever." **Keep this
editable-by-Amelia property if you rebuild it** — it matters more than the
storage format.

## Step 3 & the class/roster concept

Amelia runs the same set of participants through this repeatedly across a
10-week class (add a late joiner, fix a birthdate typo, regenerate someone's
reading after a library edit, etc.), so persistence is organized around a
**class**, not a one-off batch:

- One class = one folder, containing its roster (participants + their last
  computed signs + last assembled/edited text + gaps + which PDF file
  belongs to them) and its generated PDFs.
- Participants are tracked by a **stable id, not by name** — so renaming
  someone (typo fix) doesn't orphan their data or duplicate them.
- Reopening a class **reuses previously computed readings** rather than
  re-running the chart lookup every time — it's slow (real browser
  automation) and pointless if nothing changed. A reading only regenerates
  if: it's a brand-new participant, their birth data or pronoun changed, or
  Amelia explicitly requests it. This was a deliberate, confirmed decision —
  don't "simplify" it back to always-regenerate without checking, it was
  chosen specifically to keep reopening a class fast.
- Removing someone from the roster (or blanking their row) drops them from
  the active list but doesn't delete their old PDF — treat generated PDFs as
  an archive, not something to garbage-collect automatically.

## Step 4: PDF export

The (possibly hand-edited) reading text becomes a styled PDF. We rendered it
as HTML/CSS and printed that to PDF via headless Chromium (Playwright was
already a dependency for step 1, so this avoided adding a whole separate PDF
stack). The visual design — warm plum/gold/cream palette, serif headings —
was our own creation; there's no existing brand template to match, so feel
free to restyle. The web app's own UI was later restyled to match this same
palette, on request, so the tool and its output feel like one thing.

One real bug worth knowing if you touch this: converting the assembled text
through a Markdown renderer will **silently collapse single newlines** into
one run-on line (e.g. two "Your feminine side is in X / masculine is in Y"
lines merging). Whatever Markdown approach you use needs the equivalent of
the `nl2br` extension enabled, or single-newline line breaks in the source
templates disappear in the output.

## Step 5: Sending — not built yet

This is the explicit next step, and there's important context for whoever
builds it:

- **A live Gmail connector is available in this environment**, authenticated
  as `amelia@ameliaperkins.com` — real access to her real inbox, with real
  clients in it (this was confirmed directly, not assumed). Whatever
  environment you rebuild this in, check what's actually connected before
  assuming — don't take this doc's word for it.
- The explicit, confirmed decision (from a conversation directly with the
  boyfriend, after this risk was flagged to him): **send should be
  automated once Amelia approves in the review step** — not a manual
  per-email send, and not a further confirmation after that approval point.
  This was a deliberate call made with the real-client-data risk on the
  table, not an oversight — if you're inclined to make sending more
  cautious "for safety," that contradicts an explicit decision; raise it
  with them again rather than silently overriding it.
- Practically, this probably means: once PDFs are generated, either attach
  and send directly, or create Gmail drafts programmatically and send them
  (draft creation + send are different levels of caution — the confirmed
  decision above points toward actually sending, not just drafting).

## Data shapes (these matter more than the code that produces them)

**A class** (currently `classes/<slug>/class.json`):
```
{
  "name": "Spring 2026 Level One",
  "created_at": "...", "updated_at": "...",
  "participants": [
    {
      "id": "bea985b7",              // stable, not derived from name
      "name": "...", "date": "YYYY-MM-DD", "time": "HH:MM" or "",
      "place": "...", "gender": "They" | "She" | "He",
      "venus_sign": "...", "mars_sign": "...", "sun_sign": "...",
      "text": "... last assembled/edited reading ...",
      "gaps": ["..."],                // human-readable gap descriptions
      "error": null or "...",         // last chart-lookup error, if any
      "pdf_filename": "..." or null
    }
  ]
}
```

**The copy library** (`content_library.json`): a `structural` object holding
the shared blocks as format-string-style templates, and a `signs` object
keyed by sign name, each with `element`, `identity`, `identity_fragment`
(a fallback fragment for signs with no full identity paragraph),
`descriptive`, `feminine_archetypes`, `masculine_archetypes` (lists),
`fuel_keywords`. Missing content is JSON `null`, never an empty string —
that distinction is how the app knows to flag a gap vs. render nothing.

## What's built, concretely (as of this handoff)

- `fetch_charts.py` — the chart-scraping core (`generate_chart()` — this is
  the piece with all the site-specific fragility described above), plus a
  CLI batch mode.
- `assemble_email.py` — the templating logic described in Step 2.
- `content_store.py` / `content_library.json` — the editable copy library.
- `class_store.py` — the class/roster persistence described above.
- `pdf_export.py` — Markdown → styled HTML → PDF.
- `inner_marriage_app.py` — the Flask web app tying it together: class
  list/create → roster entry (add/remove/edit participants, up to 15) →
  generate (reuse-vs-regenerate logic) → review/edit → export PDFs. Also
  hosts the library editor UI (`/library`) Amelia uses to fix gaps herself.
- `launcher/` — a double-clickable macOS `.app` (compiled AppleScript) that
  starts the Flask server if not already running and opens the browser —
  the whole point being Amelia never sees a terminal.
- A separate, more general **`webapp.py`** and a packaged **Cowork/Claude
  Code skill** (`skills/natal-chart/`, `natal-chart.skill`) also exist — a
  more generic single-chart tool (not Inner-Marriage-specific) built earlier
  in this project for quick one-off chart lookups during live workshops.
  Related but decoupled from everything above; worth knowing about but not
  required for the Inner Marriage flow.

**Not built:** Step 5 (sending), and no reading type other than Inner
Marriage (Venus/Mars) exists — if Amelia ever wants a second kind of
reading, the class/participant persistence model would need a concept of
multiple "reading types" per person, which doesn't exist yet.

## Gotchas that cost real debugging time (so you don't repeat them)

- **Flask's dev server doesn't hot-reload.** An old backgrounded process
  from earlier in a session can silently keep serving stale code on the same
  port while a new start attempt fails quietly with "address already in
  use." If "it's not working" after an edit, check for a zombie process
  before assuming the code is wrong.
- **CSS flexbox without minimum-width guards will silently squeeze fields to
  near-invisible** when native `<input type=date>`/`<input type=time>`
  controls (which have real intrinsic minimum widths) compete for space in
  the same row. Use `minmax()` (grid) or explicit `flex-basis` floors, and
  actually screenshot the real rendered page — this bug looked fine in the
  accessibility-tree/DOM inspection and only showed up as visibly broken in
  an actual screenshot.
- **Test through the real UI, not just the backend.** Several real bugs
  (the above CSS issue, a button click not registering in one specific
  browser-automation tool) only appeared when actually clicking through the
  app as a user would — logic-level testing (e.g. hitting routes directly)
  passed cleanly both times.

## Suggested next steps

1. Rebuild/redeploy in whatever stack you're moving to (Docker, etc.) —
   the main infra requirement is a real browser engine available in the
   container (Playwright+Chromium or equivalent) for Step 1, since a
   lightweight HTTP client won't get past the target site's bot detection.
2. Build Step 5 (sending), respecting the confirmed automated-send decision
   above, and the fact that real client data is in play.
3. Consider whether Amelia will want other reading types beyond Inner
   Marriage eventually — worth a quick conversation with her/the boyfriend
   before generalizing the data model preemptively.
