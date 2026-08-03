# Inner Marriage Reading Tool — Rewrite Design

**Date:** 2026-08-02
**Status:** Approved for build (vertical slice being built overnight)
**Supersedes:** the Python/Flask/Playwright build documented in `HANDOFF.md` (kept in `legacy/` for reference)

## Purpose

A small web app that Amelia (a shamanic-astrology practitioner, non-technical) uses to
generate personalized "Your Inner Marriage according to Shamanic Astrology" reading
**emails** for the participants of her 10-week classes. Rebuilt from the on-her-laptop
Python prototype into a hostable web app Wesley can run on his server and maintain
remotely.

Goal above all: **save Amelia time** on a workflow she does by hand today, while keeping a
solid human review step so every reading stays in her voice.

## Key decisions (what changed from the prototype, and why)

1. **No more chart scraping.** The prototype browser-automated cafeastrology through
   Cloudflare. Replaced with **local ephemeris computation** (`circular-natal-horoscope-js`,
   pure JS, no native deps, no data files). Verified: computes all 10 planets + retrograde,
   Ascendant, and Midheaven correctly, and is time/location-sensitive. The library takes
   local birth wall-clock time and derives timezone + historical DST from lat/lng itself.
   This removes the single most fragile part of the old system and makes the container light.
2. **Deliverable is an HTML email, not a PDF.** Amelia's original workflow was email; the
   PDF added attach-and-draft friction. The reading *is* the email body. No PDF in v1.
   (A "download PDF" could be a later nice-to-have.)
3. **Stack: TypeScript**, matching Wesley's ecosystem. Vite + React frontend, Express
   backend, Prisma ORM. Deployed as a Docker container behind Pangolin (auth at the proxy)
   and managed via Portainer, like his other apps.
4. **Persistence: MySQL** (reuse Wesley's existing server) via Prisma. Dev is against SQLite
   with a MySQL-compatible schema; production is a connection-string switch.
5. **Sending: create Gmail drafts** (not auto-send) on approval, for now. This deliberately
   softens the prototype's recorded "auto-send on approval" decision — re-confirmed with
   Wesley because real client data is involved. Full Gmail API wiring is done later, with
   credentials present; nothing is sent to real people unattended.

## Content model — THREE tiers (this is the important structural change)

The reading is assembled from Amelia's own reusable copy (no AI-generated reading text —
gaps are flagged, never invented). Three tiers:

1. **Structural blocks** (shared, not sign-specific): opening, "small note" about the Sun
   sign, section header, the Tantra "right relationship" paragraph, closing/signature, and a
   few conditional variants (Venus/Mars in own Sun sign; Venus == Mars double-sign framing).
2. **Per-sign blocks** (12): the verbatim "I am [Sign]…" identity paragraph, a descriptive
   line, `element`, and separate feminine/masculine archetype lists. Reused whether the sign
   is playing Venus or Mars; only the framing changes.
3. **Per-combination blocks** (Venus-sign × Mars-sign pair) — **NEW**: the closing
   **reflection questions** (Amelia confirmed these are specific to the *combination*, not the
   individual signs) and an optional **combination note** she sometimes writes about how that
   specific pairing plays together. 12×12 possible pairs; most start empty and fill in over
   time. Editable by Amelia.

Plus a **per-person custom note** entered at the review step (free text, not stored in the
library) for one-off personalization.

Missing content is represented as NULL (not empty string) so the app can distinguish "flag a
gap" from "render nothing." Assembly inserts a clearly-marked placeholder for gaps.

## Email design (approved)

Single-column "personal letter" as the structural spine (scales to any length, always reads
as human), with one "feminine ♀ / masculine ♂ at a glance" panel near the top as a visual
anchor. Warm plum/gold/cream palette, serif. Sections top-to-bottom: greeting + opening,
small note (Sun-sign fuel), at-a-glance panel, feminine sign block + archetypes, masculine
sign block + archetypes, Tantra paragraph, reflection questions, "your chart at a glance"
(full positions list: 10 planets + Rising + Midheaven), signature. **No CTA buttons** (too
salesy; her links live in her Gmail signature). Inline styles for email-client robustness;
collapses to one column on mobile. Reference mockup: `.superpowers/brainstorm/**/full-reading-for-amelia.html`.

Chart is a **list** in v1; the chart-wheel graphic is deferred (Amelia not sold on it).

## Chart computation

`computeChart({ date, time, place })`:
1. Geocode `place` → lat/lng via Open-Meteo geocoding API (free, no key). If the place is
   ambiguous or unfound, **fail loudly with candidates** — never silently guess.
2. Feed local birth date/time + lat/lng to `circular-natal-horoscope-js`.
3. Return `{ sun, moon, …, pluto (with retrograde), ascendant, midheaven }` as signs.
4. **Birth time required for Rising/Midheaven** (and reliable Moon). If time is missing,
   those fields report "birth time needed" rather than a wrong sign.

## Data model (Prisma, MySQL)

- `Class` (name, timestamps) 1—* `Participant`.
- `Participant`: stable id, name, birth date, birth time (nullable), place, pronoun
  (They/She/He), **email** (NEW — prototype didn't collect it), computed signs (venus/mars/
  sun + full chart JSON), last assembled/edited reading text, custom note, gaps, last error,
  draft status.
- Content library tables: `Sign` (12), `StructuralBlock` (key→template), `Combination`
  (venusSign, marsSign, questions, note).
- Reading regeneration reuses cached results; regenerate only when new participant, birth
  data/pronoun changed, or explicitly requested (preserve the prototype's deliberate
  reuse-don't-rescrape behavior — now fast, but still avoid needless recompute/overwrite of
  edited text).

## Workflow

Class list → roster (add/edit/remove participants, collect email) → generate (compute charts,
assemble readings, flag gaps) → review/edit each reading + add personal note → approve →
create Gmail draft. Plus a library editor for Amelia to fill gaps and edit all three content
tiers herself.

## Deployment

Multi-stage Dockerfile (build Vite frontend + server, run Node). `docker-compose.yml` with
the app + a MySQL service (or external MySQL via env). Env: `DATABASE_URL`, Gmail creds
(later), `APP_PASSWORD` optional. Fronted by Pangolin for auth.

## Out of scope for v1

Live Gmail sending, chart-wheel graphic, PDF export, reading types other than Inner Marriage,
multi-user accounts (Pangolin handles access).

## Assumptions made during the overnight build (confirm in the morning)

- Open-Meteo geocoding is acceptable (free, no key, outbound HTTPS from the container).
- Dev DB is SQLite tonight; production points at Wesley's MySQL via `DATABASE_URL`.
- TypeScript throughout; Prisma chosen over farm-task-manager's raw-SQL style for the
  relational content model + migrations (flag for discussion).
- Old Python moved to `legacy/`, not deleted. Real class data in `classes/summer-2026/`
  preserved; a migration importer can be written if wanted.
