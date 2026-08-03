---
name: natal-chart
description: Generate an astrology natal/birth chart (planetary positions, ascendant, houses, and the chart wheel image) for one or more people by automating astro.cafeastrology.com's free chart calculator. Use this whenever the user asks for a natal chart, birth chart, or astrology chart for someone; asks what sign/planet position/ascendant someone has given a birth date, time, and place; or is preparing charts for an astrology workshop, class, or reading — even if they don't name the site or say "skill". Handles a single person conversationally or a whole list/batch at once.
compatibility: Requires Bash tool access, Python 3.9+, and outbound network access to astro.cafeastrology.com.
---

# Natal Chart Generator

Produces the *factual* parts of a natal chart report — planet positions (sign + degree), ascendant/house cusps, planet-in-house placements, and the chart wheel graphic — by driving the free calculator at astro.cafeastrology.com the same way a person would. It deliberately does NOT scrape the site's interpretive paragraphs (that's their copyrighted prose); only the computed positions and the generated chart image are captured.

## One-time setup

The bundled script needs Playwright (a browser automation library) and a Chromium download (~100-150MB, one-time). Check for a cached environment before reinstalling anything:

```bash
VENV=~/.cache/natal-chart-skill/venv
if [ ! -f "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install -q -r <skill_dir>/scripts/requirements.txt
  "$VENV/bin/python" -m playwright install chromium
fi
```

Replace `<skill_dir>` with wherever this skill's files actually live on disk (the directory containing this SKILL.md). Reuse `$VENV` for every invocation below — don't recreate it each time.

## Single person (most common case)

When the user mentions one person's birth info in conversation (name + date + place; time is optional), don't make them fill out a form or open a browser — just run it for them:

1. Write a one-row CSV to a scratch/temp location:
   ```csv
   name,date,time,place
   Jordan,1992-04-03,09:15,"Austin, Texas, United States"
   ```
   - `date` is `YYYY-MM-DD`. `time` is 24h `HH:MM`, or leave blank if unknown (the report will then omit ascendant/houses, which is expected and fine — say so).
   - `place` needs enough detail to be unambiguous (city + state/country). If you only have a bare city name and it's a common one, include what you have — the script will fail loudly with a list of candidate cities if it's ambiguous, and you should relay that list to the user and ask them to pick one rather than guessing.

2. Run it headless (no visible browser window makes sense here since nothing is being watched):
   ```bash
   $VENV/bin/python <skill_dir>/scripts/fetch_charts.py /path/to/one_row.csv -o /path/to/out --headless
   ```

3. Read `/path/to/out/charts.md` and put its actual content (the positions table, houses table, etc.) directly in your reply — don't just point at the file, the user wants the content in the conversation. Use the Read tool on `/path/to/out/images/<slug>.png` to display the chart wheel inline in your response too.

4. If the script errors out (ambiguous city, no match, or a parsing failure), explain the specific problem to the user and ask for the missing detail — don't silently retry with a guess.

## Batch (a list of several people)

Same mechanics, just build a multi-row CSV from everyone the user gave you, run the same command once, and then walk through `charts.md` presenting each person's results (or summarize + point to the file and `images/` folder if there are many people — use judgment based on how many charts and how much room makes sense in one reply).

## Standalone interactive option

If the user says they want to enter data themselves rather than through you (e.g. mid-workshop with someone else typing), mention they can run:
```bash
$VENV/bin/python <skill_dir>/scripts/webapp.py
```
and open `http://127.0.0.1:5000` — it's a simple one-page form (name/date/time/place) that shows the same positions table, chart wheel, and a copy-ready Markdown block right in the browser. This is for when *they* want to drive it, not something you need to launch on their behalf unless asked.

## Notes

- The site runs Cloudflare bot-detection; `--headless` has been confirmed to work, but if a run ever fails oddly, retrying without `--headless` (a visible browser) is the fallback.
- Occasionally a birth date/place triggers a "Time Zone Not Sure" re-prompt from the site; the script already handles this automatically by accepting the site's offered default and prints a note when it happens — no action needed, but it's worth mentioning to the user so they know to double-check that particular chart if precision matters.
- Only reproduce the positions/houses/wheel data this script extracts — never scrape or paste the site's interpretive paragraphs into the user's document, since that's their copyrighted content.
