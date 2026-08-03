# Good morning — here's what got built overnight

Wesley & Amelia — the rewrite is a working full-stack app. The whole vertical
slice runs end to end: **enter a participant → chart computes locally → reading
assembles from Amelia's library → review & edit with a live email preview.** No
more scraper.

## See it in 30 seconds

```bash
npm run dev
```

Then open **http://localhost:5173**. There's already a "Summer 2026 Level One"
class with a sample participant (Sarah) you can open → Review to see the rendered
email. (If `npm run dev` complains about the DB, run `npm run db:migrate` then
`npm run db:seed` once.)

## What works right now

- **Local chart computation** — all 10 planets (+ retrograde), Rising, and
  Midheaven, from birth date/time/place. Verified against known charts. Pure JS
  (`circular-natal-horoscope-js`); the library derives timezone + historical DST
  from the coordinates itself. **The scraper is gone.**
- **Geocoding** with the ambiguity guard the old handoff insisted on: an unclear
  city ("Springfield") fails loudly and shows a pick-list instead of silently
  guessing. (Try the "Ambiguous Amy" row → Generate.)
- **Reading assembly** ported faithfully from the old Python, now reading the
  library from the database, including the new **per-combination** tier for
  reflection questions + an optional pairing note. Gaps are flagged, never
  invented (the ⚠️ placeholders and the "1 gap" badges).
- **The email** — the approved warm letter design, rendered live from real chart
  data: at-a-glance ♀/♂ panel, full "chart at a glance" list, the nl2br fix, etc.
- **Roster + review UI** (the part you asked me to polish): create classes, add/
  edit/remove participants, "Generate readings" (only regenerates who needs it),
  per-person status badges, and a Review screen with a **live email preview** as
  you edit, plus the personal-note box.
- **Library editor** — Amelia can edit all three tiers herself (signs incl. gap
  fills, structural blocks, and per-combination questions/notes).
- **Deploy scaffolding** — `Dockerfile`, `docker-compose.yml`, entrypoint, ready
  for Portainer behind Pangolin.

## Decisions I made while you slept (please sanity-check)

1. **Stack:** Vite + React + Express + Prisma, TypeScript throughout — matches
   your ecosystem. (I used Prisma rather than farm-task-manager's raw-SQL style
   because the 3-tier content model benefits from a schema + migrations. Easy to
   discuss if you'd rather go raw SQL.)
2. **Dev DB is SQLite** so it actually runs tonight. **Production = your MySQL**,
   which is a two-step switch (below). Nothing is lost — the schema is portable.
3. **Sending is a stub.** The "Create Gmail draft" button returns a friendly
   "not configured yet." I did NOT wire live Gmail or send anything to anyone —
   that's the 15-min step we do together with credentials in hand.
4. **Repo reorg:** the old Python is moved (not deleted) into `legacy/`. Your real
   class data in `classes/summer-2026/` is untouched; I can write an importer if
   you want it pulled into the new DB.

## To point at your MySQL (when ready)

1. In `prisma/schema.prisma`, change `provider = "sqlite"` → `provider = "mysql"`.
2. Set `DATABASE_URL="mysql://user:pass@host:3306/inner_marriage"` (in `.env` or
   the compose file).
3. `npx prisma db push && npm run db:seed`. Done.

## What's NOT done yet (next session)

- **Gmail draft creation** — the actual API call (draft is stubbed). Needs a
  Google OAuth client + refresh token for `amelia@ameliaperkins.com`. Reminder:
  we chose **drafts, not auto-send**, which softens the old auto-send decision on
  purpose.
- **Amelia's real content:** the combination-specific reflection questions (she's
  getting me a list) and the known copy gaps — Pisces identity, Scorpio &
  Aquarius masculine archetypes, Capricorn feminine. All fillable in the Library
  editor now.
- **Chart wheel graphic** — deferred by choice (she wasn't sold); the list is in.
- **Importing** the existing `classes/summer-2026` data, if wanted.
- A few things to confirm from our chat: the combination note placement, and
  whether to keep the "Create draft" wording.

## Where things live

- `server/lib/ephemeris.ts` — chart math · `geocode.ts` — place→lat/lng ·
  `assemble.ts` — reading assembly · `renderEmail.ts` — the HTML email ·
  `reading.ts` — ties it together + regen logic
- `server/routes/api.ts` — the API · `server/index.ts` — Express entry
- `src/pages/` — ClassList, Roster, Review, Library
- `prisma/schema.prisma` + `prisma/seed.ts` — data model + library seed
- `docs/superpowers/specs/2026-08-02-inner-marriage-rewrite-design.md` — the spec
- `legacy/` — the old Python build, for reference

The design mockups we approved are in `.superpowers/brainstorm/**/full-reading-for-amelia.html`.
